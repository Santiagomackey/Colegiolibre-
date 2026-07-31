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

  init();

  async function init() {
    currentUser = await api.getCurrentUser();
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
      status: "pending"
    };
    status.textContent = "Enviando solicitud…";
    var result = await client.from("institution_requests").insert(record).select("id").single();
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
        request.status === "approved" ? "Aprobada" : "Rechazada";
      if (request.status === "approved") {
        var link = document.createElement("a");
        link.href = "/colegio/" + encodeURIComponent(request.requested_code);
        link.textContent = "Abrir portal";
        item.querySelector(".ib-request__state").appendChild(link);
      }
      requestList.appendChild(item);
    });
    if (!requestList.children.length) requestList.innerHTML = "<p>Todavía no enviaste solicitudes.</p>";
  }
})();
