import { describe, expect, it, vi, afterEach } from "vitest";
import { ensureDemoBusinesses, MARKETING_DEMO_SLUG } from "../src/store/seed.js";
import {
  cdrFromTelnyxWebhook,
  ingestTelnyxWebhook,
  overlaySharedUsage,
  parseTelnyxCdr,
  resetDemoDidSyncClock,
  syncDemoDidUsage,
  upsertCdrCall,
  usesSharedDemoDid,
} from "../src/telephony/telnyxCdr.js";
import { DEMO_DID_E164 } from "../src/telephony/demoDid.js";
import type { BillingService } from "../src/billing/stripe.js";
import { tempStore } from "./helpers.js";

function billingStub(): BillingService {
  return {
    reportOverageMinutes: async () => false,
  } as unknown as BillingService;
}

afterEach(() => {
  resetDemoDidSyncClock();
  vi.unstubAllGlobals();
});

describe("parseTelnyxCdr", () => {
  it("reads billed_sec from a sip-trunking detail record", () => {
    const cdr = parseTelnyxCdr({
      id: "cdr-1",
      cld: "+351210210260",
      cli: "+351918860880",
      started_at: "2026-09-18T15:35:47Z",
      finished_at: "2026-09-18T15:36:46Z",
      call_sec: 59,
      billed_sec: 60,
      direction: "inbound",
      record_type: "sip-trunking",
    });
    expect(cdr?.id).toBe("cdr-1");
    expect(cdr?.billedSec).toBe(60);
    expect(cdr?.cli).toBe("+351918860880");
  });

  it("returns null without an id or start", () => {
    expect(parseTelnyxCdr({ billed_sec: 60 })).toBeNull();
  });
});

describe("demo DID usage owner", () => {
  it("treats unprovisioned tenants and clinica-central as sharing 210210260", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    expect(clinic.number?.e164).toBe(DEMO_DID_E164);
    expect(usesSharedDemoDid(clinic)).toBe(true);

    const pending = store.createBusiness({
      name: "Novo Salão",
      useCase: "salao",
      locale: "pt",
      agentName: "Atende",
      agentGender: "neutro",
      planId: "base",
    });
    expect(usesSharedDemoDid(pending)).toBe(true);
    const overlaid = overlaySharedUsage(pending, { ...clinic, subscription: { ...clinic.subscription, usedMinutes: 19 } });
    expect(overlaid.usedMinutes).toBe(19);
    expect(overlaid.includedMinutes).toBe(200);
    expect(overlaid.overageMinutes).toBe(0);
  });
});

describe("upsertCdrCall", () => {
  it("persists a Telnyx CDR and deducts billed minutes once", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const before = clinic.subscription.usedMinutes;
    const cdr = parseTelnyxCdr({
      id: "cdr-demo-1",
      cld: "+351210210260",
      cli: "+351918860880",
      started_at: "2026-09-18T15:35:47.000Z",
      finished_at: "2026-09-18T15:36:46.000Z",
      call_sec: 59,
      billed_sec: 60,
      direction: "inbound",
      record_type: "sip-trunking",
    })!;
    const first = await upsertCdrCall(store, billingStub(), clinic, cdr);
    expect(first.billedMinutes).toBe(1);
    expect(first.provider).toBe("telnyx");
    expect(store.listCalls(clinic.id)).toHaveLength(1);
    expect(clinic.subscription.usedMinutes).toBe(before + 1);

    await upsertCdrCall(store, billingStub(), clinic, cdr);
    expect(store.listCalls(clinic.id)).toHaveLength(1);
    expect(clinic.subscription.usedMinutes).toBe(before + 1);
  });
});

describe("Telnyx webhook + API sync", () => {
  it("ingests a detail-record webhook onto clinica-central", async () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const result = await ingestTelnyxWebhook(store, billingStub(), {
      event_type: "detail_record.sip_trunking",
      data: {
        payload: {
          id: "wh-1",
          cld: "+351210210260",
          cli: "+351910000099",
          started_at: "2026-09-18T12:00:00.000Z",
          billed_sec: 125,
          call_sec: 120,
          direction: "inbound",
          record_type: "sip-trunking",
        },
      },
    });
    expect(result.ingested).toBe(true);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const calls = store.listCalls(clinic.id);
    expect(calls).toHaveLength(1);
    expect(calls[0].billedMinutes).toBe(3);
    expect(cdrFromTelnyxWebhook({ event_type: "call.hangup", data: { payload: { id: "x" } } })).toBeNull();
  });

  it("does not invent minutes when Telnyx returns no CDRs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
    );
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const used = clinic.subscription.usedMinutes;
    const result = await syncDemoDidUsage(store, billingStub());
    expect(result.skipped).toBe(false);
    expect(result.synced).toBe(0);
    expect(store.listCalls(clinic.id)).toEqual([]);
    expect(clinic.subscription.usedMinutes).toBe(used);
  });
});
