import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { EventEmitter } from "node:events";
import express from "express";
import { WebSocket } from "ws";
import { DEMO_PICKER_SLUG } from "../src/telephony/demoDid.js";
import {
  LIVE_MEDIA_PATH,
  LIVE_MEDIA_USER_AGENT,
  attachLiveMedia,
  completedFunctionCallFromDelegatedEvent,
  formatLiveErrorEvent,
  liveInboundLogLine,
  sessionConfigForLiveMedia,
  spokenCueAfterTool,
} from "../src/telephony/liveMedia.js";
import { LIVE_VOICE_MODEL, buildDemoPickerLiveSessionConfig } from "../src/telephony/gptLive.js";
import { demoVerticalReadyResult } from "../src/telephony/voice.js";
import { app } from "../src/server.js";
import { tempStore } from "./helpers.js";
import { ensureDemoBusinesses } from "../src/store/seed.js";

class MockOpenAiSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: unknown[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  emitJson(event: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return (server.address() as AddressInfo).port;
}

function pickerSession() {
  const store = tempStore();
  ensureDemoBusinesses(store);
  const businesses = [
    "clinica-central",
    "barbearia-lisboa",
    "restaurante-baixa",
    "oficina-norte",
    "imobiliaria-baixa",
  ].map((slug) => store.getBusinessBySlug(slug)!);
  return buildDemoPickerLiveSessionConfig(businesses);
}

describe("live-media WebSocket route", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  });

  it("answers GET /voice/live-media without Express 404", async () => {
    const server = createServer(app);
    servers.push(server);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}${LIVE_MEDIA_PATH}?slug=${DEMO_PICKER_SLUG}`);
    expect(res.status).toBe(426);
    expect(await res.text()).not.toMatch(/Cannot GET/i);
  });

  it("POST /voice/incoming for the demo DID streams live-media, never a Gather menu", async () => {
    const server = createServer(app);
    servers.push(server);
    const port = await listen(server);
    const res = await fetch(`http://127.0.0.1:${port}/voice/incoming`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "To=%2B351210210260&From=%2B351910000044",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/xml/);
    const xml = await res.text();
    expect(xml).toContain("<Stream");
    expect(xml).toContain(`${LIVE_MEDIA_PATH}?slug=${DEMO_PICKER_SLUG}`);
    expect(xml).not.toContain("<Gather");
    expect(xml).not.toContain("<Say");
  });

  it("accepts a Telnyx Stream WebSocket upgrade on /voice/live-media", async () => {
    const server = createServer(app);
    servers.push(server);
    const openai = new MockOpenAiSocket();
    attachLiveMedia(server, {
      openaiApiKey: "sk-test",
      sessionForSlug: () => ({
        slug: DEMO_PICKER_SLUG,
        agentName: "Atende",
        session: pickerSession(),
      }),
      handleTool: async () => ({ ok: true }),
      connectOpenAi: () => openai,
    });
    const port = await listen(server);
    const telnyx = new WebSocket(`ws://127.0.0.1:${port}${LIVE_MEDIA_PATH}?slug=${DEMO_PICKER_SLUG}`);
    sockets.push(telnyx);
    await new Promise<void>((resolve, reject) => {
      telnyx.once("open", () => resolve());
      telnyx.once("error", reject);
    });
    expect(telnyx.readyState).toBe(WebSocket.OPEN);
  });

  it("bridges Telnyx PCMU media to gpt-live-1 picker session and tools", async () => {
    const appLocal = express();
    const server = createServer(appLocal);
    servers.push(server);
    const openai = new MockOpenAiSocket();
    const tools: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    attachLiveMedia(server, {
      openaiApiKey: "sk-test",
      sessionForSlug: () => ({
        slug: DEMO_PICKER_SLUG,
        agentName: "Atende",
        session: pickerSession(),
      }),
      handleTool: async (call) => {
        tools.push(call);
        return { ok: true, slug: "oficina-norte", speak: "Olá, oficina." };
      },
      connectOpenAi: (url, init) => {
        expect(url).toBe("wss://api.openai.com/v1/live/sessions");
        expect(init.headers.Authorization).toBe("Bearer sk-test");
        expect(init.headers["User-Agent"]).toBe(LIVE_MEDIA_USER_AGENT);
        queueMicrotask(() => openai.emit("open"));
        return openai;
      },
    });
    const port = await listen(server);
    const telnyx = new WebSocket(`ws://127.0.0.1:${port}${LIVE_MEDIA_PATH}?slug=${DEMO_PICKER_SLUG}`);
    sockets.push(telnyx);
    await new Promise<void>((resolve, reject) => {
      telnyx.once("open", () => resolve());
      telnyx.once("error", reject);
    });

    telnyx.send(
      JSON.stringify({
        event: "start",
        start: {
          call_control_id: "v3:demo",
          from: "+351910000077",
          to: "+351210210260",
        },
        stream_id: "stream_demo",
      }),
    );

    await viWait(() => openai.sent.some((e) => (e as { type?: string }).type === "session.start"));
    const start = openai.sent.find((e) => (e as { type?: string }).type === "session.start") as {
      type: string;
      session: {
        model: string;
        instructions: string;
        audio: { format: { type: string; rate: number } };
        type?: string;
        delegation: { responses: { tools: Array<{ name: string }> } };
      };
    };
    expect(start.session.model).toBe(LIVE_VOICE_MODEL);
    expect(start.session.type).toBeUndefined();
    expect(start.session.audio.format).toEqual({ type: "audio/pcmu", rate: 8000 });
    expect(start.session.instructions).toMatch(/Apresenta-te como Atende/);
    expect(start.session.delegation.responses.tools.map((t) => t.name)[0]).toBe("select_demo_vertical");

    openai.emitJson({ type: "session.started", session: { id: "live_demo" } });
    await viWait(() => openai.sent.some((e) => (e as { type?: string }).type === "session.commentary.append"));

    telnyx.send(JSON.stringify({ event: "media", media: { payload: "qqqq" } }));
    await viWait(() =>
      openai.sent.some(
        (e) =>
          (e as { type?: string; audio?: string }).type === "session.input_audio.append" &&
          (e as { audio?: string }).audio === "qqqq",
      ),
    );

    const outbound = new Promise<string>((resolve) => {
      telnyx.once("message", (data) => resolve(String(data)));
    });
    openai.emitJson({ type: "session.output_audio.delta", delta: "zzzz" });
    const played = JSON.parse(await outbound) as { event: string; media: { payload: string } };
    expect(played).toEqual({ event: "media", media: { payload: "zzzz" } });

    openai.emitJson({
      type: "response.event",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          status: "completed",
          call_id: "call_1",
          name: "select_demo_vertical",
          arguments: JSON.stringify({ vertical: "4" }),
        },
      },
    });
    await viWait(() => tools.length === 1);
    expect(tools[0]).toEqual({ name: "select_demo_vertical", arguments: { vertical: "4" } });
    await viWait(() =>
      openai.sent.some((e) => (e as { type?: string }).type === "response.item.create") &&
      openai.sent.some((e) => (e as { type?: string }).type === "response.create"),
    );
    const afterTool = openai.sent.filter((e) => {
      const type = (e as { type?: string }).type;
      return type === "response.item.create" || type === "response.create" || type === "session.instructions.append";
    });
    expect(afterTool.map((e) => (e as { type: string }).type)).toEqual([
      "response.item.create",
      "response.create",
    ]);
    const toolOutput = openai.sent.find((e) => (e as { type?: string }).type === "response.item.create") as {
      item: { type: string; call_id: string; output: string };
    };
    expect(toolOutput.item.type).toBe("function_call_output");
    expect(toolOutput.item.call_id).toBe("call_1");
    expect(JSON.parse(toolOutput.item.output)).toEqual(
      expect.objectContaining({ ok: true, speak: "Olá, oficina." }),
    );
    expect(openai.sent.some((e) => (e as { type?: string }).type === "session.instructions.append")).toBe(false);
  });

  it("after select_demo_vertical, continues speech then accepts the next booking tool turn", async () => {
    const appLocal = express();
    const server = createServer(appLocal);
    servers.push(server);
    const openai = new MockOpenAiSocket();
    const tools: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    attachLiveMedia(server, {
      openaiApiKey: "sk-test",
      sessionForSlug: () => ({
        slug: DEMO_PICKER_SLUG,
        agentName: "Atende",
        session: pickerSession(),
      }),
      handleTool: async (call) => {
        tools.push(call);
        if (call.name === "select_demo_vertical") {
          return { ok: true, slug: "oficina-norte", speak: "Olá, oficina." };
        }
        return { ok: true, slots: ["2026-08-27T10:00:00.000Z"], message: "Tenho vaga às 10h." };
      },
      connectOpenAi: () => {
        queueMicrotask(() => openai.emit("open"));
        return openai;
      },
    });
    const port = await listen(server);
    const telnyx = new WebSocket(`ws://127.0.0.1:${port}${LIVE_MEDIA_PATH}?slug=${DEMO_PICKER_SLUG}`);
    sockets.push(telnyx);
    await new Promise<void>((resolve, reject) => {
      telnyx.once("open", () => resolve());
      telnyx.once("error", reject);
    });
    telnyx.send(
      JSON.stringify({
        event: "start",
        start: { call_control_id: "v3:demo2", from: "+351910000088" },
      }),
    );
    await viWait(() => openai.sent.some((e) => (e as { type?: string }).type === "session.start"));
    openai.emitJson({ type: "session.started", session: { id: "live_demo2" } });
    openai.emitJson({
      type: "response.event",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          status: "completed",
          call_id: "call_vertical",
          name: "select_demo_vertical",
          arguments: { vertical: "oficina" },
        },
      },
    });
    await viWait(() => tools.some((t) => t.name === "select_demo_vertical"));
    await viWait(() =>
      openai.sent.some((e) => {
        if ((e as { type?: string }).type !== "response.item.create") return false;
        const item = (e as { item?: { call_id?: string; output?: string } }).item;
        return item?.call_id === "call_vertical" && Boolean(item.output?.includes("Olá, oficina"));
      }),
    );
    expect(openai.sent.some((e) => (e as { type?: string }).type === "session.instructions.append")).toBe(false);

    openai.emitJson({
      type: "response.event",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          status: "completed",
          call_id: "call_slots",
          name: "get_slots",
          arguments: { service: "Revisão" },
        },
      },
    });
    await viWait(() => tools.some((t) => t.name === "get_slots"));
    await viWait(() =>
      openai.sent.filter((e) => (e as { type?: string }).type === "response.create").length >= 2,
    );
    const slotOutput = openai.sent.find((e) => {
      if ((e as { type?: string }).type !== "response.item.create") return false;
      const item = (e as { item?: { call_id?: string } }).item;
      return item?.call_id === "call_slots";
    }) as { item: { output: string } };
    expect(JSON.parse(slotOutput.item.output)).toEqual(
      expect.objectContaining({ ok: true, slots: ["2026-08-27T10:00:00.000Z"] }),
    );
  });

  it("does not continue the Responses backend on function_call_arguments.done", async () => {
    const appLocal = express();
    const server = createServer(appLocal);
    servers.push(server);
    const openai = new MockOpenAiSocket();
    const tools: Array<{ name: string }> = [];
    attachLiveMedia(server, {
      openaiApiKey: "sk-test",
      sessionForSlug: () => ({
        slug: DEMO_PICKER_SLUG,
        agentName: "Atende",
        session: pickerSession(),
      }),
      handleTool: async (call) => {
        tools.push(call);
        return { ok: true, speak: "Olá, Oficina Norte — quer Diagnóstico, Revisão ou Pneus?" };
      },
      connectOpenAi: () => {
        queueMicrotask(() => openai.emit("open"));
        return openai;
      },
    });
    const port = await listen(server);
    const telnyx = new WebSocket(`ws://127.0.0.1:${port}${LIVE_MEDIA_PATH}?slug=${DEMO_PICKER_SLUG}`);
    sockets.push(telnyx);
    await new Promise<void>((resolve, reject) => {
      telnyx.once("open", () => resolve());
      telnyx.once("error", reject);
    });
    telnyx.send(JSON.stringify({ event: "start", start: { call_control_id: "v3:args", from: "+351910000011" } }));
    await viWait(() => openai.sent.some((e) => (e as { type?: string }).type === "session.start"));
    openai.emitJson({ type: "session.started", session: { id: "live_args" } });
    await viWait(() => openai.sent.some((e) => (e as { type?: string }).type === "session.commentary.append"));
    const sentBefore = openai.sent.length;

    openai.emitJson({
      type: "response.event",
      event: {
        type: "response.function_call_arguments.done",
        call_id: "call_premature",
        name: "select_demo_vertical",
        arguments: JSON.stringify({ vertical: "oficina" }),
        item: {
          type: "function_call",
          status: "completed",
          call_id: "call_premature",
          id: "fc_premature",
          name: "select_demo_vertical",
          arguments: JSON.stringify({ vertical: "oficina" }),
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(tools).toEqual([]);
    expect(openai.sent.slice(sentBefore)).toEqual([]);
    expect(openai.sent.filter((e) => (e as { type?: string }).type === "response.create")).toHaveLength(0);

    openai.emitJson({
      type: "response.event",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          status: "completed",
          id: "fc_real",
          name: "select_demo_vertical",
          arguments: JSON.stringify({ vertical: "oficina" }),
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(tools).toEqual([]);
    expect(openai.sent.filter((e) => (e as { type?: string }).type === "response.create")).toHaveLength(0);

    openai.emitJson({
      type: "response.event",
      event: {
        type: "response.output_item.done",
        item: {
          type: "function_call",
          status: "completed",
          id: "fc_real",
          call_id: "call_real",
          name: "select_demo_vertical",
          arguments: JSON.stringify({ vertical: "oficina" }),
        },
      },
    });
    await viWait(() => tools.length === 1);
    await viWait(() => openai.sent.some((e) => (e as { type?: string }).type === "response.create"));
    const created = openai.sent.filter((e) => (e as { type?: string }).type === "response.item.create");
    expect(created).toHaveLength(1);
    expect((created[0] as { item: { call_id: string; output: string } }).item.call_id).toBe("call_real");
    expect(JSON.parse((created[0] as { item: { output: string } }).item.output).speak).toMatch(/Oficina Norte/);
    expect(openai.sent.filter((e) => (e as { type?: string }).type === "response.create")).toHaveLength(1);
    expect(openai.sent.filter((e) => (e as { type?: string }).type === "session.instructions.append")).toHaveLength(0);
  });
});

describe("sessionConfigForLiveMedia", () => {
  it("strips session.type and pins PCMU 8 kHz for Telnyx Stream", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const businesses = ["clinica-central", "barbearia-lisboa", "restaurante-baixa", "oficina-norte", "imobiliaria-baixa"].map(
      (slug) => store.getBusinessBySlug(slug)!,
    );
    const raw = buildDemoPickerLiveSessionConfig(businesses);
    const media = sessionConfigForLiveMedia(raw);
    expect(media.type).toBeUndefined();
    expect(media.model).toBe("gpt-live-1");
    expect((media.audio as { format: unknown }).format).toEqual({ type: "audio/pcmu", rate: 8000 });
    expect(JSON.stringify(media)).toMatch(/select_demo_vertical/);
  });
});

describe("spokenCueAfterTool", () => {
  it("turns select_demo_vertical speak into live commentary so the call continues", () => {
    expect(
      spokenCueAfterTool("select_demo_vertical", { ok: true, speak: "Olá, oficina." }),
    ).toBe("Olá, oficina.");
    expect(spokenCueAfterTool("get_slots", { message: "Tenho vaga às 10h." })).toBeUndefined();
    expect(spokenCueAfterTool("select_demo_vertical", {})).toMatch(/preparar o cenário/);
  });

  it("oficina ready result is an in-character greeting with real services", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const oficina = store.getBusinessBySlug("oficina-norte")!;
    const result = demoVerticalReadyResult(oficina);
    const cue = spokenCueAfterTool("select_demo_vertical", result);
    expect(cue).toMatch(/Oficina Norte/);
    expect(cue).toMatch(/diagnóstico/i);
    expect(cue).toMatch(/revisão/i);
    expect(cue).toMatch(/pneus/i);
    expect(cue).not.toMatch(/perfeito|preparar|Olá! Sou/i);
  });

  it("restaurante ready result greets as the restaurant and asks party size", () => {
    const store = tempStore();
    ensureDemoBusinesses(store);
    const restaurante = store.getBusinessBySlug("restaurante-baixa")!;
    const result = demoVerticalReadyResult(restaurante);
    const cue = spokenCueAfterTool("select_demo_vertical", result);
    expect(cue).toMatch(/Restaurante Baixa/);
    expect(cue).toMatch(/pessoas/i);
    expect(cue).toMatch(/2|duas|grupo/i);
    expect(cue).not.toMatch(/perfeito|preparar|Olá! Sou/i);
  });
});

describe("completedFunctionCallFromDelegatedEvent", () => {
  it("only accepts output_item.done with a real item.call_id", () => {
    expect(
      completedFunctionCallFromDelegatedEvent({
        type: "response.function_call_arguments.done",
        call_id: "call_premature",
        name: "select_demo_vertical",
        item: {
          type: "function_call",
          call_id: "call_premature",
          name: "select_demo_vertical",
          arguments: "{}",
        },
      }),
    ).toBeUndefined();
    expect(
      completedFunctionCallFromDelegatedEvent({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          id: "fc_1",
          name: "select_demo_vertical",
          arguments: "{}",
        },
      }),
    ).toBeUndefined();
    expect(
      completedFunctionCallFromDelegatedEvent({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "call_ok",
          name: "select_demo_vertical",
          arguments: JSON.stringify({ vertical: "4" }),
        },
      }),
    ).toEqual({ name: "select_demo_vertical", callId: "call_ok", arguments: { vertical: "4" } });
  });
});

describe("live inbound logging", () => {
  it("logs the full error object and non-audio event types", () => {
    const long = "x".repeat(500);
    const error = {
      type: "error",
      error: { type: "invalid_request_error", message: long, request_id: "live_u1_test.responses_websocket" },
    };
    const formatted = formatLiveErrorEvent(error);
    expect(formatted.length).toBeGreaterThan(400);
    expect(formatted).toContain(long);
    expect(formatted).toContain("responses_websocket");
    expect(liveInboundLogLine({ type: "session.output_audio.delta", delta: "zzzz" })).toBeUndefined();
    expect(liveInboundLogLine({ type: "session.input_audio.append", audio: "qqqq" })).toBeUndefined();
    expect(liveInboundLogLine({ type: "error", error: { message: long } })).toBe("error");
    expect(
      liveInboundLogLine({
        type: "response.event",
        event: { type: "response.output_item.done" },
      }),
    ).toBe("response.event response.output_item.done");
  });
});

function viWait(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("timed out waiting for live-media condition"));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}
