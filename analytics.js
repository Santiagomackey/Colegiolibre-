(function () {
  "use strict";

  const api = window.colegioLibreApi || {};
  const client = window.colegioLibreSupabase;
  const gate = document.getElementById("analytics-gate");
  const dashboard = document.getElementById("analytics-dashboard");
  const refreshButton = document.getElementById("analytics-refresh");
  const updatedLabel = document.getElementById("analytics-updated");
  const logoutButton = document.getElementById("analytics-logout");
  const usersSearch = document.getElementById("users-search");
  const productsSearch = document.getElementById("products-search");
  const usersTable = document.getElementById("users-table");
  const productsTable = document.getElementById("products-table");
  const topPublishers = document.getElementById("top-publishers");
  const toast = document.getElementById("analytics-toast");

  const state = {
    data: null,
    loading: false
  };

  init();

  async function init() {
    bindEvents();
    if (!client || !api.getCurrentUser || !api.isAdminUser) {
      return deny("No se pudo cargar Analytics.");
    }

    const user = await api.getCurrentUser(true);
    if (!user) {
      window.location.href = "login.html?next=analytics.html";
      return;
    }

    if (!(await api.isAdminUser())) {
      return deny("Tu cuenta no tiene permisos de administrador.");
    }

    gate.hidden = true;
    dashboard.hidden = false;
    await loadData();
  }

  function bindEvents() {
    refreshButton?.addEventListener("click", loadData);
    usersSearch?.addEventListener("input", renderUsers);
    productsSearch?.addEventListener("input", renderProducts);
    logoutButton?.addEventListener("click", async () => {
      await client.auth.signOut();
      window.location.href = "index.html";
    });
  }

  function deny(message) {
    gate.innerHTML = `<h1>Acceso restringido</h1><p>${escapeHtml(message)}</p><a href="./index.html">Volver al inicio</a>`;
  }

  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    refreshButton.disabled = true;
    refreshButton.textContent = "Actualizando…";

    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("La sesión expiró.");

      const response = await fetch("/api/admin-analytics", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar Analytics.");

      state.data = payload;
      renderMetrics();
      renderUsers();
      renderProducts();
      renderPublishers();
      updatedLabel.textContent = `Actualizado ${formatDate(payload.generated_at)}`;
    } catch (error) {
      showToast(error.message || "No se pudo cargar Analytics.");
    } finally {
      state.loading = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "Actualizar datos";
    }
  }

  function renderMetrics() {
    const metrics = state.data?.metrics || {};
    setText("metric-registered", metrics.registered_users);
    setText("metric-login24", metrics.signed_in_24h);
    setText("metric-login7", metrics.signed_in_7d);
    setText("metric-new7", metrics.new_users_7d);
    setText("metric-products", metrics.total_products);
    setText("metric-active-products", metrics.active_products);
    setText("metric-sold-products", metrics.sold_products);
    setText("metric-publishers", metrics.publishers);
  }

  function renderUsers() {
    const term = normalize(usersSearch?.value);
    const users = (state.data?.users || []).filter((user) =>
      normalize([user.name, user.email, user.school_name].join(" ")).includes(term)
    );

    usersTable.innerHTML = users.length
      ? users.map((user) => `
        <tr>
          <td><div class="user-main"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div></td>
          <td>${escapeHtml(user.school_name)}</td>
          <td>${user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "Nunca"}</td>
          <td>${Number(user.products_count || 0)}</td>
          <td><span class="status ${user.email_confirmed ? "status--ok" : "status--warn"}">${user.email_confirmed ? "Verificado" : "Email pendiente"}</span></td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" class="empty-row">No encontramos usuarios.</td></tr>`;
  }

  function renderProducts() {
    const term = normalize(productsSearch?.value);
    const products = (state.data?.recent_products || []).filter((product) =>
      normalize([product.title, product.publisher_name, product.publisher_email, product.school_name].join(" ")).includes(term)
    );

    productsTable.innerHTML = products.length
      ? products.map((product) => `
        <tr>
          <td><div class="product-main"><strong>${escapeHtml(product.title)}</strong><small>${escapeHtml(product.category)}</small></div></td>
          <td><div class="user-main"><strong>${escapeHtml(product.publisher_name)}</strong><small>${escapeHtml(product.publisher_email)}</small></div></td>
          <td>${escapeHtml(product.school_name)}</td>
          <td><span class="status ${statusClass(product.status)}">${escapeHtml(statusLabel(product.status))}</span></td>
          <td>${Number(product.views || 0)}</td>
          <td>${formatDate(product.created_at)}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="6" class="empty-row">No encontramos productos.</td></tr>`;
  }

  function renderPublishers() {
    const items = state.data?.top_publishers || [];
    topPublishers.innerHTML = items.length
      ? items.map((item) => `
        <div class="publisher-item">
          <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.school_name)} · ${escapeHtml(item.email)}</small></div>
          <span class="publisher-count">${Number(item.products_count || 0)}</span>
        </div>
      `).join("")
      : `<div class="empty-row">Todavía no hay vendedores.</div>`;
  }

  function statusLabel(status) {
    const labels = { available: "Disponible", reserved: "Reservado", paused: "Pausado", sold: "Vendido" };
    return labels[status] || status || "Disponible";
  }

  function statusClass(status) {
    if (status === "available" || status === "reserved") return "status--ok";
    if (status === "paused") return "status--warn";
    return "status--muted";
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = Number(value || 0).toLocaleString("es-AR");
  }

  function formatDate(value) {
    if (!value) return "Sin datos";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin datos";
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => { toast.hidden = true; }, 3200);
  }
})();
