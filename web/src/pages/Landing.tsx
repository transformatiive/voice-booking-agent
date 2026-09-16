import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PhoneCallIcon } from "lucide-react";
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
      "https://images.unsplash.com/photo-1487754180451-c456f719a1e8?auto=format&fit=crop&w=1200&q=80",
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

const CALENDAR_LINE = "Agendamento por voz com marcação no seu Google Calendar.";

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
  const did = demo?.did ?? {
    e164: "+351210210260",
    nsn: "210210260",
    display: "21 021 0260",
    displayIntl: "+351 21 021 0260",
    tel: "tel:+351210210260",
  };

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
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="font-heading text-lg tracking-tight">
            Atende
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#demo">Demo</a>
            <a href="#para-quem">Para quem é</a>
            <a href="#precos">Preços</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Button onClick={() => setOnboardOpen(true)}>Criar assistente</Button>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="flex flex-col gap-6">
            <Badge variant="secondary">Recepcionista de voz para PME em Portugal</Badge>
            <h1 className="font-heading text-4xl leading-tight tracking-tight md:text-5xl">
              O telefone toca enquanto se trabalha. O Atende responde.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Para qualquer PME onde o telefone toca no meio do serviço — não é um produto só para barbearias.
              Marcações em português de Portugal, número +351 tratado por nós.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>Número +351 incluído</span>
              <span aria-hidden="true">·</span>
              <span>{CALENDAR_LINE}</span>
              <span aria-hidden="true">·</span>
              <span>Demo: 21 021 0260</span>
            </div>
          </div>

          <Card id="demo" className="border-foreground/10">
            <CardHeader>
              <CardTitle>Ligar para ouvir a demo</CardTitle>
              <CardDescription>
                Este é o caminho real: chame o número. O Atende pergunta que demonstração quer e entra nesse negócio.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <a
                href="tel:+351210210260"
                className="flex flex-col gap-1 rounded-xl bg-muted px-5 py-4"
              >
                <span className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
                  Número da demo
                </span>
                <span className="font-heading text-3xl tracking-tight">{did.displayIntl}</span>
                <span className="text-sm text-muted-foreground">
                  {did.nsn} · {did.display} · {did.e164}
                </span>
              </a>
              <p className="text-sm text-muted-foreground">
                Ao atender, o Atende pergunta: clínica, barbearia, restaurante, oficina ou imobiliária.
                Pode dizer o nome ou premir 1 a 5. Cada escolha corre o agente real desse negócio — serviços, agenda e ferramentas.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-14">
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-2xl tracking-tight">Ou fale aqui no browser</h2>
              <p className="text-muted-foreground">
                Escolha o caso e inicie a chamada. O mesmo Atende, o mesmo modelo gpt-live-1.
              </p>
            </div>
            <div className="demo-picker" id="demoPicker" role="tablist" aria-label="Escolher demo">
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
            <p className="demo-did text-sm">
              Ligar <a className="underline underline-offset-4" href="tel:+351210210260">21 021 0260</a>
              {" "}· ou fale aqui no browser
            </p>
            <Card id="demo-call">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{option?.label ?? "Clínica"}</CardTitle>
                    <CardDescription>{option?.hint ?? "Marcar consulta"}</CardDescription>
                  </div>
                  <Badge variant="secondary">{phase === "live" ? "Chamada ao vivo" : "Pronto a ligar"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="rounded-lg bg-muted px-4 py-3">
                  <p className="text-xs text-muted-foreground">{speaker}</p>
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
              <CardFooter className="flex gap-2">
                {phase === "live" || phase === "connecting" ? (
                  <Button variant="destructive" onClick={() => void session.hangup()}>
                    Terminar
                  </Button>
                ) : (
                  <Button
                    disabled={phase === "blocked"}
                    onClick={() => {
                      if (option) session.setSlug(option.slug);
                      void session.startCall();
                    }}
                  >
                    Iniciar chamada
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </section>

        <section id="para-quem" className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-3xl tracking-tight">Para quem é</h2>
            <p className="max-w-2xl text-muted-foreground">
              Seis famílias de negócio. A demo ao vivo cobre cinco trabalhos concretos — não um catálogo de 50 páginas.
            </p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {FAMILIES.map((family) => (
              <Card key={family.title}>
                <img src={family.image} alt="" className="h-44 w-full object-cover" />
                <CardHeader>
                  <CardTitle>{family.title}</CardTitle>
                  <CardDescription>{family.copy}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8">
          <h2 className="font-heading text-2xl tracking-tight">Como funciona</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-4">
            <li className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">01</span>
              <h3 className="font-medium">Liga para o +351 que nós tratamos</h3>
              <p className="text-sm text-muted-foreground">Não há número instantâneo. Pedimos o DID por si.</p>
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">02</span>
              <h3 className="font-medium">O Atende atende</h3>
              <p className="text-sm text-muted-foreground">Percebe o pedido em português de Portugal.</p>
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">03</span>
              <h3 className="font-medium">Consulta a agenda</h3>
              <p className="text-sm text-muted-foreground">{CALENDAR_LINE}</p>
            </li>
            <li className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">04</span>
              <h3 className="font-medium">Espera pela aprovação</h3>
              <p className="text-sm text-muted-foreground">A atribuição fica pendente da aprovação regulatória.</p>
            </li>
          </ol>
        </section>

        <section id="precos" className="border-y bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-3xl tracking-tight">Preços claros</h2>
              <p className="max-w-2xl text-muted-foreground">
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
                  <Card key={plan.id} className={featured ? "ring-foreground/20" : undefined}>
                    <CardHeader>
                      {featured ? <Badge>Mais escolhido</Badge> : null}
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
                    <CardFooter>
                      <Button
                        variant={featured ? "default" : "outline"}
                        className="w-full"
                        onClick={() => {
                          setPlanId(plan.id);
                          setOnboardOpen(true);
                        }}
                      >
                        Escolher {plan.displayName}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="font-heading text-3xl tracking-tight">Perguntas frequentes</h2>
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
            <Button size="lg" onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}>
              Ouça a demo
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground">
          <span>Atende</span>
          <div className="flex gap-4">
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
