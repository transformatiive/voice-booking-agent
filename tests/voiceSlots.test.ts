import { describe, expect, it } from "vitest";
import { handleVoiceFunction } from "../src/telephony/voice.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import {
  findServiceByName,
  parseVoiceDate,
  shouldSimulateTaken,
  speakSlot,
} from "../src/scheduling/voiceSlots.js";
import { ensureDemoBusinesses, MARKETING_DEMO_SLUG } from "../src/store/seed.js";
import { tempStore } from "./helpers.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0); // Wed 26 Aug 2026 09:00

function clinic() {
  const store = tempStore();
  ensureDemoBusinesses(store);
  const business = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
  const scheduler = new InMemoryScheduler(store, () => NOW);
  return { store, business, scheduler };
}

describe("voice demo slots", () => {
  it("maps clinic specialties including colloquial names", () => {
    const { business } = clinic();
    expect(findServiceByName(business, "Dermatologia")?.name).toBe("Dermatologia");
    expect(findServiceByName(business, "consulta de dermatologia")?.name).toBe("Dermatologia");
    expect(findServiceByName(business, "pele")?.name).toBe("Dermatologia");
    expect(findServiceByName(business, "dentes")?.name).toBe("Medicina dentária");
    expect(findServiceByName(business, "pediatria")?.name).toBe("Pediatria");
  });

  it("parses ISO and Portuguese dates instead of hanging on Invalid Date", () => {
    const iso = parseVoiceDate("2026-08-27", "pt", NOW);
    expect(iso.date.getDate()).toBe(27);
    expect(iso.specificTime).toBe(false);

    const timed = parseVoiceDate("2026-08-27T15:00:00", "pt", NOW);
    expect(timed.specificTime).toBe(true);
    expect(timed.date.getHours()).toBe(15);

    const natural = parseVoiceDate("amanhã às 15h", "pt", NOW);
    expect(Number.isNaN(natural.date.getTime())).toBe(false);
    expect(natural.date.getDate()).toBe(27);
    expect(natural.specificTime).toBe(true);
    expect(natural.date.getHours()).toBe(15);

    const garbage = parseVoiceDate("xyz-not-a-date", "pt", NOW);
    expect(garbage.date.getTime()).toBe(NOW.getTime());
  });

  it("always returns 1–3 speakable Lisbon slots, even on Sunday or garbage dates", async () => {
    const { store, business, scheduler } = clinic();
    const derm = "Dermatologia";

    const sunday = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: derm, date: "2026-08-30" } },
      NOW,
    )) as { slots: string[]; offers: { speak: string }[]; instruction: string };
    expect(sunday.slots.length).toBeGreaterThan(0);
    expect(sunday.slots.length).toBeLessThanOrEqual(3);
    expect(sunday.offers[0].speak).toMatch(/às \d{2}h\d{2}/);
    expect(sunday.instruction).toMatch(/Diz já|hora está ocupada/);

    const garbage = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: "pele", date: "quando der" } },
      NOW,
    )) as { slots: string[]; service: string };
    expect(garbage.service).toBe("Dermatologia");
    expect(garbage.slots.length).toBeGreaterThan(0);

    const missingDate = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: "clínica geral" } },
      NOW,
    )) as { slots: string[] };
    expect(missingDate.slots.length).toBeGreaterThan(0);
  });

  it("sometimes marks a requested time taken and still offers an alternative", async () => {
    expect(typeof shouldSimulateTaken("aaa")).toBe("boolean");
    expect(typeof shouldSimulateTaken("clinica-central:x:2026-08-27T14:00:00.000Z")).toBe("boolean");

    const { store, business, scheduler } = clinic();
    const result = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: "Dermatologia", date: "2026-08-27T15:00:00" } },
      NOW,
    )) as {
      taken: boolean;
      alternative: { start: string; speak: string } | null;
      offers: { start: string }[];
      slots: string[];
    };
    expect(result.slots.length).toBeGreaterThan(0);
    if (result.taken) {
      expect(result.alternative?.start).toBeTruthy();
      expect(result.alternative?.speak).toMatch(/às/);
      const altHour = new Date(result.alternative!.start).getHours();
      expect(altHour).toBeGreaterThanOrEqual(13);
      expect(altHour).toBeLessThanOrEqual(16);
    } else {
      expect(result.offers[0].start).toBeTruthy();
      const firstHour = new Date(result.offers[0].start).getHours();
      expect(firstHour).toBe(15);
    }
  });

  it("books a clinic slot, persists it, and tells Sofia to mention SMS", async () => {
    const { store, business, scheduler } = clinic();
    const slots = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: "Pediatria", date: "2026-08-27" } },
      NOW,
    )) as { slots: string[] };
    const booked = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      {
        name: "book_appointment",
        arguments: {
          service: "Pediatria",
          start: slots.slots[0],
          customerName: "Ana Sousa",
          customerPhone: "+351910000000",
        },
      },
      NOW,
    )) as { ok: boolean; bookingId: string; speak: string; smsConfirmation: boolean };
    expect(booked.ok).toBe(true);
    expect(booked.smsConfirmation).toBe(true);
    expect(booked.speak).toMatch(/Envio confirmação por SMS/);
    expect(store.listBookings(business.id)).toHaveLength(1);
    expect(store.listBookings(business.id)[0].customerName).toBe("Ana Sousa");
  });

  it("on a real conflict, returns a nearby alternative instead of hanging", async () => {
    const { store, business, scheduler } = clinic();
    const slots = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      { name: "get_slots", arguments: { service: "Clínica geral", date: "2026-08-27" } },
      NOW,
    )) as { slots: string[] };
    await handleVoiceFunction(
      business,
      store,
      scheduler,
      {
        name: "book_appointment",
        arguments: { service: "Clínica geral", start: slots.slots[0], customerName: "Rui" },
      },
      NOW,
    );
    const again = (await handleVoiceFunction(
      business,
      store,
      scheduler,
      {
        name: "book_appointment",
        arguments: { service: "Clínica geral", start: slots.slots[0], customerName: "Miguel" },
      },
      NOW,
    )) as { ok: boolean; reason: string; alternative: { start: string } | null; instruction: string };
    expect(again.ok).toBe(false);
    expect(again.reason).toBe("conflict");
    expect(again.alternative?.start).toBeTruthy();
    expect(again.instruction).toMatch(/alternativa/);
  });

  it("formats times in Europe/Lisbon Portuguese", () => {
    const when = new Date(2026, 7, 27, 15, 0, 0);
    expect(speakSlot(when, "pt", "Europe/Lisbon")).toMatch(/às 15h00/);
  });
});
