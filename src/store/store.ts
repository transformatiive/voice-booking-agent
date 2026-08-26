import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentGender,
  Booking,
  Business,
  Locale,
  PlanId,
  UseCase,
} from "../domain/types.js";
import { defaultHours, defaultServices } from "../domain/catalog.js";
import { getPlan } from "../domain/plans.js";

export interface CreateBusinessInput {
  name: string;
  useCase: UseCase;
  locale: Locale;
  agentName: string;
  agentGender: AgentGender;
  planId: PlanId;
  timezone?: string;
}

interface Db {
  businesses: Business[];
  bookings: Booking[];
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
  private db: Db = { businesses: [], bookings: [] };
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "db.json");
    if (existsSync(this.file)) {
      try {
        this.db = JSON.parse(readFileSync(this.file, "utf8")) as Db;
      } catch {
        this.db = { businesses: [], bookings: [] };
      }
    }
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.db, null, 2), "utf8");
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
