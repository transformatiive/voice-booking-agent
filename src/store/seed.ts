import { randomUUID } from "node:crypto";
import type { WeeklyHours } from "../domain/types.js";
import type { Store } from "./store.js";

/** Marketing homepage live-call tenant (multi-specialty clinic, PT). */
export const MARKETING_DEMO_SLUG = "clinica-central";
/** Legacy demo URL — still served, but no longer linked from the homepage. */
export const LEGACY_BARBER_DEMO_SLUG = "barbearia-lisboa";

function clinicHours(): WeeklyHours {
  const closed = { open: null, close: null };
  const weekday = { open: 8 * 60, close: 20 * 60 };
  const saturday = { open: 9 * 60, close: 13 * 60 };
  return [closed, weekday, weekday, weekday, weekday, weekday, saturday];
}

/**
 * Ensures the homepage clinic demo exists even when other businesses
 * (e.g. the original barbearia) were already persisted. Also keeps the
 * legacy barbearia slug so /demo/barbearia-lisboa still resolves.
 */
export function ensureDemoBusinesses(store: Store): void {
  ensureClinicDemo(store);
  ensureBarbeariaDemo(store);
}

function ensureClinicDemo(store: Store): void {
  if (store.getBusinessBySlug(MARKETING_DEMO_SLUG)) {
    return;
  }
  const demo = store.createBusiness({
    name: "Clínica Central",
    useCase: "clinica",
    locale: "pt",
    agentName: "Sofia",
    agentGender: "feminino",
    planId: "pro",
    status: "active",
    contactEmail: "geral@clinicacentral.pt",
  });
  if (demo.slug !== MARKETING_DEMO_SLUG) {
    console.warn(`[seed] expected slug ${MARKETING_DEMO_SLUG}, got ${demo.slug}`);
  }
  demo.hours = clinicHours();
  demo.resources = [
    {
      id: demo.resources[0].id,
      name: "Recepção",
      transferNumber: "+351910000001",
      available: true,
      calUserId: null,
    },
  ];
  demo.number = {
    e164: "+351921000001",
    provider: "mock",
    type: "mobile",
    status: "active",
    monthlyCostCents: 900,
  };
  demo.subscription.status = "trialing";
  store.saveBusiness(demo);
}

function ensureBarbeariaDemo(store: Store): void {
  if (store.getBusinessBySlug(LEGACY_BARBER_DEMO_SLUG)) {
    return;
  }
  const demo = store.createBusiness({
    name: "Barbearia Lisboa",
    useCase: "barbearia",
    locale: "pt",
    agentName: "Sofia",
    agentGender: "feminino",
    planId: "pro",
    status: "active",
    contactEmail: "geral@barbearialisboa.pt",
  });
  demo.resources = [
    {
      id: demo.resources[0].id,
      name: "João",
      transferNumber: "+351910000000",
      available: true,
      calUserId: null,
    },
    { id: randomUUID(), name: "Miguel", transferNumber: "+351920000000", available: false, calUserId: null },
  ];
  demo.number = {
    e164: "+351921234567",
    provider: "mock",
    type: "mobile",
    status: "active",
    monthlyCostCents: 900,
  };
  demo.subscription.status = "trialing";
  store.saveBusiness(demo);
}
