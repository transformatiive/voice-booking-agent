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
    return [
      `You are ${agent}, the appointment voice agent for ${business.name}.`,
      "Speak English. Keep replies short, like a phone call — one or two sentences.",
      `Timezone: ${business.timezone}. Hours: ${hours}. Services: ${services}.`,
      ...verticalLiveRules(business),
      "Use tools for availability and booking. Never invent free slots. Only confirm a booking after book_appointment returns ok.",
      "After a tool returns, speak the result immediately using the speak/message fields. Never stall with 'one moment', 'starting', or filler — the caller must hear times or a taken-slot alternative in the same turn.",
      "Ask the customer's name before booking. If a tool errors, say so briefly and offer another time.",
      "Short phone replies; delegate availability and booking; never invent slots.",
      "Do not introduce yourself as a product demo. You are the live receptionist for this business.",
    ].join(" ");
  }

  return [
    `És o ${agent}, assistente de voz de marcações da ${business.name}.`,
    "Fala sempre português de Portugal (não brasileiro): usa «marcação», «telemóvel», «consulta», evita sotaque e vocabulário do Brasil (celular, vocês aí, a gente, horáriozinho).",
    "Respostas curtas, estilo chamada telefónica — uma ou duas frases.",
    `Fuso: ${business.timezone}. Horário: ${hours}. Serviços: ${services}.`,
    ...verticalLiveRules(business),
    "Usa as ferramentas para disponibilidade e marcações. Nunca inventes horários livres. Só confirma uma marcação depois de book_appointment devolver ok.",
    "Assim que uma ferramenta devolver, diz já o resultado em voz alta (usa os campos speak/message). Nunca fiques em «um momento», «a começar» ou a pensar — o cliente tem de ouvir horários ou uma alternativa na mesma vez.",
    "Pede o nome do cliente antes de marcar. Se uma ferramenta falhar, diz-o em breve e oferece outra hora.",
    "Respostas curtas ao telefone; delega disponibilidade e marcações; nunca inventes horários.",
    "Não te apresentes como uma demo de produto. És a recepção ao vivo deste negócio.",
  ].join(" ");
}

function verticalLiveRules(business: Business): string[] {
  const pt = business.locale === "pt";
  switch (business.useCase) {
    case "clinica":
      return pt
        ? [
            "És a recepção da clínica: só marcas consultas. Nunca dês conselhos médicos, diagnósticos, triagem de sintomas nem opiniões clínicas.",
            "Pergunta a especialidade (clínica geral, dermatologia, pediatria, medicina dentária, ou as que o negócio listar), propõe horários reais com as ferramentas, confirma o nome e o telemóvel, e diz que envias um SMS de confirmação.",
          ]
        : [
            "You are the clinic receptionist. You only book consultations — never give medical advice, diagnoses, symptom triage, or clinical opinions.",
            "Ask which specialty they need, propose real slots from tools, confirm name and phone, then say you will send an SMS confirmation.",
          ];
    case "barbearia":
      return pt
        ? [
            "És a recepção da barbearia: marcas corte, barba e corte infantil. Não dês consultoria de estilo longa.",
            "Pergunta o serviço, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
          ]
        : [
            "You are the barbershop receptionist: book haircuts, beard trims, and kids' cuts. Do not give long style advice.",
            "Ask which service, propose real slots from tools, confirm name and phone.",
          ];
    case "salao":
      return pt
        ? [
            "És a recepção do salão: marcas corte, coloração, brushing e manicure.",
            "Pergunta o serviço, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
          ]
        : [
            "You are the salon receptionist: book cuts, colour, blow-dry, and manicure.",
            "Ask which service, propose real slots from tools, confirm name and phone.",
          ];
    case "restaurante":
      return pt
        ? [
            "És a recepção do restaurante: tratas reservas de mesa. Não tomes pedidos de comida nesta chamada.",
            "Pergunta quantas pessoas e a hora, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
          ]
        : [
            "You are the restaurant receptionist: take table reservations. Do not take food orders on this call.",
            "Ask party size and time, propose real slots from tools, confirm name and phone.",
          ];
    case "oficina":
      return pt
        ? [
            "És o balcão da oficina: marcas diagnóstico, revisão e pneus. Não dês diagnóstico mecânico ao telefone.",
            "Pergunta o serviço e o veículo se o cliente o disser, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
          ]
        : [
            "You are the garage desk: book diagnosis, servicing, and tyres. Do not diagnose the car on the phone.",
            "Ask which service, propose real slots from tools, confirm name and phone.",
          ];
    case "imobiliaria":
      return pt
        ? [
            "És a recepção da imobiliária: marcas visitas e avaliações. Não dês aconselhamento jurídico nem avaliações de preço.",
            "Pergunta o imóvel ou a zona, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
          ]
        : [
            "You are the estate-agency receptionist: book viewings and valuations. Do not give legal or price advice.",
            "Ask which property or area, propose real slots from tools, confirm name and phone.",
          ];
    case "ginasio":
      return pt
        ? [
            "És a recepção do ginásio: marcas aulas experimentais e personal trainer.",
            "Pergunta a aula, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
          ]
        : [
            "You are the gym receptionist: book trial classes and personal training.",
            "Ask which class, propose real slots from tools, confirm name and phone.",
          ];
    case "outro":
      return pt
        ? ["Marca o serviço que o cliente pedir usando as ferramentas. Não improvises um guião de demonstração."]
        : ["Book the service the caller asks for using tools. Do not improvise a demo script."];
    default: {
      const exhaustive: never = business.useCase;
      throw new Error(`Unknown use case: ${String(exhaustive)}`);
    }
  }
}

export function buildLiveSessionConfig(business: Business): Record<string, unknown> {
  return {
    type: "live",
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

export interface LiveSipHeader {
  name: string;
  value: string;
}

export function parseLiveIncomingWebhook(
  body: unknown,
  sessionIdFromPath?: string,
): { sessionId: string; sipHeaders: LiveSipHeader[] } | undefined {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : rec;
  const sessionId =
    (typeof data.session_id === "string" && data.session_id) ||
    (typeof data.call_id === "string" && data.call_id) ||
    (typeof rec.session_id === "string" && rec.session_id) ||
    sessionIdFromPath;
  if (!sessionId) {
    return undefined;
  }
  const rawHeaders = Array.isArray(data.sip_headers)
    ? data.sip_headers
    : Array.isArray(rec.sip_headers)
      ? rec.sip_headers
      : [];
  const sipHeaders: LiveSipHeader[] = [];
  for (const header of rawHeaders) {
    if (!header || typeof header !== "object") continue;
    const item = header as Record<string, unknown>;
    if (typeof item.name === "string" && typeof item.value === "string") {
      sipHeaders.push({ name: item.name, value: item.value });
    }
  }
  return { sessionId, sipHeaders };
}

export async function acceptLiveIncomingCall(opts: {
  sessionId: string;
  business: Business;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = buildLiveSessionConfig(opts.business);
  const body = {
    slug: opts.business.slug,
    agentName: opts.business.agentName || DEFAULT_AGENT_NAME,
    model: LIVE_VOICE_MODEL,
    session,
  };
  if (!opts.apiKey) {
    return { status: 503, body: { error: "gpt_live_not_configured", ...body } };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(`${LIVE_SESSIONS_URL}/${encodeURIComponent(opts.sessionId)}/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session }),
  });
  if (!response.ok) {
    return { status: 502, body: { error: "gpt_live_accept_failed", slug: opts.business.slug } };
  }
  return { status: 200, body };
}
