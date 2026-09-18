import { describe, expect, it } from "vitest";
import { MockNumberProvider } from "../src/telephony/mock.js";
import { TelnyxNumberProvider } from "../src/telephony/telnyx.js";
import { absolutePublicUrl, buildDemoLiveTeXML, buildIncomingTeXML, handleDemoInbound, handleDemoPickerFunction, handleVoiceFunction } from "../src/telephony/voice.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { DEMO_DID_E164, DEMO_PICKER_SLUG, rememberedDemoSlug } from "../src/telephony/demoDid.js";
import { tempStore } from "./helpers.js";
import { ensureDemoBusinesses } from "../src/store/seed.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0);

function makeBusiness() {
  const store = tempStore();
  const business = store.createBusiness({
    name: "Barbearia Teste",
    useCase: "barbearia",
    locale: "pt",
    agentName: "Atende",
    agentGender: "feminino",
    planId: "base",
  });
  return { store, business };
}

describe("MockNumberProvider", () => {
  it("provisions a +351 mobile number", async () => {
    const provider = new MockNumberProvider();
    const found = await provider.searchNumbers({ country: "PT", type: "mobile", limit: 2 });
    expect(found.length).toBe(2);
    expect(found[0].e164.startsWith("+3519")).toBe(true);
    const number = await provider.provisionNumber(found[0].e164);
    expect(number.status).toBe("active");
    expect(number.type).toBe("mobile");
  });
});

describe("voice inbound TeXML", () => {
  it("warm-transfers to an available resource's mobile", () => {
    const { store, business } = makeBusiness();
    business.resources[0].transferNumber = "+351911111111";
    business.resources[0].available = true;
    store.saveBusiness(business);
    const xml = buildIncomingTeXML(business);
    expect(xml).toContain("<Dial");
    expect(xml).toContain("+351911111111");
  });

  it("falls back to assistant message when nobody is available", () => {
    const { store, business } = makeBusiness();
    business.resources.forEach((r) => (r.available = false));
    store.saveBusiness(business);
    const xml = buildIncomingTeXML(business);
    expect(xml).not.toContain("<Dial");
    expect(xml).toContain("<Record");
  });
});

describe("demo DID inbound TeXML", () => {
  it("connects immediately to Live media, without a Gather/Say menu", () => {
    const xml = handleDemoInbound({
      toE164: DEMO_DID_E164,
      fromE164: "+351910000044",
      now: 3_000_000,
      publicBaseUrl: "https://atende.pt",
    });
    expect(xml).toContain("<Connect>");
    expect(xml).toContain("<Stream");
    expect(xml).toContain(`live-media?slug=${DEMO_PICKER_SLUG}`);
    expect(xml).not.toContain("<Gather");
    expect(xml).not.toContain("<Say");
    expect(xml).not.toContain("<Dial");
    expect(xml).not.toContain("sou o Atende");
  });

  it("builds an absolute Stream URL even when PUBLIC_BASE_URL has a trailing slash", () => {
    expect(absolutePublicUrl("https://atende.pt/", "/voice/incoming-demo")).toBe(
      "https://atende.pt/voice/incoming-demo",
    );
    const xml = handleDemoInbound({
      toE164: DEMO_DID_E164,
      now: 3_000_000,
      publicBaseUrl: "https://atende.pt/",
    });
    expect(xml).toContain(`wss://atende.pt/voice/live-media?slug=${DEMO_PICKER_SLUG}`);
    expect(xml).not.toContain("atende.pt//voice");
  });

  it("connects a chosen vertical stream URL to Live media, not a human Dial", () => {
    const xml = buildDemoLiveTeXML({ slug: "oficina-norte", publicBaseUrl: "https://atende.pt" });
    expect(xml).toContain("<Stream");
    expect(xml).toContain("oficina-norte");
    expect(xml).not.toContain("<Dial");
    expect(xml).not.toMatch(/<Say[^>]*>a ligar/);
  });

  it("does not wait for DTMF or speech before streaming Live", () => {
    const withDigits = handleDemoInbound({
      toE164: DEMO_DID_E164,
      fromE164: "+351910000044",
      digits: "4",
      now: 3_000_000,
      publicBaseUrl: "https://atende.pt",
    });
    expect(withDigits).toContain(`slug=${DEMO_PICKER_SLUG}`);
    expect(withDigits).toContain("<Stream");
    expect(withDigits).not.toContain("oficina-norte");
    expect(rememberedDemoSlug({ fromE164: "+351910000044", now: 3_000_000 })).toBeUndefined();

    const withSpeech = handleDemoInbound({
      toE164: DEMO_DID_E164,
      fromE164: "+351910000055",
      speech: "quero a imobiliária",
      now: 3_000_000,
      publicBaseUrl: "https://atende.pt",
    });
    expect(withSpeech).toContain(`slug=${DEMO_PICKER_SLUG}`);
    expect(withSpeech).not.toContain("imobiliaria-baixa");
  });

  it("dials OpenAI SIP immediately, without a Gather menu", () => {
    const xml = handleDemoInbound({
      toE164: DEMO_DID_E164,
      fromE164: "+351910000066",
      now: 4_000_000,
      publicBaseUrl: "https://atende.pt",
      sipUri: "sip:proj_test@sip.api.openai.com;transport=tls",
    });
    expect(xml).toContain("<Sip>");
    expect(xml).toContain("sip:proj_test@sip.api.openai.com");
    expect(xml).not.toContain("<Stream");
    expect(xml).not.toContain("<Gather");
    expect(xml).not.toContain("<Say");
    expect(rememberedDemoSlug({ fromE164: "+351910000066", now: 4_000_000 })).toBeUndefined();
  });

  it("never emits a Stream URL when the live-media WebSocket route is disabled", () => {
    const xml = handleDemoInbound({
      toE164: DEMO_DID_E164,
      now: 5_000_000,
      publicBaseUrl: "https://voice-booking-agent-production-c728.up.railway.app",
      streamEnabled: false,
    });
    expect(xml).not.toContain("<Stream");
    expect(xml).not.toContain("/voice/live-media");
    expect(xml).not.toContain("<Gather");
    expect(xml).not.toContain("<Say");
    expect(xml).not.toContain("<Dial");
  });

  it("prefer Dial Sip over Stream when OPENAI_LIVE_SIP_URI is set", () => {
    const xml = buildDemoLiveTeXML({
      slug: DEMO_PICKER_SLUG,
      publicBaseUrl: "https://atende.pt",
      sipUri: "sip:proj_prod@sip.api.openai.com;transport=tls",
      streamEnabled: true,
    });
    expect(xml).toContain("<Sip>sip:proj_prod@sip.api.openai.com;transport=tls</Sip>");
    expect(xml).not.toContain("<Stream");
    expect(xml).not.toContain("live-media");
  });

  it("Stream TeXML uses PCMU bidirectional RTP matching the live-media bridge", () => {
    const xml = buildDemoLiveTeXML({
      slug: DEMO_PICKER_SLUG,
      publicBaseUrl: "https://atende.pt/",
    });
    expect(xml).toContain(`url="wss://atende.pt/voice/live-media?slug=${DEMO_PICKER_SLUG}"`);
    expect(xml).toContain('bidirectionalMode="rtp"');
    expect(xml).toContain('codec="PCMU"');
    expect(xml).toContain('bidirectionalCodec="PCMU"');
    expect(xml).toContain('bidirectionalSamplingRate="8000"');
  });
});

describe("Telnyx orders stay provisioning until approved", () => {
  it("maps a successful order API response to provisioning by default", async () => {
    const fetchImpl = async (url: string, init?: RequestInit) => {
      if (String(url).includes("/number_orders") && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { status: "pending" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected ${url}`);
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const provider = new TelnyxNumberProvider("key", "conn");
      const number = await provider.provisionNumber("+351210000000");
      expect(number.status).toBe("provisioning");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("voice function webhook", () => {
  it("lists services, gets slots and books", async () => {
    const { store, business } = makeBusiness();
    const scheduler = new InMemoryScheduler(store, () => NOW);

    const services = await handleVoiceFunction(business, store, scheduler, { name: "list_services", arguments: {} }, NOW);
    expect(Array.isArray(services.services)).toBe(true);

    const serviceName = business.services[0].name;
    const slots = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: serviceName, date: "2026-08-27" } },
      NOW,
    )) as { slots: string[] };
    expect(slots.slots.length).toBeGreaterThan(0);

    const booked = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "book_appointment", arguments: { service: serviceName, start: slots.slots[0], customerName: "Rui" } },
      NOW,
    )) as { ok: boolean };
    expect(booked.ok).toBe(true);
    expect(store.listBookings(business.id)).toHaveLength(1);
  });

  it("lists and cancels bookings", async () => {
    const { store, business } = makeBusiness();
    const scheduler = new InMemoryScheduler(store, () => NOW);
    const serviceName = business.services[0].name;
    const slots = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: serviceName, date: "2026-08-27" } },
      NOW,
    )) as { slots: string[] };

    await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "book_appointment", arguments: { service: serviceName, start: slots.slots[0], customerName: "Ana" } },
      NOW,
    );

    const listed = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "list_bookings", arguments: {} },
      NOW,
    )) as { bookings: { id: string; serviceName: string }[] };
    expect(listed.bookings).toHaveLength(1);
    expect(listed.bookings[0].serviceName).toBe(serviceName);

    const cancelled = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "cancel_appointment", arguments: { bookingId: listed.bookings[0].id } },
      NOW,
    )) as { ok: boolean };
    expect(cancelled.ok).toBe(true);
    expect(store.listBookings(business.id)).toHaveLength(0);
  });
});

describe("demo DID picker tools", () => {
  it("locks a vertical inside the Live session and books that tenant", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const scheduler = new InMemoryScheduler(store, () => NOW);
    const selected = (await handleDemoPickerFunction({
      store,
      scheduler,
      call: { name: "select_demo_vertical", arguments: { vertical: "4" } },
      fromE164: "+351910000077",
      callSid: "CA_picker",
      now: NOW,
    })) as { ok: boolean; slug: string; businessName: string; speak?: string; message?: string; instruction?: string };
    expect(selected.ok).toBe(true);
    expect(selected.slug).toBe("oficina-norte");
    expect(selected.businessName).toBe("Oficina Norte");
    expect(rememberedDemoSlug({ fromE164: "+351910000077", now: NOW.getTime() })).toBe("oficina-norte");
    expect(selected.speak).toMatch(/diagnóstico/i);
    expect(selected.speak).toMatch(/revisão/i);
    expect(selected.speak).toMatch(/pneus/i);
    expect(selected.speak).toMatch(/veículo|carro/i);
    expect(selected.message).toBe(selected.speak);
    expect(selected.speak).not.toMatch(/perfeito/i);
    expect(selected.speak).not.toMatch(/preparar/i);
    expect(selected.speak).not.toMatch(/Olá! Sou/);
    expect(String(selected.speak).split(/[.!?]+/).filter((part) => part.trim()).length).toBeLessThanOrEqual(2);
    expect(String(selected.instruction)).toMatch(/get_slots|book_appointment/);
    expect(String(selected.instruction)).not.toMatch(/Fuso:|Não te apresentes como uma demo/);
    expect(JSON.stringify(selected)).not.toMatch(/buildLiveInstructions/);

    const slots = (await handleDemoPickerFunction({
      store,
      scheduler,
      call: { name: "get_slots", arguments: { service: "Revisão", date: "2026-08-27" } },
      fromE164: "+351910000077",
      callSid: "CA_picker",
      now: NOW,
    })) as { slots: string[] };
    expect(slots.slots.length).toBeGreaterThan(0);

    const booked = (await handleDemoPickerFunction({
      store,
      scheduler,
      call: {
        name: "book_appointment",
        arguments: { service: "Revisão", start: slots.slots[0], customerName: "Rui", vertical: "oficina" },
      },
      fromE164: "+351910000077",
      now: NOW,
    })) as { ok: boolean };
    expect(booked.ok).toBe(true);
    expect(store.getBusinessBySlug("oficina-norte")).toBeDefined();
    expect(store.listBookings(store.getBusinessBySlug("oficina-norte")!.id)).toHaveLength(1);
    expect(store.listBookings(store.getBusinessBySlug("clinica-central")!.id)).toHaveLength(0);
  });

  it("clínica opener names the seeded specialties, not a transition stall", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const scheduler = new InMemoryScheduler(store, () => NOW);
    const selected = (await handleDemoPickerFunction({
      store,
      scheduler,
      call: { name: "select_demo_vertical", arguments: { vertical: "clinica" } },
      fromE164: "+351910000078",
      now: NOW,
    })) as { ok: boolean; slug: string; speak?: string; message?: string; instruction?: string };
    expect(selected.ok).toBe(true);
    expect(selected.slug).toBe("clinica-central");
    expect(selected.speak).toMatch(/clínica geral/i);
    expect(selected.speak).toMatch(/dermatologia/i);
    expect(selected.speak).toMatch(/pediatria/i);
    expect(selected.speak).toMatch(/medicina dentária/i);
    expect(selected.message).toBe(selected.speak);
    expect(selected.speak).not.toMatch(/perfeito/i);
    expect(selected.speak).not.toMatch(/preparar/i);
    expect(selected.speak).not.toMatch(/Olá! Sou/);
    expect(String(selected.speak).split(/[.!?]+/).filter((part) => part.trim()).length).toBeLessThanOrEqual(2);
    expect(String(selected.instruction)).toMatch(/get_slots|book_appointment/);
  });

  it("refuses to book before a vertical is chosen", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const scheduler = new InMemoryScheduler(store, () => NOW);
    const result = await handleDemoPickerFunction({
      store,
      scheduler,
      call: { name: "get_slots", arguments: { service: "Revisão" } },
      fromE164: "+351910000099",
      now: NOW,
    });
    expect(result.error).toBe("select_vertical_first");
  });
});
