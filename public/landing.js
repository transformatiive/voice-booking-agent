const euro = (cents) => `${(cents / 100).toFixed(0)}€`;

async function loadPlans() {
  const res = await fetch("/api/plans");
  const { plans, setupFeeCents } = await res.json();
  const wrap = document.getElementById("plans");
  wrap.innerHTML = "";
  for (const plan of plans) {
    const featured = plan.id === "pro";
    const el = document.createElement("div");
    el.className = `plan${featured ? " featured" : ""}`;
    el.innerHTML = `
      <span class="tag">${featured ? "Mais popular" : "&nbsp;"}</span>
      <div class="price">${euro(plan.priceCents)}<small>/mês</small></div>
      <div class="mins">${plan.includedMinutes} min incluídos · ${(plan.overageCentsPerMinute / 100).toFixed(2)}€/min extra</div>
      <ul>${plan.features.map((f) => `<li>${f}</li>`).join("")}</ul>
      <a href="#" class="btn ${featured ? "btn-primary" : "btn-ghost"} choose" data-plan="${plan.id}">Escolher ${plan.name}</a>
    `;
    wrap.appendChild(el);
  }
  document.getElementById("setupNote").textContent =
    `Portabilidade do número atual: taxa única de ${euro(setupFeeCents)} (opcional, tratamos da papelada).`;
  document.querySelectorAll(".choose").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("plan").value = btn.dataset.plan;
      openModal();
    });
  });
}

const modal = document.getElementById("onboardModal");
function openModal() { modal.classList.add("open"); }
function closeModal() { modal.classList.remove("open"); }

document.getElementById("openOnboard").addEventListener("click", (e) => { e.preventDefault(); openModal(); });
document.getElementById("openOnboard2").addEventListener("click", (e) => { e.preventDefault(); openModal(); });
document.getElementById("closeOnboard").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

document.getElementById("onboardForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const payload = {
    name: form.name.value,
    useCase: form.useCase.value,
    planId: form.planId.value,
    agentName: form.agentName.value,
    agentGender: form.agentGender.value,
    locale: form.locale.value,
  };
  const res = await fetch("/api/onboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data.slug) {
    window.location.href = `/app/${data.slug}?onboarded=1`;
  } else {
    alert("Não foi possível criar o assistente. Tente novamente.");
  }
});

document.getElementById("year").textContent = new Date().getFullYear();
loadPlans();
