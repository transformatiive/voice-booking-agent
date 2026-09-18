import type { AgentGender, Business, WeeklyHours } from "../domain/types.js";
import { DEFAULT_AGENT_NAME } from "../domain/agent.js";
import { greeting } from "../agent/conversation.js";
import { config } from "../config.js";
import { DEMO_PICKER_SLUG, listDemoOptions } from "./demoDid.js";

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

/**
 * Demo DID Live session has no tools. There is no calendar on this call;
 * availability and booking are spoken, not delegated.
 */
export const LIVE_PICKER_TOOLS: LiveFunctionTool[] = [];

export type LiveBookingMode = "tools" | "simulate";

/** Spoken confirmation the demo receptionist can say without a tool. */
export function demoSimulatedConfirmation(business: Business): string {
  const pt = business.locale === "pt";
  switch (business.useCase) {
    case "clinica":
      return pt
        ? "A consulta de dermatologia fica quinta-feira às 10h00. Está marcada. Envio confirmação por SMS."
        : "The dermatology appointment is Thursday at 10:00. It's booked. I'll send an SMS confirmation.";
    case "barbearia":
    case "salao":
      return pt
        ? "O corte de cabelo fica amanhã às 15h00. Está marcado. Envio confirmação por SMS."
        : "The haircut is tomorrow at 15:00. It's booked. I'll send an SMS confirmation.";
    case "restaurante":
      return pt
        ? "A mesa para duas pessoas fica sábado às 20h00. Está marcada. Envio confirmação por SMS."
        : "The table for two is Saturday at 20:00. It's booked. I'll send an SMS confirmation.";
    case "oficina":
      return pt
        ? "A revisão fica sexta-feira às 09h30. Está marcada. Envio confirmação por SMS."
        : "The service is Friday at 09:30. It's booked. I'll send an SMS confirmation.";
    case "imobiliaria":
      return pt
        ? "A visita ao imóvel fica terça-feira às 16h00. Está marcada. Envio confirmação por SMS."
        : "The viewing is Tuesday at 16:00. It's booked. I'll send an SMS confirmation.";
    case "ginasio":
      return pt
        ? "A aula experimental fica quarta-feira às 18h00. Está marcada. Envio confirmação por SMS."
        : "The trial class is Wednesday at 18:00. It's booked. I'll send an SMS confirmation.";
    case "outro":
      return pt
        ? "A marcação fica amanhã às 11h00. Está marcada. Envio confirmação por SMS."
        : "The booking is tomorrow at 11:00. It's booked. I'll send an SMS confirmation.";
    default: {
      const exhaustive: never = business.useCase;
      throw new Error(`Unknown use case: ${String(exhaustive)}`);
    }
  }
}

function simulateBookingScript(business: Business, ask: string): string[] {
  const example = demoSimulatedConfirmation(business);
  if (business.locale === "en") {
    return [
      `${ask} Offer a plausible slot out loud now, with no tool and no waiting.`,
      `If they accept, confirm in the same turn: the service, the day and time, that it is booked, and that an SMS confirmation goes out. Example: "${example}".`,
      "Never say you will confirm and then stop. If a later step would need validation (SMS code, payment, identity, a calendar write, a human check), simulate that validation and confirm in the same turn.",
    ];
  }
  return [
    `${ask} Propõe já um horário plausível em português de Portugal, sem chamar ferramenta e sem esperar.`,
    `Se o cliente aceitar, confirma na mesma vez em voz alta: o serviço, o dia e a hora, que está marcada, e que envias confirmação por SMS. Exemplo: «${example}».`,
    "Nunca digas «vou confirmar» e fiques calado. Se alguma validação for precisa (código SMS, pagamento, identidade, escrita no calendário, uma pessoa), simula-a e confirma na mesma vez.",
  ];
}

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

export function buildLiveInstructions(
  business: Business,
  opts: { booking?: LiveBookingMode } = {},
): string {
  const agent = business.agentName || DEFAULT_AGENT_NAME;
  const booking = opts.booking ?? "tools";
  const services = business.services
    .map((s) => {
      const price = s.priceCents !== null ? ` (${(s.priceCents / 100).toFixed(0)}€)` : "";
      return `${s.name}${price}, ${s.durationMinutes} min`;
    })
    .join("; ");
  const hours = formatHoursSummary(business.hours, business.locale);
  const bookingRules = bookingLiveRules(business, booking);
  const ownerScript = business.agentScript?.trim();
  const knowledge = business.agentKnowledge?.trim();

  if (business.locale === "en") {
    return [
      ownerScript || `You are ${agent}, the appointment voice agent for ${business.name}.`,
      "Speak English. Keep replies short, like a phone call — one or two sentences.",
      `Timezone: ${business.timezone}. Hours: ${hours}. Services: ${services}.`,
      knowledge ? `Company knowledge (text): ${knowledge}` : "",
      ...verticalLiveRules(business, booking),
      ...bookingRules,
      "Do not introduce yourself as a product demo. You are the live receptionist for this business.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    ownerScript || `És o ${agent}, assistente de voz de marcações da ${business.name}.`,
    "Fala sempre português de Portugal (não brasileiro): usa «marcação», «telemóvel», «consulta», evita sotaque e vocabulário do Brasil (celular, vocês aí, a gente, horáriozinho).",
    "Respostas curtas, estilo chamada telefónica — uma ou duas frases.",
    `Fuso: ${business.timezone}. Horário: ${hours}. Serviços: ${services}.`,
    knowledge ? `Conhecimento da empresa (texto): ${knowledge}` : "",
    ...verticalLiveRules(business, booking),
    ...bookingRules,
    "Não te apresentes como uma demo de produto. És a recepção ao vivo deste negócio.",
  ]
    .filter(Boolean)
    .join(" ");
}

function bookingLiveRules(business: Business, booking: LiveBookingMode): string[] {
  const pt = business.locale === "pt";
  switch (booking) {
    case "tools":
      return pt
        ? [
            "Usa as ferramentas para disponibilidade e marcações. Nunca inventes horários livres. Só confirma uma marcação depois de book_appointment devolver ok.",
            "Assim que uma ferramenta devolver, diz já o resultado em voz alta: a data, a hora, e se ficou marcada. Nunca fiques em «um momento», «a começar» ou a pensar — o cliente tem de ouvir horários ou uma alternativa na mesma vez.",
            "Pede o nome do cliente antes de marcar. Se uma ferramenta falhar, diz-o em breve e oferece outra hora.",
            "Respostas curtas ao telefone; delega disponibilidade e marcações; nunca inventes horários.",
          ]
        : [
            "Use tools for availability and booking. Never invent free slots. Only confirm a booking after book_appointment returns ok.",
            "After a tool returns, speak the result immediately: the date, the time, and whether it is booked. Never stall with 'one moment', 'starting', or filler — the caller must hear times or a taken-slot alternative in the same turn.",
            "Ask the customer's name before booking. If a tool errors, say so briefly and offer another time.",
            "Short phone replies; delegate availability and booking; never invent slots.",
          ];
    case "simulate":
      return pt
        ? [
            "Não chames get_slots, book_appointment, list_bookings, cancel_appointment nem qualquer outra ferramenta. Não esperes por um resultado.",
            "Disponibilidade e marcações são simuladas em voz alta. Oferece um horário plausível. Se o cliente aceitar, confirma já: o serviço, o dia e a hora, que está marcada, e que envias confirmação por SMS.",
            "Nunca digas «vou confirmar» e cries silêncio.",
          ]
        : [
            "Do not call get_slots, book_appointment, list_bookings, cancel_appointment, or any other tool. Do not wait.",
            "Availability and booking are simulated in speech. Offer a plausible slot. If they accept, confirm now: the service, the day and time, that it is booked, and that an SMS confirmation goes out.",
            "Never say you will confirm and then stop.",
          ];
    default: {
      const exhaustive: never = booking;
      throw new Error(`Unknown booking mode: ${String(exhaustive)}`);
    }
  }
}

function verticalLiveRules(business: Business, booking: LiveBookingMode): string[] {
  const pt = business.locale === "pt";
  const simulate = booking === "simulate";
  switch (business.useCase) {
    case "clinica":
      return pt
        ? [
            "És a recepção da clínica: só marcas consultas. Nunca dês conselhos médicos, diagnósticos, triagem de sintomas nem opiniões clínicas.",
            ...(simulate
              ? simulateBookingScript(
                  business,
                  "Pergunta a especialidade (clínica geral, dermatologia, pediatria, medicina dentária, ou as que o negócio listar).",
                )
              : [
                  "Pergunta a especialidade (clínica geral, dermatologia, pediatria, medicina dentária, ou as que o negócio listar), propõe horários reais com as ferramentas, confirma o nome e o telemóvel, e diz que envias um SMS de confirmação.",
                ]),
          ]
        : [
            "You are the clinic receptionist. You only book consultations — never give medical advice, diagnoses, symptom triage, or clinical opinions.",
            ...(simulate
              ? simulateBookingScript(business, "Ask which specialty they need.")
              : [
                  "Ask which specialty they need, propose real slots from tools, confirm name and phone, then say you will send an SMS confirmation.",
                ]),
          ];
    case "barbearia":
      return pt
        ? [
            "És a recepção da barbearia: marcas corte, barba e corte infantil. Não dês consultoria de estilo longa.",
            ...(simulate
              ? simulateBookingScript(business, "Pergunta o serviço.")
              : ["Pergunta o serviço, propõe horários reais com as ferramentas, confirma o nome e o telemóvel."]),
          ]
        : [
            "You are the barbershop receptionist: book haircuts, beard trims, and kids' cuts. Do not give long style advice.",
            ...(simulate
              ? simulateBookingScript(business, "Ask which service.")
              : ["Ask which service, propose real slots from tools, confirm name and phone."]),
          ];
    case "salao":
      return pt
        ? [
            "És a recepção do salão: marcas corte, coloração, brushing e manicure.",
            ...(simulate
              ? simulateBookingScript(business, "Pergunta o serviço.")
              : ["Pergunta o serviço, propõe horários reais com as ferramentas, confirma o nome e o telemóvel."]),
          ]
        : [
            "You are the salon receptionist: book cuts, colour, blow-dry, and manicure.",
            ...(simulate
              ? simulateBookingScript(business, "Ask which service.")
              : ["Ask which service, propose real slots from tools, confirm name and phone."]),
          ];
    case "restaurante":
      return pt
        ? [
            "És a recepção do restaurante: tratas reservas de mesa. Não tomes pedidos de comida nesta chamada.",
            ...(simulate
              ? simulateBookingScript(business, "Pergunta quantas pessoas e a hora.")
              : ["Pergunta quantas pessoas e a hora, propõe horários reais com as ferramentas, confirma o nome e o telemóvel."]),
          ]
        : [
            "You are the restaurant receptionist: take table reservations. Do not take food orders on this call.",
            ...(simulate
              ? simulateBookingScript(business, "Ask party size and time.")
              : ["Ask party size and time, propose real slots from tools, confirm name and phone."]),
          ];
    case "oficina":
      return pt
        ? [
            "És o balcão da oficina: marcas diagnóstico, revisão e pneus. Não dês diagnóstico mecânico ao telefone.",
            ...(simulate
              ? simulateBookingScript(business, "Pergunta o serviço e o veículo se o cliente o disser.")
              : [
                  "Pergunta o serviço e o veículo se o cliente o disser, propõe horários reais com as ferramentas, confirma o nome e o telemóvel.",
                ]),
          ]
        : [
            "You are the garage desk: book diagnosis, servicing, and tyres. Do not diagnose the car on the phone.",
            ...(simulate
              ? simulateBookingScript(business, "Ask which service.")
              : ["Ask which service, propose real slots from tools, confirm name and phone."]),
          ];
    case "imobiliaria":
      return pt
        ? [
            "És a recepção da imobiliária: marcas visitas e avaliações. Não dês aconselhamento jurídico nem avaliações de preço.",
            ...(simulate
              ? simulateBookingScript(business, "Pergunta o imóvel ou a zona.")
              : ["Pergunta o imóvel ou a zona, propõe horários reais com as ferramentas, confirma o nome e o telemóvel."]),
          ]
        : [
            "You are the estate-agency receptionist: book viewings and valuations. Do not give legal or price advice.",
            ...(simulate
              ? simulateBookingScript(business, "Ask which property or area.")
              : ["Ask which property or area, propose real slots from tools, confirm name and phone."]),
          ];
    case "ginasio":
      return pt
        ? [
            "És a recepção do ginásio: marcas aulas experimentais e personal trainer.",
            ...(simulate
              ? simulateBookingScript(business, "Pergunta a aula.")
              : ["Pergunta a aula, propõe horários reais com as ferramentas, confirma o nome e o telemóvel."]),
          ]
        : [
            "You are the gym receptionist: book trial classes and personal training.",
            ...(simulate
              ? simulateBookingScript(business, "Ask which class.")
              : ["Ask which class, propose real slots from tools, confirm name and phone."]),
          ];
    case "outro":
      if (simulate) {
        return pt
          ? [
              "Marca o serviço que o cliente pedir em voz alta. Não improvises um guião de demonstração.",
              ...simulateBookingScript(business, "Pergunta o serviço."),
            ]
          : [
              "Book the service the caller asks for in speech. Do not improvise a demo script.",
              ...simulateBookingScript(business, "Ask which service."),
            ];
      }
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

/**
 * One continuous gpt-live-1 session: Atende picker plus every demo vertical's
 * full receptionist script from the first second. GPT-Live cannot swap
 * instructions mid-call; after the caller confirms, the same voice follows
 * that option's existing rules (services, what to ask, what never to do).
 * Availability and booking are simulated in speech — the demo session has no tools.
 */
export function buildDemoPickerLiveInstructions(businesses: Business[]): string {
  const bySlug = new Map(businesses.map((business) => [business.slug, business]));
  const menu = listDemoOptions()
    .map((option, index) => `${index + 1} ${option.label.toLowerCase()}`)
    .join(", ");
  const blocks = listDemoOptions().map((option, index) => {
    const business = bySlug.get(option.slug);
    const rules = business
      ? buildLiveInstructions(business, { booking: "simulate" })
      : `${option.label}: ${option.hint}.`;
    return `Opção ${index + 1} (${option.useCase}): depois de confirmada, és a recepção da ${business?.name ?? option.label}. ${rules}`;
  });
  return [
    `És o ${DEFAULT_AGENT_NAME}, o assistente de voz da Atende.`,
    "Fala sempre português de Portugal (não brasileiro): usa «marcação», «telemóvel», «consulta», «ecrã»; nunca celular, vocês, a gente, horáriozinho.",
    "Esta chamada é a demonstração Atende. A voz é Live desde o primeiro segundo — cumprimenta já, sem esperar que o cliente diga olá.",
    `Apresenta-te como Atende e pergunta qual demonstração o cliente quer ouvir: ${menu}. Aceita o nome ou o número.`,
    "Não digas que estás a transferir nem uses um menu robótico. Continua nesta chamada.",
    "Até o cliente confirmar uma opção, não marques nada e não entres na recepção de um negócio.",
    "Quando confirmar o nome ou o número (1-5), fala já como a recepção dessa opção — a saudação e a pergunta seguinte do guião que já está nestas instruções. Não chames nenhuma ferramenta para escolher o cenário. Não esperes por um resultado. Não digas «perfeito», «a preparar», «vamos à oficina», nem que estás a transferir.",
    "Não chames get_slots, book_appointment, list_bookings, cancel_appointment nem qualquer outra ferramenta, em nenhuma das cinco opções. Não esperes. Disponibilidade e marcações são simuladas em voz alta. Se o cliente aceitar um horário, confirma já o serviço, o dia e a hora, que está marcada, e que envias SMS. Nunca digas «vou confirmar» e cries silêncio.",
    "O GPT-Live não troca o guião a meio da chamada; as regras de cada opção já estão aqui.",
    "Não voltes a listar as opções a menos que peçam para mudar de demonstração.",
    "Respostas curtas, estilo chamada telefónica — uma ou duas frases.",
    ...blocks,
  ].join(" ");
}

export function buildDemoPickerBackendInstructions(businesses: Business[]): string {
  const bySlug = new Map(businesses.map((business) => [business.slug, business]));
  const catalogs = listDemoOptions()
    .map((option) => {
      const business = bySlug.get(option.slug);
      const services = business?.services.map((service) => service.name).join(", ") ?? option.hint;
      return `${option.useCase} (${option.slug}): ${services}`;
    })
    .join(". ");
  return [
    "You are the Atende demo voice backend for a Portuguese (pt-PT) call. Do not call any tool. There is no calendar on this session.",
    "Do not call a tool when the caller picks a vertical. The live model already has every receptionist script, greets in character, and simulates availability and booking in speech.",
    "Never call get_slots, book_appointment, list_bookings, cancel_appointment, or any other function. Never wait. Never say you will confirm and then stop.",
    `Verticals: ${catalogs}.`,
    "Never give medical, legal, or mechanical advice.",
  ].join(" ");
}

export function buildDemoPickerLiveSessionConfig(businesses: Business[]): Record<string, unknown> {
  return {
    type: "live",
    model: LIVE_VOICE_MODEL,
    instructions: buildDemoPickerLiveInstructions(businesses),
    audio: {
      output: {
        voice: LIVE_VOICE_ID,
      },
    },
    delegation: {
      type: "responses",
      responses: {
        model: config.voice.openaiLiveBackendModel || LIVE_BACKEND_MODEL_DEFAULT,
        tool_choice: "none",
        tools: LIVE_PICKER_TOOLS,
        instructions: buildDemoPickerBackendInstructions(businesses),
      },
    },
  };
}

export function sessionForDemoDidInbound(businesses: Business[]): {
  slug: string;
  agentName: string;
  session: Record<string, unknown>;
} {
  return {
    slug: DEMO_PICKER_SLUG,
    agentName: DEFAULT_AGENT_NAME,
    session: buildDemoPickerLiveSessionConfig(businesses),
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
  business?: Business;
  session?: Record<string, unknown>;
  slug?: string;
  agentName?: string;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = opts.session ?? (opts.business ? buildLiveSessionConfig(opts.business) : undefined);
  const slug = opts.slug ?? opts.business?.slug;
  const agentName = opts.agentName ?? opts.business?.agentName ?? DEFAULT_AGENT_NAME;
  if (!session || !slug) {
    return { status: 400, body: { error: "session_required" } };
  }
  const body = {
    slug,
    agentName,
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
    return { status: 502, body: { error: "gpt_live_accept_failed", slug } };
  }
  return { status: 200, body };
}
