import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultServices } from "../src/domain/catalog.js";
import { greeting } from "../src/agent/conversation.js";
import { buildLiveInstructions, buildLiveSessionConfig, LIVE_VOICE_MODEL } from "../src/telephony/gptLive.js";
import { ensureDemoBusinesses, MARKETING_DEMO_SLUG, LEGACY_BARBER_DEMO_SLUG } from "../src/store/seed.js";
import { PLANS } from "../src/domain/plans.js";
import { tempStore } from "./helpers.js";
import { DEFAULT_AGENT_NAME } from "../src/domain/agent.js";

function readWeb(path: string): string {
  return readFileSync(new URL(`../web/src/${path}`, import.meta.url), "utf8");
}

describe("clinic marketing demo", () => {
  it("defaults clinic services to Portuguese specialties, not a barbershop", () => {
    const names = defaultServices("clinica").map((s) => s.name);
    expect(names).toEqual(["Clínica geral", "Dermatologia", "Pediatria", "Medicina dentária"]);
    expect(names.join(" ")).not.toMatch(/corte|barba/i);
  });

  it("seeds the homepage clinic even when barbearia already exists", () => {
    const store = tempStore();
    store.createBusiness({
      name: "Barbearia Lisboa",
      useCase: "barbearia",
      locale: "pt",
      agentName: DEFAULT_AGENT_NAME,
      agentGender: "neutro",
      planId: "pro",
      status: "active",
    });
    expect(store.getBusinessBySlug(LEGACY_BARBER_DEMO_SLUG)).toBeDefined();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG);
    expect(clinic).toBeDefined();
    expect(clinic?.useCase).toBe("clinica");
    expect(clinic?.name).toBe("Clínica Central");
    expect(clinic?.agentName).toBe(DEFAULT_AGENT_NAME);
    expect(clinic?.services.map((s) => s.name)).toEqual([
      "Clínica geral",
      "Dermatologia",
      "Pediatria",
      "Medicina dentária",
    ]);
    expect(store.getBusinessBySlug(LEGACY_BARBER_DEMO_SLUG)?.useCase).toBe("barbearia");
  });

  it("seeds both clinic and barbearia on an empty store", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    expect(store.getBusinessBySlug(MARKETING_DEMO_SLUG)?.useCase).toBe("clinica");
    expect(store.getBusinessBySlug(LEGACY_BARBER_DEMO_SLUG)?.useCase).toBe("barbearia");
  });

  it("clinic greeting and Live instructions book consultations without medical advice", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const hello = greeting(clinic);
    expect(hello).toMatch(/consulta/i);
    expect(hello).toMatch(/especialidade/i);
    expect(hello).toContain(DEFAULT_AGENT_NAME);
    expect(hello).not.toMatch(/barbearia|corte/i);
    expect(hello).not.toMatch(/Sofia/);

    const instructions = buildLiveInstructions(clinic);
    expect(instructions).toMatch(/português de Portugal/);
    expect(instructions).toMatch(/Nunca dês conselhos médicos/);
    expect(instructions).toMatch(/SMS/);
    expect(instructions).toMatch(/especialidade/);
    expect(instructions).toMatch(/Assim que uma ferramenta devolver/);
    expect(instructions).toMatch(/a começar/);
    expect(instructions).toContain(DEFAULT_AGENT_NAME);
    expect(instructions).not.toMatch(/corte de cabelo|barba/i);
    expect(instructions).not.toMatch(/Sofia|Grok/);

    const session = buildLiveSessionConfig(clinic);
    expect(session.model).toBe("gpt-live-1");
    expect(LIVE_VOICE_MODEL).toBe("gpt-live-1");
  });

  it("homepage shows the teal ATENDE landing and the demo DID", () => {
    const landing = readWeb("pages/Landing.tsx");
    const wordmark = readWeb("components/wordmark.tsx");
    const brand = readWeb("lib/brand.ts");
    const voice = readWeb("lib/voice-call.ts");
    expect(landing).toContain("O telefone do seu negócio deixa de ficar sem resposta.");
    expect(wordmark).toContain("ATEND");
    expect(brand).toContain("oklch(0.50 0.13 168)");
    expect(landing).toContain("210210260");
    expect(landing).toContain("21 021 0260");
    expect(landing).toContain("+351 21 021 0260");
    expect(landing).toContain("+351210210260");
    expect(landing).toContain("tel:+351210210260");
    expect(landing).toContain("Ligar e experimentar");
    expect(landing).toContain("Ver planos");
    expect(landing).toContain("/api/demo");
    expect(landing).toMatch(/clínica, barbearia, restaurante, oficina ou imobiliária/);
    expect(landing).not.toMatch(/href="\/demo\//);
    expect(landing).not.toContain("Sofia");
    expect(landing).not.toMatch(/Grok/);
    expect(voice).toContain("flushPendingTools");
    expect(voice).toContain('sendEvent({ type: "response.create" })');
    expect(voice).not.toMatch(/Grok|Sofia/);
  });

  it("customer-facing homepage copy uses Google Calendar, not Cal.com", () => {
    const landing = readWeb("pages/Landing.tsx");
    expect(landing).not.toMatch(/cal\.com/i);
    expect(landing).toContain("Agendamento por voz com marcação no seu Google Calendar.");
    expect(landing).not.toMatch(/evita conflitos e sobreposições/);
    expect(landing).not.toMatch(/adesão em minutos/i);
  });

  it("presents six industry families and 49/99/199 with trial copy", () => {
    const landing = readWeb("pages/Landing.tsx");
    expect(landing).toContain("Saúde");
    expect(landing).toContain("Beleza e bem-estar");
    expect(landing).toContain("Restauração e hotelaria");
    expect(landing).toContain("Casa, auto e campo");
    expect(landing).toContain("Serviços profissionais");
    expect(landing).toContain("Fitness e formação");
    expect(landing).toContain("Essencial");
    expect(landing).toContain("Estúdio");
    expect(landing).toContain("14 dias");
    expect(landing).toContain("45 minutos");
    expect(PLANS.base.displayName).toBe("Essencial");
    expect(PLANS.studio.displayName).toBe("Estúdio");
    expect(landing).toContain('value: "clinica"');
    expect(landing).toContain('value: "barbearia"');
    expect(landing).toContain('value: "restaurante"');
    expect(landing).toContain('value: "oficina"');
    expect(landing).toContain('value: "imobiliaria"');
  });

  it("voice client requests a follow-up after tools so Atende does not stall", () => {
    const js = readWeb("lib/voice-call.ts");
    expect(js).toContain("async function flushPendingTools");
    expect(js).toMatch(/if \(pendingTools\.size\) return;/);
    expect(js).not.toMatch(/if \(!pendingTools\.size\) return;/);
    expect(js).toContain('sendEvent({ type: "response.create" })');
    expect(js).toContain("TOOL_TIMEOUT_MS");
    expect(js).toContain("AbortController");
  });

  it("backoffice uses shadcn Select and gpt-live-1, not native select or Grok", () => {
    const app = readWeb("pages/Backoffice.tsx");
    expect(app).toContain("ChatGPT Live (gpt-live-1)");
    expect(app).toContain("SelectTrigger");
    expect(app).toContain("Pendente de Aprovação Regulatória");
    expect(app).not.toMatch(/<select/);
    expect(app).not.toMatch(/Grok|Sofia/);
    expect(app).not.toContain("Estamos a preparar a sua conta");
  });
});
