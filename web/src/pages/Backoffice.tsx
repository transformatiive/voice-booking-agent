import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ChevronDownIcon } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UseCase =
  | "barbearia"
  | "salao"
  | "clinica"
  | "restaurante"
  | "oficina"
  | "imobiliaria"
  | "ginasio"
  | "outro";

interface Booking {
  id: string;
  start: string;
  serviceName: string;
  customerName: string | null;
  customerPhone: string | null;
  source: string;
}

interface Business {
  name: string;
  slug: string;
  status: "pending" | "active";
  agentName: string;
  agentGender: string;
  locale: string;
  useCase: UseCase;
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
  bookings: Booking[];
  features: { demoActivate?: boolean; stripe?: boolean; gptLive?: boolean };
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

function labelUseCase(useCase: UseCase) {
  switch (useCase) {
    case "barbearia":
      return "Barbearia";
    case "salao":
      return "Salão";
    case "clinica":
      return "Clínica";
    case "restaurante":
      return "Restaurante";
    case "oficina":
      return "Oficina";
    case "imobiliaria":
      return "Imobiliária";
    case "ginasio":
      return "Ginásio";
    case "outro":
      return "Outro";
    default: {
      const exhaustive: never = useCase;
      return exhaustive;
    }
  }
}

function labelGender(gender: string) {
  switch (gender) {
    case "feminino":
      return "Feminina";
    case "masculino":
      return "Masculina";
    case "neutro":
      return "Neutra";
    default:
      return gender;
  }
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

function AppShell({
  kicker,
  title,
  copy,
  action,
  children,
}: {
  kicker: string;
  title: string;
  copy: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="landing flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="landing-section landing-section-compact">
          <p className="landing-kicker">{kicker}</p>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="landing-section-title">{title}</h1>
              <p className="landing-section-copy">{copy}</p>
            </div>
            {action}
          </div>
          <div className="mt-8 flex flex-col gap-6">{children}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Backoffice() {
  const { slug = "" } = useParams();
  const [state, setState] = useState<Payload | null>(null);
  const [tab, setTab] = useState("agenda");
  const [flash, setFlash] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);

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

  async function setResourceAvailable(id: string, available: boolean) {
    const resource = state?.business.resources.find((item) => item.id === id);
    if (!resource || resource.available === available) return;
    await fetch(`/api/business/${slug}/resource/${id}/toggle`, { method: "POST" });
    await load();
  }

  if (!state) {
    return (
      <AppShell kicker="Backoffice" title="Atende" copy="A carregar a conta.">
        <p className="text-sm text-muted-foreground">A carregar…</p>
      </AppShell>
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
    <AppShell
      kicker="Backoffice"
      title={b.name}
      copy={`${b.plan.displayName || b.plan.name} · assistente ${b.agentName}`}
      action={<Badge variant="secondary">{b.number?.e164 ?? "sem número"}</Badge>}
    >
      {flash ? (
        <Alert>
          <AlertTitle>Guardado</AlertTitle>
          <AlertDescription>As alterações da conta ficaram gravadas.</AlertDescription>
        </Alert>
      ) : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.bookings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        Ainda não há marcações.
                      </TableCell>
                    </TableRow>
                  ) : (
                    state.bookings.map((bk) => (
                      <TableRow key={bk.id}>
                        <TableCell className="font-medium">{bk.serviceName}</TableCell>
                        <TableCell>{bk.customerName || "Sem nome"}</TableCell>
                        <TableCell>{new Date(bk.start).toLocaleString("pt-PT")}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setBooking(bk)}>
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Dialog open={booking != null} onOpenChange={(open) => !open && setBooking(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{booking?.serviceName ?? "Marcação"}</DialogTitle>
                <DialogDescription>
                  {booking ? new Date(booking.start).toLocaleString("pt-PT") : ""}
                </DialogDescription>
              </DialogHeader>
              {booking ? (
                <div className="flex flex-col gap-2 text-sm">
                  <p>{booking.customerName || "Sem nome"}</p>
                  <p className="text-muted-foreground">{booking.customerPhone || "sem telefone"}</p>
                  <p className="text-muted-foreground">Origem: {booking.source}</p>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </TabsContent>
        <TabsContent value="recursos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recursos</CardTitle>
              <CardDescription>Quem atende e se está disponível para transferência.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Transferência</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.resources.map((resource) => (
                    <TableRow key={resource.id}>
                      <TableCell className="font-medium">{resource.name}</TableCell>
                      <TableCell>{resource.transferNumber || "sem transferência"}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                            {resource.available ? "Disponível" : "Ocupado"}
                            <ChevronDownIcon data-icon="inline-end" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onClick={() => void setResourceAvailable(resource.id, true)}>
                                Disponível
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void setResourceAvailable(resource.id, false)}>
                                Ocupado
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="servicos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Serviços</CardTitle>
              <CardDescription>O que o assistente pode marcar no telefone.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {b.services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className="font-medium">{service.name}</TableCell>
                      <TableCell className="text-right">{service.durationMinutes} min</TableCell>
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
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campo</TableHead>
                    <TableHead>Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Estado</TableCell>
                    <TableCell>{b.subscription.status}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Minutos</TableCell>
                    <TableCell>
                      {b.subscription.usedMinutes} / {b.subscription.includedMinutes}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Número</TableCell>
                    <TableCell>{b.number ? `${b.number.e164} (${b.number.status})` : "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
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
    <AppShell
      kicker="Aguardando aprovação"
      title="Estamos a preparar a sua conta"
      copy="Recebemos os seus dados. Tratamos do número +351 por si. A atribuição fica pendente da aprovação regulatória — não fica ativo no segundo a seguir ao pedido."
    >
      <ol className="landing-steps">
        <li>
          <span>01</span>
          <h3>Dados recebidos</h3>
          <p>
            {business.name} · plano {business.plan.displayName || business.plan.name}
          </p>
        </li>
        <li>
          <span>02</span>
          <h3>Número +351</h3>
          <p>
            {business.numberPreference === "port"
              ? "Portabilidade do seu número atual"
              : "Atribuição de um número +351"}
          </p>
        </li>
        <li>
          <span>03</span>
          <h3>Voz SIP</h3>
          <p>Ligamos o número ao Atende depois da aprovação.</p>
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">
        {business.name} · {labelUseCase(business.useCase)} · assistente {business.agentName}
        {business.contactEmail ? ` · ${business.contactEmail}` : ""}
      </p>
      {demoActivate ? (
        <div>
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
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Avisamos por email quando o número for aprovado. O backoffice abre nessa altura.
        </p>
      )}
    </AppShell>
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
        <CardDescription>Abertura e fecho por dia da semana.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dia</TableHead>
              <TableHead>Abre</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hours.map((day, i) => (
              <TableRow key={DAYS[i]}>
                <TableCell className="font-medium">{DAYS[i]}</TableCell>
                <TableCell>
                  <Input
                    type="time"
                    className="w-32"
                    value={hm(day.open)}
                    onChange={(e) => {
                      const next = hours.map((item, idx) =>
                        idx === i ? { ...item, open: toMin(e.target.value) } : item,
                      );
                      setHours(next);
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    className="w-32"
                    value={hm(day.close)}
                    onChange={(e) => {
                      const next = hours.map((item, idx) =>
                        idx === i ? { ...item, close: toMin(e.target.value) } : item,
                      );
                      setHours(next);
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter>
        <Button onClick={() => onSave(hours)}>Guardar</Button>
      </CardFooter>
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
                <SelectValue>{labelGender(agentGender)}</SelectValue>
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
                <SelectValue>{locale === "en" ? "Inglês" : "Português"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="en">Inglês</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button onClick={() => onSave({ agentName, agentGender, locale })}>Guardar</Button>
      </CardFooter>
    </Card>
  );
}
