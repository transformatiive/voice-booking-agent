export type Locale = "pt" | "en";

export type UseCase =
  | "barbearia"
  | "salao"
  | "clinica"
  | "restaurante"
  | "oficina"
  | "imobiliaria"
  | "ginasio"
  | "outro";

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
  /** Display name — doctor, barber, consultant, photographer, etc. */
  name: string;
  /** Free-text role/type (médico, terapeuta, barbeiro, consultor…). */
  role: string;
  /** Services this person can perform. Empty means none assigned yet. */
  serviceIds: string[];
  /** Optional hours; null inherits the business-wide timetable. */
  hours: WeeklyHours | null;
  /** Mobile number (E.164) used for warm transfers. Routing/IVR is out of scope. */
  transferNumber: string | null;
  /** Availability hook: can take bookings right now. */
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

export type NumberStatus =
  | "none"
  | "provisioning"
  | "pending_approval"
  | "active"
  | "porting"
  | "released";

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
  /** Minutes billed above the included allowance in the current period. */
  overageMinutes: number;
  /** Signup / plan-start timestamp; usage resets on each monthly anniversary. */
  planStartedAt: string;
  currentPeriodStart: string | null;
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
  /** How the voice agent should answer (owner-edited, pre-filled from use case). */
  agentScript: string;
  /** Free-text company/service knowledge the agent may use. Text only. */
  agentKnowledge: string;
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
  /** Required: every booking is assigned to a resource. */
  resourceId: string;
  customerName: string | null;
  customerPhone: string | null;
  start: string;
  end: string;
  source: BookingSource;
  calBookingUid: string | null;
  createdAt: string;
}

export type CallStatus = "in_progress" | "completed" | "missed" | "failed";
export type CallProvider = "telnyx" | "zadarma" | "mock";

/** Inbound call on the business DID. Not derived from bookings. */
export interface Call {
  id: string;
  businessId: string;
  provider: CallProvider;
  providerCallId: string | null;
  fromE164: string | null;
  toE164: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  billedMinutes: number;
  overageMinutes: number;
  status: CallStatus;
  stripeUsageReported: boolean;
  createdAt: string;
}
