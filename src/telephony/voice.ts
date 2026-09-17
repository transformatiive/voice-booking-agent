import type { Business } from "../domain/types.js";
import type { Store } from "../store/store.js";
import type { BookResult, Scheduler } from "../scheduling/scheduler.js";
import { InMemoryScheduler } from "../scheduling/inMemoryScheduler.js";
import {
  bookingSpeak,
  buildGetSlotsResult,
  collectOpenSlots,
  findServiceByName,
  speakSlot,
} from "../scheduling/voiceSlots.js";
import { isVoiceDemoSlug } from "../store/seed.js";
import { DEFAULT_AGENT_NAME } from "../domain/agent.js";
import {
  demoSlugForUseCase,
  demoStreamUrl,
  demoUseCaseFromChoice,
  rememberDemoChoice,
  rememberedDemoSlug,
  resolveDemoSlugForInbound,
} from "./demoDid.js";
import { buildLiveInstructions } from "./gptLive.js";

/** Never let a Cal.com (or other) hop block the voice tool loop. */
export const VOICE_TOOL_TIMEOUT_MS = 1_500;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VOICE_LANG: Record<string, string> = { pt: "pt-PT", en: "en-US" };

function firstResourceId(business: Business): string | null {
  return business.resources.find((r) => r.available)?.id ?? business.resources[0]?.id ?? null;
}

function memoryScheduler(store: Store, scheduler: Scheduler, now: Date): Scheduler {
  if (scheduler.kind === "memory") {
    return scheduler;
  }
  return new InMemoryScheduler(store, () => now);
}

function raceTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Telnyx TeXML callbacks require an absolute URL, not a relative path. */
export function absolutePublicUrl(publicBaseUrl: string, path: string): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function buildDemoLiveTeXML(opts: {
  slug: string;
  publicBaseUrl: string;
  sipUri?: string;
  /** When false, never emit Connect/Stream (used if the WS route is not mounted). */
  streamEnabled?: boolean;
}): string {
  if (opts.sipUri) {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Response>`,
      `  <Dial>`,
      `    <Sip>${escapeXml(opts.sipUri)}</Sip>`,
      `  </Dial>`,
      `</Response>`,
    ].join("\n");
  }
  if (opts.streamEnabled === false) {
    return [`<?xml version="1.0" encoding="UTF-8"?>`, `<Response>`, `</Response>`].join("\n");
  }
  const streamUrl = demoStreamUrl(opts.publicBaseUrl, opts.slug);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    `  <Connect>`,
    `    <Stream url="${escapeXml(streamUrl)}" bidirectionalMode="rtp" codec="PCMU" bidirectionalCodec="PCMU" bidirectionalSamplingRate="8000"></Stream>`,
    `  </Connect>`,
    `</Response>`,
  ].join("\n");
}

export function handleDemoInbound(opts: {
  toE164: string;
  fromE164?: string;
  digits?: string;
  speech?: string;
  callSid?: string;
  now: number;
  publicBaseUrl: string;
  sipUri?: string;
  streamEnabled?: boolean;
}): string {
  const resolved = resolveDemoSlugForInbound({
    toE164: opts.toE164,
    fromE164: opts.fromE164,
    digits: opts.digits,
    speech: opts.speech,
    now: opts.now,
  });
  return buildDemoLiveTeXML({
    slug: resolved.slug,
    publicBaseUrl: opts.publicBaseUrl,
    sipUri: opts.sipUri,
    streamEnabled: opts.streamEnabled,
  });
}

/**
 * Inbound-call TeXML (Telnyx). Implements the core "Disponível / A cortar"
 * model: if a barber is available we warm-transfer the call to their mobile;
 * otherwise the AI assistant greets and (in production) takes the booking.
 * Demo DID inbound must not use this path — use buildDemoLiveTeXML.
 */
export function buildIncomingTeXML(business: Business): string {
  const lang = VOICE_LANG[business.locale] ?? "pt-PT";
  const available = business.resources.find((r) => r.available && r.transferNumber);

  const greeting =
    business.locale === "pt"
      ? `Olá, bem-vindo à ${business.name}. Um momento, por favor.`
      : `Hello, welcome to ${business.name}. One moment please.`;

  if (available && available.transferNumber) {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Response>`,
      `  <Say language="${lang}">${escapeXml(greeting)}</Say>`,
      `  <Dial timeout="20">${escapeXml(available.transferNumber)}</Dial>`,
      `</Response>`,
    ].join("\n");
  }

  const afterHours =
    business.locale === "pt"
      ? `De momento não podemos atender. O assistente ${business.agentName || DEFAULT_AGENT_NAME} pode marcar a sua hora. Diga o serviço e o dia pretendido após o sinal.`
      : `We can't take your call right now. The assistant ${business.agentName || DEFAULT_AGENT_NAME} can book your appointment. Say the service and day after the tone.`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Response>`,
    `  <Say language="${lang}">${escapeXml(greeting)}</Say>`,
    `  <Say language="${lang}">${escapeXml(afterHours)}</Say>`,
    `  <Record maxLength="60" />`,
    `</Response>`,
  ].join("\n");
}

export const VOICE_FUNCTION_NAMES = [
  "list_services",
  "get_slots",
  "book_appointment",
  "list_bookings",
  "cancel_appointment",
] as const;

export type VoiceFunctionName = (typeof VOICE_FUNCTION_NAMES)[number];

export interface VoiceFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

function isVoiceFunctionName(name: string): name is VoiceFunctionName {
  return (VOICE_FUNCTION_NAMES as readonly string[]).includes(name);
}

/**
 * Function/tool webhook for GPT-Live-1 (and compatible voice orchestrators).
 * The orchestrator calls these to read services, get open slots, book, list, and cancel.
 */
export async function handleVoiceFunction(
  business: Business,
  store: Store,
  scheduler: Scheduler,
  call: VoiceFunctionCall,
  now: Date = new Date(),
): Promise<Record<string, unknown>> {
  if (!isVoiceFunctionName(call.name)) {
    return { error: "unknown_function", name: call.name };
  }

  switch (call.name) {
    case "list_services":
      return {
        services: business.services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceEur: s.priceCents !== null ? s.priceCents / 100 : null,
        })),
      };

    case "get_slots": {
      const serviceName = String(call.arguments.service ?? "");
      const service = findServiceByName(business, serviceName);
      if (!service) {
        return {
          error: "unknown_service",
          available: business.services.map((s) => s.name),
          instruction:
            business.locale === "en"
              ? "Ask which service they want, then call get_slots again. Keep talking."
              : "Pergunta a especialidade ou serviço e chama get_slots outra vez. Continua a falar.",
        };
      }
      const bookings = store.listBookings(business.id);
      return { ...buildGetSlotsResult(business, service, call.arguments.date, bookings, now) };
    }

    case "book_appointment": {
      const serviceName = String(call.arguments.service ?? "");
      const service = findServiceByName(business, serviceName);
      if (!service) {
        return {
          error: "unknown_service",
          available: business.services.map((s) => s.name),
          instruction:
            business.locale === "en"
              ? "Ask which service. Do not go silent."
              : "Pergunta o serviço. Não fiques em silêncio.",
        };
      }
      const startIso = String(call.arguments.start ?? "");
      const start = new Date(startIso);
      if (Number.isNaN(start.getTime())) {
        return { error: "invalid_start", instruction: "Ask for a time from the last get_slots offers." };
      }
      const customerName = call.arguments.customerName ? String(call.arguments.customerName) : null;
      const customerPhone = call.arguments.customerPhone ? String(call.arguments.customerPhone) : null;
      const input = {
        business,
        service,
        start,
        resourceId: firstResourceId(business),
        customerName,
        customerPhone,
        source: "voice" as const,
      };
      const local = memoryScheduler(store, scheduler, now);
      const useLocal = isVoiceDemoSlug(business.slug) || scheduler.kind === "memory";
      let result: BookResult = useLocal
        ? await local.book(input)
        : await raceTimeout(scheduler.book(input), VOICE_TOOL_TIMEOUT_MS, { ok: false, reason: "error" });
      if (!result.ok && result.reason === "error") {
        result = await local.book(input);
      }
      if (!result.ok) {
        const nearby = collectOpenSlots(business, service, start, store.listBookings(business.id), now);
        const alt = nearby[0] ?? null;
        return {
          ok: false,
          reason: result.reason,
          alternative: alt
            ? { start: alt.toISOString(), speak: speakSlot(alt, business.locale, business.timezone) }
            : null,
          slots: nearby.map((s) => s.toISOString()),
          instruction:
            business.locale === "en"
              ? "That slot did not book. Offer the alternative out loud and keep talking."
              : "Essa hora não ficou. Propõe a alternativa em voz alta e continua a falar.",
        };
      }
      return {
        ok: true,
        bookingId: result.booking.id,
        start: result.booking.start,
        speak: bookingSpeak(result.booking.start, result.booking.serviceName, business),
        smsConfirmation: true,
        needName: !customerName,
        needPhone: !customerPhone,
        instruction:
          business.locale === "en"
            ? "Confirm the booking out loud. If name or phone is missing, ask for it. Always say you will send an SMS confirmation."
            : "Confirma a marcação em voz alta. Se faltar o nome ou o telemóvel, pede-o. Diz sempre que envias confirmação por SMS.",
      };
    }

    case "list_bookings": {
      const bookings = store.listBookings(business.id);
      return {
        bookings: bookings.map((b) => ({
          id: b.id,
          serviceName: b.serviceName,
          start: b.start,
          customerName: b.customerName,
        })),
      };
    }

    case "cancel_appointment": {
      const bookings = store.listBookings(business.id);
      if (bookings.length === 0) {
        return { ok: false, error: "no_bookings" };
      }
      const bookingId = call.arguments.bookingId ? String(call.arguments.bookingId) : "";
      const serviceName = call.arguments.service ? String(call.arguments.service).toLowerCase() : "";
      const target = bookingId
        ? bookings.find((b) => b.id === bookingId)
        : serviceName
          ? bookings.find(
              (b) =>
                b.serviceName.toLowerCase() === serviceName ||
                b.serviceName.toLowerCase().includes(serviceName) ||
                serviceName.includes(b.serviceName.toLowerCase()),
            )
          : bookings[bookings.length - 1];
      if (!target) {
        return { ok: false, error: "booking_not_found" };
      }
      await scheduler.cancel(business, target);
      return { ok: true, cancelledId: target.id, serviceName: target.serviceName, start: target.start };
    }

    default: {
      const exhaustive: never = call.name;
      return { error: "unknown_function", name: String(exhaustive) };
    }
  }
}

export const SELECT_DEMO_VERTICAL = "select_demo_vertical";

function verticalFromToolArgs(args: Record<string, unknown>): ReturnType<typeof demoUseCaseFromChoice> {
  return demoUseCaseFromChoice(String(args.vertical ?? args.useCase ?? args.slug ?? ""));
}

function omitPickerKeys(args: Record<string, unknown>): Record<string, unknown> {
  const next = { ...args };
  delete next.vertical;
  delete next.useCase;
  delete next.slug;
  return next;
}

/**
 * DID picker session tools: lock a vertical, then dispatch booking tools to that tenant.
 * GPT-Live cannot replace session instructions mid-call, so the picker prompt holds every
 * vertical and this tool records the caller's choice for subsequent get_slots/book calls.
 */
export async function handleDemoPickerFunction(opts: {
  store: Store;
  scheduler: Scheduler;
  call: VoiceFunctionCall;
  fromE164?: string;
  callSid?: string;
  now?: Date;
}): Promise<Record<string, unknown>> {
  const nowDate = opts.now ?? new Date();
  const now = nowDate.getTime();

  if (opts.call.name === SELECT_DEMO_VERTICAL) {
    const useCase = verticalFromToolArgs(opts.call.arguments);
    if (!useCase) {
      return {
        ok: false,
        error: "unknown_vertical",
        instruction:
          "Pergunta qual demonstração quer: clínica, barbearia, restaurante, oficina ou imobiliária (1 a 5).",
      };
    }
    const slug = demoSlugForUseCase(useCase);
    const business = opts.store.getBusinessBySlug(slug);
    if (!business) {
      return { ok: false, error: "business_not_found", slug };
    }
    rememberDemoChoice({
      slug,
      fromE164: opts.fromE164,
      callSid: opts.callSid,
      now,
    });
    return {
      ok: true,
      slug,
      useCase,
      businessName: business.name,
      services: business.services.map((service) => service.name),
      instruction: buildLiveInstructions(business),
    };
  }

  const remembered = rememberedDemoSlug({
    fromE164: opts.fromE164,
    callSid: opts.callSid,
    now,
  });
  const chosen = verticalFromToolArgs(opts.call.arguments) ?? (remembered ? demoUseCaseFromChoice(remembered) : undefined);
  if (!chosen) {
    return {
      error: "select_vertical_first",
      instruction:
        "Ainda não há vertical. Pergunta qual demonstração quer ouvir e chama select_demo_vertical.",
    };
  }
  const slug = demoSlugForUseCase(chosen);
  const business = opts.store.getBusinessBySlug(slug);
  if (!business) {
    return { error: "business_not_found", slug };
  }
  rememberDemoChoice({
    slug,
    fromE164: opts.fromE164,
    callSid: opts.callSid,
    now,
  });
  return handleVoiceFunction(
    business,
    opts.store,
    opts.scheduler,
    { name: opts.call.name, arguments: omitPickerKeys(opts.call.arguments) },
    nowDate,
  );
}
