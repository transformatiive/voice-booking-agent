import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, PhoneCallIcon, PhoneIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VoiceSession, type VoicePhase } from "@/lib/voice-call";

type DemoUseCase = "clinica" | "barbearia" | "restaurante" | "oficina" | "imobiliaria";

interface DemoOption {
  useCase: DemoUseCase;
  slug: string;
  label: string;
  agentName: string;
  hint: string;
}

interface DemoPayload {
  did: {
    e164: string;
    nsn: string;
    display: string;
    displayIntl: string;
    tel: string;
  };
  options: DemoOption[];
  defaultUseCase: DemoUseCase;
  slug: string;
  agentName: string;
  features: { gptLive?: boolean };
}

interface Plan {
  id: "base" | "pro" | "studio";
  name: string;
  displayName: string;
  priceCents: number;
  includedMinutes: number;
  features: string[];
}

const FAMILIES = [
  {
    title: "Saúde",
    copy: "Clínicas e consultórios que não podem perder a chamada entre consultas.",
    image:
      "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Beleza e bem-estar",
    copy: "Barbearias e salões com as mãos ocupadas e a agenda no telemóvel.",
    image:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80",
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
    image:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    title: "Fitness e formação",
    copy: "Ginásios e escolas que marcam aulas experimentais ao telefone.",
    image:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80",
  },
];

const USE_CASES: Array<{ value: string; label: string }> = [
  { value: "barbearia", label: "Barbearia" },
  { value: "salao", label: "Salão" },
  { value: "clinica", label: "Clínica" },
  { value: "restaurante", label: "Restaurante" },
  { value: "oficina", label: "Oficina" },
  { value: "imobiliaria", label: "Imobiliária" },
  { value: "ginasio", label: "Ginásio" },
  { value: "outro", label: "Outro" },
];

const TRUSTED_BY = ["Saúde&Vida", "Barber Co.", "Sabor&Cia", "Oficina Total"];

const WAVEFORM = [10, 16, 24, 18, 30, 20, 14, 26, 34, 22, 16, 28, 20, 32, 24, 14, 22, 18, 12];

const CALENDAR_LINE = "Agendamento por voz com marcação no seu Google Calendar.";

const FALLBACK_DID = {
  e164: "+351210210260",
  nsn: "210210260",
  display: "21 021 0260",
  displayIntl: "+351 21 021 0260",
  tel: "tel:+351210210260",
};

function formatHeroDid(nsn: string) {
  if (nsn.length === 9) return `${nsn.slice(0, 3)} ${nsn.slice(3, 6)} ${nsn.slice(6)}`;
  return nsn;
}

export function Landing() {
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedUseCase, setSelectedUseCase] = useState<DemoUseCase>("clinica");
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [caption, setCaption] = useState("Toque em Iniciar chamada ou ligue 21 021 0260.");
  const [speaker, setSpeaker] = useState("Atende");
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [planId, setPlanId] = useState("pro");
  const session = useMemo(() => new VoiceSession({
    slug: "clinica-central",
    agentName: "Atende",
    onPhase: setPhase,
    onCaption: (who, text) => {
      setSpeaker(who);
      setCaption(text);
    },
  }), []);

  const option = demo?.options.find((item) => item.useCase === selectedUseCase) ?? demo?.options[0];
  const did = demo?.did ?? FALLBACK_DID;
  const heroDid = formatHeroDid(did.nsn);

  useEffect(() => {
    void fetch("/api/demo")
      .then((res) => res.json())
      .then((payload: DemoPayload) => {
        setDemo(payload);
        session.setGptLive(Boolean(payload.features?.gptLive));
        session.setSlug(payload.slug);
      })
      .catch(() => undefined);
    void fetch("/api/plans")
      .then((res) => res.json())
      .then((payload: { plans: Plan[] }) => setPlans(payload.plans))
      .catch(() => undefined);
  }, [session]);

  async function selectUseCase(next: DemoUseCase) {
    if (phase === "live" || phase === "connecting") {
      await session.hangup();
    }
    setSelectedUseCase(next);
    const match = demo?.options.find((item) => item.useCase === next);
    if (match) session.setSlug(match.slug);
    setCaption(`Demo ${match?.label ?? next}. Toque em Iniciar chamada ou ligue 21 021 0260.`);
    setSpeaker("Atende");
    void fetch("/api/demo/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCase: next }),
    });
  }

  return (
    <div className="landing">
      <div className="landing-shell">
        <header className="landing-header">
          <div className="landing-header-inner">
            <Link to="/" className="landing-logo">
              Atende
              <span className="landing-logo-dot" aria-hidden="true" />
            </Link>
            <nav className="landing-nav">
              <a href="#produto">Produto</a>
              <a href="#para-quem">Soluções</a>
              <a href="#precos">Preços</a>
              <a href="#faq">Sobre</a>
            </nav>
            <button type="button" className="landing-btn landing-btn-primary" onClick={() => setOnboardOpen(true)}>
              Começar
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </header>

        <section className="landing-hero">
          <div>
            <p className="landing-kicker">Recepcionista IA telefónica</p>
            <h1>Atendimento telefónico com a confiança de uma recepcionista</h1>
            <p className="landing-lead">
              Voz IA que atende, qualifica e agenda 24/7. Mais marcações para clínicas, restaurantes
              e oficinas — menos chamadas perdidas.
            </p>
            <div className="landing-hero-ctas">
              <button type="button" className="landing-btn landing-btn-primary" onClick={() => setOnboardOpen(true)}>
                Começar
                <span aria-hidden="true">→</span>
              </button>
              <a className="landing-phone-cta" href={did.tel}>
                <span className="landing-phone-icon">
                  <PhoneIcon className="size-4" />
                </span>
                <span>
                  Ou ligue <strong>{heroDid}</strong>
                </span>
              </a>
            </div>
          </div>
          <HeroProductCards />
        </section>

        <div className="landing-trust">
          <p className="landing-trust-label">Confiado por negócios em crescimento</p>
          <div className="landing-trust-logos">
            {TRUSTED_BY.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      </div>

      <main>
        <section className="landing-section-muted">
          <div className="landing-section landing-section-compact">
            <div>
              <h2 className="landing-section-title">Ou fale aqui no browser</h2>
              <p className="landing-section-copy">
                Escolha o caso e inicie a chamada. O mesmo Atende, o mesmo modelo gpt-live-1.
              </p>
            </div>
            <div className="demo-picker mt-6" id="demoPicker" role="tablist" aria-label="Escolher demo">
              <ToggleGroup
                value={[selectedUseCase]}
                onValueChange={(next) => {
                  const value = (Array.isArray(next) ? next[0] : next) as DemoUseCase | undefined;
                  if (value) void selectUseCase(value);
                }}
                variant="outline"
                className="flex flex-wrap"
              >
                <ToggleGroupItem value="clinica" data-demo-use-case="clinica">
                  Clínica
                </ToggleGroupItem>
                <ToggleGroupItem value="barbearia" data-demo-use-case="barbearia">
                  Barbearia
                </ToggleGroupItem>
                <ToggleGroupItem value="restaurante" data-demo-use-case="restaurante">
                  Restaurante
                </ToggleGroupItem>
                <ToggleGroupItem value="oficina" data-demo-use-case="oficina">
                  Oficina
                </ToggleGroupItem>
                <ToggleGroupItem value="imobiliaria" data-demo-use-case="imobiliaria">
                  Imobiliária
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <p className="demo-did mt-4 text-sm text-[var(--landing-ink-soft)]">
              Ligar <a className="underline underline-offset-4" href="tel:+351210210260">21 021 0260</a>
              {" "}· ou fale aqui no browser
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <Card id="demo" className="ring-0">
                <CardHeader>
                  <CardTitle>Ligar para ouvir a demo</CardTitle>
                  <CardDescription>
                    Este é o caminho real: chame o número. O Atende pergunta que demonstração quer e entra nesse negócio.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <a href={did.tel} className="flex flex-col gap-2 rounded-xl bg-[#eef4ff] px-5 py-5">
                    <span className="text-xs tracking-[0.18em] text-[var(--landing-muted)] uppercase">
                      Número da demo — ligar para ouvir
                    </span>
                    <span className="text-4xl font-semibold tracking-tight md:text-5xl">{did.nsn}</span>
                    <span className="text-xl tracking-tight">{did.displayIntl}</span>
                    <span className="text-sm text-[var(--landing-ink-soft)]">
                      {did.display} · {did.e164} · {did.tel}
                    </span>
                  </a>
                  <a href={did.tel} className="landing-btn landing-btn-primary landing-btn-full">
                    Ligar {did.displayIntl}
                  </a>
                  <p className="text-sm text-[var(--landing-ink-soft)]">
                    Ao atender, o Atende pergunta: clínica, barbearia, restaurante, oficina ou imobiliária.
                    Pode dizer o nome ou premir 1 a 5. Cada escolha corre o agente real desse negócio — serviços, agenda e ferramentas.
                  </p>
                </CardContent>
              </Card>

              <Card id="demo-call" className="ring-0">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>{option?.label ?? "Clínica"}</CardTitle>
                      <CardDescription>{option?.hint ?? "Marcar consulta"}</CardDescription>
                    </div>
                    <Badge className="bg-[#e8effc] text-cobalt hover:bg-[#e8effc]">
                      {phase === "live" ? "Chamada ao vivo" : "Pronto a ligar"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="rounded-lg bg-[#eef4ff] px-4 py-3">
                    <p className="text-xs text-[var(--landing-muted)]">{speaker}</p>
                    <p>{caption}</p>
                  </div>
                  <Alert>
                    <PhoneCallIcon />
                    <AlertTitle>Na chamada telefónica o Atende pergunta o cenário</AlertTitle>
                    <AlertDescription>
                      O picker do site muda o agente no browser. Na linha {did.nsn} a escolha faz-se na própria chamada.
                    </AlertDescription>
                  </Alert>
                </CardContent>
                <CardFooter className="border-0 bg-transparent">
                  {phase === "live" || phase === "connecting" ? (
                    <Button variant="destructive" onClick={() => void session.hangup()}>
                      Terminar
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="landing-btn landing-btn-primary"
                      disabled={phase === "blocked"}
                      onClick={() => {
                        if (option) session.setSlug(option.slug);
                        void session.startCall();
                      }}
                    >
                      Iniciar chamada
                    </button>
                  )}
                </CardFooter>
              </Card>
            </div>
          </div>
        </section>

        <section id="para-quem" className="landing-section">
          <div>
            <h2 className="landing-section-title">Para quem é</h2>
            <p className="landing-section-copy">
              Seis famílias de negócio. A demo ao vivo cobre cinco trabalhos concretos — não um catálogo de 50 páginas.
            </p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FAMILIES.map((family) => (
              <Card key={family.title} className="landing-industry ring-0">
                <img src={family.image} alt="" />
                <CardHeader>
                  <CardTitle>{family.title}</CardTitle>
                  <CardDescription>{family.copy}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="produto" className="landing-section landing-section-tight">
          <h2 className="landing-section-title">Como funciona</h2>
          <ol className="landing-steps">
            <li>
              <span>01</span>
              <h3>Liga para o +351 que nós tratamos</h3>
              <p>Não há número instantâneo. Pedimos o DID por si.</p>
            </li>
            <li>
              <span>02</span>
              <h3>O Atende atende</h3>
              <p>Percebe o pedido em português de Portugal.</p>
            </li>
            <li>
              <span>03</span>
              <h3>Consulta a agenda</h3>
              <p>{CALENDAR_LINE}</p>
            </li>
            <li>
              <span>04</span>
              <h3>Espera pela aprovação</h3>
              <p>A atribuição fica pendente da aprovação regulatória.</p>
            </li>
          </ol>
        </section>

        <section id="precos" className="landing-section-muted">
          <div className="landing-section">
            <div>
              <h2 className="landing-section-title">Preços claros</h2>
              <p className="landing-section-copy">
                14 dias de teste, 45 minutos, sem cartão. O número próprio só depois da aprovação.
                200 minutos e +351 incluídos no Essencial — frente aos 75 min e DID instantâneo só nos EUA da Reception Basic.
              </p>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {(plans.length ? plans : [
                { id: "base", displayName: "Essencial", priceCents: 4900, includedMinutes: 200, features: [CALENDAR_LINE] },
                { id: "pro", displayName: "Pro", priceCents: 9900, includedMinutes: 600, features: [] },
                { id: "studio", displayName: "Estúdio", priceCents: 19900, includedMinutes: 1500, features: [] },
              ] as Plan[]).map((plan) => {
                const featured = plan.id === "pro";
                return (
                  <Card key={plan.id} className={featured ? "ring-2 ring-cobalt/25" : "ring-0"}>
                    <CardHeader>
                      {featured ? <span className="landing-price-note">Mais escolhido</span> : null}
                      <CardTitle>{plan.displayName}</CardTitle>
                      <CardDescription>
                        {(plan.priceCents / 100).toFixed(0)}€ / mês · {plan.includedMinutes} min
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      {plan.features.map((feature) => (
                        <p key={feature}>{feature}</p>
                      ))}
                    </CardContent>
                    <CardFooter className="border-0 bg-transparent">
                      <button
                        type="button"
                        className={`landing-btn landing-btn-full ${featured ? "landing-btn-primary" : "landing-btn-outline"}`}
                        onClick={() => {
                          setPlanId(plan.id);
                          setOnboardOpen(true);
                        }}
                      >
                        Escolher {plan.displayName}
                      </button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-7 py-16">
          <h2 className="landing-section-title">Perguntas frequentes</h2>
          <Accordion className="mt-6">
            <AccordionItem value="demo">
              <AccordionTrigger>Posso ouvir uma demo?</AccordionTrigger>
              <AccordionContent>
                Sim. Ligue {did.displayIntl} ({did.nsn}). O Atende pergunta se quer clínica, barbearia, restaurante, oficina ou imobiliária e entra nesse agente. Também pode usar os cinco chips e a chamada no browser.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="number">
              <AccordionTrigger>O número fica ativo na hora?</AccordionTrigger>
              <AccordionContent>
                Não. Tratamos do número +351 por si. A atribuição fica pendente da aprovação regulatória. Não está ativo no segundo a seguir ao pedido.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="who">
              <AccordionTrigger>Serve só barbearias?</AccordionTrigger>
              <AccordionContent>
                Não. Cobrimos seis famílias: Saúde; Beleza e bem-estar; Restauração e hotelaria; Casa, auto e campo; Serviços profissionais; Fitness e formação.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="calendar">
              <AccordionTrigger>Como fica a agenda?</AccordionTrigger>
              <AccordionContent>{CALENDAR_LINE} As marcações aparecem na app Google Calendar do telemóvel.</AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="mt-10">
            <button
              type="button"
              className="landing-btn landing-btn-primary"
              onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
            >
              Ouça a demo
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span className="landing-footer-brand">Atende</span>
          <div className="landing-footer-links">
            <a href="/privacidade">Privacidade</a>
            <a href="/termos">Termos</a>
            <a href="/dpa">DPA</a>
          </div>
        </div>
      </footer>

      <OnboardDialog open={onboardOpen} onOpenChange={setOnboardOpen} planId={planId} onPlanChange={setPlanId} />
    </div>
  );
}

function HeroProductCards() {
  return (
    <div className="landing-stage" aria-hidden="true">
      <article className="hero-card hero-card-metrics">
        <p className="hero-card-label">Chamadas hoje</p>
        <div className="hero-card-metric-row">
          <span className="hero-card-metric">128</span>
          <span className="hero-card-delta">↑ 18% vs. ontem</span>
        </div>
        <svg className="hero-spark" viewBox="-4 0 248 72" fill="none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroSparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.38" />
              <stop offset="70%" stopColor="#2563EB" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 50 C28 48 48 42 72 40 C104 36 124 22 152 24 C180 26 204 16 240 12 L240 72 L0 72 Z"
            fill="url(#heroSparkFill)"
          />
          <path
            d="M0 50 C28 48 48 42 72 40 C104 36 124 22 152 24 C180 26 204 16 240 12"
            stroke="#2563EB"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <div className="hero-card-metrics-foot">
          <span>Duração média 02:34</span>
          <svg className="hero-ring" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="14" fill="none" stroke="#e8eef7" strokeWidth="3.4" />
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke="#2563EB"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeDasharray="64 88"
              transform="rotate(-90 18 18)"
            />
          </svg>
        </div>
      </article>

      <article className="hero-card hero-card-booking">
        <div className="hero-card-booking-top">
          <p className="hero-card-label">Agendamento confirmado</p>
          <span className="hero-check">
            <CheckIcon className="size-3.5" />
          </span>
        </div>
        <h3>Consulta agendada</h3>
        <p>Clínica dermatologia</p>
        <p>24 de maio · 10:30</p>
      </article>

      <article className="hero-card hero-card-voice">
        <div className="hero-card-voice-top">
          <p className="hero-card-label">Voz IA · activa</p>
          <span className="hero-live">Ao vivo</span>
        </div>
        <div className="hero-wave">
          {WAVEFORM.map((height, index) => (
            <i
              key={`${height}-${index}`}
              style={{ height: `${height}px`, animationDelay: `${index * 0.06}s` }}
            />
          ))}
        </div>
        <p>A atender · 01:47</p>
      </article>
    </div>
  );
}

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
