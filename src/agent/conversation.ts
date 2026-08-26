import type { Booking, Business, BookingSource, Locale, Service } from "../domain/types.js";
import type { Store } from "../store/store.js";
import type { Scheduler } from "../scheduling/scheduler.js";
import { checkAvailability, suggestSlots } from "../scheduling/availability.js";
import type { Unavailable } from "../scheduling/availability.js";
import { parseMessage } from "./nlu.js";

interface SessionState {
  serviceId: string | null;
  start: Date | null;
  customerName: string | null;
  customerPhone: string | null;
  awaitingConfirmation: boolean;
  askedName: boolean;
}

export interface AgentReply {
  reply: string;
  booking?: Booking;
  bookings?: Booking[];
}

function newSession(): SessionState {
  return {
    serviceId: null,
    start: null,
    customerName: null,
    customerPhone: null,
    awaitingConfirmation: false,
    askedName: false,
  };
}

function bcp47(locale: Locale): string {
  return locale === "pt" ? "pt-PT" : "en-US";
}

function formatDateTime(date: Date, business: Business): string {
  return new Intl.DateTimeFormat(bcp47(business.locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: business.timezone,
  }).format(date);
}

function formatTime(date: Date, business: Business): string {
  return new Intl.DateTimeFormat(bcp47(business.locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: business.timezone,
  }).format(date);
}

function servicesSentence(business: Business): string {
  return business.services
    .map((s) => {
      const price = s.priceCents !== null ? ` (${(s.priceCents / 100).toFixed(0)}€)` : "";
      return `${s.name}${price}`;
    })
    .join(", ");
}

export class ConversationManager {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly store: Store,
    private readonly scheduler: Scheduler,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private session(id: string): SessionState {
    let state = this.sessions.get(id);
    if (!state) {
      state = newSession();
      this.sessions.set(id, state);
    }
    return state;
  }

  reset(sessionId: string): void {
    this.sessions.set(sessionId, newSession());
  }

  private service(business: Business, id: string | null): Service | null {
    return business.services.find((s) => s.id === id) ?? null;
  }

  async handle(
    business: Business,
    sessionId: string,
    text: string,
    customerPhone: string | null = null,
    source: BookingSource = "web",
  ): Promise<AgentReply> {
    const state = this.session(sessionId);
    if (customerPhone) {
      state.customerPhone = customerPhone;
    }
    const parsed = parseMessage(business, text, this.now());
    const L = business.locale;

    if (parsed.customerName) {
      state.customerName = parsed.customerName;
    }

    if (state.askedName && !parsed.customerName && parsed.intent === "unknown") {
      const trimmed = text.trim();
      if (/^[\p{L}][\p{L}' -]{1,40}$/u.test(trimmed)) {
        state.customerName = trimmed.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
      }
      state.askedName = false;
      return this.progressBooking(business, state, source);
    }

    switch (parsed.intent) {
      case "greeting":
        return { reply: greeting(business) };
      case "help":
        return {
          reply:
            L === "pt"
              ? `Diga-me o que pretende marcar e quando, por exemplo: "Marcar amanhã às 15h". Também pode perguntar pelos serviços ou pela disponibilidade.`
              : `Tell me what you'd like to book and when, e.g. "Book tomorrow at 3pm". You can also ask about services or availability.`,
        };
      case "list_services":
        return {
          reply:
            L === "pt"
              ? `Oferecemos: ${servicesSentence(business)}. Qual pretende?`
              : `We offer: ${servicesSentence(business)}. Which one would you like?`,
        };
      case "list_bookings": {
        const bookings = this.store.listBookings(business.id);
        if (bookings.length === 0) {
          return { reply: L === "pt" ? "Ainda não tem marcações." : "You have no appointments yet.", bookings };
        }
        const lines = bookings.map((b) => `- ${b.serviceName} — ${formatDateTime(new Date(b.start), business)}`);
        return {
          reply: `${L === "pt" ? "As marcações:" : "Appointments:"}\n${lines.join("\n")}`,
          bookings,
        };
      }
      case "cancel":
        return this.handleCancel(business, parsed.serviceId);
      case "check_availability":
        return this.handleAvailability(business, state, parsed.serviceId, parsed.dateTime);
      case "affirm":
        return this.handleAffirm(business, state, source);
      case "deny":
        return this.handleDeny(business, state);
      case "book":
        if (parsed.serviceId) {
          state.serviceId = parsed.serviceId;
        }
        if (parsed.dateTime && !parsed.dateOnly) {
          state.start = new Date(parsed.dateTime);
        } else if (parsed.dateTime && parsed.dateOnly) {
          return this.handleAvailability(business, state, state.serviceId, parsed.dateTime);
        }
        state.awaitingConfirmation = false;
        return this.progressBooking(business, state, source);
      case "unknown":
        return this.progressBooking(business, state, source, true);
      default: {
        const exhaustive: never = parsed.intent;
        throw new Error(`Unhandled intent: ${String(exhaustive)}`);
      }
    }
  }

  private progressBooking(
    business: Business,
    state: SessionState,
    source: BookingSource,
    fromUnknown = false,
  ): AgentReply {
    const L = business.locale;
    const service = this.service(business, state.serviceId);

    if (!service) {
      const lead =
        L === "pt"
          ? fromUnknown
            ? "Posso ajudar a marcar. Que serviço pretende?"
            : "Claro! Que serviço pretende?"
          : fromUnknown
            ? "I can help you book. Which service would you like?"
            : "Sure! Which service would you like?";
      return { reply: `${lead} ${L === "pt" ? "Temos" : "We offer"}: ${servicesSentence(business)}.` };
    }

    if (!state.start) {
      return {
        reply:
          L === "pt"
            ? `Perfeito — ${service.name}. Para que dia e hora?`
            : `Great — ${service.name}. What day and time works for you?`,
      };
    }

    const bookings = this.store.listBookings(business.id);
    const availability = checkAvailability(business, service, state.start, bookings, this.now());
    if (!availability.ok) {
      return this.explainUnavailable(business, state, service, availability.reason);
    }

    if (!state.customerName && !state.askedName && source !== "voice") {
      state.askedName = true;
      return { reply: L === "pt" ? "Em que nome fica a marcação?" : "What name should I put it under?" };
    }

    state.awaitingConfirmation = true;
    const namePart = state.customerName ? (L === "pt" ? ` para ${state.customerName}` : ` for ${state.customerName}`) : "";
    return {
      reply:
        L === "pt"
          ? `Confirmar: ${service.name} — ${formatDateTime(state.start, business)}${namePart}. Confirmo? (sim/não)`
          : `Please confirm: ${service.name} — ${formatDateTime(state.start, business)}${namePart}. Shall I book it? (yes/no)`,
    };
  }

  private explainUnavailable(
    business: Business,
    state: SessionState,
    service: Service,
    reason: Unavailable,
  ): AgentReply {
    const L = business.locale;
    const bookings = this.store.listBookings(business.id);
    const suggestions = suggestSlots(business, service, state.start!, bookings, this.now());
    const times = suggestions.map((s) => formatTime(s, business)).join(", ");
    const suggestionText = suggestions.length
      ? L === "pt"
        ? ` Horas livres nesse dia: ${times}.`
        : ` Open times that day: ${times}.`
      : "";
    state.start = null;
    switch (reason) {
      case "past":
        return {
          reply: L === "pt" ? `Essa hora já passou. Escolha uma hora futura.${suggestionText}` : `That time is in the past.${suggestionText}`,
        };
      case "closed_day":
        return {
          reply: L === "pt" ? "Estamos fechados nesse dia. Que outro dia prefere?" : "We're closed that day. Which other day?",
        };
      case "outside_hours":
        return {
          reply:
            L === "pt"
              ? `Esse horário está fora do nosso funcionamento.${suggestionText || " Escolha uma hora dentro do horário."}`
              : `That's outside business hours.${suggestionText || " Please pick a time within hours."}`,
        };
      case "conflict":
        return {
          reply:
            L === "pt"
              ? `Essa hora já está ocupada.${suggestionText || " Tente outra hora."}`
              : `That slot is already booked.${suggestionText || " Try another time."}`,
        };
      default: {
        const exhaustive: never = reason;
        throw new Error(`Unhandled reason: ${String(exhaustive)}`);
      }
    }
  }

  private async handleAffirm(
    business: Business,
    state: SessionState,
    source: BookingSource,
  ): Promise<AgentReply> {
    const L = business.locale;
    const service = this.service(business, state.serviceId);
    if (!state.awaitingConfirmation || !service || !state.start) {
      return {
        reply: L === "pt" ? "Não tenho nenhuma marcação por confirmar. O que pretende marcar?" : "I have no pending booking. What would you like to book?",
      };
    }
    const result = await this.scheduler.book({
      business,
      service,
      start: state.start,
      resourceId: firstAvailableResource(business),
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      source,
    });
    if (!result.ok) {
      state.awaitingConfirmation = false;
      if (result.reason === "error") {
        return { reply: L === "pt" ? "Ocorreu um erro a marcar. Tente novamente." : "Something went wrong. Please try again." };
      }
      return this.explainUnavailable(business, state, service, result.reason);
    }
    const booking = result.booking;
    const namePart = booking.customerName ? (L === "pt" ? ` para ${booking.customerName}` : ` for ${booking.customerName}`) : "";
    this.reset(this.sessionIdFor(state));
    return {
      reply:
        L === "pt"
          ? `Marcado! ${booking.serviceName} — ${formatDateTime(new Date(booking.start), business)}${namePart}. Até já!`
          : `Booked! ${booking.serviceName} — ${formatDateTime(new Date(booking.start), business)}${namePart}. See you then!`,
      booking,
    };
  }

  private handleDeny(business: Business, state: SessionState): AgentReply {
    const L = business.locale;
    if (state.awaitingConfirmation) {
      state.awaitingConfirmation = false;
      state.start = null;
      return { reply: L === "pt" ? "Sem problema. Prefere outra hora?" : "No problem. Would you like another time?" };
    }
    return { reply: L === "pt" ? "Certo. Diga se precisar de mais alguma coisa." : "Okay. Let me know if there's anything else." };
  }

  private handleAvailability(
    business: Business,
    state: SessionState,
    serviceId: string | null,
    dateTime: string | null,
  ): AgentReply {
    const L = business.locale;
    const targetId = serviceId ?? state.serviceId;
    if (targetId) {
      state.serviceId = targetId;
    }
    const service = this.service(business, targetId);
    if (!service) {
      return {
        reply: L === "pt" ? `Que serviço pretende? Temos: ${servicesSentence(business)}.` : `Which service? We offer: ${servicesSentence(business)}.`,
      };
    }
    const around = dateTime ? new Date(dateTime) : this.now();
    const bookings = this.store.listBookings(business.id);
    const suggestions = suggestSlots(business, service, around, bookings, this.now());
    if (suggestions.length === 0) {
      return { reply: L === "pt" ? `Não encontrei horas livres nesse dia para ${service.name}. Outro dia?` : `No open slots that day for ${service.name}. Another day?` };
    }
    const dayLabel = new Intl.DateTimeFormat(bcp47(L), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: business.timezone,
    }).format(suggestions[0]);
    const times = suggestions.map((s) => formatTime(s, business)).join(", ");
    return {
      reply:
        L === "pt"
          ? `Para ${service.name} em ${dayLabel}, há: ${times}. Qual prefere?`
          : `For ${service.name} on ${dayLabel}: ${times}. Which works?`,
    };
  }

  private async handleCancel(business: Business, serviceId: string | null): Promise<AgentReply> {
    const L = business.locale;
    const bookings = this.store.listBookings(business.id);
    if (bookings.length === 0) {
      return { reply: L === "pt" ? "Não há marcações para cancelar." : "There are no appointments to cancel." };
    }
    const target = serviceId ? bookings.find((b) => b.serviceId === serviceId) : bookings[bookings.length - 1];
    if (!target) {
      return { reply: L === "pt" ? "Não encontrei essa marcação." : "I couldn't find that appointment." };
    }
    await this.scheduler.cancel(business, target);
    return {
      reply:
        L === "pt"
          ? `Cancelei: ${target.serviceName} — ${formatDateTime(new Date(target.start), business)}.`
          : `Cancelled: ${target.serviceName} — ${formatDateTime(new Date(target.start), business)}.`,
    };
  }

  private sessionIdFor(state: SessionState): string {
    for (const [id, value] of this.sessions.entries()) {
      if (value === state) {
        return id;
      }
    }
    return "default";
  }
}

function firstAvailableResource(business: Business): string | null {
  const available = business.resources.find((r) => r.available);
  return (available ?? business.resources[0])?.id ?? null;
}

export function greeting(business: Business): string {
  const L = business.locale;
  const agent = business.agentName || (L === "en" ? "the assistant" : "o assistente");
  const offered = servicesSentence(business);
  if (L === "pt") {
    if (business.useCase === "clinica") {
      return `Olá! Sou ${agent} da ${business.name}. Posso marcar a sua consulta. Temos: ${offered}. Que especialidade pretende?`;
    }
    const what = business.useCase === "barbearia" ? "ida à barbearia" : "marcação";
    return `Olá! Sou ${agent} da ${business.name}. Posso marcar a sua ${what}. Temos: ${offered}. O que pretende?`;
  }
  if (business.useCase === "clinica") {
    return `Hi! I'm ${agent} at ${business.name}. I can book your consultation. We offer: ${offered}. Which specialty would you like?`;
  }
  return `Hi! I'm ${agent} at ${business.name}. I can book your appointment. We offer: ${offered}. What would you like?`;
}
