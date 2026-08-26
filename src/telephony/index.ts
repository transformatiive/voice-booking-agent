import { config, resolvedTelephonyProvider } from "../config.js";
import type { Business, NumberType } from "../domain/types.js";
import type { Store } from "../store/store.js";
import type { NumberProvider } from "./provider.js";
import { MockNumberProvider } from "./mock.js";
import { TelnyxNumberProvider } from "./telnyx.js";
import { ZadarmaNumberProvider } from "./zadarma.js";

export function createNumberProvider(): NumberProvider {
  switch (resolvedTelephonyProvider()) {
    case "telnyx":
      return new TelnyxNumberProvider(config.telephony.telnyxApiKey!, config.telephony.telnyxConnectionId);
    case "zadarma":
      return new ZadarmaNumberProvider(config.telephony.zadarmaKey!, config.telephony.zadarmaSecret!);
    case "mock":
      return new MockNumberProvider();
    default:
      return new MockNumberProvider();
  }
}

export class TelephonyService {
  private readonly provider: NumberProvider;

  constructor(private readonly store: Store) {
    this.provider = createNumberProvider();
  }

  get providerName(): string {
    return this.provider.name;
  }

  async provisionForBusiness(
    business: Business,
    type: NumberType = "mobile",
  ): Promise<{ ok: true; e164: string } | { ok: false; error: string }> {
    try {
      const available = await this.provider.searchNumbers({ country: "PT", type, limit: 1 });
      const pick = available[0];
      if (!pick) {
        return { ok: false, error: "no_numbers_available" };
      }
      const provisioned = await this.provider.provisionNumber(pick.e164);
      business.number = provisioned;
      this.store.saveBusiness(business);
      return { ok: true, e164: provisioned.e164 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "provision_failed" };
    }
  }
}
