import { describe, expect, it } from "vitest";
import { MockNumberProvider } from "../src/telephony/mock.js";
import { TelnyxNumberProvider } from "../src/telephony/telnyx.js";
import { buildDemoIvrTeXML, buildDemoLiveTeXML, buildIncomingTeXML, handleVoiceFunction } from "../src/telephony/voice.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { tempStore } from "./helpers.js";

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
  it("asks which demonstration to run with speech and DTMF", () => {
    const xml = buildDemoIvrTeXML();
    expect(xml).toContain("<Gather");
    expect(xml).toContain('input="dtmf speech"');
    expect(xml).toContain("clínica, barbearia, restaurante, oficina ou imobiliária");
    expect(xml).toContain("sou o Atende");
    expect(xml).not.toContain("Sofia");
    expect(xml).not.toContain("<Dial");
  });

  it("connects a chosen vertical to Live media, not a human Dial", () => {
    const xml = buildDemoLiveTeXML({ slug: "oficina-norte", publicBaseUrl: "https://atende.pt" });
    expect(xml).toContain("<Stream");
    expect(xml).toContain("oficina-norte");
    expect(xml).not.toContain("<Dial");
    expect(xml).not.toMatch(/<Say[^>]*>a ligar/);
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
