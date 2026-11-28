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
  const query = new URLSearchParams(location.search);
  const returning = query.get("payment") === "return";
  const management = document.getElementById("subscription-management");
  if (management && (returning || query.get("gestion") === "1" || location.hash === "#solicitudes")) {
    document.getElementById("planes").remove();
    management.replaceWith(management.content.cloneNode(true));
  }
  var requestList = document.getElementById("my-requests");
  const paymentReturn = document.getElementById("payment-return");
  const returnedRequest = returning ? query.get("request_id") : null;
  const currency = new Intl.NumberFormat("es-AR", {style:"currency", currency:"ARS", currencyDisplay:"code", maximumFractionDigits:0});
  let confirmationTimer;
  let confirmationChecks = 0;
  var timer = null;
  var searchSequence = 0;
  var sending = false;
  var currentUser = null;
  var requestedCodeEdited = false;
  var selectedPlan = "Institucional";
  var selectedBilling = form && query.get("cycle") === "annual" ? "annual" : "monthly";

  if (form || requestList) init();

  bindPricing();

  function bindPricing() {
    var viewPlansButton = document.getElementById("view-plans-button");
    var pricingSection = document.getElementById("planes");
    var billingButtons = document.querySelectorAll("[data-billing]");
    var prices = document.querySelectorAll(".ib-price[data-monthly]");
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
          price.querySelector(".ib-price-period").textContent = billing === "annual" ? "/año" : "/mes";
          var note = price.parentElement.querySelector(".ib-price-note");
          if (note) note.textContent = note.dataset[billing + "Note"];
        });
        document.querySelectorAll("[data-select-plan]").forEach(function (link) {
          const url = new URL(link.href);
          url.searchParams.set("cycle", billing);
          link.href = url.href;
        });
      });
    });
  }

  function renderSelectedPlan() {
    const annual = selectedBilling === "annual";
    const selector = document.getElementById("checkout-period");
    selector.value = selectedBilling;
    form.elements.billing_cycle.value = selectedBilling;
    document.getElementById("checkout-amount").textContent = annual ? "$199.000 ARS" : "$19.900 ARS";
    document.getElementById("checkout-renewal").textContent = annual
      ? "Precio anual: $199.000 · Ahorrás $39.800 (2 meses)."
      : "Precio mensual: $19.900";
    const url = new URL(location.href);
    url.searchParams.set("cycle", selectedBilling);
    loginRequired.querySelector("a").href = "/login?next=" + encodeURIComponent(url.pathname + url.search);

  }

  async function init() {
    if (form) {
      renderSelectedPlan();
      document.getElementById("checkout-period").addEventListener("change", event => {
        selectedBilling = event.target.value;
        renderSelectedPlan();
      });
    }
    currentUser = await api.getCurrentUser(true);
    if (form) {
      form.elements.requested_plan.value = selectedPlan;
      form.elements.billing_cycle.value = selectedBilling;
      document.getElementById("payment-controls").hidden = !currentUser;
      loginRequired.hidden = Boolean(currentUser);
      form.hidden = !currentUser;
      updateAddress();
      if (currentUser) {
        bind();
        form.elements.contact_email.value = currentUser.email || "";
      }
      return;
    }
    if (!currentUser) {
      if (returning || requestList) {
        const login = document.createElement("a");
        login.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
        login.textContent = "Iniciar sesión para consultar el pago";
        showPaymentReturn("Consultá tu suscripción", "Entrá con la cuenta que solicitó el portal.", login);
      }
      requestList.textContent = "";
      return;
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
      var request = ++searchSequence;
      clearSchool();
      results.replaceChildren();
      search.setCustomValidity("");
      var query = search.value.trim();
      if (query.length < 2) {
        results.replaceChildren();
        return;
      }
      timer = window.setTimeout(function () { void findSchools(query, request); }, 260);
    });
    document.getElementById("change-school").addEventListener("click", function () {
      clearSchool();
      search.value = "";
      search.focus();
    });
    form.elements.requested_code.addEventListener("input", function () {
      requestedCodeEdited = true;
      updateAddress();
    });
    form.elements.short_name.addEventListener("input", function () {
      if (!requestedCodeEdited) {
        form.elements.requested_code.value = slugify(form.elements.short_name.value);
        updateAddress();
      }
    });
    const options = document.getElementById("portal-options");
    options.addEventListener("invalid", () => { options.open = true; }, true);
    form.addEventListener("submit", submit);
  }

  function clearSchool() {
    officialCode.value = "";
    officialName.value = "";
    selected.hidden = true;
    document.getElementById("portal-options").hidden = true;
    document.getElementById("school-consent").hidden = true;
    form.elements.authority_confirmed.disabled = true;
    form.elements.authority_confirmed.checked = false;
    form.elements.short_name.disabled = form.elements.requested_code.disabled = true;
    search.required = true;
    search.hidden = false;
    search.labels[0].hidden = false;
  }

  function updateAddress() {
    const slug = slugify(form.elements.requested_code.value) || "nombre-del-colegio";
    document.getElementById("request-address").textContent =
      "colego.com.ar/" + (slug.endsWith("-school") ? "" : "colegio-") + slug;
  }

  async function findSchools(query, request) {
    results.innerHTML = '<div class="ib-result">Buscando…</div>';
    var schools;
    try {
      schools = await api.searchSchools(query, 8);
    } catch (_) {
      if (request === searchSequence) results.textContent = "No pudimos buscar colegios. Volvé a intentar.";
      return;
    }
    if (request !== searchSequence) return;
    results.replaceChildren();
    schools.forEach(function (school) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ib-result";
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
    document.getElementById("portal-options").hidden = false;
    document.getElementById("school-consent").hidden = false;
    form.elements.authority_confirmed.disabled = false;
    form.elements.authority_confirmed.checked = false;
    form.elements.short_name.disabled = form.elements.requested_code.disabled = false;
    search.setCustomValidity("");
    search.required = false;
    search.hidden = true;
    search.labels[0].hidden = true;
    selected.querySelector("strong").textContent = name;
    selected.querySelector("small").textContent =
      [school.address, school.city, school.province].filter(Boolean).join(" · ");
    form.elements.short_name.value = name.replace(/^(instituto|colegio|escuela)\s+/i, "").slice(0, 50);
    form.elements.requested_code.value = slugify(form.elements.short_name.value);
    requestedCodeEdited = false;
    updateAddress();
    results.replaceChildren();
    document.getElementById("change-school").focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    if (!officialCode.value) {
      search.setCustomValidity("Seleccioná un colegio de los resultados.");
      search.reportValidity();
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
      primary_color: "#0B2E6B",
      secondary_color: "#67C23A",
      accent_color: "#FFC72C",
      requested_plan: String(data.get("requested_plan") || selectedPlan),
      billing_cycle: String(data.get("billing_cycle") || selectedBilling),
      status: "pending"
    };
    if (!record.requested_code || !record.short_name) {
      status.textContent = "Completá el nombre visible y la dirección del portal.";
      status.focus();
      return;
    }
    sending = true;
    document.getElementById("checkout-period").disabled = true;
    var button = document.getElementById("request-submit-label");
    button.disabled = true;
    status.textContent = "Preparando el pago…";
    try {
      var result = await client.from("institution_requests").insert(record).select("id").single();
      let requestId = result.data?.id;
      if (result.error?.code === "23505") {
        const existing = await client.from("institution_requests").select("id,billing_cycle")
          .eq("applicant_user_id",currentUser.id).eq("official_school_code",officialCode.value)
          .eq("requested_plan",selectedPlan).eq("status","pending").maybeSingle();
        if (!existing.data) throw Error("Este colegio ya tiene una inscripción en curso.");
        requestId = existing.data.id;
      }
      if (!requestId) throw Error("No pudimos guardar los datos del colegio. Volvé a intentar.");
      const checkout = await billing(requestId,{cycle:record.billing_cycle});
      if (!checkout.init_point) throw Error("No pudimos abrir Mercado Pago. Volvé a intentar.");
      window.location.assign(checkout.init_point);
    } catch (error) {
      status.textContent = error.message || "No pudimos iniciar el pago.";
    } finally {
      sending = false;
      document.getElementById("checkout-period").disabled = false;
      button.disabled = false;
      status.focus();
    }
  }

  async function renderRequests() {
    var response = await client.from("institution_requests")
      .select("*").eq("applicant_user_id", currentUser.id)
      .order("created_at", { ascending: false });
    requestList.replaceChildren();
    if (response.error) {
      requestList.textContent = "No pudimos cargar tus solicitudes.";
      addBillingButton(requestList,"Volver a consultar",renderRequests);
      return;
    }
    const requests = response.data || [];
    const returnTarget = returning && (returnedRequest
      ? requests.find(request => request.id === returnedRequest)
      : requests.find(request => request.status === "approved" && request.requested_plan !== "Comunidad"));
    if (returning && (!returnTarget || returnTarget.status === "rejected" || returnTarget.requested_plan === "Comunidad")) {
      showPaymentReturn("Suscripción institucional", "Entrá con la cuenta que realizó la compra para consultar el estado del pago.");
    }
    requests.forEach(function (request) {
      var item = document.createElement("article");
      item.className = "ib-request";
      item.dataset.status = request.status;
      item.innerHTML = "<span><strong></strong><small></small></span><span class=\"ib-request__state\"><b></b></span>";
      item.querySelector("strong").textContent = request.official_school_name;
      item.querySelector("small").textContent = request.requested_plan === "Institucional" ? "Básico" : request.requested_plan;
      item.querySelector("b").textContent =
        request.status === "pending" ? "En revisión" : request.status === "approved" ? "Aprobada" : request.status === "withdrawn" ? "Cancelada" : "Rechazada";
      if (request.status === "withdrawn" && request === returnTarget) {
        showPaymentReturn("Pago cancelado", "Podés iniciar una nueva contratación desde la página del plan.");
      } else if (request.status !== "withdrawn" && (request.status === "approved" || request.requested_plan !== "Comunidad")) {
        const controls = item.querySelector(".ib-request__state");
        if (request.requested_plan === "Comunidad") {
          const link = document.createElement("a");
          link.href = "/colegio?code=" + encodeURIComponent(request.official_school_code);
          link.textContent = "Ver comunidad";
          controls.append(link);
        } else {
          void renderBilling(request, item, request === returnTarget);
        }
      }
      requestList.appendChild(item);
    });
    if (!requestList.children.length) requestList.textContent = "Todavía no tenés una suscripción.";
  }

  async function billing(requestId, options) {
    const session = await client.auth.getSession();
    const token = session.data?.session?.access_token;
    if (!token) throw Error("Iniciá sesión para continuar.");
    const params = new URLSearchParams({ request_id:requestId, refresh:"1" });
    const response = await fetch("/api/mercadopago-subscription" + (options ? "" : "?" + params), {
      method:options?"POST":"GET",
      headers:{ "Content-Type":"application/json", Authorization:"Bearer " + token },
      body:options?JSON.stringify({ request_id:requestId,...options }):undefined
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "No pudimos consultar el plan.");
    return result;
  }

  function showPaymentReturn(title, description, action) {
    if (!paymentReturn) return;
    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = description;
    paymentReturn.replaceChildren(heading,copy);
    if (action) paymentReturn.append(action);
    paymentReturn.hidden = false;
  }

  function editorLink(path) {
    if (!/^\/(?:comunidad\/[a-z0-9_-]{1,80}|[a-z0-9_-]+-school|colegio-[a-z0-9_-]+)$/.test(path || "")) return null;
    const link = document.createElement("a");
    link.href = path + "/editor";
    link.textContent = "Personalizar mi portal";
    link.className = "ib-editor-link";
    return link;
  }

  function updatePaymentReturn(plan, request, item) {
    const editor = plan.active && editorLink(plan.portalPath);
    if (editor) {
      showPaymentReturn("Pago acreditado", "Tu plan está activo. Ya podés personalizar y publicar el portal privado de tu colegio.", editor);
      if (request.id === returnedRequest) window.location.replace(editor.href);
      return;
    }
    if (plan.active && !editor) {
      showPaymentReturn("Pago acreditado", request.status === "pending"
        ? "Estamos verificando tu representación del colegio. Cuando esté confirmada podrás abrir el editor desde esta página."
        : "Consultá con soporte sobre el acceso a este colegio.");
      return;
    }
    const waiting = plan.enabled && ["pending","authorized"].includes(plan.status);
    showPaymentReturn(
      waiting ? "Estamos verificando el pago" : "Suscripción institucional",
      waiting ? "El editor se habilita cuando Mercado Pago confirma la acreditación."
        : "Revisá el estado de tu solicitud para continuar."
    );
    if (!waiting) return;
    const refresh = document.createElement("div");
    paymentReturn.append(refresh);
    addBillingButton(refresh,"Consultar estado",async () => {
      clearTimeout(confirmationTimer);
      await renderBilling(request,item,true);
    });
    if (confirmationChecks < 8) {
      confirmationChecks++;
      confirmationTimer = setTimeout(() => {
        if (item.isConnected && !document.hidden) void renderBilling(request,item,true);
      }, 5000);
    }
  }

  async function renderBilling(request, item, fromReturn = false) {
    if (item.dataset.billingLoading) return;
    item.dataset.billingLoading = "true";
    const controls = item.querySelector(".ib-request__state");
    const label = item.querySelector("b");
    if (fromReturn) clearTimeout(confirmationTimer);
    controls.replaceChildren(label);
    label.textContent = "Consultando plan…";
    try {
      const plan = await billing(request.id);
      if (!item.isConnected) return;
      if (fromReturn) updatePaymentReturn(plan,request,item);
      label.textContent = plan.status === "cancelled" ? "Renovación cancelada" : plan.status === "paused" ? "Renovación pausada" : plan.active ? "Plan activo" : plan.paidThrough ? "Período pago vencido" : plan.status === "authorized" ? "Esperando primer cobro" :
        plan.status === "pending" ? "Pago pendiente" : plan.status === "cancelled" ? "Renovación cancelada" : "Aprobada";
      if (plan.paidThrough) {
        const until = document.createElement("small");
        until.textContent = "Pago hasta el " + new Date(plan.paidThrough).toLocaleDateString("es-AR");
        controls.append(until);
      }
      if (plan.nextPaymentDate && plan.status === "authorized") {
        const next = document.createElement("small");
        next.textContent = "Próximo cobro: " + new Date(plan.nextPaymentDate).toLocaleDateString("es-AR", {timeZone:"America/Argentina/Buenos_Aires"}) + " · " + currency.format(plan.amount);
        controls.append(next);
      }
      if (plan.renewalFailed) {
        const warning = document.createElement("p");
        warning.textContent = "El último cobro fue rechazado. Revisá el medio de pago de la suscripción en Mercado Pago.";
        controls.append(warning);
      }
      const editor = plan.active && editorLink(plan.portalPath);
      if (editor) controls.append(editor);
      if (!plan.enabled) {
        const help = document.createElement("small");
        help.textContent = "La contratación a través de Mercado Pago todavía no está disponible.";
        controls.append(help);
        return;
      }
      if (request.status !== "rejected" && !plan.active && ["none","pending"].includes(plan.status) && plan.prices) {
        const checkout = document.createElement("div");
        checkout.className = "ib-checkout";
        const cycle = document.createElement("select");
        cycle.setAttribute("aria-label","Frecuencia de facturación");
        for (const [value,title] of [["monthly","Mensual"],["annual","Anual"]]) {
          const amount = plan.cycle === value && plan.amount ? plan.amount : plan.prices[value];
          const option = document.createElement("option");
          option.value = value;
          option.textContent = title + " · " + currency.format(amount);
          cycle.append(option);
        }
        cycle.value = plan.cycle || request.billing_cycle || "monthly";
        cycle.disabled = Boolean(plan.cycle);
        const recipient = document.createElement("small");
        recipient.textContent = "Mercado Pago cobrará automáticamente con la frecuencia elegida hasta que canceles.";
        checkout.append(cycle,recipient);
        controls.append(checkout);
        addBillingButton(checkout,plan.checkoutReady ? "Continuar en Mercado Pago" : "Comprar suscripción", async () => {
          const result = await billing(request.id,{cycle:cycle.value});
          if (!result.init_point) throw Error("No pudimos abrir el checkout. Consultá el estado del plan.");
          window.location.assign(result.init_point);
        });
      }
      if (plan.refreshUnavailable) {
        const message = document.createElement("small");
        message.textContent = "Mercado Pago no respondió. Mostramos el último estado confirmado.";
        controls.append(message);
      }
      if (["pending","authorized","paused"].includes(plan.status) || plan.refreshUnavailable) {
        addBillingButton(controls,"Consultar estado",() => renderBilling(request,item,fromReturn));
      }
      if (plan.canCancel) {
        addBillingButton(controls,plan.status === "pending" ? "Cancelar pago pendiente" : "Cancelar renovación",async () => {
          const confirmation = plan.status === "pending" ? "¿Cancelar esta contratación pendiente?"
            : "¿Cancelar la renovación de este plan? El acceso continúa hasta el fin del período pagado.";
          if (!window.confirm(confirmation)) return;
          await billing(request.id,{action:"cancel"});
          await renderRequests();
        });
      }
    } catch (error) {
      label.textContent = error.message;
      addBillingButton(controls,"Volver a consultar",() => renderBilling(request,item,fromReturn));
    } finally {
      delete item.dataset.billingLoading;
    }
  }

  function addBillingButton(container, title, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ib-pay-button";
    button.textContent = title;
    let message;
    button.addEventListener("click",async () => {
      message?.remove();
      button.disabled = true;
      try { await handler(); }
      catch (error) {
        message = document.createElement("small");
        message.setAttribute("role","status");
        message.textContent = error.message;
        button.after(message);
      } finally { button.disabled = false; }
    });
    container.append(button);
  }
})();
