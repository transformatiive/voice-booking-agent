import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import type { Request, Response } from "express";
import { config, featureFlags, resolvedTelephonyProvider } from "./config.js";
import { PLANS, PORTABILITY_SETUP_FEE_CENTS } from "./domain/plans.js";
import type { AgentGender, Business, PlanId, UseCase, WeeklyHours } from "./domain/types.js";
import { Store } from "./store/store.js";
import { createPersistence } from "./store/persistence.js";
import { createScheduler } from "./scheduling/index.js";
import { ConversationManager, greeting } from "./agent/conversation.js";
import { BillingService } from "./billing/stripe.js";
import { TelephonyService } from "./telephony/index.js";
import { buildIncomingTeXML, handleVoiceFunction } from "./telephony/voice.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const persistence = createPersistence();
const store = new Store(persistence);
const scheduler = createScheduler(store);
const agent = new ConversationManager(store, scheduler);
const billing = new BillingService(store);
const telephony = new TelephonyService(store);

const app = express();

// Stripe webhook needs the raw body for signature verification — register
// before the JSON body parser.
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const result = await billing.handleWebhook(req.body as Buffer, req.header("stripe-signature"));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "webhook_error" });
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- Public info ----

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", features: featureFlags(), telephony: resolvedTelephonyProvider() });
});

app.get("/api/plans", (_req, res) => {
  res.json({
    plans: Object.values(PLANS),
    setupFeeCents: PORTABILITY_SETUP_FEE_CENTS,
  });
});

// ---- Onboarding ----

app.post("/api/onboard", (req: Request, res: Response) => {
  const { name, useCase, locale, agentName, agentGender, planId } = req.body ?? {};
  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name_required" });
    return;
  }
  const business = store.createBusiness({
    name: name.trim(),
    useCase: (isUseCase(useCase) ? useCase : "barbearia"),
    locale: locale === "en" ? "en" : "pt",
    agentName: typeof agentName === "string" ? agentName.trim() : "Sofia",
    agentGender: isGender(agentGender) ? agentGender : "feminino",
    planId: isPlan(planId) ? planId : "base",
  });
  res.json({ slug: business.slug, id: business.id });
});

// ---- Backoffice data + config ----

function requireBusiness(req: Request, res: Response): Business | null {
  const business = store.getBusinessBySlug(req.params.slug);
  if (!business) {
    res.status(404).json({ error: "business_not_found" });
    return null;
  }
  return business;
}

function publicBusiness(business: Business) {
  return {
    ...business,
    calApiKey: business.calApiKey ? "set" : null,
    plan: PLANS[business.subscription.planId],
  };
}

app.get("/api/business/:slug", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  res.json({
    business: publicBusiness(business),
    bookings: store.listBookings(business.id),
    features: featureFlags(),
    telephonyProvider: telephony.providerName,
  });
});

app.put("/api/business/:slug", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const { agentName, agentGender, locale, hours, services, resources, calApiKey } = req.body ?? {};
  if (typeof agentName === "string") business.agentName = agentName;
  if (isGender(agentGender)) business.agentGender = agentGender;
  if (locale === "pt" || locale === "en") business.locale = locale;
  if (Array.isArray(hours) && hours.length === 7) business.hours = hours as WeeklyHours;
  if (Array.isArray(services)) business.services = services;
  if (Array.isArray(resources)) business.resources = resources;
  if (typeof calApiKey === "string") business.calApiKey = calApiKey.trim() || null;
  store.saveBusiness(business);
  res.json({ business: publicBusiness(business) });
});

app.post("/api/business/:slug/resource/:rid/toggle", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const resource = business.resources.find((r) => r.id === req.params.rid);
  if (!resource) {
    res.status(404).json({ error: "resource_not_found" });
    return;
  }
  resource.available = !resource.available;
  store.saveBusiness(business);
  res.json({ resource });
});

app.post("/api/business/:slug/number", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const type = req.body?.type === "geographic" ? "geographic" : "mobile";
  const result = await telephony.provisionForBusiness(business, type);
  if (!result.ok) {
    res.status(502).json(result);
    return;
  }
  res.json({ number: business.number });
});

// ---- Billing ----

app.post("/api/business/:slug/checkout", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const planId: PlanId = isPlan(req.body?.planId) ? req.body.planId : business.subscription.planId;
  const result = await billing.createCheckoutSession(business, planId);
  res.json(result);
});

app.post("/api/business/:slug/portal", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const result = await billing.createPortalSession(business);
  res.json(result);
});

// ---- Conversational agent (web + voice demo) ----

app.get("/api/business/:slug/greeting", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  res.json({ reply: greeting(business) });
});

app.post("/api/business/:slug/message", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const { sessionId, text } = req.body ?? {};
  if (typeof sessionId !== "string" || typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ error: "sessionId_and_text_required" });
    return;
  }
  const reply = await agent.handle(business, sessionId, text);
  res.json(reply);
});

app.get("/api/business/:slug/bookings", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  res.json(store.listBookings(business.id));
});

app.post("/api/business/:slug/reset", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  if (typeof req.body?.sessionId === "string") {
    agent.reset(req.body.sessionId);
  }
  res.json({ status: "reset" });
});

// ---- Voice (telephony) ----

app.post("/voice/incoming/:slug", (req, res) => {
  const business = store.getBusinessBySlug(req.params.slug);
  if (!business) {
    res.status(404).type("text/xml").send('<?xml version="1.0"?><Response/>');
    return;
  }
  res.type("text/xml").send(buildIncomingTeXML(business));
});

app.post("/voice/functions/:slug", async (req, res) => {
  const business = store.getBusinessBySlug(req.params.slug);
  if (!business) {
    res.status(404).json({ error: "business_not_found" });
    return;
  }
  if (config.voice.functionWebhookSecret) {
    if (req.header("x-voice-secret") !== config.voice.functionWebhookSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }
  const result = await handleVoiceFunction(business, store, scheduler, {
    name: String(req.body?.name ?? ""),
    arguments: (req.body?.arguments as Record<string, unknown>) ?? {},
  });
  res.json(result);
});

// ---- Pages ----

app.use(express.static(publicDir));

app.get("/app/:slug", (_req, res) => res.sendFile(join(publicDir, "admin.html")));
app.get("/demo/:slug", (_req, res) => res.sendFile(join(publicDir, "demo.html")));
app.get(["/privacidade", "/privacy"], (_req, res) => res.sendFile(join(publicDir, "privacidade.html")));
app.get(["/termos", "/terms"], (_req, res) => res.sendFile(join(publicDir, "termos.html")));
app.get(["/dpa", "/data-processing"], (_req, res) => res.sendFile(join(publicDir, "dpa.html")));

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  await store.init();
  seedDemoBusiness(store);
  app.listen(config.port, () => {
    console.log(`voice-agents listening on ${config.publicBaseUrl}`);
    console.log(
      `persistence=${persistence.kind}, features=${JSON.stringify(featureFlags())}, telephony=${resolvedTelephonyProvider()}`,
    );
  });
}

function isUseCase(value: unknown): value is UseCase {
  return value === "barbearia" || value === "salao" || value === "clinica" || value === "restaurante" || value === "outro";
}
function isGender(value: unknown): value is AgentGender {
  return value === "feminino" || value === "masculino" || value === "neutro";
}
function isPlan(value: unknown): value is PlanId {
  return value === "base" || value === "pro" || value === "studio";
}

function seedDemoBusiness(store: Store): void {
  if (store.listBusinesses().length > 0) {
    return;
  }
  const demo = store.createBusiness({
    name: "Barbearia Lisboa",
    useCase: "barbearia",
    locale: "pt",
    agentName: "Sofia",
    agentGender: "feminino",
    planId: "pro",
  });
  demo.resources = [
    { id: demo.resources[0].id, name: "João", transferNumber: "+351910000000", available: true, calUserId: null },
    { id: randomUUID(), name: "Miguel", transferNumber: "+351920000000", available: false, calUserId: null },
  ];
  demo.number = { e164: "+351921234567", provider: "mock", type: "mobile", status: "active", monthlyCostCents: 900 };
  demo.subscription.status = "trialing";
  store.saveBusiness(demo);
}

export { app, store, agent, billing, telephony };
