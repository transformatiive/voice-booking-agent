const slug = location.pathname.split("/").pop();
const euro = (cents) => (cents == null ? "—" : `${(cents / 100).toFixed(0)}€`);
const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
let state = null;

function flash(msg, kind = "ok") {
  const el = document.getElementById("flash");
  el.innerHTML = `<div class="flash ${kind}">${msg}</div>`;
  setTimeout(() => (el.innerHTML = ""), 3500);
}

async function load() {
  const res = await fetch(`/api/business/${slug}`);
  if (!res.ok) {
    document.getElementById("bizName").textContent = "Negócio não encontrado";
    return;
  }
  state = await res.json();
  document.getElementById("demoLink").href = `/demo/${slug}`;
  render();
}

function hm(minutes) {
  if (minutes == null) return "";
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}
function toMin(value) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function render() {
  const b = state.business;
  const sub = b.subscription;
  document.getElementById("bizName").textContent = b.name;
  document.getElementById("bizMeta").textContent =
    `${b.slug} · plano ${b.plan.name} · assistente ${b.agentName} (${b.locale.toUpperCase()})`;

  renderOverview(b);
  renderAssistant(b);
  renderResources(b);
  renderServices(b);
  renderHours(b);
  renderScheduling(b);
  renderBilling(b, sub);
  renderBookings();
}

function subPill(status) {
  const map = { active: "ok", trialing: "warn", past_due: "err", canceled: "off", none: "off" };
  return `<span class="pill ${map[status] || "off"}">${status}</span>`;
}

function renderOverview(b) {
  const num = b.number;
  const base = location.origin;
  document.getElementById("tab-overview").innerHTML = `
    <div class="panel-card">
      <h2>Número de telefone</h2>
      <div class="kv"><span>Número</span><strong>${num ? num.e164 : "— sem número —"}</strong></div>
      <div class="kv"><span>Estado</span>${num ? `<span class="pill ok">${num.status}</span>` : `<span class="pill off">nenhum</span>`}</div>
      <div class="kv"><span>Fornecedor</span><span>${state.telephonyProvider}${num ? ` (${num.type})` : ""}</span></div>
      <div style="margin-top:14px; display:flex; gap:10px;">
        <button class="btn btn-primary btn-sm" id="provMobile">Obter número +351 9…</button>
        <button class="btn btn-ghost btn-sm" id="provGeo">Número geográfico</button>
      </div>
    </div>
    <div class="panel-card">
      <h2>Webhooks de voz (para o operador SIP / Retell / Vapi)</h2>
      <div class="kv"><span>Chamada recebida (TeXML)</span><code>${base}/voice/incoming/${b.slug}</code></div>
      <div class="kv"><span>Funções do agente</span><code>${base}/voice/functions/${b.slug}</code></div>
      <p class="muted" style="margin-top:10px; font-size:13px;">Aponte o DID (via SIP) para o stack de voz; o agente usa estes endpoints para ler serviços, ver horas e marcar.</p>
    </div>`;
  document.getElementById("provMobile").addEventListener("click", () => provision("mobile"));
  document.getElementById("provGeo").addEventListener("click", () => provision("geographic"));
}

async function provision(type) {
  const res = await fetch(`/api/business/${slug}/number`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
  const data = await res.json();
  if (res.ok) {
    flash(`Número atribuído: ${data.number.e164}`);
    await load();
  } else {
    flash(`Falha ao obter número: ${data.error || "erro"}`, "err");
  }
}

function renderAssistant(b) {
  document.getElementById("tab-assistant").innerHTML = `
    <div class="panel-card">
      <h2>Assistente</h2>
      <div class="row">
        <div><label>Nome do assistente</label><input id="a-name" value="${b.agentName}"></div>
        <div><label>Voz</label>
          <select id="a-gender">
            ${["feminino","masculino","neutro"].map((g) => `<option ${b.agentGender===g?"selected":""}>${g}</option>`).join("")}
          </select>
        </div>
      </div>
      <label>Idioma</label>
      <select id="a-locale">
        <option value="pt" ${b.locale==="pt"?"selected":""}>Português</option>
        <option value="en" ${b.locale==="en"?"selected":""}>Inglês</option>
      </select>
      <button class="btn btn-primary btn-sm" id="saveAssistant" style="margin-top:16px">Guardar</button>
    </div>`;
  document.getElementById("saveAssistant").addEventListener("click", async () => {
    await patch({
      agentName: document.getElementById("a-name").value,
      agentGender: document.getElementById("a-gender").value,
      locale: document.getElementById("a-locale").value,
    });
  });
}

function renderResources(b) {
  const items = b.resources.map((r, i) => `
    <div class="list-item">
      <div style="flex:1">
        <input data-i="${i}" class="r-name" value="${r.name}" style="margin-bottom:6px" />
        <input data-i="${i}" class="r-num" value="${r.transferNumber || ""}" placeholder="+3519… (telemóvel para transferência)" />
      </div>
      <label class="toggle">
        <span class="pill ${r.available ? "ok" : "warn"}" data-rid="${r.id}" data-toggle>${r.available ? "Disponível" : "A cortar"}</span>
      </label>
    </div>`).join("");
  document.getElementById("tab-resources").innerHTML = `
    <div class="panel-card">
      <h2>Recursos (barbeiros / cadeiras)</h2>
      ${items}
      <div style="display:flex; gap:10px; margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="addResource">+ Adicionar recurso</button>
        <button class="btn btn-primary btn-sm" id="saveResources">Guardar</button>
      </div>
      <p class="muted" style="font-size:13px; margin-top:10px;">Toque no estado para alternar <strong>Disponível / A cortar</strong> — controla a transferência de chamada.</p>
    </div>`;
  document.querySelectorAll("[data-toggle]").forEach((el) =>
    el.addEventListener("click", () => toggleResource(el.dataset.rid)),
  );
  document.getElementById("addResource").addEventListener("click", () => {
    state.business.resources.push({ id: crypto.randomUUID(), name: "Novo recurso", transferNumber: null, available: true, calUserId: null });
    renderResources(state.business);
    document.querySelectorAll("[data-toggle]").forEach((el) => el.addEventListener("click", () => toggleResource(el.dataset.rid)));
  });
  document.getElementById("saveResources").addEventListener("click", async () => {
    const names = [...document.querySelectorAll(".r-name")];
    const nums = [...document.querySelectorAll(".r-num")];
    state.business.resources = state.business.resources.map((r, i) => ({
      ...r,
      name: names[i]?.value || r.name,
      transferNumber: nums[i]?.value.trim() || null,
    }));
    await patch({ resources: state.business.resources });
  });
}

async function toggleResource(rid) {
  const res = await fetch(`/api/business/${slug}/resource/${rid}/toggle`, { method: "POST" });
  if (res.ok) { await load(); switchTab("resources"); }
}

function renderServices(b) {
  const items = b.services.map((s, i) => `
    <div class="list-item">
      <input data-i="${i}" class="s-name" value="${s.name}" style="flex:2" />
      <input data-i="${i}" class="s-dur" type="number" value="${s.durationMinutes}" style="width:90px" title="minutos" />
      <input data-i="${i}" class="s-price" type="number" value="${s.priceCents != null ? s.priceCents/100 : ""}" placeholder="€" style="width:90px" />
    </div>`).join("");
  document.getElementById("tab-services").innerHTML = `
    <div class="panel-card">
      <h2>Serviços</h2>
      <div class="list-item" style="background:transparent"><span style="flex:2" class="muted">Nome</span><span style="width:90px" class="muted">Min</span><span style="width:90px" class="muted">Preço €</span></div>
      ${items}
      <div style="display:flex; gap:10px; margin-top:12px;">
        <button class="btn btn-ghost btn-sm" id="addService">+ Adicionar</button>
        <button class="btn btn-primary btn-sm" id="saveServices">Guardar</button>
      </div>
    </div>`;
  document.getElementById("addService").addEventListener("click", () => {
    state.business.services.push({ id: crypto.randomUUID(), name: "Novo serviço", durationMinutes: 30, priceCents: null, calEventTypeId: null });
    renderServices(state.business);
  });
  document.getElementById("saveServices").addEventListener("click", async () => {
    const names = [...document.querySelectorAll(".s-name")];
    const durs = [...document.querySelectorAll(".s-dur")];
    const prices = [...document.querySelectorAll(".s-price")];
    state.business.services = state.business.services.map((s, i) => ({
      ...s,
      name: names[i]?.value || s.name,
      durationMinutes: Number(durs[i]?.value) || s.durationMinutes,
      priceCents: prices[i]?.value ? Math.round(Number(prices[i].value) * 100) : null,
    }));
    await patch({ services: state.business.services });
  });
}

function renderHours(b) {
  const rows = b.hours.map((d, i) => `
    <div class="list-item">
      <span style="flex:1">${DAYS[i]}</span>
      <input type="time" class="h-open" data-i="${i}" value="${hm(d.open)}" />
      <input type="time" class="h-close" data-i="${i}" value="${hm(d.close)}" />
      <label class="toggle"><input type="checkbox" class="h-closed" data-i="${i}" ${d.open==null?"checked":""}/> fechado</label>
    </div>`).join("");
  document.getElementById("tab-hours").innerHTML = `
    <div class="panel-card">
      <h2>Horários</h2>
      ${rows}
      <button class="btn btn-primary btn-sm" id="saveHours" style="margin-top:12px">Guardar</button>
    </div>`;
  document.getElementById("saveHours").addEventListener("click", async () => {
    const opens = [...document.querySelectorAll(".h-open")];
    const closes = [...document.querySelectorAll(".h-close")];
    const closed = [...document.querySelectorAll(".h-closed")];
    const hours = b.hours.map((_, i) =>
      closed[i].checked ? { open: null, close: null } : { open: toMin(opens[i].value), close: toMin(closes[i].value) },
    );
    await patch({ hours });
  });
}

function renderScheduling(b) {
  const connected = b.calApiKey === "set";
  document.getElementById("tab-scheduling").innerHTML = `
    <div class="panel-card">
      <h2>Agenda — Cal.com + Google Calendar</h2>
      <p class="muted" style="font-size:14px">O Cal.com é o cérebro de agendamento. Ligue o Google Calendar dentro do Cal.com para sincronização automática — a sua agenda passa a ser a app Google Calendar do telemóvel.</p>
      <div class="kv"><span>Cal.com</span>${connected ? `<span class="pill ok">ligado</span>` : `<span class="pill off">não ligado</span>`}</div>
      <div class="kv"><span>Cal.com global</span>${state.features.calcom ? `<span class="pill ok">configurado</span>` : `<span class="pill off">em falta</span>`}</div>
      <label>Chave API Cal.com (por negócio, opcional)</label>
      <input id="cal-key" placeholder="cal_live_…" />
      <button class="btn btn-primary btn-sm" id="saveCal" style="margin-top:14px">Ligar</button>
      <p class="muted" style="font-size:13px; margin-top:10px;">Sem Cal.com, o assistente usa o motor de disponibilidade interno (demo).</p>
    </div>`;
  document.getElementById("saveCal").addEventListener("click", async () => {
    await patch({ calApiKey: document.getElementById("cal-key").value });
  });
}

function renderBilling(b, sub) {
  document.getElementById("tab-billing").innerHTML = `
    <div class="panel-card">
      <h2>Faturação</h2>
      <div class="kv"><span>Plano</span><strong>${b.plan.name} · ${euro(b.plan.priceCents)}/mês</strong></div>
      <div class="kv"><span>Estado da subscrição</span>${subPill(sub.status)}</div>
      <div class="kv"><span>Minutos incluídos</span><span>${sub.usedMinutes} / ${sub.includedMinutes}</span></div>
      <div class="kv"><span>Stripe</span>${state.features.stripe ? `<span class="pill ok">configurado</span>` : `<span class="pill off">modo demo</span>`}</div>
      <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
        ${["base","pro","studio"].map((p) => `<button class="btn ${p===b.subscription.planId?"btn-primary":"btn-ghost"} btn-sm co" data-plan="${p}">Subscrever ${p}</button>`).join("")}
        <button class="btn btn-ghost btn-sm" id="portal">Gerir subscrição</button>
      </div>
      ${state.features.stripe ? "" : `<p class="muted" style="font-size:13px; margin-top:10px;">Adicione as chaves Stripe para ativar checkout e portal reais.</p>`}
    </div>`;
  document.querySelectorAll(".co").forEach((btn) => btn.addEventListener("click", () => checkout(btn.dataset.plan)));
  document.getElementById("portal").addEventListener("click", portal);
}

async function checkout(planId) {
  const res = await fetch(`/api/business/${slug}/checkout`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }),
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else flash(`Checkout indisponível (${data.error || "erro"}). Configure o Stripe.`, "err");
}
async function portal() {
  const res = await fetch(`/api/business/${slug}/portal`, { method: "POST" });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else flash(`Portal indisponível (${data.error || "erro"}).`, "err");
}

function renderBookings() {
  const list = state.bookings;
  const body = list.length
    ? list.map((bk) => {
        const d = new Date(bk.start);
        const when = d.toLocaleString("pt-PT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: state.business.timezone || "Europe/Lisbon" });
        return `<div class="list-item"><div><strong>${bk.serviceName}</strong>${bk.customerName ? " · " + bk.customerName : ""}<div class="muted" style="font-size:13px">${when} · ${bk.source}</div></div></div>`;
      }).join("")
    : `<p class="muted">Sem marcações ainda.</p>`;
  document.getElementById("tab-bookings").innerHTML = `<div class="panel-card"><h2>Marcações</h2>${body}</div>`;
}

async function patch(body) {
  const res = await fetch(`/api/business/${slug}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (res.ok) { flash("Guardado."); await load(); }
  else flash("Falha ao guardar.", "err");
}

function switchTab(tab) {
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
}
document.querySelectorAll("#nav a").forEach((a) => a.addEventListener("click", () => switchTab(a.dataset.tab)));

load();
