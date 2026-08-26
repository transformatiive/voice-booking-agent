import { describe, expect, it } from "vitest";
import { PLANS } from "../src/domain/plans.js";

describe("plan marketing copy", () => {
  it("keeps general appointment-business phrasing (not barber-only)", () => {
    const all = Object.values(PLANS)
      .flatMap((plan) => plan.features)
      .join("\n");
    expect(all).not.toMatch(/barbeiro|cadeiras/i);
    expect(PLANS.base.features).toContain("Transferência de chamada para o seu telemóvel");
    expect(PLANS.pro.features).toContain("Até 3 recursos (profissionais/espaços)");
  });
});
