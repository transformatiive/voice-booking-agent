import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { app } from "../src/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("teal chrome on public and backoffice surfaces", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("legal HTML uses ATENDE teal chrome, not Sofia terracotta", () => {
    const css = readFileSync(join(root, "public", "atende.css"), "utf8");
    expect(css).toContain("Manrope");
    expect(css).toContain("Public Sans");
    expect(css).toContain("#0e1a24");
    expect(css).toContain("oklch(0.50 0.13 168)");
    expect(css).not.toContain("#a5372a");
    expect(css).not.toContain("Fraunces");

    for (const file of ["privacidade.html", "termos.html", "dpa.html"]) {
      const html = readFileSync(join(root, "public", file), "utf8");
      expect(html).toContain("/atende.css");
      expect(html).toContain("ATEND");
      expect(html).not.toContain("/landing.css");
      expect(html).not.toContain("class=\"logo\"");
    }
  });

  it("serves legal pages with teal chrome", async () => {
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    for (const path of ["/privacidade", "/termos", "/dpa"]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("/atende.css");
      expect(html).toContain("ATEND");
      expect(html).not.toContain("/landing.css");
    }
  });

  it("onboard dialog and backoffice no longer use the blocking wait page", () => {
    const landing = readFileSync(join(root, "web", "src", "pages", "Landing.tsx"), "utf8");
    const backoffice = readFileSync(join(root, "web", "src", "pages", "Backoffice.tsx"), "utf8");
    expect(landing).toContain('layout="viewport"');
    expect(landing).toContain('autoComplete="tel"');
    expect(backoffice).toContain("Pendente de Aprovação Regulatória");
    expect(backoffice).toContain("Telnyx");
    expect(backoffice).toContain("2 dias úteis");
    expect(backoffice).not.toContain("Estamos a preparar a sua conta");
    expect(backoffice).not.toContain("Aguarda aprovação");
    expect(backoffice).not.toContain("O backoffice abre nessa altura");
  });

  it("SPA shell still exists for /app routes", () => {
    expect(existsSync(join(root, "web", "src", "pages", "Backoffice.tsx"))).toBe(true);
  });
});
