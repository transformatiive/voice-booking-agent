import Stripe from "stripe";
import { config } from "../config.js";
import type { Business, PlanId, SubscriptionStatus } from "../domain/types.js";
import { PLANS } from "../domain/plans.js";
import type { Store } from "../store/store.js";

/**
 * Stripe subscriptions. Plan prices already include the monthly DID/number
 * rental (see domain/plans.ts), so customers never see a separate number fee.
 * Overage minutes can be reported to a metered price when configured.
 *
 * Every method degrades gracefully when Stripe is not configured, so the
 * product remains demoable without keys.
 */
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(private readonly store: Store) {
    this.stripe = config.billing.stripeSecretKey
      ? new Stripe(config.billing.stripeSecretKey)
      : null;
  }

  get enabled(): boolean {
    return this.stripe !== null;
  }

  private priceIdForPlan(planId: PlanId): string | undefined {
    switch (planId) {
      case "base":
        return config.billing.priceBase;
      case "pro":
        return config.billing.pricePro;
      case "studio":
        return config.billing.priceStudio;
      default: {
        const exhaustive: never = planId;
        throw new Error(`Unknown plan: ${String(exhaustive)}`);
      }
    }
  }

  private planForPriceId(priceId: string | undefined): PlanId | null {
    if (!priceId) {
      return null;
    }
    if (priceId === config.billing.priceBase) {
      return "base";
    }
    if (priceId === config.billing.pricePro) {
      return "pro";
    }
    if (priceId === config.billing.priceStudio) {
      return "studio";
    }
    return null;
  }

  private async ensureCustomer(business: Business): Promise<string | null> {
    if (!this.stripe) {
      return null;
    }
    if (business.subscription.stripeCustomerId) {
      return business.subscription.stripeCustomerId;
    }
    const customer = await this.stripe.customers.create({
      name: business.name,
      metadata: { businessId: business.id, slug: business.slug },
    });
    business.subscription.stripeCustomerId = customer.id;
    this.store.saveBusiness(business);
    return customer.id;
  }

  async createCheckoutSession(
    business: Business,
    planId: PlanId,
  ): Promise<{ url: string } | { error: string }> {
    if (!this.stripe) {
      return { error: "stripe_not_configured" };
    }
    const priceId = this.priceIdForPlan(planId);
    if (!priceId) {
      return { error: `missing_price_for_${planId}` };
    }
    const customerId = await this.ensureCustomer(business);
    if (!customerId) {
      return { error: "customer_failed" };
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }];
    if (config.billing.priceOverage) {
      lineItems.push({ price: config.billing.priceOverage });
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: lineItems,
      success_url: `${config.publicBaseUrl}/app/${business.slug}?billing=success`,
      cancel_url: `${config.publicBaseUrl}/app/${business.slug}?billing=cancel`,
      subscription_data: { metadata: { businessId: business.id, planId } },
      locale: business.locale === "pt" ? "pt" : "en",
    });
    return session.url ? { url: session.url } : { error: "no_session_url" };
  }

  async createPortalSession(business: Business): Promise<{ url: string } | { error: string }> {
    if (!this.stripe) {
      return { error: "stripe_not_configured" };
    }
    const customerId = await this.ensureCustomer(business);
    if (!customerId) {
      return { error: "customer_failed" };
    }
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.publicBaseUrl}/app/${business.slug}`,
    });
    return { url: session.url };
  }

  /** Verify and apply a Stripe webhook event to the matching business. */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: boolean }> {
    if (!this.stripe || !config.billing.stripeWebhookSecret || !signature) {
      return { received: false };
    }
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.billing.stripeWebhookSecret,
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        this.applySubscription(sub);
        break;
      }
      default:
        break;
    }
    return { received: true };
  }

  private applySubscription(sub: Stripe.Subscription): void {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const business = this.store.findBusinessByStripeCustomer(customerId);
    if (!business) {
      return;
    }
    const priceId = sub.items.data[0]?.price.id;
    const planId = this.planForPriceId(priceId) ?? business.subscription.planId;
    business.subscription.stripeSubscriptionId = sub.id;
    business.subscription.planId = planId;
    business.subscription.includedMinutes = PLANS[planId].includedMinutes;
    business.subscription.status = mapStatus(sub.status);
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
    business.subscription.currentPeriodEnd = periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null;
    this.store.saveBusiness(business);
  }
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
      return "none";
    default:
      return "none";
  }
}
