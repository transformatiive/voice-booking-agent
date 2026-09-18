import { useState } from "react";
import { Button } from "@/components/ui/button";
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

export function OnboardDialog({
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
