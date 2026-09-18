import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { DEMO_PICKER_SLUG, LIVE_MEDIA_PATH, rememberDemoVerticalFromTranscript } from "./demoDid.js";
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
  private inputTranscript = "";
  private outputTranscript = "";

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
    if (type === "error") {
      console.error(`[live-media ${this.opts.inbound.slug}] openai error`, formatLiveErrorEvent(event));
    } else {
      const line = liveInboundLogLine(event);
      if (line) {
        console.log(`[live-media ${this.opts.inbound.slug}] openai event ${line}`);
      }
    }
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
      case "session.input_transcript.delta":
      case "session.output_transcript.delta": {
        const delta = typeof event.delta === "string" ? event.delta : undefined;
        if (delta) {
          const source = type === "session.input_transcript.delta" ? "input" : "output";
          if (source === "input") {
            this.inputTranscript += ` ${delta}`;
          } else {
            this.outputTranscript += ` ${delta}`;
          }
          rememberDemoVerticalFromTranscript({
            text: source === "input" ? this.inputTranscript : this.outputTranscript,
            fromE164: this.fromE164,
            callSid: this.callSid,
            source,
          });
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
        return;
      default:
        return;
    }
  }

  private async onDelegatedEvent(inner: Record<string, unknown>): Promise<void> {
    const call = completedFunctionCallFromDelegatedEvent(inner);
    if (!call) {
      if (
        String(inner.type ?? "") === "response.output_item.done" &&
        inner.item &&
        typeof inner.item === "object" &&
        !Array.isArray(inner.item) &&
        String((inner.item as Record<string, unknown>).type ?? "") === "function_call"
      ) {
        console.error(
          `[live-media ${this.opts.inbound.slug}] skip function_call without item.call_id`,
          formatLiveErrorEvent(inner),
        );
      }
      return;
    }
    if (this.handledTools.has(call.callId)) {
      return;
    }
    this.handledTools.add(call.callId);
    let output: Record<string, unknown>;
    try {
      output = await this.opts.handleTool(
        { name: call.name, arguments: call.arguments },
        { slug: this.opts.inbound.slug, fromE164: this.fromE164, callSid: this.callSid },
      );
    } catch (err) {
      console.error(`[live-media ${this.opts.inbound.slug}] tool ${call.name}`, err instanceof Error ? err.message : err);
      output = {
        error: "tool_failed",
        instruction: "Continua a falar. Oferece uma hora próxima e pergunta se serve.",
      };
    }
    this.sendOpenAi({
      type: "response.item.create",
      event_id: `tool-out-${call.callId}`,
      item: {
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(output),
      },
    });
    const spoken = speakableToolSentence(output);
    if (spoken) {
      // Docs (live-delegation, live-migration): session.commentary.append is the
      // event that asks the live model to speak; it paraphrases (not verbatim).
      // response.create continues Responses work and does not authorize speech.
      this.sendOpenAi({
        type: "session.commentary.append",
        event_id: `tool-speak-${call.callId}`,
        delegation_id: null,
        content: spoken,
      });
    }
    this.sendOpenAi({ type: "response.create", event_id: `tool-continue-${call.callId}` });
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

const AUDIO_EVENT_TYPES = new Set([
  "session.output_audio.delta",
  "session.input_audio.append",
  "session.input_transcript.delta",
  "session.output_transcript.delta",
]);

/** Full error payload — production sliced this at 400 chars and hid the Responses cause. */
export function formatLiveErrorEvent(event: Record<string, unknown>): string {
  return JSON.stringify(event);
}

/** Inbound GPT-Live event type for logs. Omits audio payloads. */
export function liveInboundLogLine(event: Record<string, unknown>): string | undefined {
  const type = String(event.type ?? "");
  if (AUDIO_EVENT_TYPES.has(type)) {
    return undefined;
  }
  if (type === "response.event") {
    const inner = event.event && typeof event.event === "object" ? (event.event as Record<string, unknown>) : undefined;
    const innerType = inner ? String(inner.type ?? "") : "";
    return innerType ? `response.event ${innerType}` : "response.event";
  }
  return type || undefined;
}

export type CompletedLiveFunctionCall = {
  name: string;
  callId: string;
  arguments: Record<string, unknown>;
};

/**
 * Docs: read completed calls from nested `response.output_item.done` only.
 * `response.function_call_arguments.done` is not sufficient. Require `item.call_id`
 * — never `item.id` or the tool name — or Responses returns invalid_request_error.
 */
export function completedFunctionCallFromDelegatedEvent(
  inner: Record<string, unknown>,
): CompletedLiveFunctionCall | undefined {
  if (String(inner.type ?? "") !== "response.output_item.done") {
    return undefined;
  }
  const item = inner.item;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const rec = item as Record<string, unknown>;
  if (String(rec.type ?? "") !== "function_call") {
    return undefined;
  }
  if (rec.status && rec.status !== "completed") {
    return undefined;
  }
  const name = stringField(rec, "name");
  const callId = stringField(rec, "call_id");
  if (!name || !callId) {
    return undefined;
  }
  return { name, callId, arguments: parseToolArguments(rec.arguments) };
}

/** Short sentence from a booking tool result, for session.commentary.append. */
export function speakableToolSentence(output: Record<string, unknown>): string | undefined {
  return stringField(output, "speak") ?? stringField(output, "message");
}
