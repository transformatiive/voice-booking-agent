import type { PhoneNumber } from "../domain/types.js";
import type { AvailableNumber, NumberProvider, SearchOptions } from "./provider.js";

/** Deterministic-ish mock provider for demos and pilots before KYC. */
export class MockNumberProvider implements NumberProvider {
  readonly name = "mock" as const;

  async searchNumbers(options: SearchOptions): Promise<AvailableNumber[]> {
    const limit = options.limit ?? 3;
    const numbers: AvailableNumber[] = [];
    for (let i = 0; i < limit; i++) {
      const suffix = String(100000 + Math.floor(Math.random() * 899999));
      // Prefer mobile 9x for barbearias, matching how clients already call.
      const e164 = options.type === "mobile" ? `+35192${suffix}` : `+35121${suffix}`;
      numbers.push({
        e164,
        type: options.type,
        monthlyCostCents: options.type === "mobile" ? 900 : 300,
      });
    }
    return numbers;
  }

  async provisionNumber(e164: string): Promise<PhoneNumber> {
    return {
      e164,
      provider: "mock",
      type: e164.startsWith("+3519") ? "mobile" : "geographic",
      status: "active",
      monthlyCostCents: e164.startsWith("+3519") ? 900 : 300,
    };
  }

  async releaseNumber(): Promise<boolean> {
    return true;
  }
}
