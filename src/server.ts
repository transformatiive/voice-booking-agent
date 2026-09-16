import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import express from "express";
import type { Request, Response } from "express";
import { config, featureFlags, resolvedTelephonyProvider } from "./config.js";
import { PLANS, PORTABILITY_SETUP_FEE_CENTS } from "./domain/plans.js";
import { DEFAULT_AGENT_NAME } from "./domain/agent.js";
import type { AgentGender, Business, PlanId, UseCase, WeeklyHours } from "./domain/types.js";
import { Store } from "./store/store.js";
import { createPersistence } from "./store/persistence.js";
import { createScheduler } from "./scheduling/index.js";
import { ConversationManager, greeting } from "./agent/conversation.js";
import { BillingService } from "./billing/stripe.js";
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
import { CONTENT_HUB_PATH } from "./content/articles.js";
import { buildSitemapXml, robotsTxt } from "./content/sitemap.js";

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
  const to = String(req.body?.To ?? req.body?.to ?? "");
  if (isDemoDid(to) || to === config.demoDidE164) {
    res.type("text/xml").send(demoInboundXml(req));
    return;
  }
  res.status(404).type("text/xml").send('<?xml version="1.0"?><Response/>');
});

app.post("/voice/incoming/:slug", (req, res) => {
  const to = String(req.body?.To ?? req.body?.to ?? "");
  if (isDemoDid(to) || req.params.slug === "demo") {
    res.type("text/xml").send(demoInboundXml(req));
    return;
  }
  const business = store.getBusinessBySlug(req.params.slug);
  if (!business) {
    res.status(404).type("text/xml").send('<?xml version="1.0"?><Response/>');
    return;
  }
  res.type("text/xml").send(buildIncomingTeXML(business));
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
app.get("/sitemap.xml", (_req, res) => {
  res.type("application/xml").send(buildSitemapXml(config.publicBaseUrl));
});
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(robotsTxt(config.publicBaseUrl));
});

app.use(express.static(publicDir, { index: false }));
if (existsSync(webDist)) {
  app.use(express.static(webDist));
}

app.get(["/", "/app/:slug", "/demo/:slug", CONTENT_HUB_PATH, `${CONTENT_HUB_PATH}/:slug`], (req, res, next) => {
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
