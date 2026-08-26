import * as chrono from "chrono-node";
import type { Intent, ParsedMessage } from "../types.js";
import { matchService } from "../booking/catalog.js";

const AFFIRM = /\b(yes|yep|yeah|sure|correct|confirm|ok|okay|sounds good|do it|please)\b/i;
const DENY = /\b(no|nope|nah|cancel that|don'?t|do not|stop)\b/i;

function detectIntent(text: string, hasService: boolean, hasDateTime: boolean): Intent {
  const t = text.toLowerCase().trim();

  if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t)) {
    return "greeting";
  }
  if (/\b(help|what can you do|how does this work)\b/.test(t)) {
    return "help";
  }
  if (/\b(services?|what do you offer|menu|options)\b/.test(t) && !/\bbook|schedule|appointment\b/.test(t)) {
    return "list_services";
  }
  if (/\b(my (appointments?|bookings?)|show (my )?(appointments?|bookings?)|list (appointments?|bookings?))\b/.test(t)) {
    return "list_bookings";
  }
  if (/\b(cancel|delete|remove)\b/.test(t)) {
    return "cancel";
  }
  if (/\b(available|availability|free|opening|open slots?|when can)\b/.test(t)) {
    return "check_availability";
  }
  // Standalone confirmations only matter when the text is essentially just that.
  if (AFFIRM.test(t) && t.split(/\s+/).length <= 4) {
    return "affirm";
  }
  if (DENY.test(t) && t.split(/\s+/).length <= 4) {
    return "deny";
  }
  // A booking keyword, a service name, or a concrete date/time all indicate the
  // user is trying to schedule something.
  if (/\b(book|schedule|reserve|appointment|set up|make an?)\b/.test(t) || hasService || hasDateTime) {
    return "book";
  }
  return "unknown";
}

function extractName(text: string): string | null {
  const patterns = [
    /\bmy name is ([a-z][a-z' -]+)/i,
    /\bi am ([a-z][a-z' -]+)/i,
    /\bi'?m ([a-z][a-z' -]+)/i,
    /\bfor ([a-z][a-z' -]+?)(?: at| on| tomorrow| today| next|[.,!?]|$)/i,
    /\bunder (?:the name )?([a-z][a-z' -]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const candidate = match[1].trim().replace(/\s+/g, " ");
      // Guard against capturing service/time words as a name.
      if (candidate.length >= 2 && !/\b(haircut|massage|appointment|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(candidate)) {
        return titleCase(candidate);
      }
    }
  }
  return null;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function parseMessage(text: string, referenceDate: Date = new Date()): ParsedMessage {
  const service = matchService(text);

  const results = chrono.parse(text, referenceDate, { forwardDate: true });
  let dateTime: string | null = null;
  let dateOnly = false;
  if (results.length > 0) {
    const result = results[0];
    dateTime = result.start.date().toISOString();
    dateOnly = !result.start.isCertain("hour");
  }

  const intent = detectIntent(text, service !== null, dateTime !== null);

  return {
    intent,
    service,
    dateTime,
    dateOnly,
    customerName: extractName(text),
  };
}
