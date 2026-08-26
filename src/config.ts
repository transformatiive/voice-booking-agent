import { join } from "node:path";

// PT-first product: default the process timezone to Lisbon so natural-language
// time parsing (chrono, server-local) and display (Intl, business timezone)
// agree. Set before any Date is constructed.
process.env.TZ = process.env.TZ ?? "Europe/Lisbon";

/**
 * Central runtime configuration. Every third-party integration is optional:
 * when its credentials are absent the app runs in a self-contained demo/mock
 * mode, so the product is always deployable and demonstrable.
 */

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: env("PUBLIC_BASE_URL") ?? `http://localhost:${process.env.PORT ?? 3000}`,
  dataDir: env("DATA_DIR") ?? join(process.cwd(), "data"),

  database: {
    /** When set (e.g. Railway Postgres), the app persists to Postgres. */
    url: env("DATABASE_URL"),
    /** Force SSL for the DB connection (needed for Railway's public proxy URL). */
    ssl: env("DATABASE_SSL") === "true",
  },

  scheduling: {
    /** Cal.com API base (v2). */
    calApiBase: env("CAL_API_BASE") ?? "https://api.cal.com/v2",
    calApiKey: env("CAL_API_KEY"),
  },

  billing: {
    stripeSecretKey: env("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET"),
    /** Optional map of plan id -> Stripe price id (base subscription). */
    priceBase: env("STRIPE_PRICE_BASE"),
    pricePro: env("STRIPE_PRICE_PRO"),
    priceStudio: env("STRIPE_PRICE_STUDIO"),
    /** Metered price for per-minute overage. */
    priceOverage: env("STRIPE_PRICE_OVERAGE"),
  },

  telephony: {
    /** "telnyx" | "zadarma" | "mock" (auto-detected when unset). */
    provider: env("TELEPHONY_PROVIDER"),
    telnyxApiKey: env("TELNYX_API_KEY"),
    telnyxConnectionId: env("TELNYX_CONNECTION_ID"),
    zadarmaKey: env("ZADARMA_KEY"),
    zadarmaSecret: env("ZADARMA_SECRET"),
    /** Fallback destination for warm transfers when a resource has none. */
    defaultTransferNumber: env("DEFAULT_TRANSFER_NUMBER"),
  },

  voice: {
    /** Shared secret to authenticate Retell/Vapi function webhooks. */
    functionWebhookSecret: env("VOICE_FUNCTION_SECRET"),
    /** xAI Grok Live 2. Read live so tests can stub env; never expose to the browser. */
    get xaiApiKey(): string | undefined {
      return env("XAI_API_KEY");
    },
  },
} as const;

export function featureFlags() {
  return {
    calcom: Boolean(config.scheduling.calApiKey),
    stripe: Boolean(config.billing.stripeSecretKey),
    telnyx: Boolean(config.telephony.telnyxApiKey),
    zadarma: Boolean(config.telephony.zadarmaKey && config.telephony.zadarmaSecret),
    grokVoice: Boolean(config.voice.xaiApiKey),
  };
}

export function resolvedTelephonyProvider(): "telnyx" | "zadarma" | "mock" {
  const flags = featureFlags();
  const explicit = config.telephony.provider;
  if (explicit === "telnyx" || explicit === "zadarma" || explicit === "mock") {
    return explicit;
  }
  if (flags.telnyx) {
    return "telnyx";
  }
  if (flags.zadarma) {
    return "zadarma";
  }
  return "mock";
}
