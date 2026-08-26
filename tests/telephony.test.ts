import { describe, expect, it } from "vitest";
import { MockNumberProvider } from "../src/telephony/mock.js";
import { buildIncomingTeXML, handleVoiceFunction } from "../src/telephony/voice.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { tempStore } from "./helpers.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0);

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
});
