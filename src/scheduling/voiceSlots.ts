import * as chrono from "chrono-node";
import type { Booking, Business, Locale, Service } from "../domain/types.js";
import { isVoiceDemoSlug } from "../store/seed.js";
import { checkAvailability, suggestSlots } from "./availability.js";

export const VOICE_SLOT_LIMIT = 3;
const LOOKAHEAD_DAYS = 14;

export interface SpokenSlot {
  start: string;
  speak: string;
  durationMinutes: number;
}

export interface VoiceSlotsResult {
  service: string;
  timezone: string;
  slots: string[];
  offers: SpokenSlot[];
  taken: boolean;
  requested: SpokenSlot | null;
  alternative: SpokenSlot | null;
  message: string;
  instruction: string;
}

const SERVICE_ALIASES: Record<string, string[]> = {
  "clinica geral": ["geral", "medico", "medicina geral", "familiar"],
  dermatologia: ["pele", "dermatolog", "mancha", "acne"],
  pediatria: ["crianca", "bebe", "filho", "filha", "pediatr"],
  "medicina dentaria": ["dentista", "dentes", "dental", "dentaria", "oral"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function findServiceByName(business: Business, name: string): Service | null {
  const raw = name.trim();
  if (!raw) {
    return null;
  }
  const n = normalize(raw);
  const exact = business.services.find((s) => normalize(s.name) === n);
  if (exact) {
    return exact;
  }
  const partial = business.services.find(
    (s) => normalize(s.name).includes(n) || n.includes(normalize(s.name)),
  );
  if (partial) {
    return partial;
  }
  for (const service of business.services) {
    const aliases = SERVICE_ALIASES[normalize(service.name)] ?? [];
    if (aliases.some((alias) => n.includes(normalize(alias)) || normalize(alias).includes(n))) {
      return service;
    }
  }
  return null;
}

function bcp47(locale: Locale): string {
  return locale === "en" ? "en-GB" : "pt-PT";
}

export function speakSlot(date: Date, locale: Locale, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat(bcp47(locale), { weekday: "long", timeZone }).format(date);
  const day = new Intl.DateTimeFormat(bcp47(locale), { day: "numeric", month: "long", timeZone }).format(date);
  const time = new Intl.DateTimeFormat(bcp47(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  const clock = time.replace(":", "h");
  if (locale === "en") {
    return `${weekday} ${day} at ${time}`;
  }
  return `${weekday}, ${day}, às ${clock}`;
}

function toSpoken(date: Date, service: Service, business: Business): SpokenSlot {
  return {
    start: date.toISOString(),
    speak: speakSlot(date, business.locale, business.timezone),
    durationMinutes: service.durationMinutes,
  };
}

function hasClockTime(raw: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return false;
  }
  return /t\d{2}:\d{2}/i.test(raw) || /\d{1,2}:\d{2}/.test(raw) || /\b\d{1,2}h(?:\d{2})?\b/i.test(raw);
}

export function parseVoiceDate(raw: unknown, locale: Locale, now: Date): { date: Date; specificTime: boolean } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { date: now, specificTime: false };
  }
  const text = String(raw).trim();
  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime()) && (/^\d{4}-\d{2}-\d{2}/.test(text) || text.includes("T"))) {
    return { date: iso, specificTime: hasClockTime(text) };
  }
  const parser = locale === "en" ? chrono.en.casual : chrono.pt.casual;
  const results = parser.parse(text, now, { forwardDate: true });
  if (results.length > 0) {
    const parsed = results[0].start.date();
    const specificTime = results[0].start.isCertain("hour");
    return { date: parsed, specificTime };
  }
  if (!Number.isNaN(iso.getTime())) {
    return { date: iso, specificTime: hasClockTime(text) };
  }
  return { date: now, specificTime: false };
}

function syntheticSlots(now: Date, count: number): Date[] {
  const slots: Date[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  while (slots.length < count) {
    if (cursor.getDay() !== 0) {
      for (const [hour, minute] of [
        [10, 0],
        [14, 30],
        [16, 0],
      ] as const) {
        const candidate = new Date(cursor);
        candidate.setHours(hour, minute, 0, 0);
        if (candidate.getTime() > now.getTime()) {
          slots.push(candidate);
          if (slots.length >= count) {
            break;
          }
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}

export function collectOpenSlots(
  business: Business,
  service: Service,
  around: Date,
  bookings: Booking[],
  now: Date,
  limit = VOICE_SLOT_LIMIT,
): Date[] {
  const slots: Date[] = [];
  const cursor = new Date(Number.isNaN(around.getTime()) ? now : around);
  cursor.setHours(0, 0, 0, 0);
  for (let day = 0; day < LOOKAHEAD_DAYS && slots.length < limit; day += 1) {
    const dayDate = new Date(cursor);
    dayDate.setDate(cursor.getDate() + day);
    for (const start of suggestSlots(business, service, dayDate, bookings, now, 20)) {
      if (start.getTime() >= now.getTime()) {
        slots.push(start);
        if (slots.length >= limit) {
          break;
        }
      }
    }
  }
  if (slots.length > 0) {
    return slots.slice(0, limit);
  }
  return syntheticSlots(now, limit);
}

/** Stable ~35% so demos sometimes (not always) treat a requested time as taken. */
export function shouldSimulateTaken(seed: string): boolean {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % 100;
  }
  return hash < 35;
}

function nearestOther(slots: Date[], requested: Date): Date | null {
  const others = slots.filter((s) => s.getTime() !== requested.getTime());
  if (others.length === 0) {
    return null;
  }
  others.sort((a, b) => Math.abs(a.getTime() - requested.getTime()) - Math.abs(b.getTime() - requested.getTime()));
  return others[0] ?? null;
}

export function buildGetSlotsResult(
  business: Business,
  service: Service,
  dateArg: unknown,
  bookings: Booking[],
  now: Date,
): VoiceSlotsResult {
  const parsed = parseVoiceDate(dateArg, business.locale, now);
  const collected = collectOpenSlots(business, service, parsed.date, bookings, now);
  let offers = collected;
  let taken = false;
  let requested: Date | null = parsed.specificTime ? parsed.date : null;
  let alternative: Date | null = null;

  if (parsed.specificTime) {
    const rounded = new Date(parsed.date);
    rounded.setSeconds(0, 0);
    const availability = checkAvailability(business, service, rounded, bookings, now);
    const seed = `${business.slug}:${service.id}:${rounded.toISOString()}`;
    const pretendTaken = isVoiceDemoSlug(business.slug) && shouldSimulateTaken(seed);
    if (!availability.ok || pretendTaken) {
      taken = true;
      requested = rounded;
      const nearby = collectOpenSlots(business, service, rounded, bookings, now, VOICE_SLOT_LIMIT + 2);
      alternative = nearestOther(nearby, rounded) ?? nearby[0] ?? collected[0] ?? null;
      offers = nearby.filter((s) => s.getTime() !== rounded.getTime()).slice(0, VOICE_SLOT_LIMIT);
      const alt = alternative;
      if (alt && !offers.some((s) => s.getTime() === alt.getTime())) {
        offers = [alt, ...offers].slice(0, VOICE_SLOT_LIMIT);
      }
    } else if (availability.ok) {
      offers = [rounded, ...collected.filter((s) => s.getTime() !== rounded.getTime())].slice(0, VOICE_SLOT_LIMIT);
    }
  }

  if (offers.length === 0) {
    offers = syntheticSlots(now, VOICE_SLOT_LIMIT);
  }

  const spokenOffers = offers.map((d) => toSpoken(d, service, business));
  const spokenRequested = requested ? toSpoken(requested, service, business) : null;
  const spokenAlt = alternative ? toSpoken(alternative, service, business) : spokenOffers[0] ?? null;

  const L = business.locale;
  const message = taken
    ? L === "en"
      ? `That time is taken. I can do ${spokenAlt?.speak ?? "a nearby slot"} instead.`
      : `Essa hora está ocupada. Posso às ${spokenAlt?.speak ?? "outra hora próxima"}.`
    : L === "en"
      ? `Available: ${spokenOffers.map((o) => o.speak).join("; ")}.`
      : `Tenho: ${spokenOffers.map((o) => o.speak).join("; ")}.`;

  const instruction =
    L === "en"
      ? taken
        ? "Speak immediately. Say the requested time is taken and offer the alternative. Do not stall."
        : "Speak the offered times out loud now (use speak). Ask which they prefer. Do not say you are starting or thinking."
      : taken
        ? "Fala já. Diz que essa hora está ocupada e propõe a alternativa. Não fiques em «um momento» nem «a começar»."
        : "Diz já os horários em voz alta (usa speak). Pergunta qual prefere. Não digas que estás a começar ou a pensar.";

  return {
    service: service.name,
    timezone: business.timezone,
    slots: spokenOffers.map((o) => o.start),
    offers: spokenOffers,
    taken,
    requested: taken ? spokenRequested : null,
    alternative: taken ? spokenAlt : null,
    message,
    instruction,
  };
}

export function bookingSpeak(startIso: string, serviceName: string, business: Business): string {
  const start = new Date(startIso);
  const when = Number.isNaN(start.getTime()) ? startIso : speakSlot(start, business.locale, business.timezone);
  if (business.locale === "en") {
    return `${serviceName} on ${when}. I'll send an SMS confirmation.`;
  }
  return `${serviceName} — ${when}. Envio confirmação por SMS.`;
}
