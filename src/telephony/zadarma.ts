import { createHash, createHmac } from "node:crypto";
import type { PhoneNumber } from "../domain/types.js";
import type { AvailableNumber, NumberProvider, SearchOptions } from "./provider.js";

const ZADARMA_API = "https://api.zadarma.com";

/**
 * Fallback provider (fast start, PT mobile 9… + national, SIP docs for
 * Retell/Vapi). Zadarma signs requests with an HMAC-SHA1 scheme. Number
 * purchase is often completed in the Zadarma panel, so API provisioning may
 * require a manual step — surfaced clearly rather than silently faked.
 */
export class ZadarmaNumberProvider implements NumberProvider {
  readonly name = "zadarma" as const;

  constructor(
    private readonly key: string,
    private readonly secret: string,
  ) {}

  private sign(method: string, params: Record<string, string>): { authHeader: string; query: string } {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    const md5 = createHash("md5").update(sorted).digest("hex");
    const signatureBase = `${method}${sorted}${md5}`;
    const hmac = createHmac("sha1", this.secret).update(signatureBase).digest("hex");
    const signature = Buffer.from(hmac).toString("base64");
    return { authHeader: `${this.key}:${signature}`, query: sorted };
  }

  private async request(method: string, params: Record<string, string> = {}): Promise<unknown> {
    const { authHeader, query } = this.sign(method, params);
    const url = query ? `${ZADARMA_API}${method}?${query}` : `${ZADARMA_API}${method}`;
    const res = await fetch(url, { headers: { Authorization: authHeader } });
    if (!res.ok) {
      throw new Error(`Zadarma ${method} -> ${res.status}`);
    }
    return res.json();
  }

  /** Connectivity check used by health/diagnostics. */
  async checkBalance(): Promise<unknown> {
    return this.request("/v1/info/balance/");
  }

  async searchNumbers(options: SearchOptions): Promise<AvailableNumber[]> {
    const data = (await this.request("/v1/direct_numbers/", {})) as {
      info?: Array<{ number?: string; country_iso?: string; monthly_fee?: string }>;
    };
    return (data.info ?? [])
      .filter((n) => (n.country_iso ?? "").toUpperCase() === options.country.toUpperCase())
      .map((n) => ({
        e164: n.number ? `+${n.number.replace(/^\+/, "")}` : "",
        type: options.type,
        monthlyCostCents: Math.round(Number(n.monthly_fee ?? "0") * 100),
      }))
      .filter((n) => n.e164 !== "");
  }

  async provisionNumber(): Promise<PhoneNumber> {
    throw new Error(
      "zadarma_manual_provisioning: compre o número no painel Zadarma e configure o SIP; a API não expõe compra automática.",
    );
  }

  async releaseNumber(): Promise<boolean> {
    throw new Error("zadarma_manual_release: liberte o número no painel Zadarma.");
  }
}
