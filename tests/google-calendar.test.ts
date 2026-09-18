import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePersistence } from "../src/store/persistence.js";
import { Store } from "../src/store/store.js";
import {
  completeGoogleOAuth,
  publicPersonAccount,
  syncGoogleCalendar,
} from "../src/scheduling/googleCalendar.js";
import { tempStore } from "./helpers.js";
import { app, store } from "../src/server.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeBusiness(store: Store, name = "Clínica Agenda Google") {
  return store.createBusiness({
    name,
    useCase: "clinica",
    locale: "pt",
    agentName: "Atende",
    agentGender: "neutro",
    planId: "base",
    contactEmail: "nuno@esperanca.pt",
    contactPhone: "+351910000000",
  });
}

describe("person/account + Google Calendar persistence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a person under the business with onboard email and no password", () => {
    const db = tempStore();
    const business = makeBusiness(db);
    const account = db.getOwnerAccount(business.id);
    expect(account).toBeDefined();
    expect(account?.email).toBe("nuno@esperanca.pt");
    expect(account?.google).toBeNull();
    expect(account && "password" in account).toBe(false);
    expect(account && "passwordHash" in account).toBe(false);
  });

  it("persists Google OAuth tokens and CSRF state to disk, not memory only", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atende-google-"));
    const first = new Store(new FilePersistence(dir));
    const business = makeBusiness(first);
    const account = first.getOwnerAccount(business.id);
    if (!account) throw new Error("missing account");
    account.google = {
      googleEmail: "nuno@gmail.com",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: "https://www.googleapis.com/auth/calendar.events",
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      lastSyncError: null,
      syncStatus: "connected",
      overlayEvents: [],
    };
    first.saveAccount(account);
    const oauth = first.createOAuthState(business.id, account.id);
    await first.flush();

    const second = new Store(new FilePersistence(dir));
    const reloaded = second.getOwnerAccount(business.id);
    expect(reloaded?.google?.accessToken).toBe("access-secret");
    expect(reloaded?.google?.refreshToken).toBe("refresh-secret");
    expect(reloaded?.email).toBe("nuno@esperanca.pt");
    const consumed = second.consumeOAuthState(oauth.id);
    expect(consumed?.accountId).toBe(account.id);
    expect(second.consumeOAuthState(oauth.id)).toBeNull();
  });

  it("never returns tokens on the public person payload", () => {
    const db = tempStore();
    const business = makeBusiness(db);
    const account = db.getOwnerAccount(business.id);
    if (!account) throw new Error("missing account");
    account.google = {
      googleEmail: "nuno@gmail.com",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      tokenExpiresAt: null,
      scope: null,
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      lastSyncError: null,
      syncStatus: "connected",
      overlayEvents: [],
    };
    const json = JSON.stringify(publicPersonAccount(account));
    expect(json).not.toContain("access-secret");
    expect(json).not.toContain("refresh-secret");
    expect(json).toContain("nuno@gmail.com");
    expect(publicPersonAccount(account).google.connected).toBe(true);
  });

  it("exchanges OAuth code, stores tokens, pulls overlay and pushes bookings", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    const db = tempStore();
    const business = makeBusiness(db);
    const account = db.getOwnerAccount(business.id);
    if (!account) throw new Error("missing account");
    const state = db.createOAuthState(business.id, account.id);
    db.addBooking({
      id: "bk-1",
      businessId: business.id,
      serviceId: business.services[0].id,
      serviceName: "Consulta",
      resourceId: null,
      customerName: "Ana",
      customerPhone: "+351910000001",
      start: new Date(Date.now() + 86_400_000).toISOString(),
      end: new Date(Date.now() + 86_400_000 + 30 * 60_000).toISOString(),
      source: "web",
      calBookingUid: null,
      googleEventId: null,
      createdAt: new Date().toISOString(),
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "ya29.stored",
            refresh_token: "1//stored",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.events",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("oauth2/v2/userinfo")) {
        return new Response(JSON.stringify({ email: "nuno@gmail.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/calendars/primary/events") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "g-overlay",
                summary: "Almoço",
                start: { dateTime: new Date(Date.now() + 3_600_000).toISOString() },
                end: { dateTime: new Date(Date.now() + 7_200_000).toISOString() },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/calendars/primary/events") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "g-pushed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeGoogleOAuth(db, state.id, "auth-code");
    expect(result.ok).toBe(true);
    await db.flush();
    const saved = db.getOwnerAccount(business.id);
    expect(saved?.google?.accessToken).toBe("ya29.stored");
    expect(saved?.google?.refreshToken).toBe("1//stored");
    expect(saved?.google?.googleEmail).toBe("nuno@gmail.com");
    expect(saved?.google?.overlayEvents.some((event) => event.googleEventId === "g-overlay")).toBe(true);
    expect(db.listBookings(business.id)[0].googleEventId).toBe("g-pushed");
    expect(db.consumeOAuthState(state.id)).toBeNull();
  });

  it("syncs overlay events onto an already connected account", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    const db = tempStore();
    const business = makeBusiness(db);
    const account = db.getOwnerAccount(business.id);
    if (!account) throw new Error("missing account");
    account.google = {
      googleEmail: "nuno@gmail.com",
      accessToken: "ya29.live",
      refreshToken: "1//live",
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: null,
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      lastSyncError: null,
      syncStatus: "connected",
      overlayEvents: [],
    };
    db.saveAccount(account);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/calendars/primary/events")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "g2",
                summary: "Reunião",
                start: { dateTime: new Date().toISOString() },
                end: { dateTime: new Date(Date.now() + 1800_000).toISOString() },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("nope", { status: 500 });
    });
    const result = await syncGoogleCalendar(db, business.id);
    expect(result.ok).toBe(true);
    expect(result.pulled).toBe(1);
    expect(db.getOwnerAccount(business.id)?.google?.overlayEvents[0]?.title).toBe("Reunião");
  });
});

describe("Google Calendar HTTP (no password login)", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("onboard persists contact email on the person and connect reports google_not_configured", async () => {
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const onboard = await fetch(`${base}/api/onboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Clinica HTTP ${Date.now()}`,
        useCase: "clinica",
        contactEmail: "ops@transformatiive.com",
        contactPhone: "+351210210260",
      }),
    });
    const created = (await onboard.json()) as { slug: string };
    const payloadRes = await fetch(`${base}/api/business/${created.slug}`);
    const payload = (await payloadRes.json()) as {
      business: { contactEmail: string };
      account: { email: string; google: { connected: boolean } };
    };
    expect(payload.business.contactEmail).toBe("ops@transformatiive.com");
    expect(payload.account.email).toBe("ops@transformatiive.com");
    expect(payload.account.google.connected).toBe(false);
    const leaked = JSON.stringify(payload);
    expect(leaked).not.toMatch(/accessToken|refreshToken|password/i);

    const connect = await fetch(`${base}/api/business/${created.slug}/google/connect`);
    const connectBody = (await connect.json()) as { error: string };
    expect(connect.status).toBe(503);
    expect(connectBody.error).toBe("google_not_configured");

    const owner = store.getBusinessBySlug(created.slug);
    expect(owner?.contactEmail).toBe("ops@transformatiive.com");
    expect(store.getOwnerAccount(owner!.id)?.email).toBe("ops@transformatiive.com");
  });
});
