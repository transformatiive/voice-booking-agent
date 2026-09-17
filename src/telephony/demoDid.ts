import type { UseCase } from "../domain/types.js";
import { DEFAULT_AGENT_NAME } from "../domain/agent.js";

export const DEMO_DID_E164 = "+351210210260";
export const DEMO_DID_NSN = "210210260";
export const DEMO_DID_DISPLAY = "21 021 0260";
export const DEMO_DID_DISPLAY_INTL = "+351 21 021 0260";
export const DEMO_DID_TEL = "tel:+351210210260";
/** Virtual slug for DID inbound: one Live session that offers every demo vertical. */
export const DEMO_PICKER_SLUG = "demo";
/** Telnyx TeXML Stream WebSocket path (must exist or TeXML must not point here). */
export const LIVE_MEDIA_PATH = "/voice/live-media";

export type DemoPickerUseCase = "clinica" | "barbearia" | "restaurante" | "oficina" | "imobiliaria";

export interface DemoUseCaseOption {
  useCase: DemoPickerUseCase;
  slug: string;
  label: string;
  agentName: string;
  hint: string;
}

const OPTIONS: DemoUseCaseOption[] = [
  { useCase: "clinica", slug: "clinica-central", label: "Clínica", agentName: DEFAULT_AGENT_NAME, hint: "Marcar consulta" },
  { useCase: "barbearia", slug: "barbearia-lisboa", label: "Barbearia", agentName: DEFAULT_AGENT_NAME, hint: "Corte e barba" },
  { useCase: "restaurante", slug: "restaurante-baixa", label: "Restaurante", agentName: DEFAULT_AGENT_NAME, hint: "Reserva de mesa" },
  { useCase: "oficina", slug: "oficina-norte", label: "Oficina", agentName: DEFAULT_AGENT_NAME, hint: "Reparação e revisão" },
  { useCase: "imobiliaria", slug: "imobiliaria-baixa", label: "Imobiliária", agentName: DEFAULT_AGENT_NAME, hint: "Marcar visita" },
];

const IVR_DIGIT_TO_USE_CASE: Record<string, DemoPickerUseCase> = {
  "1": "clinica",
  "2": "barbearia",
  "3": "restaurante",
  "4": "oficina",
  "5": "imobiliaria",
};

interface CallerBind {
  slug: string;
  expiresAt: number;
}

const callerBinds = new Map<string, CallerBind>();

export function listDemoOptions(): DemoUseCaseOption[] {
  return OPTIONS.map((option) => ({ ...option }));
}

export function demoSlugForUseCase(useCase: UseCase): string {
  switch (useCase) {
    case "clinica":
      return "clinica-central";
    case "barbearia":
    case "salao":
      return "barbearia-lisboa";
    case "restaurante":
      return "restaurante-baixa";
    case "oficina":
      return "oficina-norte";
    case "imobiliaria":
      return "imobiliaria-baixa";
    case "ginasio":
    case "outro":
      return "clinica-central";
    default: {
      const exhaustive: never = useCase;
      throw new Error(`Unknown use case: ${String(exhaustive)}`);
    }
  }
}

export function formatDemoDidNational(e164: string): string {
  const digits = normalizeE164(e164).replace(/^\+351/, "");
  if (digits.length !== 9) {
    return e164;
  }
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

export function isDemoDid(e164: string): boolean {
  return normalizeE164(e164) === DEMO_DID_E164;
}

export function ivrUseCaseForDigit(digit: string): DemoPickerUseCase | undefined {
  return IVR_DIGIT_TO_USE_CASE[digit];
}

export function useCaseFromSpeech(speech: string): DemoPickerUseCase | undefined {
  const text = speech
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(clinica|consulta|saude)\b/.test(text)) return "clinica";
  if (/\b(barbearia|barbear|cabeleireiro|salao)\b/.test(text)) return "barbearia";
  if (/\b(restaurante|reserva|mesa)\b/.test(text)) return "restaurante";
  if (/\b(oficina|mecanica|carro|revisao)\b/.test(text)) return "oficina";
  if (/\b(imobiliaria|imovel|visita)\b/.test(text)) return "imobiliaria";
  return undefined;
}

export function bindDemoCaller(opts: {
  callerE164: string;
  useCase: UseCase;
  now: number;
  ttlMs: number;
}): void {
  const callerE164 = normalizeE164(opts.callerE164);
  if (!callerE164) {
    return;
  }
  callerBinds.set(callerE164, {
    slug: demoSlugForUseCase(opts.useCase),
    expiresAt: opts.now + opts.ttlMs,
  });
}

/** Optional landing hint only — never skips the on-call ask. */
export function boundSlugForCaller(callerE164: string, now: number): string | undefined {
  const bind = callerBinds.get(normalizeE164(callerE164));
  if (bind && bind.expiresAt > now) {
    return bind.slug;
  }
  return undefined;
}

const rememberedByCaller = new Map<string, CallerBind>();
const rememberedByCall = new Map<string, CallerBind>();
const CHOICE_TTL_MS = 30 * 60 * 1000;

export function rememberDemoChoice(opts: {
  slug: string;
  fromE164?: string;
  callSid?: string;
  now: number;
}): void {
  const expiresAt = opts.now + CHOICE_TTL_MS;
  const bind = { slug: opts.slug, expiresAt };
  if (opts.fromE164) {
    const caller = normalizeE164(opts.fromE164);
    if (caller) rememberedByCaller.set(caller, bind);
  }
  if (opts.callSid?.trim()) {
    rememberedByCall.set(opts.callSid.trim(), bind);
  }
}

export function rememberedDemoSlug(opts: {
  fromE164?: string;
  callSid?: string;
  now: number;
}): string | undefined {
  if (opts.callSid) {
    const byCall = rememberedByCall.get(opts.callSid.trim());
    if (byCall && byCall.expiresAt > opts.now) return byCall.slug;
  }
  if (opts.fromE164) {
    const byCaller = rememberedByCaller.get(normalizeE164(opts.fromE164));
    if (byCaller && byCaller.expiresAt > opts.now) return byCaller.slug;
  }
  return undefined;
}

export interface SipHeader {
  name: string;
  value: string;
}

export function isDemoPickerSlug(slug: string): boolean {
  return slug === DEMO_PICKER_SLUG;
}

export function isDemoSlug(slug: string): boolean {
  return OPTIONS.some((option) => option.slug === slug);
}

export function demoUseCaseFromChoice(raw: string): DemoPickerUseCase | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const byDigit = ivrUseCaseForDigit(trimmed);
  if (byDigit) {
    return byDigit;
  }
  const exact = OPTIONS.find(
    (option) => option.slug === trimmed || option.useCase === trimmed.toLowerCase(),
  );
  if (exact) {
    return exact.useCase;
  }
  return useCaseFromSpeech(trimmed);
}

export function e164FromSipValue(value: string): string | undefined {
  const match = value.match(/\+\d{8,15}/);
  return match ? normalizeE164(match[0]) : undefined;
}

export function demoSlugFromSipHeaders(headers: SipHeader[], now: number): string | undefined {
  const slugHeader = headers.find((header) => /^(x-atende-slug|x-demo-slug)$/i.test(header.name));
  if (slugHeader && isDemoSlug(slugHeader.value.trim())) {
    return slugHeader.value.trim();
  }
  const from = headers.find((header) => /^from$/i.test(header.name))?.value;
  const fromE164 = from ? e164FromSipValue(from) : undefined;
  return rememberedDemoSlug({ fromE164, now });
}

export function resolveDemoSlugForInbound(_opts: {
  toE164: string;
  fromE164?: string;
  digits?: string;
  speech?: string;
  now: number;
}): { kind: "live"; slug: string } {
  return { kind: "live", slug: DEMO_PICKER_SLUG };
}

export function demoStreamUrl(publicBaseUrl: string, slug: string): string {
  const base = publicBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${base.replace(/\/$/, "")}${LIVE_MEDIA_PATH}?slug=${encodeURIComponent(slug)}`;
}

function normalizeE164(value: string): string {
  const trimmed = value.trim().replace(/^tel:/i, "").replace(/[\s()-]/g, "");
  if (trimmed === DEMO_DID_NSN || trimmed === DEMO_DID_E164.replace(/^\+/, "")) {
    return DEMO_DID_E164;
  }
  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  if (trimmed.startsWith("351") && trimmed.length >= 12) {
    return `+${trimmed}`;
  }
  if (/^\d{9}$/.test(trimmed)) {
    return `+351${trimmed}`;
  }
  return trimmed;
}
