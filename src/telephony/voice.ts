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
import { pickResourceForService } from "../domain/assignment.js";
import {
  demoSlugForUseCase,
  demoStreamUrl,
  demoUseCaseFromChoice,
  rememberDemoChoice,
  rememberedDemoSlug,
  resolveDemoSlugForInbound,
} from "./demoDid.js";

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
export function buildIncomingTeXML(business: Business, publicBaseUrl?: string): string {
  const lang = VOICE_LANG[business.locale] ?? "pt-PT";
  const available = business.resources.find((r) => r.available && r.transferNumber);

  const greeting =
    business.locale === "pt"
      ? `Olá, bem-vindo à ${business.name}. Um momento, por favor.`
      : `Hello, welcome to ${business.name}. One moment please.`;

  if (available && available.transferNumber) {
    const action = publicBaseUrl
      ? ` action="${escapeXml(absolutePublicUrl(publicBaseUrl, `/voice/status/${business.slug}`))}"`
      : "";
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Response>`,
      `  <Say language="${lang}">${escapeXml(greeting)}</Say>`,
      `  <Dial timeout="20"${action}>${escapeXml(available.transferNumber)}</Dial>`,
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
        resourceId: pickResourceForService(business, service.id)?.id ?? null,
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
      const speak = bookingSpeak(result.booking.start, result.booking.serviceName, business);
      return {
        ok: true,
        bookingId: result.booking.id,
        start: result.booking.start,
        speak,
        message: speak,
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

function joinServiceNames(business: Business): string {
  const names = business.services.map((service) => service.name);
  const or = business.locale === "pt" ? "ou" : "or";
  if (names.length === 0) {
    return business.locale === "pt" ? "o serviço" : "the service";
  }
  if (names.length === 1) {
    return names[0];
  }
  return `${names.slice(0, -1).join(", ")} ${or} ${names[names.length - 1]}`;
}

/**
 * First spoken line after the caller locks a demo vertical — in-character
 * receptionist greeting, not «perfeito, vamos à oficina».
 */
export function demoVerticalOpener(business: Business): string {
  const named = joinServiceNames(business);
  const pt = business.locale === "pt";
  switch (business.useCase) {
    case "oficina":
      return pt
        ? `Olá, ${business.name} — quer ${named}? Diga o serviço e o veículo, se o mencionar.`
        : `Hello, ${business.name} — do you need ${named}? Say the service, and the car if you mention it.`;
    case "clinica":
      return pt
        ? `Olá, ${business.name}. Que especialidade precisa: ${named}?`
        : `Hello, ${business.name}. Which specialty do you need: ${named}?`;
    case "barbearia":
    case "salao":
      return pt
        ? `Olá, ${business.name}. O que pretende: ${named}?`
        : `Hello, ${business.name}. What would you like: ${named}?`;
    case "restaurante":
      return pt
        ? `Olá, ${business.name}. Para quantas pessoas é a reserva — duas, quatro ou um grupo?`
        : `Hello, ${business.name}. How many people is the table for — two, four, or a group?`;
    case "imobiliaria":
      return pt
        ? `Olá, ${business.name} — quer ${named}? Diga o imóvel ou a zona.`
        : `Hello, ${business.name} — would you like ${named}? Say the property or area.`;
    case "ginasio":
      return pt
        ? `Olá, ${business.name}. Que aula pretende: ${named}?`
        : `Hello, ${business.name}. Which class would you like: ${named}?`;
    case "outro":
      return pt
        ? `Olá, ${business.name}. O que pretende marcar — temos ${named}?`
        : `Hello, ${business.name}. What would you like to book — we have ${named}?`;
    default: {
      const exhaustive: never = business.useCase;
      throw new Error(`Unknown use case: ${String(exhaustive)}`);
    }
  }
}

/** Compact tool result: scenario opener in speak, one-line booking-tool instruction. */
export function demoVerticalReadyResult(business: Business): Record<string, unknown> {
  const speak = demoVerticalOpener(business);
  return {
    ok: true,
    slug: business.slug,
    useCase: business.useCase,
    businessName: business.name,
    services: business.services.map((service) => service.name),
    speak,
    message: speak,
    instruction:
      business.locale === "en"
        ? "Continue booking with get_slots and book_appointment."
        : "Continua a marcação com get_slots e book_appointment.",
  };
}

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
 * Demo DID picker: one Live session whose instructions already hold every
 * vertical's receptionist script. The caller's choice is remembered from the
 * transcript or a later booking-tool `vertical` argument — not from a tool at
 * the moment they confirm.
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
    return {
      ok: false,
      error: "scenario_choice_is_not_a_tool",
      instruction: "Não chames ferramentas para escolher o cenário. Cumprimenta já como essa recepção.",
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
        "Ainda não há vertical. O cliente escolhe pelo nome ou 1-5; passa vertical no get_slots.",
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
