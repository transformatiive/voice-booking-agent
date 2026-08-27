import type { Business, WeeklyHours } from "../domain/types.js";
import { greeting } from "../agent/conversation.js";

export const GROK_VOICE_MODEL = "grok-voice-think-fast-2.0";
/** Warm, friendly female voice — better for a PT phone receptionist than energetic eve. */
export const GROK_VOICE_ID = "ara";
export const GROK_SAMPLE_RATE = 24_000;
export const GROK_CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets";
export const GROK_REALTIME_WS_URL = `wss://api.x.ai/v1/realtime?model=${GROK_VOICE_MODEL}`;

const DAY_NAMES_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface GrokFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
    additionalProperties: boolean;
  };
}

/** Realtime function tools that map 1:1 onto handleVoiceFunction. */
export const GROK_VOICE_TOOLS: GrokFunctionTool[] = [
  {
    type: "function",
    name: "list_services",
    description: "List the services this business offers, with duration and price.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_slots",
    description:
      "Return real available appointment start times (ISO-8601) for a service on a given date. Never invent slots.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name as the caller said it, e.g. Dermatologia" },
        date: { type: "string", description: "ISO date or datetime to search around, e.g. 2026-08-27" },
      },
      required: ["service"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "book_appointment",
    description:
      "Book a confirmed appointment at an exact start time previously returned by get_slots. Do not call this with a guessed time.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name" },
        start: { type: "string", description: "Exact ISO-8601 start from get_slots" },
        customerName: { type: "string", description: "Customer name" },
        customerPhone: { type: "string", description: "Customer phone if given" },
      },
      required: ["service", "start"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_bookings",
    description: "List current appointments for this business.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "cancel_appointment",
    description: "Cancel an appointment by id, service name, or the most recent one if neither is given.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking id from list_bookings" },
        service: { type: "string", description: "Service name of the booking to cancel" },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatHoursSummary(hours: WeeklyHours, locale: "pt" | "en"): string {
  const days = locale === "pt" ? DAY_NAMES_PT : DAY_NAMES_EN;
  const closed = locale === "pt" ? "fechado" : "closed";
  return hours
    .map((day, i) => {
      if (day.open === null || day.close === null) {
        return `${days[i]}: ${closed}`;
      }
      return `${days[i]}: ${minutesToClock(day.open)}–${minutesToClock(day.close)}`;
    })
    .join("; ");
}

export function buildGrokInstructions(business: Business): string {
  const agent = business.agentName || "Sofia";
  const services = business.services
    .map((s) => {
      const price = s.priceCents !== null ? ` (${(s.priceCents / 100).toFixed(0)}€)` : "";
      return `${s.name}${price}, ${s.durationMinutes} min`;
    })
    .join("; ");
  const hours = formatHoursSummary(business.hours, business.locale);

  if (business.locale === "en") {
    const clinicEn =
      business.useCase === "clinica"
        ? [
            "You are the clinic receptionist. You only book consultations — never give medical advice, diagnoses, symptom triage, or clinical opinions.",
            "Ask which specialty they need, propose real slots from tools, confirm name and phone, then say you will send an SMS confirmation.",
          ]
        : [];
    return [
      `You are ${agent}, the appointment voice agent for ${business.name}.`,
      "Speak English. Keep replies short, like a phone call — one or two sentences.",
      `Timezone: ${business.timezone}. Hours: ${hours}. Services: ${services}.`,
      ...clinicEn,
      "Use tools for availability and booking. Never invent free slots. Only confirm a booking after book_appointment returns ok.",
      "After a tool returns, speak the result immediately using the speak/message fields. Never stall with 'one moment', 'starting', or filler — the caller must hear times or a taken-slot alternative in the same turn.",
      "Ask the customer's name before booking. If a tool errors, say so briefly and offer another time.",
    ].join(" ");
  }

  const clinicPt =
    business.useCase === "clinica"
      ? [
          "És a recepcionista da clínica: só marcas consultas. Nunca dês conselhos médicos, diagnósticos, triagem de sintomas nem opiniões clínicas.",
          "Pergunta a especialidade (clínica geral, dermatologia, pediatria, medicina dentária, ou as que o negócio listar), propõe horários reais com as ferramentas, confirma o nome e o telemóvel, e diz que envias um SMS de confirmação.",
        ]
      : [];

  return [
    `És a ${agent}, assistente de voz de marcações da ${business.name}.`,
    "Fala sempre português de Portugal (não brasileiro): usa «marcação», «telemóvel», «consulta», evita sotaque e vocabulário do Brasil (celular, vocês aí, a gente, horáriozinho).",
    "Respostas curtas, estilo chamada telefónica — uma ou duas frases.",
    `Fuso: ${business.timezone}. Horário: ${hours}. Serviços: ${services}.`,
    ...clinicPt,
    "Usa as ferramentas para disponibilidade e marcações. Nunca inventes horários livres. Só confirma uma marcação depois de book_appointment devolver ok.",
    "Assim que uma ferramenta devolver, diz já o resultado em voz alta (usa os campos speak/message). Nunca fiques em «um momento», «a começar» ou a pensar — o cliente tem de ouvir horários ou uma alternativa na mesma vez.",
    "Pede o nome do cliente antes de marcar. Se uma ferramenta falhar, diz-o em breve e oferece outra hora.",
  ].join(" ");
}

export function languageHintFor(business: Business): "pt-PT" | "en-US" {
  return business.locale === "en" ? "en-US" : "pt-PT";
}

export function buildGrokSessionConfig(business: Business): Record<string, unknown> {
  const hint = languageHintFor(business);
  const keyterms = [
    business.name,
    business.agentName,
    ...business.services.map((s) => s.name),
  ].filter((t): t is string => Boolean(t && t.trim()));

  return {
    voice: GROK_VOICE_ID,
    instructions: buildGrokInstructions(business),
    reasoning: { effort: "none" },
    // Default VAD threshold is 0.85 (very deaf to laptop mics). Lower it so the
    // uplink is actually heard; keep a little padding so first syllables aren't clipped.
    turn_detection: {
      type: "server_vad",
      threshold: 0.45,
      silence_duration_ms: 700,
      prefix_padding_ms: 400,
    },
    tools: GROK_VOICE_TOOLS,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: GROK_SAMPLE_RATE },
        transcription: {
          model: "grok-transcribe",
          language_hint: hint,
          keyterms,
        },
      },
      output: {
        format: { type: "audio/pcm", rate: GROK_SAMPLE_RATE },
      },
    },
  };
}

export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function extractClientSecret(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.value === "string" && obj.value.trim()) {
    return obj.value.trim();
  }
  if (typeof obj.token === "string" && obj.token.trim()) {
    return obj.token.trim();
  }
  if (typeof obj.client_secret === "string" && obj.client_secret.trim()) {
    return obj.client_secret.trim();
  }
  if (obj.client_secret && typeof obj.client_secret === "object") {
    const inner = obj.client_secret as Record<string, unknown>;
    if (typeof inner.value === "string" && inner.value.trim()) {
      return inner.value.trim();
    }
  }
  return null;
}

export interface MintResult {
  ok: true;
  token: string;
  expiresAt: number | null;
}

export interface MintFailure {
  ok: false;
  status: number;
  error: string;
}

export async function mintRealtimeClientSecret(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MintResult | MintFailure> {
  let response: Response;
  try {
    response = await fetchImpl(GROK_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
  } catch {
    return { ok: false, status: 502, error: "xai_unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return { ok: false, status: 502, error: "xai_token_failed" };
  }

  const token = extractClientSecret(payload);
  if (!token) {
    return { ok: false, status: 502, error: "xai_token_missing" };
  }

  const expiresAt =
    payload && typeof payload === "object" && "expires_at" in payload
      ? Number((payload as { expires_at: unknown }).expires_at) || null
      : null;

  return { ok: true, token, expiresAt };
}

export interface RealtimeSessionResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function handleRealtimeSessionRequest(opts: {
  business: Business;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<RealtimeSessionResponse> {
  if (!opts.apiKey) {
    return {
      status: 503,
      body: {
        error: "grok_voice_not_configured",
        message:
          opts.business.locale === "en"
            ? "Grok voice is not configured in this environment."
            : "A voz Grok não está configurada neste ambiente.",
      },
    };
  }

  const minted = await mintRealtimeClientSecret(opts.apiKey, opts.fetchImpl ?? fetch);
  if (!minted.ok) {
    return {
      status: minted.status,
      body: {
        error: minted.error,
        message:
          opts.business.locale === "en"
            ? "Could not start Grok voice. Try again in a moment."
            : "Não foi possível iniciar a voz Grok. Tente daqui a pouco.",
      },
    };
  }

  return {
    status: 200,
    body: {
      token: minted.token,
      expiresAt: minted.expiresAt,
      wsUrl: GROK_REALTIME_WS_URL,
      model: GROK_VOICE_MODEL,
      voice: GROK_VOICE_ID,
      sampleRate: GROK_SAMPLE_RATE,
      greeting: greeting(opts.business),
      session: buildGrokSessionConfig(opts.business),
    },
  };
}
