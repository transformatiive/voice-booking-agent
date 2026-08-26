import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Booking, ServiceId } from "../types.js";
import { getService } from "./catalog.js";

export interface NewBooking {
  service: ServiceId;
  customerName: string | null;
  start: Date;
}

/**
 * Stores bookings in memory. When a file path is provided, the store also
 * persists to disk as JSON so bookings survive dev-server restarts.
 */
export class BookingStore {
  private bookings: Booking[] = [];

  constructor(private readonly filePath: string | null = null) {
    if (this.filePath && existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, "utf8");
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.bookings = parsed as Booking[];
        }
      } catch {
        this.bookings = [];
      }
    }
  }

  list(): Booking[] {
    return [...this.bookings].sort((a, b) => a.start.localeCompare(b.start));
  }

  find(id: string): Booking | undefined {
    return this.bookings.find((booking) => booking.id === id);
  }

  overlaps(start: Date, end: Date): Booking | undefined {
    const startMs = start.getTime();
    const endMs = end.getTime();
    return this.bookings.find((booking) => {
      const bookingStart = new Date(booking.start).getTime();
      const bookingEnd = new Date(booking.end).getTime();
      return startMs < bookingEnd && endMs > bookingStart;
    });
  }

  create(input: NewBooking): Booking {
    const service = getService(input.service);
    const end = new Date(input.start.getTime() + service.durationMinutes * 60_000);
    const booking: Booking = {
      id: randomUUID(),
      service: service.id,
      serviceName: service.name,
      customerName: input.customerName,
      start: input.start.toISOString(),
      end: end.toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.bookings.push(booking);
    this.persist();
    return booking;
  }

  cancel(id: string): boolean {
    const index = this.bookings.findIndex((booking) => booking.id === id);
    if (index === -1) {
      return false;
    }
    this.bookings.splice(index, 1);
    this.persist();
    return true;
  }

  clear(): void {
    this.bookings = [];
    this.persist();
  }

  private persist(): void {
    if (!this.filePath) {
      return;
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.bookings, null, 2), "utf8");
  }
}
