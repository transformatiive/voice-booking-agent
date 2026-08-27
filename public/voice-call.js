/**
 * Shared Grok Live 2 speech-to-speech client for the homepage card and /demo.
 * Captures the microphone immediately on the user gesture, streams PCM16 @ 24 kHz
 * over the Realtime WebSocket, and never pretends to listen if getUserMedia fails.
 */
(function (global) {
  const TARGET_RATE = 24000;

  const MIC_WORKLET = `
class AtendeMicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._n = 0;
    this._target = 2400;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      this._buf.push(Float32Array.from(ch));
      this._n += ch.length;
      if (this._n >= this._target) {
        const out = new Float32Array(this._n);
        let o = 0;
        for (const c of this._buf) { out.set(c, o); o += c.length; }
        this.port.postMessage(out);
        this._buf = [];
        this._n = 0;
      }
    }
    return true;
  }
}
registerProcessor("atende-mic-capture", AtendeMicCapture);
`;

  function copyFor(locale) {
    if (locale === "en") {
      return {
        ready: "READY TO CALL",
        live: "LIVE CALL",
        ended: "CALL ENDED",
        blocked: "VOICE NOT CONFIGURED",
        connecting: "Calling…",
        openingMic: "Allow the microphone so Sofia can hear you.",
        speakNow: "Listening — speak now",
        you: "You",
        voiceCall: "Voice call",
        thinking: "One moment…",
        endedCaption: "Call ended. Tap to call again.",
        call: "Start call",
        callAgain: "Call again",
        hangup: "Hang up",
        talk: "Microphone on",
        error: "I couldn't reach the assistant. Try again.",
        notConfigured: "Grok voice is not configured in this environment.",
        micBlocked: "The browser blocked the microphone. Allow access in site settings — without it Sofia cannot hear you.",
        micMissing: "No microphone was found on this device.",
        micBusy: "The microphone is in use by another app. Close it and try again.",
        micHttps: "The microphone only works over HTTPS. Open the secure site address.",
        micUnsupported: "This browser cannot capture the microphone.",
        micGeneric: "Could not open the microphone. Check permissions and try again.",
        micSilent: "Microphone is open but sending silence. Check that it is not muted in the system.",
        fallbackHint: "Fallback if the microphone isn't available — what you would say on the phone:",
        noBookings: "No appointments.",
        idleCaption: "Tap Start call. Sofia answers on Grok Live 2 — speak, don't type.",
      };
    }
    return {
      ready: "PRONTO A LIGAR",
      live: "CHAMADA AO VIVO",
      ended: "CHAMADA TERMINADA",
      blocked: "VOZ NÃO CONFIGURADA",
      connecting: "A ligar…",
      openingMic: "Permita o microfone para a Sofia o ouvir.",
      speakNow: "A ouvir — fale agora",
      you: "Você",
      voiceCall: "Chamada de voz",
      thinking: "Um momento…",
      endedCaption: "Chamada terminada. Toque para ligar novamente.",
      call: "Iniciar chamada",
      callAgain: "Ligar novamente",
      hangup: "Terminar",
      talk: "Microfone ligado",
      error: "Não consegui contactar o assistente. Tente outra vez.",
      notConfigured: "A voz Grok não está configurada neste ambiente.",
      micBlocked: "O browser bloqueou o microfone. Permita o acesso nas definições do site — sem microfone a Sofia não o ouve.",
      micMissing: "Não encontrámos um microfone neste dispositivo.",
      micBusy: "O microfone está ocupado por outra aplicação. Feche-a e tente de novo.",
      micHttps: "O microfone só funciona em HTTPS. Abra o site pelo endereço seguro.",
      micUnsupported: "Este browser não permite capturar o microfone.",
      micGeneric: "Não foi possível ligar o microfone. Verifique as permissões e tente de novo.",
      micSilent: "O microfone está aberto mas a enviar silêncio. Confirme que não está mudo no sistema.",
      fallbackHint: "Recurso se o microfone não estiver disponível — o que diria ao telefone:",
      noBookings: "Sem marcações.",
      idleCaption: "Toque em Iniciar chamada. A Sofia atende com Grok Live 2 — fale, não escreva.",
    };
  }

  function micErrorMessage(err, t) {
    const name = err && err.name;
    if (!global.isSecureContext && global.location && global.location.hostname !== "localhost" && global.location.hostname !== "127.0.0.1") {
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

  function floatTo16BitPCM(float32) {
    const buf = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < float32.length; i += 1) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToInt16(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function resample(float32, fromRate, toRate) {
    if (fromRate === toRate) return float32;
    const ratio = fromRate / toRate;
    const outLen = Math.max(1, Math.round(float32.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i += 1) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, float32.length - 1);
      const frac = src - i0;
      out[i] = float32[i0] * (1 - frac) + float32[i1] * frac;
    }
    return out;
  }

  function peak(float32) {
    let m = 0;
    for (let i = 0; i < float32.length; i += 1) {
      const a = Math.abs(float32[i]);
      if (a > m) m = a;
    }
    return m;
  }

  function createPlayer(ctx, inputRate) {
    let next = 0;
    return {
      playing() {
        return ctx.currentTime < next - 0.04;
      },
      pushInt16(int16) {
        if (!int16.length) return;
        const f32src = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i += 1) f32src[i] = int16[i] / 32768;
        const f32 = resample(f32src, inputRate, ctx.sampleRate);
        const buf = ctx.createBuffer(1, f32.length, ctx.sampleRate);
        buf.getChannelData(0).set(f32);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const now = ctx.currentTime;
        if (next < now) next = now;
        src.start(next);
        next += buf.duration;
      },
      stop() {
        next = 0;
      },
    };
  }

  function createAudioContext() {
    const Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    try {
      return new Ctor({ sampleRate: TARGET_RATE });
    } catch {
      return new Ctor();
    }
  }

  function fmtTimer(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function buildWave(el) {
    if (!el) return;
    el.innerHTML = "";
    for (let i = 0; i < 28; i += 1) {
      const bar = document.createElement("i");
      bar.style.animationDelay = `${(i * 0.045).toFixed(2)}s`;
      bar.style.animationDuration = `${(0.8 + Math.random() * 0.7).toFixed(2)}s`;
      el.appendChild(bar);
    }
  }

  function create(config) {
    const els = config.els || {};
    const ui = config.ui || {};
    let slug = config.slug || "";
    let locale = config.locale || "pt";
    let agentName = ui.agentName || "Sofia";
    let grokVoiceEnabled = false;
    let phase = "idle";
    let muted = false;
    let streaming = false;
    let startedAt = 0;
    let timerId = null;
    let ws = null;
    let audioCtx = null;
    let micStream = null;
    let captureNode = null;
    let captureSource = null;
    let silentGain = null;
    let player = null;
    let sampleRate = TARGET_RATE;
    let pendingGreeting = "";
    let greeted = false;
    let pendingTools = new Map();
    let assistantBuf = "";
    let callGeneration = 0;
    let earlyAudio = [];
    let heardInput = false;
    let workletUrl = null;
    let readyResolve = () => {};
    const ready = new Promise((resolve) => { readyResolve = resolve; });

    function t() {
      const base = copyFor(locale);
      if (ui.startLabel) base.call = ui.startLabel;
      if (ui.callAgainLabel) base.callAgain = ui.callAgainLabel;
      return base;
    }

    function setMicError(message) {
      if (!els.micErr) return;
      if (message) {
        els.micErr.hidden = false;
        els.micErr.textContent = message;
      } else {
        els.micErr.hidden = true;
        els.micErr.textContent = "";
      }
    }

    function setCaption(speaker, text) {
      if (els.spk) els.spk.textContent = speaker;
      if (els.txt) els.txt.textContent = text;
    }

    function setWave(mode) {
      if (!els.wave) return;
      els.wave.className = `waveform ${mode}`;
    }

    function liveLabelFor(next) {
      const c = t();
      if (ui.keepLiveBadge) return c.live;
      if (next === "idle") return c.ready;
      if (next === "live") return c.live;
      if (next === "blocked") return c.blocked;
      return c.ended;
    }

    function setPhase(next) {
      phase = next;
      if (els.card) els.card.dataset.phase = next;
      const c = t();
      if (els.liveLabel) els.liveLabel.textContent = liveLabelFor(next);
      if (next === "live") {
        if (els.callLabel) els.callLabel.textContent = c.hangup;
        if (els.call) {
          els.call.setAttribute("aria-label", c.hangup);
          els.call.classList.remove("start");
          els.call.classList.add("end");
          els.call.disabled = false;
        }
      } else if (next === "blocked") {
        if (els.callLabel) els.callLabel.textContent = c.call;
        if (els.call) {
          els.call.setAttribute("aria-label", c.call);
          els.call.classList.add("start");
          els.call.classList.remove("end");
          els.call.disabled = true;
        }
        setWave("idle");
      } else {
        const label = next === "ended" ? c.callAgain : c.call;
        if (els.callLabel) els.callLabel.textContent = label;
        if (els.call) {
          els.call.setAttribute("aria-label", label);
          els.call.classList.add("start");
          els.call.classList.remove("end");
          els.call.disabled = !grokVoiceEnabled;
        }
        setWave("idle");
      }
      const on = next === "live";
      if (els.mute) els.mute.disabled = !on;
      if (els.talk) {
        els.talk.disabled = !on;
        els.talk.title = c.talk;
      }
      if (els.keypad) els.keypad.disabled = !on;
      if (typeof config.onPhase === "function") config.onPhase(next);
    }

    function startTimer() {
      startedAt = Date.now();
      if (els.timer) els.timer.textContent = "00:00";
      clearInterval(timerId);
      timerId = setInterval(() => {
        if (els.timer) els.timer.textContent = fmtTimer(Date.now() - startedAt);
      }, 250);
    }

    function stopTimer(reset) {
      clearInterval(timerId);
      timerId = null;
      if (reset && els.timer) els.timer.textContent = "00:00";
    }

    function sendEvent(payload) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(payload));
    }

    function sendPcm(float32, fromRate) {
      if (muted || !streaming) return;
      if (!float32 || !float32.length) return;
      if (peak(float32) > 0.01) heardInput = true;
      const at24k = resample(float32, fromRate, sampleRate);
      const pcm = floatTo16BitPCM(at24k);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        earlyAudio.push(pcm);
        if (earlyAudio.length > 40) earlyAudio.shift();
        return;
      }
      sendEvent({ type: "input_audio_buffer.append", audio: arrayBufferToBase64(pcm) });
    }

    function flushEarlyAudio() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      for (const pcm of earlyAudio) {
        sendEvent({ type: "input_audio_buffer.append", audio: arrayBufferToBase64(pcm) });
      }
      earlyAudio = [];
    }

    function disconnectCapture() {
      streaming = false;
      if (els.talk) els.talk.classList.remove("listening");
      if (captureNode) {
        try { captureNode.disconnect(); } catch { /* ignore */ }
        if (captureNode.port) captureNode.port.onmessage = null;
        if (captureNode.onaudioprocess) captureNode.onaudioprocess = null;
        captureNode = null;
      }
      if (captureSource) {
        try { captureSource.disconnect(); } catch { /* ignore */ }
        captureSource = null;
      }
      if (silentGain) {
        try { silentGain.disconnect(); } catch { /* ignore */ }
        silentGain = null;
      }
    }

    function stopMic() {
      disconnectCapture();
      if (micStream) {
        for (const track of micStream.getAudioTracks()) track.stop();
        micStream = null;
      }
    }

    function closeSocket() {
      pendingGreeting = "";
      greeted = false;
      pendingTools.clear();
      earlyAudio = [];
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
        ws = null;
      }
    }

    async function attachCapture(ctx, stream) {
      captureSource = ctx.createMediaStreamSource(stream);
      silentGain = ctx.createGain();
      // Never 0: Chrome may skip processing a fully muted branch.
      silentGain.gain.value = 0.00001;

      let usedWorklet = false;
      if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function") {
        try {
          if (!workletUrl) {
            workletUrl = URL.createObjectURL(new Blob([MIC_WORKLET], { type: "application/javascript" }));
          }
          await ctx.audioWorklet.addModule(workletUrl);
          const node = new AudioWorkletNode(ctx, "atende-mic-capture");
          node.port.onmessage = (event) => {
            sendPcm(event.data, ctx.sampleRate);
          };
          captureSource.connect(node);
          node.connect(silentGain);
          silentGain.connect(ctx.destination);
          captureNode = node;
          usedWorklet = true;
        } catch {
          usedWorklet = false;
        }
      }

      if (!usedWorklet) {
        if (typeof ctx.createScriptProcessor !== "function") {
          throw new Error("mic_processor_unavailable");
        }
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          sendPcm(event.inputBuffer.getChannelData(0), ctx.sampleRate);
        };
        captureSource.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(ctx.destination);
        captureNode = processor;
      }

      streaming = true;
      if (els.talk) els.talk.classList.add("listening");
    }

    async function openMicrophone() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      for (const track of stream.getAudioTracks()) {
        track.enabled = true;
      }
      return stream;
    }

    function waitUntilQuiet() {
      return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          if (!player || !player.playing() || Date.now() - started > 4000) {
            resolve();
            return;
          }
          setTimeout(tick, 80);
        };
        tick();
      });
    }

    // xAI requires response.create after function_call_output or the agent
    // never continues (Sofia stalls on "a começar" / "um momento").
    async function flushPendingTools() {
      if (pendingTools.size) return;
      await waitUntilQuiet();
      if (pendingTools.size) return;
      sendEvent({ type: "response.create" });
    }

    async function runTool(event, generation) {
      const callId = event.call_id;
      const name = event.name;
      let args = {};
      try {
        args = typeof event.arguments === "string" ? JSON.parse(event.arguments || "{}") : (event.arguments || {});
      } catch {
        args = {};
      }
      pendingTools.set(callId, name);
      setCaption(agentName, t().thinking);
      setWave("idle");
      const TOOL_TIMEOUT_MS = 2500;
      let output = { error: "tool_failed", instruction: "Keep talking. Offer tomorrow morning and ask if that works." };
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const abortTimer = controller ? setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS) : null;
      try {
        const res = await fetch(`/api/business/${slug}/realtime/tool`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, arguments: args }),
          signal: controller ? controller.signal : undefined,
        });
        output = await res.json();
      } catch {
        output = {
          error: "tool_timeout",
          instruction:
            locale === "en"
              ? "Do not stall. Say you have a slot tomorrow morning and ask if it works."
              : "Não fiques em silêncio. Diz que tens vaga amanhã de manhã e pergunta se serve.",
        };
      } finally {
        if (abortTimer) clearTimeout(abortTimer);
      }
      if (generation !== callGeneration || !ws) return;
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      });
      pendingTools.delete(callId);
      if (output.ok === true || output.bookingId) {
        if (typeof config.onBooked === "function") config.onBooked();
      }
      flushPendingTools();
    }

    function greet(text) {
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "force_message",
          role: "assistant",
          interruptible: true,
          content: [{ type: "output_text", text }],
        },
      });
      setCaption(agentName, text);
    }

    function onRealtimeEvent(event) {
      const type = event && event.type;
      if (!type) return;
      switch (type) {
        case "session.updated":
        case "session.created":
          if (!greeted && pendingGreeting) {
            greeted = true;
            const text = pendingGreeting;
            pendingGreeting = "";
            greet(text);
          }
          break;
        case "input_audio_buffer.speech_started":
          assistantBuf = "";
          setCaption(t().you, t().speakNow);
          setWave(muted ? "muted" : "listening");
          if (els.avatar) els.avatar.classList.remove("speaking");
          break;
        case "input_audio_buffer.speech_stopped":
          setWave("idle");
          if (els.spk) els.spk.textContent = agentName;
          if (els.txt) els.txt.textContent = t().thinking;
          break;
        case "conversation.item.input_audio_transcription.updated":
        case "conversation.item.input_audio_transcription.completed": {
          const transcript = event.transcript || event.text || "";
          if (transcript) setCaption(t().you, transcript);
          break;
        }
        case "response.created":
          assistantBuf = "";
          if (els.avatar) els.avatar.classList.add("speaking");
          setWave("speaking");
          break;
        case "response.output_audio.delta":
        case "response.audio.delta": {
          const b64 = event.delta || event.audio;
          if (b64 && player) player.pushInt16(base64ToInt16(b64));
          if (els.avatar) els.avatar.classList.add("speaking");
          setWave("speaking");
          break;
        }
        case "response.output_audio_transcript.delta":
        case "response.audio_transcript.delta":
        case "response.output_text.delta": {
          const piece = event.delta || event.text || "";
          assistantBuf += piece;
          if (assistantBuf) setCaption(agentName, assistantBuf);
          break;
        }
        case "response.output_audio_transcript.done":
        case "response.audio_transcript.done":
        case "response.output_text.done": {
          const finalText = event.transcript || event.text || assistantBuf;
          if (finalText) setCaption(agentName, finalText);
          break;
        }
        case "response.function_call_arguments.done":
          runTool(event, callGeneration);
          break;
        case "response.done":
          if (els.avatar) els.avatar.classList.remove("speaking");
          if (phase === "live") setWave(muted ? "muted" : streaming ? "listening" : "idle");
          if (typeof config.onBooked === "function") config.onBooked();
          break;
        case "error": {
          const msg = event.error && event.error.message ? event.error.message : (event.message || t().error);
          setCaption(agentName, msg);
          break;
        }
        default:
          break;
      }
    }

    async function hangUp(opts) {
      const options = opts || {};
      callGeneration += 1;
      stopMic();
      closeSocket();
      if (player) player.stop();
      if (audioCtx && audioCtx.state !== "closed") {
        try { await audioCtx.suspend(); } catch { /* ignore */ }
      }
      stopTimer(true);
      if (els.avatar) els.avatar.classList.remove("speaking");
      showFallback(false);
      if (!options.silent) {
        setPhase("ended");
        setCaption(agentName, t().endedCaption);
      } else if (!grokVoiceEnabled) {
        setPhase("blocked");
      } else if (options.micFailed) {
        setPhase("idle");
      } else {
        setPhase("idle");
        applyIdleCaption();
      }
    }

    async function startCall() {
      await ready;
      if (phase === "live" || !grokVoiceEnabled) return;
      const c = t();
      callGeneration += 1;
      const generation = callGeneration;
      muted = false;
      heardInput = false;
      earlyAudio = [];
      if (els.mute) {
        els.mute.classList.remove("muted");
        els.mute.setAttribute("aria-pressed", "false");
      }
      setMicError(null);
      setPhase("live");
      startTimer();
      setCaption(agentName, c.openingMic);
      setWave("idle");

      let stream;
      try {
        stream = await openMicrophone();
      } catch (err) {
        const msg = micErrorMessage(err, c);
        setMicError(msg);
        setCaption(agentName, msg);
        setWave("idle");
        await hangUp({ silent: true, micFailed: true });
        return;
      }
      if (generation !== callGeneration) {
        for (const track of stream.getAudioTracks()) track.stop();
        return;
      }
      micStream = stream;

      const ctx = createAudioContext();
      if (!ctx) {
        setMicError(c.micUnsupported);
        setCaption(agentName, c.micUnsupported);
        await hangUp({ silent: true, micFailed: true });
        return;
      }
      audioCtx = ctx;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* ignore */ }
      }
      try {
        await attachCapture(ctx, stream);
      } catch {
        setMicError(c.micUnsupported);
        setCaption(agentName, c.micUnsupported);
        await hangUp({ silent: true, micFailed: true });
        return;
      }
      if (generation !== callGeneration) return;

      setCaption(agentName, c.connecting);
      setWave("listening");

      let session;
      try {
        const res = await fetch(`/api/business/${slug}/realtime/session`, { method: "POST" });
        session = await res.json();
        if (!res.ok) {
          setCaption(agentName, session.message || c.notConfigured);
          await hangUp({ silent: true });
          return;
        }
      } catch {
        setCaption(agentName, c.error);
        await hangUp({ silent: true });
        return;
      }
      if (generation !== callGeneration) return;

      sampleRate = session.sampleRate || TARGET_RATE;
      pendingGreeting = session.greeting || "";
      greeted = false;
      player = createPlayer(ctx, sampleRate);

      ws = new WebSocket(session.wsUrl, [`xai-client-secret.${session.token}`]);
      ws.addEventListener("open", () => {
        if (generation !== callGeneration) return;
        sendEvent({ type: "session.update", session: session.session });
        flushEarlyAudio();
        setTimeout(() => {
          if (generation !== callGeneration) return;
          if (!greeted && pendingGreeting) {
            greeted = true;
            const text = pendingGreeting;
            pendingGreeting = "";
            greet(text);
          }
        }, 400);
      });
      ws.addEventListener("message", (msg) => {
        if (generation !== callGeneration) return;
        if (typeof msg.data !== "string") return;
        let event;
        try { event = JSON.parse(msg.data); } catch { return; }
        onRealtimeEvent(event);
      });
      ws.addEventListener("close", () => {
        if (generation !== callGeneration) return;
        if (phase === "live") hangUp();
      });
      ws.addEventListener("error", () => {
        if (generation !== callGeneration) return;
        setCaption(agentName, c.error);
      });
    }

    function toggleMute() {
      if (phase !== "live") return;
      muted = !muted;
      if (els.mute) {
        els.mute.classList.toggle("muted", muted);
        els.mute.setAttribute("aria-pressed", String(muted));
      }
      if (micStream) {
        for (const track of micStream.getAudioTracks()) track.enabled = !muted;
      }
      if (muted) {
        if (els.talk) els.talk.classList.remove("listening");
        setWave("muted");
      } else {
        if (els.talk) els.talk.classList.add("listening");
        setWave("listening");
      }
    }

    function showFallback(open) {
      if (!els.fallback) return;
      els.fallback.hidden = !open;
      if (els.keypad) els.keypad.setAttribute("aria-pressed", String(open));
      if (open && els.fallbackInput) els.fallbackInput.focus();
    }

    function sendTyped(text) {
      if (!text || phase !== "live") return;
      setCaption(t().you, text);
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      });
      sendEvent({ type: "response.create" });
    }

    function onCallButton() {
      if (!grokVoiceEnabled || phase === "blocked") return;
      if (phase === "live") hangUp();
      else startCall();
    }

    function applyIdleCaption() {
      const idleSpeaker = ui.idleSpeaker || t().voiceCall;
      const idleCaption = ui.idleCaption || t().idleCaption;
      setCaption(idleSpeaker, idleCaption);
    }

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      if (els.call) els.call.addEventListener("click", onCallButton);
      if (els.mute) els.mute.addEventListener("click", toggleMute);
      if (els.talk) {
        els.talk.addEventListener("click", () => {
          if (phase !== "live") return;
          if (muted) toggleMute();
        });
      }
      if (els.keypad && els.fallback) {
        els.keypad.addEventListener("click", () => showFallback(els.fallback.hidden));
      }
      if (els.fallback) {
        els.fallback.addEventListener("submit", (event) => {
          event.preventDefault();
          if (!els.fallbackInput) return;
          const text = els.fallbackInput.value.trim();
          if (!text) return;
          els.fallbackInput.value = "";
          sendTyped(text);
        });
      }
    }

    async function init(opts) {
      try {
        const options = opts || {};
        if (options.slug) slug = options.slug;
        if (options.locale) locale = options.locale;
        if (options.agentName) agentName = options.agentName;
        if (options.idleCaption) ui.idleCaption = options.idleCaption;
        if (options.idleSpeaker) ui.idleSpeaker = options.idleSpeaker;
        grokVoiceEnabled = Boolean(options.grokVoice);
        if (els.name) els.name.textContent = agentName;
        if (els.role) els.role.textContent = locale === "en" ? "Voice assistant" : "Assistente de voz";
        if (els.avatar) els.avatar.textContent = (agentName[0] || "S").toUpperCase();
        if (els.fallback) {
          const hint = els.fallback.querySelector("p");
          if (hint) hint.textContent = t().fallbackHint;
        }
        buildWave(els.wave);
        bind();
        if (!grokVoiceEnabled) {
          if (els.configErr) {
            els.configErr.hidden = false;
            els.configErr.textContent = t().notConfigured;
          }
          setPhase("blocked");
          setCaption(t().voiceCall, t().notConfigured);
        } else {
          if (els.configErr) els.configErr.hidden = true;
          setPhase("idle");
          applyIdleCaption();
        }
        if (els.timer) els.timer.textContent = "00:00";
      } finally {
        readyResolve();
      }
    }

    return {
      init,
      startCall,
      hangUp,
      toggleMute,
      sendTyped,
      setSlug(next) { slug = next; },
      isLive() { return phase === "live"; },
    };
  }

  global.AtendeVoiceCall = { create, copyFor };
})(typeof window !== "undefined" ? window : globalThis);
