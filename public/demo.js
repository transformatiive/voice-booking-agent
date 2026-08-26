const slug = location.pathname.split("/").pop();
const sessionId = `web-${Math.random().toString(36).slice(2)}`;
let locale = "pt";
let tz = "Europe/Lisbon";

const messagesEl = document.getElementById("messages");
const bookingsEl = document.getElementById("bookings");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const mic = document.getElementById("mic");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

function demoHints(locale, services) {
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

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale === "pt" ? "pt-PT" : "en-US";
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

async function refreshBookings() {
  try {
    const res = await fetch(`/api/business/${slug}/bookings`);
    const list = await res.json();
    bookingsEl.innerHTML = "";
    if (!list.length) {
      bookingsEl.innerHTML = `<li class="muted">Sem marcações.</li>`;
      return;
    }
    for (const b of list) {
      const when = new Date(b.start).toLocaleString("pt-PT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz });
      const li = document.createElement("li");
      li.innerHTML = `<div>${b.serviceName}${b.customerName ? " · " + b.customerName : ""}</div><div class="when">${when}</div>`;
      bookingsEl.appendChild(li);
    }
  } catch { /* ignore */ }
}

async function send(text) {
  addMessage("user", text);
  const typing = addMessage("agent typing", "…");
  try {
    const res = await fetch(`/api/business/${slug}/message`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, text }),
    });
    const data = await res.json();
    typing.remove();
    addMessage("agent", data.reply);
    speak(data.reply);
    refreshBookings();
  } catch {
    typing.remove();
    addMessage("agent", "Não consegui contactar o servidor.");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  send(text);
});

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR();
  rec.lang = "pt-PT";
  rec.interimResults = false;
  mic.addEventListener("click", () => { try { rec.start(); mic.classList.add("listening"); } catch { /* */ } });
  rec.addEventListener("result", (e) => {
    const t = e.results[0][0].transcript;
    mic.classList.remove("listening");
    send(t);
  });
  rec.addEventListener("end", () => mic.classList.remove("listening"));
  rec.addEventListener("error", () => mic.classList.remove("listening"));
} else {
  mic.addEventListener("click", () => addMessage("agent", "A entrada por voz não é suportada neste navegador — pode escrever."));
}

async function init() {
  document.getElementById("adminLink").href = `/app/${slug}`;
  try {
    const res = await fetch(`/api/business/${slug}`);
    const data = await res.json();
    const b = data.business;
    locale = b.locale;
    tz = b.timezone || "Europe/Lisbon";
    document.getElementById("bizName").textContent = b.name;
    document.getElementById("bizMeta").textContent = `${b.plan.name} · ${b.number ? b.number.e164 : "sem número"} · assistente ${b.agentName}`;
    rec_lang_update();
    statusDot.classList.add("ok");
    statusText.textContent = `${b.agentName} online`;
    const hints = demoHints(locale, b.services);
    document.getElementById("hints").innerHTML = hints.map((h) => `<li>“${h}”</li>`).join("");
    const g = await fetch(`/api/business/${slug}/greeting`).then((r) => r.json());
    addMessage("agent", g.reply);
    refreshBookings();
  } catch {
    statusText.textContent = "Assistente indisponível";
  }
}

function rec_lang_update() { /* locale set; SR lang defaults pt-PT which is fine for demo */ }

init();
