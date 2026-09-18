import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

/* ------------------------------------------------------------------ tokens */

const INK = "#0e1a24";
const BODY = "#47586a";
const MUTED = "#5a6b7b";
const SURFACE = "#f6f8fa";
const LINE = "#e4eaf0";
const HAIRLINE = "#eef2f6";
const ACCENT = "oklch(0.50 0.13 168)";
const ACCENT_DARK = "oklch(0.42 0.11 168)";
const ACCENT_SOFT = "oklch(0.95 0.035 168)";
const PANEL = "linear-gradient(175deg,#132330 0%,#0c151e 75%)";
const SANS = "'Public Sans',system-ui,sans-serif";
const DISPLAY = "Manrope,sans-serif";
const MONO = "'JetBrains Mono',monospace";

const DOW_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DOW_HEADER = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/* ------------------------------------------------------------------- types */

interface DayHours {
  open: number | null;
  close: number | null;
}

interface Business {
  name: string;
  slug: string;
  status: "pending" | "active";
  agentName: string;
  agentGender: string;
  locale: string;
  useCase: string;
  contactEmail: string | null;
  numberPreference: string;
  number: { e164: string; status: string } | null;
  hours: DayHours[];
  services: Array<{ id: string; name: string; durationMinutes: number; priceCents: number | null }>;
  resources: Array<{
    id: string;
    name: string;
    role: string;
    serviceIds: string[];
    hours: DayHours[] | null;
    available: boolean;
    transferNumber: string | null;
  }>;
  subscription: {
    planId: string;
    status: string;
    usedMinutes: number;
    includedMinutes: number;
    overageMinutes: number;
    planStartedAt: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  };
  plan: {
    id: string;
    name: string;
    displayName: string;
    priceCents: number;
    includedMinutes: number;
    overageCentsPerMinute: number;
    features: string[];
  };
  agentScript: string;
  agentKnowledge: string;
}

interface Booking {
  id: string;
  start: string;
  serviceName: string;
  customerName: string | null;
  customerPhone: string | null;
  source: string;
  resourceId: string;
  googleEventId?: string | null;
}

interface CallRow {
  id: string;
  fromE164: string | null;
  toE164: string | null;
  startedAt: string;
  durationSeconds: number;
  billedMinutes: number;
  overageMinutes: number;
  status: string;
  provider: string;
}

interface UsageSource {
  kind: string;
  e164: string | null;
  display: string | null;
  nsn?: string;
}

interface GoogleEvent {
  id: string;
  googleEventId: string;
  title: string;
  start: string;
  end: string;
}

interface Account {
  id: string;
  email: string | null;
  google: {
    connected: boolean;
    googleEmail: string | null;
    calendarId: string | null;
    lastSyncAt: string | null;
    lastSyncError: string | null;
    syncStatus: "disconnected" | "connected" | "syncing" | "error";
  };
}

interface Payload {
  business: Business;
  bookings: Booking[];
  calls: CallRow[];
  account: Account | null;
  googleEvents: GoogleEvent[];
  features: { demoActivate?: boolean; stripe?: boolean; gptLive?: boolean; googleCalendar?: boolean };
  usageSource?: UsageSource;
}

type Tab = "agenda" | "chamadas" | "recursos" | "servicos" | "horarios" | "assistente" | "faturacao";
type View = "day" | "week" | "month";

const TAB_IDS: Tab[] = ["agenda", "chamadas", "recursos", "servicos", "horarios", "assistente", "faturacao"];

function tabFromLocation(): Tab {
  if (typeof window === "undefined") return "agenda";
  const query = new URLSearchParams(window.location.search).get("tab") as Tab | null;
  if (query && TAB_IDS.includes(query)) return query;
  const hash = window.location.hash.replace(/^#/, "") as Tab;
  return TAB_IDS.includes(hash) ? hash : "agenda";
}

/* --------------------------------------------------------------- date util */

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfWeek(d: Date) {
  return addDays(d, -((d.getDay() + 6) % 7));
}
function hm(min: number | null) {
  if (min == null) return "";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function toMin(value: string) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
function timeOf(isoString: string) {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function formatWhen(isoString: string) {
  const d = new Date(isoString);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${timeOf(isoString)}`;
}
function euros(cents: number) {
  return `${(cents / 100).toFixed(2)}€`;
}
function labelUseCase(u: string) {
  const map: Record<string, string> = {
    barbearia: "Barbearia", salao: "Salão", clinica: "Clínica", restaurante: "Restaurante",
    oficina: "Oficina", imobiliaria: "Imobiliária", ginasio: "Ginásio", outro: "Outro",
  };
  return map[u] || u;
}

type LineKind = "assigned" | "porting" | "pending";

function lineKind(business: Business): LineKind {
  const number = business.number;
  if (number && number.status === "active") return "assigned";
  if (business.numberPreference === "port" || number?.status === "porting") return "porting";
  return "pending";
}

function lineStatusCopy(business: Business): { kind: LineKind; label: string; title: string; body: string } {
  const kind = lineKind(business);
  switch (kind) {
    case "assigned":
      return {
        kind,
        label: "Número atribuído",
        title: "Linha ativa",
        body: `O número ${business.number?.e164} já está atribuído. A Transformatiive provisiona linhas via Telnyx.`,
      };
    case "porting":
      return {
        kind,
        label: "Pendente de Aprovação Regulatória",
        title: "Pendente de Aprovação Regulatória",
        body: "Pediu para portar o número que os clientes já conhecem. A Transformatiive trata do processo via Telnyx — a aprovação regulatória, se existir, corre do nosso lado e pode nem ser necessária. Costuma levar cerca de 2 dias úteis. O backoffice já está disponível.",
      };
    case "pending":
      return {
        kind,
        label: "Pendente de Aprovação Regulatória",
        title: "Pendente de Aprovação Regulatória",
        body: "O número ainda não está publicado. A Transformatiive atribui o +351 via Telnyx; a aprovação regulatória, se existir, corre do nosso lado e muitas vezes nem é necessária. A linha fica normalmente ativa em cerca de 2 dias úteis. Já pode usar Agenda, Chamadas, Recursos, Serviços, Horários, Assistente e Faturação.",
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/* ------------------------------------------------------------------- icons */

const ICON_PATHS: Record<Tab, string> = {
  agenda: "M3 10h18M8 3v4M16 3v4",
  chamadas: "",
  recursos: "",
  servicos: "M4 7h16M4 12h16M4 17h10",
  horarios: "M12 7v5.2l3.4 2",
  assistente: "M5 10v4M9.5 6.5v11M14.5 8.5v7M19 10.5v3",
  faturacao: "M2.5 10.5h19M6.5 14.5h3",
};

function NavIcon({ tab, color }: { tab: Tab; color: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const };
  if (tab === "agenda")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d={ICON_PATHS.agenda} />
      </svg>
    );
  if (tab === "chamadas")
    return (
      <svg {...common}>
        <path d="M6.5 3h-.8A2.7 2.7 0 0 0 3 5.7c0 8 7.3 15.3 15.3 15.3a2.7 2.7 0 0 0 2.7-2.7v-.8a1.5 1.5 0 0 0-1.2-1.5l-3.2-.6a1.5 1.5 0 0 0-1.5.7l-.8 1.3a12 12 0 0 1-5.4-5.4l1.3-.8a1.5 1.5 0 0 0 .7-1.5l-.6-3.2A1.5 1.5 0 0 0 6.5 3z" />
      </svg>
    );
  if (tab === "recursos")
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6M18 14.9c2 .6 3.4 2.3 3.4 4.4" />
      </svg>
    );
  if (tab === "horarios")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d={ICON_PATHS.horarios} />
      </svg>
    );
  if (tab === "faturacao")
    return (
      <svg {...common}>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <path d={ICON_PATHS.faturacao} />
      </svg>
    );
  return (
    <svg {...common}>
      <path d={ICON_PATHS[tab]} />
    </svg>
  );
}

function Wordmark() {
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 3, padding: "0 8px" }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 20, letterSpacing: "-0.04em", lineHeight: 0.72, color: "#fff" }}>
        ATEND
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", width: 15, height: 14 }}>
        {["100%", "66%", "88%"].map((w) => (
          <i key={w} style={{ display: "block", height: 4, width: w, borderRadius: 99, background: "oklch(0.72 0.14 168)" }} />
        ))}
      </span>
    </span>
  );
}

/* --------------------------------------------------------------- page root */

const NAV: Array<[Tab, string]> = [
  ["agenda", "Agenda"],
  ["chamadas", "Chamadas"],
  ["recursos", "Recursos"],
  ["servicos", "Serviços"],
  ["horarios", "Horários"],
  ["assistente", "Assistente"],
  ["faturacao", "Faturação"],
];

export function Backoffice() {
  const { slug = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>(() => tabFromLocation());
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const next = searchParams.get("tab");
    if (next && TAB_IDS.includes(next as Tab)) {
      setTab(next as Tab);
    }
  }, [searchParams]);

  useEffect(() => {
    const onHash = () => setTab(tabFromLocation());
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);

  async function load() {
    const res = await fetch(`/api/business/${slug}`);
    if (!res.ok) return;
    setState((await res.json()) as Payload);
  }

  useEffect(() => {
    void load();
  }, [slug]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (!google) return;
    if (google === "connected") setFlash("Google Calendar ligado.");
    else setFlash("Não foi possível ligar o Google Calendar.");
    const next = new URLSearchParams(searchParams);
    next.delete("google");
    setSearchParams(next, { replace: true });
    const t = setTimeout(() => setFlash(""), 4000);
    return () => clearTimeout(t);
  }, [searchParams, setSearchParams]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/business/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await load();
      setFlash("Guardado.");
      setTimeout(() => setFlash(""), 2500);
    }
  }

  async function saveHours(hours: DayHours[] | null, resourceId: string | null) {
    if (!resourceId) {
      if (hours) await patch({ hours });
      return;
    }
    const res = await fetch(`/api/business/${slug}/resources/${resourceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    });
    if (res.ok) {
      await load();
      setFlash("Guardado.");
      setTimeout(() => setFlash(""), 2500);
    }
  }

  if (!state) {
    return <div style={{ fontFamily: SANS, color: MUTED, padding: 32 }}>A carregar…</div>;
  }

  const b = state.business;
  const status = lineStatusCopy(b);
  const lineLive = status.kind === "assigned";

  const usedPct = b.subscription.includedMinutes
    ? Math.min(100, Math.round((b.subscription.usedMinutes / b.subscription.includedMinutes) * 100))
    : 0;

  return (
    <div style={{ display: "flex", minHeight: "100svh", fontFamily: SANS, color: INK, background: SURFACE, boxSizing: "border-box" }}>
      <style>{`
        .bo *, .bo *::before, .bo *::after { box-sizing: border-box; }
        .bo-nav:hover { background: rgba(255,255,255,0.08) !important; }
        .bo-ghost:hover { background: ${HAIRLINE} !important; }
      `}</style>

      <aside
        className="bo"
        style={{ flex: "none", width: 234, display: "flex", flexDirection: "column", gap: 24, padding: "22px 16px", background: PANEL }}
      >
        <Link to="/">
          <Wordmark />
        </Link>

        <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{b.name}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: "#93a7b6" }}>{labelUseCase(b.useCase)}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 5, color: "#93a7b6" }}>
            {b.number?.e164 ?? "sem número"}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, fontWeight: 600, color: lineLive ? "oklch(0.84 0.13 168)" : "#f3d9a4" }}>
            <span style={{ display: "block", width: 7, height: 7, borderRadius: 99, background: lineLive ? "oklch(0.78 0.15 168)" : "#e2b657", boxShadow: lineLive ? "0 0 0 4px oklch(0.78 0.15 168 / 0.22)" : "0 0 0 4px #e2b65733" }} />
            {lineLive ? "a atender" : status.label}
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map(([id, label]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                className="bo-nav"
                onClick={() => setTab(id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 13px",
                  border: 0, borderRadius: 11, cursor: "pointer", textAlign: "left",
                  fontFamily: SANS, fontSize: 14.5, fontWeight: 600,
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  color: active ? "#fff" : "#a7bac7",
                }}
              >
                <NavIcon tab={id} color={active ? "oklch(0.78 0.15 168)" : "#8da0af"} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.05)" }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#93a7b6" }}>
            Minutos do plano
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.04em", color: "#fff" }}>
              {b.subscription.usedMinutes}
            </span>
            <span style={{ fontSize: 14, color: "#93a7b6" }}>/ {b.subscription.includedMinutes}</span>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.12)", marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${usedPct}%`, height: "100%", borderRadius: 99, background: "oklch(0.72 0.14 168)" }} />
          </div>
        </div>
      </aside>

      <main className="bo" style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 18, padding: "26px 28px" }}>
        {status.kind !== "assigned" ? (
          <div style={{ padding: "16px 20px", borderRadius: 18, background: ACCENT_SOFT, border: `1px solid ${LINE}` }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 10px", borderRadius: 999, background: "#fff", color: ACCENT_DARK, fontSize: 12, fontWeight: 700 }}>
              <span style={{ display: "block", width: 7, height: 7, borderRadius: 99, background: "#e2b657" }} />
              {status.label}
            </div>
            <h2 style={{ margin: "12px 0 0", fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: INK }}>
              {status.title}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: BODY }}>{status.body}</p>
          </div>
        ) : null}

        {flash ? (
          <div style={{ padding: "12px 18px", borderRadius: 14, background: ACCENT_SOFT, color: ACCENT_DARK, fontSize: 14, fontWeight: 600 }}>
            {flash}
          </div>
        ) : null}

        {tab === "agenda" ? (
          <Agenda
            slug={slug}
            bookings={state.bookings}
            account={state.account}
            googleEvents={state.googleEvents ?? []}
            googleConfigured={Boolean(state.features.googleCalendar)}
            onChanged={load}
            onFlash={(msg) => {
              setFlash(msg);
              setTimeout(() => setFlash(""), 2500);
            }}
          />
        ) : null}
        {tab === "chamadas" ? <Chamadas calls={state.calls ?? []} usageSource={state.usageSource} /> : null}
        {tab === "recursos" ? <Recursos business={b} slug={slug} onChange={load} /> : null}
        {tab === "servicos" ? <Servicos business={b} slug={slug} onChange={load} /> : null}
        {tab === "horarios" ? <Horarios business={b} onSaveHours={(hours, resourceId) => void saveHours(hours, resourceId)} /> : null}
        {tab === "assistente" ? <Assistente business={b} slug={slug} onSave={(body) => void patch(body)} /> : null}
        {tab === "faturacao" ? (
          <Faturacao business={b} slug={slug} usedPct={usedPct} usageSource={state.usageSource} onChanged={load} />
        ) : null}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function Panel({ title, copy, right, children }: { title: string; copy?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 22, background: "#fff", border: `1px solid ${LINE}`, overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 22px", borderBottom: `1px solid ${LINE}` }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</h2>
          {copy ? <p style={{ margin: "6px 0 0", fontSize: 14, color: MUTED }}>{copy}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Tag({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      style={{
        padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
        background: strong ? ACCENT_SOFT : "#f1f5f8",
        color: strong ? ACCENT_DARK : BODY,
      }}
    >
      {children}
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 0, cursor: disabled ? "default" : "pointer", padding: "14px 26px", borderRadius: 999,
        background: ACCENT, color: "#fff", fontFamily: SANS, fontSize: 15, fontWeight: 700,
        boxShadow: `0 14px 28px -16px ${ACCENT}`, opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ agenda */

type ItemTone = "call" | "web" | "google";

function itemTone(source: string): ItemTone {
  if (source === "voice" || source === "call") return "call";
  if (source === "google") return "google";
  return "web";
}

function Agenda({
  slug,
  bookings,
  account,
  googleEvents,
  googleConfigured,
  onChanged,
  onFlash,
}: {
  slug: string;
  bookings: Booking[];
  account: Account | null;
  googleEvents: GoogleEvent[];
  googleConfigured: boolean;
  onChanged: () => Promise<void>;
  onFlash: (msg: string) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);

  const google = account?.google;
  const connected = Boolean(google?.connected);

  const items = useMemo(() => {
    const pushedIds = new Set(bookings.map((bk) => bk.googleEventId).filter(Boolean));
    const overlay: Booking[] = googleEvents
      .filter((event) => !pushedIds.has(event.googleEventId))
      .map((event) => ({
        id: event.id,
        start: event.start,
        serviceName: event.title,
        customerName: "Google Calendar",
        customerPhone: null,
        source: "google",
        googleEventId: event.googleEventId,
      }));
    return [...bookings, ...overlay];
  }, [bookings, googleEvents]);

  const byDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const bk of items) {
      const key = iso(new Date(bk.start));
      (map[key] ||= []).push(bk);
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [items]);

  const today = new Date();
  const todayKey = iso(today);

  function shift(step: number) {
    if (view === "day") return setCursor((c) => addDays(c, step));
    if (view === "week") return setCursor((c) => addDays(c, step * 7));
    setCursor((c) => {
      const n = new Date(c);
      n.setMonth(n.getMonth() + step, 1);
      return n;
    });
  }

  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel =
    view === "day"
      ? `${DOW_SHORT[cursor.getDay()]}, ${cursor.getDate()} de ${MONTHS[cursor.getMonth()]}`
      : view === "week"
      ? weekStart.getMonth() === weekEnd.getMonth()
        ? `${weekStart.getDate()}–${weekEnd.getDate()} de ${MONTHS[weekStart.getMonth()]}`
        : `${weekStart.getDate()} de ${MONTHS[weekStart.getMonth()]} – ${weekEnd.getDate()} de ${MONTHS[weekEnd.getMonth()]}`
      : `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`;

  const dayItems = byDate[iso(cursor)] ?? [];
  const callsToday = (byDate[todayKey] ?? []).filter((b) => itemTone(b.source) === "call").length;
  const totalToday = (byDate[todayKey] ?? []).length;

  const seg = (id: View) => ({
    padding: "8px 16px", border: 0, borderRadius: 999, cursor: "pointer",
    fontFamily: SANS, fontSize: 14, fontWeight: 600,
    background: view === id ? "#fff" : "transparent",
    color: view === id ? INK : BODY,
  });

  async function connect() {
    setBusy("connect");
    try {
      const res = await fetch(`/api/business/${slug}/google/connect`);
      const data = (await res.json()) as { url?: string; message?: string; error?: string };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      onFlash(data.message || "Google Calendar ainda não está configurado.");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    try {
      const res = await fetch(`/api/business/${slug}/google/sync`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      await onChanged();
      onFlash(data.ok ? "Agenda sincronizada com o Google Calendar." : "Não foi possível sincronizar o Google Calendar.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await fetch(`/api/business/${slug}/google/disconnect`, { method: "POST" });
      await onChanged();
      onFlash("Google Calendar desligado.");
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = connected
    ? google?.googleEmail
      ? `Ligado a ${google.googleEmail}`
      : "Ligado ao Google Calendar"
    : "Ainda não ligado ao Google Calendar";

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Kpi label="Marcações hoje" value={String(totalToday)} />
        <Kpi label="Entraram por chamada" value={String(callsToday)} accent />
        <Kpi label="Marcadas na web" value={String(totalToday - callsToday)} />
      </div>

      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14,
          padding: "16px 20px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}`,
        }}
      >
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16 }}>Google Calendar</div>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: MUTED, maxWidth: 560 }}>
            {connected
              ? `${statusLabel}. As marcações do backoffice passam para o calendário desta pessoa e os eventos do Google aparecem na agenda.`
              : `Ligue o calendário da pessoa de contacto${account?.email ? ` (${account.email})` : ""}. Ainda não há login com palavra-passe — só este email e o Google.`}
          </p>
          {google?.lastSyncError ? (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9a3b32" }}>{google.lastSyncError}</p>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {connected ? (
            <>
              <button
                type="button"
                className="bo-ghost"
                disabled={busy !== null}
                onClick={() => void syncNow()}
                style={{ padding: "12px 18px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 700, color: BODY }}
              >
                {busy === "sync" ? "A sincronizar…" : "Sincronizar agora"}
              </button>
              <button
                type="button"
                className="bo-ghost"
                disabled={busy !== null}
                onClick={() => void disconnect()}
                style={{ padding: "12px 18px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 700, color: BODY }}
              >
                Desligar
              </button>
            </>
          ) : (
            <PrimaryButton onClick={() => void connect()}>
              {busy === "connect" ? "A ligar…" : "Ligar Google Calendar"}
            </PrimaryButton>
          )}
        </div>
      </div>
      {!googleConfigured && !connected ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
          O botão está visível; falta configurar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Railway para completar o OAuth.
        </p>
      ) : null}

      <div style={{ borderRadius: 22, background: "#fff", border: `1px solid ${LINE}`, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "18px 22px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RoundButton onClick={() => shift(-1)} d="M14.5 5.5 8 12l6.5 6.5" />
            <RoundButton onClick={() => shift(1)} d="M9.5 5.5 16 12l-6.5 6.5" />
            <button
              type="button"
              className="bo-ghost"
              onClick={() => setCursor(new Date())}
              style={{ padding: "9px 15px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 600, color: BODY }}
            >
              Hoje
            </button>
            <h2 style={{ margin: "0 0 0 6px", fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>{rangeLabel}</h2>
          </div>
          <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, background: HAIRLINE }}>
            <button type="button" style={seg("day")} onClick={() => setView("day")}>Dia</button>
            <button type="button" style={seg("week")} onClick={() => setView("week")}>Semana</button>
            <button type="button" style={seg("month")} onClick={() => setView("month")}>Mês</button>
          </div>
        </div>

        {view === "day" ? <DayView items={dayItems} /> : null}
        {view === "week" ? <WeekView weekStart={weekStart} byDate={byDate} todayKey={todayKey} /> : null}
        {view === "month" ? <MonthView cursor={cursor} byDate={byDate} todayKey={todayKey} /> : null}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "15px 22px", borderTop: `1px solid ${LINE}`, fontSize: 13, color: MUTED }}>
          <Legend color={ACCENT} label="marcado por chamada" />
          <Legend color="#dde4ea" label="marcado na web" />
          <Legend color="#4285F4" label="Google Calendar" />
          <span style={{ marginLeft: "auto" }}>{connected ? statusLabel : "Ainda não ligado ao Google Calendar"}</span>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ flex: "1 1 160px", padding: "18px 20px", borderRadius: 18, background: "#fff", border: `1px solid ${accent ? "oklch(0.58 0.14 168 / 0.45)" : LINE}` }}>
      <div style={{ fontSize: 13, color: MUTED }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-0.04em", marginTop: 8, color: accent ? ACCENT_DARK : INK }}>
        {value}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ display: "block", width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}

function RoundButton({ onClick, d }: { onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      className="bo-ghost"
      onClick={onClick}
      style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 99, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", color: BODY }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d={d} />
      </svg>
    </button>
  );
}

function DayView({ items }: { items: Booking[] }) {
  if (items.length === 0) {
    return <div style={{ padding: "26px 22px", fontSize: 15, color: MUTED }}>Sem marcações neste dia.</div>;
  }
  return (
    <div>
      {items.map((bk) => {
        const tone = itemTone(bk.source);
        const tag =
          tone === "call" ? "por chamada" : tone === "google" ? "Google" : "web";
        return (
          <div key={bk.id} style={{ display: "grid", gridTemplateColumns: "76px 1fr auto", alignItems: "center", gap: 16, padding: "17px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
            <span style={{ fontFamily: MONO, fontSize: 14, color: BODY }}>{timeOf(bk.start)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{bk.serviceName}</div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{bk.customerName || "Sem nome"}</div>
            </div>
            <Tag strong={tone === "call"}>{tag}</Tag>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ weekStart, byDate, todayKey }: { weekStart: Date; byDate: Record<string, Booking[]>; todayKey: string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(126px,1fr))", minWidth: 880 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const key = iso(d);
          const items = byDate[key] ?? [];
          const isToday = key === todayKey;
          return (
            <div key={key} style={{ borderRight: `1px solid ${HAIRLINE}`, minHeight: 320, background: isToday ? "oklch(0.98 0.012 168)" : "#fff" }}>
              <div style={{ padding: "13px 14px", borderBottom: `1px solid ${HAIRLINE}` }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>
                  {DOW_SHORT[d.getDay()]}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: "-0.03em", color: isToday ? ACCENT_DARK : INK }}>
                    {d.getDate()}
                  </span>
                  <span style={{ fontSize: 12, color: MUTED }}>{items.length ? `${items.length} marcações` : "livre"}</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 10px" }}>
                {items.map((bk) => {
                  const tone = itemTone(bk.source);
                  const bg = tone === "call" ? ACCENT : tone === "google" ? "#4285F4" : HAIRLINE;
                  const fg = tone === "web" ? BODY : "#fff";
                  const bar = tone === "call" ? "oklch(0.36 0.1 168)" : tone === "google" ? "#2b5fd4" : "#c9d3db";
                  return (
                    <div
                      key={bk.id}
                      style={{
                        padding: "9px 11px", borderRadius: 11,
                        background: bg,
                        color: fg,
                        borderLeft: `3px solid ${bar}`,
                      }}
                    >
                      <div style={{ fontFamily: MONO, fontSize: 11 }}>{timeOf(bk.start)}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{bk.serviceName}</div>
                      <div style={{ fontSize: 12, marginTop: 2 }}>{bk.customerName || "Sem nome"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ cursor, byDate, todayKey }: { cursor: Date; byDate: Record<string, Booking[]>; todayKey: string }) {
  const gridStart = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderBottom: `1px solid ${LINE}` }}>
        {DOW_HEADER.map((n) => (
          <div key={n} style={{ padding: "11px 12px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
        {Array.from({ length: 35 }, (_, i) => {
          const d = addDays(gridStart, i);
          const key = iso(d);
          const items = byDate[key] ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              style={{
                minHeight: 102, padding: "10px 11px",
                borderRight: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`,
                background: isToday ? "oklch(0.98 0.012 168)" : inMonth ? "#fff" : "#fbfcfd",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: !inMonth ? "#a8b6c2" : isToday ? ACCENT_DARK : INK }}>
                  {d.getDate()}
                </span>
                <span style={{ fontSize: 11, color: MUTED }}>{items.length || ""}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {items.slice(0, 2).map((bk) => {
                  const tone = itemTone(bk.source);
                  const bg = tone === "call" ? ACCENT : tone === "google" ? "#4285F4" : HAIRLINE;
                  const fg = tone === "web" ? BODY : "#fff";
                  return (
                    <div
                      key={bk.id}
                      style={{
                        padding: "4px 7px", borderRadius: 7,
                        background: bg, color: fg,
                        fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}
                    >
                      {timeOf(bk.start)} {bk.serviceName}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- chamadas */

function callStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "concluída";
    case "missed":
      return "perdida";
    case "failed":
      return "falhou";
    case "in_progress":
      return "em curso";
    default:
      return status;
  }
}

function Chamadas({ calls, usageSource }: { calls: CallRow[]; usageSource?: UsageSource }) {
  const billed = calls.reduce((sum, call) => sum + (call.billedMinutes || 0), 0);
  const telnyx = usageSource?.kind === "telnyx_demo_did";
  const copy = telnyx
    ? `Registos reais Telnyx do DID ${usageSource?.display ?? "+351 21 021 0260"} (210210260). Cada minuto entra no plafond do plano.`
    : "Chamadas gravadas neste número, com minutos descontados do plano.";
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Kpi label="Chamadas" value={String(calls.length)} />
        <Kpi label="Minutos facturados" value={String(billed)} accent />
        <Kpi label="DID" value={usageSource?.display ?? "—"} />
      </div>
      <Panel title="Chamadas" copy={copy}>
        {calls.length === 0 ? (
          <div style={{ padding: "26px 22px", fontSize: 15, color: MUTED }}>
            Ainda não há registos Telnyx para este número. Não inventamos minutos.
          </div>
        ) : (
          calls.map((call) => (
            <div
              key={call.id}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 1fr auto",
                alignItems: "center",
                gap: 16,
                padding: "17px 22px",
                borderBottom: `1px solid ${HAIRLINE}`,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 13, color: BODY }}>{formatWhen(call.startedAt)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{call.fromE164 || "Número oculto"}</div>
                <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>
                  {call.durationSeconds}s · {call.billedMinutes} min
                  {call.overageMinutes ? ` · ${call.overageMinutes} extra` : ""}
                  {call.provider ? ` · ${call.provider}` : ""}
                </div>
              </div>
              <Tag strong={call.status === "completed"}>{callStatusLabel(call.status)}</Tag>
            </div>
          ))
        )}
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------------- recursos */

const fieldStyle: CSSProperties = {
  padding: "13px 14px",
  borderRadius: 11,
  border: "1px solid #d7e0e8",
  background: "#fff",
  fontFamily: SANS,
  fontSize: 15,
  color: INK,
};

function Recursos({ business, slug, onChange }: { business: Business; slug: string; onChange: () => Promise<void> }) {
  const empty = { name: "", role: "profissional", transferNumber: "", serviceIds: business.services.map((s) => s.id) };
  const [editing, setEditing] = useState<string | null>(null);

  async function createResource(body: { name: string; role: string; transferNumber: string; serviceIds: string[] }) {
    if (!body.name.trim()) return;
    await fetch(`/api/business/${slug}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await onChange();
  }

  async function saveEdit(id: string, body: Record<string, unknown>) {
    await fetch(`/api/business/${slug}/resources/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditing(null);
    await onChange();
  }

  return (
    <Panel
      title="Recursos"
      copy="Pessoas que recebem marcações. Cada marcação precisa de um recurso — sem menu IVR."
    >
      {business.resources.map((r) => {
        const assigned = business.services.filter((s) => r.serviceIds?.includes(s.id)).map((s) => s.name);
        const open = editing === r.id;
        return (
          <div key={r.id} style={{ padding: "19px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 14, color: MUTED, marginTop: 3 }}>
                  {r.role || "profissional"}
                  {assigned.length ? ` · ${assigned.join(", ")}` : " · sem serviços"}
                  {r.transferNumber ? ` · ${r.transferNumber}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() =>
                    void fetch(`/api/business/${slug}/resource/${r.id}/toggle`, { method: "POST" }).then(onChange)
                  }
                  style={{
                    padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13.5, fontWeight: 700,
                    background: r.available ? ACCENT : "#fff",
                    color: r.available ? "#fff" : BODY,
                    border: r.available ? 0 : "1px solid #d7e0e8",
                  }}
                >
                  {r.available ? "Disponível" : "Ocupado"}
                </button>
                <button
                  type="button"
                  className="bo-ghost"
                  onClick={() => setEditing(open ? null : r.id)}
                  style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: BODY }}
                >
                  {open ? "Fechar" : "Editar"}
                </button>
              </div>
            </div>
            {open ? (
              <ResourceForm
                initial={{ name: r.name, role: r.role, transferNumber: r.transferNumber ?? "", serviceIds: r.serviceIds ?? [] }}
                services={business.services}
                onSubmit={(body) => void saveEdit(r.id, body)}
              />
            ) : null}
          </div>
        );
      })}
      <div style={{ padding: "18px 22px 22px" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Adicionar pessoa</div>
        <ResourceForm
          initial={empty}
          services={business.services}
          onSubmit={(body) => void createResource(body)}
          submitLabel="Adicionar"
        />
      </div>
    </Panel>
  );
}

function ResourceForm({
  initial,
  services,
  onSubmit,
  submitLabel = "Guardar",
}: {
  initial: { name: string; role: string; transferNumber: string; serviceIds: string[] };
  services: Business["services"];
  onSubmit: (body: { name: string; role: string; transferNumber: string; serviceIds: string[] }) => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial.name);
  const [role, setRole] = useState(initial.role);
  const [transferNumber, setTransferNumber] = useState(initial.transferNumber);
  const [serviceIds, setServiceIds] = useState(initial.serviceIds);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" style={fieldStyle} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Função" style={fieldStyle} />
        <input value={transferNumber} onChange={(e) => setTransferNumber(e.target.value)} placeholder="Telemóvel" style={fieldStyle} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {services.map((service) => {
          const on = serviceIds.includes(service.id);
          return (
            <button
              key={service.id}
              type="button"
              onClick={() =>
                setServiceIds(on ? serviceIds.filter((id) => id !== service.id) : [...serviceIds, service.id])
              }
              style={{
                padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600,
                background: on ? ACCENT_SOFT : "#fff", color: on ? ACCENT_DARK : BODY,
                border: `1px solid ${on ? "transparent" : "#d7e0e8"}`,
              }}
            >
              {service.name}
            </button>
          );
        })}
      </div>
      <div>
        <PrimaryButton onClick={() => onSubmit({ name, role, transferNumber, serviceIds })}>{submitLabel}</PrimaryButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- serviços */

function Servicos({ business, slug, onChange }: { business: Business; slug: string; onChange: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [price, setPrice] = useState("");
  const [resourceIds, setResourceIds] = useState<string[]>(business.resources.map((r) => r.id));
  const [editing, setEditing] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    await fetch(`/api/business/${slug}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        durationMinutes,
        priceCents: price === "" ? null : Math.round(Number(price) * 100),
        resourceIds,
      }),
    });
    setName("");
    setPrice("");
    await onChange();
  }

  async function save(id: string, body: Record<string, unknown>) {
    await fetch(`/api/business/${slug}/services/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditing(null);
    await onChange();
  }

  return (
    <Panel title="Serviços" copy="O assistente só marca o que está nesta lista. Associe pessoas em Recursos.">
      {business.services.map((s) => {
        const people = business.resources.filter((r) => r.serviceIds?.includes(s.id)).map((r) => r.name);
        const open = editing === s.id;
        return (
          <div key={s.id} style={{ padding: "17px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 14, color: MUTED, marginTop: 3 }}>
                  {s.durationMinutes} min
                  {s.priceCents != null ? ` · ${euros(s.priceCents)}` : ""}
                  {people.length ? ` · ${people.join(", ")}` : " · sem recurso"}
                </div>
              </div>
              <button
                type="button"
                className="bo-ghost"
                onClick={() => setEditing(open ? null : s.id)}
                style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 600, color: ACCENT_DARK }}
              >
                {open ? "Fechar" : "Editar"}
              </button>
            </div>
            {open ? (
              <ServiceEdit
                service={s}
                resources={business.resources}
                onSave={(body) => void save(s.id, body)}
              />
            ) : null}
          </div>
        );
      })}
      <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Adicionar serviço</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" style={fieldStyle} />
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
            placeholder="Minutos"
            style={fieldStyle}
          />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço € (opcional)" style={fieldStyle} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {business.resources.map((resource) => {
            const on = resourceIds.includes(resource.id);
            return (
              <button
                key={resource.id}
                type="button"
                onClick={() => setResourceIds(on ? resourceIds.filter((id) => id !== resource.id) : [...resourceIds, resource.id])}
                style={{
                  padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600,
                  background: on ? ACCENT_SOFT : "#fff", color: on ? ACCENT_DARK : BODY,
                  border: `1px solid ${on ? "transparent" : "#d7e0e8"}`,
                }}
              >
                {resource.name}
              </button>
            );
          })}
        </div>
        <div>
          <PrimaryButton onClick={() => void add()}>Adicionar</PrimaryButton>
        </div>
      </div>
    </Panel>
  );
}

function ServiceEdit({
  service,
  resources,
  onSave,
}: {
  service: Business["services"][number];
  resources: Business["resources"];
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(service.name);
  const [durationMinutes, setDurationMinutes] = useState(service.durationMinutes);
  const [price, setPrice] = useState(service.priceCents == null ? "" : String(service.priceCents / 100));
  const [resourceIds, setResourceIds] = useState(resources.filter((r) => r.serviceIds?.includes(service.id)).map((r) => r.id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
        <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)} style={fieldStyle} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Preço €" style={fieldStyle} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {resources.map((resource) => {
          const on = resourceIds.includes(resource.id);
          return (
            <button
              key={resource.id}
              type="button"
              onClick={() => setResourceIds(on ? resourceIds.filter((id) => id !== resource.id) : [...resourceIds, resource.id])}
              style={{
                padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600,
                background: on ? ACCENT_SOFT : "#fff", color: on ? ACCENT_DARK : BODY,
                border: `1px solid ${on ? "transparent" : "#d7e0e8"}`,
              }}
            >
              {resource.name}
            </button>
          );
        })}
      </div>
      <PrimaryButton
        onClick={() =>
          onSave({
            name,
            durationMinutes,
            priceCents: price === "" ? null : Math.round(Number(price) * 100),
            resourceIds,
          })
        }
      >
        Guardar
      </PrimaryButton>
    </div>
  );
}

/* ---------------------------------------------------------------- horários */

function Horarios({
  business,
  onSaveHours,
}: {
  business: Business;
  onSaveHours: (hours: DayHours[] | null, resourceId: string | null) => void;
}) {
  const [scope, setScope] = useState<string>("business");
  const resource = business.resources.find((r) => r.id === scope);
  const source = scope === "business" ? business.hours : (resource?.hours ?? business.hours);
  const [hours, setHours] = useState(source);
  const inherited = scope !== "business" && !resource?.hours;

  useEffect(() => {
    const next = scope === "business" ? business.hours : (business.resources.find((r) => r.id === scope)?.hours ?? business.hours);
    setHours(next);
  }, [scope, business]);

  return (
    <Panel
      title="Horários"
      copy="Horário do negócio, com opção de horas por pessoa. Um serviço só é marcável se um recurso associado estiver em horas."
    >
      <div style={{ padding: "6px 22px 22px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0 8px", maxWidth: 360 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Aplicar a</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={fieldStyle}>
            <option value="business">Negócio (todos)</option>
            {business.resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        {inherited ? (
          <p style={{ fontSize: 13, color: MUTED }}>A herdar o horário do negócio. Guarde para criar um horário próprio.</p>
        ) : null}
        {hours.map((day, i) => (
          <div key={DAY_NAMES[i]} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
            <span style={{ flex: "1 1 130px", fontSize: 15, fontWeight: 600 }}>{DAY_NAMES[i]}</span>
            <input
              type="time"
              value={hm(day.open)}
              onChange={(e) => setHours(hours.map((h, idx) => (idx === i ? { ...h, open: toMin(e.target.value) } : h)))}
              style={{ padding: "10px 12px", borderRadius: 11, border: "1px solid #d7e0e8", background: "#fff", fontFamily: MONO, fontSize: 14, color: INK }}
            />
            <span style={{ fontSize: 14, color: MUTED }}>até</span>
            <input
              type="time"
              value={hm(day.close)}
              onChange={(e) => setHours(hours.map((h, idx) => (idx === i ? { ...h, close: toMin(e.target.value) } : h)))}
              style={{ padding: "10px 12px", borderRadius: 11, border: "1px solid #d7e0e8", background: "#fff", fontFamily: MONO, fontSize: 14, color: INK }}
            />
            {day.open == null && day.close == null ? <span style={{ fontSize: 13, color: MUTED }}>fechado</span> : null}
          </div>
        ))}
        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PrimaryButton onClick={() => onSaveHours(hours, scope === "business" ? null : scope)}>Guardar horários</PrimaryButton>
          {scope !== "business" && resource?.hours ? (
            <button
              type="button"
              className="bo-ghost"
              onClick={() => onSaveHours(null, scope)}
              style={{ padding: "14px 20px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 600, color: BODY }}
            >
              Herdar do negócio
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- assistente */

const SCRIPT_GUIDE = [
  "Escreva como se falasse com um colega novo no telefone — frases curtas, uma ideia de cada vez.",
  "Diga o que o assistente pode e não pode fazer (ex.: marcar, não dar conselhos clínicos).",
  "Liste o que deve perguntar: serviço, dia, hora, nome, telemóvel.",
  "No campo de conhecimento, cole factos: morada, estacionamento, preparação, políticas de cancelamento.",
  "Evite jargão técnico, menus de teclado e regras contraditórias.",
];

function Assistente({
  business,
  slug,
  onSave,
}: {
  business: Business;
  slug: string;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [agentName, setAgentName] = useState(business.agentName);
  const [agentGender, setAgentGender] = useState(business.agentGender);
  const [locale, setLocale] = useState(business.locale);
  const [script, setScript] = useState(business.agentScript || "");
  const [knowledge, setKnowledge] = useState(business.agentKnowledge || "");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState("");

  async function rewrite() {
    setRewriting(true);
    setRewriteError("");
    const res = await fetch(`/api/business/${slug}/assistant/rewrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, knowledge }),
    });
    const payload = (await res.json()) as { script?: string; error?: string };
    setRewriting(false);
    if (payload.script) {
      setScript(payload.script);
      return;
    }
    setRewriteError(payload.error === "openai_not_configured" ? "OpenAI não configurado." : "Não foi possível reescrever.");
  }

  const area = { ...fieldStyle, minHeight: 140, fontFamily: SANS, resize: "vertical" as const };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Assistente" copy="Guião pré-preenchido pelo tipo de negócio. Voz ChatGPT Live (gpt-live-1).">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 18, padding: 22 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Nome do assistente</span>
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Voz</span>
            <select value={agentGender} onChange={(e) => setAgentGender(e.target.value)} style={fieldStyle}>
              <option value="feminino">Feminina</option>
              <option value="masculino">Masculina</option>
              <option value="neutro">Neutra</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Idioma</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value)} style={fieldStyle}>
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
            </select>
          </label>
        </div>
        <div style={{ padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Guião de voz</span>
            <textarea value={script} onChange={(e) => setScript(e.target.value)} style={area} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Conhecimento (texto)</span>
            <textarea value={knowledge} onChange={(e) => setKnowledge(e.target.value)} style={area} />
          </label>
          <ul style={{ margin: 0, padding: "0 0 0 18px", color: MUTED, fontSize: 13, lineHeight: 1.55 }}>
            {SCRIPT_GUIDE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {rewriteError ? <p style={{ margin: 0, color: "#b42318", fontSize: 14 }}>{rewriteError}</p> : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "0 22px 22px" }}>
          <PrimaryButton onClick={() => onSave({ agentName, agentGender, locale, agentScript: script, agentKnowledge: knowledge })}>
            Guardar
          </PrimaryButton>
          <button
            type="button"
            className="bo-ghost"
            disabled={rewriting}
            onClick={() => void rewrite()}
            style={{ padding: "14px 24px", borderRadius: 999, border: "1px solid #d7e0e8", background: "#fff", cursor: rewriting ? "default" : "pointer", fontFamily: SANS, fontSize: 15, fontWeight: 600, color: INK }}
          >
            {rewriting ? "A reescrever…" : "Reescrever para gpt-live-1"}
          </button>
          {business.number ? (
            <a
              href={`tel:${business.number.e164}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "14px 24px", borderRadius: 999, border: "1px solid #d7e0e8", fontSize: 15, fontWeight: 600, color: INK, textDecoration: "none" }}
            >
              Ligar e ouvir
            </a>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

/* --------------------------------------------------------------- faturação */

interface PlanOption {
  id: string;
  displayName: string;
  name: string;
  priceCents: number;
  includedMinutes: number;
  overageCentsPerMinute: number;
  features: string[];
}

function formatDay(isoString: string | null): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

function Faturacao({
  business,
  slug,
  usedPct,
  usageSource,
  onChanged,
}: {
  business: Business;
  slug: string;
  usedPct: number;
  usageSource?: UsageSource;
  onChanged: () => Promise<void>;
}) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [busy, setBusy] = useState("");
  const remaining = Math.max(0, business.subscription.includedMinutes - business.subscription.usedMinutes);
  const overage = business.subscription.overageMinutes || Math.max(0, business.subscription.usedMinutes - business.subscription.includedMinutes);
  const overageCost = overage * (business.plan.overageCentsPerMinute || 0);
  const telnyx = usageSource?.kind === "telnyx_demo_did";

  useEffect(() => {
    void fetch("/api/plans")
      .then((res) => res.json())
      .then((payload: { plans?: PlanOption[] }) => setPlans(payload.plans ?? []));
  }, []);

  async function post(path: string, body?: Record<string, unknown>) {
    setBusy(path);
    const res = await fetch(`/api/business/${slug}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = (await res.json()) as { url?: string; canceled?: boolean; error?: string };
    setBusy("");
    if (payload.url) {
      window.location.href = payload.url;
      return;
    }
    await onChanged();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 20, padding: 26, borderRadius: 22, background: PANEL, color: "#e8eef2" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93a7b6" }}>Plano atual</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, letterSpacing: "-0.045em", color: "#fff" }}>
              {(business.plan.priceCents / 100).toFixed(0)}€
            </span>
            <span style={{ fontSize: 16, color: "#93a7b6" }}>/ mês · {business.plan.displayName || business.plan.name}</span>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.6, color: "#a7bac7" }}>
            {business.subscription.status} · aniversário {formatDay(business.subscription.currentPeriodEnd || business.subscription.planStartedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void post("/portal")}
          style={{ padding: "14px 24px", borderRadius: 999, background: "#fff", color: INK, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer" }}
        >
          Portal Stripe
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
        <div style={{ padding: "20px 22px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 13, color: MUTED }}>Minutos do plano</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-0.04em", marginTop: 8 }}>
            {business.subscription.usedMinutes}{" "}
            <span style={{ fontSize: 16, fontWeight: 400, color: MUTED }}>/ {business.subscription.includedMinutes}</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: HAIRLINE, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${usedPct}%`, height: "100%", borderRadius: 99, background: ACCENT }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: MUTED }}>{remaining} min restantes neste ciclo</div>
        </div>
        <div style={{ padding: "20px 22px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 13, color: MUTED }}>Extra (além do plafond)</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-0.04em", marginTop: 8 }}>
            {overage} min
          </div>
          <div style={{ marginTop: 10, fontSize: 14, color: BODY }}>
            {overage ? `${euros(overageCost)} a ${business.plan.overageCentsPerMinute} cênt./min` : "Sem extra neste ciclo"}
          </div>
        </div>
        <div style={{ padding: "20px 22px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 13, color: MUTED }}>Número</div>
          <div style={{ fontFamily: MONO, fontSize: 17, marginTop: 10 }}>{usageSource?.display ?? business.number?.e164 ?? "—"}</div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: ACCENT_DARK }}>
            {telnyx ? "Telnyx 210210260" : (business.number?.status ?? "sem número")}
          </div>
        </div>
      </div>

      <Panel title="Planos" copy="Upgrade, downgrade ou cancelamento via Stripe. Extra ao preço de GET /api/plans — nunca um valor inventado.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 0 }}>
          {plans.map((plan) => {
            const current = plan.id === business.subscription.planId;
            return (
              <div key={plan.id} style={{ padding: 22, borderRight: `1px solid ${HAIRLINE}` }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700 }}>{plan.displayName || plan.name}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, marginTop: 8 }}>{(plan.priceCents / 100).toFixed(0)}€</div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{plan.includedMinutes} min · {plan.overageCentsPerMinute} cênt. extra</div>
                <ul style={{ margin: "12px 0 16px", padding: "0 0 0 16px", color: BODY, fontSize: 13, lineHeight: 1.5 }}>
                  {plan.features.slice(0, 3).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <PrimaryButton disabled={current || Boolean(busy)} onClick={() => void post("/checkout", { planId: plan.id })}>
                  {current ? "Plano atual" : plan.priceCents > business.plan.priceCents ? "Upgrade" : "Downgrade"}
                </PrimaryButton>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "0 22px 22px" }}>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void post("/billing/cancel")}
            style={{ border: 0, background: "transparent", color: MUTED, cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 600 }}
          >
            Cancelar no fim do ciclo
          </button>
        </div>
      </Panel>
    </div>
  );
}
