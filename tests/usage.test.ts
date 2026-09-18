import { describe, expect, it } from "vitest";
import { applyCallMinutes, billedMinutesFromDuration, ensureUsagePeriod, usagePeriod } from "../src/billing/usage.js";
import type { Subscription } from "../src/domain/types.js";

function sub(partial: Partial<Subscription> = {}): Subscription {
  return {
    planId: "base",
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    includedMinutes: 200,
    usedMinutes: 0,
    overageMinutes: 0,
    planStartedAt: "2026-08-18T10:00:00.000Z",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    ...partial,
  };
}

describe("billedMinutesFromDuration", () => {
  it("never invents minutes for empty or zero duration", () => {
    expect(billedMinutesFromDuration(0)).toBe(0);
    expect(billedMinutesFromDuration(-3)).toBe(0);
    expect(billedMinutesFromDuration(Number.NaN)).toBe(0);
  });

  it("ceils to whole minutes with a 1-minute floor", () => {
    expect(billedMinutesFromDuration(1)).toBe(1);
    expect(billedMinutesFromDuration(59)).toBe(1);
    expect(billedMinutesFromDuration(60)).toBe(1);
    expect(billedMinutesFromDuration(61)).toBe(2);
  });
});

describe("usagePeriod", () => {
  it("resets on the monthly anniversary of plan start", () => {
    const started = new Date("2026-08-18T10:00:00.000Z");
    const period = usagePeriod(started, new Date("2026-09-18T15:35:47.000Z"));
    expect(period.start.toISOString().startsWith("2026-09-18")).toBe(true);
    expect(period.end.toISOString().startsWith("2026-10-18")).toBe(true);
  });
});

describe("applyCallMinutes", () => {
  it("decrements the plan allowance and records overage past the included minutes", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const subscription = sub({ planStartedAt: "2026-09-01T10:00:00.000Z" });
    ensureUsagePeriod(subscription, now);
    subscription.usedMinutes = 198;
    subscription.overageMinutes = 0;
    expect(applyCallMinutes(subscription, 5, now)).toEqual({
      billedMinutes: 5,
      overageMinutes: 3,
    });
    expect(subscription.usedMinutes).toBe(203);
    expect(subscription.overageMinutes).toBe(3);
  });

  it("clears usage when the anniversary rolls", () => {
    const subscription = sub({
      usedMinutes: 180,
      overageMinutes: 0,
      currentPeriodStart: "2026-08-18T10:00:00.000Z",
    });
    ensureUsagePeriod(subscription, new Date("2026-09-18T12:00:00.000Z"));
    expect(subscription.usedMinutes).toBe(0);
    expect(subscription.overageMinutes).toBe(0);
  });
});
