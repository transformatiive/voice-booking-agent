import { describe, expect, it } from "vitest";
import {
  DEMO_DID_DISPLAY,
  DEMO_DID_DISPLAY_INTL,
  DEMO_DID_E164,
  DEMO_DID_NSN,
  DEMO_DID_TEL,
  DEMO_PICKER_SLUG,
  bindDemoCaller,
  demoSlugForUseCase,
  demoUseCaseFromChoice,
  formatDemoDidNational,
  isDemoDid,
  isDemoPickerSlug,
  listDemoOptions,
  rememberDemoChoice,
  demoSlugFromSipHeaders,
  rememberedDemoSlug,
  rememberDemoVerticalFromTranscript,
  resolveDemoSlugForInbound,
  useCaseFromSpeech,
} from "../src/telephony/demoDid.js";
import { defaultServices } from "../src/domain/catalog.js";
import { DEFAULT_AGENT_NAME } from "../src/domain/agent.js";
import { ensureDemoBusinesses } from "../src/store/seed.js";
import { tempStore } from "./helpers.js";

describe("demo DID and use-case catalog", () => {
  it("pins the existing Telnyx Lisbon number", () => {
    expect(DEMO_DID_E164).toBe("+351210210260");
    expect(DEMO_DID_NSN).toBe("210210260");
    expect(DEMO_DID_DISPLAY).toBe("21 021 0260");
    expect(DEMO_DID_DISPLAY_INTL).toBe("+351 21 021 0260");
    expect(DEMO_DID_TEL).toBe("tel:+351210210260");
    expect(formatDemoDidNational("+351210210260")).toBe("21 021 0260");
    expect(isDemoDid("+351210210260")).toBe(true);
    expect(isDemoDid("351210210260")).toBe(true);
    expect(isDemoDid("210210260")).toBe(true);
    expect(isDemoDid("+351210210261")).toBe(false);
  });

  it("maps each public use-case to a stable demo slug", () => {
    expect(demoSlugForUseCase("clinica")).toBe("clinica-central");
    expect(demoSlugForUseCase("barbearia")).toBe("barbearia-lisboa");
    expect(demoSlugForUseCase("salao")).toBe("barbearia-lisboa");
    expect(demoSlugForUseCase("restaurante")).toBe("restaurante-baixa");
    expect(demoSlugForUseCase("oficina")).toBe("oficina-norte");
    expect(demoSlugForUseCase("imobiliaria")).toBe("imobiliaria-baixa");
    expect(demoSlugForUseCase("ginasio")).toBe("clinica-central");
    expect(demoSlugForUseCase("outro")).toBe("clinica-central");
  });

  it("lists picker options in landing order (five jobs, not four shops)", () => {
    expect(listDemoOptions().map((o) => o.useCase)).toEqual([
      "clinica",
      "barbearia",
      "restaurante",
      "oficina",
      "imobiliaria",
    ]);
    expect(listDemoOptions().every((o) => o.agentName === DEFAULT_AGENT_NAME)).toBe(true);
  });

  it("seeds every picker tenant and new default catalogs", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    for (const opt of listDemoOptions()) {
      const biz = store.getBusinessBySlug(opt.slug);
      expect(biz?.useCase).toBe(opt.useCase);
      expect(biz?.status).toBe("active");
      expect(biz?.locale).toBe("pt");
      expect(biz?.agentName).toBe(DEFAULT_AGENT_NAME);
    }
    expect(defaultServices("oficina").map((s) => s.name)).toEqual([
      "Diagnóstico",
      "Revisão",
      "Pneus",
    ]);
    expect(defaultServices("imobiliaria").map((s) => s.name)).toEqual([
      "Visita ao imóvel",
      "Avaliação",
    ]);
    expect(defaultServices("ginasio").map((s) => s.name)).toEqual([
      "Aula experimental",
      "Personal trainer",
    ]);
  });

  it("always streams the Live picker; speech and DTMF are handled inside the session", () => {
    const now = 1_000_000;
    bindDemoCaller({ callerE164: "+351910000001", useCase: "barbearia", now, ttlMs: 30 * 60_000 });
    expect(
      resolveDemoSlugForInbound({ toE164: DEMO_DID_E164, fromE164: "+351910000001", now }),
    ).toEqual({ kind: "live", slug: DEMO_PICKER_SLUG });
    expect(resolveDemoSlugForInbound({ toE164: DEMO_DID_E164, digits: "2", now })).toEqual({
      kind: "live",
      slug: DEMO_PICKER_SLUG,
    });
    expect(
      resolveDemoSlugForInbound({ toE164: DEMO_DID_E164, speech: "quero a oficina", now }),
    ).toEqual({ kind: "live", slug: DEMO_PICKER_SLUG });
    expect(isDemoPickerSlug(DEMO_PICKER_SLUG)).toBe(true);
    expect(demoUseCaseFromChoice("2")).toBe("barbearia");
    expect(demoUseCaseFromChoice("oficina-norte")).toBe("oficina");
    expect(useCaseFromSpeech("imobiliária por favor")).toBe("imobiliaria");
  });

  it("remembers the chosen vertical from caller speech or 1–5, not from the Atende menu", () => {
    const now = 3_000_000;
    expect(
      rememberDemoVerticalFromTranscript({
        text: "1 clínica, 2 barbearia, 3 restaurante, 4 oficina, 5 imobiliária",
        fromE164: "+351910000010",
        callSid: "CA_menu",
        now,
        source: "output",
      }),
    ).toBeUndefined();
    expect(
      rememberDemoVerticalFromTranscript({
        text: "quero a oficina",
        fromE164: "+351910000010",
        callSid: "CA_menu",
        now,
        source: "input",
      }),
    ).toBe("oficina-norte");
    expect(rememberedDemoSlug({ fromE164: "+351910000010", callSid: "CA_menu", now })).toBe("oficina-norte");
    expect(
      rememberDemoVerticalFromTranscript({
        text: "clínica",
        fromE164: "+351910000010",
        callSid: "CA_menu",
        now,
        source: "input",
      }),
    ).toBe("oficina-norte");

    expect(
      rememberDemoVerticalFromTranscript({
        text: "opção quatro",
        fromE164: "+351910000011",
        now,
        source: "input",
      }),
    ).toBe("oficina-norte");
    expect(
      rememberDemoVerticalFromTranscript({
        text: "5",
        fromE164: "+351910000012",
        now,
        source: "input",
      }),
    ).toBe("imobiliaria-baixa");
    expect(
      rememberDemoVerticalFromTranscript({
        text: "Olá, Oficina Norte — quer Diagnóstico, Revisão ou Pneus?",
        fromE164: "+351910000013",
        now,
        source: "output",
      }),
    ).toBe("oficina-norte");
  });

  it("maps SIP From headers to the vertical chosen on the IVR", () => {
    const now = 2_000_000;
    rememberDemoChoice({ slug: "restaurante-baixa", fromE164: "+351910000088", now });
    expect(
      demoSlugFromSipHeaders(
        [{ name: "From", value: '"Ana" <sip:+351910000088@sip.example.com>' }],
        now,
      ),
    ).toBe("restaurante-baixa");
    expect(
      demoSlugFromSipHeaders([{ name: "X-Atende-Slug", value: "imobiliaria-baixa" }], now),
    ).toBe("imobiliaria-baixa");
    expect(rememberedDemoSlug({ fromE164: "+351910000088", now: now + 31 * 60_000 })).toBeUndefined();
  });
});
