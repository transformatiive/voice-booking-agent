import { config } from "../config.js";
import type {
  Booking,
  GoogleCalendarConnection,
  GoogleOverlayEvent,
  PersonAccount,
} from "../domain/types.js";
import type { Store } from "../store/store.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const SYNC_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const SYNC_LOOKAHEAD_MS = 31 * 24 * 60 * 60 * 1000;

export interface PublicGoogleStatus {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncStatus: GoogleCalendarConnection["syncStatus"] | "disconnected";
}

export interface PublicPersonAccount {
  id: string;
  email: string | null;
  google: PublicGoogleStatus;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleEventResource {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export function googleOAuthConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

export function googleRedirectUri(): string {
  return config.google.redirectUri ?? `${config.publicBaseUrl}/api/google/oauth/callback`;
}

export function publicPersonAccount(account: PersonAccount): PublicPersonAccount {
  return {
    id: account.id,
    email: account.email,
    google: publicGoogleStatus(account.google),
  };
}

export function publicGoogleStatus(google: GoogleCalendarConnection | null): PublicGoogleStatus {
  if (!google) {
    return {
      connected: false,
      googleEmail: null,
      calendarId: null,
      lastSyncAt: null,
      lastSyncError: null,
      syncStatus: "disconnected",
    };
  }
  return {
    connected: true,
    googleEmail: google.googleEmail,
    calendarId: google.calendarId,
    lastSyncAt: google.lastSyncAt,
    lastSyncError: google.lastSyncError,
    syncStatus: google.syncStatus,
  };
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function completeGoogleOAuth(
  store: Store,
  stateId: string,
  code: string,
): Promise<{ ok: true; slug: string } | { ok: false; slug: string | null; error: string }> {
  const state = store.consumeOAuthState(stateId);
  const business = state ? store.getBusiness(state.businessId) : undefined;
  const slug = business?.slug ?? null;
  if (!state || !business) {
    return { ok: false, slug, error: "invalid_state" };
  }
  if (!googleOAuthConfigured()) {
    return { ok: false, slug, error: "google_not_configured" };
  }
  const account = store.getAccount(state.accountId) ?? store.getOwnerAccount(business.id);
  if (!account) {
    return { ok: false, slug, error: "account_not_found" };
  }
  try {
    const tokens = await exchangeGoogleCode(code);
    const googleEmail = await fetchGoogleEmail(tokens.accessToken);
    account.google = {
      googleEmail,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? account.google?.refreshToken ?? null,
      tokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
      lastSyncAt: null,
      lastSyncError: null,
      syncStatus: "connected",
      overlayEvents: [],
    };
    store.saveAccount(account);
    await syncGoogleCalendar(store, business.id);
    return { ok: true, slug: business.slug };
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    account.google = account.google
      ? { ...account.google, syncStatus: "error", lastSyncError: message }
      : null;
    store.saveAccount(account);
    return { ok: false, slug: business.slug, error: message };
  }
}

export async function disconnectGoogleCalendar(store: Store, businessId: string): Promise<boolean> {
  const account = store.getOwnerAccount(businessId);
  if (!account) {
    return false;
  }
  account.google = null;
  store.saveAccount(account);
  return true;
}

export async function syncGoogleCalendar(
  store: Store,
  businessId: string,
): Promise<{ ok: boolean; error?: string; pushed: number; pulled: number }> {
  const business = store.getBusiness(businessId);
  const account = store.getOwnerAccount(businessId);
  if (!business || !account?.google) {
    return { ok: false, error: "not_connected", pushed: 0, pulled: 0 };
  }
  account.google.syncStatus = "syncing";
  account.google.lastSyncError = null;
  store.saveAccount(account);
  try {
    const accessToken = await ensureFreshAccessToken(store, account);
    if (!accessToken || !account.google) {
      return { ok: false, error: "token_refresh_failed", pushed: 0, pulled: 0 };
    }
    const now = Date.now();
    const overlay = await listGoogleEvents(accessToken, account.google.calendarId, {
      timeMin: new Date(now - SYNC_LOOKBACK_MS).toISOString(),
      timeMax: new Date(now + SYNC_LOOKAHEAD_MS).toISOString(),
    });
    account.google.overlayEvents = overlay;
    let pushed = 0;
    for (const booking of store.listBookings(businessId)) {
      if (booking.googleEventId) {
        continue;
      }
      const eventId = await insertGoogleEvent(accessToken, account.google.calendarId, booking, business.timezone);
      if (eventId) {
        store.updateBooking(businessId, booking.id, { googleEventId: eventId });
        pushed += 1;
      }
    }
    account.google.lastSyncAt = new Date().toISOString();
    account.google.syncStatus = "connected";
    account.google.lastSyncError = null;
    store.saveAccount(account);
    return { ok: true, pushed, pulled: overlay.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    if (account.google) {
      account.google.syncStatus = "error";
      account.google.lastSyncError = message;
      store.saveAccount(account);
    }
    return { ok: false, error: message, pushed: 0, pulled: 0 };
  }
}

export async function pushBookingToGoogle(store: Store, booking: Booking): Promise<void> {
  if (booking.googleEventId) {
    return;
  }
  const business = store.getBusiness(booking.businessId);
  const account = store.getOwnerAccount(booking.businessId);
  if (!business || !account?.google) {
    return;
  }
  try {
    const accessToken = await ensureFreshAccessToken(store, account);
    if (!accessToken || !account.google) {
      return;
    }
    const eventId = await insertGoogleEvent(accessToken, account.google.calendarId, booking, business.timezone);
    if (eventId) {
      store.updateBooking(booking.businessId, booking.id, { googleEventId: eventId });
    }
  } catch (err) {
    console.warn("[google] push booking failed:", err instanceof Error ? err.message : err);
  }
}

async function exchangeGoogleCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}> {
  const body = new URLSearchParams({
    code,
    client_id: config.google.clientId ?? "",
    client_secret: config.google.clientSecret ?? "",
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? `token_http_${res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scope: data.scope ?? null,
  };
}

async function ensureFreshAccessToken(store: Store, account: PersonAccount): Promise<string | null> {
  const google = account.google;
  if (!google) {
    return null;
  }
  const expiresAt = google.tokenExpiresAt ? Date.parse(google.tokenExpiresAt) : 0;
  const stillValid = expiresAt > Date.now() + 60_000;
  if (stillValid && google.accessToken) {
    return google.accessToken;
  }
  if (!google.refreshToken || !googleOAuthConfigured()) {
    return google.accessToken || null;
  }
  const body = new URLSearchParams({
    refresh_token: google.refreshToken,
    client_id: config.google.clientId ?? "",
    client_secret: config.google.clientSecret ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    google.syncStatus = "error";
    google.lastSyncError = data.error_description ?? data.error ?? `refresh_http_${res.status}`;
    store.saveAccount(account);
    return null;
  }
  google.accessToken = data.access_token;
  google.tokenExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : google.tokenExpiresAt;
  if (data.scope) {
    google.scope = data.scope;
  }
  store.saveAccount(account);
  return google.accessToken;
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  range: { timeMin: string; timeMax: string },
): Promise<GoogleOverlayEvent[]> {
  const params = new URLSearchParams({
    timeMin: range.timeMin,
    timeMax: range.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`calendar_list_${res.status}`);
  }
  const data = (await res.json()) as { items?: GoogleEventResource[] };
  const events: GoogleOverlayEvent[] = [];
  for (const item of data.items ?? []) {
    if (!item.id) {
      continue;
    }
    const start = item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00` : null);
    const end = item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T00:00:00` : start);
    if (!start || !end) {
      continue;
    }
    events.push({
      id: overlayEventId(item.id),
      googleEventId: item.id,
      title: item.summary || "(sem título)",
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    });
  }
  return events;
}

async function insertGoogleEvent(
  accessToken: string,
  calendarId: string,
  booking: Booking,
  timeZone: string,
): Promise<string | null> {
  const summary = booking.customerName
    ? `${booking.serviceName} — ${booking.customerName}`
    : booking.serviceName;
  const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary,
      description: [
        `Origem Atende: ${booking.source}`,
        booking.customerPhone ? `Telefone: ${booking.customerPhone}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      start: { dateTime: booking.start, timeZone },
      end: { dateTime: booking.end, timeZone },
    }),
  });
  if (!res.ok) {
    throw new Error(`calendar_insert_${res.status}`);
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

export function googleSyncLabel(status: PublicGoogleStatus["syncStatus"]): string {
  switch (status) {
    case "disconnected":
      return "Não ligado";
    case "connected":
      return "Ligado";
    case "syncing":
      return "A sincronizar…";
    case "error":
      return "Erro de sincronização";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Test helper: stable id for overlay events. */
export function overlayEventId(googleEventId: string): string {
  return `gcal_${googleEventId}`;
}
