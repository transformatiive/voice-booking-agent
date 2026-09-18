import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "react-email";
import { OnboardConfirmEmail } from "../src/email/OnboardConfirmEmail.js";
import { sendOnboardConfirmEmail } from "../src/email/mailer.js";

describe("onboard confirmation email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips send when contact email is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sendOnboardConfirmEmail({
      businessId: "biz_1",
      businessName: "Clínica Esperança",
      agentName: "Atende",
      slug: "clinica-esperanca",
      to: null,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("skips send and warns when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sendOnboardConfirmEmail({
      businessId: "biz_1",
      businessName: "Clínica Esperança",
      agentName: "Atende",
      slug: "clinica-esperanca",
      to: "geral@esperanca.pt",
    });
    expect(warn.mock.calls.some((call) => String(call[0]).includes("RESEND_API_KEY"))).toBe(true);
  });

  it("renders Portuguese confirmation with a backoffice link", async () => {
    const html = await render(
      createElement(OnboardConfirmEmail, {
        businessName: "Clínica Esperança",
        agentName: "Atende",
        backofficeUrl: "https://example.com/app/clinica-esperanca",
      }),
    );
    expect(html).toContain("A sua conta Atende está pronta");
    expect(html).toContain("2 dias úteis");
    expect(html).toContain("Telnyx");
    expect(html).toContain("https://example.com/app/clinica-esperanca");
    expect(html).toContain("lang=\"pt\"");
  });
});
