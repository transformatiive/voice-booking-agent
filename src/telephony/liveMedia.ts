import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { DEMO_PICKER_SLUG, LIVE_MEDIA_PATH } from "./demoDid.js";
import { parseToolArguments } from "./gptLive.js";

export { LIVE_MEDIA_PATH };

export const LIVE_MEDIA_USER_AGENT = "atende-voice-agents/Node";
export const OPENAI_LIVE_SESSIONS_WS = "wss://api.openai.com/v1/live/sessions";

export const LIVE_MEDIA_AUDIO_FORMAT = { type: "audio/pcmu", rate: 8000 } as const;

export type LiveSocket = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type LiveMediaToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type LiveMediaSession = {
  slug: string;
  agentName: string;
  session: Record<string, unknown>;
};

export type LiveMediaDeps = {
  openaiApiKey?: string;
  openaiLiveUrl?: string;
  sessionForSlug: (slug: string) => LiveMediaSession | undefined;
  handleTool: (
    call: LiveMediaToolCall,
    ctx: { slug: string; fromE164?: string; callSid?: string },
  ) => Promise<Record<string, unknown>>;
  connectOpenAi?: (url: string, init: { headers: Record<string, string> }) => LiveSocket;
};

/**
 * GPT-Live WebSocket session.start rejects `session.type` and has no playback-rate
 * knob. Pin PCMU 8 kHz so Telnyx TeXML `bidirectionalMode=rtp` can pass frames through.
 */
export function sessionConfigForLiveMedia(session: Record<string, unknown>): Record<string, unknown> {
  const audioIn =
    session.audio && typeof session.audio === "object" && !Array.isArray(session.audio)
      ? { ...(session.audio as Record<string, unknown>) }
      : {};
  const outputIn =
    audioIn.output && typeof audioIn.output === "object" && !Array.isArray(audioIn.output)
      ? { ...(audioIn.output as Record<string, unknown>) }
      : {};
  delete outputIn.speed;
  const rest = { ...session };
  delete rest.type;
  return {
    ...rest,
    audio: {
      ...audioIn,
      format: LIVE_MEDIA_AUDIO_FORMAT,
      output: outputIn,
    },
  };
}

export function attachLiveMedia(server: HttpServer, deps: LiveMediaDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (url.pathname !== LIVE_MEDIA_PATH) {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleLiveMediaConnection(ws, url, deps);
    });
  });
  return wss;
}

function handleLiveMediaConnection(telnyxWs: WebSocket, url: URL, deps: LiveMediaDeps): void {
  const slug = url.searchParams.get("slug")?.trim() || DEMO_PICKER_SLUG;
  if (!deps.openaiApiKey) {
    console.error(`[live-media ${slug}] OPENAI_API_KEY missing; closing Telnyx stream`);
    telnyxWs.close(1011, "gpt_live_not_configured");
    return;
  }
  const inbound = deps.sessionForSlug(slug);
  if (!inbound) {
    telnyxWs.close(1008, "unknown_slug");
    return;
  }

  const openaiUrl = deps.openaiLiveUrl ?? OPENAI_LIVE_SESSIONS_WS;
  const connect = deps.connectOpenAi ?? defaultConnectOpenAi;
  const openai = connect(openaiUrl, {
    headers: {
      Authorization: `Bearer ${deps.openaiApiKey}`,
      "User-Agent": LIVE_MEDIA_USER_AGENT,
    },
  });

  const bridge = new LiveMediaBridge({
    telnyxWs,
    openai,
    inbound,
    handleTool: deps.handleTool,
  });
  bridge.bind();
}

function defaultConnectOpenAi(url: string, init: { headers: Record<string, string> }): LiveSocket {
  return new WebSocket(url, { headers: init.headers }) as LiveSocket;
}

class LiveMediaBridge {
  private openaiOpen = false;
  private telnyxStarted = false;
  private sessionRequested = false;
  private sessionReady = false;
  private closed = false;
  private fromE164: string | undefined;
  private callSid: string | undefined;
  private readonly handledTools = new Set<string>();

  constructor(
    private readonly opts: {
      telnyxWs: WebSocket;
      openai: LiveSocket;
      inbound: LiveMediaSession;
      handleTool: LiveMediaDeps["handleTool"];
    },
  ) {}

  bind(): void {
    const { telnyxWs, openai } = this.opts;
    openai.on("open", () => {
      this.openaiOpen = true;
      this.maybeStartSession();
    });
    openai.on("message", (data: unknown) => {
      this.onOpenAiMessage(data);
    });
    openai.on("close", () => {
      this.closeBoth();
    });
    openai.on("error", (err: unknown) => {
      console.error(`[live-media ${this.opts.inbound.slug}] openai ws`, err instanceof Error ? err.message : err);
      this.closeBoth();
    });

    telnyxWs.on("message", (data) => {
      this.onTelnyxMessage(String(data));
    });
    telnyxWs.on("close", () => {
      this.closeBoth("caller");
    });
    telnyxWs.on("error", (err) => {
      console.error(`[live-media ${this.opts.inbound.slug}] telnyx ws`, err instanceof Error ? err.message : err);
    });
  }

  private maybeStartSession(): void {
    if (this.sessionRequested || !this.openaiOpen || !this.telnyxStarted) {
      return;
    }
    this.sessionRequested = true;
    this.sendOpenAi({
      type: "session.start",
      event_id: "event_start",
      session: sessionConfigForLiveMedia(this.opts.inbound.session),
    });
  }

  private onTelnyxMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    const message = parsed as Record<string, unknown>;
    const event = String(message.event ?? "");
    switch (event) {
      case "connected":
        return;
      case "start": {
        const start = message.start && typeof message.start === "object" ? (message.start as Record<string, unknown>) : {};
        this.callSid =
          stringField(start, "call_control_id") ??
          stringField(message, "stream_id") ??
          stringField(start, "call_session_id");
        this.fromE164 = stringField(start, "from");
        this.telnyxStarted = true;
        this.maybeStartSession();
        return;
      }
      case "media": {
        const media = message.media && typeof message.media === "object" ? (message.media as Record<string, unknown>) : {};
        const payload = media.payload;
        if (this.sessionReady && typeof payload === "string" && payload.length > 0) {
          this.sendOpenAi({ type: "session.input_audio.append", audio: payload });
        }
        return;
      }
      case "stop":
        this.closeBoth("stop");
        return;
      default:
        return;
    }
  }

  private onOpenAiMessage(data: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    const event = parsed as Record<string, unknown>;
    const type = String(event.type ?? "");
    switch (type) {
      case "session.started":
        this.sessionReady = true;
        this.sendOpenAi({
          type: "session.commentary.append",
          event_id: "greeting-go",
          delegation_id: null,
          content: "Começa agora a conversa, seguindo as instruções. Cumprimenta já.",
        });
        return;
      case "session.output_audio.delta": {
        const delta = typeof event.delta === "string" ? event.delta : undefined;
        if (delta) {
          this.sendTelnyx({ event: "media", media: { payload: delta } });
        }
        return;
      }
      case "response.event": {
        const inner = event.event && typeof event.event === "object" ? (event.event as Record<string, unknown>) : undefined;
        if (inner) {
          void this.onDelegatedEvent(inner);
        }
        return;
      }
      case "session.closed":
        this.closeBoth("openai");
        return;
      case "error":
        console.error(`[live-media ${this.opts.inbound.slug}] openai error`, JSON.stringify(event).slice(0, 400));
        return;
      default:
        return;
    }
  }

  private async onDelegatedEvent(inner: Record<string, unknown>): Promise<void> {
    const innerType = String(inner.type ?? "");
    if (innerType !== "response.output_item.done" && innerType !== "response.function_call_arguments.done") {
      return;
    }
    const item = inner.item && typeof inner.item === "object" ? (inner.item as Record<string, unknown>) : inner;
    if (String(item.type ?? "") !== "function_call") {
      return;
    }
    if (item.status && item.status !== "completed") {
      return;
    }
    const name = String(item.name ?? "");
    const callId = String(item.call_id ?? item.id ?? name);
    if (!name || this.handledTools.has(callId)) {
      return;
    }
    this.handledTools.add(callId);
    let output: Record<string, unknown>;
    try {
      output = await this.opts.handleTool(
        { name, arguments: parseToolArguments(item.arguments) },
        { slug: this.opts.inbound.slug, fromE164: this.fromE164, callSid: this.callSid },
      );
    } catch (err) {
      console.error(`[live-media ${this.opts.inbound.slug}] tool ${name}`, err instanceof Error ? err.message : err);
      output = {
        error: "tool_failed",
        instruction: "Continua a falar. Oferece uma hora próxima e pergunta se serve.",
      };
    }
    this.sendOpenAi({
      type: "response.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.sendOpenAi({ type: "response.create" });
    const spoken = spokenCueAfterTool(name, output);
    if (spoken) {
      this.sendOpenAi({
        type: "session.commentary.append",
        event_id: `tool-speak-${callId}`,
        delegation_id: null,
        content: spoken,
      });
    }
  }

  private sendOpenAi(event: Record<string, unknown>): void {
    if (this.opts.openai.readyState !== WebSocket.OPEN) {
      return;
    }
    this.opts.openai.send(JSON.stringify(event));
  }

  private sendTelnyx(event: Record<string, unknown>): void {
    if (this.opts.telnyxWs.readyState !== WebSocket.OPEN) {
      return;
    }
    this.opts.telnyxWs.send(JSON.stringify(event));
  }

  private closeBoth(reason = "close"): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.sessionRequested && this.opts.openai.readyState === WebSocket.OPEN) {
      this.sendOpenAi({ type: "session.close" });
    }
    try {
      this.opts.telnyxWs.close();
    } catch {
      /* already closed */
    }
    try {
      this.opts.openai.close();
    } catch {
      /* already closed */
    }
    console.log(`[live-media ${this.opts.inbound.slug}] closed (${reason})`);
  }
}

function stringField(rec: Record<string, unknown>, key: string): string | undefined {
  const value = rec[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * GPT-Live `response.create` continues the Responses backend; it does not make the
 * voice speak. After the demo picker locks a vertical, append commentary so the
 * caller hears the scenario opener instead of «a preparar o cenário».
 */
export function spokenCueAfterTool(name: string, output: Record<string, unknown>): string | undefined {
  if (name !== "select_demo_vertical") {
    return undefined;
  }
  const speak = stringField(output, "speak") ?? stringField(output, "message");
  if (speak) {
    return speak;
  }
  const instruction = stringField(output, "instruction");
  if (instruction) {
    return instruction;
  }
  return "A opção está confirmada. Fala já como a recepção desse negócio. Não digas que estás a preparar o cenário.";
}
