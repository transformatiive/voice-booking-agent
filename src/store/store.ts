import { randomUUID } from "node:crypto";
import type {
  AgentGender,
  Booking,
  Business,
  Call,
  Locale,
  NumberPreference,
  PlanId,
  Resource,
  UseCase,
} from "../domain/types.js";
import { defaultHours, defaultServices } from "../domain/catalog.js";
import { defaultAgentKnowledge, defaultAgentScript } from "../domain/agentScript.js";
import { defaultResourceRole } from "../domain/assignment.js";
import { getPlan } from "../domain/plans.js";
import { ensureUsagePeriod } from "../billing/usage.js";
import { DEMO_DID_E164 } from "../telephony/demoDid.js";
import type { Db, Persistence } from "./persistence.js";
import { emptyDb } from "./persistence.js";
import { MARKETING_DEMO_SLUG } from "./seed.js";

export interface CreateBusinessInput {
  name: string;
  useCase: UseCase;
  locale: Locale;
  agentName: string;
  agentGender: AgentGender;
  planId: PlanId;
  timezone?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  numberPreference?: NumberPreference;
  status?: "pending" | "active";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export class Store {
  private db: Db = emptyDb();
  /** Serializes async persists so the latest state always wins. */
  private persisting: Promise<void> = Promise.resolve();

  constructor(private readonly persistence: Persistence) {
    const loaded = persistence.loadSync?.();
    if (loaded) {
      this.db = loaded;
      this.normalize();
    }
  }

  /** Load durable state for async backends (e.g. Postgres). Call once at startup. */
  async init(): Promise<void> {
    if (this.persistence.init) {
      await this.persistence.init();
    }
    if (this.persistence.load) {
      this.db = await this.persistence.load();
      this.normalize();
    }
  }

  /** Backfill fields added after some rows were persisted (forward-compat). */
  private normalize(): void {
    if (!this.db.calls) {
      this.db.calls = [];
    }
    for (const b of this.db.businesses) {
      // Rows created before the account-status feature were already operational,
      // so treat any missing/invalid status as active.
      if (b.status !== "pending" && b.status !== "active") {
        b.status = "active";
      }
      if (b.numberPreference !== "new" && b.numberPreference !== "port") {
        b.numberPreference = "new";
      }
      if (b.contactEmail === undefined) {
        b.contactEmail = null;
      }
      if (b.contactPhone === undefined) {
        b.contactPhone = null;
      }
      const serviceIds = b.services.map((s) => s.id);
      b.resources = b.resources.map((resource) => normalizeResource(resource, serviceIds));
      if (!b.subscription.planStartedAt) {
        b.subscription.planStartedAt = b.createdAt;
      }
      if (b.subscription.overageMinutes == null) {
        b.subscription.overageMinutes = 0;
      }
      if (!b.subscription.currentPeriodStart) {
        b.subscription.currentPeriodStart = null;
      }
      ensureUsagePeriod(b.subscription);
      if (!b.agentScript) {
        b.agentScript = defaultAgentScript({
          name: b.name,
          useCase: b.useCase,
          locale: b.locale,
          agentName: b.agentName,
        });
      }
      if (b.agentKnowledge == null) {
        b.agentKnowledge = defaultAgentKnowledge(b);
      }
      if (b.slug === MARKETING_DEMO_SLUG) {
        b.number = {
          e164: DEMO_DID_E164,
          provider: "telnyx",
          type: "geographic",
          status: "active",
          monthlyCostCents: b.number?.monthlyCostCents ?? 0,
        };
      }
    }
    const fallbackResource = (businessId: string): string => {
      const business = this.db.businesses.find((row) => row.id === businessId);
      return business?.resources[0]?.id ?? "";
    };
    for (const booking of this.db.bookings) {
      if (!booking.resourceId) {
        booking.resourceId = fallbackResource(booking.businessId);
      }
    }
  }

  /** Wait for all pending writes to flush (useful in tests/shutdown). */
  async flush(): Promise<void> {
    await this.persisting;
  }

  private persist(): void {
    this.persisting = this.persisting
      .then(() => this.persistence.persist(this.db))
      .catch((err) => {
        console.error("[store] persist failed:", err instanceof Error ? err.message : err);
      });
  }

  listBusinesses(): Business[] {
    return [...this.db.businesses];
  }

  getBusiness(id: string): Business | undefined {
    return this.db.businesses.find((b) => b.id === id);
  }

  getBusinessBySlug(slug: string): Business | undefined {
    return this.db.businesses.find((b) => b.slug === slug);
  }

  private uniqueSlug(base: string): string {
    let slug = base || "negocio";
    let n = 2;
    while (this.db.businesses.some((b) => b.slug === slug)) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  createBusiness(input: CreateBusinessInput): Business {
    const plan = getPlan(input.planId);
    const createdAt = new Date().toISOString();
    const services = defaultServices(input.useCase);
    const resource: Resource = {
      id: randomUUID(),
      name: "Recurso 1",
      role: defaultResourceRole(),
      serviceIds: services.map((service) => service.id),
      hours: null,
      transferNumber: null,
      available: true,
      calUserId: null,
    };
    const business: Business = {
      id: randomUUID(),
      slug: this.uniqueSlug(slugify(input.name)),
      name: input.name,
      useCase: input.useCase,
      locale: input.locale,
      agentName: input.agentName,
      agentGender: input.agentGender,
      timezone: input.timezone ?? "Europe/Lisbon",
      status: input.status ?? "pending",
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      numberPreference: input.numberPreference ?? "new",
      hours: defaultHours(),
      services,
      resources: [resource],
      number: null,
      subscription: {
        planId: plan.id,
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        includedMinutes: plan.includedMinutes,
        usedMinutes: 0,
        overageMinutes: 0,
        planStartedAt: createdAt,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      },
      agentScript: defaultAgentScript({
        name: input.name,
        useCase: input.useCase,
        locale: input.locale,
        agentName: input.agentName,
      }),
      agentKnowledge: defaultAgentKnowledge({ name: input.name, services, locale: input.locale }),
      calApiKey: null,
      createdAt,
    };
    ensureUsagePeriod(business.subscription, new Date(createdAt));
    this.db.businesses.push(business);
    this.persist();
    return business;
  }

  updateBusiness(id: string, patch: Partial<Business>): Business | undefined {
    const business = this.getBusiness(id);
    if (!business) {
      return undefined;
    }
    Object.assign(business, patch, { id: business.id, slug: business.slug });
    this.persist();
    return business;
  }

  saveBusiness(business: Business): void {
    const index = this.db.businesses.findIndex((b) => b.id === business.id);
    if (index >= 0) {
      this.db.businesses[index] = business;
      this.persist();
    }
  }

  findBusinessByStripeCustomer(customerId: string): Business | undefined {
    return this.db.businesses.find((b) => b.subscription.stripeCustomerId === customerId);
  }

  findBusinessByNumber(e164: string): Business | undefined {
    const digits = e164.replace(/\D/g, "");
    if (!digits) {
      return undefined;
    }
    return this.db.businesses.find((b) => {
      const number = b.number?.e164?.replace(/\D/g, "") ?? "";
      return number !== "" && number === digits;
    });
  }

  // --- Bookings ---

  listBookings(businessId: string): Booking[] {
    return this.db.bookings
      .filter((b) => b.businessId === businessId)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  addBooking(booking: Booking): void {
    this.db.bookings.push(booking);
    this.persist();
  }

  removeBooking(businessId: string, bookingId: string): boolean {
    const index = this.db.bookings.findIndex(
      (b) => b.id === bookingId && b.businessId === businessId,
    );
    if (index === -1) {
      return false;
    }
    this.db.bookings.splice(index, 1);
    this.persist();
    return true;
  }

  updateBooking(businessId: string, bookingId: string, patch: Partial<Booking>): Booking | undefined {
    const booking = this.db.bookings.find((b) => b.id === bookingId && b.businessId === businessId);
    if (!booking) {
      return undefined;
    }
    Object.assign(booking, patch, { id: booking.id, businessId: booking.businessId });
    this.persist();
    return booking;
  }

  // --- Calls ---

  listCalls(businessId: string): Call[] {
    return (this.db.calls ?? [])
      .filter((call) => call.businessId === businessId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  findCallByProviderId(businessId: string, providerCallId: string): Call | undefined {
    return (this.db.calls ?? []).find(
      (call) => call.businessId === businessId && call.providerCallId === providerCallId,
    );
  }

  addCall(call: Call): void {
    this.db.calls.push(call);
    this.persist();
  }

  saveCall(call: Call): void {
    const index = this.db.calls.findIndex((row) => row.id === call.id);
    if (index >= 0) {
      this.db.calls[index] = call;
    } else {
      this.db.calls.push(call);
    }
    this.persist();
  }
}

function normalizeResource(resource: Resource, serviceIds: string[]): Resource {
  const role = resource.role?.trim() ? resource.role : defaultResourceRole();
  const assigned = Array.isArray(resource.serviceIds) ? resource.serviceIds : serviceIds;
  return {
    ...resource,
    role,
    serviceIds: assigned,
    hours: resource.hours ?? null,
  };
}
