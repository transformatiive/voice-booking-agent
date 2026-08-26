import * as chrono from "chrono-node";
import type { Business, Locale } from "../domain/types.js";

export type Intent =
  | "greeting"
  | "help"
  | "list_services"
  | "book"
  | "check_availability"
  | "list_bookings"
  | "cancel"
  | "affirm"
  | "deny"
  | "unknown";

export interface ParsedMessage {
  intent: Intent;
  serviceId: string | null;
  dateTime: string | null;
  dateOnly: boolean;
  customerName: string | null;
}

const STOPWORDS = new Set([
  "de", "da", "do", "e", "a", "o", "para", "com", "the", "of", "and", "for", "with", "um", "uma",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Match a business service by comparing significant words in its name. */
function matchService(business: Business, text: string): string | null {
  const t = normalize(text);
  let best: { id: string; score: number } | null = null;
  for (const service of business.services) {
    const words = normalize(service.name)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    let score = 0;
    for (const word of words) {
      if (t.includes(word)) {
        score += word.length;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id: service.id, score };
    }
  }
  return best?.id ?? null;
}

function detectIntent(text: string, hasService: boolean, hasDateTime: boolean): Intent {
  const t = normalize(text).trim();

  if (/\b(ola|oi|bom dia|boa tarde|boa noite|hi|hello|hey)\b/.test(t)) {
    return "greeting";
  }
  if (/\b(ajuda|como funciona|help|how does this work)\b/.test(t)) {
    return "help";
  }
  if (
    /\b(servicos|serguicos|o que oferecem|precos|preco|tabela|services|what do you offer|menu)\b/.test(t) &&
    !/\b(marcar|agendar|reservar|book|schedule)\b/.test(t)
  ) {
    return "list_services";
  }
  if (
    /\b(as minhas marcacoes|minhas marcacoes|ver marcacoes|my appointments|my bookings|show my)\b/.test(t)
  ) {
    return "list_bookings";
  }
  if (/\b(cancelar|anular|desmarcar|cancel|delete)\b/.test(t)) {
    return "cancel";
  }
  if (/\b(disponivel|disponibilidade|livre|vagas|horarios|available|availability|free|opening)\b/.test(t)) {
    return "check_availability";
  }
  if (isAffirm(t) && t.split(/\s+/).length <= 4) {
    return "affirm";
  }
  if (isDeny(t) && t.split(/\s+/).length <= 4) {
    return "deny";
  }
  if (
    /\b(marcar|agendar|reservar|marcacao|quero|queria|gostaria|book|schedule|reserve|appointment)\b/.test(t) ||
    hasService ||
    hasDateTime
  ) {
    return "book";
  }
  return "unknown";
}

function isAffirm(t: string): boolean {
  return /\b(sim|claro|confirmo|confirmar|pode ser|isso|certo|ok|okay|yes|yeah|sure|confirm)\b/.test(t);
}

function isDeny(t: string): boolean {
  return /\b(nao|no|nope|cancela isso|nem)\b/.test(t);
}

function extractName(text: string): string | null {
  const patterns = [
    /\bo meu nome (?:e|é) ([a-zà-ú][a-zà-ú' -]+)/i,
    /\bchamo-me ([a-zà-ú][a-zà-ú' -]+)/i,
    /\bem nome de ([a-zà-ú][a-zà-ú' -]+?)(?: para| no| na| às| as| amanha|[.,!?]|$)/i,
    /\bmy name is ([a-z][a-z' -]+)/i,
    /\bfor ([a-z][a-z' -]+?)(?: at| on| tomorrow|[.,!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const candidate = match[1].trim().replace(/\s+/g, " ");
      if (candidate.length >= 2) {
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

const CHRONO_BY_LOCALE: Record<Locale, chrono.Chrono> = {
  pt: chrono.pt.casual,
  en: chrono.en.casual,
};

export function parseMessage(
  business: Business,
  text: string,
  referenceDate: Date = new Date(),
): ParsedMessage {
  const serviceId = matchService(business, text);

  const parser = CHRONO_BY_LOCALE[business.locale] ?? chrono.pt.casual;
  const results = parser.parse(text, referenceDate, { forwardDate: true });
  let dateTime: string | null = null;
  let dateOnly = false;
  if (results.length > 0) {
    dateTime = results[0].start.date().toISOString();
    dateOnly = !results[0].start.isCertain("hour");
  }

  const intent = detectIntent(text, serviceId !== null, dateTime !== null);
  return { intent, serviceId, dateTime, dateOnly, customerName: extractName(text) };
}
