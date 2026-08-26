import type { NumberType, PhoneNumber } from "../domain/types.js";

export interface AvailableNumber {
  e164: string;
  type: NumberType;
  monthlyCostCents: number;
}

export interface SearchOptions {
  country: string;
  type: NumberType;
  limit?: number;
}

/**
 * Abstraction over DID providers. Telnyx is the primary SaaS substrate;
 * Zadarma is the fast-start fallback; Mock lets onboarding complete instantly
 * during pilots/demos before KYC is done.
 *
 * Architecture: DID provider -> SIP -> voice agent stack -> warm transfer to
 * the barber's mobile.
 */
export interface NumberProvider {
  readonly name: "telnyx" | "zadarma" | "mock";
  searchNumbers(options: SearchOptions): Promise<AvailableNumber[]>;
  provisionNumber(e164: string): Promise<PhoneNumber>;
  releaseNumber(e164: string): Promise<boolean>;
}
