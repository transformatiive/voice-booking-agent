import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

/* ------------------------------------------------------------------ tokens */

const INK = "#0e1a24";
const BODY = "#47586a";
const MUTED = "#5a6b7b";
const SURFACE = "#f6f8fa";
const LINE = "#e4eaf0";
const HAIRLINE = "#eef2f6";
const ACCENT = "oklch(0.50 0.13 168)";
const ACCENT_BRIGHT = "oklch(0.58 0.14 168)";
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
  hours: Array<{ open: number | null; close: number | null }>;
  services: Array<{ id: string; name: string; durationMinutes: number }>;
  resources: Array<{ id: string; name: string; available: boolean; transferNumber: string | null }>;
  subscription: { planId: string; status: string; usedMinutes: number; includedMinutes: number };
  plan: { name: string; displayName: string; priceCents: number };
}

interface Booking {
  id: string;
  start: string;
  serviceName: string;
  customerName: string | null;
  customerPhone: string | null;
  source: string;
}

interface Payload {
  business: Business;
  bookings: Booking[];
  features: { demoActivate?: boolean; stripe?: boolean; gptLive?: boolean };
}

type Tab = "agenda" | "chamadas" | "recursos" | "servicos" | "horarios" | "assistente" | "faturacao";
type View = "day" | "week" | "month";

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
function labelUseCase(u: string) {
  const map: Record<string, string> = {
    barbearia: "Barbearia", salao: "Salão", clinica: "Clínica", restaurante: "Restaurante",
    oficina: "Oficina", imobiliaria: "Imobiliária", ginasio: "Ginásio", outro: "Outro",
  };
  return map[u] || u;
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
  const [state, setState] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("agenda");
  const [flash, setFlash] = useState("");

  async function load() {
    const res = await fetch(`/api/business/${slug}`);
    if (!res.ok) return;
    setState((await res.json()) as Payload);
  }

  useEffect(() => {
    void load();
  }, [slug]);

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

  if (!state) {
    return <div style={{ fontFamily: SANS, color: MUTED, padding: 32 }}>A carregar…</div>;
  }

  const b = state.business;
  if (b.status !== "active") {
    return <Pending business={b} demoActivate={Boolean(state.features.demoActivate)} onActivated={load} />;
  }

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
          <div style={{ fontFamily: MONO, fontSize: 12, marginTop: 5, color: "#93a7b6" }}>
            {b.number?.e164 ?? "sem número"}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, fontWeight: 600, color: "oklch(0.84 0.13 168)" }}>
            <span style={{ display: "block", width: 7, height: 7, borderRadius: 99, background: "oklch(0.78 0.15 168)", boxShadow: "0 0 0 4px oklch(0.78 0.15 168 / 0.22)" }} />
            a atender
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
        {flash ? (
          <div style={{ padding: "12px 18px", borderRadius: 14, background: ACCENT_SOFT, color: ACCENT_DARK, fontSize: 14, fontWeight: 600 }}>
            {flash}
          </div>
        ) : null}

        {tab === "agenda" ? <Agenda bookings={state.bookings} /> : null}
        {tab === "chamadas" ? <Chamadas bookings={state.bookings} /> : null}
        {tab === "recursos" ? (
          <Recursos
            business={b}
            onToggle={(id) => void fetch(`/api/business/${slug}/resource/${id}/toggle`, { method: "POST" }).then(load)}
          />
        ) : null}
        {tab === "servicos" ? <Servicos business={b} /> : null}
        {tab === "horarios" ? <Horarios business={b} onSave={(hours) => void patch({ hours })} /> : null}
        {tab === "assistente" ? <Assistente business={b} onSave={(body) => void patch(body)} /> : null}
        {tab === "faturacao" ? <Faturacao business={b} usedPct={usedPct} /> : null}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

function Panel({ title, copy, right, children }: { title: string; copy?: string; right?: React.ReactNode; children: React.ReactNode }) {
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

function Tag({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
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

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 0, cursor: "pointer", padding: "14px 26px", borderRadius: 999,
        background: ACCENT, color: "#fff", fontFamily: SANS, fontSize: 15, fontWeight: 700,
        boxShadow: `0 14px 28px -16px ${ACCENT}`,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ agenda */

function Agenda({ bookings }: { bookings: Booking[] }) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());

  const byDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    for (const bk of bookings) {
      const key = iso(new Date(bk.start));
      (map[key] ||= []).push(bk);
    }
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [bookings]);

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
  const callsToday = (byDate[todayKey] ?? []).filter((b) => b.source === "call").length;
  const totalToday = (byDate[todayKey] ?? []).length;

  const seg = (id: View) => ({
    padding: "8px 16px", border: 0, borderRadius: 999, cursor: "pointer",
    fontFamily: SANS, fontSize: 14, fontWeight: 600,
    background: view === id ? "#fff" : "transparent",
    color: view === id ? INK : BODY,
  });

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <Kpi label="Marcações hoje" value={String(totalToday)} />
        <Kpi label="Entraram por chamada" value={String(callsToday)} accent />
        <Kpi label="Marcadas na web" value={String(totalToday - callsToday)} />
      </div>

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
          <span style={{ marginLeft: "auto" }}>Sincronizado com o Google Calendar</span>
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
        const call = bk.source === "call";
        return (
          <div key={bk.id} style={{ display: "grid", gridTemplateColumns: "76px 1fr auto", alignItems: "center", gap: 16, padding: "17px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
            <span style={{ fontFamily: MONO, fontSize: 14, color: BODY }}>{timeOf(bk.start)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{bk.serviceName}</div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{bk.customerName || "Sem nome"}</div>
            </div>
            <Tag strong={call}>{call ? "por chamada" : "web"}</Tag>
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
                  const call = bk.source === "call";
                  return (
                    <div
                      key={bk.id}
                      style={{
                        padding: "9px 11px", borderRadius: 11,
                        background: call ? ACCENT : HAIRLINE,
                        color: call ? "#fff" : BODY,
                        borderLeft: `3px solid ${call ? "oklch(0.36 0.1 168)" : "#c9d3db"}`,
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
                  const call = bk.source === "call";
                  return (
                    <div
                      key={bk.id}
                      style={{
                        padding: "4px 7px", borderRadius: 7,
                        background: call ? ACCENT : HAIRLINE, color: call ? "#fff" : BODY,
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

function Chamadas({ bookings }: { bookings: Booking[] }) {
  /* Until /api/calls exists, the call log is derived from bookings created by the assistant. */
  const calls = bookings.filter((b) => b.source === "call");
  return (
    <Panel title="Chamadas" copy="Tudo o que o assistente atendeu, com resultado.">
      {calls.length === 0 ? (
        <div style={{ padding: "26px 22px", fontSize: 15, color: MUTED }}>Ainda não há chamadas atendidas.</div>
      ) : (
        calls.map((bk) => (
          <div key={bk.id} style={{ display: "grid", gridTemplateColumns: "86px 1fr 130px", alignItems: "center", gap: 16, padding: "17px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
            <span style={{ fontFamily: MONO, fontSize: 14, color: BODY }}>{timeOf(bk.start)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Marcou {bk.serviceName}</div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>
                {bk.customerName || "Sem nome"}
                {bk.customerPhone ? ` · ${bk.customerPhone}` : ""}
              </div>
            </div>
            <span style={{ justifySelf: "start" }}>
              <Tag strong>marcada</Tag>
            </span>
          </div>
        ))
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- recursos */

function Recursos({ business, onToggle }: { business: Business; onToggle: (id: string) => void }) {
  return (
    <Panel title="Recursos" copy="Quem pode receber marcações e transferências agora. Toque para trocar o estado.">
      {business.resources.map((r) => (
        <div key={r.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "19px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, marginTop: 3 }}>
              {r.transferNumber ? `transfere para ${r.transferNumber}` : "sem transferência"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggle(r.id)}
            style={{
              padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontFamily: SANS, fontSize: 13.5, fontWeight: 700,
              background: r.available ? ACCENT : "#fff",
              color: r.available ? "#fff" : BODY,
              border: r.available ? 0 : "1px solid #d7e0e8",
            }}
          >
            {r.available ? "Disponível" : "Ocupado"}
          </button>
        </div>
      ))}
    </Panel>
  );
}

/* ---------------------------------------------------------------- serviços */

function Servicos({ business }: { business: Business }) {
  return (
    <Panel
      title="Serviços"
      copy="O assistente só marca o que está nesta lista."
      right={
        <button type="button" style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, cursor: "pointer", padding: "11px 18px", borderRadius: 999, background: INK, color: "#fff", fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Adicionar
        </button>
      }
    >
      {business.services.map((s) => (
        <div key={s.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "17px 22px", borderBottom: `1px solid ${HAIRLINE}` }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{s.name}</div>
          <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontFamily: MONO, fontSize: 14, color: BODY }}>{s.durationMinutes} min</span>
            <a href="#" style={{ fontSize: 14, fontWeight: 600, color: ACCENT_DARK, textDecoration: "none" }}>Editar</a>
          </span>
        </div>
      ))}
    </Panel>
  );
}

/* ---------------------------------------------------------------- horários */

function Horarios({ business, onSave }: { business: Business; onSave: (hours: Business["hours"]) => void }) {
  const [hours, setHours] = useState(business.hours);
  return (
    <Panel title="Horários" copy="Fora destas horas o assistente informa e não marca.">
      <div style={{ padding: "6px 22px 22px" }}>
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
        <div style={{ marginTop: 20 }}>
          <PrimaryButton onClick={() => onSave(hours)}>Guardar horários</PrimaryButton>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- assistente */

function Assistente({ business, onSave }: { business: Business; onSave: (body: Record<string, unknown>) => void }) {
  const [agentName, setAgentName] = useState(business.agentName);
  const [agentGender, setAgentGender] = useState(business.agentGender);
  const [locale, setLocale] = useState(business.locale);

  const field = { padding: "13px 14px", borderRadius: 11, border: "1px solid #d7e0e8", background: "#fff", fontFamily: SANS, fontSize: 15, color: INK };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Assistente" copy="Como se apresenta ao telefone. Voz ChatGPT Live.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 18, padding: 22 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Nome do assistente</span>
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} style={field} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Voz</span>
            <select value={agentGender} onChange={(e) => setAgentGender(e.target.value)} style={field}>
              <option value="feminino">Feminina</option>
              <option value="masculino">Masculina</option>
              <option value="neutro">Neutra</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700 }}>Idioma</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value)} style={field}>
              <option value="pt">Português</option>
              <option value="en">Inglês</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "0 22px 22px" }}>
          <PrimaryButton onClick={() => onSave({ agentName, agentGender, locale })}>Guardar</PrimaryButton>
          {business.number ? (
            <a
              href={`tel:${business.number.e164}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "14px 24px", borderRadius: 999, border: "1px solid #d7e0e8", fontSize: 15, fontWeight: 600, color: INK, textDecoration: "none" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M6.5 3h-.8A2.7 2.7 0 0 0 3 5.7c0 8 7.3 15.3 15.3 15.3a2.7 2.7 0 0 0 2.7-2.7v-.8a1.5 1.5 0 0 0-1.2-1.5l-3.2-.6a1.5 1.5 0 0 0-1.5.7l-.8 1.3a12 12 0 0 1-5.4-5.4l1.3-.8a1.5 1.5 0 0 0 .7-1.5l-.6-3.2A1.5 1.5 0 0 0 6.5 3z" />
              </svg>
              Ligar e ouvir
            </a>
          ) : null}
        </div>
      </Panel>

      <div style={{ padding: 22, borderRadius: 22, background: PANEL, color: "#a7bac7" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93a7b6" }}>Saudação atual</div>
        <p style={{ margin: "14px 0 0", fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, lineHeight: 1.45, color: "#fff" }}>
          “{business.name}, bom dia. Sou {agentName}. Quer marcar ou saber um horário?”
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.6 }}>
          Gerada a partir do nome do negócio e dos serviços. Fora de horas informa e não marca.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- faturação */

function Faturacao({ business, usedPct }: { business: Business; usedPct: number }) {
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
            {business.subscription.status} · {business.subscription.includedMinutes} minutos incluídos
          </p>
        </div>
        <a href="#" style={{ padding: "14px 24px", borderRadius: 999, background: "#fff", color: INK, fontSize: 15, fontWeight: 700, textDecoration: "none" }}>
          Mudar de plano
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
        <div style={{ padding: "20px 22px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 13, color: MUTED }}>Minutos usados</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-0.04em", marginTop: 8 }}>
            {business.subscription.usedMinutes}{" "}
            <span style={{ fontSize: 16, fontWeight: 400, color: MUTED }}>/ {business.subscription.includedMinutes}</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: HAIRLINE, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: `${usedPct}%`, height: "100%", borderRadius: 99, background: ACCENT }} />
          </div>
        </div>
        <div style={{ padding: "20px 22px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 13, color: MUTED }}>Número</div>
          <div style={{ fontFamily: MONO, fontSize: 17, marginTop: 10 }}>{business.number?.e164 ?? "—"}</div>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: ACCENT_DARK }}>{business.number?.status ?? ""}</div>
        </div>
        <div style={{ padding: "20px 22px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 13, color: MUTED }}>Tipo de negócio</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22, letterSpacing: "-0.03em", marginTop: 10 }}>
            {labelUseCase(business.useCase)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- pending */

function Pending({ business, demoActivate, onActivated }: { business: Business; demoActivate: boolean; onActivated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: 28, fontFamily: SANS, background: SURFACE }}>
      <div style={{ maxWidth: 560, width: "100%", padding: 34, borderRadius: 24, background: "#fff", border: `1px solid ${LINE}` }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "7px 14px 7px 11px", borderRadius: 999, background: ACCENT_SOFT, color: ACCENT_DARK, fontSize: 13, fontWeight: 600 }}>
          <span style={{ display: "block", width: 7, height: 7, borderRadius: 99, background: ACCENT_BRIGHT }} />
          Aguarda aprovação
        </span>
        <h1 style={{ margin: "20px 0 0", fontFamily: DISPLAY, fontWeight: 700, fontSize: 32, letterSpacing: "-0.035em", color: INK }}>
          Estamos a preparar a sua conta
        </h1>
        <p style={{ margin: "16px 0 0", fontSize: 16, lineHeight: 1.65, color: BODY }}>
          Recebemos os seus dados. Tratamos do número +351 por si — a atribuição fica pendente da aprovação
          regulatória e não fica ativa no segundo a seguir ao pedido.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          {[
            `Dados recebidos · ${business.name} · plano ${business.plan.displayName || business.plan.name}`,
            business.numberPreference === "port" ? "Portabilidade do seu número atual" : "Atribuição de um número +351",
            "Configuração de voz (SIP) · ligamos o número ao assistente",
          ].map((line, i) => (
            <div key={line} style={{ display: "flex", gap: 12, padding: "14px 16px", borderRadius: 14, background: SURFACE }}>
              <span style={{ flex: "none", display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: 99, background: ACCENT_SOFT, color: ACCENT_DARK, fontFamily: DISPLAY, fontWeight: 700, fontSize: 13 }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 15, lineHeight: 1.5, color: BODY }}>{line}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: "20px 0 0", fontSize: 14, color: MUTED }}>
          {business.name} · {labelUseCase(business.useCase)} · assistente {business.agentName}
          {business.contactEmail ? ` · ${business.contactEmail}` : ""}
        </p>
        <div style={{ marginTop: 22 }}>
          {demoActivate ? (
            <PrimaryButton
              onClick={() => {
                if (busy) return;
                setBusy(true);
                void fetch(`/api/business/${business.slug}/activate`, { method: "POST" })
                  .then(onActivated)
                  .finally(() => setBusy(false));
              }}
            >
              Ver o backoffice (demonstração)
            </PrimaryButton>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: MUTED }}>
              Avisamos por email quando o número for aprovado. O backoffice abre nessa altura.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
