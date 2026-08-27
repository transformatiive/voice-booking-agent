import { randomUUID } from "node:crypto";
import type { Booking, Business, Service } from "../domain/types.js";
import type { Store } from "../store/store.js";
import type { BookInput, BookResult, Scheduler, Slot } from "./scheduler.js";
import { InMemoryScheduler } from "./inMemoryScheduler.js";

const CAL_API_VERSION = "2024-08-13";
/** Voice demo must never stall on Cal.com; fall back to in-memory if it is slow. */
const CAL_CALL_TIMEOUT_MS = 1_200;

interface CalConfig {
  apiBase: string;
  apiKey: string;
}

/**
 * Cal.com-backed scheduler. Cal.com owns availability, event types (services)
 * and bidirectional Google Calendar sync, so the barber's "backoffice" is just
 * the Google Calendar app on their phone.
 *
 * When a service is not yet mapped to a Cal event type, or a Cal request fails,
 * this scheduler transparently falls back to the in-memory engine so the
 * product keeps working during onboarding.
 */
export class CalComScheduler implements Scheduler {
  readonly kind = "calcom" as const;
  private readonly fallback: InMemoryScheduler;

  constructor(
    private readonly store: Store,
    private readonly globalConfig: CalConfig,
    now: () => Date = () => new Date(),
  ) {
    this.fallback = new InMemoryScheduler(store, now);
  }

  private configFor(business: Business): CalConfig {
    return business.calApiKey
      ? { apiBase: this.globalConfig.apiBase, apiKey: business.calApiKey }
      : this.globalConfig;
  }

  private async call(config: CalConfig, path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${config.apiBase}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(CAL_CALL_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "cal-api-version": CAL_API_VERSION,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Cal.com ${path} -> ${res.status}`);
    }
    return res.json();
  }

  async getSlots(business: Business, service: Service, from: Date, to: Date): Promise<Slot[]> {
    if (service.calEventTypeId === null) {
      return this.fallback.getSlots(business, service, from, to);
    }
    try {
      const config = this.configFor(business);
      const params = new URLSearchParams({
        eventTypeId: String(service.calEventTypeId),
        start: from.toISOString(),
        end: to.toISOString(),
        timeZone: business.timezone,
      });
      const data = (await this.call(config, `/slots?${params.toString()}`)) as {
        data?: Record<string, Array<{ start: string }>>;
      };
      const slots: Slot[] = [];
      for (const daySlots of Object.values(data.data ?? {})) {
        for (const slot of daySlots) {
          const start = new Date(slot.start);
          slots.push({
            start: start.toISOString(),
            end: new Date(start.getTime() + service.durationMinutes * 60_000).toISOString(),
          });
        }
      }
      return slots;
    } catch {
      return this.fallback.getSlots(business, service, from, to);
    }
  }

  async book(input: BookInput): Promise<BookResult> {
    if (input.service.calEventTypeId === null) {
      return this.fallback.book(input);
    }
    try {
      const config = this.configFor(input.business);
      const attendeeName = input.customerName ?? "Cliente";
      const body = {
        start: input.start.toISOString(),
        eventTypeId: input.service.calEventTypeId,
        attendee: {
          name: attendeeName,
          email: syntheticEmail(attendeeName, input.customerPhone),
          timeZone: input.business.timezone,
          phoneNumber: input.customerPhone ?? undefined,
          language: input.business.locale,
        },
      };
      const data = (await this.call(config, "/bookings", {
        method: "POST",
        body: JSON.stringify(body),
      })) as { data?: { uid?: string } };

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
        calBookingUid: data.data?.uid ?? null,
        createdAt: new Date().toISOString(),
      };
      this.store.addBooking(booking);
      return { ok: true, booking };
    } catch {
      return this.fallback.book(input);
    }
  }

  async cancel(business: Business, booking: Booking): Promise<boolean> {
    if (booking.calBookingUid) {
      try {
        await this.call(this.configFor(business), `/bookings/${booking.calBookingUid}/cancel`, {
          method: "POST",
          body: JSON.stringify({ cancellationReason: "Cancelado pelo cliente" }),
        });
      } catch {
        // Fall through to local removal even if the remote cancel failed.
      }
    }
    return this.store.removeBooking(business.id, booking.id);
  }
}

function syntheticEmail(name: string, phone: string | null): string {
  const base = (phone ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24) || "cliente";
  return `${base}@voice-agent.local`;
}
