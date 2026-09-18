import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  LIVE_BACKEND_MODEL_DEFAULT,
  LIVE_PICKER_TOOLS,
  LIVE_VOICE_MODEL,
  acceptLiveIncomingCall,
  buildDemoPickerLiveSessionConfig,
  buildLiveSessionConfig,
  createLiveWebRtcSession,
  demoSimulatedConfirmation,
  parseLiveIncomingWebhook,
  parseToolArguments,
  sessionForDemoDidInbound,
} from "../src/telephony/gptLive.js";
import { handleVoiceFunction } from "../src/telephony/voice.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { tempStore } from "./helpers.js";
import { ensureDemoBusinesses, MARKETING_DEMO_SLUG } from "../src/store/seed.js";
import { DEFAULT_AGENT_NAME } from "../src/domain/agent.js";
import { featureFlags } from "../src/config.js";
import { DEMO_PICKER_SLUG } from "../src/telephony/demoDid.js";

describe("gpt-live-1 session config", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses gpt-live-1 and Responses delegation with booking tools", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const session = buildLiveSessionConfig(clinic);
    expect(LIVE_VOICE_MODEL).toBe("gpt-live-1");
    expect(session.model).toBe("gpt-live-1");
    expect(session.instructions).toMatch(/português de Portugal/);
    expect(session.instructions).toMatch(/Nunca dês conselhos médicos/);
    expect(String(session.instructions)).toMatch(new RegExp(DEFAULT_AGENT_NAME));
    expect(String(session.instructions)).not.toMatch(/Sofia/);
    expect(session.delegation).toEqual(
      expect.objectContaining({
        type: "responses",
        responses: expect.objectContaining({
          model: LIVE_BACKEND_MODEL_DEFAULT,
          tool_choice: "auto",
        }),
      }),
    );
    const names = (session.delegation as { responses: { tools: Array<{ name: string }> } }).responses.tools.map(
      (t) => t.name,
    );
    expect(names.sort()).toEqual(
      ["book_appointment", "cancel_appointment", "get_slots", "list_bookings", "list_services"].sort(),
    );
    expect(session.type).toBe("live");
  });

  it("each picker vertical gets that tenant's live agent, not a demo script", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const oficina = store.getBusinessBySlug("oficina-norte")!;
    const oficinaSession = buildLiveSessionConfig(oficina);
    expect(String(oficinaSession.instructions)).toMatch(/Oficina Norte/);
    expect(String(oficinaSession.instructions)).toMatch(/Diagnóstico/);
    expect(String(oficinaSession.instructions)).toMatch(/balcão da oficina/);
    expect(String(oficinaSession.instructions)).not.toMatch(/isto é uma demonstração|sou uma demo/i);
    expect(String(oficinaSession.instructions)).not.toMatch(/conselhos médicos/);

    const restaurante = store.getBusinessBySlug("restaurante-baixa")!;
    expect(String(buildLiveSessionConfig(restaurante).instructions)).toMatch(/reservas de mesa/);
    expect(String(buildLiveSessionConfig(restaurante).instructions)).toMatch(/Restaurante Baixa/);

    const imobiliaria = store.getBusinessBySlug("imobiliaria-baixa")!;
    expect(String(buildLiveSessionConfig(imobiliaria).instructions)).toMatch(/visitas e avaliações/);
  });

  it("demo DID picker is one gpt-live-1 session that already holds every receptionist script", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const businesses = ["clinica-central", "barbearia-lisboa", "restaurante-baixa", "oficina-norte", "imobiliaria-baixa"].map(
      (slug) => store.getBusinessBySlug(slug)!,
    );
    const inbound = sessionForDemoDidInbound(businesses);
    expect(inbound.slug).toBe(DEMO_PICKER_SLUG);
    expect(inbound.agentName).toBe(DEFAULT_AGENT_NAME);
    const session = inbound.session;
    expect(session.model).toBe("gpt-live-1");
    const instructions = String(session.instructions);
    expect(instructions).toMatch(/português de Portugal/);
    expect(instructions).toMatch(/telemóvel/);
    expect(instructions).toMatch(/ecrã/);
    expect(instructions).toMatch(/Apresenta-te como Atende/);
    expect(instructions).toMatch(/1 clínica, 2 barbearia, 3 restaurante, 4 oficina, 5 imobiliária/);
    expect(instructions).not.toMatch(/select_demo_vertical/);
    expect(instructions).toMatch(/Não chames nenhuma ferramenta para escolher/);
    expect(instructions).toMatch(/Não digas «perfeito»/);
    expect(instructions).toMatch(/as regras de cada opção já estão/i);
    expect(instructions).toMatch(/Clínica Central/);
    expect(instructions).toMatch(/Nunca dês conselhos médicos/);
    expect(instructions).toMatch(/Barbearia Lisboa/);
    expect(instructions).toMatch(/corte, barba e corte infantil/);
    expect(instructions).toMatch(/Restaurante Baixa/);
    expect(instructions).toMatch(/reservas de mesa/);
    expect(instructions).toMatch(/Oficina Norte/);
    expect(instructions).toMatch(/Diagnóstico/);
    expect(instructions).toMatch(/diagnóstico mecânico/);
    expect(instructions).toMatch(/Imobiliária Baixa/);
    expect(instructions).toMatch(/visitas e avaliações/);
    expect(instructions).toMatch(/Nunca digas «vou confirmar»/);
    expect(instructions).toMatch(/Disponibilidade e marcações são simuladas/);
    expect(instructions).not.toMatch(/Sofia/);
    expect(instructions).not.toMatch(/celular(?!,)/);
    for (const business of businesses) {
      const spoken = demoSimulatedConfirmation(business);
      expect(spoken).toMatch(/Está marcada|Está marcado/);
      expect(spoken).toMatch(/Envio confirmação por SMS/);
      expect(instructions).toContain(spoken);
    }
    const backend = String(
      session.delegation && (session.delegation as { responses?: { instructions?: string } }).responses?.instructions,
    );
    expect(backend).not.toMatch(/select_demo_vertical/);
    expect(backend).toMatch(/Do not call a tool when the caller picks a vertical/);
    expect(backend).toMatch(/Never call get_slots/);
    expect(backend).toMatch(/oficina-norte/);
    const names = (session.delegation as { responses: { tools: Array<{ name: string }>; tool_choice?: string } }).responses
      .tools;
    expect(names).toEqual([]);
    expect(LIVE_PICKER_TOOLS).toEqual([]);
    expect(
      (session.delegation as { responses: { tool_choice?: string } }).responses.tool_choice,
    ).toBe("none");
    expect(buildDemoPickerLiveSessionConfig(businesses).type).toBe("live");
  });

  it("SIP accept uses the chosen vertical and never leaks the API key", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const oficina = store.getBusinessBySlug("oficina-norte")!;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/v1/live/sessions/sess_oficina/accept");
      const body = JSON.parse(String(init?.body)) as { session: { instructions: string; model: string } };
      expect(body.session.model).toBe("gpt-live-1");
      expect(body.session.instructions).toMatch(/Oficina Norte/);
      return new Response(null, { status: 200 });
    });
    const result = await acceptLiveIncomingCall({
      sessionId: "sess_oficina",
      business: oficina,
      apiKey: "sk-live-secret",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe(200);
    expect(result.body.slug).toBe("oficina-norte");
    expect(JSON.stringify(result.body)).not.toContain("sk-live-secret");

    const parsed = parseLiveIncomingWebhook({
      type: "live.transport.incoming",
      data: {
        session_id: "sess_oficina",
        sip_headers: [{ name: "From", value: "sip:+351910000066@sip.example.com" }],
      },
    });
    expect(parsed?.sessionId).toBe("sess_oficina");
  });

  it("SIP accept for the demo DID uses the picker session, not a prior vertical", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const businesses = ["clinica-central", "barbearia-lisboa", "restaurante-baixa", "oficina-norte", "imobiliaria-baixa"].map(
      (slug) => store.getBusinessBySlug(slug)!,
    );
    const inbound = sessionForDemoDidInbound(businesses);
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/v1/live/sessions/sess_demo/accept");
      const body = JSON.parse(String(init?.body)) as { session: { instructions: string; model: string } };
      expect(body.session.model).toBe("gpt-live-1");
      expect(body.session.instructions).toMatch(/Apresenta-te como Atende/);
      expect(body.session.instructions).toMatch(/1 clínica/);
      expect(body.session.instructions).toMatch(/Oficina Norte/);
      return new Response(null, { status: 200 });
    });
    const result = await acceptLiveIncomingCall({
      sessionId: "sess_demo",
      session: inbound.session,
      slug: inbound.slug,
      agentName: inbound.agentName,
      apiKey: "sk-live-secret",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe(200);
    expect(result.body.slug).toBe(DEMO_PICKER_SLUG);
    expect(JSON.stringify(result.body)).not.toContain("sk-live-secret");
  });

  it("posts SDP to /v1/live/sessions and never returns the API key", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.openai.com/v1/live/sessions");
      const body = JSON.parse(String(init?.body));
      expect(body.session.model).toBe("gpt-live-1");
      expect(body.transport.type).toBe("webrtc");
      expect(body.transport.sdp).toContain("v=0");
      return new Response(
        JSON.stringify({
          session: { id: "live_test_1" },
          transport: { type: "webrtc", sdp: "v=0\r\nanswer" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const result = await createLiveWebRtcSession({
      business: clinic,
      sdp: "v=0\r\noffer",
      apiKey: "sk-test-should-not-leak",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.status).toBe(201);
    expect(JSON.stringify(result.body)).not.toContain("sk-test");
    expect(result.body.sessionId).toBe("live_test_1");
    expect(result.body.sdp).toContain("answer");
  });

  it("returns 503 when OpenAI is not configured", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const result = await createLiveWebRtcSession({
      business: clinic,
      sdp: "v=0",
      apiKey: undefined,
    });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("gpt_live_not_configured");
  });

  it("feature flag gptLive follows OPENAI_API_KEY", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(featureFlags().gptLive).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(featureFlags().gptLive).toBe(true);
  });
});

describe("realtime HTTP session + tool wiring", () => {
  it("session requires sdp; missing key is 503; tools still book", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const business = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const scheduler = new InMemoryScheduler(store, () => new Date(2026, 7, 26, 9, 0, 0));
    const app = express();
    app.use(express.json());
    app.post("/api/business/:slug/realtime/session", async (req, res) => {
      const sdp = typeof req.body?.sdp === "string" ? req.body.sdp : "";
      const result = await createLiveWebRtcSession({ business, sdp, apiKey: undefined });
      res.status(result.status).json(result.body);
    });
    app.post("/api/business/:slug/realtime/tool", async (req, res) => {
      const result = await handleVoiceFunction(
        business,
        store,
        scheduler,
        {
          name: String(req.body?.name ?? ""),
          arguments: parseToolArguments(req.body?.arguments),
        },
        new Date(2026, 7, 26, 9, 0, 0),
      );
      res.json(result);
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const missingSdp = await fetch(`${base}/api/business/${business.slug}/realtime/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(missingSdp.status).toBe(400);
      expect(((await missingSdp.json()) as { error: string }).error).toBe("sdp_required");

      const missingKey = await fetch(`${base}/api/business/${business.slug}/realtime/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: "v=0" }),
      });
      expect(missingKey.status).toBe(503);
      expect(((await missingKey.json()) as { error: string }).error).toBe("gpt_live_not_configured");

      const services = await fetch(`${base}/api/business/${business.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "list_services", arguments: {} }),
      });
      const listed = (await services.json()) as { services: { name: string }[] };
      expect(listed.services.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
