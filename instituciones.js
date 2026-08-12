(function () {
  "use strict";

  var api = window.colegioLibreApi;
  var client = window.colegioLibreSupabase;
  var form = document.getElementById("institution-request-form");
  var loginRequired = document.getElementById("login-required");
  var search = document.getElementById("school-search");
  var results = document.getElementById("school-results");
  var selected = document.getElementById("selected-school");
  var officialCode = document.getElementById("official-code");
  var officialName = document.getElementById("official-name");
  var status = document.getElementById("request-status");
  var requestList = document.getElementById("my-requests");
  var timer = null;
  var currentUser = null;
  var requestedCodeEdited = false;
  var selectedPlan = "Comunidad";
  var selectedBilling = "monthly";

  init();

  bindPricing();

  function bindPricing() {
    var viewPlansButton = document.getElementById("view-plans-button");
    var pricingSection = document.getElementById("planes");
    var billingButtons = document.querySelectorAll("[data-billing]");
    var prices = document.querySelectorAll(".ib-price[data-monthly]");
    var changePlanButton = document.getElementById("change-plan-button");
    if (viewPlansButton && pricingSection) {
      viewPlansButton.addEventListener("click", function (event) {
        event.preventDefault();
        var top = pricingSection.getBoundingClientRect().top + window.scrollY - 86;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        window.setTimeout(function () { pricingSection.querySelector("h2")?.focus?.(); }, 450);
      });
    }
    billingButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var billing = button.dataset.billing;
        selectedBilling = billing;
        var billingInput = document.getElementById("billing-cycle");
        if (billingInput) billingInput.value = billing;
        billingButtons.forEach(function (item) { item.classList.toggle("is-active", item === button); });
        prices.forEach(function (price) {
          price.querySelector("strong").textContent = "$" + price.dataset[billing];
          var note = price.parentElement.querySelector(".ib-price-note");
          if (note) note.textContent = note.dataset[billing + "Note"];
        });
        renderSelectedPlan();
      });
    });

    document.querySelectorAll("[data-select-plan]").forEach(function (button) {
      button.addEventListener("click", function () {
        selectedPlan = button.dataset.selectPlan || "Comunidad";
        var input = document.getElementById("requested-plan");
        var badge = document.getElementById("selected-plan-badge");
        if (input) input.value = selectedPlan;
        if (badge) badge.textContent = "Plan " + selectedPlan;
        document.querySelectorAll(".ib-plan").forEach(function (plan) {
          plan.classList.toggle("is-selected", plan.dataset.plan === selectedPlan);
        });
        renderSelectedPlan();
        document.getElementById("request-card").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    if (changePlanButton) changePlanButton.addEventListener("click", function () {
      document.getElementById("planes").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderSelectedPlan() {
    var summary = document.getElementById("selected-plan-summary");
    var name = document.getElementById("selected-plan-name");
    var icon = document.getElementById("selected-plan-icon");
    var copy = document.getElementById("selected-plan-copy");
    var explanation = document.getElementById("payment-explanation");
    var submitLabel = document.getElementById("request-submit-label");
    var paid = selectedPlan !== "Comunidad";
    if (summary) summary.dataset.plan = selectedPlan;
    if (name) name.textContent = selectedPlan;
    if (icon) icon.textContent = selectedPlan.charAt(0);
    if (copy) copy.textContent = paid
      ? (selectedBilling === "annual" ? "Facturación anual mediante Mercado Pago." : "Facturación mensual mediante Mercado Pago.")
      : "Gratis para siempre. No requiere medio de pago.";
    if (explanation) explanation.textContent = paid
      ? "Primero verificamos que representes al colegio. Cuando la solicitud sea aprobada, en Seguimiento aparecerá el botón para pagar con Mercado Pago. No se cobra nada antes de la aprobación."
      : "El plan Comunidad no requiere tarjeta. Se activa cuando aprobamos los datos del colegio.";
    if (submitLabel) submitLabel.textContent = paid
      ? "Enviar solicitud del plan " + selectedPlan
      : "Solicitar portal gratuito";
  }

  async function init() {
    currentUser = await api.getCurrentUser(true);
    loginRequired.hidden = Boolean(currentUser);
    form.hidden = !currentUser;
    if (!currentUser) {
      requestList.innerHTML = "<p>Iniciá sesión para ver tus solicitudes.</p>";
      return;
    }
    bind();
    if (form.elements.contact_email && !form.elements.contact_email.value) {
      form.elements.contact_email.value = currentUser.email || "";
    }
    await renderRequests();
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 45);
  }

  function bind() {
    search.addEventListener("input", function () {
      window.clearTimeout(timer);
      var query = search.value.trim();
      if (query.length < 2) {
        results.replaceChildren();
        return;
      }
      timer = window.setTimeout(function () { void findSchools(query); }, 260);
    });
    form.elements.requested_code.addEventListener("input", function () {
      requestedCodeEdited = true;
    });
    form.elements.short_name.addEventListener("input", function () {
      if (!requestedCodeEdited) {
        form.elements.requested_code.value = slugify(form.elements.short_name.value);
      }
    });
    form.addEventListener("submit", submit);
  }

  async function findSchools(query) {
    results.innerHTML = '<div class="ib-result">Buscando…</div>';
    var schools = await api.searchSchools(query, 8);
    results.replaceChildren();
    schools.forEach(function (school) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ib-result";
      button.setAttribute("role", "option");
      button.innerHTML = "<strong></strong><small></small>";
      button.querySelector("strong").textContent = school.official_name || school.name;
      button.querySelector("small").textContent =
        [school.address, school.city, school.province, school.cue && "CUE " + school.cue]
          .filter(Boolean).join(" · ");
      button.addEventListener("click", function () { chooseSchool(school); });
      results.appendChild(button);
    });
    if (!schools.length) {
      results.innerHTML = '<div class="ib-result">No encontramos coincidencias. Probá con la dirección.</div>';
    }
  }

  function chooseSchool(school) {
    var name = school.official_name || school.name;
    officialCode.value = school.database_code || school.code;
    officialName.value = name;
    selected.hidden = false;
    selected.querySelector("strong").textContent = name;
    selected.querySelector("small").textContent =
      [school.address, school.city, school.province].filter(Boolean).join(" · ");
    form.elements.short_name.value = name.replace(/^(instituto|colegio|escuela)\s+/i, "").slice(0, 50);
    form.elements.requested_code.value = slugify(form.elements.short_name.value);
    requestedCodeEdited = false;
    results.replaceChildren();
  }

  async function submit(event) {
    event.preventDefault();
    if (!officialCode.value) {
      status.textContent = "Primero seleccioná el colegio oficial.";
      return;
    }
    var data = new FormData(form);
    var record = {
      applicant_user_id: currentUser.id,
      official_school_code: officialCode.value,
      official_school_name: officialName.value,
      requested_code: slugify(data.get("requested_code")),
      short_name: String(data.get("short_name") || "").trim(),
      contact_email: String(data.get("contact_email") || "").trim(),
      primary_color: data.get("primary_color"),
      secondary_color: data.get("secondary_color"),
      accent_color: data.get("accent_color"),
      requested_plan: String(data.get("requested_plan") || selectedPlan),
      billing_cycle: String(data.get("billing_cycle") || selectedBilling),
      status: "pending"
    };
    status.textContent = "Enviando solicitud…";
    var result = await client.from("institution_requests").insert(record).select("id").single();
    if (result.error && (result.error.code === "PGRST204" || /requested_plan|billing_cycle/i.test(result.error.message || ""))) {
      var compatibleRecord = Object.assign({}, record);
      delete compatibleRecord.requested_plan;
      delete compatibleRecord.billing_cycle;
      result = await client.from("institution_requests").insert(compatibleRecord).select("id").single();
    }
    if (result.error) {
      status.textContent =
        result.error.code === "23505"
          ? "Ese colegio ya tiene una solicitud pendiente. ColegioLibre la revisará pronto."
          : "No pudimos enviarla: " + result.error.message;
      return;
    }
    status.textContent = "Solicitud enviada. ColegioLibre la revisará antes de activar el portal.";
    form.reset();
    selected.hidden = true;
    officialCode.value = "";
    officialName.value = "";
    requestedCodeEdited = false;
    form.elements.requested_plan.value = selectedPlan;
    form.elements.billing_cycle.value = selectedBilling;
    if (form.elements.contact_email) {
      form.elements.contact_email.value = currentUser.email || "";
    }
    await renderRequests();
  }

  async function renderRequests() {
    var response = await client.from("institution_requests")
      .select("*").eq("applicant_user_id", currentUser.id)
      .order("created_at", { ascending: false });
    requestList.replaceChildren();
    (response.data || []).forEach(function (request) {
      var item = document.createElement("article");
      item.className = "ib-request";
      item.dataset.status = request.status;
      item.innerHTML = "<span><strong></strong><small></small></span><span class=\"ib-request__state\"><b></b></span>";
      item.querySelector("strong").textContent = request.official_school_name;
      item.querySelector("small").textContent = "/colegio/" + request.requested_code;
      item.querySelector("b").textContent =
        request.status === "pending" ? "Pendiente" :
        request.status === "approved" && request.requested_plan !== "Comunidad" && request.subscription_status !== "authorized" ? "Aprobada · falta pago" :
        request.status === "approved" ? "Aprobada" : "Rechazada";
      if (request.status === "approved") {
        if (!request.requested_plan || request.requested_plan === "Comunidad" || request.subscription_status === "authorized") {
          var link = document.createElement("a");
          link.href = "/colegio/" + encodeURIComponent(request.requested_code);
          link.textContent = "Abrir portal";
          item.querySelector(".ib-request__state").appendChild(link);
        }
        if (request.requested_plan && request.requested_plan !== "Comunidad" && request.subscription_status !== "authorized") {
          var pay = document.createElement("button");
          pay.type = "button";
          pay.className = "ib-pay-button";
          pay.textContent = request.subscription_status === "pending" ? "Continuar pago" : "Contratar plan";
          pay.addEventListener("click", function () { void startPayment(request.id, pay); });
          item.querySelector(".ib-request__state").appendChild(pay);
        }
      }
      requestList.appendChild(item);
    });
    if (!requestList.children.length) requestList.innerHTML = "<p>Todavía no enviaste solicitudes.</p>";
  }

  async function startPayment(requestId, button) {
    button.disabled = true;
    button.textContent = "Abriendo Mercado Pago…";
    try {
      var session = await client.auth.getSession();
      var token = session.data?.session?.access_token;
      var response = await fetch("/api/mercadopago-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ request_id: requestId })
      });
      var result = await response.json();
      if (!response.ok || !result.init_point) throw new Error(result.error || "No pudimos abrir el pago.");
      window.location.href = result.init_point;
    } catch (error) {
      status.textContent = error.message;
      button.disabled = false;
      button.textContent = "Reintentar pago";
    }
  }
})();
