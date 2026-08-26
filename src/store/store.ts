import { randomUUID } from "node:crypto";
import type {
  AgentGender,
  Booking,
  Business,
  Locale,
  NumberPreference,
  PlanId,
  UseCase,
} from "../domain/types.js";
import { defaultHours, defaultServices } from "../domain/catalog.js";
import { getPlan } from "../domain/plans.js";
import type { Db, Persistence } from "./persistence.js";
import { emptyDb } from "./persistence.js";

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
    }
  }

  /** Load durable state for async backends (e.g. Postgres). Call once at startup. */
  async init(): Promise<void> {
    if (this.persistence.init) {
      await this.persistence.init();
    }
    if (this.persistence.load) {
      this.db = await this.persistence.load();
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
      services: defaultServices(input.useCase),
      resources: [
        { id: randomUUID(), name: "Recurso 1", transferNumber: null, available: true, calUserId: null },
      ],
      number: null,
      subscription: {
        planId: plan.id,
        status: "none",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        includedMinutes: plan.includedMinutes,
        usedMinutes: 0,
        currentPeriodEnd: null,
      },
      calApiKey: null,
      createdAt: new Date().toISOString(),
    };
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
}
