import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ------------------------------------------------------------------ tokens */

const INK = "#0e1a24";
const BODY = "#47586a";
const MUTED = "#5a6b7b";
const SURFACE = "#f6f8fa";
const LINE = "#e4eaf0";
const ACCENT = "oklch(0.50 0.13 168)";
const ACCENT_BRIGHT = "oklch(0.58 0.14 168)";
const ACCENT_DARK = "oklch(0.42 0.11 168)";
const ACCENT_SOFT = "oklch(0.95 0.035 168)";
const PANEL = "linear-gradient(170deg,#132330 0%,#0c151e 70%)";
const SANS = "'Public Sans',system-ui,sans-serif";
const DISPLAY = "Manrope,sans-serif";
const MONO = "'JetBrains Mono',monospace";

/* ---------------------------------------------------------------- content */

const FALLBACK_DID = {
  e164: "+351210210260",
  nsn: "210210260",
  display: "21 021 0260",
  displayIntl: "+351 21 021 0260",
  tel: "tel:+351210210260",
};

const FAMILIES: Array<{ title: string; copy: string; image: string }> = [
  {
    title: "Saúde",
    copy: "Clínicas e consultórios que não podem perder a chamada entre consultas.",
    image: "/images/usecase-clinica.jpg",
  },
  {
    title: "Beleza e bem-estar",
    copy: "Barbearias e salões com as mãos ocupadas e a agenda no telemóvel.",
    image: "/images/usecase-barbearia.jpg",
  },
  {
    title: "Restauração e hotelaria",
    copy: "Reservas, horários e pedidos quando a sala está cheia.",
    image:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Casa, auto e campo",
    copy: "Oficinas e serviços no terreno: o telefone toca enquanto se trabalha.",
    image:
      "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Serviços profissionais",
    copy: "Imobiliárias, escritórios e ateliês que precisam de triagem e marcações.",
    image: "/images/usecase-salao.jpg",
  },
  {
    title: "Fitness e formação",
    copy: "Ginásios e escolas que marcam aulas experimentais ao telefone.",
    image:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
  },
];

const STEPS = [
  {
    title: "Pedimos o número por si",
    copy: "Um +351 novo ou a portabilidade do seu. Não há número instantâneo: a atribuição fica pendente de aprovação regulatória e nós tratamos do processo.",
  },
  {
    title: "Configura em dez minutos",
    copy: "Serviços, durações, horários e quem recebe transferências. O assistente só marca o que existe na sua lista.",
  },
  {
    title: "Atende e marca",
    copy: "Percebe pedidos compostos — “corte e barba quinta às quatro” —, confirma o que falta e escreve a marcação no seu Google Calendar.",
  },
  {
    title: "Transfere quando é preciso",
    copy: "Cada profissional marca-se disponível ou ocupado. A chamada só passa a uma pessoa quando essa pessoa pode falar.",
  },
];

const FLOW = [
  {
    title: "A chamada entra",
    copy: "14:03, o cliente liga para o número da barbearia. Atendido ao segundo toque, mesmo com a cadeira ocupada.",
  },
  {
    title: "Percebe o pedido",
    copy: "“Corte e barba, quinta às quatro, com o Tiago.” Serviço, duração, profissional e hora, tudo de uma frase falada.",
  },
  {
    title: "Resolve o conflito sozinho",
    copy: "Às 16h o Tiago está a meio de um corte. Em vez de dizer que não há vaga, oferece as alternativas reais: 16h30 com o Tiago, ou 16h com a Marta.",
    highlight: true,
  },
  {
    title: "Marca e confirma",
    copy: "Escreve no Google Calendar com a duração certa, bloqueia o tempo do Tiago e envia confirmação por SMS ao cliente.",
  },
];

const PLAN_BLURB: Record<string, string> = {
  base: "Para quem atende sozinho: um profissional, uma agenda, uma linha que nunca fica sem resposta.",
  pro: "Para equipas pequenas com vários profissionais e volume real de chamadas ao longo do dia.",
  studio:
    "Para várias unidades, equipas grandes e horários alargados, com atendimento em português e inglês.",
};

const FALLBACK_PLANS: Plan[] = [
  {
    id: "base",
    displayName: "Essencial",
    priceCents: 4900,
    includedMinutes: 200,
    overageCentsPerMinute: 12,
    maxResources: 1,
    features: [
      "1 número +351 incluído",
      "200 minutos de atendimento incluídos",
      "Agendamento por voz com marcação no seu Google Calendar.",
      "Transferência de chamada para o seu telemóvel",
      "Suporte por email",
    ],
  },
  {
    id: "pro",
    displayName: "Pro",
    priceCents: 9900,
    includedMinutes: 600,
    overageCentsPerMinute: 10,
    maxResources: 3,
    features: [
      "Tudo do Base",
      "600 minutos incluídos",
      "Até 3 recursos (profissionais/espaços)",
      "Lembretes automáticos e reagendamento",
      "Relatórios de chamadas e reservas",
    ],
  },
  {
    id: "studio",
    displayName: "Estúdio",
    priceCents: 19900,
    includedMinutes: 1500,
    overageCentsPerMinute: 8,
    maxResources: null,
    features: [
      "Tudo do Pro",
      "1500 minutos incluídos",
      "Recursos ilimitados",
      "Multi-idioma (PT/EN) e horários alargados",
      "Atendimento prioritário",
    ],
  },
];

const FAQ: Array<[string, string]> = [
  [
    "Posso ouvir uma demonstração?",
    "Sim. Ligue o número da demonstração. O Atende pergunta se quer clínica, barbearia, restaurante, oficina ou imobiliária e entra nesse agente. Pode dizer o nome ou premir 1 a 5.",
  ],
  [
    "O número fica ativo na hora?",
    "Não. Tratamos do número +351 por si e a atribuição fica pendente da aprovação regulatória. Avisamos por email quando estiver ativo.",
  ],
  [
    "Como é que evita sobreposições na agenda?",
    "Consulta a agenda antes de propor horas, conta com a duração real do serviço e, se a hora pedida estiver ocupada, oferece a alternativa mais próxima ou outro profissional.",
  ],
  [
    "Serve só barbearias?",
    "Não. Cobrimos seis famílias: Saúde; Beleza e bem-estar; Restauração e hotelaria; Casa, auto e campo; Serviços profissionais; Fitness e formação.",
  ],
  [
    "E se o cliente quiser falar com uma pessoa?",
    "A chamada é transferida para o telemóvel de quem estiver marcado como disponível. Quem está a trabalhar não é interrompido.",
  ],
];

const USE_CASES = [
  { value: "barbearia", label: "Barbearia" },
  { value: "salao", label: "Salão" },
  { value: "clinica", label: "Clínica" },
  { value: "restaurante", label: "Restaurante" },
  { value: "oficina", label: "Oficina" },
  { value: "imobiliaria", label: "Imobiliária" },
  { value: "ginasio", label: "Ginásio" },
  { value: "outro", label: "Outro" },
];

/* ROI model — same constants as the previous public/landing.js calculator */
const CONVERSION = 0.6;
const WEEKS = 4.33;
const ROI_PRESETS: Record<string, { ticket: number; calls: number }> = {
  barbearia: { ticket: 15, calls: 12 },
  salao: { ticket: 35, calls: 12 },
  estetica: { ticket: 45, calls: 10 },
  clinica: { ticket: 60, calls: 14 },
  restaurante: { ticket: 30, calls: 18 },
  servicos: { ticket: 90, calls: 8 },
  outro: { ticket: 25, calls: 10 },
};

interface Plan {
  id: string;
  displayName: string;
  priceCents: number;
  includedMinutes: number;
  overageCentsPerMinute: number;
  maxResources: number | null;
  features: string[];
}

interface DemoPayload {
  did: { e164: string; nsn: string; display: string; displayIntl: string; tel: string };
}

/* ----------------------------------------------------------------- pieces */

function Wordmark({ size = 25, color = INK }: { size?: number; color?: string }) {
  const cap = Math.round(size * 0.72);
  const bar = Math.max(3, Math.round(cap / 4.5));
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: size > 22 ? 3 : 2 }}>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: "-0.04em",
          lineHeight: 0.72,
          color,
        }}
      >
        ATEND
      </span>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          width: Math.round(cap * 1.05),
          height: cap,
        }}
      >
        {["100%", "66%", "88%"].map((w) => (
          <i
            key={w}
            style={{ display: "block", height: bar, width: w, borderRadius: 99, background: ACCENT_BRIGHT }}
          />
        ))}
      </span>
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        padding: "7px 14px 7px 11px",
        borderRadius: 999,
        background: ACCENT_SOFT,
        color: ACCENT_DARK,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ display: "block", width: 7, height: 7, borderRadius: 99, background: ACCENT_BRIGHT }} />
      {children}
    </span>
  );
}

const WAVE = [26, 48, 78, 100, 62, 88, 40, 58, 30, 72, 22, 52];

function Waveform() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        height: 64,
        margin: "28px 0 24px",
      }}
    >
      {WAVE.map((h, i) => {
        const strong = h >= 80;
        const mid = h >= 60 && h < 80;
        return (
          <i
            key={`${h}-${i}`}
            style={{
              display: "block",
              width: 5,
              height: `${h}%`,
              borderRadius: 99,
              background: strong ? "oklch(0.78 0.15 168)" : mid ? "oklch(0.62 0.14 168)" : h > 35 ? "#35485a" : "#2c3d4c",
              boxShadow: strong ? "0 0 18px oklch(0.78 0.15 168 / 0.55)" : undefined,
              animation: `atd-bar 1.25s ease-in-out infinite ${(i * 0.08).toFixed(2)}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function SectionHeading({ title, copy, kicker }: { title: string; copy?: string; kicker?: string }) {
  return (
    <>
      {kicker ? <Pill>{kicker}</Pill> : null}
      <h2
        style={{
          margin: kicker ? "20px 0 0" : 0,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: "clamp(28px,3.2vw,40px)",
          letterSpacing: "-0.035em",
        }}
      >
        {title}
      </h2>
      {copy ? (
        <p style={{ margin: "14px 0 0", maxWidth: "62ch", fontSize: 17, lineHeight: 1.65, color: BODY }}>{copy}</p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- page */

export function Landing() {
  const [did, setDid] = useState(FALLBACK_DID);
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [planId, setPlanId] = useState("pro");

  const [bizType, setBizType] = useState("barbearia");
  const [calls, setCalls] = useState(12);
  const [ticket, setTicket] = useState(15);

  useEffect(() => {
    void fetch("/api/demo")
      .then((res) => res.json())
      .then((payload: DemoPayload) => {
        if (payload?.did?.tel) setDid(payload.did);
      })
      .catch(() => undefined);
    void fetch("/api/plans")
      .then((res) => res.json())
      .then((payload: { plans: Plan[] }) => {
        if (payload?.plans?.length) setPlans(payload.plans);
      })
      .catch(() => undefined);
  }, []);

  const monthly = useMemo(() => Math.round(calls * WEEKS * ticket * CONVERSION), [calls, ticket]);
  const basePrice = (plans.find((p) => p.id === "base")?.priceCents ?? 4900) / 100;
  const net = monthly - basePrice;

  function applyPreset(next: string) {
    setBizType(next);
    const preset = ROI_PRESETS[next] ?? ROI_PRESETS.outro;
    setCalls(preset.calls);
    setTicket(preset.ticket);
  }

  return (
    <div style={{ fontFamily: SANS, color: INK, background: SURFACE }}>
      <style>{`
        @keyframes atd-bar { 0%,100% { transform:scaleY(0.35); } 50% { transform:scaleY(1); } }
        .atd a { text-decoration:none; color:${INK}; }
        .atd a:hover { color:${ACCENT}; }
      `}</style>

      <div className="atd">
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: "rgba(246,248,250,0.85)",
            backdropFilter: "blur(14px)",
            borderBottom: `1px solid ${LINE}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
              maxWidth: 1180,
              margin: "0 auto",
              padding: "14px 28px",
            }}
          >
            <a href="#topo">
              <Wordmark />
            </a>
            <nav style={{ display: "flex", flexWrap: "wrap", gap: 24, fontSize: 14, color: BODY }}>
              <a href="#como-funciona">Como funciona</a>
              <a href="#para-quem">Para quem é</a>
              <a href="#fluxo">A chamada</a>
              <a href="#ofertas">Planos</a>
              <a href="#retorno">Retorno</a>
              <a href="#faq">Perguntas</a>
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <a href={did.tel} style={{ fontFamily: MONO, fontSize: 14 }}>
                {did.display}
              </a>
              <button
                type="button"
                onClick={() => setOnboardOpen(true)}
                style={{
                  border: 0,
                  cursor: "pointer",
                  padding: "12px 20px",
                  borderRadius: 999,
                  background: INK,
                  color: "#fff",
                  fontFamily: SANS,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Criar assistente
              </button>
            </div>
          </div>
        </header>

        {/* hero */}
        <section
          id="topo"
          style={{
            position: "relative",
            overflow: "hidden",
            background:
              "radial-gradient(ellipse 60% 70% at 78% 18%, oklch(0.92 0.05 168 / 0.55), transparent 70%)",
          }}
        >
          <div
            style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "80px 28px 72px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))",
              gap: 56,
              alignItems: "center",
            }}
          >
            <div>
              <Pill>Recepcionista de voz com número +351</Pill>
              <h1
                style={{
                  margin: "22px 0 0",
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: "clamp(40px,5.4vw,66px)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.04em",
                  textWrap: "pretty",
                }}
              >
                O telefone do seu negócio deixa de ficar sem resposta.
              </h1>
              <p style={{ margin: "22px 0 0", maxWidth: "48ch", fontSize: 18, lineHeight: 1.65, color: BODY }}>
                O Atende responde em português de Portugal, percebe o pedido, marca na agenda que já usa e
                transfere para a pessoa certa quando é preciso. Trabalha à hora de almoço, ao sábado e quando tem
                as mãos ocupadas.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 34 }}>
                <a
                  href={did.tel}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "16px 26px",
                    borderRadius: 999,
                    background: ACCENT,
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: 600,
                    boxShadow: `0 14px 30px -14px ${ACCENT}`,
                  }}
                >
                  <span style={{ display: "block", width: 9, height: 9, borderRadius: 99, background: "#fff" }} />
                  Ligar e experimentar
                </a>
                <a
                  href="#ofertas"
                  style={{
                    display: "inline-flex",
                    padding: "16px 26px",
                    borderRadius: 999,
                    background: "#fff",
                    border: "1px solid #d7e0e8",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Ver planos
                </a>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 34 }}>
                {["14 dias de teste, 45 min, sem cartão", "Número +351 incluído", "RGPD · dados na UE"].map((t) => (
                  <span
                    key={t}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      background: "#fff",
                      border: `1px solid ${LINE}`,
                      fontSize: 13,
                      color: BODY,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div
              style={{
                position: "relative",
                borderRadius: 26,
                padding: 30,
                background: PANEL,
                boxShadow: "0 40px 80px -40px rgba(14,26,36,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
                color: "#e8eef2",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 26,
                  background:
                    "radial-gradient(ellipse 70% 40% at 50% 62%, oklch(0.58 0.14 168 / 0.22), transparent 70%)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#93a7b6",
                    }}
                  >
                    Linha de demonstração
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "6px 12px",
                      borderRadius: 999,
                      background: "oklch(0.58 0.14 168 / 0.16)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "oklch(0.82 0.13 168)",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        width: 7,
                        height: 7,
                        borderRadius: 99,
                        background: "oklch(0.78 0.15 168)",
                        boxShadow: "0 0 0 4px oklch(0.78 0.15 168 / 0.25)",
                      }}
                    />
                    a atender
                  </span>
                </div>
                <a
                  href={did.tel}
                  style={{
                    display: "block",
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: "clamp(40px,4.4vw,56px)",
                    lineHeight: 1.05,
                    letterSpacing: "-0.045em",
                    color: "#fff",
                    marginTop: 20,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {did.display}
                </a>
                <div style={{ fontFamily: MONO, fontSize: 13, color: "#93a7b6", marginTop: 8 }}>
                  {did.displayIntl}
                </div>

                <Waveform />

                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#a7bac7" }}>
                  Ao atender, pergunta que demonstração quer: clínica, barbearia, restaurante, oficina ou
                  imobiliária. Diga o nome ou prima 1 a 5 — cada escolha corre o agente real desse negócio.
                </p>
                <a
                  href={did.tel}
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 24,
                    padding: 15,
                    borderRadius: 999,
                    background: "#fff",
                    color: INK,
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  Ligar {did.display}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section id="como-funciona" style={{ background: "#fff", borderBlock: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
            <SectionHeading
              title="Como funciona"
              copy="Quatro passos. O único que não depende de nós é a aprovação regulatória do número."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
                gap: 18,
                marginTop: 40,
              }}
            >
              {STEPS.map((step, i) => (
                <div key={step.title} style={{ padding: "26px 24px", borderRadius: 18, background: SURFACE }}>
                  <span
                    style={{
                      display: "inline-grid",
                      placeItems: "center",
                      width: 34,
                      height: 34,
                      borderRadius: 99,
                      background: ACCENT_SOFT,
                      color: ACCENT_DARK,
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {i + 1}
                  </span>
                  <h3
                    style={{
                      margin: "16px 0 8px",
                      fontFamily: DISPLAY,
                      fontSize: 18,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {step.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: BODY }}>{step.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* sectors */}
        <section id="para-quem" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
          <SectionHeading
            title="Para quem é"
            copy="Seis famílias de negócio. O que têm em comum: as marcações entram por telefone e ninguém tem mãos livres para atender."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
              gap: 20,
              marginTop: 38,
            }}
          >
            {FAMILIES.map((family) => (
              <article
                key={family.title}
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "#fff",
                  border: `1px solid ${LINE}`,
                  boxShadow: "0 18px 40px -30px rgba(14,26,36,0.4)",
                }}
              >
                <img
                  src={family.image}
                  alt={family.title}
                  style={{ display: "block", width: "100%", height: 190, objectFit: "cover" }}
                />
                <div style={{ padding: "22px 24px" }}>
                  <h3 style={{ margin: "0 0 8px", fontFamily: DISPLAY, fontSize: 18, fontWeight: 600 }}>
                    {family.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: BODY }}>{family.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* call flow + calendar */}
        <section id="fluxo" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
          <SectionHeading
            kicker="O que acontece numa chamada"
            title="Da chamada a entrar até à marcação no calendário"
            copy="Quarenta segundos, sem ninguém parar o que está a fazer. Quando a hora pedida está ocupada, o assistente resolve o conflito na própria chamada."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
              gap: 20,
              marginTop: 40,
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FLOW.map((item, i) => (
                <div
                  key={item.title}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: "22px 24px",
                    borderRadius: 18,
                    background: "#fff",
                    border: `1px solid ${item.highlight ? ACCENT_BRIGHT : LINE}`,
                    boxShadow: item.highlight ? "0 22px 44px -32px oklch(0.45 0.12 168 / 0.5)" : undefined,
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      display: "inline-grid",
                      placeItems: "center",
                      width: 34,
                      height: 34,
                      borderRadius: 99,
                      background: item.highlight ? ACCENT : ACCENT_SOFT,
                      color: item.highlight ? "#fff" : ACCENT_DARK,
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 style={{ margin: "0 0 6px", fontFamily: DISPLAY, fontSize: 17, fontWeight: 600 }}>
                      {item.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: BODY }}>{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                borderRadius: 22,
                background: "#fff",
                border: `1px solid ${LINE}`,
                boxShadow: "0 26px 54px -38px rgba(14,26,36,0.45)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "18px 22px",
                  borderBottom: `1px solid ${LINE}`,
                }}
              >
                <div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700 }}>Quinta-feira</div>
                  <div style={{ fontSize: 13, color: MUTED }}>Agenda do Tiago · Google Calendar</div>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: ACCENT_SOFT,
                    color: ACCENT_DARK,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  sincronizado
                </span>
              </div>
              <div style={{ padding: "8px 22px 22px" }}>
                <CalRow time="15:00">
                  <span style={{ fontSize: 14, color: MUTED }}>livre</span>
                </CalRow>
                <CalRow time="15:30">
                  <span
                    style={{
                      display: "block",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "#eef2f6",
                      fontSize: 14,
                      fontWeight: 600,
                      color: BODY,
                    }}
                  >
                    Corte · Rui Marques
                  </span>
                </CalRow>
                <CalRow time="16:00">
                  <span
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 7,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "repeating-linear-gradient(135deg,#f2f5f8 0 8px,#e8edf2 8px 16px)",
                      fontSize: 14,
                      color: BODY,
                    }}
                  >
                    <strong style={{ fontWeight: 700 }}>ocupado</strong>
                    hora pedida pelo cliente
                  </span>
                </CalRow>
                <CalRow time="16:30" accent>
                  <span
                    style={{
                      display: "block",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: ACCENT,
                      color: "#fff",
                      boxShadow: `0 14px 28px -16px ${ACCENT}`,
                    }}
                  >
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>Corte + barba · novo</span>
                    <span style={{ display: "block", fontSize: 13, marginTop: 2 }}>
                      marcado pelo Atende às 14:03 · 45 min
                    </span>
                  </span>
                </CalRow>
                <CalRow time="17:15" last>
                  <span style={{ fontSize: 14, color: MUTED }}>livre</span>
                </CalRow>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "0 22px 22px" }}>
                {["sem sobreposições", "duração real do serviço", "SMS de confirmação"].map((t) => (
                  <span
                    key={t}
                    style={{
                      padding: "8px 13px",
                      borderRadius: 999,
                      background: SURFACE,
                      border: `1px solid ${LINE}`,
                      fontSize: 13,
                      color: BODY,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* plans */}
        <section id="ofertas" style={{ background: "#fff", borderBlock: `1px solid ${LINE}` }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
            <SectionHeading
              title="Planos"
              copy="O preço inclui sempre o número +351 e os minutos de atendimento. Teste de 14 dias com 45 minutos, sem cartão, e sem fidelização depois."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: 20,
                marginTop: 42,
              }}
            >
              {plans.map((plan) => {
                const featured = plan.id === "pro";
                return (
                  <article
                    key={plan.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 22,
                      background: featured ? "#fff" : SURFACE,
                      border: `1px solid ${featured ? "oklch(0.58 0.14 168 / 0.5)" : LINE}`,
                      boxShadow: featured ? "0 30px 60px -34px oklch(0.45 0.12 168 / 0.5)" : undefined,
                    }}
                  >
                    <div style={{ padding: "28px 26px 22px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span
                          style={{
                            fontFamily: DISPLAY,
                            fontSize: 15,
                            fontWeight: 700,
                            color: featured ? ACCENT_DARK : BODY,
                          }}
                        >
                          {plan.displayName}
                        </span>
                        {featured ? (
                          <span
                            style={{
                              padding: "6px 12px",
                              borderRadius: 999,
                              background: ACCENT,
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Mais escolhido
                          </span>
                        ) : null}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}>
                        <span
                          style={{
                            fontFamily: DISPLAY,
                            fontWeight: 700,
                            fontSize: 54,
                            lineHeight: 1,
                            letterSpacing: "-0.045em",
                          }}
                        >
                          {(plan.priceCents / 100).toFixed(0)}€
                        </span>
                        <span style={{ fontSize: 15, color: MUTED }}>/ mês</span>
                      </div>
                      <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.65, color: BODY }}>
                        {PLAN_BLURB[plan.id] ?? ""}
                      </p>
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        padding: "8px 26px 22px",
                        listStyle: "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        fontSize: 15,
                        lineHeight: 1.5,
                      }}
                    >
                      {plan.features.map((feature) => (
                        <li key={feature} style={{ display: "flex", gap: 10 }}>
                          <span style={{ color: ACCENT, fontWeight: 700 }}>✓</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: "auto", padding: "0 26px 26px" }}>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          color: MUTED,
                          paddingTop: 16,
                          borderTop: `1px solid ${LINE}`,
                        }}
                      >
                        {plan.maxResources ? `${plan.maxResources} recurso${plan.maxResources > 1 ? "s" : ""}` : "recursos ilimitados"}
                        {" · minuto extra "}
                        {(plan.overageCentsPerMinute / 100).toFixed(2)}€
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanId(plan.id);
                          setOnboardOpen(true);
                        }}
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          width: "100%",
                          marginTop: 16,
                          padding: 15,
                          borderRadius: 999,
                          cursor: "pointer",
                          fontFamily: SANS,
                          fontSize: 15,
                          fontWeight: featured ? 700 : 600,
                          background: featured ? ACCENT : "#fff",
                          color: featured ? "#fff" : INK,
                          border: featured ? 0 : "1px solid #d7e0e8",
                          boxShadow: featured ? `0 14px 28px -14px ${ACCENT}` : undefined,
                        }}
                      >
                        Escolher {plan.displayName}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 24,
                justifyContent: "space-between",
                marginTop: 24,
                padding: "24px 28px",
                borderRadius: 20,
                background: "oklch(0.96 0.025 168)",
              }}
            >
              <div style={{ maxWidth: "52ch" }}>
                <h3 style={{ margin: "0 0 6px", fontFamily: DISPLAY, fontSize: 17, fontWeight: 600 }}>
                  Portabilidade do número atual
                </h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: BODY }}>
                  Taxa única de 149€ para trazer o número que os seus clientes já conhecem, com acompanhamento do
                  processo até ficar ativo.
                </p>
              </div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, letterSpacing: "-0.04em" }}>
                149€ <span style={{ fontFamily: SANS, fontWeight: 400, fontSize: 14, color: MUTED }}>uma vez</span>
              </div>
            </div>
          </div>
        </section>

        {/* ROI */}
        <section id="retorno" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 28px" }}>
          <SectionHeading
            title="Quanto vale atender o telefone"
            copy="Escolha o tipo de negócio e ajuste os valores. A conta é simples: chamadas perdidas que passam a ser atendidas, vezes o que vale um cliente."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
              gap: 24,
              marginTop: 40,
              alignItems: "stretch",
            }}
          >
            <div style={{ padding: 28, borderRadius: 22, background: "#fff", border: `1px solid ${LINE}` }}>
              <label style={{ display: "block", fontFamily: DISPLAY, fontSize: 15, fontWeight: 700 }}>
                Tipo de negócio
              </label>
              <select
                value={bizType}
                onChange={(e) => applyPreset(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "13px 14px",
                  borderRadius: 12,
                  border: "1px solid #d7e0e8",
                  background: "#fff",
                  fontFamily: SANS,
                  fontSize: 15,
                  color: INK,
                }}
              >
                <option value="barbearia">Barbearia</option>
                <option value="salao">Salão</option>
                <option value="estetica">Estética</option>
                <option value="clinica">Clínica</option>
                <option value="restaurante">Restaurante</option>
                <option value="servicos">Serviços profissionais</option>
                <option value="outro">Outro</option>
              </select>

              <SliderRow label="Chamadas perdidas por semana" value={String(calls)}>
                <input
                  type="range"
                  min={1}
                  max={40}
                  step={1}
                  value={calls}
                  onChange={(e) => setCalls(Number(e.target.value))}
                  style={{ width: "100%", marginTop: 12, accentColor: ACCENT }}
                />
              </SliderRow>

              <SliderRow label="Valor médio por cliente" value={`${ticket}€`}>
                <input
                  type="range"
                  min={8}
                  max={150}
                  step={1}
                  value={ticket}
                  onChange={(e) => setTicket(Number(e.target.value))}
                  style={{ width: "100%", marginTop: 12, accentColor: ACCENT }}
                />
              </SliderRow>

              <p style={{ margin: "24px 0 0", fontSize: 14, lineHeight: 1.6, color: MUTED }}>
                Assumimos que 60% das chamadas perdidas se convertem em marcação quando alguém atende, e 4,33
                semanas por mês.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: 32,
                borderRadius: 22,
                background: PANEL,
                color: "#e8eef2",
                boxShadow: "0 34px 64px -40px rgba(14,26,36,0.6)",
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#93a7b6",
                }}
              >
                Receita recuperada
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 16 }}>
                <span
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: "clamp(46px,6vw,66px)",
                    lineHeight: 1,
                    letterSpacing: "-0.045em",
                    color: "#fff",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {monthly.toLocaleString("pt-PT")}€
                </span>
                <span style={{ fontSize: 18, color: "#93a7b6" }}>/ mês</span>
              </div>
              <p style={{ margin: "18px 0 0", fontSize: 15, lineHeight: 1.65, color: "#a7bac7" }}>
                Estimativa: 60% de {calls} chamadas perdidas por semana × {ticket}€ por cliente × 4,33 semanas.
              </p>
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(255,255,255,0.12)",
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "#a7bac7",
                }}
              >
                {net > 0
                  ? `Depois de pagar o plano de entrada (${basePrice.toFixed(0)}€/mês), sobram ${net.toLocaleString("pt-PT")}€ por mês.`
                  : "Com estes valores o plano custa mais do que recupera — comece pelo teste de 14 dias."}
              </div>
              <a
                href="#ofertas"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 24,
                  padding: 15,
                  borderRadius: 999,
                  background: ACCENT,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Escolher um plano
              </a>
            </div>
          </div>
        </section>

        {/* trust */}
        <section id="rgpd" style={{ padding: "0 28px" }}>
          <div
            style={{
              maxWidth: 1180,
              margin: "0 auto",
              borderRadius: 28,
              background: PANEL,
              color: "#e8eef2",
              padding: "64px 44px",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 44 }}>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: DISPLAY,
                    fontWeight: 700,
                    fontSize: "clamp(28px,3.2vw,40px)",
                    letterSpacing: "-0.035em",
                    color: "#fff",
                  }}
                >
                  Feito para operar em Portugal
                </h2>
                <p style={{ margin: "18px 0 0", maxWidth: "44ch", fontSize: 17, lineHeight: 1.65, color: "#a7bac7" }}>
                  O número, a língua e o tratamento de dados não são detalhes técnicos: são a diferença entre um
                  cliente confiar na chamada ou desligar.
                </p>
                <a
                  href={did.tel}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 28,
                    padding: "15px 24px",
                    borderRadius: 999,
                    background: ACCENT,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  Ligar {did.display}
                </a>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  [
                    "Número +351 tratado por nós",
                    "Pedido, aprovação regulatória e configuração de voz. Recebe o número pronto a atender.",
                  ],
                  [
                    "RGPD e dados na UE",
                    "Contrato de subcontratação (DPA) disponível, retenção definida e política de privacidade pública.",
                  ],
                  ["Sai quando quiser", "Sem fidelização. Se portou o número, continua a ser seu."],
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    style={{ padding: "20px 22px", borderRadius: 16, background: "rgba(255,255,255,0.05)" }}
                  >
                    <h3 style={{ margin: "0 0 6px", fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: "#fff" }}>
                      {title}
                    </h3>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#a7bac7" }}>{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* faq */}
        <section id="faq" style={{ maxWidth: 860, margin: "0 auto", padding: "72px 28px" }}>
          <SectionHeading title="Perguntas frequentes" />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 34 }}>
            {FAQ.map(([q, a]) => (
              <div key={q} style={{ padding: "22px 26px", borderRadius: 18, background: "#fff", border: `1px solid ${LINE}` }}>
                <h3 style={{ margin: "0 0 8px", fontFamily: DISPLAY, fontSize: 17, fontWeight: 600 }}>{q}</h3>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: BODY }}>{a}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 38 }}>
            <a
              href={did.tel}
              style={{
                display: "inline-flex",
                padding: "16px 26px",
                borderRadius: 999,
                background: ACCENT,
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                boxShadow: `0 14px 30px -14px ${ACCENT}`,
              }}
            >
              Ligar {did.display}
            </a>
            <button
              type="button"
              onClick={() => setOnboardOpen(true)}
              style={{
                display: "inline-flex",
                padding: "16px 26px",
                borderRadius: 999,
                background: "#fff",
                border: "1px solid #d7e0e8",
                cursor: "pointer",
                fontFamily: SANS,
                fontSize: 16,
                fontWeight: 600,
                color: INK,
              }}
            >
              Criar assistente
            </button>
          </div>
        </section>

        <footer style={{ background: "#fff", borderTop: `1px solid ${LINE}` }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              maxWidth: 1180,
              margin: "0 auto",
              padding: 28,
              fontSize: 14,
              color: BODY,
            }}
          >
            <Wordmark size={19} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              <a href="/privacidade">Privacidade</a>
              <a href="/termos">Termos</a>
              <a href="/dpa">DPA</a>
              <a href={did.tel}>{did.display}</a>
            </div>
          </div>
        </footer>
      </div>

      <OnboardDialog open={onboardOpen} onOpenChange={setOnboardOpen} planId={planId} onPlanChange={setPlanId} />
    </div>
  );
}

function CalRow({
  time,
  children,
  accent,
  last,
}: {
  time: string;
  children: React.ReactNode;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "62px 1fr",
        alignItems: "center",
        gap: 14,
        padding: "12px 0",
        borderBottom: last ? undefined : "1px solid #eef2f6",
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: accent ? 600 : 400,
          color: accent ? ACCENT_DARK : MUTED,
        }}
      >
        {time}
      </span>
      {children}
    </div>
  );
}

function SliderRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 26 }}>
        <label style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700 }}>{label}</label>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20, color: ACCENT_DARK }}>{value}</span>
      </div>
      {children}
    </>
  );
}

/* Unchanged onboarding flow — same payload and redirect as before. */
function OnboardDialog({
  open,
  onOpenChange,
  planId,
  onPlanChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onPlanChange: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState("clinica");
  const [agentName, setAgentName] = useState("Atende");
  const [agentGender, setAgentGender] = useState("neutro");
  const [locale, setLocale] = useState("pt");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [numberPreference, setNumberPreference] = useState("new");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          useCase,
          planId,
          agentName,
          agentGender,
          locale,
          contactEmail: email,
          contactPhone: phone,
          numberPreference,
        }),
      });
      const data = (await res.json()) as { slug?: string };
      if (data.slug) window.location.href = `/app/${data.slug}?onboarded=1`;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar assistente</DialogTitle>
          <DialogDescription>
            Nós pedimos o número por si. Só o publicamos depois da aprovação.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="biz-name">Nome do negócio</FieldLabel>
            <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Tipo</FieldLabel>
            <Select value={useCase} onValueChange={(value) => value && setUseCase(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {USE_CASES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Plano</FieldLabel>
            <Select value={planId} onValueChange={(value) => value && onPlanChange(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="base">Essencial</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="studio">Estúdio</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="agent-name">Nome do assistente</FieldLabel>
            <Input id="agent-name" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Voz</FieldLabel>
            <Select value={agentGender} onValueChange={(value) => value && setAgentGender(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="feminino">Feminina</SelectItem>
                  <SelectItem value="masculino">Masculina</SelectItem>
                  <SelectItem value="neutro">Neutra</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Idioma</FieldLabel>
            <Select value={locale} onValueChange={(value) => value && setLocale(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="en">Inglês</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Telemóvel</FieldLabel>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <FieldDescription>Opcional, para reconhecermos a chamada da demo.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Número</FieldLabel>
            <Select value={numberPreference} onValueChange={(value) => value && setNumberPreference(String(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="new">Novo número +351</SelectItem>
                  <SelectItem value="port">Portar o meu número</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={busy || !name.trim()} onClick={() => void submit()}>
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
