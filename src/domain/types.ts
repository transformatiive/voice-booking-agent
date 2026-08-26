export type Locale = "pt" | "en";

export type UseCase = "barbearia" | "salao" | "clinica" | "restaurante" | "outro";

export type PlanId = "base" | "pro" | "studio";

export type AgentGender = "feminino" | "masculino" | "neutro";

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
  /** Cal.com event type id backing this service, when connected. */
  calEventTypeId: number | null;
}

export interface Resource {
  id: string;
  /** Display name, e.g. the barber's name. */
  name: string;
  /** Mobile number (E.164) used for warm transfers. */
  transferNumber: string | null;
  /** "Disponível" (accepts warm transfers) vs "A cortar" (busy). */
  available: boolean;
  /** Cal.com user/member id when using per-resource calendars. */
  calUserId: number | null;
}

export interface DayHours {
  /** Minutes since midnight, or null when closed that day. */
  open: number | null;
  close: number | null;
}

/** Indexed 0=Sunday … 6=Saturday. */
export type WeeklyHours = [DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours];

export type NumberType = "mobile" | "geographic" | "tollfree";

export type NumberStatus = "none" | "provisioning" | "active" | "porting" | "released";

export interface PhoneNumber {
  e164: string;
  provider: "telnyx" | "zadarma" | "mock";
  type: NumberType;
  status: NumberStatus;
  monthlyCostCents: number;
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "none";

export interface Subscription {
  planId: PlanId;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  includedMinutes: number;
  usedMinutes: number;
  currentPeriodEnd: string | null;
}

/** "pending" while we handle the number + SIP setup; "active" once ready. */
export type AccountStatus = "pending" | "active";

export type NumberPreference = "new" | "port";

export interface Business {
  id: string;
  slug: string;
  name: string;
  useCase: UseCase;
  locale: Locale;
  agentName: string;
  agentGender: AgentGender;
  timezone: string;
  status: AccountStatus;
  contactEmail: string | null;
  contactPhone: string | null;
  numberPreference: NumberPreference;
  hours: WeeklyHours;
  services: Service[];
  resources: Resource[];
  number: PhoneNumber | null;
  subscription: Subscription;
  /** Per-tenant Cal.com key overrides the global one when present. */
  calApiKey: string | null;
  createdAt: string;
}

export type BookingSource = "web" | "voice" | "backoffice";

export interface Booking {
  id: string;
  businessId: string;
  serviceId: string;
  serviceName: string;
  resourceId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  start: string;
  end: string;
  source: BookingSource;
  calBookingUid: string | null;
  createdAt: string;
}
