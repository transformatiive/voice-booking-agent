import type { Service, ServiceId } from "../types.js";

export const BUSINESS_OPEN_HOUR = 9; // 09:00 local
export const BUSINESS_CLOSE_HOUR = 17; // 17:00 local
/** 0 = Sunday. The shop is closed on Sundays. */
export const CLOSED_WEEKDAYS: ReadonlySet<number> = new Set([0]);

export const SERVICES: readonly Service[] = [
  {
    id: "haircut",
    name: "Haircut",
    durationMinutes: 30,
    aliases: ["haircut", "hair cut", "cut", "trim"],
  },
  {
    id: "hair_coloring",
    name: "Hair Coloring",
    durationMinutes: 90,
    aliases: ["coloring", "colouring", "color", "colour", "dye", "highlights"],
  },
  {
    id: "massage",
    name: "Massage",
    durationMinutes: 60,
    aliases: ["massage"],
  },
  {
    id: "manicure",
    name: "Manicure",
    durationMinutes: 45,
    aliases: ["manicure", "nails", "mani"],
  },
  {
    id: "consultation",
    name: "Consultation",
    durationMinutes: 30,
    aliases: ["consultation", "consult", "advice"],
  },
  {
    id: "dental_cleaning",
    name: "Dental Cleaning",
    durationMinutes: 45,
    aliases: ["dental cleaning", "dental", "teeth cleaning", "cleaning", "dentist"],
  },
];

const SERVICE_BY_ID = new Map<ServiceId, Service>(
  SERVICES.map((service) => [service.id, service]),
);

export function getService(id: ServiceId): Service {
  const service = SERVICE_BY_ID.get(id);
  if (!service) {
    throw new Error(`Unknown service id: ${id}`);
  }
  return service;
}

/** Find a service by matching any alias contained in free text. */
export function matchService(text: string): ServiceId | null {
  const normalized = text.toLowerCase();
  // Prefer the longest alias match so "hair coloring" wins over "hair".
  let best: { id: ServiceId; length: number } | null = null;
  for (const service of SERVICES) {
    for (const alias of service.aliases) {
      if (normalized.includes(alias) && (!best || alias.length > best.length)) {
        best = { id: service.id, length: alias.length };
      }
    }
  }
  return best?.id ?? null;
}
