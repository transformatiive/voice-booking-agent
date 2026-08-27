import { describe, expect, it } from "vitest";
import { PLANS, PORTABILITY_SETUP_FEE_CENTS } from "../src/domain/plans.js";

describe("plan marketing copy", () => {
  it("keeps general appointment-business phrasing (not barber-only)", () => {
    const all = Object.values(PLANS)
      .flatMap((plan) => plan.features)
      .join("\n");
    expect(all).not.toMatch(/barbeiro|cadeiras/i);
    expect(PLANS.base.features).toContain("Transferência de chamada para o seu telemóvel");
    expect(PLANS.pro.features).toContain("Até 3 recursos (profissionais/espaços)");
  });

  it("sells Google Calendar conflict management on all paid plans, without Cal.com", () => {
    const googleCalendarFeature =
      "Agendamento por voz com Google Calendar (evita conflitos e sobreposições)";
    expect(PLANS.base.features).toContain(googleCalendarFeature);
    expect(PLANS.pro.features[0]).toBe("Tudo do Base");
    expect(PLANS.studio.features[0]).toBe("Tudo do Pro");
    const all = Object.values(PLANS)
      .flatMap((plan) => plan.features)
      .join("\n");
    expect(all).toMatch(/Google Calendar/);
    expect(all).toMatch(/conflitos|sobreposições/);
    expect(all).not.toMatch(/cal\.com/i);
  });

  it("keeps list prices and included minutes unchanged", () => {
    expect(PLANS.base.priceCents).toBe(4900);
    expect(PLANS.base.includedMinutes).toBe(200);
    expect(PLANS.pro.priceCents).toBe(9900);
    expect(PLANS.pro.includedMinutes).toBe(600);
    expect(PLANS.studio.priceCents).toBe(19900);
    expect(PLANS.studio.includedMinutes).toBe(1500);
    expect(PORTABILITY_SETUP_FEE_CENTS).toBe(14900);
  });
});
