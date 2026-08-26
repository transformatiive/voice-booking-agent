import { describe, expect, it } from "vitest";
import { parseMessage } from "../src/agent/nlu.js";

// Fixed reference date: Wednesday, Aug 26, 2026, 09:00 local.
const REF = new Date(2026, 7, 26, 9, 0, 0);

describe("parseMessage", () => {
  it("detects a booking intent with service and time", () => {
    const parsed = parseMessage("Book a haircut tomorrow at 3pm", REF);
    expect(parsed.intent).toBe("book");
    expect(parsed.service).toBe("haircut");
    expect(parsed.dateTime).not.toBeNull();
    expect(parsed.dateOnly).toBe(false);
    const dt = new Date(parsed.dateTime!);
    expect(dt.getDate()).toBe(27);
    expect(dt.getHours()).toBe(15);
  });

  it("infers book intent from a bare service word", () => {
    const parsed = parseMessage("I'd like a massage", REF);
    expect(parsed.intent).toBe("book");
    expect(parsed.service).toBe("massage");
  });

  it("prefers the longest service alias match", () => {
    const parsed = parseMessage("I want hair coloring please", REF);
    expect(parsed.service).toBe("hair_coloring");
  });

  it("flags date-only messages", () => {
    const parsed = parseMessage("Is Friday free for a manicure?", REF);
    expect(parsed.service).toBe("manicure");
    expect(parsed.dateTime).not.toBeNull();
    expect(parsed.dateOnly).toBe(true);
  });

  it("recognizes greetings, help, and services queries", () => {
    expect(parseMessage("hello there", REF).intent).toBe("greeting");
    expect(parseMessage("help", REF).intent).toBe("help");
    expect(parseMessage("what services do you offer?", REF).intent).toBe("list_services");
  });

  it("recognizes list, cancel, and availability intents", () => {
    expect(parseMessage("show my appointments", REF).intent).toBe("list_bookings");
    expect(parseMessage("cancel my haircut", REF).intent).toBe("cancel");
    expect(parseMessage("what times are available?", REF).intent).toBe("check_availability");
  });

  it("extracts a customer name", () => {
    expect(parseMessage("my name is Alice", REF).customerName).toBe("Alice");
    expect(parseMessage("book it for John Smith", REF).customerName).toBe("John Smith");
  });

  it("treats short yes/no as affirm/deny", () => {
    expect(parseMessage("yes", REF).intent).toBe("affirm");
    expect(parseMessage("no", REF).intent).toBe("deny");
  });
});
