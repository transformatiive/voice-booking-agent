import { describe, expect, it } from "vitest";
import { checkAvailability, suggestSlots } from "../src/scheduling/availability.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { tempStore } from "./helpers.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0); // Wed 26 Aug 2026 09:00

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
  return { store, business, service: business.services[0] };
}

describe("availability", () => {
  it("accepts a valid future slot within hours", () => {
    const { business, service } = makeBusiness();
    const start = new Date(2026, 7, 27, 15, 0, 0); // Thu 15:00
    expect(checkAvailability(business, service, start, [], NOW)).toEqual({ ok: true });
  });

  it("rejects past, closed Sunday, and out-of-hours", () => {
    const { business, service } = makeBusiness();
    expect(checkAvailability(business, service, new Date(2026, 7, 25, 15, 0), [], NOW).ok).toBe(false);
    expect(checkAvailability(business, service, new Date(2026, 7, 30, 11, 0), [], NOW)).toEqual({
      ok: false,
      reason: "closed_day",
    });
    expect(checkAvailability(business, service, new Date(2026, 7, 27, 8, 0), [], NOW)).toEqual({
      ok: false,
      reason: "outside_hours",
    });
  });

  it("detects conflicts and suggests open slots", async () => {
    const { store, business, service } = makeBusiness();
    const scheduler = new InMemoryScheduler(store, () => NOW);
    await scheduler.book({
      business,
      service,
      start: new Date(2026, 7, 27, 9, 0, 0),
      resourceId: null,
      customerName: null,
      customerPhone: null,
      source: "web",
    });
    const bookings = store.listBookings(business.id);
    const conflict = checkAvailability(business, service, new Date(2026, 7, 27, 9, 15, 0), bookings, NOW);
    expect(conflict).toEqual({ ok: false, reason: "conflict" });

    const slots = suggestSlots(business, service, new Date(2026, 7, 27, 9, 0, 0), bookings, NOW, 3);
    expect(slots.length).toBe(3);
    // 09:00 taken (30 min) -> first suggestion 09:30
    expect(slots[0].getHours()).toBe(9);
    expect(slots[0].getMinutes()).toBe(30);
  });

  it("does not throw on invalid dates or missing day hours", () => {
    const { business, service } = makeBusiness();
    const invalid = new Date("not-a-date");
    expect(checkAvailability(business, service, invalid, [], NOW).ok).toBe(false);
    expect(suggestSlots(business, service, invalid, [], NOW, 3)).toEqual([]);
  });
});
