import type { Booking, Business, Service } from "../domain/types.js";

export type Unavailable = "past" | "closed_day" | "outside_hours" | "conflict";

export type AvailabilityResult = { ok: true } | { ok: false; reason: Unavailable };

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function checkAvailability(
  business: Business,
  service: Service,
  start: Date,
  bookings: Booking[],
  now: Date = new Date(),
  resourceId: string | null = null,
): AvailabilityResult {
  if (start.getTime() <= now.getTime()) {
    return { ok: false, reason: "past" };
  }

  const day = business.hours[start.getDay()];
  if (day.open === null || day.close === null) {
    return { ok: false, reason: "closed_day" };
  }

  const end = new Date(start.getTime() + service.durationMinutes * 60_000);
  const startMin = minutesSinceMidnight(start);
  const endMin = minutesSinceMidnight(end);
  const sameDay = end.getDate() === start.getDate() && end.getMonth() === start.getMonth();
  if (startMin < day.open || !sameDay || endMin > day.close) {
    return { ok: false, reason: "outside_hours" };
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  const conflict = bookings.some((b) => {
    if (resourceId && b.resourceId && b.resourceId !== resourceId) {
      return false;
    }
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    return startMs < bEnd && endMs > bStart;
  });
  if (conflict) {
    return { ok: false, reason: "conflict" };
  }

  return { ok: true };
}

export function suggestSlots(
  business: Business,
  service: Service,
  around: Date,
  bookings: Booking[],
  now: Date = new Date(),
  limit = 3,
): Date[] {
  const day = business.hours[around.getDay()];
  if (day.open === null || day.close === null) {
    return [];
  }
  const slots: Date[] = [];
  const base = new Date(around);
  base.setHours(0, 0, 0, 0);
  for (let minute = day.open; minute + service.durationMinutes <= day.close; minute += 30) {
    const candidate = new Date(base.getTime() + minute * 60_000);
    if (checkAvailability(business, service, candidate, bookings, now).ok) {
      slots.push(candidate);
      if (slots.length >= limit) {
        break;
      }
    }
  }
  return slots;
}
