const slug = location.pathname.split("/").pop();

const els = {
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
  micErr: document.getElementById("micErr"),
  configErr: document.getElementById("configErr"),
};

const MIC_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/></svg>`;

let locale = "pt";
let tz = "Europe/Lisbon";
let grokVoiceEnabled = false;

const session = window.AtendeVoiceCall.create({
  slug,
  els,
  ui: {},
  onBooked: () => refreshBookings(),
});

function copy() {
  return window.AtendeVoiceCall.copyFor(locale);
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

async function onPrompt(event) {
  event.preventDefault();
  if (!grokVoiceEnabled) return;
  if (!session.isLive()) {
    await session.startCall();
  }
}

async function refreshBookings() {
  try {
    const res = await fetch(`/api/business/${slug}/bookings`);
    const list = await res.json();
    const box = document.getElementById("bookings");
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = `<li class="when">${copy().noBookings || (locale === "en" ? "No appointments." : "Sem marcações.")}</li>`;
      return;
    }
    for (const b of list) {
      const when = new Date(b.start).toLocaleString("pt-PT", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz,
      });
      const li = document.createElement("li");
      li.innerHTML = `<div>${b.serviceName}${b.customerName ? " · " + b.customerName : ""}</div><div class="when">${when}</div>`;
      box.appendChild(li);
    }
  } catch { /* ignore */ }
}

async function init() {
  document.getElementById("adminLink").href = `/app/${slug}`;
  const t = copy();
  try {
    const res = await fetch(`/api/business/${slug}`);
    const data = await res.json();
    const b = data.business;
    locale = b.locale;
    tz = b.timezone || "Europe/Lisbon";
    grokVoiceEnabled = Boolean(data.features?.grokVoice);
    document.getElementById("bizName").textContent = b.name;
    document.getElementById("bizMeta").textContent =
      `${b.plan.name} · ${b.number ? b.number.e164 : "sem número"} · assistente ${b.agentName || "Sofia"}`;
    const prompts = document.getElementById("prompts");
    prompts.innerHTML = "";
    for (const line of voicePrompts(b.services)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "voice-prompt";
      btn.innerHTML = `${MIC_SVG}<span>${line}</span>`;
      btn.addEventListener("click", onPrompt);
      prompts.appendChild(btn);
    }
    refreshBookings();
    await session.init({
      slug,
      locale,
      agentName: b.agentName || "Sofia",
      grokVoice: grokVoiceEnabled,
    });
  } catch {
    document.getElementById("bizName").textContent = t.error;
  }
}

init();
