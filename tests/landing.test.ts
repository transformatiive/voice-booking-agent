import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { app } from "../src/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spaIndex = join(root, "web", "dist", "index.html");

describe("Vite marketing landing", () => {
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

  async function listen(server: ReturnType<typeof createServer>): Promise<number> {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    return (server.address() as AddressInfo).port;
  }

  it("GET / serves the Vite SPA shell, not public/index.html", async () => {
    expect(existsSync(spaIndex)).toBe(true);
    const server = createServer(app);
    servers.push(server);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();
    const spa = readFileSync(spaIndex, "utf8");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/html/);
    expect(html).toBe(spa);
    expect(html).toContain("<title>Atende — recepcionista de voz para PME</title>");
    expect(html).toContain('id="root"');
    expect(html).toMatch(/assets\/index-/);
    expect(html).not.toContain("Sofia");
    expect(html).not.toContain('id="heroCallcard"');
    expect(html).not.toContain("Está a atender um cliente");
  });

  it("GET /index.html also serves the SPA, not the Sofia static page", async () => {
    expect(existsSync(spaIndex)).toBe(true);
    const server = createServer(app);
    servers.push(server);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/index.html`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('id="root"');
    expect(html).not.toContain('id="heroCallcard"');
  });
});
