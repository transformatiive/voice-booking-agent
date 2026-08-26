import type { Booking, Business, BookingSource, Service } from "../domain/types.js";

export interface Slot {
  start: string;
  end: string;
}

export interface BookInput {
  business: Business;
  service: Service;
  start: Date;
  resourceId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  source: BookingSource;
}

export type BookResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "past" | "closed_day" | "outside_hours" | "conflict" | "error" };

/**
 * The scheduling brain. Cal.com is the production implementation; the in-memory
 * scheduler is the self-contained fallback used for demos and when no Cal.com
 * key is configured.
 */
export interface Scheduler {
  readonly kind: "calcom" | "memory";
  getSlots(business: Business, service: Service, from: Date, to: Date): Promise<Slot[]>;
  book(input: BookInput): Promise<BookResult>;
  cancel(business: Business, booking: Booking): Promise<boolean>;
}
