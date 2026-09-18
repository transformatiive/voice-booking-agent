import type { Booking, Business, Resource, Service } from "../domain/types.js";
import { hoursForResource, pickResourceForService, resourceOffersService } from "../domain/assignment.js";

export type Unavailable = "past" | "closed_day" | "outside_hours" | "conflict" | "no_resource";

export type AvailabilityResult = { ok: true; resource: Resource } | { ok: false; reason: Unavailable };

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
  if (Number.isNaN(start.getTime()) || Number.isNaN(now.getTime())) {
    return { ok: false, reason: "past" };
  }
  if (start.getTime() <= now.getTime()) {
    return { ok: false, reason: "past" };
  }

  const resource = resourceId
    ? business.resources.find((row) => row.id === resourceId)
    : pickResourceForService(business, service.id);
  if (!resource || !resourceOffersService(resource, service.id)) {
    return { ok: false, reason: "no_resource" };
  }

  const hours = hoursForResource(business, resource);
  const day = hours[start.getDay()];
  if (!day || day.open === null || day.close === null) {
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
    if (b.resourceId !== resource.id) {
      return false;
    }
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    return startMs < bEnd && endMs > bStart;
  });
  if (conflict) {
    return { ok: false, reason: "conflict" };
  }

  return { ok: true, resource };
}

export function suggestSlots(
  business: Business,
  service: Service,
  around: Date,
  bookings: Booking[],
  now: Date = new Date(),
  limit = 3,
): Date[] {
  if (Number.isNaN(around.getTime())) {
    return [];
  }
  const seen = new Set<number>();
  const slots: Date[] = [];
  const candidates = business.resources.filter((resource) => resourceOffersService(resource, service.id));
  for (const resource of candidates) {
    const hours = hoursForResource(business, resource);
    const day = hours[around.getDay()];
    if (!day || day.open === null || day.close === null) {
      continue;
    }
    const base = new Date(around);
    base.setHours(0, 0, 0, 0);
    for (let minute = day.open; minute + service.durationMinutes <= day.close; minute += 30) {
      const candidate = new Date(base.getTime() + minute * 60_000);
      if (seen.has(candidate.getTime())) {
        continue;
      }
      if (checkAvailability(business, service, candidate, bookings, now, resource.id).ok) {
        seen.add(candidate.getTime());
        slots.push(candidate);
        if (slots.length >= limit) {
          return slots;
        }
      }
    }
  }
  return slots;
}
