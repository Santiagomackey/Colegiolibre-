(function () {
  "use strict";

  const api = window.colegioLibreApi || {};
  const client = window.colegioLibreSupabase;

  const {
    escapeHtml = (value) => String(value || ""),
    fetchSchools = async () => [],
    getCurrentUser = async () => null,
    getInitials = (value) => String(value || "?").slice(0, 2).toUpperCase(),
    isAdminUser = async () => false
  } = api;

  const elements = {
    accentColor: document.querySelector("#school-accent-color"),
    active: document.querySelector("#school-active"),
    adminDashboard: document.querySelector("#admin-dashboard"),
    adminEmail: document.querySelector("#admin-email"),
    adminGate: document.querySelector("#admin-gate"),
    adminGateAction: document.querySelector("#admin-gate-action"),
    adminGateMessage: document.querySelector("#admin-gate-message"),
    adminGateTitle: document.querySelector("#admin-gate-title"),
    cancelEdit: document.querySelector("#cancel-edit"),
    city: document.querySelector("#school-city"),
    clearErrorView: document.querySelector("#clear-error-view"),
    codePreview: document.querySelector("#school-code-preview"),
    form: document.querySelector("#school-form"),
    formTitle: document.querySelector("#school-form-title"),
    id: document.querySelector("#school-id"),
    logo: document.querySelector("#school-logo"),
    logout: document.querySelector("#admin-logout"),
    metricActive: document.querySelector("#metric-active"),
    metricErrors: document.querySelector("#metric-errors"),
    metricProducts: document.querySelector("#metric-products"),
    metricSchools: document.querySelector("#metric-schools"),
    metricStudents: document.querySelector("#metric-students"),
    name: document.querySelector("#school-name"),
    prefix: document.querySelector("#school-prefix"),
    primaryColor: document.querySelector("#school-primary-color"),
    province: document.querySelector("#school-province"),
    refresh: document.querySelector("#refresh-dashboard"),
    saveButton: document.querySelector("#save-school"),
    search: document.querySelector("#school-search"),
    secondaryColor: document.querySelector("#school-secondary-color"),
    statusFilter: document.querySelector("#school-status-filter"),
    tableBody: document.querySelector("#schools-table-body"),
    tableEmpty: document.querySelector("#schools-empty"),
    technicalErrorsEmpty: document.querySelector("#technical-errors-empty"),
    technicalErrorsList: document.querySelector("#technical-errors-list"),
    toast: document.querySelector("#admin-toast"),
    zone: document.querySelector("#school-zone")
  };

  const state = {
    countsBySchool: new Map(),
    currentUser: null,
    editingSchoolId: null,
    formBusy: false,
    loading: false,
    schools: [],
    technicalErrors: []
  };

  init();

  async function init() {
    bindEvents();

    if (!client || !api.getCurrentUser) {
      denyAccess(
        "No se pudo iniciar el administrador",
        "Falta cargar supabase.js o el cliente de datos."
      );
      return;
    }

    state.currentUser = await getCurrentUser(true);

    if (!state.currentUser) {
      window.location.href = "login.html?next=admin.html";
      return;
    }

    const hasAdminAccess = await isAdminUser();

    if (!hasAdminAccess) {
      denyAccess(
        "Acceso restringido",
        "Tu cuenta inició sesión, pero todavía no tiene el rol de administrador."
      );
      return;
    }

    elements.adminGate.hidden = true;
    elements.adminDashboard.hidden = false;
    elements.adminEmail.textContent = state.currentUser.email || "Administrador";
    await loadDashboard();
  }

  function bindEvents() {
    elements.form.addEventListener("submit", handleSchoolSubmit);
    elements.cancelEdit.addEventListener("click", resetSchoolForm);
    elements.refresh.addEventListener("click", loadDashboard);
    elements.search.addEventListener("input", renderSchools);
    elements.statusFilter.addEventListener("change", renderSchools);
    elements.tableBody.addEventListener("click", handleTableAction);
    elements.prefix.addEventListener("input", () => {
      const cleanPrefix = sanitizePrefix(elements.prefix.value);
      elements.prefix.value = cleanPrefix;
      elements.codePreview.textContent = cleanPrefix
        ? `${cleanPrefix}-XXXX`
        : "Se generará automáticamente";
    });
    elements.logout.addEventListener("click", handleLogout);
    elements.clearErrorView?.addEventListener("click", () => {
      const isHidden = elements.technicalErrorsList.hidden;
      elements.technicalErrorsList.hidden = !isHidden;
      elements.technicalErrorsEmpty.hidden = !isHidden || state.technicalErrors.length > 0;
      elements.clearErrorView.textContent = isHidden ? "Ocultar lista" : "Mostrar lista";
      elements.clearErrorView.setAttribute("aria-expanded", String(isHidden));
    });
  }

  function denyAccess(title, message) {
    const loader = elements.adminGate.querySelector(".access-card__loader");
    if (loader) loader.hidden = true;
    elements.adminGateTitle.textContent = title;
    elements.adminGateMessage.textContent = message;
    elements.adminGateAction.hidden = false;
  }

  async function loadDashboard() {
    if (state.loading) return;

    state.loading = true;
    elements.refresh.disabled = true;
    elements.refresh.textContent = "Actualizando...";

    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [schools, statsResult, errorsResult] = await Promise.all([
        fetchSchools({ includeInactive: true }),
        client.rpc("admin_school_stats"),
        client
          .from("client_errors")
          .select("id,page_path,error_source,error_message,app_version,created_at")
          .gte("created_at", weekAgo)
          .order("created_at", { ascending: false })
          .limit(50)
      ]);

      state.schools = schools;
      state.countsBySchool = buildSchoolCounts(statsResult.data || []);
      state.technicalErrors = errorsResult.error ? [] : errorsResult.data || [];

      if (statsResult.error) {
        console.warn("No se pudieron cargar las métricas por colegio:", statsResult.error);
      }
      if (errorsResult.error && !String(errorsResult.error.message || "").includes("client_errors")) {
        console.warn("No se pudieron cargar los errores técnicos:", errorsResult.error);
      }

      renderMetrics();
      renderSchools();
      renderTechnicalErrors(errorsResult.error);
    } catch (error) {
      console.error("Error cargando el administrador:", error);
      showToast("No se pudieron cargar los datos administrativos.");
    } finally {
      state.loading = false;
      elements.refresh.disabled = false;
      elements.refresh.textContent = "Actualizar datos";
    }
  }

  function buildSchoolCounts(rows) {
    return new Map(
      rows.map((row) => [
        normalizeCode(row.school_code),
        {
          products: Number(row.products_count || 0),
          students: Number(row.students_count || 0)
        }
      ])
    );
  }

  function renderMetrics() {
    const totals = Array.from(state.countsBySchool.values()).reduce(
      (accumulator, item) => {
        accumulator.products += item.products;
        accumulator.students += item.students;
        return accumulator;
      },
      { products: 0, students: 0 }
    );

    elements.metricSchools.textContent = String(state.schools.length);
    elements.metricActive.textContent = String(
      state.schools.filter((school) => school.is_active).length
    );
    elements.metricStudents.textContent = String(totals.students);
    elements.metricProducts.textContent = String(totals.products);
    if (elements.metricErrors) {
      elements.metricErrors.textContent = String(state.technicalErrors.length);
    }
  }

  function renderTechnicalErrors(loadError = null) {
    if (!elements.technicalErrorsList || !elements.technicalErrorsEmpty) return;

    if (loadError) {
      elements.technicalErrorsList.innerHTML = `
        <article class="technical-error technical-error--setup">
          <strong>Monitoreo todavía no configurado</strong>
          <p>Ejecutá el archivo <code>sql/10_CONFIGURAR_MONITOREO_ERRORES.sql</code> en Supabase.</p>
        </article>
      `;
      elements.technicalErrorsEmpty.hidden = true;
      return;
    }

    elements.technicalErrorsEmpty.hidden = state.technicalErrors.length > 0;
    elements.technicalErrorsList.innerHTML = state.technicalErrors
      .map((item) => `
        <article class="technical-error">
          <div>
            <strong>${escapeHtml(item.error_message || "Error sin descripción")}</strong>
            <p>${escapeHtml(item.page_path || "/")} · ${escapeHtml(formatTechnicalDate(item.created_at))}</p>
          </div>
          <span>${escapeHtml(item.app_version || "web")}</span>
        </article>
      `)
      .join("");
  }

  function formatTechnicalDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha desconocida";
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function getFilteredSchools() {
    const searchTerm = normalizeSearch(elements.search.value);
    const status = elements.statusFilter.value;

    return state.schools.filter((school) => {
      const matchesStatus =
        !status ||
        (status === "active" && school.is_active) ||
        (status === "inactive" && !school.is_active);
      const searchable = normalizeSearch(
        [school.name, school.code, school.city, school.zone_code, school.province].join(" ")
      );

      return matchesStatus && (!searchTerm || searchable.includes(searchTerm));
    });
  }

  function renderSchools() {
    const schools = getFilteredSchools();
    elements.tableEmpty.hidden = schools.length > 0;

    elements.tableBody.innerHTML = schools
      .map((school) => {
        const counts = state.countsBySchool.get(normalizeCode(school.code)) || {
          products: 0,
          students: 0
        };
        const location = [school.zone_code, school.city, school.province]
          .filter(Boolean)
          .join(" · ");
        const logo = school.logo_url
          ? `<img src="${escapeHtml(school.logo_url)}" alt="">`
          : escapeHtml(getInitials(school.name));

        return `
          <tr data-school-id="${escapeHtml(school.id)}">
            <td>
              <div class="school-cell">
                <span
                  class="school-cell__logo"
                  style="--school-primary:${escapeHtml(school.primary_color)}"
                >
                  ${logo}
                </span>
                <span>
                  <strong>${escapeHtml(school.name)}</strong>
                  <small>${escapeHtml(location || "Ubicación no especificada")}</small>
                </span>
              </div>
            </td>
            <td>
              <div class="code-cell">
                <code>${escapeHtml(school.code)}</code>
                <button
                  class="copy-code"
                  type="button"
                  data-action="copy"
                  data-code="${escapeHtml(school.code)}"
                >
                  Copiar
                </button>
              </div>
            </td>
            <td>
              <div class="community-counts">
                <strong>${counts.students} estudiante${counts.students === 1 ? "" : "s"}</strong>
                <small>${counts.products} publicación${counts.products === 1 ? "" : "es"}</small>
              </div>
            </td>
            <td>
              <span class="status-badge${school.is_active ? "" : " is-inactive"}">
                ${school.is_active ? "Activo" : "Inactivo"}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button type="button" data-action="edit">Editar</button>
                <button
                  type="button"
                  data-action="toggle"
                  data-next-active="${String(!school.is_active)}"
                >
                  ${school.is_active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    elements.tableBody.querySelectorAll(".school-cell__logo img").forEach((image) => {
      image.addEventListener("error", () => image.remove());
    });
  }

  async function handleSchoolSubmit(event) {
    event.preventDefault();
    if (state.formBusy) return;

    const values = readFormValues();

    if (!values.name) {
      showToast("Escribí el nombre del colegio.");
      elements.name.focus();
      return;
    }

    setFormBusy(true);

    try {
      const isEditing = Boolean(state.editingSchoolId);
      const rpcName = isEditing ? "admin_update_school" : "admin_create_school";
      const args = isEditing
        ? {
            p_accent_color: values.accentColor,
            p_city: values.city,
            p_is_active: values.isActive,
            p_logo_url: values.logoUrl,
            p_name: values.name,
            p_primary_color: values.primaryColor,
            p_province: values.province,
            p_school_id: state.editingSchoolId,
            p_secondary_color: values.secondaryColor,
            p_zone_code: values.zoneCode
          }
        : {
            p_accent_color: values.accentColor,
            p_city: values.city,
            p_is_active: values.isActive,
            p_logo_url: values.logoUrl,
            p_name: values.name,
            p_prefix: values.prefix || null,
            p_primary_color: values.primaryColor,
            p_province: values.province,
            p_secondary_color: values.secondaryColor,
            p_zone_code: values.zoneCode
          };

      const { data, error } = await client.rpc(rpcName, args);

      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      const resultCode = result?.code || result?.school_code || "";

      showToast(
        isEditing
          ? "Colegio actualizado correctamente."
          : `Colegio creado${resultCode ? ` con código ${resultCode}` : ""}.`
      );
      resetSchoolForm();
      await loadDashboard();
    } catch (error) {
      console.error("Error guardando colegio:", error);
      showToast(getReadableError(error));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleTableAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "copy") {
      await copyCode(button.dataset.code || "");
      return;
    }

    const row = button.closest("[data-school-id]");
    const school = state.schools.find((item) => item.id === row?.dataset.schoolId);
    if (!school) return;

    if (action === "edit") {
      startEditingSchool(school);
      return;
    }

    if (action === "toggle") {
      const nextActive = button.dataset.nextActive === "true";
      const confirmed = window.confirm(
        nextActive
          ? `¿Activar ${school.name}?`
          : `¿Desactivar ${school.name}? Dejará de aparecer para nuevos estudiantes.`
      );

      if (!confirmed) return;

      button.disabled = true;
      const { error } = await client.rpc("admin_set_school_active", {
        p_is_active: nextActive,
        p_school_id: school.id
      });

      if (error) {
        console.error("Error cambiando estado:", error);
        showToast(getReadableError(error));
        button.disabled = false;
        return;
      }

      showToast(nextActive ? "Colegio activado." : "Colegio desactivado.");
      await loadDashboard();
    }
  }

  function startEditingSchool(school) {
    state.editingSchoolId = school.id;
    elements.id.value = school.id;
    elements.name.value = school.name;
    elements.prefix.value = "";
    elements.prefix.disabled = true;
    elements.prefix.placeholder = "El código no cambia al editar";
    elements.province.value = school.province || "Buenos Aires";
    elements.city.value = school.city || "";
    elements.zone.value = school.zone_code || "";
    elements.logo.value = school.logo_url || "";
    elements.primaryColor.value = normalizeColor(school.primary_color, "#0B2E6B");
    elements.secondaryColor.value = normalizeColor(school.secondary_color, "#67C23A");
    elements.accentColor.value = normalizeColor(school.accent_color, "#FFC72C");
    elements.active.checked = school.is_active;
    elements.codePreview.textContent = school.code;
    elements.formTitle.textContent = "Editar colegio";
    elements.saveButton.textContent = "Guardar cambios";
    elements.cancelEdit.hidden = false;
    elements.name.focus();
    elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetSchoolForm() {
    state.editingSchoolId = null;
    elements.form.reset();
    elements.id.value = "";
    elements.prefix.disabled = false;
    elements.prefix.placeholder = "Ej: ECCL";
    elements.province.value = "Buenos Aires";
    elements.primaryColor.value = "#0B2E6B";
    elements.secondaryColor.value = "#67C23A";
    elements.accentColor.value = "#FFC72C";
    elements.active.checked = true;
    elements.codePreview.textContent = "Se generará automáticamente";
    elements.formTitle.textContent = "Crear colegio";
    elements.saveButton.textContent = "Crear colegio y generar código";
    elements.cancelEdit.hidden = true;
  }

  function readFormValues() {
    return {
      accentColor: elements.accentColor.value,
      city: elements.city.value.trim(),
      isActive: elements.active.checked,
      logoUrl: elements.logo.value.trim(),
      name: elements.name.value.trim(),
      prefix: sanitizePrefix(elements.prefix.value),
      primaryColor: elements.primaryColor.value,
      province: elements.province.value.trim() || "Buenos Aires",
      secondaryColor: elements.secondaryColor.value,
      zoneCode: elements.zone.value.trim()
    };
  }

  function setFormBusy(isBusy) {
    state.formBusy = isBusy;
    elements.form.querySelectorAll("input, button").forEach((control) => {
      if (control === elements.cancelEdit && elements.cancelEdit.hidden) return;
      control.disabled = isBusy;
    });
    elements.prefix.disabled = isBusy || Boolean(state.editingSchoolId);
    elements.saveButton.textContent = isBusy
      ? "Guardando..."
      : state.editingSchoolId
        ? "Guardar cambios"
        : "Crear colegio y generar código";
  }

  async function copyCode(code) {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
    } catch (_error) {
      const temporaryInput = document.createElement("textarea");
      temporaryInput.value = code;
      temporaryInput.setAttribute("readonly", "");
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      document.execCommand("copy");
      temporaryInput.remove();
    }

    showToast(`Código ${code} copiado.`);
  }

  async function handleLogout() {
    await client.auth.signOut();
    window.location.href = "login.html";
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }

  function sanitizePrefix(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
  }

  function normalizeCode(value) {
    return String(value || "").trim().toUpperCase();
  }

  function normalizeSearch(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
  }

  function getReadableError(error) {
    const message = String(error?.message || "");

    if (/admin_create_school|admin_update_school|admin_set_school_active/i.test(message)) {
      return "Primero ejecutá supabase_admin.sql en Supabase.";
    }

    if (/duplicate|unique|already exists/i.test(message)) {
      return "Ya existe un colegio con ese nombre o código.";
    }

    if (/permission|policy|not authorized|administrador/i.test(message)) {
      return "Tu cuenta no tiene permisos para realizar esta acción.";
    }

    return "No se pudo guardar el colegio. Revisá la consola para más información.";
  }
})();
