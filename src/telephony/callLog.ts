import { randomUUID } from "node:crypto";
import { resolvedTelephonyProvider } from "../config.js";
import { applyCallMinutes, billedMinutesFromDuration } from "../billing/usage.js";
import type { BillingService } from "../billing/stripe.js";
import type { Business, Call, CallProvider, CallStatus } from "../domain/types.js";
import type { Store } from "../store/store.js";

export interface VoiceCallFields {
  callSid?: string;
  fromE164?: string;
  toE164?: string;
  durationSeconds?: number;
  status?: string;
}

export function parseVoiceCallFields(body: unknown): VoiceCallFields {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = rec[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  };
  const durationRaw = pick("CallDuration", "call_duration", "Duration", "duration");
  const durationSeconds = durationRaw ? Number(durationRaw) : undefined;
  return {
    callSid: pick("CallSid", "call_sid", "callSid", "call_control_id", "CallControlId"),
    fromE164: pick("From", "from", "Caller", "caller_id_number"),
    toE164: pick("To", "to", "Called", "destination_number"),
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    status: pick("CallStatus", "call_status", "HangupCause", "hangup_cause", "Status", "status"),
  };
}

function mapStatus(raw: string | undefined, durationSeconds: number): CallStatus {
  const status = (raw ?? "").toLowerCase();
  if (status.includes("fail") || status.includes("busy") || status.includes("error")) {
    return "failed";
  }
  if (status.includes("no-answer") || status.includes("no_answer") || status.includes("cancel")) {
    return "missed";
  }
  if (status.includes("in-progress") || status.includes("ring") || status.includes("queued")) {
    return "in_progress";
  }
  if (durationSeconds <= 0 && (status.includes("completed") || status === "")) {
    return durationSeconds <= 0 && status.includes("completed") ? "missed" : "completed";
  }
  if (status.includes("completed") || status.includes("hangup")) {
    return "completed";
  }
  return durationSeconds > 0 ? "completed" : "in_progress";
}

function providerName(): CallProvider {
  const name = resolvedTelephonyProvider();
  switch (name) {
    case "telnyx":
    case "zadarma":
    case "mock":
      return name;
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export async function startInboundCall(
  store: Store,
  business: Business,
  fields: VoiceCallFields,
  now: Date = new Date(),
): Promise<Call> {
  const existing = fields.callSid ? store.findCallByProviderId(business.id, fields.callSid) : undefined;
  if (existing) {
    if (fields.fromE164) existing.fromE164 = fields.fromE164;
    if (fields.toE164) existing.toE164 = fields.toE164;
    store.saveCall(existing);
    return existing;
  }
  const call: Call = {
    id: randomUUID(),
    businessId: business.id,
    provider: providerName(),
    providerCallId: fields.callSid ?? null,
    fromE164: fields.fromE164 ?? null,
    toE164: fields.toE164 ?? business.number?.e164 ?? null,
    startedAt: now.toISOString(),
    endedAt: null,
    durationSeconds: 0,
    billedMinutes: 0,
    overageMinutes: 0,
    status: "in_progress",
    stripeUsageReported: false,
    createdAt: now.toISOString(),
  };
  store.addCall(call);
  return call;
}

export async function completeInboundCall(
  store: Store,
  billing: BillingService,
  business: Business,
  fields: VoiceCallFields,
  now: Date = new Date(),
): Promise<Call> {
  let call =
    (fields.callSid ? store.findCallByProviderId(business.id, fields.callSid) : undefined) ??
    (await startInboundCall(store, business, fields, now));

  if (call.billedMinutes > 0 && call.status !== "in_progress") {
    return call;
  }

  const started = new Date(call.startedAt).getTime();
  const elapsed =
    fields.durationSeconds != null
      ? fields.durationSeconds
      : Number.isFinite(started)
        ? Math.max(0, Math.round((now.getTime() - started) / 1000))
        : 0;
  const billedMinutes = billedMinutesFromDuration(elapsed);
  const applied = applyCallMinutes(business.subscription, billedMinutes, now);
  const reported =
    applied.overageMinutes > 0 ? await billing.reportOverageMinutes(business, applied.overageMinutes) : false;

  call.endedAt = now.toISOString();
  call.durationSeconds = elapsed;
  call.billedMinutes = applied.billedMinutes;
  call.overageMinutes = applied.overageMinutes;
  call.status = mapStatus(fields.status, elapsed);
  if (call.status === "in_progress") {
    call.status = elapsed > 0 ? "completed" : "missed";
  }
  call.stripeUsageReported = reported;
  if (fields.fromE164) call.fromE164 = fields.fromE164;
  if (fields.toE164) call.toE164 = fields.toE164;
  store.saveCall(call);
  store.saveBusiness(business);
  return call;
}
