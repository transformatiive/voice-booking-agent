import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultServices } from "../src/domain/catalog.js";
import { greeting } from "../src/agent/conversation.js";
import { buildGrokInstructions, buildGrokSessionConfig } from "../src/telephony/grokRealtime.js";
import { ensureDemoBusinesses, MARKETING_DEMO_SLUG, LEGACY_BARBER_DEMO_SLUG } from "../src/store/seed.js";
import { tempStore } from "./helpers.js";

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
      agentName: "Sofia",
      agentGender: "feminino",
      planId: "pro",
      status: "active",
    });
    expect(store.getBusinessBySlug(LEGACY_BARBER_DEMO_SLUG)).toBeDefined();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG);
    expect(clinic).toBeDefined();
    expect(clinic?.useCase).toBe("clinica");
    expect(clinic?.name).toBe("Clínica Central");
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

  it("clinic greeting and Grok instructions book consultations without medical advice", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const clinic = store.getBusinessBySlug(MARKETING_DEMO_SLUG)!;
    const hello = greeting(clinic);
    expect(hello).toMatch(/consulta/i);
    expect(hello).toMatch(/especialidade/i);
    expect(hello).not.toMatch(/barbearia|corte/i);

    const instructions = buildGrokInstructions(clinic);
    expect(instructions).toMatch(/português de Portugal/);
    expect(instructions).toMatch(/Nunca dês conselhos médicos/);
    expect(instructions).toMatch(/SMS/);
    expect(instructions).toMatch(/especialidade/);
    expect(instructions).not.toMatch(/corte de cabelo|barba/i);

    const session = buildGrokSessionConfig(clinic);
    const vad = session.turn_detection as { type: string; threshold: number };
    expect(vad.type).toBe("server_vad");
    expect(vad.threshold).toBeLessThan(0.6);
    const audio = session.audio as { input: { transcription: { language_hint: string } } };
    expect(audio.input.transcription.language_hint).toBe("pt-PT");
  });

  it("homepage is the live demo: no /demo navigation, clinic card on /", () => {
    const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
    const js = readFileSync(new URL("../public/landing.js", import.meta.url), "utf8");
    expect(html).not.toContain("/demo/barbearia-lisboa");
    expect(html).not.toMatch(/href="\/demo\//);
    expect(html).toContain('id="demo-call"');
    expect(html).toContain("Iniciar chamada");
    expect(html).toContain("consulta de dermatologia");
    expect(html).toContain("CHAMADA AO VIVO");
    expect(html).toContain("/voice-call.js");
    expect(js).toContain("heroSession.startCall");
    expect(js).not.toContain("/demo/barbearia");
  });
});
