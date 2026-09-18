import { createElement } from "react";
import { Resend } from "resend";
import { render } from "react-email";
import { config } from "../config.js";
import { OnboardConfirmEmail } from "./OnboardConfirmEmail.js";

export interface OnboardConfirmInput {
  businessId: string;
  businessName: string;
  agentName: string;
  slug: string;
  to: string | null;
}

export async function sendOnboardConfirmEmail(input: OnboardConfirmInput): Promise<void> {
  const to = input.to?.trim();
  if (!to) {
    return;
  }
  const apiKey = config.mail.resendApiKey;
  if (!apiKey) {
    console.warn("[mail] RESEND_API_KEY is not set; skipped onboard confirmation");
    return;
  }

  const backofficeUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/app/${input.slug}`;
  const element = createElement(OnboardConfirmEmail, {
    businessName: input.businessName,
    agentName: input.agentName,
    backofficeUrl,
  });
  const html = await render(element);
  const text = await render(element, { plainText: true });

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from: config.mail.from,
      to: [to],
      subject: `A sua conta Atende está pronta — ${input.businessName}`,
      html,
      text,
    },
    { idempotencyKey: `onboard-confirm/${input.businessId}` },
  );
  if (error) {
    console.error("[mail] onboard confirmation failed:", error.message);
  }
}
