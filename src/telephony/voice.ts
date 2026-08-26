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

/**
 * Inbound-call TeXML (Telnyx). Implements the core "Disponível / A cortar"
 * model: if a barber is available we warm-transfer the call to their mobile;
 * otherwise the AI assistant greets and (in production) takes the booking.
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
      ? `De momento não podemos atender. O assistente ${business.agentName || "virtual"} pode marcar a sua hora. Diga o serviço e o dia pretendido após o sinal.`
      : `We can't take your call right now. The assistant ${business.agentName || ""} can book your appointment. Say the service and day after the tone.`;

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
 * Function/tool webhook for a production voice LLM (Grok Live 2 / Retell / Vapi).
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
