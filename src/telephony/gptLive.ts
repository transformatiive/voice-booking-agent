import type { AgentGender, Business, WeeklyHours } from "../domain/types.js";
import { DEFAULT_AGENT_NAME } from "../domain/agent.js";
import { greeting } from "../agent/conversation.js";
import { config } from "../config.js";

export const LIVE_VOICE_MODEL = "gpt-live-1";
export const LIVE_BACKEND_MODEL_DEFAULT = "gpt-5.6-terra";
export const LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions";
export const LIVE_VOICE_ID = "marin";

const DAY_NAMES_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface LiveFunctionTool {
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
export const LIVE_VOICE_TOOLS: LiveFunctionTool[] = [
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

export function liveVoiceForGender(gender: AgentGender): string {
  switch (gender) {
    case "feminino":
      return "marin";
    case "masculino":
      return "meridian";
    case "neutro":
      return "marin";
    default: {
      const exhaustive: never = gender;
      throw new Error(`Unknown agent gender: ${String(exhaustive)}`);
    }
  }
}

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

export function buildLiveInstructions(business: Business): string {
  const agent = business.agentName || DEFAULT_AGENT_NAME;
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
      "Short phone replies; delegate availability and booking; never invent slots.",
    ].join(" ");
  }

  const clinicPt =
    business.useCase === "clinica"
      ? [
          "És a recepção da clínica: só marcas consultas. Nunca dês conselhos médicos, diagnósticos, triagem de sintomas nem opiniões clínicas.",
          "Pergunta a especialidade (clínica geral, dermatologia, pediatria, medicina dentária, ou as que o negócio listar), propõe horários reais com as ferramentas, confirma o nome e o telemóvel, e diz que envias um SMS de confirmação.",
        ]
      : [];

  return [
    `És o ${agent}, assistente de voz de marcações da ${business.name}.`,
    "Fala sempre português de Portugal (não brasileiro): usa «marcação», «telemóvel», «consulta», evita sotaque e vocabulário do Brasil (celular, vocês aí, a gente, horáriozinho).",
    "Respostas curtas, estilo chamada telefónica — uma ou duas frases.",
    `Fuso: ${business.timezone}. Horário: ${hours}. Serviços: ${services}.`,
    ...clinicPt,
    "Usa as ferramentas para disponibilidade e marcações. Nunca inventes horários livres. Só confirma uma marcação depois de book_appointment devolver ok.",
    "Assim que uma ferramenta devolver, diz já o resultado em voz alta (usa os campos speak/message). Nunca fiques em «um momento», «a começar» ou a pensar — o cliente tem de ouvir horários ou uma alternativa na mesma vez.",
    "Pede o nome do cliente antes de marcar. Se uma ferramenta falhar, diz-o em breve e oferece outra hora.",
    "Respostas curtas ao telefone; delega disponibilidade e marcações; nunca inventes horários.",
  ].join(" ");
}

export function buildLiveSessionConfig(business: Business): Record<string, unknown> {
  return {
    model: LIVE_VOICE_MODEL,
    instructions: buildLiveInstructions(business),
    audio: {
      output: {
        voice: liveVoiceForGender(business.agentGender),
      },
    },
    delegation: {
      type: "responses",
      responses: {
        model: config.voice.openaiLiveBackendModel || LIVE_BACKEND_MODEL_DEFAULT,
        tool_choice: "auto",
        tools: LIVE_VOICE_TOOLS,
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

export async function createLiveWebRtcSession(opts: {
  business: Business;
  sdp: string;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!opts.sdp.trim()) {
    return { status: 400, body: { error: "sdp_required" } };
  }
  if (!opts.apiKey) {
    return {
      status: 503,
      body: {
        error: "gpt_live_not_configured",
        message:
          opts.business.locale === "en"
            ? "Voice demo is not configured in this environment."
            : "A demo de voz não está configurada neste ambiente.",
      },
    };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(LIVE_SESSIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: buildLiveSessionConfig(opts.business),
      transport: { type: "webrtc", sdp: opts.sdp },
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    session?: { id?: string };
    transport?: { sdp?: string };
  } | null;
  if (!response.ok || !payload?.session?.id || !payload.transport?.sdp) {
    return {
      status: 502,
      body: { error: "gpt_live_session_failed" },
    };
  }
  return {
    status: 201,
    body: {
      sessionId: payload.session.id,
      sdp: payload.transport.sdp,
      model: LIVE_VOICE_MODEL,
      greeting: greeting(opts.business),
    },
  };
}
