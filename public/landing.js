const euro = (cents) => `${(cents / 100).toFixed(0)}€`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Pricing (from the backend) ---------- */
async function loadPlans() {
  try {
    const res = await fetch("/api/plans");
    const { plans, setupFeeCents } = await res.json();
    const wrap = document.getElementById("plans");
    const check = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>`;
    wrap.innerHTML = plans
      .map((plan) => {
        const featured = plan.id === "pro";
        return `
        <div class="plan${featured ? " featured" : ""}" data-reveal>
          ${featured ? `<span class="ribbon">Mais escolhido</span>` : ""}
          <div class="pname">${plan.name}</div>
          <div class="price">${euro(plan.priceCents)}<small> /mês</small></div>
          <div class="mins">${plan.includedMinutes} min incluídos · ${(plan.overageCentsPerMinute / 100).toFixed(2)}€/min extra</div>
          <ul>${plan.features.map((f) => `<li>${check}<span>${f}</span></li>`).join("")}</ul>
          <a href="#" class="btn ${featured ? "btn-primary" : "btn-ghost"} choose" data-plan="${plan.id}">Escolher ${plan.name}</a>
        </div>`;
      })
      .join("");
    document.getElementById("setupNote").textContent =
      `Quer manter o número atual? Tratamos da portabilidade por uma taxa única de ${euro(setupFeeCents)}.`;
    wrap.querySelectorAll(".choose").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("plan").value = btn.dataset.plan;
        openModal();
      }),
    );
    observeReveals();
  } catch {
    /* keep the page usable even if plans fail to load */
  }
}

/* ---------- Modal ---------- */
const modal = document.getElementById("onboardModal");
function openModal() { modal.classList.add("open"); }
function closeModal() { modal.classList.remove("open"); }
document.querySelectorAll("[data-open-modal]").forEach((el) =>
  el.addEventListener("click", (e) => { e.preventDefault(); openModal(); }),
);
document.getElementById("closeOnboard").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

document.getElementById("onboardForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const payload = {
    name: f.name.value, useCase: f.useCase.value, planId: f.planId.value,
    agentName: f.agentName.value, agentGender: f.agentGender.value, locale: f.locale.value,
  };
  const res = await fetch("/api/onboard", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.slug) window.location.href = `/app/${data.slug}?onboarded=1`;
  else alert("Não foi possível criar o assistente. Tente novamente.");
});

/* ---------- Scroll reveal ---------- */
let revealObserver;
function observeReveals() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revealObserver.unobserve(en.target); } }),
      { threshold: 0.14 },
    );
  }
  document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => revealObserver.observe(el));
}

/* ---------- Count-up ---------- */
function animateCount(el) {
  const target = Number(el.dataset.count);
  const suffix = el.dataset.suffix ?? "";
  const dur = 1100;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const countObserver = new IntersectionObserver(
  (entries) => entries.forEach((en) => { if (en.isIntersecting) { animateCount(en.target); countObserver.unobserve(en.target); } }),
  { threshold: 0.6 },
);
document.querySelectorAll("[data-count]").forEach((el) => countObserver.observe(el));

/* ---------- ROI calculator ---------- */
const CONVERSION = 0.6; // share of recovered calls that become bookings
const WEEKS = 4.33;
const calls = document.getElementById("calls");
const ticket = document.getElementById("ticket");
function updateRoi() {
  const c = Number(calls.value);
  const t = Number(ticket.value);
  document.getElementById("callsVal").textContent = c;
  document.getElementById("ticketVal").textContent = `${t}€`;
  const monthly = Math.round(c * WEEKS * t * CONVERSION);
  const el = document.getElementById("roiValue");
  const from = Number(el.textContent.replace(/\D/g, "")) || 0;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / 500);
    el.textContent = Math.round(from + (monthly - from) * p).toLocaleString("pt-PT");
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  document.getElementById("roiFoot").textContent =
    `Estimativa: ${Math.round(CONVERSION * 100)}% das chamadas recuperadas × ${t}€ × ${c}/semana.`;
}
calls.addEventListener("input", updateRoi);
ticket.addEventListener("input", updateRoi);
updateRoi();

/* ---------- FAQ ---------- */
const FAQ = [
  ["Preciso de trocar de operador ou instalar alguma app?", "Não. Damos-lhe um número +351 novo que passa a publicar (Google, Instagram, à porta). O seu telemóvel pessoal continua pessoal. Se quiser manter o número atual, tratamos da portabilidade."],
  ["A voz soa a robô?", "Não. A Atende usa voz natural e percebe linguagem do dia-a-dia — \"corte e barba para sábado de manhã\" — sem menus de \"prima 1\"."],
  ["Como é que a agenda funciona?", "O agendamento assenta no Cal.com com sincronização para o Google Calendar. Na prática, a sua agenda é a app Google Calendar do telemóvel — sem backoffice complicado."],
  ["E quando estou livre e quero atender?", "Tem um botão \"Disponível / A cortar\". Em \"Disponível\", a chamada é transferida para o seu telemóvel; em \"A cortar\", a Atende marca por si."],
  ["O número está mesmo incluído no preço?", "Sim. O custo do número +351 já está no valor do plano — sem taxas escondidas nem \"créditos\"."],
  ["Posso cancelar quando quiser?", "Sim, a subscrição é mensal e cancela quando quiser, a partir do painel de faturação."],
];
document.getElementById("faq").innerHTML = FAQ.map(([q, a], i) => `
  <div class="faq-item" data-reveal>
    <button class="faq-q" data-i="${i}" aria-expanded="false">${q}
      <span class="pm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></span>
    </button>
    <div class="faq-a"><p>${a}</p></div>
  </div>`).join("");
document.querySelectorAll(".faq-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq-item");
    const ans = item.querySelector(".faq-a");
    const isOpen = item.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(isOpen));
    ans.style.maxHeight = isOpen ? `${ans.scrollHeight}px` : "0";
  });
});

/* ---------- Header shrink ---------- */
const header = document.getElementById("header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- Live call animation ---------- */
const CALL = [
  ["client", "Cliente", "Boa tarde! Queria marcar um corte para amanhã."],
  ["agent", "Sofia", "Com certeza. Tenho às 15h00 ou às 16h30 — qual prefere?"],
  ["client", "Cliente", "Às 16h30, com o João, se der."],
  ["agent", "Sofia", "Fica com o João, amanhã às 16h30. Em que nome marco?"],
  ["client", "Cliente", "Miguel Sousa."],
  ["agent", "Sofia", "Marcado, Miguel! Envio confirmação por SMS. Até amanhã. 👋"],
];
async function runCall() {
  const box = document.getElementById("transcript");
  if (!box) return;
  while (true) {
    box.innerHTML = "";
    for (const [who, lbl, text] of CALL) {
      const el = document.createElement("div");
      el.className = `line ${who}`;
      el.innerHTML = `<span class="lbl">${lbl}</span>${text}`;
      box.appendChild(el);
      box.scrollTop = box.scrollHeight;
      await sleep(1500);
    }
    const chip = document.createElement("div");
    chip.className = "booked-chip";
    chip.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg> Marcado · Corte c/ João · amanhã 16:30`;
    box.appendChild(chip);
    box.scrollTop = box.scrollHeight;
    await sleep(4200);
  }
}

document.getElementById("year").textContent = new Date().getFullYear();
observeReveals();
loadPlans();
runCall();
