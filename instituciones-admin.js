(function () {
  "use strict";

  var api = window.colegioLibreApi;
  var client = window.colegioLibreSupabase;
  var content = document.getElementById("admin-content");
  var blocked = document.getElementById("admin-blocked");
  var list = document.getElementById("schools-list");
  var requestsList = document.getElementById("requests-list");
  var requestStatus = document.getElementById("request-status");
  var activeCount = document.getElementById("active-count");

  init();

  async function init() {
    if (!api || !client || !(await api.isAdminUser())) return;
    blocked.hidden = true;
    content.hidden = false;
    await Promise.all([renderRequests(), renderSchools()]);
  }

  async function renderRequests() {
    var response = await client.from("institution_requests")
      .select("*").eq("status", "pending")
      .order("created_at", { ascending: true });
    requestsList.replaceChildren();
    (response.data || []).forEach(function (request) {
      var item = document.createElement("article");
      item.className = "ia-request";
      item.innerHTML =
        "<span><strong></strong><small></small><em></em></span>" +
        '<div><button type="button" data-action="approve">Aprobar</button>' +
        '<button type="button" data-action="reject">Rechazar</button></div>';
      item.querySelector("strong").textContent = request.official_school_name;
      item.querySelector("small").textContent =
        request.contact_email + " · /colegio/" + request.requested_code;
      item.querySelector("em").textContent = "Nombre corto: " + request.short_name;
      item.querySelector('[data-action="approve"]').addEventListener("click", function () {
        void reviewRequest(request.id, "approve");
      });
      item.querySelector('[data-action="reject"]').addEventListener("click", function () {
        void reviewRequest(request.id, "reject");
      });
      requestsList.appendChild(item);
    });
    if (!requestsList.children.length) {
      requestsList.innerHTML = "<p>No hay solicitudes pendientes.</p>";
    }
  }

  async function reviewRequest(id, action) {
    requestStatus.textContent =
      action === "approve" ? "Activando portal…" : "Rechazando solicitud…";
    var rpcName = action === "approve"
      ? "approve_institution_request"
      : "reject_institution_request";
    var result = await client.rpc(rpcName, { p_request_id: id });
    if (result.error) {
      requestStatus.textContent = "No se pudo completar: " + result.error.message;
      return;
    }
    requestStatus.textContent =
      action === "approve"
        ? "Portal activado y administrador asignado."
        : "Solicitud rechazada.";
    await Promise.all([renderRequests(), renderSchools()]);
  }

  async function renderSchools() {
    var result = await client
      .from("schools")
      .select("*")
      .order("name", { ascending: true });
    var schools = result.data || [];
    var active = schools.filter(function (school) {
      return school.portal_enabled && school.membership_status === "active";
    });
    activeCount.textContent = String(active.length);
    list.replaceChildren();

    schools.forEach(function (school) {
      var code = String(school.community_code || school.code || "");
      var name = school.display_name || school.name || code;
      var item = document.createElement("article");
      item.className = "ia-school";
      item.innerHTML =
        '<span class="ia-school__mark"></span>' +
        '<span><strong></strong><small></small></span>' +
        '<a target="_blank" rel="noopener">Abrir portal ↗</a>';
      item.querySelector(".ia-school__mark").style.background =
        school.primary_color || "#0B2E6B";
      item.querySelector(".ia-school__mark").textContent =
        name.split(/\s+/).slice(0, 2).map(function (part) { return part[0]; }).join("").toUpperCase();
      item.querySelector("strong").textContent = name;
      item.querySelector("small").textContent =
        code + " · " + (school.membership_status || "sin membresía");
      item.querySelector("a").href =
        "/colegio/" + encodeURIComponent(code.toLowerCase());
      list.appendChild(item);
    });
  }
})();
