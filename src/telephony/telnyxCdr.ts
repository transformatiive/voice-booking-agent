import { config } from "../config.js";
import { applyCallMinutes, billedMinutesFromDuration } from "../billing/usage.js";
import type { BillingService } from "../billing/stripe.js";
import type { Business, Call, PhoneNumber, Subscription } from "../domain/types.js";
import { DEMO_DID_DISPLAY_INTL, DEMO_DID_E164, isDemoDid } from "./demoDid.js";
import type { Store } from "../store/store.js";
import { MARKETING_DEMO_SLUG } from "../store/seed.js";

const TELNYX_API = "https://api.telnyx.com/v2";
const RECORD_TYPES = ["sip-trunking", "call-control"] as const;

export interface TelnyxCdr {
  id: string;
  cld: string | null;
  cli: string | null;
  startedAt: string;
  finishedAt: string | null;
  callSec: number;
  billedSec: number;
  direction: string;
  recordType: string;
}

export interface DemoDidUsageView {
  shared: boolean;
  e164: string;
  display: string;
  ownerSlug: string;
}

/** Until a tenant has its own active DID, Chamadas/Faturação use the Lisbon demo line. */
export function usesSharedDemoDid(business: Business): boolean {
  if (business.slug === MARKETING_DEMO_SLUG) {
    return true;
  }
  const e164 = business.number?.e164;
  if (!e164) {
    return true;
  }
  if (isDemoDid(e164) || e164 === config.demoDidE164) {
    return true;
  }
  return business.number?.status !== "active";
}

export function demoDidUsageView(viewer: Business): DemoDidUsageView {
  const shared = usesSharedDemoDid(viewer);
  return {
    shared,
    e164: shared ? DEMO_DID_E164 : (viewer.number?.e164 ?? DEMO_DID_E164),
    display: shared ? DEMO_DID_DISPLAY_INTL : (viewer.number?.e164 ?? DEMO_DID_DISPLAY_INTL),
    ownerSlug: MARKETING_DEMO_SLUG,
  };
}

export function overlaySharedUsage(viewer: Business, owner: Business): Subscription {
  const usedMinutes = owner.subscription.usedMinutes;
  return {
    ...viewer.subscription,
    usedMinutes,
    overageMinutes: Math.max(0, usedMinutes - viewer.subscription.includedMinutes),
  };
}

export function overlaySharedNumber(viewer: Business): PhoneNumber {
  return {
    e164: DEMO_DID_E164,
    provider: "telnyx",
    type: "geographic",
    status: viewer.number?.status === "active" ? "active" : (viewer.number?.status ?? "provisioning"),
    monthlyCostCents: viewer.number?.monthlyCostCents ?? 0,
  };
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseTelnyxCdr(raw: Record<string, unknown>): TelnyxCdr | null {
  const id = str(raw.id) ?? str(raw.call_control_id) ?? str(raw.call_session_id);
  if (!id) {
    return null;
  }
  const startedAt = str(raw.started_at) ?? str(raw.start_time);
  if (!startedAt) {
    return null;
  }
  const cld = str(raw.cld) ?? str(raw.dest_number) ?? str(raw.to);
  const cli = str(raw.cli) ?? str(raw.caller_number) ?? str(raw.from);
  return {
    id,
    cld,
    cli,
    startedAt,
    finishedAt: str(raw.finished_at) ?? str(raw.end_time),
    callSec: num(raw.call_sec) || num(raw.duration_sec),
    billedSec: num(raw.billed_sec) || num(raw.call_sec) || num(raw.duration_sec),
    direction: str(raw.direction) ?? "",
    recordType: str(raw.record_type) ?? "",
  };
}

function isDemoDidCld(cld: string | null): boolean {
  if (!cld) {
    return false;
  }
  const digits = cld.replace(/\D/g, "");
  const demo = DEMO_DID_E164.replace(/\D/g, "");
  return digits === demo || digits.endsWith(demo.slice(-9)) || isDemoDid(cld);
}

function cdrFingerprint(cdr: Pick<TelnyxCdr, "cli" | "startedAt" | "cld">): string {
  return `${cdr.cli ?? ""}|${cdr.startedAt}|${cdr.cld ?? ""}`;
}

async function fetchDetailRecords(recordType: string, dateRange: string, contains: string): Promise<TelnyxCdr[]> {
  const apiKey = config.telephony.telnyxApiKey;
  if (!apiKey) {
    return [];
  }
  const params = new URLSearchParams({
    "filter[record_type]": recordType,
    "filter[date_range]": dateRange,
    "filter[cld][contains]": contains,
    "page[size]": "50",
  });
  const res = await fetch(`${TELNYX_API}/detail_records?${params.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    console.error(`[telnyx-cdr] ${recordType} ${dateRange} -> ${res.status}`);
    return [];
  }
  const payload = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (payload.data ?? []).map(parseTelnyxCdr).filter((row): row is TelnyxCdr => Boolean(row));
}

/** Real Telnyx CDRs for the Lisbon demo DID. Empty when the key is missing — never invented. */
export async function fetchDemoDidCdrs(): Promise<TelnyxCdr[]> {
  const nsn = DEMO_DID_E164.replace(/\D/g, "").slice(-9);
  const byId = new Map<string, TelnyxCdr>();
  const fingerprints = new Set<string>();
  for (const recordType of RECORD_TYPES) {
    for (const range of ["this_month", "last_week"] as const) {
      const rows = await fetchDetailRecords(recordType, range, nsn);
      for (const row of rows) {
        if (row.direction && row.direction !== "inbound") {
          continue;
        }
        if (!isDemoDidCld(row.cld) && row.cld) {
          continue;
        }
        const fingerprint = cdrFingerprint(row);
        if (byId.has(row.id) || fingerprints.has(fingerprint)) {
          continue;
        }
        byId.set(row.id, row);
        fingerprints.add(fingerprint);
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function findMatchingCall(store: Store, businessId: string, cdr: TelnyxCdr): Call | undefined {
  const byProvider = store.findCallByProviderId(businessId, cdr.id);
  if (byProvider) {
    return byProvider;
  }
  return store.listCalls(businessId).find(
    (call) => call.startedAt === cdr.startedAt && (call.fromE164 ?? null) === (cdr.cli ?? null),
  );
}

export async function upsertCdrCall(
  store: Store,
  billing: BillingService,
  business: Business,
  cdr: TelnyxCdr,
): Promise<Call> {
  const existing = findMatchingCall(store, business.id, cdr);
  if (existing && existing.billedMinutes > 0) {
    return existing;
  }
  const durationSeconds = cdr.billedSec || cdr.callSec;
  const billedMinutes = billedMinutesFromDuration(durationSeconds);
  const applied = existing && existing.billedMinutes > 0
    ? { billedMinutes: existing.billedMinutes, overageMinutes: existing.overageMinutes }
    : applyCallMinutes(business.subscription, billedMinutes, new Date(cdr.startedAt));
  const reported =
    !existing && applied.overageMinutes > 0
      ? await billing.reportOverageMinutes(business, applied.overageMinutes)
      : Boolean(existing?.stripeUsageReported);

  const call: Call = {
    id: existing?.id ?? cdr.id,
    businessId: business.id,
    provider: "telnyx",
    providerCallId: cdr.id,
    fromE164: cdr.cli,
    toE164: cdr.cld ?? DEMO_DID_E164,
    startedAt: cdr.startedAt,
    endedAt: cdr.finishedAt,
    durationSeconds,
    billedMinutes: applied.billedMinutes,
    overageMinutes: applied.overageMinutes,
    status: durationSeconds > 0 ? "completed" : "missed",
    stripeUsageReported: reported,
    createdAt: existing?.createdAt ?? cdr.startedAt,
  };
  if (existing) {
    store.saveCall(call);
  } else {
    store.addCall(call);
  }
  store.saveBusiness(business);
  return call;
}

let lastSyncAt = 0;
const SYNC_MS = 60_000;

export async function syncDemoDidUsage(
  store: Store,
  billing: BillingService,
  now = Date.now(),
): Promise<{ synced: number; skipped: boolean }> {
  if (now - lastSyncAt < SYNC_MS) {
    return { synced: 0, skipped: true };
  }
  lastSyncAt = now;
  const business = store.getBusinessBySlug(MARKETING_DEMO_SLUG);
  if (!business) {
    return { synced: 0, skipped: false };
  }
  const cdrs = await fetchDemoDidCdrs();
  let synced = 0;
  for (const cdr of cdrs) {
    const before = findMatchingCall(store, business.id, cdr);
    await upsertCdrCall(store, billing, business, cdr);
    if (!before) {
      synced += 1;
    }
  }
  return { synced, skipped: false };
}

/** Test helper: allow unit tests to re-run sync immediately. */
export function resetDemoDidSyncClock(): void {
  lastSyncAt = 0;
}

export function demoDidUsageBusiness(store: Store, viewer: Business): Business {
  if (viewer.slug === MARKETING_DEMO_SLUG) {
    return viewer;
  }
  if (!usesSharedDemoDid(viewer)) {
    return viewer;
  }
  return store.getBusinessBySlug(MARKETING_DEMO_SLUG) ?? viewer;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Telnyx detail-record webhooks only — hangup CallSids are not billed here (IDs differ from CDRs). */
export function cdrFromTelnyxWebhook(body: unknown): TelnyxCdr | null {
  const root = asRecord(body);
  if (!root) {
    return null;
  }
  const data = asRecord(root.data) ?? root;
  const eventType = str(root.event_type) ?? str(data.event_type) ?? "";
  const payload = asRecord(data.payload) ?? data;
  const looksLikeCdr =
    eventType.includes("detail_record") ||
    payload.billed_sec != null ||
    payload.record_type === "sip-trunking" ||
    payload.record_type === "call-control";
  if (!looksLikeCdr) {
    return null;
  }
  const cdr = parseTelnyxCdr(payload);
  if (!cdr) {
    return null;
  }
  if (cdr.direction && cdr.direction !== "inbound") {
    return null;
  }
  if (cdr.cld && !isDemoDidCld(cdr.cld)) {
    return null;
  }
  return cdr;
}

export async function ingestTelnyxWebhook(
  store: Store,
  billing: BillingService,
  body: unknown,
): Promise<{ ingested: boolean }> {
  const cdr = cdrFromTelnyxWebhook(body);
  if (!cdr) {
    return { ingested: false };
  }
  const business = store.getBusinessBySlug(MARKETING_DEMO_SLUG);
  if (!business) {
    return { ingested: false };
  }
  await upsertCdrCall(store, billing, business, cdr);
  return { ingested: true };
}
