const euro = (cents) => `${(cents / 100).toFixed(0)}€`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Typewriter with a cancellation token */
function type(el, text, token, speed = 24) {
  return new Promise((resolve) => {
    let i = 0;
    function step() {
      if (token.cancelled || !el.isConnected) return resolve();
      el.textContent = text.slice(0, i);
      const c = document.createElement("span");
      c.className = "cap-cursor";
      el.appendChild(c);
      if (i < text.length) { i++; setTimeout(step, speed); }
      else setTimeout(() => { if (c.parentNode) c.remove(); resolve(); }, 380);
    }
    step();
  });
}

/* ---------- Pricing ---------- */
async function loadPlans() {
  try {
    const res = await fetch("/api/plans");
    const { plans, setupFeeCents } = await res.json();
    const check = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>`;
    document.getElementById("plans").innerHTML = plans.map((plan) => {
      const featured = plan.id === "pro";
      return `<div class="plan${featured ? " featured" : ""}" data-reveal>
        ${featured ? `<span class="ribbon">Mais escolhido</span>` : ""}
        <div class="pname">${plan.name}</div>
        <div class="price">${euro(plan.priceCents)}<small> /mês</small></div>
        <div class="mins">${plan.includedMinutes} min incluídos · ${(plan.overageCentsPerMinute / 100).toFixed(2)}€/min extra</div>
        <ul>${plan.features.map((f) => `<li>${check}<span>${f}</span></li>`).join("")}</ul>
        <a href="#" class="btn ${featured ? "btn-primary" : "btn-ghost"} choose" data-plan="${plan.id}">Escolher ${plan.name}</a>
      </div>`;
    }).join("");
    document.getElementById("setupNote").textContent =
      `Quer manter o número atual? Tratamos da portabilidade por uma taxa única de ${euro(setupFeeCents)}.`;
    document.querySelectorAll(".choose").forEach((btn) =>
      btn.addEventListener("click", (e) => { e.preventDefault(); document.getElementById("plan").value = btn.dataset.plan; openModal(); }));
    observeReveals();
  } catch { /* keep page usable */ }
}

/* ---------- Modal ---------- */
const modal = document.getElementById("onboardModal");
function openModal() { setNavOpen(false); modal.classList.add("open"); }
function closeModal() { modal.classList.remove("open"); }
document.querySelectorAll("[data-open-modal]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); openModal(); }));
document.getElementById("closeOnboard").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeModal();
  setNavOpen(false);
});
document.getElementById("onboardForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const payload = {
    name: f.name.value, useCase: f.useCase.value, planId: f.planId.value,
    agentName: f.agentName.value, agentGender: f.agentGender.value, locale: f.locale.value,
    contactEmail: f.contactEmail.value, contactPhone: f.contactPhone.value, numberPreference: f.numberPreference.value,
  };
  const res = await fetch("/api/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.slug) window.location.href = `/app/${data.slug}?onboarded=1`;
  else alert("Não foi possível criar o assistente. Tente novamente.");
});

/* ---------- Mensagens de validação em português ---------- */
function ptValidationMessage(el) {
  const v = el.validity;
  if (v.valueMissing) return el.tagName === "SELECT" ? "Selecione uma opção." : "Preencha este campo.";
  if (v.typeMismatch) return el.type === "email" ? "Introduza um email válido." : "Valor inválido.";
  if (v.tooShort) return `Use pelo menos ${el.minLength} caracteres.`;
  if (v.tooLong) return `Use no máximo ${el.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `O valor mínimo é ${el.min}.`;
  if (v.rangeOverflow) return `O valor máximo é ${el.max}.`;
  if (v.stepMismatch) return "Introduza um valor válido.";
  if (v.patternMismatch) return "O formato não é válido.";
  if (v.badInput) return "Introduza um valor válido.";
  return "Preencha este campo corretamente.";
}
function localizeValidation(form) {
  if (!form) return;
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("invalid", () => el.setCustomValidity(ptValidationMessage(el)));
    const clear = () => el.setCustomValidity("");
    el.addEventListener("input", clear);
    el.addEventListener("change", clear);
  });
}
localizeValidation(document.getElementById("onboardForm"));

/* ---------- Reveal ---------- */
let revealObserver;
function observeReveals() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); revealObserver.unobserve(en.target); }
    }), { threshold: 0.12 });
  }
  document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => revealObserver.observe(el));
}

/* ---------- Count-up ---------- */
function animateCount(el) {
  const target = Number(el.dataset.count), suffix = el.dataset.suffix ?? "", dur = 1100, start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const countObserver = new IntersectionObserver((entries) => entries.forEach((en) => {
  if (en.isIntersecting) { animateCount(en.target); countObserver.unobserve(en.target); }
}), { threshold: 0.6 });
document.querySelectorAll("[data-count]").forEach((el) => countObserver.observe(el));

/* ---------- ROI ---------- */
const CONVERSION = 0.6, WEEKS = 4.33;
const calls = document.getElementById("calls"), ticket = document.getElementById("ticket");
const bizType = document.getElementById("bizType");
// Typical starting values per business type (average ticket €, missed calls/week).
const BIZ_PRESETS = {
  barbearia: { ticket: 15, calls: 12 },
  salao: { ticket: 35, calls: 12 },
  estetica: { ticket: 45, calls: 10 },
  clinica: { ticket: 60, calls: 14 },
  restaurante: { ticket: 30, calls: 18 },
  servicos: { ticket: 90, calls: 8 },
  outro: { ticket: 25, calls: 10 },
};
function applyPreset() {
  const p = BIZ_PRESETS[bizType.value] || BIZ_PRESETS.outro;
  ticket.value = Math.min(Number(ticket.max), p.ticket);
  calls.value = Math.min(Number(calls.max), p.calls);
  updateRoi();
}
function updateRoi() {
  const c = Number(calls.value), t = Number(ticket.value);
  document.getElementById("callsVal").textContent = c;
  document.getElementById("ticketVal").textContent = `${t}€`;
  const monthly = Math.round(c * WEEKS * t * CONVERSION);
  const el = document.getElementById("roiValue"), from = Number(el.textContent.replace(/\D/g, "")) || 0, start = performance.now();
  function tick(now) { const p = Math.min(1, (now - start) / 500); el.textContent = Math.round(from + (monthly - from) * p).toLocaleString("pt-PT"); if (p < 1) requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  document.getElementById("roiFoot").textContent = `Estimativa: ${Math.round(CONVERSION * 100)}% das chamadas recuperadas × ${t}€ × ${c}/semana.`;
}
calls.addEventListener("input", updateRoi);
ticket.addEventListener("input", updateRoi);
bizType.addEventListener("change", applyPreset);
updateRoi();

/* ---------- FAQ ---------- */
const FAQ = [
  ["Preciso de trocar de operador ou instalar alguma app?", "Não. Damos-lhe um número +351 novo que passa a publicar (Google, Instagram, à porta). O seu telemóvel pessoal continua pessoal. Se quiser manter o número atual, tratamos da portabilidade."],
  ["A voz soa a robô?", "Não. A Atende usa voz natural e percebe linguagem do dia-a-dia — \"queria marcar para sábado de manhã\" — sem menus de \"prima 1\"."],
  ["Como é que a agenda funciona?", "A Atende consulta o Google Calendar do negócio para ver horas livres e evitar conflitos e sobreposições. As marcações ficam na app Google Calendar do telemóvel — sem backoffice complicado."],
  ["E quando estou livre e quero atender?", "Tem um botão \"Disponível / Ocupado\". Em \"Disponível\", a chamada é transferida para o seu telemóvel; em \"Ocupado\", a Atende marca por si."],
  ["O número está mesmo incluído no preço?", "Sim. O custo do número +351 já está no valor do plano — sem taxas escondidas nem \"créditos\"."],
  ["Em nome de quem fica o número? E se eu quiser sair?", "O número é aprovisionado através da nossa operadora, com a sua empresa registada como utilizador (como a lei portuguesa exige para números nacionais). Na prática, o número é seu: temos uma garantia de portabilidade — se decidir sair, portamos o número para si, sem custos. Sem lock-in."],
  ["Tenho de tratar de papelada para ter o número?", "Quase nada. Precisamos apenas do NIF, morada e um comprovativo (e, para alguns números, a certidão de registo). Tratamos de todo o registo regulatório junto da operadora por si."],
  ["Posso cancelar quando quiser?", "Sim, a subscrição é mensal e cancela quando quiser, a partir do painel de faturação."],
];
document.getElementById("faqList").innerHTML = FAQ.map(([q, a]) => `
  <div class="faq-item" data-reveal>
    <button class="faq-q" aria-expanded="false">${q}
      <span class="pm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></span>
    </button>
    <div class="faq-a"><p>${a}</p></div>
  </div>`).join("");
document.querySelectorAll(".faq-q").forEach((btn) => btn.addEventListener("click", () => {
  const item = btn.closest(".faq-item"), ans = item.querySelector(".faq-a"), isOpen = item.classList.toggle("open");
  btn.setAttribute("aria-expanded", String(isOpen));
  ans.style.maxHeight = isOpen ? `${ans.scrollHeight}px` : "0";
}));

/* ---------- Header shrink + mobile menu ---------- */
const header = document.getElementById("header");
const navToggle = document.getElementById("navToggle");
const siteNav = document.getElementById("siteNav");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

function setNavOpen(open) {
  if (!header || !navToggle) return;
  header.classList.toggle("nav-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
}
navToggle?.addEventListener("click", () => setNavOpen(!header.classList.contains("nav-open")));
siteNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", (e) => {
    const href = link.getAttribute("href") || "";
    const target = href.startsWith("#") && href.length > 1 ? document.querySelector(href) : null;
    setNavOpen(false);
    if (!target) return;
    e.preventDefault();
    window.setTimeout(() => {
      if (href === "#demo-call") scrollToDemoCard();
      else target.scrollIntoView({ behavior: "smooth" });
    }, 0);
  });
});
document.addEventListener("click", (e) => {
  if (!header?.classList.contains("nav-open")) return;
  if (header.contains(e.target)) return;
  setNavOpen(false);
});
window.matchMedia("(min-width: 561px)").addEventListener("change", (e) => {
  if (e.matches) setNavOpen(false);
});

/* ---------- Homepage live clinic call (Grok Live 2) ---------- */
const HERO_IDLE_SPEAKER = "Sofia · assistente";
const HERO_IDLE_CAPTION = "Marcado, Miguel — consulta de dermatologia amanhã às 16h30. Envio confirmação por SMS.";

const heroSession = window.AtendeVoiceCall.create({
  slug: "clinica-central",
  els: {
    card: document.getElementById("heroCallcard"),
    liveLabel: document.getElementById("heroLiveLabel"),
    timer: document.getElementById("ccTimer"),
    avatar: document.getElementById("heroAvatar"),
    name: document.getElementById("heroAgentNm"),
    role: document.getElementById("heroAgentRl"),
    wave: document.getElementById("wave"),
    spk: document.getElementById("heroSpk"),
    txt: document.getElementById("heroTxt"),
    mute: document.getElementById("heroMute"),
    call: document.getElementById("heroCall"),
    callLabel: document.getElementById("heroCallLabel"),
    keypad: document.getElementById("heroKeypad"),
    micErr: document.getElementById("heroMicErr"),
    configErr: document.getElementById("heroConfigErr"),
  },
  ui: {
    keepLiveBadge: true,
    startLabel: "Iniciar chamada",
    idleSpeaker: HERO_IDLE_SPEAKER,
    idleCaption: HERO_IDLE_CAPTION,
    agentName: "Sofia",
  },
});

function scrollToDemoCard() {
  const card = document.getElementById("demo-call");
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function initHeroCall() {
  let slug = "clinica-central";
  let grokVoice = false;
  let agentName = "Sofia";
  try {
    const demoRes = await fetch("/api/demo");
    const demo = await demoRes.json();
    if (demo.slug) slug = demo.slug;
    grokVoice = Boolean(demo.features?.grokVoice);
    if (demo.agentName) agentName = demo.agentName;
  } catch { /* keep defaults */ }
  heroSession.setSlug(slug);
  await heroSession.init({
    slug,
    locale: "pt",
    agentName,
    grokVoice,
    idleSpeaker: HERO_IDLE_SPEAKER,
    idleCaption: HERO_IDLE_CAPTION,
  });
}

document.getElementById("heroDemoCta")?.addEventListener("click", (e) => {
  e.preventDefault();
  scrollToDemoCard();
  heroSession.startCall();
});
document.querySelectorAll('a[href="#demo-call"]').forEach((link) => {
  if (link.id === "heroDemoCta") return;
  if (siteNav?.contains(link)) return;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    scrollToDemoCard();
  });
});

initHeroCall();

/* ---------- Conversation examples ---------- */
const SCEN = {
  marcacao: {
    title: "Marcar hora · Barbearia",
    lines: [
      ["client", "Boa tarde, queria marcar um corte e barba."],
      ["agent", "Claro! Para que dia gostaria?"],
      ["client", "Sexta à tarde, se puder ser."],
      ["agent", "Sexta tenho às 16h00 ou às 17h30. Qual prefere?"],
      ["client", "17h30."],
      ["agent", "Em que nome fica a marcação?"],
      ["client", "Miguel."],
      ["agent", "Marcado, Miguel — sexta às 17h30, corte e barba. Envio SMS de confirmação."],
    ],
    chip: "Marcado · Corte + barba · sex 17:30",
  },
  remarcar: {
    title: "Remarcar · Clínica",
    lines: [
      ["client", "Tenho consulta amanhã mas preciso de mudar."],
      ["agent", "Sem problema. Encontrei a sua consulta de amanhã às 15h. Para quando prefere?"],
      ["client", "Pode ser quinta à mesma hora?"],
      ["agent", "Quinta às 15h está livre. Confirmo a remarcação?"],
      ["client", "Sim, obrigado."],
      ["agent", "Feito! Atualizei a agenda e envio a nova confirmação por SMS."],
    ],
    chip: "Remarcado · qui 15:00",
  },
  fora: {
    title: "Fora de horas · Restaurante",
    lines: [
      ["agent", "Restaurante Oliveira, fala a Sofia. Estamos fechados, mas posso tratar da sua reserva."],
      ["client", "Queria mesa para 4 no sábado às 20h."],
      ["agent", "Sábado às 20h temos mesa para 4. Em que nome reservo?"],
      ["client", "Em nome de Andrade."],
      ["agent", "Reservado, Sr. Andrade — sábado às 20h, mesa para 4. Até lá!"],
    ],
    chip: "Reserva fora de horas · sáb 20:00",
  },
  precos: {
    title: "Preços e serviços · Salão",
    lines: [
      ["client", "Quanto fica uma coloração?"],
      ["agent", "A coloração fica a 55€ e demora cerca de 90 minutos."],
      ["client", "E têm vaga esta quinta?"],
      ["agent", "Temos às 14h ou às 16h. Quer que marque?"],
      ["client", "Às 16h, por favor."],
      ["agent", "Marcado — quinta às 16h, coloração (55€). Envio confirmação."],
    ],
    chip: "Informado + marcado · qui 16:00",
  },
};
const SCEN_ORDER = ["marcacao", "remarcar", "fora", "precos"];
let exToken = { cancelled: true };
let exTimerId = null;

function setActiveTab(key) {
  document.querySelectorAll(".ex-tab").forEach((t) => t.classList.toggle("active", t.dataset.scenario === key));
}

function fillWave(el) {
  if (!el || el.childElementCount) return;
  for (let i = 0; i < 30; i++) {
    const b = document.createElement("i");
    b.style.animationDelay = `${(i * 0.045).toFixed(2)}s`;
    b.style.animationDuration = `${(0.8 + Math.random() * 0.7).toFixed(2)}s`;
    el.appendChild(b);
  }
}

function formatCallClock(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setExVoice(who) {
  const panel = document.getElementById("exPanel");
  const wave = document.getElementById("exWave");
  const avatar = document.getElementById("exAvatar");
  const listen = document.getElementById("exListen");
  const mode = who === "agent" ? "speaking" : who === "client" ? "listening" : "idle";
  if (panel) panel.dataset.voice = mode;
  if (wave) wave.className = `waveform ${mode}`;
  avatar?.classList.toggle("speaking", who === "agent");
  if (listen) listen.hidden = who === "agent";
}

function startExTimer(token) {
  if (exTimerId) clearInterval(exTimerId);
  const timer = document.getElementById("exTimer");
  let secs = 0;
  if (timer) timer.textContent = "00:00";
  exTimerId = setInterval(() => {
    if (token.cancelled) { clearInterval(exTimerId); exTimerId = null; return; }
    secs += 1;
    if (timer) timer.textContent = formatCallClock(secs);
  }, 1000);
}

async function runScenario(key, auto = true) {
  exToken.cancelled = true;
  const token = { cancelled: false };
  exToken = token;
  const sc = SCEN[key];
  const spk = document.getElementById("exSpk");
  const txt = document.getElementById("exTxt");
  const chip = document.getElementById("exChip");
  const title = document.getElementById("exTitle");
  fillWave(document.getElementById("exWave"));
  setActiveTab(key);
  if (title) title.textContent = sc.title;
  if (chip) { chip.hidden = true; chip.replaceChildren(); }
  if (spk) { spk.textContent = "A atender…"; spk.removeAttribute("data-who"); }
  if (txt) txt.textContent = "";
  setExVoice(null);
  startExTimer(token);
  for (const [who, text] of sc.lines) {
    if (token.cancelled) return;
    setExVoice(who);
    if (spk) {
      spk.textContent = who === "agent" ? "Sofia · assistente" : "Cliente";
      spk.dataset.who = who;
    }
    if (txt) await type(txt, text, token, 20);
    await sleep(480);
    if (token.cancelled) return;
    setExVoice(null);
    await sleep(240);
  }
  if (token.cancelled) return;
  setExVoice(null);
  if (spk) { spk.textContent = "Chamada"; spk.removeAttribute("data-who"); }
  if (chip) {
    chip.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg> ${sc.chip}`;
    chip.hidden = false;
  }
  if (!auto) return;
  await sleep(2800);
  if (token.cancelled) return;
  const next = SCEN_ORDER[(SCEN_ORDER.indexOf(key) + 1) % SCEN_ORDER.length];
  runScenario(next, true);
}
document.querySelectorAll(".ex-tab").forEach((tab) =>
  tab.addEventListener("click", () => runScenario(tab.dataset.scenario, false)));

// Start the examples animation only once it scrolls into view.
const exPanel = document.getElementById("exPanel");
if (exPanel) {
  fillWave(document.getElementById("exWave"));
  const exObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { exObs.disconnect(); runScenario("marcacao", true); } });
  }, { threshold: 0.3 });
  exObs.observe(exPanel);
}

document.getElementById("year").textContent = new Date().getFullYear();
observeReveals();
loadPlans();
