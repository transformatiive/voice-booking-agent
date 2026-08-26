import type { ServiceId } from "../types.js";
import type { BookingStore } from "./store.js";
import {
  BUSINESS_CLOSE_HOUR,
  BUSINESS_OPEN_HOUR,
  CLOSED_WEEKDAYS,
  getService,
} from "./catalog.js";

export type AvailabilityResult =
  | { ok: true }
  | { ok: false; reason: "past" | "closed_day" | "outside_hours" | "conflict" };

export function checkAvailability(
  store: BookingStore,
  service: ServiceId,
  start: Date,
  now: Date = new Date(),
): AvailabilityResult {
  if (start.getTime() <= now.getTime()) {
    return { ok: false, reason: "past" };
  }

  if (CLOSED_WEEKDAYS.has(start.getDay())) {
    return { ok: false, reason: "closed_day" };
  }

  const durationMinutes = getService(service).durationMinutes;
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const startsBeforeOpen = start.getHours() < BUSINESS_OPEN_HOUR;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const endsAfterClose =
    endHour > BUSINESS_CLOSE_HOUR ||
    end.getDate() !== start.getDate() ||
    end.getMonth() !== start.getMonth();
  if (startsBeforeOpen || endsAfterClose) {
    return { ok: false, reason: "outside_hours" };
  }

  if (store.overlaps(start, end)) {
    return { ok: false, reason: "conflict" };
  }

  return { ok: true };
}

/** Suggest up to `limit` open start times for a service on the same day. */
export function suggestSlots(
  store: BookingStore,
  service: ServiceId,
  around: Date,
  now: Date = new Date(),
  limit = 3,
): Date[] {
  const suggestions: Date[] = [];
  const day = new Date(around);
  day.setHours(BUSINESS_OPEN_HOUR, 0, 0, 0);

  for (let slot = 0; slot < ((BUSINESS_CLOSE_HOUR - BUSINESS_OPEN_HOUR) * 60) / 30; slot++) {
    const candidate = new Date(day.getTime() + slot * 30 * 60_000);
    const result = checkAvailability(store, service, candidate, now);
    if (result.ok) {
      suggestions.push(candidate);
      if (suggestions.length >= limit) {
        break;
      }
    }
  }
  return suggestions;
}
