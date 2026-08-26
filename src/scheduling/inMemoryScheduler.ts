import { randomUUID } from "node:crypto";
import type { Booking, Business, Service } from "../domain/types.js";
import type { Store } from "../store/store.js";
import { checkAvailability, suggestSlots } from "./availability.js";
import type { BookInput, BookResult, Scheduler, Slot } from "./scheduler.js";

/** Self-contained scheduler backed by the local store and availability engine. */
export class InMemoryScheduler implements Scheduler {
  readonly kind = "memory" as const;

  constructor(
    private readonly store: Store,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSlots(business: Business, service: Service, from: Date, to: Date): Promise<Slot[]> {
    const bookings = this.store.listBookings(business.id);
    const slots: Slot[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= to.getTime() && slots.length < 20) {
      for (const start of suggestSlots(business, service, cursor, bookings, this.now(), 20)) {
        if (start.getTime() >= from.getTime() && start.getTime() <= to.getTime()) {
          slots.push({
            start: start.toISOString(),
            end: new Date(start.getTime() + service.durationMinutes * 60_000).toISOString(),
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return slots;
  }

  async book(input: BookInput): Promise<BookResult> {
    const bookings = this.store.listBookings(input.business.id);
    const availability = checkAvailability(
      input.business,
      input.service,
      input.start,
      bookings,
      this.now(),
      input.resourceId,
    );
    if (!availability.ok) {
      return { ok: false, reason: availability.reason };
    }
    const end = new Date(input.start.getTime() + input.service.durationMinutes * 60_000);
    const booking: Booking = {
      id: randomUUID(),
      businessId: input.business.id,
      serviceId: input.service.id,
      serviceName: input.service.name,
      resourceId: input.resourceId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      start: input.start.toISOString(),
      end: end.toISOString(),
      source: input.source,
      calBookingUid: null,
      createdAt: new Date().toISOString(),
    };
    this.store.addBooking(booking);
    return { ok: true, booking };
  }

  async cancel(business: Business, booking: Booking): Promise<boolean> {
    return this.store.removeBooking(business.id, booking.id);
  }
}
