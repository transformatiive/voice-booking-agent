import type { NumberType, PhoneNumber } from "../domain/types.js";
import type { AvailableNumber, NumberProvider, SearchOptions } from "./provider.js";

const TELNYX_API = "https://api.telnyx.com/v2";

function telnyxPhoneNumberType(type: NumberType): string {
  switch (type) {
    case "mobile":
      return "mobile";
    case "geographic":
      return "local";
    case "tollfree":
      return "toll_free";
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown number type: ${String(exhaustive)}`);
    }
  }
}

/** Primary provider. Requires TELNYX_API_KEY (KYC-gated inventory). */
export class TelnyxNumberProvider implements NumberProvider {
  readonly name = "telnyx" as const;

  constructor(
    private readonly apiKey: string,
    private readonly connectionId: string | undefined,
  ) {}

  private async call(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${TELNYX_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Telnyx ${path} -> ${res.status}`);
    }
    return res.json();
  }

  async searchNumbers(options: SearchOptions): Promise<AvailableNumber[]> {
    const params = new URLSearchParams({
      "filter[country_code]": options.country,
      "filter[phone_number_type]": telnyxPhoneNumberType(options.type),
      "filter[limit]": String(options.limit ?? 5),
    });
    const data = (await this.call(`/available_phone_numbers?${params.toString()}`)) as {
      data?: Array<{ phone_number: string; cost_information?: { monthly_cost?: string } }>;
    };
    return (data.data ?? []).map((n) => ({
      e164: n.phone_number,
      type: options.type,
      monthlyCostCents: Math.round(Number(n.cost_information?.monthly_cost ?? "0") * 100),
    }));
  }

  async provisionNumber(e164: string): Promise<PhoneNumber> {
    await this.call("/number_orders", {
      method: "POST",
      body: JSON.stringify({
        phone_numbers: [{ phone_number: e164 }],
        connection_id: this.connectionId,
      }),
    });
    return {
      e164,
      provider: "telnyx",
      type: e164.startsWith("+3519") ? "mobile" : "geographic",
      status: "active",
      monthlyCostCents: 0,
    };
  }

  async releaseNumber(e164: string): Promise<boolean> {
    // Look up the number id, then delete it.
    const params = new URLSearchParams({ "filter[phone_number]": e164 });
    const data = (await this.call(`/phone_numbers?${params.toString()}`)) as {
      data?: Array<{ id: string }>;
    };
    const id = data.data?.[0]?.id;
    if (!id) {
      return false;
    }
    await this.call(`/phone_numbers/${id}`, { method: "DELETE" });
    return true;
  }
}
