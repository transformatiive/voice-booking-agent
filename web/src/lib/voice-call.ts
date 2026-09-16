export type VoicePhase = "idle" | "connecting" | "live" | "ended" | "blocked";

export interface VoiceSessionOptions {
  slug: string;
  locale?: "pt" | "en";
  agentName?: string;
  gptLive?: boolean;
  onPhase?: (phase: VoicePhase) => void;
  onCaption?: (speaker: string, text: string) => void;
  onBooked?: () => void;
}

const TOOL_TIMEOUT_MS = 2500;

function copyFor(locale: string, agentName: string) {
  if (locale === "en") {
    return {
      connecting: "Calling…",
      openingMic: `Allow the microphone so ${agentName} can hear you.`,
      speakNow: "Listening — speak now",
      you: "You",
      thinking: "One moment…",
      endedCaption: "Call ended. Tap to call again.",
      call: "Start call",
      hangup: "Hang up",
      error: "I couldn't reach the assistant. Try again.",
      notConfigured: "Voice demo is not configured in this environment.",
      micBlocked: `The browser blocked the microphone. Allow access in site settings — without it ${agentName} cannot hear you.`,
      micMissing: "No microphone was found on this device.",
      micBusy: "The microphone is in use by another app. Close it and try again.",
      micHttps: "The microphone only works over HTTPS. Open the secure site address.",
      micUnsupported: "This browser cannot capture the microphone.",
      micGeneric: "Could not open the microphone. Check permissions and try again.",
      idleCaption: "Tap Start call or dial +351 21 021 0260.",
    };
  }
  return {
    connecting: "A ligar…",
    openingMic: `Permita o microfone para o ${agentName} o ouvir.`,
    speakNow: "A ouvir — fale agora",
    you: "Você",
    thinking: "Um momento…",
    endedCaption: "Chamada terminada. Toque para ligar novamente.",
    call: "Iniciar chamada",
    hangup: "Terminar",
    error: "Não consegui contactar o assistente. Tente outra vez.",
    notConfigured: "A demo de voz não está configurada neste ambiente.",
    micBlocked: `O browser bloqueou o microfone. Permita o acesso nas definições do site — sem microfone o ${agentName} não o ouve.`,
    micMissing: "Não encontrámos um microfone neste dispositivo.",
    micBusy: "O microfone está ocupado por outra aplicação. Feche-a e tente de novo.",
    micHttps: "O microfone só funciona em HTTPS. Abra o site pelo endereço seguro.",
    micUnsupported: "Este browser não permite capturar o microfone.",
    micGeneric: "Não foi possível ligar o microfone. Verifique as permissões e tente de novo.",
    idleCaption: "Toque em Iniciar chamada ou ligue 21 021 0260.",
  };
}

function micErrorMessage(err: unknown, t: ReturnType<typeof copyFor>): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    return t.micHttps;
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return t.micUnsupported;
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return t.micBlocked;
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return t.micMissing;
  if (name === "NotReadableError" || name === "TrackStartError") return t.micBusy;
  if (name === "SecurityError") return t.micHttps;
  return t.micGeneric;
}

async function flushPendingTools(
  pendingTools: Map<string, string>,
  sendEvent: (payload: Record<string, unknown>) => void,
) {
  if (pendingTools.size) return;
  sendEvent({ type: "response.create" });
}

export class VoiceSession {
  slug: string;
  locale: "pt" | "en";
  agentName: string;
  gptLive: boolean;
  phase: VoicePhase = "idle";
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private pendingTools = new Map<string, string>();
  private hangTimer: number | null = null;
  private onPhase?: (phase: VoicePhase) => void;
  private onCaption?: (speaker: string, text: string) => void;
  private onBooked?: () => void;

  constructor(options: VoiceSessionOptions) {
    this.slug = options.slug;
    this.locale = options.locale ?? "pt";
    this.agentName = options.agentName ?? "Atende";
    this.gptLive = Boolean(options.gptLive);
    this.onPhase = options.onPhase;
    this.onCaption = options.onCaption;
    this.onBooked = options.onBooked;
  }

  copy() {
    return copyFor(this.locale, this.agentName);
  }

  setSlug(slug: string) {
    this.slug = slug;
  }

  setGptLive(enabled: boolean) {
    this.gptLive = enabled;
    if (!enabled && this.phase === "idle") {
      this.setPhase("blocked");
      this.onCaption?.(this.agentName, this.copy().notConfigured);
    }
  }

  private setPhase(next: VoicePhase) {
    this.phase = next;
    this.onPhase?.(next);
  }

  private sendEvent(payload: Record<string, unknown>) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify(payload));
  }

  private async waitIce(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const done = () => {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === "complete") done();
      };
      pc.addEventListener("icegatheringstatechange", onChange);
      window.setTimeout(done, 2500);
    });
  }

  private async runTool(item: { call_id?: string; name?: string; arguments?: unknown }) {
    const callId = String(item.call_id ?? "");
    const name = String(item.name ?? "");
    this.pendingTools.set(callId, name);
    this.onCaption?.(this.agentName, this.copy().thinking);
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
    let output: Record<string, unknown> = { error: "tool_failed" };
    try {
      const res = await fetch(`/api/business/${this.slug}/realtime/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: item.arguments ?? {} }),
        signal: controller.signal,
      });
      output = (await res.json()) as Record<string, unknown>;
    } catch {
      output = {
        error: "tool_timeout",
        instruction:
          this.locale === "en"
            ? "Do not stall. Offer a nearby time and ask if it works."
            : "Não fiques em silêncio. Oferece uma hora próxima e pergunta se serve.",
      };
    } finally {
      window.clearTimeout(abortTimer);
    }
    this.sendEvent({
      type: "response.item.create",
      event_id: crypto.randomUUID(),
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    this.pendingTools.delete(callId);
    if (output.ok === true || output.bookingId) this.onBooked?.();
    await flushPendingTools(this.pendingTools, (payload) => this.sendEvent(payload));
  }

  private handleLiveEvent(raw: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = String(event.type ?? "");
    if (type === "session.started") {
      const greeting = String(event.greeting ?? "");
      if (greeting) {
        this.sendEvent({
          type: "session.commentary.append",
          text: greeting,
        });
      }
      return;
    }
    const nested = event.event as Record<string, unknown> | undefined;
    const item = (event.item ?? nested?.item ?? event) as Record<string, unknown>;
    if (
      (type === "response.output_item.done" || type === "response.event" || nested?.type === "response.output_item.done") &&
      (item.type === "function_call" || nested?.type === "function_call")
    ) {
      void this.runTool(item);
    }
    if (type === "response.output_audio_transcript.delta" && typeof event.delta === "string") {
      this.onCaption?.(this.agentName, event.delta);
    }
  }

  async startCall() {
    if (!this.gptLive) {
      this.setPhase("blocked");
      this.onCaption?.(this.agentName, this.copy().notConfigured);
      return;
    }
    const t = this.copy();
    this.setPhase("connecting");
    this.onCaption?.(this.agentName, t.openingMic);
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      this.setPhase("ended");
      this.onCaption?.(this.agentName, micErrorMessage(err, t));
      return;
    }
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.mic.getTracks().forEach((track) => pc.addTrack(track, this.mic!));
    pc.ontrack = (ev) => {
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
        this.remoteAudio.autoplay = true;
      }
      this.remoteAudio.srcObject = ev.streams[0] ?? null;
    };
    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onmessage = (ev) => this.handleLiveEvent(String(ev.data));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitIce(pc);
    const sdp = pc.localDescription?.sdp ?? "";
    const res = await fetch(`/api/business/${this.slug}/realtime/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp }),
    });
    const body = (await res.json()) as { sdp?: string; greeting?: string; error?: string; message?: string };
    if (!res.ok || !body.sdp) {
      this.onCaption?.(this.agentName, body.message || t.error);
      await this.hangup();
      this.setPhase(res.status === 503 ? "blocked" : "ended");
      return;
    }
    await pc.setRemoteDescription({ type: "answer", sdp: body.sdp });
    this.setPhase("live");
    this.onCaption?.(this.agentName, body.greeting || t.speakNow);
    this.hangTimer = window.setTimeout(() => {
      void this.hangup();
    }, 15 * 60 * 1000);
  }

  async hangup() {
    if (this.hangTimer) {
      window.clearTimeout(this.hangTimer);
      this.hangTimer = null;
    }
    this.sendEvent({ type: "session.close" });
    this.dc?.close();
    this.pc?.close();
    this.mic?.getTracks().forEach((track) => track.stop());
    this.dc = null;
    this.pc = null;
    this.mic = null;
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
    }
    this.pendingTools.clear();
    if (this.phase === "live" || this.phase === "connecting") {
      this.setPhase("ended");
      this.onCaption?.(this.agentName, this.copy().endedCaption);
    }
  }
}

export function createVoiceSession(options: VoiceSessionOptions) {
  return new VoiceSession(options);
}
