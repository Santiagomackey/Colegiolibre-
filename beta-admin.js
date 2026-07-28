(() => {
  "use strict";

  const { client, escapeHtml, getCurrentUser, isAdminUser } = window.colegioLibreApi;
  const elements = {
    list: document.getElementById("beta-admin-list"),
    metricNew: document.getElementById("metric-new"),
    metricRating: document.getElementById("metric-rating"),
    metricResolved: document.getElementById("metric-resolved"),
    metricReviewing: document.getElementById("metric-reviewing"),
    refresh: document.getElementById("beta-admin-refresh"),
    search: document.getElementById("beta-search"),
    status: document.getElementById("beta-admin-status"),
    statusFilter: document.getElementById("beta-status-filter"),
    toast: document.getElementById("beta-admin-toast"),
    typeFilter: document.getElementById("beta-type-filter")
  };

  const labels = {
    bug: "Error",
    confusing: "Confuso",
    suggestion: "Sugerencia",
    positive: "Positivo",
    new: "Nuevo",
    reviewing: "En revisión",
    resolved: "Resuelto",
    dismissed: "Descartado"
  };
  let reports = [];
  let toastTimer;

  elements.refresh.addEventListener("click", loadReports);
  elements.search.addEventListener("input", renderReports);
  elements.statusFilter.addEventListener("change", renderReports);
  elements.typeFilter.addEventListener("change", renderReports);
  elements.list.addEventListener("click", handleAction);
  void initialize();

  async function initialize() {
    const user = await getCurrentUser(true);
    if (!user) {
      window.location.replace(`login.html?next=${encodeURIComponent("beta-admin.html")}`);
      return;
    }
    if (!(await isAdminUser())) {
      window.location.replace("index.html");
      return;
    }
    await loadReports();
  }

  async function loadReports() {
    elements.refresh.disabled = true;
    elements.status.textContent = "Cargando reportes…";
    const { data, error } = await client
      .from("beta_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250);
    elements.refresh.disabled = false;

    if (error) {
      const missing = error.code === "42P01" || /beta_feedback|schema cache/i.test(error.message || "");
      elements.status.textContent = missing
        ? "Primero ejecutá sql/9_CONFIGURAR_PRUEBAS_BETA.sql en Supabase."
        : `No se pudieron cargar los reportes: ${error.message}`;
      reports = [];
      renderReports();
      return;
    }

    reports = data || [];
    updateMetrics();
    renderReports();
  }

  function updateMetrics() {
    elements.metricNew.textContent = String(reports.filter((item) => item.status === "new").length);
    elements.metricReviewing.textContent = String(reports.filter((item) => item.status === "reviewing").length);
    elements.metricResolved.textContent = String(reports.filter((item) => item.status === "resolved").length);
    const rated = reports.filter((item) => Number.isFinite(Number(item.rating)));
    const average = rated.length
      ? rated.reduce((total, item) => total + Number(item.rating), 0) / rated.length
      : null;
    elements.metricRating.textContent = average === null ? "—" : `${average.toFixed(1)}/10`;
  }

  function renderReports() {
    const status = elements.statusFilter.value;
    const type = elements.typeFilter.value;
    const term = normalize(elements.search.value);
    const filtered = reports.filter((report) => {
      const matchesStatus = status === "all"
        || (status === "open" && ["new", "reviewing"].includes(report.status))
        || report.status === status;
      const matchesType = type === "all" || report.feedback_type === type;
      const haystack = normalize([
        report.description,
        report.reproduction_steps,
        report.page_path,
        report.device_info?.user_agent
      ].filter(Boolean).join(" "));
      return matchesStatus && matchesType && (!term || haystack.includes(term));
    });

    elements.status.textContent = `${filtered.length} reporte${filtered.length === 1 ? "" : "s"} visible${filtered.length === 1 ? "" : "s"}.`;
    if (!filtered.length) {
      elements.list.innerHTML = '<div class="beta-admin-empty">No hay reportes para estos filtros.</div>';
      return;
    }

    elements.list.innerHTML = filtered.map((report) => {
      const device = report.device_info || {};
      const tasks = Array.isArray(report.completed_tasks) ? report.completed_tasks.length : 0;
      return `
        <article class="beta-report" data-report-id="${escapeHtml(report.id)}">
          <div class="beta-report__top">
            <div class="beta-report__badges">
              <span class="beta-report__badge beta-report__badge--${escapeHtml(report.feedback_type)}">${escapeHtml(labels[report.feedback_type] || report.feedback_type)}</span>
              <span class="beta-report__badge">${escapeHtml(labels[report.status] || report.status)}</span>
              <span class="beta-report__badge">${escapeHtml(report.page_path)}</span>
            </div>
            <span class="beta-report__rating">${Number(report.rating)}/10</span>
          </div>
          <h2>${report.user_id ? `Usuario ${escapeHtml(report.user_id.slice(0, 8))}` : "Tester sin sesión"}</h2>
          <p>${escapeHtml(report.description)}</p>
          ${report.reproduction_steps ? `<p class="beta-report__steps"><strong>Cómo repetirlo:</strong><br>${escapeHtml(report.reproduction_steps)}</p>` : ""}
          <div class="beta-report__meta">
            <span>${escapeHtml(formatDate(report.created_at))}</span>
            <span>${tasks}/10 tareas</span>
            <span>${escapeHtml(device.viewport || "pantalla desconocida")}</span>
            <span>${device.standalone ? "App instalada" : "Navegador"}</span>
          </div>
          <textarea class="beta-report__notes" maxlength="3000" placeholder="Notas internas del administrador">${escapeHtml(report.admin_notes || "")}</textarea>
          <div class="beta-report__actions">
            <button type="button" data-save-notes>Guardar nota</button>
            <button type="button" data-status="reviewing">Revisando</button>
            <button type="button" data-status="resolved">Resolver</button>
            <button type="button" data-status="dismissed">Descartar</button>
          </div>
        </article>
      `;
    }).join("");
  }

  async function handleAction(event) {
    const button = event.target.closest("button");
    const card = event.target.closest("[data-report-id]");
    if (!button || !card) return;
    const id = card.dataset.reportId;
    const notes = card.querySelector(".beta-report__notes").value.trim() || null;
    const nextStatus = button.dataset.status;
    if (!button.hasAttribute("data-save-notes") && !nextStatus) return;

    button.disabled = true;
    const changes = {
      admin_notes: notes,
      updated_at: new Date().toISOString()
    };
    if (nextStatus) changes.status = nextStatus;
    const { error } = await client.from("beta_feedback").update(changes).eq("id", id);
    button.disabled = false;

    if (error) {
      showToast(`No se pudo guardar: ${error.message}`);
      return;
    }
    const report = reports.find((item) => item.id === id);
    if (report) Object.assign(report, changes);
    updateMetrics();
    renderReports();
    showToast(nextStatus ? "Estado actualizado." : "Nota guardada.");
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Fecha desconocida"
      : new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }
})();
