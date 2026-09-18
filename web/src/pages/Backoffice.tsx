import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppChrome } from "@/components/app-chrome";

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
  telephonyProvider?: string;
}

type LineKind = "assigned" | "pending" | "porting";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const GENDER_LABEL: Record<string, string> = {
  feminino: "Feminina",
  masculino: "Masculina",
  neutro: "Neutra",
};

const LOCALE_LABEL: Record<string, string> = {
  pt: "Português",
  en: "Inglês",
};

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

function lineKind(business: Business): LineKind {
  const number = business.number;
  if (number && number.status === "active") {
    return "assigned";
  }
  if (business.numberPreference === "port" || number?.status === "porting") {
    return "porting";
  }
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
        body: `O número ${business.number?.e164} já está atribuído. A Transformatiive provisiona linhas via Telnyx; não está à espera de um pedido regulatório seu.`,
      };
    case "porting":
      return {
        kind,
        label: "Pendente de Aprovação Regulatória",
        title: "Pendente de Aprovação Regulatória",
        body: "Pediu para portar o número que os clientes já conhecem. Tratamos do processo. Na prática a Transformatiive atribui e encaminha linhas via Telnyx — a aprovação regulatória, se existir, corre do nosso lado e pode nem ser necessária. O backoffice já está disponível.",
      };
    case "pending":
      return {
        kind,
        label: "Pendente de Aprovação Regulatória",
        title: "Pendente de Aprovação Regulatória",
        body: "A linha ainda não está publicada. A Transformatiive trata da atribuição do +351 via Telnyx; a aprovação regulatória, se existir, corre do nosso lado e muitas vezes nem é necessária. Já pode configurar agenda, serviços, horários e o assistente. Avisamos quando o número estiver ativo.",
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
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
      <AppChrome>
        <p className="text-sm text-muted-foreground">A carregar…</p>
      </AppChrome>
    );
  }

  const b = state.business;
  const status = lineStatusCopy(b);

  return (
    <AppChrome
      trailing={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.kind === "assigned" ? "secondary" : "outline"}>{status.label}</Badge>
          <Badge variant="secondary">{b.number?.e164 ?? "sem número"}</Badge>
        </div>
      }
    >
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-[1.65rem]">{b.name}</h1>
        <p className="text-sm text-muted-foreground">
          {b.plan.displayName || b.plan.name} · assistente {b.agentName} · {labelUseCase(b.useCase)}
        </p>
      </div>
      <Alert className="mb-5 border-teal/25 bg-teal-soft px-4 py-3">
        <AlertTitle className="font-heading text-sm font-semibold text-teal-dark">{status.title}</AlertTitle>
        <AlertDescription className="mt-1 text-sm leading-relaxed text-ink/80">{status.body}</AlertDescription>
      </Alert>
      {flash ? <p className="mb-4 text-sm">{flash}</p> : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
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
            <CardContent>
              {state.bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há marcações.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.bookings.map((bk) => (
                      <TableRow key={bk.id}>
                        <TableCell className="font-medium">{bk.serviceName}</TableCell>
                        <TableCell>{bk.customerName || "Sem nome"}</TableCell>
                        <TableCell>{new Date(bk.start).toLocaleString("pt-PT")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                <div key={resource.id} className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p>{resource.name}</p>
                    <p className="text-sm text-muted-foreground">{resource.transferNumber || "sem transferência"}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void fetch(`/api/business/${slug}/resource/${resource.id}/toggle`, { method: "POST" }).then(load)
                    }
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
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell>{service.name}</TableCell>
                      <TableCell>{service.durationMinutes} min</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </AppChrome>
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
                <SelectValue>{GENDER_LABEL[agentGender] ?? agentGender}</SelectValue>
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
                <SelectValue>{LOCALE_LABEL[locale] ?? locale}</SelectValue>
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
