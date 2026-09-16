import { randomUUID } from "node:crypto";
import { DEFAULT_AGENT_NAME } from "../domain/agent.js";
import type { UseCase, WeeklyHours } from "../domain/types.js";
import type { Store } from "./store.js";
import { listDemoOptions } from "../telephony/demoDid.js";

/** Marketing homepage live-call tenant (multi-specialty clinic, PT). */
export const MARKETING_DEMO_SLUG = "clinica-central";
/** Legacy demo URL — still served, but no longer linked from the homepage. */
export const LEGACY_BARBER_DEMO_SLUG = "barbearia-lisboa";

export const DEMO_USE_CASE_SLUGS = listDemoOptions().map((option) => option.slug);

const DEMO_SEEDS: Array<{
  slug: string;
  name: string;
  useCase: UseCase;
  email: string;
  resourceName: string;
  extraResources?: Array<{ name: string; transferNumber: string; available: boolean }>;
  hours?: WeeklyHours;
}> = [
  {
    slug: "clinica-central",
    name: "Clínica Central",
    useCase: "clinica",
    email: "geral@clinicacentral.pt",
    resourceName: "Recepção",
    hours: clinicHours(),
  },
  {
    slug: "barbearia-lisboa",
    name: "Barbearia Lisboa",
    useCase: "barbearia",
    email: "geral@barbearialisboa.pt",
    resourceName: "João",
    extraResources: [{ name: "Miguel", transferNumber: "+351920000000", available: false }],
  },
  {
    slug: "restaurante-baixa",
    name: "Restaurante Baixa",
    useCase: "restaurante",
    email: "geral@restaurantebaixa.pt",
    resourceName: "Sala",
  },
  {
    slug: "oficina-norte",
    name: "Oficina Norte",
    useCase: "oficina",
    email: "geral@oficinanorte.pt",
    resourceName: "Balcão",
  },
  {
    slug: "imobiliaria-baixa",
    name: "Imobiliária Baixa",
    useCase: "imobiliaria",
    email: "geral@imobiliariabaixa.pt",
    resourceName: "Consultor",
  },
];

/** Homepage + /demo tenants that must complete a booking in voice without Cal.com. */
export function isVoiceDemoSlug(slug: string): boolean {
  return DEMO_USE_CASE_SLUGS.includes(slug);
}

function clinicHours(): WeeklyHours {
  const closed = { open: null, close: null };
  const weekday = { open: 8 * 60, close: 20 * 60 };
  const saturday = { open: 9 * 60, close: 13 * 60 };
  return [closed, weekday, weekday, weekday, weekday, weekday, saturday];
}

/**
 * Ensures every live picker tenant exists, including when older persisted
 * stores only had the clinic and barbearia demos.
 */
export function ensureDemoBusinesses(store: Store): void {
  for (const seed of DEMO_SEEDS) {
    ensureDemo(store, seed);
  }
}

function ensureDemo(
  store: Store,
  seed: (typeof DEMO_SEEDS)[number],
): void {
  if (store.getBusinessBySlug(seed.slug)) {
    return;
  }
  const demo = store.createBusiness({
    name: seed.name,
    useCase: seed.useCase,
    locale: "pt",
    agentName: DEFAULT_AGENT_NAME,
    agentGender: "neutro",
    planId: "pro",
    status: "active",
    contactEmail: seed.email,
  });
  if (demo.slug !== seed.slug) {
    console.warn(`[seed] expected slug ${seed.slug}, got ${demo.slug}`);
  }
  if (seed.hours) {
    demo.hours = seed.hours;
  }
  demo.resources = [
    {
      id: demo.resources[0].id,
      name: seed.resourceName,
      transferNumber: "+351910000001",
      available: true,
      calUserId: null,
    },
    ...(seed.extraResources ?? []).map((resource) => ({
      id: randomUUID(),
      name: resource.name,
      transferNumber: resource.transferNumber,
      available: resource.available,
      calUserId: null,
    })),
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
