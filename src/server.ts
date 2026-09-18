import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import express from "express";
import type { Request, Response } from "express";
import { config, featureFlags, resolvedTelephonyProvider } from "./config.js";
import { sendOnboardConfirmEmail } from "./email/mailer.js";
import { PLANS, PORTABILITY_SETUP_FEE_CENTS } from "./domain/plans.js";
import { DEFAULT_AGENT_NAME } from "./domain/agent.js";
import type { AgentGender, Business, PlanId, Resource, UseCase, WeeklyHours } from "./domain/types.js";
import { Store } from "./store/store.js";
import { createPersistence } from "./store/persistence.js";
import { createScheduler } from "./scheduling/index.js";
import {
  buildGoogleAuthUrl,
  completeGoogleOAuth,
  disconnectGoogleCalendar,
  googleOAuthConfigured,
  publicPersonAccount,
  syncGoogleCalendar,
} from "./scheduling/googleCalendar.js";
import { ConversationManager, greeting } from "./agent/conversation.js";
import { BillingService } from "./billing/stripe.js";
import { ensureUsagePeriod } from "./billing/usage.js";
import { assignResourcesToService, defaultResourceRole } from "./domain/assignment.js";
import { rewriteAgentScript } from "./domain/rewriteScript.js";
import { completeInboundCall, parseVoiceCallFields, startInboundCall } from "./telephony/callLog.js";
import {
  demoDidUsageBusiness,
  demoDidUsageView,
  ingestTelnyxWebhook,
  overlaySharedNumber,
  overlaySharedUsage,
  syncDemoDidUsage,
  usesSharedDemoDid,
} from "./telephony/telnyxCdr.js";
import { TelephonyService } from "./telephony/index.js";
import { buildIncomingTeXML, handleDemoInbound, handleDemoPickerFunction, handleVoiceFunction } from "./telephony/voice.js";
import {
  acceptLiveIncomingCall,
  buildLiveSessionConfig,
  createLiveWebRtcSession,
  parseLiveIncomingWebhook,
  parseToolArguments,
  sessionForDemoDidInbound,
} from "./telephony/gptLive.js";
import {
  DEMO_DID_DISPLAY,
  DEMO_DID_DISPLAY_INTL,
  DEMO_DID_E164,
  DEMO_DID_NSN,
  DEMO_DID_TEL,
  LIVE_MEDIA_PATH,
  bindDemoCaller,
  demoSlugForUseCase,
  isDemoDid,
  isDemoPickerSlug,
  listDemoOptions,
} from "./telephony/demoDid.js";
import { attachLiveMedia } from "./telephony/liveMedia.js";
import { consumeSessionQuota } from "./telephony/sessionLimit.js";
import { MARKETING_DEMO_SLUG, ensureDemoBusinesses } from "./store/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const webDist = join(__dirname, "..", "web", "dist");

const persistence = createPersistence();
const store = new Store(persistence);
const scheduler = createScheduler(store);
const agent = new ConversationManager(store, scheduler);
const billing = new BillingService(store);
const telephony = new TelephonyService(store);

const app = express();

app.set("trust proxy", true);

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

app.post("/webhooks/telnyx", async (req, res) => {
  try {
    const result = await ingestTelnyxWebhook(store, billing, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "webhook_error" });
  }
});

// ---- Public info ----

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", features: featureFlags(), telephony: resolvedTelephonyProvider() });
});

app.get("/api/demo", (req, res) => {
  const requested = typeof req.query.useCase === "string" && isUseCase(req.query.useCase) ? req.query.useCase : "clinica";
  const slug = demoSlugForUseCase(requested);
  const business = store.getBusinessBySlug(slug);
  res.json({
    did: {
      e164: DEMO_DID_E164,
      nsn: DEMO_DID_NSN,
      display: DEMO_DID_DISPLAY,
      displayIntl: DEMO_DID_DISPLAY_INTL,
      tel: DEMO_DID_TEL,
    },
    options: listDemoOptions(),
    defaultUseCase: "clinica",
    slug,
    name: business?.name ?? "Clínica Central",
    agentName: business?.agentName ?? DEFAULT_AGENT_NAME,
    features: featureFlags(),
  });
});

app.post("/api/demo/bind", (req, res) => {
  const useCase = req.body?.useCase;
  const caller = typeof req.body?.callerE164 === "string" ? req.body.callerE164.trim() : "";
  if (!isUseCase(useCase) || useCase === "outro") {
    res.status(400).json({ error: "use_case_required" });
    return;
  }
  if (caller) {
    bindDemoCaller({ callerE164: caller, useCase, now: Date.now(), ttlMs: 30 * 60 * 1000 });
  }
  res.json({
    slug: demoSlugForUseCase(useCase),
    did: { e164: DEMO_DID_E164, display: DEMO_DID_DISPLAY },
    bound: Boolean(caller),
  });
});

app.get("/api/plans", (_req, res) => {
  res.json({
    plans: Object.values(PLANS),
    setupFeeCents: PORTABILITY_SETUP_FEE_CENTS,
    trial: { days: 14, minutes: 45 },
  });
});

// ---- Onboarding ----

app.post("/api/onboard", (req: Request, res: Response) => {
  const { name, useCase, locale, agentName, agentGender, planId, contactEmail, contactPhone, numberPreference } =
    req.body ?? {};
  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name_required" });
    return;
  }
  const business = store.createBusiness({
    name: name.trim(),
    useCase: isUseCase(useCase) ? useCase : "barbearia",
    locale: locale === "en" ? "en" : "pt",
    agentName: typeof agentName === "string" && agentName.trim() ? agentName.trim() : DEFAULT_AGENT_NAME,
    agentGender: isGender(agentGender) ? agentGender : "neutro",
    planId: isPlan(planId) ? planId : "base",
    contactEmail: typeof contactEmail === "string" ? contactEmail.trim() || null : null,
    contactPhone: typeof contactPhone === "string" ? contactPhone.trim() || null : null,
    numberPreference: numberPreference === "port" ? "port" : "new",
    status: "pending",
  });
  res.json({ slug: business.slug, id: business.id });
  void sendOnboardConfirmEmail({
    businessId: business.id,
    businessName: business.name,
    agentName: business.agentName,
    slug: business.slug,
    to: business.contactEmail,
  }).catch((err: unknown) => {
    console.error("[mail] onboard confirmation threw:", err instanceof Error ? err.message : err);
  });
});

app.post("/api/business/:slug/activate", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  if (!featureFlags().demoActivate) {
    res.status(403).json({
      error: "activation_locked",
      message: "A conta fica ativa depois da aprovação do número.",
    });
    return;
  }
  if (!business.number) {
    await telephony.provisionForBusiness(business, "mobile");
  }
  if (resolvedTelephonyProvider() === "telnyx" && business.number && business.number.status === "active") {
    business.number = { ...business.number, status: "provisioning" };
  }
  business.status = "active";
  store.saveBusiness(business);
  res.json({ business: publicBusiness(business) });
});

app.post("/api/business/:slug/number/approve", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const secret = config.voice.opsApproveSecret;
  if (secret && req.header("x-ops-approve") !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  telephony.markNumberApproved(business);
  res.json({ number: business.number });
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

app.get("/api/business/:slug", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  try {
    await syncDemoDidUsage(store, billing);
  } catch (err) {
    console.error("[telnyx-cdr] sync failed:", err instanceof Error ? err.message : err);
  }
  const owner = demoDidUsageBusiness(store, business);
  const before = business.subscription.currentPeriodStart;
  ensureUsagePeriod(business.subscription);
  if (owner.id !== business.id) {
    ensureUsagePeriod(owner.subscription);
  }
  if (business.subscription.currentPeriodStart !== before) {
    store.saveBusiness(business);
  }
  const shared = usesSharedDemoDid(business);
  const subscription = shared ? overlaySharedUsage(business, owner) : business.subscription;
  const number = shared ? overlaySharedNumber(business) : business.number;
  const usage = demoDidUsageView(business);
  const account = store.getOwnerAccount(business.id);
  const pushedIds = new Set(
    store.listBookings(business.id).map((booking) => booking.googleEventId).filter(Boolean),
  );
  const googleEvents = (account?.google?.overlayEvents ?? []).filter(
    (event) => !pushedIds.has(event.googleEventId),
  );
  res.json({
    business: publicBusiness({ ...business, subscription, number }),
    bookings: store.listBookings(business.id),
    calls: store.listCalls(owner.id),
    account: account ? publicPersonAccount(account) : null,
    googleEvents,
    features: featureFlags(),
    telephonyProvider: telephony.providerName,
    usageSource: shared
      ? { kind: "telnyx_demo_did", e164: usage.e164, display: usage.display, nsn: DEMO_DID_NSN }
      : { kind: "tenant", e164: business.number?.e164 ?? null, display: business.number?.e164 ?? null },
  });
});

app.put("/api/business/:slug", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const { agentName, agentGender, locale, hours, services, resources, calApiKey, agentScript, agentKnowledge } =
    req.body ?? {};
  if (typeof agentName === "string") business.agentName = agentName;
  if (isGender(agentGender)) business.agentGender = agentGender;
  if (locale === "pt" || locale === "en") business.locale = locale;
  if (Array.isArray(hours) && hours.length === 7) business.hours = hours as WeeklyHours;
  if (Array.isArray(services)) business.services = services;
  if (Array.isArray(resources)) business.resources = resources;
  if (typeof calApiKey === "string") business.calApiKey = calApiKey.trim() || null;
  if (typeof agentScript === "string") business.agentScript = agentScript;
  if (typeof agentKnowledge === "string") business.agentKnowledge = agentKnowledge;
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

app.post("/api/business/:slug/resources", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name_required" });
    return;
  }
  const resource: Resource = {
    id: randomUUID(),
    name,
    role: typeof req.body?.role === "string" && req.body.role.trim() ? req.body.role.trim() : defaultResourceRole(),
    serviceIds: Array.isArray(req.body?.serviceIds)
      ? req.body.serviceIds.filter((id: unknown) => typeof id === "string")
      : [],
    hours: Array.isArray(req.body?.hours) && req.body.hours.length === 7 ? req.body.hours : null,
    transferNumber: typeof req.body?.transferNumber === "string" ? req.body.transferNumber.trim() || null : null,
    available: req.body?.available !== false,
    calUserId: null,
  };
  business.resources.push(resource);
  store.saveBusiness(business);
  res.json({ resource });
});

app.put("/api/business/:slug/resources/:rid", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const resource = business.resources.find((row) => row.id === req.params.rid);
  if (!resource) {
    res.status(404).json({ error: "resource_not_found" });
    return;
  }
  if (typeof req.body?.name === "string" && req.body.name.trim()) resource.name = req.body.name.trim();
  if (typeof req.body?.role === "string") resource.role = req.body.role.trim() || defaultResourceRole();
  if (Array.isArray(req.body?.serviceIds)) {
    resource.serviceIds = req.body.serviceIds.filter((id: unknown) => typeof id === "string");
  }
  if (req.body?.hours === null) resource.hours = null;
  else if (Array.isArray(req.body?.hours) && req.body.hours.length === 7) resource.hours = req.body.hours;
  if (typeof req.body?.transferNumber === "string") resource.transferNumber = req.body.transferNumber.trim() || null;
  if (typeof req.body?.available === "boolean") resource.available = req.body.available;
  store.saveBusiness(business);
  res.json({ resource });
});

app.post("/api/business/:slug/services", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "name_required" });
    return;
  }
  const durationMinutes = Number(req.body?.durationMinutes);
  const service = {
    id: randomUUID(),
    name,
    durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30,
    priceCents:
      req.body?.priceCents == null || req.body.priceCents === ""
        ? null
        : Math.round(Number(req.body.priceCents)),
    calEventTypeId: null,
  };
  business.services.push(service);
  if (Array.isArray(req.body?.resourceIds)) {
    business.resources = assignResourcesToService(
      business.resources,
      service.id,
      req.body.resourceIds.filter((id: unknown) => typeof id === "string"),
    );
  }
  store.saveBusiness(business);
  res.json({ service, resources: business.resources });
});

app.put("/api/business/:slug/services/:sid", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const service = business.services.find((row) => row.id === req.params.sid);
  if (!service) {
    res.status(404).json({ error: "service_not_found" });
    return;
  }
  if (typeof req.body?.name === "string" && req.body.name.trim()) service.name = req.body.name.trim();
  if (req.body?.durationMinutes != null) {
    const durationMinutes = Number(req.body.durationMinutes);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) service.durationMinutes = durationMinutes;
  }
  if (req.body?.priceCents !== undefined) {
    service.priceCents =
      req.body.priceCents == null || req.body.priceCents === ""
        ? null
        : Math.round(Number(req.body.priceCents));
  }
  if (Array.isArray(req.body?.resourceIds)) {
    business.resources = assignResourcesToService(
      business.resources,
      service.id,
      req.body.resourceIds.filter((id: unknown) => typeof id === "string"),
    );
  }
  store.saveBusiness(business);
  res.json({ service, resources: business.resources });
});

app.delete("/api/business/:slug/services/:sid", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const index = business.services.findIndex((row) => row.id === req.params.sid);
  if (index === -1) {
    res.status(404).json({ error: "service_not_found" });
    return;
  }
  const [removed] = business.services.splice(index, 1);
  business.resources = business.resources.map((resource) => ({
    ...resource,
    serviceIds: resource.serviceIds.filter((id) => id !== removed.id),
  }));
  store.saveBusiness(business);
  res.json({ ok: true, resources: business.resources });
});

app.delete("/api/business/:slug/resources/:rid", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  if (business.resources.length <= 1) {
    res.status(409).json({ error: "last_resource" });
    return;
  }
  const index = business.resources.findIndex((row) => row.id === req.params.rid);
  if (index === -1) {
    res.status(404).json({ error: "resource_not_found" });
    return;
  }
  business.resources.splice(index, 1);
  store.saveBusiness(business);
  res.json({ ok: true });
});

app.post("/api/business/:slug/bookings", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const service = business.services.find((row) => row.id === req.body?.serviceId);
  if (!service) {
    res.status(400).json({ error: "service_required" });
    return;
  }
  const start = new Date(String(req.body?.start ?? ""));
  const result = await scheduler.book({
    business,
    service,
    start,
    resourceId: typeof req.body?.resourceId === "string" ? req.body.resourceId : null,
    customerName: typeof req.body?.customerName === "string" ? req.body.customerName.trim() || null : null,
    customerPhone: typeof req.body?.customerPhone === "string" ? req.body.customerPhone.trim() || null : null,
    source: "backoffice",
  });
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }
  res.json({ booking: result.booking });
});

app.put("/api/business/:slug/bookings/:id", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.resourceId === "string") patch.resourceId = req.body.resourceId;
  if (typeof req.body?.customerName === "string") patch.customerName = req.body.customerName.trim() || null;
  if (typeof req.body?.customerPhone === "string") patch.customerPhone = req.body.customerPhone.trim() || null;
  const booking = store.updateBooking(business.id, req.params.id, patch);
  if (!booking) {
    res.status(404).json({ error: "booking_not_found" });
    return;
  }
  res.json({ booking });
});

app.post("/api/business/:slug/assistant/rewrite", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const draft = typeof req.body?.script === "string" ? req.body.script : business.agentScript;
  const knowledge = typeof req.body?.knowledge === "string" ? req.body.knowledge : business.agentKnowledge;
  const result = await rewriteAgentScript({ draft, knowledge, locale: business.locale });
  res.json(result);
});

// ---- Google Calendar (Agenda connect + sync). Tokens persist on PersonAccount. ----

app.get("/api/business/:slug/google/connect", (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  if (!googleOAuthConfigured()) {
    res.status(503).json({
      error: "google_not_configured",
      message: "Google Calendar ainda não está configurado (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
    });
    return;
  }
  const account = store.getOwnerAccount(business.id);
  if (!account) {
    res.status(500).json({ error: "account_missing" });
    return;
  }
  const state = store.createOAuthState(business.id, account.id);
  res.json({ url: buildGoogleAuthUrl(state.id) });
});

app.get("/api/google/oauth/callback", async (req, res) => {
  const slugHint = typeof req.query.slug === "string" ? req.query.slug : "";
  if (typeof req.query.error === "string" && req.query.error) {
    res.redirect(`/app/${slugHint}?google=error`);
    return;
  }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!state || !code) {
    res.redirect(slugHint ? `/app/${slugHint}?google=error` : "/?google=error");
    return;
  }
  const result = await completeGoogleOAuth(store, state, code);
  const slug = result.slug || slugHint;
  if (!slug) {
    res.redirect("/?google=error");
    return;
  }
  res.redirect(`/app/${slug}?google=${result.ok ? "connected" : "error"}`);
});

app.post("/api/business/:slug/google/sync", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const result = await syncGoogleCalendar(store, business.id);
  const account = store.getOwnerAccount(business.id);
  res.status(result.ok ? 200 : 409).json({
    ...result,
    account: account ? publicPersonAccount(account) : null,
    googleEvents: account?.google?.overlayEvents ?? [],
  });
});

app.post("/api/business/:slug/google/disconnect", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  await disconnectGoogleCalendar(store, business.id);
  const account = store.getOwnerAccount(business.id);
  res.json({ account: account ? publicPersonAccount(account) : null, googleEvents: [] });
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
  const result = await billing.changePlan(business, planId);
  res.json(result);
});

app.post("/api/business/:slug/portal", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const result = await billing.createPortalSession(business);
  res.json(result);
});

app.post("/api/business/:slug/billing/cancel", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const result = await billing.cancelSubscription(business);
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

// ---- Voice (GPT-Live-1) ----

app.post("/api/business/:slug/realtime/session", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  const sdp = typeof req.body?.sdp === "string" ? req.body.sdp : "";
  if (sdp.trim() && config.voice.openaiApiKey) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!consumeSessionQuota(ip)) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
  }
  const result = await createLiveWebRtcSession({
    business,
    sdp,
    apiKey: config.voice.openaiApiKey,
  });
  res.status(result.status).json(result.body);
});

app.post("/api/business/:slug/realtime/tool", async (req, res) => {
  const business = requireBusiness(req, res);
  if (!business) return;
  try {
    const result = await handleVoiceFunction(business, store, scheduler, {
      name: String(req.body?.name ?? ""),
      arguments: parseToolArguments(req.body?.arguments),
    });
    res.json(result);
  } catch (err) {
    console.error("[realtime/tool]", err instanceof Error ? err.message : err);
    res.json({
      error: "tool_failed",
      instruction:
        business.locale === "en"
          ? "Keep talking. Offer a nearby time and ask if it works."
          : "Continua a falar. Oferece uma hora próxima e pergunta se serve.",
    });
  }
});

async function handleLiveSipIncoming(req: Request, res: Response): Promise<void> {
  const parsed = parseLiveIncomingWebhook(req.body, req.params.id);
  if (!parsed) {
    res.status(400).json({ error: "session_required" });
    return;
  }
  const businesses = listDemoOptions()
    .map((option) => store.getBusinessBySlug(option.slug))
    .filter((business): business is Business => Boolean(business));
  const inbound = sessionForDemoDidInbound(businesses);
  const result = await acceptLiveIncomingCall({
    sessionId: parsed.sessionId,
    session: inbound.session,
    slug: inbound.slug,
    agentName: inbound.agentName,
    apiKey: config.voice.openaiApiKey,
  });
  res.status(result.status).json(result.body);
}

app.post("/voice/openai-live", (req, res) => {
  void handleLiveSipIncoming(req, res);
});

app.post("/v1/live/sessions/:id/accept", (req, res) => {
  void handleLiveSipIncoming(req, res);
});

function demoInboundXml(req: Request): string {
  const to = String(req.body?.To ?? req.body?.to ?? DEMO_DID_E164);
  const from = String(req.body?.From ?? req.body?.from ?? "");
  const digits = String(req.body?.Digits ?? req.body?.digits ?? "");
  const speech = String(req.body?.SpeechResult ?? req.body?.speech ?? "");
  const callSid = String(req.body?.CallSid ?? req.body?.call_sid ?? req.body?.callSid ?? "");
  return handleDemoInbound({
    toE164: to || DEMO_DID_E164,
    fromE164: from || undefined,
    digits: digits.trim() || undefined,
    speech: speech.trim() || undefined,
    callSid: callSid.trim() || undefined,
    now: Date.now(),
    publicBaseUrl: config.publicBaseUrl,
    sipUri: config.voice.openaiLiveSipUri,
  });
}

app.post("/voice/incoming-demo", (req, res) => {
  res.type("text/xml").send(demoInboundXml(req));
});

/** Plain GET is not a Stream handshake — Telnyx upgrades this path over WebSocket. */
app.get(LIVE_MEDIA_PATH, (_req, res) => {
  res.status(426).set("Upgrade", "websocket").type("text/plain").send("Upgrade Required");
});

app.post("/voice/incoming", (req, res) => {
  const fields = parseVoiceCallFields(req.body);
  const to = fields.toE164 ?? String(req.body?.To ?? req.body?.to ?? "");
  if (isDemoDid(to) || to === config.demoDidE164) {
    res.type("text/xml").send(demoInboundXml(req));
    return;
  }
  const business = store.findBusinessByNumber(to);
  if (!business) {
    res.status(404).type("text/xml").send('<?xml version="1.0"?><Response/>');
    return;
  }
  void startInboundCall(store, business, fields);
  res.type("text/xml").send(buildIncomingTeXML(business, config.publicBaseUrl));
});

app.post("/voice/incoming/:slug", (req, res) => {
  const fields = parseVoiceCallFields(req.body);
  const to = fields.toE164 ?? String(req.body?.To ?? req.body?.to ?? "");
  if (isDemoDid(to) || req.params.slug === "demo") {
    res.type("text/xml").send(demoInboundXml(req));
    return;
  }
  const business = store.getBusinessBySlug(req.params.slug) ?? store.findBusinessByNumber(to);
  if (!business) {
    res.status(404).type("text/xml").send('<?xml version="1.0"?><Response/>');
    return;
  }
  void startInboundCall(store, business, {
    ...fields,
    toE164: fields.toE164 ?? (to || business.number?.e164 || undefined),
  });
  res.type("text/xml").send(buildIncomingTeXML(business, config.publicBaseUrl));
});

app.post(["/voice/status", "/voice/status/:slug"], (req, res) => {
  const fields = parseVoiceCallFields(req.body);
  const to = fields.toE164 ?? "";
  const business =
    (req.params.slug ? store.getBusinessBySlug(req.params.slug) : undefined) ??
    (to ? store.findBusinessByNumber(to) : undefined);
  if (business && !isDemoDid(to)) {
    void completeInboundCall(store, billing, business, fields);
  }
  res.type("text/xml").send('<?xml version="1.0"?><Response/>');
});

app.post("/voice/functions/:slug", async (req, res) => {
  if (isDemoPickerSlug(req.params.slug)) {
    if (config.voice.functionWebhookSecret) {
      if (req.header("x-voice-secret") !== config.voice.functionWebhookSecret) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
    }
    const result = await handleDemoPickerFunction({
      store,
      scheduler,
      call: {
        name: String(req.body?.name ?? ""),
        arguments: (req.body?.arguments as Record<string, unknown>) ?? {},
      },
      fromE164: voiceCallerFrom(req.body),
      callSid: voiceCallSid(req.body),
    }).catch((err: unknown) => {
      console.error("[voice/functions/demo]", err instanceof Error ? err.message : err);
      return {
        error: "tool_failed",
        instruction: "Continua a falar. Oferece uma hora próxima e pergunta se serve.",
      };
    });
    res.json(result);
    return;
  }
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
  }).catch((err: unknown) => {
    console.error("[voice/functions]", err instanceof Error ? err.message : err);
    return {
      error: "tool_failed",
      instruction:
        business.locale === "en"
          ? "Keep talking. Offer a nearby time and ask if it works."
          : "Continua a falar. Oferece uma hora próxima e pergunta se serve.",
    };
  });
  res.json(result);
});

// ---- Pages ----

app.get(["/privacidade", "/privacy"], (_req, res) => res.sendFile(join(publicDir, "privacidade.html")));
app.get(["/termos", "/terms"], (_req, res) => res.sendFile(join(publicDir, "termos.html")));
app.get(["/dpa", "/data-processing"], (_req, res) => res.sendFile(join(publicDir, "dpa.html")));

// Prefer the Vite SPA at / so public/index.html cannot hide Nuno's landing.
app.get(["/", "/index.html"], (_req, res, next) => {
  const spa = join(webDist, "index.html");
  if (existsSync(spa)) {
    res.sendFile(spa);
    return;
  }
  next();
});

app.use(express.static(publicDir, { index: false }));

if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: false }));
}

app.get(["/app/:slug", "/demo/:slug"], (req, res, next) => {
  const spa = join(webDist, "index.html");
  if (existsSync(spa)) {
    res.sendFile(spa);
    return;
  }
  if (req.path.startsWith("/app/")) {
    res.sendFile(join(publicDir, "admin.html"));
    return;
  }
  if (req.path.startsWith("/demo/")) {
    res.sendFile(join(publicDir, "demo.html"));
    return;
  }
  next();
});

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  await store.init();
  ensureDemoBusinesses(store);
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        root: join(__dirname, "..", "web"),
        server: { middlewareMode: true, allowedHosts: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn("[dev] Vite middleware unavailable:", err instanceof Error ? err.message : err);
    }
  }
  const server = createServer(app);
  attachLiveMedia(server, {
    openaiApiKey: config.voice.openaiApiKey,
    sessionForSlug: (slug) => {
      if (isDemoPickerSlug(slug)) {
        return sessionForDemoDidInbound(demoPickerBusinesses());
      }
      const business = store.getBusinessBySlug(slug);
      if (!business) {
        return undefined;
      }
      return {
        slug: business.slug,
        agentName: business.agentName || DEFAULT_AGENT_NAME,
        session: buildLiveSessionConfig(business),
      };
    },
    handleTool: async (call, ctx) => {
      if (isDemoPickerSlug(ctx.slug)) {
        return handleDemoPickerFunction({
          store,
          scheduler,
          call,
          fromE164: ctx.fromE164,
          callSid: ctx.callSid,
        });
      }
      const business = store.getBusinessBySlug(ctx.slug);
      if (!business) {
        return { error: "business_not_found", slug: ctx.slug };
      }
      return handleVoiceFunction(business, store, scheduler, call);
    },
  });
  server.listen(config.port, () => {
    console.log(`voice-agents listening on ${config.publicBaseUrl}`);
    console.log(
      `persistence=${persistence.kind}, features=${JSON.stringify(featureFlags())}, telephony=${resolvedTelephonyProvider()}`,
    );
    void syncDemoDidUsage(store, billing).catch((err: unknown) => {
      console.error("[telnyx-cdr] startup sync failed:", err instanceof Error ? err.message : err);
    });
  });
}

function demoPickerBusinesses(): Business[] {
  return listDemoOptions()
    .map((option) => store.getBusinessBySlug(option.slug))
    .filter((business): business is Business => Boolean(business));
}

const USE_CASES: UseCase[] = [
  "barbearia",
  "salao",
  "clinica",
  "restaurante",
  "oficina",
  "imobiliaria",
  "ginasio",
  "outro",
];

function isUseCase(value: unknown): value is UseCase {
  return typeof value === "string" && (USE_CASES as string[]).includes(value);
}
function isGender(value: unknown): value is AgentGender {
  return value === "feminino" || value === "masculino" || value === "neutro";
}
function isPlan(value: unknown): value is PlanId {
  return value === "base" || value === "pro" || value === "studio";
}

function voiceCallerFrom(body: unknown): string | undefined {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const from = rec.From ?? rec.from;
  return typeof from === "string" && from.trim() ? from : undefined;
}

function voiceCallSid(body: unknown): string | undefined {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const sid = rec.CallSid ?? rec.call_sid ?? rec.callSid ?? rec.session_id ?? rec.sessionId;
  return typeof sid === "string" && sid.trim() ? sid.trim() : undefined;
}

export { app, store, agent, billing, telephony, MARKETING_DEMO_SLUG };
