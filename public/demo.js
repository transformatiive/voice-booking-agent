const slug = location.pathname.split("/").pop();
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

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
};

const MIC_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/></svg>`;

let locale = "pt";
let tz = "Europe/Lisbon";
let agentName = "Sofia";
let sessionId = newSessionId();
let phase = "idle";
let muted = false;
let busy = false;
let listening = false;
let startedAt = 0;
let timerId = null;
let rec = null;
let capToken = { cancelled: true };
let autoListen = true;

function newSessionId() {
  return `call-${Math.random().toString(36).slice(2)}`;
}

function copy() {
  if (locale === "en") {
    return {
      ready: "READY TO CALL",
      live: "LIVE CALL",
      ended: "CALL ENDED",
      connecting: "Calling…",
      idleCaption: "Tap Call. Sofia answers on the phone — speak, don't type.",
      speakNow: "Listening — speak now",
      you: "You",
      voiceCall: "Voice call",
      thinking: "One moment…",
      endedCaption: "Call ended. Tap to call again.",
      call: "Call",
      callAgain: "Call again",
      hangup: "Hang up",
      talk: "Tap to talk",
      promptsTitle: "Try saying out loud",
      noMic: "Microphone isn't available in this browser. Use the keypad only as a fallback.",
      fallbackHint: "Fallback if the microphone isn't available — what you would say on the phone:",
      noBookings: "No appointments.",
      error: "I couldn't reach the assistant. Try again.",
    };
  }
  return {
    ready: "PRONTO A LIGAR",
    live: "CHAMADA AO VIVO",
    ended: "CHAMADA TERMINADA",
    connecting: "A ligar…",
    idleCaption: "Toque em Ligar. A Sofia atende ao telefone — fale, não escreva.",
    speakNow: "A ouvir — fale agora",
    you: "Você",
    voiceCall: "Chamada de voz",
    thinking: "Um momento…",
    endedCaption: "Chamada terminada. Toque para ligar novamente.",
    call: "Ligar",
    callAgain: "Ligar novamente",
    hangup: "Terminar",
    talk: "Toque para falar",
    promptsTitle: "Experimente dizer em voz",
    noMic: "Este browser não tem microfone. Use o teclado só como recurso.",
    fallbackHint: "Recurso se o microfone não estiver disponível — o que diria ao telefone:",
    noBookings: "Sem marcações.",
    error: "Não consegui contactar o assistente. Tente outra vez.",
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
    setWave("idle");
  } else if (next === "live") {
    el.liveLabel.textContent = t.live;
    el.callLabel.textContent = t.hangup;
    el.call.setAttribute("aria-label", t.hangup);
    el.call.classList.remove("start");
    el.call.classList.add("end");
  } else {
    el.liveLabel.textContent = t.ended;
    el.callLabel.textContent = t.callAgain;
    el.call.setAttribute("aria-label", t.callAgain);
    el.call.classList.add("start");
    el.call.classList.remove("end");
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

function setCaption(speaker, text, typewrite = false) {
  el.spk.textContent = speaker;
  capToken.cancelled = true;
  if (!typewrite) {
    el.txt.textContent = text;
    return Promise.resolve();
  }
  const token = { cancelled: false };
  capToken = token;
  return type(el.txt, text, token);
}

function type(node, text, token, speed = 18) {
  return new Promise((resolve) => {
    let i = 0;
    function step() {
      if (token.cancelled || !node.isConnected) return resolve();
      node.textContent = text.slice(0, i);
      const c = document.createElement("span");
      c.className = "cap-cursor";
      node.appendChild(c);
      if (i < text.length) {
        i += 1;
        setTimeout(step, speed);
      } else {
        setTimeout(() => { if (c.parentNode) c.remove(); resolve(); }, 200);
      }
    }
    step();
  });
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

function speechLang() {
  return locale === "en" ? "en-US" : "pt-PT";
}

function pickVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const lang = speechLang();
  const prefix = lang.slice(0, 2);
  const female = /female|feminino|mulher|maria|ines|inês|catarina|joana|sonia|sónia/i;
  return (
    voices.find((v) => v.lang.startsWith(lang) && female.test(v.name)) ||
    voices.find((v) => v.lang.startsWith(prefix) && female.test(v.name)) ||
    voices.find((v) => v.lang.startsWith(lang)) ||
    voices.find((v) => v.lang.startsWith(prefix)) ||
    null
  );
}

function speak(text) {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(tid);
      resolve();
    };
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang();
    u.rate = 1.04;
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.onend = done;
    u.onerror = done;
    const tid = setTimeout(done, Math.min(16000, 900 + text.length * 70));
    try { window.speechSynthesis.speak(u); } catch { done(); return; }
    setTimeout(() => { if (!window.speechSynthesis.speaking) done(); }, 500);
  });
}

function stopSpeech() {
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

function ensureRecognition() {
  if (!SpeechRec || rec) return rec;
  rec = new SpeechRec();
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.lang = speechLang();
  rec.addEventListener("start", () => {
    listening = true;
    el.talk.classList.add("listening");
    setWave(muted ? "muted" : "listening");
    setCaption(copy().you, copy().speakNow);
  });
  rec.addEventListener("result", (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += piece;
      else interim += piece;
    }
    const shown = (finalText || interim).trim();
    if (shown) setCaption(copy().you, shown);
    if (finalText.trim()) {
      const uttered = finalText.trim();
      stopListening();
      handleUtterance(uttered);
    }
  });
  rec.addEventListener("end", () => {
    listening = false;
    el.talk.classList.remove("listening");
    if (phase === "live" && !busy && !muted) setWave("idle");
  });
  rec.addEventListener("error", (event) => {
    listening = false;
    el.talk.classList.remove("listening");
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showFallback(true);
      setCaption(agentName, copy().noMic);
    }
  });
  return rec;
}

function startListening() {
  if (phase !== "live" || muted || busy) return;
  if (!SpeechRec) {
    showFallback(true);
    return;
  }
  const engine = ensureRecognition();
  engine.lang = speechLang();
  try { engine.start(); } catch { /* already started */ }
}

function stopListening() {
  if (!rec || !listening) return;
  try { rec.stop(); } catch { /* ignore */ }
  listening = false;
  el.talk.classList.remove("listening");
}

function showFallback(open) {
  el.fallback.hidden = !open;
  el.keypad.setAttribute("aria-pressed", String(open));
  if (open) el.fallbackInput.focus();
}

async function handleUtterance(text) {
  if (!text || phase !== "live" || busy) return;
  busy = true;
  stopListening();
  setCaption(copy().you, text);
  setWave("idle");
  el.spk.textContent = agentName;
  el.txt.textContent = copy().thinking;
  try {
    const res = await fetch(`/api/business/${slug}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
    });
    const data = await res.json();
    const reply = data.reply || copy().error;
    el.avatar.classList.add("speaking");
    setWave("speaking");
    await Promise.all([speak(reply), setCaption(agentName, reply, true)]);
    refreshBookings();
  } catch {
    setCaption(agentName, copy().error);
  } finally {
    busy = false;
    el.avatar.classList.remove("speaking");
    if (phase === "live") setWave(muted ? "muted" : "idle");
    if (phase === "live" && !muted && autoListen && SpeechRec && el.fallback.hidden) startListening();
  }
}

async function startCall() {
  if (phase === "live" || busy) return;
  const t = copy();
  sessionId = newSessionId();
  muted = false;
  autoListen = true;
  el.mute.classList.remove("muted");
  el.mute.setAttribute("aria-pressed", "false");
  setPhase("live");
  startTimer();
  setCaption(agentName, t.connecting);
  setWave("speaking");
  busy = true;
  try {
    const g = await fetch(`/api/business/${slug}/greeting`).then((r) => r.json());
    const reply = g.reply || t.connecting;
    el.avatar.classList.add("speaking");
    await Promise.all([speak(reply), setCaption(agentName, reply, true)]);
    el.avatar.classList.remove("speaking");
    setWave("idle");
    if (!SpeechRec) {
      autoListen = false;
      showFallback(true);
    } else if (!muted) startListening();
  } catch {
    setCaption(agentName, t.error);
    setWave("idle");
  } finally {
    busy = false;
    el.avatar.classList.remove("speaking");
  }
}

async function hangUp() {
  busy = false;
  autoListen = false;
  stopListening();
  stopSpeech();
  stopTimer();
  el.avatar.classList.remove("speaking");
  showFallback(false);
  setPhase("ended");
  setCaption(agentName, copy().endedCaption);
  try {
    await fetch(`/api/business/${slug}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  } catch { /* ignore */ }
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
    stopListening();
    setWave("muted");
  } else {
    setWave("idle");
    if (!busy) startListening();
  }
}

function toggleTalk() {
  if (phase !== "live" || muted || busy) return;
  if (listening) stopListening();
  else startListening();
}

async function onPrompt(event) {
  event.preventDefault();
  if (phase !== "live") {
    await startCall();
    return;
  }
  if (!busy) startListening();
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
  handleUtterance(text);
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => pickVoice());
}

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
    el.bizName.textContent = b.name;
    el.bizMeta.textContent = `${b.plan.name} · ${b.number ? b.number.e164 : "sem número"} · assistente ${agentName}`;
    el.name.textContent = agentName;
    el.role.textContent = locale === "en" ? "Voice assistant" : "Assistente de voz";
    el.avatar.textContent = (agentName[0] || "S").toUpperCase();
    el.fallback.querySelector("p").textContent = copy().fallbackHint;
    setPhase("idle");
    setCaption(copy().voiceCall, copy().idleCaption);
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
  } catch {
    el.bizName.textContent = t.error;
  }
}

init();
