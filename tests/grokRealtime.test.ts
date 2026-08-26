import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { handleVoiceFunction } from "../src/telephony/voice.js";
import {
  GROK_CLIENT_SECRETS_URL,
  GROK_REALTIME_WS_URL,
  GROK_VOICE_ID,
  GROK_VOICE_MODEL,
  GROK_VOICE_TOOLS,
  buildGrokInstructions,
  extractClientSecret,
  handleRealtimeSessionRequest,
  mintRealtimeClientSecret,
  parseToolArguments,
} from "../src/telephony/grokRealtime.js";
import { tempStore } from "./helpers.js";
import { featureFlags } from "../src/config.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0);
const FAKE_KEY = "xai-test-key-should-never-leak";

function makeBusiness() {
  const store = tempStore();
  const business = store.createBusiness({
    name: "Barbearia Teste",
    useCase: "barbearia",
    locale: "pt",
    agentName: "Sofia",
    agentGender: "feminino",
    planId: "base",
  });
  return { store, business };
}

async function listen(app: express.Express): Promise<{ base: string; close: () => Promise<void> }> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe("grok realtime session", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("extracts the client secret from several payload shapes", () => {
    expect(extractClientSecret({ value: "tok-a", expires_at: 1 })).toBe("tok-a");
    expect(extractClientSecret({ token: "tok-b" })).toBe("tok-b");
    expect(extractClientSecret({ client_secret: { value: "tok-c" } })).toBe("tok-c");
    expect(extractClientSecret({})).toBeNull();
  });

  it("parses tool arguments from objects or JSON strings", () => {
    expect(parseToolArguments({ service: "Barba" })).toEqual({ service: "Barba" });
    expect(parseToolArguments('{"service":"Barba"}')).toEqual({ service: "Barba" });
    expect(parseToolArguments("not-json")).toEqual({});
  });

  it("pins Live 2, ara, PT-PT instructions, and booking tools", () => {
    const { business } = makeBusiness();
    const text = buildGrokInstructions(business);
    expect(text).toContain("português de Portugal");
    expect(text).toContain("Barbearia Teste");
    expect(text).toMatch(/inventes horários/i);
    expect(GROK_VOICE_MODEL).toBe("grok-voice-think-fast-2.0");
    expect(GROK_VOICE_ID).toBe("ara");
    expect(GROK_VOICE_TOOLS.map((t) => t.name).sort()).toEqual(
      ["book_appointment", "cancel_appointment", "get_slots", "list_bookings", "list_services"].sort(),
    );
  });

  it("returns 503 in Portuguese when the API key is missing", async () => {
    const { business } = makeBusiness();
    const result = await handleRealtimeSessionRequest({ business, apiKey: undefined });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("grok_voice_not_configured");
    expect(String(result.body.message)).toMatch(/voz Grok não está configurada/i);
    expect(JSON.stringify(result.body)).not.toMatch(/xai-test-key/i);
  });

  it("mints an ephemeral token without leaking the API key", async () => {
    const { business } = makeBusiness();
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(GROK_CLIENT_SECRETS_URL);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
      expect(String(init?.body)).toContain("expires_after");
      return new Response(JSON.stringify({ value: "ek_demo_token", expires_at: 1_800_000_000 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await handleRealtimeSessionRequest({ business, apiKey: FAKE_KEY, fetchImpl });
    expect(result.status).toBe(200);
    expect(result.body.token).toBe("ek_demo_token");
    expect(result.body.wsUrl).toBe(GROK_REALTIME_WS_URL);
    expect(result.body.model).toBe(GROK_VOICE_MODEL);
    expect(result.body.voice).toBe(GROK_VOICE_ID);
    const dumped = JSON.stringify(result.body);
    expect(dumped).not.toContain(FAKE_KEY);
    expect(dumped).not.toMatch(/xai-test-key-should-never-leak/);
    const session = result.body.session as {
      voice: string;
      tools: { name: string }[];
      audio: { input: { transcription: { language_hint: string } } };
      turn_detection: { type: string; threshold: number };
    };
    expect(session.voice).toBe("ara");
    expect(session.audio.input.transcription.language_hint).toBe("pt-PT");
    expect(session.turn_detection.type).toBe("server_vad");
    expect(session.turn_detection.threshold).toBe(0.45);
    expect(session.tools.map((t) => t.name)).toContain("get_slots");
    expect(session.tools.map((t) => t.name)).toContain("book_appointment");
    expect(mintRealtimeClientSecret).toBeTypeOf("function");
  });

  it("feature flag grokVoice follows XAI_API_KEY", () => {
    vi.stubEnv("XAI_API_KEY", "");
    expect(featureFlags().grokVoice).toBe(false);
    vi.stubEnv("XAI_API_KEY", FAKE_KEY);
    expect(featureFlags().grokVoice).toBe(true);
  });
});

describe("realtime HTTP session + tool wiring", () => {
  it("session endpoint 503 without a key; tool endpoint executes booking brain", async () => {
    const { store, business } = makeBusiness();
    const scheduler = new InMemoryScheduler(store, () => NOW);
    const app = express();
    app.use(express.json());
    app.post("/api/business/:slug/realtime/session", async (_req, res) => {
      const result = await handleRealtimeSessionRequest({ business, apiKey: undefined });
      res.status(result.status).json(result.body);
    });
    app.post("/api/business/:slug/realtime/tool", async (req, res) => {
      const result = await handleVoiceFunction(business, store, scheduler, {
        name: String(req.body?.name ?? ""),
        arguments: parseToolArguments(req.body?.arguments),
      }, NOW);
      res.json(result);
    });

    const { base, close } = await listen(app);
    try {
      const missing = await fetch(`${base}/api/business/${business.slug}/realtime/session`, { method: "POST" });
      expect(missing.status).toBe(503);
      const missingBody = (await missing.json()) as { message: string };
      expect(missingBody.message).toMatch(/não está configurada/i);

      const services = await fetch(`${base}/api/business/${business.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "list_services", arguments: {} }),
      });
      const listed = (await services.json()) as { services: { name: string }[] };
      expect(listed.services.length).toBeGreaterThan(0);

      const serviceName = listed.services[0].name;
      const slotsRes = await fetch(`${base}/api/business/${business.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "get_slots", arguments: JSON.stringify({ service: serviceName, date: "2026-08-27" }) }),
      });
      const slots = (await slotsRes.json()) as { slots: string[] };
      expect(slots.slots.length).toBeGreaterThan(0);

      const bookedRes = await fetch(`${base}/api/business/${business.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "book_appointment",
          arguments: { service: serviceName, start: slots.slots[0], customerName: "Rui" },
        }),
      });
      const booked = (await bookedRes.json()) as { ok: boolean; bookingId: string };
      expect(booked.ok).toBe(true);

      const listRes = await fetch(`${base}/api/business/${business.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "list_bookings", arguments: {} }),
      });
      const bookings = (await listRes.json()) as { bookings: { id: string }[] };
      expect(bookings.bookings).toHaveLength(1);

      const cancelRes = await fetch(`${base}/api/business/${business.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "cancel_appointment", arguments: { bookingId: bookings.bookings[0].id } }),
      });
      const cancelled = (await cancelRes.json()) as { ok: boolean };
      expect(cancelled.ok).toBe(true);
    } finally {
      await close();
    }
  });

  it("session HTTP mints a token when fetch is mocked", async () => {
    const { business } = makeBusiness();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ value: "ek_http_token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const app = express();
    app.use(express.json());
    app.post("/api/business/:slug/realtime/session", async (_req, res) => {
      const result = await handleRealtimeSessionRequest({ business, apiKey: FAKE_KEY, fetchImpl });
      res.status(result.status).json(result.body);
    });
    const { base, close } = await listen(app);
    try {
      const res = await fetch(`${base}/api/business/${business.slug}/realtime/session`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string; voice: string; wsUrl: string };
      expect(body.token).toBe("ek_http_token");
      expect(body.voice).toBe("ara");
      expect(body.wsUrl).toContain(GROK_VOICE_MODEL);
      expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    } finally {
      await close();
    }
  });
});
