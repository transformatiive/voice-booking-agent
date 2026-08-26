const slug = location.pathname.split("/").pop();
const euro = (c) => (c == null ? "—" : `${(c / 100).toFixed(0)}€`);
const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const TZ = "Europe/Lisbon";
let state = null;
let currentTab = "agenda";

const ICONS = {
  agenda: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  recursos: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3"/><path d="M15 8a3 3 0 1 0 0-.01M2 21a7 7 0 0 1 14 0M16 14a7 7 0 0 1 6 7"/></svg>',
  servicos: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  horarios: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  assistente: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/></svg>',
  faturacao: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
};
const TABS = [
  ["agenda", "Agenda"],
  ["recursos", "Recursos"],
  ["servicos", "Serviços"],
  ["horarios", "Horários"],
  ["assistente", "Assistente"],
  ["faturacao", "Faturação"],
];

const main = () => document.getElementById("main");
function flash(msg, kind = "ok") {
  const el = document.createElement("div");
  el.className = `flash ${kind}`;
  el.textContent = msg;
  main().prepend(el);
  setTimeout(() => el.remove(), 3500);
}

async function load() {
  const res = await fetch(`/api/business/${slug}`);
  if (!res.ok) {
    document.getElementById("bizName").textContent = "Negócio não encontrado";
    main().innerHTML = `<div class="panel"><p>Não encontrámos este negócio.</p></div>`;
    return;
  }
  state = await res.json();
  const b = state.business;
  document.getElementById("bizName").textContent = b.name;
  document.getElementById("bizMeta").textContent = `${b.plan.name} · assistente ${b.agentName}`;
  document.getElementById("demoLink").href = `/demo/${slug}`;
  if (b.status !== "active") {
    renderNav(false);
    renderPending(b);
  } else {
    renderNav(true);
    render(currentTab);
  }
}

function renderNav(active) {
  const nav = document.getElementById("nav");
  if (!active) { nav.innerHTML = ""; return; }
  nav.innerHTML = TABS.map(([id, label]) =>
    `<a class="nav-item ${id === currentTab ? "active" : ""}" data-tab="${id}">${ICONS[id]} ${label}</a>`,
  ).join("");
  nav.querySelectorAll(".nav-item").forEach((a) =>
    a.addEventListener("click", () => { currentTab = a.dataset.tab; renderNav(true); render(currentTab); }),
  );
}

function fmtWhen(iso) {
  return new Date(iso).toLocaleString("pt-PT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function fmtDayLabel(iso) {
  return new Date(iso).toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}
function hm(min) { return min == null ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
function toMin(v) { if (!v) return null; const [h, m] = v.split(":").map(Number); return h * 60 + m; }

function topbar(title, subtitle) {
  const b = state.business;
  const num = b.number;
  return `<div class="topbar">
    <div><h1>${title}</h1><div class="subtitle">${subtitle || ""}</div></div>
    <div class="topbar-actions">
      <span class="chip ${num ? "ok" : "warn"}"><span class="dot"></span>${num ? num.e164 : "sem número"}</span>
      <span class="chip">${b.plan.name}</span>
    </div>
  </div>`;
}

function render(tab) {
  const fns = { agenda: renderAgenda, recursos: renderRecursos, servicos: renderServicos, horarios: renderHorarios, assistente: renderAssistente, faturacao: renderFaturacao };
  (fns[tab] || renderAgenda)();
}

/* ---------- Pending ---------- */
function renderPending(b) {
  const numLine = b.numberPreference === "port" ? "Portabilidade do seu número atual" : "Atribuição de um número +351";
  main().innerHTML = `
    <div class="pending-wrap">
      <div class="badge"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <h1>Estamos a preparar a sua conta</h1>
      <p class="lead">Recebemos os seus dados. Vamos tratar do número e da configuração de voz e avisamos por email assim que estiver pronto — normalmente em pouco tempo.</p>
      <ul class="checklist">
        <li><span class="ic done">✓</span><span class="txt">Dados recebidos<small>${b.name} · plano ${b.plan.name}</small></span></li>
        <li><span class="ic wait">•</span><span class="txt">${numLine}<small>Tratamos da papelada regulatória por si</small></span></li>
        <li><span class="ic wait">•</span><span class="txt">Configuração de voz (SIP)<small>Ligamos o número ao assistente ${b.agentName}</small></span></li>
        <li><span class="ic soon">•</span><span class="txt">Ativação<small>O backoffice fica disponível quando estiver pronto</small></span></li>
      </ul>
      <div class="pending-recap">
        <strong>O que nos disse:</strong> ${b.name} · ${labelUseCase(b.useCase)} · assistente ${b.agentName} (${b.locale.toUpperCase()})${b.contactEmail ? ` · ${b.contactEmail}` : ""}
      </div>
      <button class="btn btn-primary" id="activateBtn">Ver o backoffice (demonstração)</button>
      <div class="subtitle" style="margin-top:10px; color:var(--muted); font-size:13px;">Numa conta real, a ativação é automática quando terminarmos a configuração.</div>
    </div>`;
  document.getElementById("activateBtn").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = "A ativar…";
    const res = await fetch(`/api/business/${slug}/activate`, { method: "POST" });
    if (res.ok) { currentTab = "agenda"; await load(); } else { flash("Não foi possível ativar.", "err"); }
  });
}
function labelUseCase(u) {
  return { barbearia: "Barbearia", salao: "Salão", clinica: "Clínica", restaurante: "Restaurante", outro: "Outro" }[u] || u;
}

/* ---------- Agenda ---------- */
function renderAgenda() {
  const bookings = [...state.bookings].sort((a, b) => a.start.localeCompare(b.start));
  let body;
  if (!bookings.length) {
    body = `<div class="empty-state">Ainda não há marcações. Aparecem aqui e no seu Google Calendar assim que o assistente marcar.</div>`;
  } else {
    const groups = {};
    for (const bk of bookings) {
      const key = fmtDayLabel(bk.start);
      (groups[key] ||= []).push(bk);
    }
    body = Object.entries(groups).map(([day, items]) =>
      `<div class="agenda-day">${day.charAt(0).toUpperCase() + day.slice(1)}</div>` +
      items.map((bk) =>
        `<div class="agenda-item"><span class="time">${fmtTime(bk.start)}</span><div class="grow"><div class="svc">${bk.serviceName}</div><div class="who">${bk.customerName || "Sem nome"}${bk.customerPhone ? " · " + bk.customerPhone : ""} · ${bk.source}</div></div></div>`,
      ).join(""),
    ).join("");
  }
  main().innerHTML = topbar("Agenda", "As marcações do assistente, sincronizadas com o Google Calendar.") + `<div class="panel">${body}</div>`;
}

/* ---------- Recursos ---------- */
function renderRecursos() {
  const b = state.business;
  const items = b.resources.map((r, i) => `
    <div class="list-item">
      <div class="grow">
        <input class="r-name" data-i="${i}" value="${r.name}" style="margin-bottom:8px" />
        <input class="r-num" data-i="${i}" value="${r.transferNumber || ""}" placeholder="Telemóvel para transferência (+3519…)" />
      </div>
      <span class="pill ${r.available ? "ok" : "warn"} toggle-pill" data-rid="${r.id}">${r.available ? "Disponível" : "Ocupado"}</span>
    </div>`).join("");
  main().innerHTML = topbar("Recursos", "As pessoas ou espaços que recebem marcações.") + `
    <div class="panel">
      ${items || `<div class="empty-state">Sem recursos.</div>`}
      <div style="display:flex; gap:10px; margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="addResource">+ Adicionar</button>
        <button class="btn btn-primary btn-sm" id="saveResources">Guardar</button>
      </div>
      <p class="panel-hint" style="margin:12px 0 0;">Toque no estado para alternar <strong>Disponível / Ocupado</strong> — controla a transferência de chamada.</p>
    </div>`;
  bindToggles();
  document.getElementById("addResource").addEventListener("click", () => {
    b.resources.push({ id: crypto.randomUUID(), name: "Novo recurso", transferNumber: null, available: true, calUserId: null });
    renderRecursos();
  });
  document.getElementById("saveResources").addEventListener("click", async () => {
    const names = [...document.querySelectorAll(".r-name")];
    const nums = [...document.querySelectorAll(".r-num")];
    b.resources = b.resources.map((r, i) => ({ ...r, name: names[i]?.value || r.name, transferNumber: nums[i]?.value.trim() || null }));
    await patch({ resources: b.resources });
  });
}
function bindToggles() {
  document.querySelectorAll(".toggle-pill").forEach((el) =>
    el.addEventListener("click", async () => {
      const res = await fetch(`/api/business/${slug}/resource/${el.dataset.rid}/toggle`, { method: "POST" });
      if (res.ok) { await reloadState(); renderRecursos(); }
    }),
  );
}

/* ---------- Serviços ---------- */
function renderServicos() {
  const b = state.business;
  const items = b.services.map((s, i) => `
    <div class="list-item">
      <input class="s-name" data-i="${i}" value="${s.name}" class="grow" style="flex:2" />
      <input class="s-dur" data-i="${i}" type="number" value="${s.durationMinutes}" style="width:90px" title="minutos" />
      <input class="s-price" data-i="${i}" type="number" value="${s.priceCents != null ? s.priceCents / 100 : ""}" placeholder="€" style="width:90px" />
    </div>`).join("");
  main().innerHTML = topbar("Serviços", "O que os clientes podem marcar, e a duração.") + `
    <div class="panel">
      <div class="list-head"><span style="flex:2">Nome</span><span style="width:90px">Min</span><span style="width:90px">Preço €</span></div>
      ${items}
      <div style="display:flex; gap:10px; margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="addService">+ Adicionar</button>
        <button class="btn btn-primary btn-sm" id="saveServices">Guardar</button>
      </div>
    </div>`;
  document.getElementById("addService").addEventListener("click", () => {
    b.services.push({ id: crypto.randomUUID(), name: "Novo serviço", durationMinutes: 30, priceCents: null, calEventTypeId: null });
    renderServicos();
  });
  document.getElementById("saveServices").addEventListener("click", async () => {
    const names = [...document.querySelectorAll(".s-name")];
    const durs = [...document.querySelectorAll(".s-dur")];
    const prices = [...document.querySelectorAll(".s-price")];
    b.services = b.services.map((s, i) => ({
      ...s,
      name: names[i]?.value || s.name,
      durationMinutes: Number(durs[i]?.value) || s.durationMinutes,
      priceCents: prices[i]?.value ? Math.round(Number(prices[i].value) * 100) : null,
    }));
    await patch({ services: b.services });
  });
}

/* ---------- Horários ---------- */
function renderHorarios() {
  const b = state.business;
  const rows = b.hours.map((d, i) => `
    <div class="list-item">
      <span class="grow">${DAYS[i]}</span>
      <input type="time" class="h-open" data-i="${i}" value="${hm(d.open)}" style="width:120px" />
      <input type="time" class="h-close" data-i="${i}" value="${hm(d.close)}" style="width:120px" />
      <label style="display:flex; align-items:center; gap:6px; white-space:nowrap; font-size:13px; color:var(--muted)"><input type="checkbox" class="h-closed" data-i="${i}" ${d.open == null ? "checked" : ""} style="width:auto"/> fechado</label>
    </div>`).join("");
  main().innerHTML = topbar("Horários", "Quando o negócio está aberto para marcações.") + `
    <div class="panel">${rows}<button class="btn btn-primary btn-sm" id="saveHours" style="margin-top:12px">Guardar</button></div>`;
  document.getElementById("saveHours").addEventListener("click", async () => {
    const opens = [...document.querySelectorAll(".h-open")];
    const closes = [...document.querySelectorAll(".h-close")];
    const closed = [...document.querySelectorAll(".h-closed")];
    const hours = b.hours.map((_, i) => (closed[i].checked ? { open: null, close: null } : { open: toMin(opens[i].value), close: toMin(closes[i].value) }));
    await patch({ hours });
  });
}

/* ---------- Assistente ---------- */
function renderAssistente() {
  const b = state.business;
  main().innerHTML = topbar("Assistente", "Como o assistente se apresenta ao atender.") + `
    <div class="panel">
      <div class="row2">
        <div class="field"><label>Nome do assistente</label><input id="a-name" value="${b.agentName}" /></div>
        <div class="field"><label>Voz</label><select id="a-gender">${["feminino", "masculino", "neutro"].map((g) => `<option ${b.agentGender === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Idioma</label><select id="a-locale"><option value="pt" ${b.locale === "pt" ? "selected" : ""}>Português</option><option value="en" ${b.locale === "en" ? "selected" : ""}>Inglês</option></select></div>
      <button class="btn btn-primary btn-sm" id="saveAssistant">Guardar</button>
    </div>`;
  document.getElementById("saveAssistant").addEventListener("click", async () => {
    await patch({ agentName: document.getElementById("a-name").value, agentGender: document.getElementById("a-gender").value, locale: document.getElementById("a-locale").value });
  });
}

/* ---------- Faturação ---------- */
function renderFaturacao() {
  const b = state.business, sub = b.subscription;
  const statusMap = { active: "ok", trialing: "warn", past_due: "warn", canceled: "off", none: "off" };
  main().innerHTML = topbar("Faturação", "O seu plano e subscrição.") + `
    <div class="panel">
      <div class="kv"><span class="k">Plano</span><strong>${b.plan.name} · ${euro(b.plan.priceCents)}/mês</strong></div>
      <div class="kv"><span class="k">Estado</span><span class="pill ${statusMap[sub.status] || "off"}">${sub.status}</span></div>
      <div class="kv"><span class="k">Minutos incluídos</span><span>${sub.usedMinutes} / ${sub.includedMinutes}</span></div>
      <div class="kv"><span class="k">Número incluído</span><span>${b.number ? b.number.e164 : "—"}</span></div>
      <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
        ${["base", "pro", "studio"].map((p) => `<button class="btn ${p === sub.planId ? "btn-primary" : "btn-ghost"} btn-sm co" data-plan="${p}">${p === sub.planId ? "Plano atual" : "Mudar para " + p}</button>`).join("")}
        <button class="btn btn-ghost btn-sm" id="portal">Gerir subscrição</button>
      </div>
      ${state.features.stripe ? "" : `<p class="panel-hint" style="margin:12px 0 0;">Modo demonstração — o pagamento real fica ativo quando as chaves Stripe estiverem configuradas.</p>`}
    </div>`;
  document.querySelectorAll(".co").forEach((btn) => btn.addEventListener("click", () => checkout(btn.dataset.plan)));
  document.getElementById("portal").addEventListener("click", portal);
}
async function checkout(planId) {
  const res = await fetch(`/api/business/${slug}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else flash(`Checkout indisponível (${data.error || "erro"}).`, "err");
}
async function portal() {
  const res = await fetch(`/api/business/${slug}/portal`, { method: "POST" });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else flash(`Portal indisponível (${data.error || "erro"}).`, "err");
}

/* ---------- Helpers ---------- */
async function reloadState() {
  const res = await fetch(`/api/business/${slug}`);
  if (res.ok) state = await res.json();
}
async function patch(body) {
  const res = await fetch(`/api/business/${slug}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) { await reloadState(); render(currentTab); flash("Guardado."); }
  else flash("Falha ao guardar.", "err");
}

load();
