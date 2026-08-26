import { describe, expect, it } from "vitest";
import { BookingStore } from "../src/booking/store.js";
import { checkAvailability, suggestSlots } from "../src/booking/availability.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0); // Wed Aug 26, 2026 09:00

describe("checkAvailability", () => {
  it("accepts a valid future slot within business hours", () => {
    const store = new BookingStore();
    const start = new Date(2026, 7, 27, 15, 0, 0); // Thu 3pm
    expect(checkAvailability(store, "haircut", start, NOW)).toEqual({ ok: true });
  });

  it("rejects times in the past", () => {
    const store = new BookingStore();
    const start = new Date(2026, 7, 25, 15, 0, 0); // yesterday
    expect(checkAvailability(store, "haircut", start, NOW)).toEqual({
      ok: false,
      reason: "past",
    });
  });

  it("rejects Sundays", () => {
    const store = new BookingStore();
    const start = new Date(2026, 7, 30, 11, 0, 0); // Sunday
    expect(checkAvailability(store, "haircut", start, NOW)).toEqual({
      ok: false,
      reason: "closed_day",
    });
  });

  it("rejects times outside business hours", () => {
    const store = new BookingStore();
    const tooEarly = new Date(2026, 7, 27, 8, 0, 0);
    expect(checkAvailability(store, "haircut", tooEarly, NOW).ok).toBe(false);
    const runsPastClose = new Date(2026, 7, 27, 16, 45, 0); // 45-min service ends 17:30
    expect(checkAvailability(store, "manicure", runsPastClose, NOW)).toEqual({
      ok: false,
      reason: "outside_hours",
    });
  });

  it("detects conflicts with existing bookings", () => {
    const store = new BookingStore();
    store.create({ service: "massage", customerName: null, start: new Date(2026, 7, 27, 14, 0, 0) });
    // Massage is 60 min -> occupies 14:00-15:00.
    const overlapping = new Date(2026, 7, 27, 14, 30, 0);
    expect(checkAvailability(store, "haircut", overlapping, NOW)).toEqual({
      ok: false,
      reason: "conflict",
    });
    const afterward = new Date(2026, 7, 27, 15, 0, 0);
    expect(checkAvailability(store, "haircut", afterward, NOW).ok).toBe(true);
  });
});

describe("suggestSlots", () => {
  it("suggests open times skipping conflicts", () => {
    const store = new BookingStore();
    store.create({ service: "haircut", customerName: null, start: new Date(2026, 7, 27, 9, 0, 0) });
    const slots = suggestSlots(store, "haircut", new Date(2026, 7, 27, 9, 0, 0), NOW, 3);
    expect(slots.length).toBe(3);
    // 09:00 is taken (30 min), so the first suggestion should be 09:30.
    expect(slots[0].getHours()).toBe(9);
    expect(slots[0].getMinutes()).toBe(30);
  });
});
