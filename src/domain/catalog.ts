import { randomUUID } from "node:crypto";
import type { Service, UseCase, WeeklyHours } from "./types.js";

interface ServiceSeed {
  name: string;
  durationMinutes: number;
  priceCents: number | null;
}

/** Default services per vertical. Barbearia is the primary beachhead. */
const SERVICE_SEEDS: Record<UseCase, ServiceSeed[]> = {
  barbearia: [
    { name: "Corte de cabelo", durationMinutes: 30, priceCents: 1200 },
    { name: "Corte + barba", durationMinutes: 45, priceCents: 1800 },
    { name: "Barba", durationMinutes: 20, priceCents: 800 },
    { name: "Corte infantil", durationMinutes: 30, priceCents: 1000 },
  ],
  salao: [
    { name: "Corte de cabelo", durationMinutes: 45, priceCents: 2000 },
    { name: "Coloração", durationMinutes: 90, priceCents: 5500 },
    { name: "Brushing", durationMinutes: 40, priceCents: 1800 },
    { name: "Manicure", durationMinutes: 45, priceCents: 1500 },
  ],
  clinica: [
    { name: "Consulta", durationMinutes: 30, priceCents: null },
    { name: "Limpeza dentária", durationMinutes: 45, priceCents: null },
    { name: "Avaliação", durationMinutes: 20, priceCents: null },
  ],
  restaurante: [
    { name: "Reserva de mesa (2 pessoas)", durationMinutes: 90, priceCents: null },
    { name: "Reserva de mesa (4 pessoas)", durationMinutes: 90, priceCents: null },
    { name: "Reserva de grupo", durationMinutes: 120, priceCents: null },
  ],
  outro: [{ name: "Marcação", durationMinutes: 30, priceCents: null }],
};

export function defaultServices(useCase: UseCase): Service[] {
  return SERVICE_SEEDS[useCase].map((seed) => ({
    id: randomUUID(),
    name: seed.name,
    durationMinutes: seed.durationMinutes,
    priceCents: seed.priceCents,
    calEventTypeId: null,
  }));
}

/** Mon–Sat 09:00–19:00, closed Sunday — typical barbearia hours. */
export function defaultHours(): WeeklyHours {
  const closed = { open: null, close: null };
  const open = { open: 9 * 60, close: 19 * 60 };
  return [closed, open, open, open, open, open, { open: 9 * 60, close: 18 * 60 }];
}
