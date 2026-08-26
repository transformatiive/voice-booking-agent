import type { Business, Service } from "../domain/types.js";
import type { Store } from "../store/store.js";
import type { Scheduler } from "../scheduling/scheduler.js";
import { suggestSlots } from "../scheduling/availability.js";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VOICE_LANG: Record<string, string> = { pt: "pt-PT", en: "en-US" };

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

function findServiceByName(business: Business, name: string): Service | null {
  const n = name.toLowerCase();
  return (
    business.services.find((s) => s.name.toLowerCase() === n) ??
    business.services.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase())) ??
    null
  );
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
        return { error: "unknown_service", available: business.services.map((s) => s.name) };
      }
      const dateArg = call.arguments.date ? new Date(String(call.arguments.date)) : now;
      const bookings = store.listBookings(business.id);
      const slots = suggestSlots(business, service, dateArg, bookings, now, 6);
      return { service: service.name, slots: slots.map((s) => s.toISOString()) };
    }

    case "book_appointment": {
      const serviceName = String(call.arguments.service ?? "");
      const service = findServiceByName(business, serviceName);
      if (!service) {
        return { error: "unknown_service" };
      }
      const startIso = String(call.arguments.start ?? "");
      const start = new Date(startIso);
      if (Number.isNaN(start.getTime())) {
        return { error: "invalid_start" };
      }
      const result = await scheduler.book({
        business,
        service,
        start,
        resourceId: business.resources.find((r) => r.available)?.id ?? null,
        customerName: call.arguments.customerName ? String(call.arguments.customerName) : null,
        customerPhone: call.arguments.customerPhone ? String(call.arguments.customerPhone) : null,
        source: "voice",
      });
      if (!result.ok) {
        return { ok: false, reason: result.reason };
      }
      return { ok: true, bookingId: result.booking.id, start: result.booking.start };
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
