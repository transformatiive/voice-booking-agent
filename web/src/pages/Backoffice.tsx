import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface Payload {
  business: Business;
  bookings: Array<{
    id: string;
    start: string;
    serviceName: string;
    customerName: string | null;
    customerPhone: string | null;
    source: string;
  }>;
  features: { demoActivate?: boolean; stripe?: boolean; gptLive?: boolean };
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function labelUseCase(u: string) {
  const map: Record<string, string> = {
    barbearia: "Barbearia",
    salao: "Salão",
    clinica: "Clínica",
    restaurante: "Restaurante",
    oficina: "Oficina",
    imobiliaria: "Imobiliária",
    ginasio: "Ginásio",
    outro: "Outro",
  };
  return map[u] || u;
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

export function Backoffice() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<Payload | null>(null);
  const [tab, setTab] = useState("agenda");
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
    }
  }

  if (!state) {
    return (
      <div className="p-8 text-sm text-muted-foreground">A carregar…</div>
    );
  }

  const b = state.business;
  if (b.status !== "active") {
    return (
      <Pending
        business={b}
        demoActivate={Boolean(state.features.demoActivate)}
        onActivated={load}
      />
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link to="/" className="text-xs text-muted-foreground">
              Atende
            </Link>
            <h1 className="font-heading text-xl">{b.name}</h1>
            <p className="text-sm text-muted-foreground">
              {b.plan.displayName || b.plan.name} · assistente {b.agentName}
            </p>
          </div>
          <Badge variant="secondary">{b.number?.e164 ?? "sem número"}</Badge>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-6">
        {flash ? <p className="mb-4 text-sm">{flash}</p> : null}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="recursos">Recursos</TabsTrigger>
            <TabsTrigger value="servicos">Serviços</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="assistente">Assistente</TabsTrigger>
            <TabsTrigger value="faturacao">Faturação</TabsTrigger>
          </TabsList>
          <TabsContent value="agenda" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Agenda</CardTitle>
                <CardDescription>As marcações do Atende, no seu Google Calendar.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {state.bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ainda não há marcações.</p>
                ) : (
                  state.bookings.map((bk) => (
                    <div key={bk.id} className="flex justify-between gap-3 border-b py-2 last:border-0">
                      <div>
                        <p className="font-medium">{bk.serviceName}</p>
                        <p className="text-sm text-muted-foreground">
                          {bk.customerName || "Sem nome"} · {new Date(bk.start).toLocaleString("pt-PT")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="recursos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Recursos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {b.resources.map((resource) => (
                  <div key={resource.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p>{resource.name}</p>
                      <p className="text-sm text-muted-foreground">{resource.transferNumber || "sem transferência"}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetch(`/api/business/${slug}/resource/${resource.id}/toggle`, { method: "POST" }).then(load)}
                    >
                      {resource.available ? "Disponível" : "Ocupado"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="servicos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Serviços</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {b.services.map((service) => (
                  <p key={service.id}>
                    {service.name} · {service.durationMinutes} min
                  </p>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="horarios" className="mt-4">
            <HoursEditor business={b} onSave={(hours) => void patch({ hours })} />
          </TabsContent>
          <TabsContent value="assistente" className="mt-4">
            <AssistantEditor business={b} onSave={(body) => void patch(body)} />
          </TabsContent>
          <TabsContent value="faturacao" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Faturação</CardTitle>
                <CardDescription>
                  {b.plan.displayName} · {(b.plan.priceCents / 100).toFixed(0)}€/mês
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>Estado: {b.subscription.status}</p>
                <p>
                  Minutos: {b.subscription.usedMinutes} / {b.subscription.includedMinutes}
                </p>
                <p>Número: {b.number ? `${b.number.e164} (${b.number.status})` : "—"}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Pending({
  business,
  demoActivate,
  onActivated,
}: {
  business: Business;
  demoActivate: boolean;
  onActivated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 px-6">
      <Badge variant="secondary">Aguardando aprovação</Badge>
      <h1 className="font-heading text-3xl tracking-tight">Estamos a preparar a sua conta</h1>
      <p className="text-muted-foreground">
        Recebemos os seus dados. Tratamos do número +351 por si. A atribuição fica pendente da aprovação
        regulatória — não fica ativo no segundo a seguir ao pedido.
      </p>
      <ul className="flex flex-col gap-3 text-sm">
        <li>Dados recebidos · {business.name} · plano {business.plan.displayName || business.plan.name}</li>
        <li>
          {business.numberPreference === "port" ? "Portabilidade do seu número atual" : "Atribuição de um número +351"}
        </li>
        <li>Configuração de voz (SIP) · ligamos o número ao Atende</li>
      </ul>
      <p className="text-sm text-muted-foreground">
        {business.name} · {labelUseCase(business.useCase)} · assistente {business.agentName}
        {business.contactEmail ? ` · ${business.contactEmail}` : ""}
      </p>
      {demoActivate ? (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/business/${business.slug}/activate`, { method: "POST" });
            await onActivated();
            setBusy(false);
          }}
        >
          Ver o backoffice (demonstração)
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Avisamos por email quando o número for aprovado. O backoffice abre nessa altura.
        </p>
      )}
    </div>
  );
}

function HoursEditor({
  business,
  onSave,
}: {
  business: Business;
  onSave: (hours: Business["hours"]) => void;
}) {
  const [hours, setHours] = useState(business.hours);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Horários</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {hours.map((day, i) => (
          <div key={DAYS[i]} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm">{DAYS[i]}</span>
            <Input
              type="time"
              className="w-32"
              value={hm(day.open)}
              onChange={(e) => {
                const next = hours.map((item, idx) => (idx === i ? { ...item, open: toMin(e.target.value) } : item));
                setHours(next);
              }}
            />
            <Input
              type="time"
              className="w-32"
              value={hm(day.close)}
              onChange={(e) => {
                const next = hours.map((item, idx) => (idx === i ? { ...item, close: toMin(e.target.value) } : item));
                setHours(next);
              }}
            />
          </div>
        ))}
        <Button onClick={() => onSave(hours)}>Guardar</Button>
      </CardContent>
    </Card>
  );
}

function AssistantEditor({
  business,
  onSave,
}: {
  business: Business;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [agentName, setAgentName] = useState(business.agentName);
  const [agentGender, setAgentGender] = useState(business.agentGender);
  const [locale, setLocale] = useState(business.locale);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assistente</CardTitle>
        <CardDescription>Voz: ChatGPT Live (gpt-live-1)</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="a-name">Nome do assistente</FieldLabel>
            <Input id="a-name" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
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
          <Button onClick={() => onSave({ agentName, agentGender, locale })}>Guardar</Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
