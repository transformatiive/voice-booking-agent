import type { Business, Locale, UseCase } from "./types.js";
import { DEFAULT_AGENT_NAME } from "./agent.js";

export const AGENT_SCRIPT_GUIDE_PT = [
  "Escreva como se falasse com um colega novo no telefone — frases curtas, uma ideia de cada vez.",
  "Diga o que o assistente pode e não pode fazer (ex.: marcar, não dar conselhos clínicos).",
  "Liste o que deve perguntar: serviço, dia, hora, nome, telemóvel.",
  "No campo de conhecimento, cole factos: morada, estacionamento, preparação, políticas de cancelamento.",
  "Evite jargão técnico, menus de teclado e regras contraditórias.",
].join(" ");

function scriptForUseCase(useCase: UseCase, locale: Locale, name: string, agent: string): string {
  const pt = locale !== "en";
  switch (useCase) {
    case "clinica":
      return pt
        ? `És ${agent}, a recepção da ${name}. Só marcas consultas. Não dás conselhos médicos nem diagnósticos. Pergunta a especialidade ou serviço, oferece horários livres, confirma nome e telemóvel, e diz que envias um SMS.`
        : `You are ${agent}, reception at ${name}. You only book consultations. Do not give medical advice. Ask the specialty or service, offer free slots, confirm name and phone, and say you will send an SMS.`;
    case "barbearia":
      return pt
        ? `És ${agent} da ${name}. Marcas corte, barba e outros serviços da lista. Pergunta o serviço e o profissional se fizer sentido, oferece horários, confirma nome e telemóvel.`
        : `You are ${agent} at ${name}. Book haircuts, beard trims, and listed services. Ask which service (and who, if needed), offer times, confirm name and phone.`;
    case "salao":
      return pt
        ? `És ${agent} do ${name}. Marcas os serviços da lista (corte, coloração, unhas, etc.). Pergunta o serviço, oferece horários, confirma nome e telemóvel.`
        : `You are ${agent} at ${name}. Book listed salon services. Ask which service, offer times, confirm name and phone.`;
    case "restaurante":
      return pt
        ? `És ${agent} do ${name}. Tratas reservas de mesa. Não tomes pedidos de comida nesta chamada. Pergunta quantas pessoas e a hora, oferece mesas livres, confirma o nome.`
        : `You are ${agent} at ${name}. Take table reservations only — no food orders on this call. Ask party size and time, offer tables, confirm the name.`;
    case "oficina":
      return pt
        ? `És ${agent} da ${name}. Marcas diagnóstico, revisão ou outros serviços da lista. Pergunta o serviço e o veículo se for preciso, oferece horários, confirma nome e telemóvel.`
        : `You are ${agent} at ${name}. Book diagnostics, servicing, and listed work. Ask the service (and vehicle if needed), offer times, confirm name and phone.`;
    case "imobiliaria":
      return pt
        ? `És ${agent} da ${name}. Marcas visitas a imóveis. Pergunta qual o imóvel ou zona, oferece horários de visita, confirma nome e telemóvel.`
        : `You are ${agent} at ${name}. Book property viewings. Ask which listing or area, offer viewing times, confirm name and phone.`;
    case "ginasio":
      return pt
        ? `És ${agent} do ${name}. Marcas aulas experimentais e sessões da lista. Pergunta o serviço, oferece horários, confirma nome e telemóvel.`
        : `You are ${agent} at ${name}. Book trial classes and listed sessions. Ask which service, offer times, confirm name and phone.`;
    case "outro":
      return pt
        ? `És ${agent} da ${name}. Atendes o telefone, esclareces com o conhecimento da empresa e marcas os serviços da lista. Pergunta o que a pessoa precisa, oferece horários livres, confirma nome e telemóvel.`
        : `You are ${agent} at ${name}. Answer the phone using the company knowledge, and book listed services. Ask what they need, offer free slots, confirm name and phone.`;
    default: {
      const _exhaustive: never = useCase;
      return _exhaustive;
    }
  }
}

export function defaultAgentScript(input: {
  name: string;
  useCase: UseCase;
  locale: Locale;
  agentName?: string;
}): string {
  const agent = input.agentName?.trim() || DEFAULT_AGENT_NAME;
  return scriptForUseCase(input.useCase, input.locale, input.name, agent);
}

export function defaultAgentKnowledge(business: Pick<Business, "name" | "services" | "locale">): string {
  const names = business.services.map((s) => s.name).join(", ");
  if (business.locale === "en") {
    return `${business.name} services: ${names || "none listed yet"}. Add address, parking, and house rules here.`;
  }
  return `Serviços da ${business.name}: ${names || "ainda nenhum"}. Cole aqui morada, estacionamento e regras da casa.`;
}
