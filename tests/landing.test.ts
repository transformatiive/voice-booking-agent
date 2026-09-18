import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { app } from "../src/server.js";

describe("static marketing landing", () => {
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

  it("GET / serves public/index.html, not the Vite SPA shell", async () => {
    const server = createServer(app);
    servers.push(server);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/html/);
    expect(html).toContain("<title>Atende · Recepcionista de voz para o seu negócio</title>");
    expect(html).toContain("Sofia");
    expect(html).toContain('id="heroCallcard"');
    expect(html).not.toContain('id="root"');
    expect(html).not.toMatch(/assets\/index-/);
  });
});
