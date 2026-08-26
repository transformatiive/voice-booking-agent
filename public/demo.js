const slug = location.pathname.split("/").pop();

const el = {
  card: document.getElementById("callcard"),
  liveLabel: document.getElementById("liveLabel"),
  timer: document.getElementById("ccTimer"),
  avatar: document.getElementById("agentAvatar"),
  name: document.getElementById("agentNm"),
  role: document.getElementById("agentRl"),
  wave: document.getElementById("wave"),
  spk: document.getElementById("capSpk"),
  txt: document.getElementById("capTxt"),
  mute: document.getElementById("muteBtn"),
  talk: document.getElementById("talkBtn"),
  call: document.getElementById("callBtn"),
  callLabel: document.getElementById("callBtnLabel"),
  keypad: document.getElementById("keypadBtn"),
  fallback: document.getElementById("fallback"),
  fallbackInput: document.getElementById("fallbackInput"),
  bookings: document.getElementById("bookings"),
  prompts: document.getElementById("prompts"),
  bizName: document.getElementById("bizName"),
  bizMeta: document.getElementById("bizMeta"),
  configErr: document.getElementById("configErr"),
};

const MIC_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/></svg>`;

let locale = "pt";
let tz = "Europe/Lisbon";
let agentName = "Sofia";
let grokVoiceEnabled = false;
let phase = "idle";
let muted = false;
let streaming = false;
let startedAt = 0;
let timerId = null;
let capToken = { cancelled: true };

let ws = null;
let audioCtx = null;
let micStream = null;
let processor = null;
let player = null;
let sampleRate = 24000;
let pendingGreeting = "";
let greeted = false;
let pendingTools = new Map();
let assistantBuf = "";
let callGeneration = 0;

function copy() {
  if (locale === "en") {
    return {
      ready: "READY TO CALL",
      live: "LIVE CALL",
      ended: "CALL ENDED",
      blocked: "VOICE NOT CONFIGURED",
      connecting: "Calling…",
      idleCaption: "Tap Call. Sofia answers on Grok Live 2 — speak, don't type.",
      speakNow: "Listening — speak now",
      you: "You",
      voiceCall: "Voice call",
      thinking: "One moment…",
      endedCaption: "Call ended. Tap to call again.",
      call: "Call",
      callAgain: "Call again",
      hangup: "Hang up",
      talk: "Microphone on",
      promptsTitle: "Try saying out loud",
      noMic: "Microphone isn't available. Use the keypad only as a fallback — Sofia still speaks with Grok.",
      fallbackHint: "Fallback if the microphone isn't available — what you would say on the phone:",
      noBookings: "No appointments.",
      error: "I couldn't reach the assistant. Try again.",
      notConfigured: "Grok voice is not configured in this environment. Set XAI_API_KEY on the server.",
    };
  }
  return {
    ready: "PRONTO A LIGAR",
    live: "CHAMADA AO VIVO",
    ended: "CHAMADA TERMINADA",
    blocked: "VOZ NÃO CONFIGURADA",
    connecting: "A ligar…",
    idleCaption: "Toque em Ligar. A Sofia atende com Grok Live 2 — fale, não escreva.",
    speakNow: "A ouvir — fale agora",
    you: "Você",
    voiceCall: "Chamada de voz",
    thinking: "Um momento…",
    endedCaption: "Chamada terminada. Toque para ligar novamente.",
    call: "Ligar",
    callAgain: "Ligar novamente",
    hangup: "Terminar",
    talk: "Microfone ligado",
    promptsTitle: "Experimente dizer em voz",
    noMic: "Este browser não tem microfone. Use o teclado só como recurso — a Sofia continua a falar com a voz Grok.",
    fallbackHint: "Recurso se o microfone não estiver disponível — o que diria ao telefone:",
    noBookings: "Sem marcações.",
    error: "Não consegui contactar o assistente. Tente outra vez.",
    notConfigured: "A voz Grok não está configurada neste ambiente. Defina XAI_API_KEY no servidor.",
  };
}

function voicePrompts(services) {
  const first = services?.[0]?.name;
  if (locale === "en") {
    return [
      first ? `Book ${first} tomorrow at 3pm` : "Book tomorrow at 3pm",
      "What services do you offer?",
      "Is Friday morning free?",
      "Show my appointments",
    ];
  }
  return [
    first ? `Marcar ${first} amanhã às 15h` : "Marcar amanhã às 15h",
    "Que serviços têm?",
    "Sexta de manhã está livre?",
    "As minhas marcações",
  ];
}

function setPhase(next) {
  phase = next;
  el.card.dataset.phase = next;
  const t = copy();
  if (next === "idle") {
    el.liveLabel.textContent = t.ready;
    el.callLabel.textContent = t.call;
    el.call.setAttribute("aria-label", t.call);
    el.call.classList.add("start");
    el.call.classList.remove("end");
    el.call.disabled = !grokVoiceEnabled;
    setWave("idle");
  } else if (next === "live") {
    el.liveLabel.textContent = t.live;
    el.callLabel.textContent = t.hangup;
    el.call.setAttribute("aria-label", t.hangup);
    el.call.classList.remove("start");
    el.call.classList.add("end");
    el.call.disabled = false;
  } else if (next === "blocked") {
    el.liveLabel.textContent = t.blocked;
    el.callLabel.textContent = t.call;
    el.call.setAttribute("aria-label", t.call);
    el.call.classList.add("start");
    el.call.classList.remove("end");
    el.call.disabled = true;
    setWave("idle");
  } else {
    el.liveLabel.textContent = t.ended;
    el.callLabel.textContent = t.callAgain;
    el.call.setAttribute("aria-label", t.callAgain);
    el.call.classList.add("start");
    el.call.classList.remove("end");
    el.call.disabled = !grokVoiceEnabled;
    setWave("idle");
  }
  const on = next === "live";
  el.mute.disabled = !on;
  el.talk.disabled = !on;
  el.talk.title = copy().talk;
  el.keypad.disabled = !on;
}

function setWave(mode) {
  el.wave.className = `waveform ${mode}`;
}

function setCaption(speaker, text) {
  el.spk.textContent = speaker;
  capToken.cancelled = true;
  el.txt.textContent = text;
}

function fmtTimer(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function startTimer() {
  startedAt = Date.now();
  el.timer.textContent = "00:00";
  clearInterval(timerId);
  timerId = setInterval(() => { el.timer.textContent = fmtTimer(Date.now() - startedAt); }, 250);
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function buildWave() {
  el.wave.innerHTML = "";
  for (let i = 0; i < 28; i += 1) {
    const bar = document.createElement("i");
    bar.style.animationDelay = `${(i * 0.045).toFixed(2)}s`;
    bar.style.animationDuration = `${(0.8 + Math.random() * 0.7).toFixed(2)}s`;
    el.wave.appendChild(bar);
  }
}

function showFallback(open) {
  el.fallback.hidden = !open;
  el.keypad.setAttribute("aria-pressed", String(open));
  if (open) el.fallbackInput.focus();
}

function sendEvent(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
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

async function ensureAudio() {
  if (audioCtx && audioCtx.state !== "closed") {
    if (audioCtx.state === "suspended") await audioCtx.resume();
    return audioCtx;
  }
  audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  return audioCtx;
}

async function startMic(ctx) {
  if (!navigator.mediaDevices?.getUserMedia) {
    showFallback(true);
    setCaption(agentName, copy().noMic);
    return false;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch {
    showFallback(true);
    setCaption(agentName, copy().noMic);
    return false;
  }
  const source = ctx.createMediaStreamSource(micStream);
  const bufferSize = 4096;
  processor = ctx.createScriptProcessor(bufferSize, 1, 1);
  processor.onaudioprocess = (event) => {
    if (!streaming || muted || !ws || ws.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const at24k = resample(input, ctx.sampleRate, sampleRate);
    const pcm = floatTo16BitPCM(at24k);
    sendEvent({ type: "input_audio_buffer.append", audio: arrayBufferToBase64(pcm) });
  };
  const muteGain = ctx.createGain();
  muteGain.gain.value = 0;
  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(ctx.destination);
  streaming = true;
  el.talk.classList.add("listening");
  return true;
}

function stopMic() {
  streaming = false;
  el.talk.classList.remove("listening");
  if (processor) {
    try { processor.disconnect(); } catch { /* ignore */ }
    processor.onaudioprocess = null;
    processor = null;
  }
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
}

function closeSocket() {
  pendingGreeting = "";
  greeted = false;
  pendingTools.clear();
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
}

function waitUntilQuiet() {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (!player || !player.playing() || Date.now() - started > 8000) {
        resolve();
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

async function flushPendingTools() {
  if (!pendingTools.size) return;
  await waitUntilQuiet();
  if (!pendingTools.size) return;
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
  setCaption(agentName, copy().thinking);
  setWave("idle");
  let output = { error: "tool_failed" };
  try {
    const res = await fetch(`/api/business/${slug}/realtime/tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    output = await res.json();
  } catch {
    output = { error: "tool_unreachable" };
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
  if (output.ok === true || output.bookingId) refreshBookings();
  if (!pendingTools.size) flushPendingTools();
}

function onRealtimeEvent(event) {
  const type = event?.type;
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
      setCaption(copy().you, copy().speakNow);
      setWave(muted ? "muted" : "listening");
      el.avatar.classList.remove("speaking");
      break;
    case "input_audio_buffer.speech_stopped":
      setWave("idle");
      el.spk.textContent = agentName;
      el.txt.textContent = copy().thinking;
      break;
    case "conversation.item.input_audio_transcription.updated":
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = event.transcript || event.text || "";
      if (transcript) setCaption(copy().you, transcript);
      break;
    }
    case "response.created":
      assistantBuf = "";
      el.avatar.classList.add("speaking");
      setWave("speaking");
      break;
    case "response.output_audio.delta":
    case "response.audio.delta": {
      const b64 = event.delta || event.audio;
      if (b64 && player) player.pushInt16(base64ToInt16(b64));
      el.avatar.classList.add("speaking");
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
      el.avatar.classList.remove("speaking");
      if (phase === "live") setWave(muted ? "muted" : streaming ? "listening" : "idle");
      refreshBookings();
      break;
    case "error": {
      const msg = event.error?.message || event.message || copy().error;
      setCaption(agentName, msg);
      break;
    }
    default:
      break;
  }
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

async function startCall() {
  if (phase === "live" || !grokVoiceEnabled) return;
  const t = copy();
  callGeneration += 1;
  const generation = callGeneration;
  muted = false;
  el.mute.classList.remove("muted");
  el.mute.setAttribute("aria-pressed", "false");
  setPhase("live");
  startTimer();
  setCaption(agentName, t.connecting);
  setWave("speaking");

  let session;
  try {
    const res = await fetch(`/api/business/${slug}/realtime/session`, { method: "POST" });
    session = await res.json();
    if (!res.ok) {
      setCaption(agentName, session.message || t.notConfigured);
      await hangUp({ silent: true });
      return;
    }
  } catch {
    setCaption(agentName, t.error);
    await hangUp({ silent: true });
    return;
  }
  if (generation !== callGeneration) return;

  sampleRate = session.sampleRate || 24000;
  pendingGreeting = session.greeting || "";
  greeted = false;
  const ctx = await ensureAudio();
  player = createPlayer(ctx, sampleRate);

  ws = new WebSocket(session.wsUrl, [`xai-client-secret.${session.token}`]);
  ws.addEventListener("open", async () => {
    if (generation !== callGeneration) return;
    sendEvent({ type: "session.update", session: session.session });
    const micOk = await startMic(ctx);
    if (!micOk) setWave("idle");
    else setWave("listening");
    setTimeout(() => {
      if (generation !== callGeneration) return;
      if (!greeted && pendingGreeting) {
        greeted = true;
        const text = pendingGreeting;
        pendingGreeting = "";
        greet(text);
      }
    }, 900);
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
    setCaption(agentName, t.error);
  });
}

async function hangUp(opts = {}) {
  callGeneration += 1;
  stopMic();
  closeSocket();
  if (player) player.stop();
  if (audioCtx && audioCtx.state !== "closed") {
    try { await audioCtx.suspend(); } catch { /* ignore */ }
  }
  stopTimer();
  el.avatar.classList.remove("speaking");
  showFallback(false);
  if (!opts.silent) {
    setPhase("ended");
    setCaption(agentName, copy().endedCaption);
  } else if (!grokVoiceEnabled) {
    setPhase("blocked");
  } else {
    setPhase("idle");
  }
}

function onCallButton() {
  if (phase === "live") hangUp();
  else startCall();
}

function toggleMute() {
  if (phase !== "live") return;
  muted = !muted;
  el.mute.classList.toggle("muted", muted);
  el.mute.setAttribute("aria-pressed", String(muted));
  if (muted) {
    el.talk.classList.remove("listening");
    setWave("muted");
  } else {
    el.talk.classList.add("listening");
    setWave("listening");
  }
}

function toggleTalk() {
  if (phase !== "live" || muted) return;
  streaming = !streaming;
  el.talk.classList.toggle("listening", streaming);
  setWave(streaming ? "listening" : "idle");
}

function sendTyped(text) {
  if (!text || phase !== "live") return;
  setCaption(copy().you, text);
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

async function onPrompt(event) {
  event.preventDefault();
  if (!grokVoiceEnabled) return;
  if (phase !== "live") {
    await startCall();
    return;
  }
  if (muted) toggleMute();
  streaming = true;
  el.talk.classList.add("listening");
  setWave("listening");
}

async function refreshBookings() {
  try {
    const res = await fetch(`/api/business/${slug}/bookings`);
    const list = await res.json();
    el.bookings.innerHTML = "";
    if (!list.length) {
      el.bookings.innerHTML = `<li class="when">${copy().noBookings}</li>`;
      return;
    }
    for (const b of list) {
      const when = new Date(b.start).toLocaleString("pt-PT", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz,
      });
      const li = document.createElement("li");
      li.innerHTML = `<div>${b.serviceName}${b.customerName ? " · " + b.customerName : ""}</div><div class="when">${when}</div>`;
      el.bookings.appendChild(li);
    }
  } catch { /* ignore */ }
}

el.call.addEventListener("click", onCallButton);
el.mute.addEventListener("click", toggleMute);
el.talk.addEventListener("click", toggleTalk);
el.keypad.addEventListener("click", () => showFallback(el.fallback.hidden));
el.fallback.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = el.fallbackInput.value.trim();
  if (!text) return;
  el.fallbackInput.value = "";
  sendTyped(text);
});

buildWave();

async function init() {
  document.getElementById("adminLink").href = `/app/${slug}`;
  const t = copy();
  try {
    const res = await fetch(`/api/business/${slug}`);
    const data = await res.json();
    const b = data.business;
    locale = b.locale;
    tz = b.timezone || "Europe/Lisbon";
    agentName = b.agentName || "Sofia";
    grokVoiceEnabled = Boolean(data.features?.grokVoice);
    el.bizName.textContent = b.name;
    el.bizMeta.textContent = `${b.plan.name} · ${b.number ? b.number.e164 : "sem número"} · assistente ${agentName}`;
    el.name.textContent = agentName;
    el.role.textContent = locale === "en" ? "Voice assistant" : "Assistente de voz";
    el.avatar.textContent = (agentName[0] || "S").toUpperCase();
    el.fallback.querySelector("p").textContent = copy().fallbackHint;
    el.prompts.innerHTML = "";
    for (const line of voicePrompts(b.services)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "voice-prompt";
      btn.innerHTML = `${MIC_SVG}<span>${line}</span>`;
      btn.addEventListener("click", onPrompt);
      el.prompts.appendChild(btn);
    }
    refreshBookings();
    if (!grokVoiceEnabled) {
      el.configErr.hidden = false;
      el.configErr.textContent = copy().notConfigured;
      setPhase("blocked");
      setCaption(copy().voiceCall, copy().notConfigured);
    } else {
      el.configErr.hidden = true;
      setPhase("idle");
      setCaption(copy().voiceCall, copy().idleCaption);
    }
  } catch {
    el.bizName.textContent = t.error;
  }
}

init();
