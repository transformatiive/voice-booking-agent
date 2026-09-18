import type { Subscription } from "../domain/types.js";
import { getPlan } from "../domain/plans.js";

export function billedMinutesFromDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

function addCalendarMonth(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getTime());
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** Monthly anniversary of plan start (signup). */
export function usagePeriod(
  planStartedAt: Date,
  now: Date,
): { start: Date; end: Date } {
  const started = new Date(planStartedAt.getTime());
  if (Number.isNaN(started.getTime()) || Number.isNaN(now.getTime()) || now.getTime() < started.getTime()) {
    const fallbackEnd = addCalendarMonth(Number.isNaN(started.getTime()) ? now : started, 1);
    return { start: Number.isNaN(started.getTime()) ? now : started, end: fallbackEnd };
  }
  let start = new Date(started.getTime());
  let guard = 0;
  while (addCalendarMonth(start, 1).getTime() <= now.getTime() && guard < 240) {
    start = addCalendarMonth(start, 1);
    guard += 1;
  }
  return { start, end: addCalendarMonth(start, 1) };
}

export function ensureUsagePeriod(subscription: Subscription, now: Date = new Date()): Subscription {
  const started = new Date(subscription.planStartedAt || now.toISOString());
  const period = usagePeriod(started, now);
  const periodStartIso = period.start.toISOString();
  if (subscription.currentPeriodStart === periodStartIso) {
    return subscription;
  }
  const rolled = Boolean(subscription.currentPeriodStart);
  subscription.currentPeriodStart = periodStartIso;
  subscription.currentPeriodEnd = period.end.toISOString();
  if (rolled) {
    subscription.usedMinutes = 0;
    subscription.overageMinutes = 0;
  }
  const plan = getPlan(subscription.planId);
  subscription.includedMinutes = plan.includedMinutes;
  return subscription;
}

export function applyCallMinutes(
  subscription: Subscription,
  billedMinutes: number,
  now: Date = new Date(),
): { billedMinutes: number; overageMinutes: number } {
  ensureUsagePeriod(subscription, now);
  if (billedMinutes <= 0) {
    return { billedMinutes: 0, overageMinutes: 0 };
  }
  const remaining = Math.max(0, subscription.includedMinutes - subscription.usedMinutes);
  const overageMinutes = Math.max(0, billedMinutes - remaining);
  subscription.usedMinutes += billedMinutes;
  subscription.overageMinutes += overageMinutes;
  return { billedMinutes, overageMinutes };
}
