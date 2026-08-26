import { describe, expect, it } from "vitest";
import { BookingStore } from "../src/booking/store.js";
import { ConversationManager } from "../src/agent/conversation.js";

const NOW = new Date(2026, 7, 26, 9, 0, 0); // Wed Aug 26, 2026 09:00

function makeAgent() {
  const store = new BookingStore();
  const agent = new ConversationManager(store, () => NOW);
  return { store, agent };
}

describe("ConversationManager", () => {
  it("books an appointment through a full slot-filling conversation", () => {
    const { store, agent } = makeAgent();

    let reply = agent.handle("s1", "I'd like to book a haircut");
    expect(reply.reply.toLowerCase()).toContain("day and time");

    reply = agent.handle("s1", "tomorrow at 3pm");
    expect(reply.reply.toLowerCase()).toContain("name");

    reply = agent.handle("s1", "Alice");
    expect(reply.reply.toLowerCase()).toContain("confirm");

    reply = agent.handle("s1", "yes");
    expect(reply.booking).toBeDefined();
    expect(reply.booking?.serviceName).toBe("Haircut");
    expect(reply.booking?.customerName).toBe("Alice");

    const bookings = store.list();
    expect(bookings).toHaveLength(1);
    expect(new Date(bookings[0].start).getDate()).toBe(27);
    expect(new Date(bookings[0].start).getHours()).toBe(15);
  });

  it("books in a single utterance including name", () => {
    const { store, agent } = makeAgent();
    const reply = agent.handle("s2", "Book a massage for John Smith on Thursday at 2pm");
    expect(reply.reply.toLowerCase()).toContain("confirm");
    const confirm = agent.handle("s2", "yes please");
    expect(confirm.booking?.serviceName).toBe("Massage");
    expect(confirm.booking?.customerName).toBe("John Smith");
    expect(store.list()).toHaveLength(1);
  });

  it("refuses a Sunday and does not create a booking", () => {
    const { store, agent } = makeAgent();
    const reply = agent.handle("s3", "Book a haircut on Sunday at 10am");
    expect(reply.reply.toLowerCase()).toContain("closed on sundays");
    expect(store.list()).toHaveLength(0);
  });

  it("detects a conflicting slot", () => {
    const { store, agent } = makeAgent();
    store.create({ service: "haircut", customerName: null, start: new Date(2026, 7, 27, 15, 0, 0) });
    const reply = agent.handle("s4", "Book a haircut tomorrow at 3pm");
    expect(reply.reply.toLowerCase()).toContain("already booked");
    expect(store.list()).toHaveLength(1);
  });

  it("cancels a booking on request", () => {
    const { store, agent } = makeAgent();
    store.create({ service: "massage", customerName: "Dana", start: new Date(2026, 7, 27, 11, 0, 0) });
    const reply = agent.handle("s5", "cancel my massage");
    expect(reply.reply.toLowerCase()).toContain("cancelled");
    expect(store.list()).toHaveLength(0);
  });

  it("lists services and existing bookings", () => {
    const { store, agent } = makeAgent();
    expect(agent.handle("s6", "what services do you offer?").reply).toContain("Haircut");

    store.create({ service: "manicure", customerName: "Kim", start: new Date(2026, 7, 27, 13, 0, 0) });
    const listing = agent.handle("s6", "show my appointments");
    expect(listing.bookings).toHaveLength(1);
    expect(listing.reply).toContain("Manicure");
  });
});
