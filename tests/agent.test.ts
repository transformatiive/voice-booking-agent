import { describe, expect, it } from "vitest";
import { ConversationManager, greeting } from "../src/agent/conversation.js";
import { InMemoryScheduler } from "../src/scheduling/inMemoryScheduler.js";
import { parseMessage } from "../src/agent/nlu.js";
import { tempStore } from "./helpers.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0); // Wed 26 Aug 2026 09:00

function makeAgent(locale: "pt" | "en" = "pt") {
  const store = tempStore();
  const business = store.createBusiness({
    name: "Barbearia Teste",
    useCase: "barbearia",
    locale,
    agentName: "Sofia",
    agentGender: "feminino",
    planId: "base",
  });
  const scheduler = new InMemoryScheduler(store, () => NOW);
  const agent = new ConversationManager(store, scheduler, () => NOW);
  return { store, business, agent };
}

describe("nlu (PT)", () => {
  it("parses a booking with service and time", () => {
    const { business } = makeAgent();
    const parsed = parseMessage(business, "Quero marcar um corte de cabelo amanhã às 15:00", NOW);
    expect(parsed.intent).toBe("book");
    expect(parsed.serviceId).not.toBeNull();
    expect(parsed.dateTime).not.toBeNull();
    expect(parsed.dateOnly).toBe(false);
    const dt = new Date(parsed.dateTime!);
    expect(dt.getDate()).toBe(27);
    expect(dt.getHours()).toBe(15);
  });

  it("recognizes services, availability, cancel and greeting intents", () => {
    const { business } = makeAgent();
    expect(parseMessage(business, "olá", NOW).intent).toBe("greeting");
    expect(parseMessage(business, "que serviços têm?", NOW).intent).toBe("list_services");
    expect(parseMessage(business, "têm disponibilidade sexta?", NOW).intent).toBe("check_availability");
    expect(parseMessage(business, "quero cancelar", NOW).intent).toBe("cancel");
  });

  it("extracts a name in Portuguese", () => {
    const { business } = makeAgent();
    expect(parseMessage(business, "chamo-me Ana", NOW).customerName).toBe("Ana");
  });
});

describe("ConversationManager (PT)", () => {
  it("books through a slot-filling conversation", async () => {
    const { store, business, agent } = makeAgent();

    let reply = await agent.handle(business, "s1", "Quero marcar um corte de cabelo");
    expect(reply.reply.toLowerCase()).toContain("dia e hora");

    reply = await agent.handle(business, "s1", "amanhã às 15:00");
    expect(reply.reply.toLowerCase()).toContain("nome");

    reply = await agent.handle(business, "s1", "Chamo-me Ana");
    expect(reply.reply.toLowerCase()).toContain("confirmar");

    reply = await agent.handle(business, "s1", "sim");
    expect(reply.booking).toBeDefined();
    expect(reply.booking?.customerName).toBe("Ana");

    const bookings = store.listBookings(business.id);
    expect(bookings).toHaveLength(1);
    expect(new Date(bookings[0].start).getDate()).toBe(27);
    expect(new Date(bookings[0].start).getHours()).toBe(15);
  });

  it("refuses a closed Sunday", async () => {
    const { store, business, agent } = makeAgent();
    const reply = await agent.handle(business, "s2", "marcar corte no domingo às 11:00");
    expect(reply.reply.toLowerCase()).toContain("fechados");
    expect(store.listBookings(business.id)).toHaveLength(0);
  });

  it("reset drops an in-progress booking so a new call starts fresh", async () => {
    const { agent, business } = makeAgent();
    await agent.handle(business, "s-reset", "Quero marcar um corte de cabelo");
    agent.reset("s-reset");
    const reply = await agent.handle(business, "s-reset", "amanhã às 15:00");
    expect(reply.booking).toBeUndefined();
    expect(reply.reply.toLowerCase()).toMatch(/serviço|pretende/);
  });

  it("help copy stays general, not barber-specific", async () => {
    const { agent, business } = makeAgent();
    const reply = await agent.handle(business, "s-help", "ajuda");
    expect(reply.reply).toContain("Marcar amanhã às 15h");
    expect(reply.reply).not.toMatch(/corte|barbeiro|haircut/i);
  });

  it("cancels an existing booking", async () => {
    const { store, business, agent } = makeAgent();
    await agent.handle(business, "s3", "marcar corte amanhã às 10:00 em nome de Rui");
    await agent.handle(business, "s3", "sim");
    expect(store.listBookings(business.id)).toHaveLength(1);
    const reply = await agent.handle(business, "s3", "cancelar o corte");
    expect(reply.reply.toLowerCase()).toContain("cancelei");
    expect(store.listBookings(business.id)).toHaveLength(0);
  });

  it("keeps barbearia-specific greeting for a barbearia tenant", () => {
    const { business } = makeAgent();
    expect(greeting(business)).toContain("ida à barbearia");
  });
});
