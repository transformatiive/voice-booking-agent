import type { Booking, ServiceId } from "../types.js";
import { getService, SERVICES } from "../booking/catalog.js";
import { checkAvailability, suggestSlots } from "../booking/availability.js";
import type { BookingStore } from "../booking/store.js";
import { parseMessage } from "./nlu.js";

interface SessionState {
  service: ServiceId | null;
  start: Date | null;
  customerName: string | null;
  awaitingConfirmation: boolean;
  askedName: boolean;
}

export interface AgentReply {
  reply: string;
  /** Present when a booking was created during this turn. */
  booking?: Booking;
  /** Present for list/availability answers so the UI can render structured data. */
  bookings?: Booking[];
}

function newSession(): SessionState {
  return {
    service: null,
    start: null,
    customerName: null,
    awaitingConfirmation: false,
    askedName: false,
  };
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function servicesSentence(): string {
  return SERVICES.map((s) => `${s.name} (${s.durationMinutes} min)`).join(", ");
}

export class ConversationManager {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly store: BookingStore,
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

  handle(sessionId: string, text: string): AgentReply {
    const state = this.session(sessionId);
    const now = this.now();
    const parsed = parseMessage(text, now);

    if (parsed.customerName) {
      state.customerName = parsed.customerName;
    }

    // If we asked for a name and got a plain short answer, treat it as the name.
    if (state.askedName && !parsed.customerName && parsed.intent === "unknown") {
      const trimmed = text.trim();
      if (/^[a-z][a-z' -]{1,40}$/i.test(trimmed)) {
        state.customerName = trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
      }
      state.askedName = false;
      return this.progressBooking(state);
    }

    switch (parsed.intent) {
      case "greeting":
        return {
          reply:
            "Hi! I'm your booking assistant. I can schedule appointments for you. " +
            `We offer: ${servicesSentence()}. What would you like to book?`,
        };
      case "help":
        return {
          reply:
            "Tell me what you'd like to book and when, for example: " +
            '"Book a haircut tomorrow at 3pm". You can also ask "what services do you offer?", ' +
            'check availability, or say "show my appointments".',
        };
      case "list_services":
        return { reply: `Here's what we offer: ${servicesSentence()}. Which one would you like?` };
      case "list_bookings": {
        const bookings = this.store.list();
        if (bookings.length === 0) {
          return { reply: "You don't have any appointments booked yet.", bookings };
        }
        const lines = bookings.map(
          (b) => `- ${b.serviceName} on ${formatDateTime(new Date(b.start))}` +
            (b.customerName ? ` for ${b.customerName}` : ""),
        );
        return { reply: `Here are the booked appointments:\n${lines.join("\n")}`, bookings };
      }
      case "cancel":
        return this.handleCancel(parsed.service);
      case "check_availability":
        return this.handleAvailability(state, parsed.service, parsed.dateTime);
      case "affirm":
        return this.handleAffirm(state);
      case "deny":
        return this.handleDeny(state);
      case "book":
        if (parsed.service) {
          state.service = parsed.service;
        }
        if (parsed.dateTime && !parsed.dateOnly) {
          state.start = new Date(parsed.dateTime);
        } else if (parsed.dateTime && parsed.dateOnly) {
          return this.handleAvailability(state, state.service, parsed.dateTime);
        }
        state.awaitingConfirmation = false;
        return this.progressBooking(state);
      case "unknown":
        return this.progressBooking(state, true);
      default: {
        const exhaustive: never = parsed.intent;
        throw new Error(`Unhandled intent: ${String(exhaustive)}`);
      }
    }
  }

  private progressBooking(state: SessionState, fromUnknown = false): AgentReply {
    if (!state.service) {
      return {
        reply: fromUnknown
          ? "I can help you book an appointment. Which service would you like? " +
            `We offer: ${servicesSentence()}.`
          : `Sure! Which service would you like? We offer: ${servicesSentence()}.`,
      };
    }

    const serviceName = getService(state.service).name;

    if (!state.start) {
      return { reply: `Great — a ${serviceName}. What day and time works for you?` };
    }

    const availability = checkAvailability(this.store, state.service, state.start, this.now());
    if (!availability.ok) {
      return this.explainUnavailable(state, availability.reason);
    }

    if (!state.customerName && !state.askedName) {
      state.askedName = true;
      return { reply: "And what name should I put the appointment under?" };
    }

    state.awaitingConfirmation = true;
    const namePart = state.customerName ? ` for ${state.customerName}` : "";
    return {
      reply:
        `Please confirm: ${serviceName} on ${formatDateTime(state.start)}${namePart}. ` +
        "Shall I book it? (yes/no)",
    };
  }

  private explainUnavailable(
    state: SessionState,
    reason: "past" | "closed_day" | "outside_hours" | "conflict",
  ): AgentReply {
    const service = state.service!;
    const start = state.start!;
    const suggestions = suggestSlots(this.store, service, start, this.now());
    const suggestionText =
      suggestions.length > 0
        ? ` The next open times that day are: ${suggestions.map(formatTime).join(", ")}.`
        : "";

    state.start = null;
    switch (reason) {
      case "past":
        return { reply: `That time is in the past. Could you pick a future time?${suggestionText}` };
      case "closed_day":
        return { reply: "We're closed on Sundays. Which other day works for you?" };
      case "outside_hours":
        return {
          reply:
            `We're open 9:00 AM to 5:00 PM.${suggestionText || " Please pick a time within business hours."}`,
        };
      case "conflict":
        return {
          reply: `Sorry, that slot is already booked.${suggestionText || " Please try another time."}`,
        };
      default: {
        const exhaustive: never = reason;
        throw new Error(`Unhandled reason: ${String(exhaustive)}`);
      }
    }
  }

  private handleAffirm(state: SessionState): AgentReply {
    if (!state.awaitingConfirmation || !state.service || !state.start) {
      return { reply: "I don't have a pending booking to confirm. What would you like to schedule?" };
    }
    const availability = checkAvailability(this.store, state.service, state.start, this.now());
    if (!availability.ok) {
      state.awaitingConfirmation = false;
      return this.explainUnavailable(state, availability.reason);
    }
    const booking = this.store.create({
      service: state.service,
      customerName: state.customerName,
      start: state.start,
    });
    const namePart = booking.customerName ? ` for ${booking.customerName}` : "";
    const reply =
      `Booked! Your ${booking.serviceName} is confirmed for ` +
      `${formatDateTime(new Date(booking.start))}${namePart}. See you then!`;
    this.reset(this.sessionIdFor(state));
    return { reply, booking };
  }

  private handleDeny(state: SessionState): AgentReply {
    if (state.awaitingConfirmation) {
      state.awaitingConfirmation = false;
      state.start = null;
      return { reply: "No problem, I won't book that. Would you like a different time?" };
    }
    return { reply: "Okay. Let me know if there's anything else I can book for you." };
  }

  private handleAvailability(
    state: SessionState,
    service: ServiceId | null,
    dateTime: string | null,
  ): AgentReply {
    const targetService = service ?? state.service;
    if (targetService) {
      state.service = targetService;
    }
    if (!targetService) {
      return { reply: `Which service are you interested in? We offer: ${servicesSentence()}.` };
    }
    const around = dateTime ? new Date(dateTime) : this.now();
    const suggestions = suggestSlots(this.store, targetService, around, this.now());
    const serviceName = getService(targetService).name;
    if (suggestions.length === 0) {
      return { reply: `I couldn't find open ${serviceName} slots that day. Try another date?` };
    }
    return {
      reply:
        `For ${serviceName} on ${suggestions[0].toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ` +
        `these times are open: ${suggestions.map(formatTime).join(", ")}. Which works for you?`,
    };
  }

  private handleCancel(service: ServiceId | null): AgentReply {
    const bookings = this.store.list();
    if (bookings.length === 0) {
      return { reply: "There are no appointments to cancel." };
    }
    const target = service ? bookings.find((b) => b.service === service) : bookings[bookings.length - 1];
    if (!target) {
      return { reply: "I couldn't find a matching appointment to cancel." };
    }
    this.store.cancel(target.id);
    return {
      reply: `Cancelled your ${target.serviceName} on ${formatDateTime(new Date(target.start))}.`,
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
