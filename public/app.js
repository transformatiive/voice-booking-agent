const sessionId = `web-${Math.random().toString(36).slice(2)}`;

const messagesEl = document.getElementById("messages");
const bookingsEl = document.getElementById("bookings");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const micButton = document.getElementById("micButton");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

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
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore speech errors */
  }
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function refreshBookings() {
  try {
    const res = await fetch("/api/bookings");
    const bookings = await res.json();
    bookingsEl.innerHTML = "";
    if (!bookings.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No appointments yet.";
      bookingsEl.appendChild(li);
      return;
    }
    for (const b of bookings) {
      const li = document.createElement("li");
      const svc = document.createElement("div");
      svc.className = "svc";
      svc.textContent = b.customerName ? `${b.serviceName} · ${b.customerName}` : b.serviceName;
      const when = document.createElement("div");
      when.className = "when";
      when.textContent = formatWhen(b.start);
      li.append(svc, when);
      bookingsEl.appendChild(li);
    }
  } catch {
    /* ignore */
  }
}

async function sendText(text) {
  addMessage("user", text);
  const typing = addMessage("agent typing", "…");
  try {
    const res = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, text }),
    });
    const data = await res.json();
    typing.remove();
    addMessage("agent", data.reply);
    speak(data.reply);
    refreshBookings();
  } catch {
    typing.remove();
    addMessage("agent", "Sorry, I couldn't reach the server. Please try again.");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendText(text);
});

// Voice input via the Web Speech API where available.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micButton.addEventListener("click", () => {
    try {
      recognition.start();
      micButton.classList.add("listening");
    } catch {
      /* already listening */
    }
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    micButton.classList.remove("listening");
    sendText(transcript);
    input.value = "";
  });

  recognition.addEventListener("end", () => micButton.classList.remove("listening"));
  recognition.addEventListener("error", () => micButton.classList.remove("listening"));
} else {
  micButton.title = "Voice input not supported in this browser";
  micButton.addEventListener("click", () => {
    addMessage("agent", "Voice input isn't supported here, but you can type your request.");
  });
}

async function init() {
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      statusDot.classList.add("ok");
      statusText.textContent = "Agent online";
    } else {
      throw new Error("bad status");
    }
  } catch {
    statusDot.classList.add("err");
    statusText.textContent = "Agent offline";
  }
  addMessage(
    "agent",
    "Hi! I'm your booking assistant. I can schedule haircuts, massages, manicures, and more. What would you like to book?",
  );
  refreshBookings();
}

init();
