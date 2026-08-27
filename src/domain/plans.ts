import type { PlanId } from "./types.js";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly list price in EUR cents. Includes the DID rental in COGS. */
  priceCents: number;
  includedMinutes: number;
  /** Metered overage price per minute, EUR cents. */
  overageCentsPerMinute: number;
  maxResources: number | null;
  /** Marketing bullet points (PT). */
  features: string[];
}

/**
 * Pricing bakes the monthly number (DID) rental into the plan price, per the
 * product strategy: customers never see a separate "number fee". A mobile
 * +351 DID rents for a few euros/month; that cost lives in COGS below.
 */
export const PLANS: Record<PlanId, Plan> = {
  base: {
    id: "base",
    name: "Base",
    priceCents: 4900,
    includedMinutes: 200,
    overageCentsPerMinute: 12,
    maxResources: 1,
    features: [
      "1 número +351 incluído",
      "200 minutos de atendimento incluídos",
      "Agendamento por voz com Google Calendar (evita conflitos e sobreposições)",
      "Transferência de chamada para o seu telemóvel",
      "Suporte por email",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 9900,
    includedMinutes: 600,
    overageCentsPerMinute: 10,
    maxResources: 3,
    features: [
      "Tudo do Base",
      "600 minutos incluídos",
      "Até 3 recursos (profissionais/espaços)",
      "Lembretes automáticos e reagendamento",
      "Relatórios de chamadas e reservas",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    priceCents: 19900,
    includedMinutes: 1500,
    overageCentsPerMinute: 8,
    maxResources: null,
    features: [
      "Tudo do Pro",
      "1500 minutos incluídos",
      "Recursos ilimitados",
      "Multi-idioma (PT/EN) e horários alargados",
      "Atendimento prioritário",
    ],
  },
};

/** One-time setup fee for number portability / white-glove onboarding (EUR cents). */
export const PORTABILITY_SETUP_FEE_CENTS = 14900;

export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}
