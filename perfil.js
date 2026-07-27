(function () {

const {
  FALLBACK_PRODUCT_IMAGE,
  escapeHtml,
  formatMemberSince,
  formatPrice,
  formatPublishedDate,
  formatRating,
  formatResponseTime,
  getCurrentProfile,
  getCurrentUser,
  getInitials,
  getProductFavoriteCount,
  getStatusLabel,
  loadUserDashboard
} = window.colegioLibreApi;

const listElement = document.querySelector("#publication-list");
const template = document.querySelector("#publication-card-template");
const tabs = Array.from(document.querySelectorAll(".publication-tab"));
const accountToggle = document.querySelector("#account-toggle");
const overlay = document.querySelector("#layout-overlay");
const sectionTitle = document.querySelector("#profile-section-title");
const sectionDescription = document.querySelector("#profile-section-description");
const publishButton = document.querySelector("#publish-product-link");
const publicationTabs = document.querySelector("#publication-tabs");
const profileViewButtons = Array.from(document.querySelectorAll("[data-profile-view]"));
const dashboardOverview = document.querySelector("#dashboard-overview");
const publicationPanel = document.querySelector("#publication-panel");
const securityBanner = document.querySelector("#security-banner");
const utilityPanel = document.querySelector("#utility-panel");
const settingsPanel = document.querySelector("#settings-panel");
const settingsForm = document.querySelector("#settings-form");
const settingsName = document.querySelector("#settings-name");
const settingsEmail = document.querySelector("#settings-email");
const settingsSchoolCode = document.querySelector("#settings-school-code");
const settingsSchoolName = document.querySelector("#settings-school-name");
const settingsZone = document.querySelector("#settings-zone");
const settingsLogoutButton = document.querySelector("#settings-logout-button");

const dashboardSummary = document.querySelector("#dashboard-summary");
const metricActiveProducts = document.querySelector("#metric-active-products");
const metricSoldProducts = document.querySelector("#metric-sold-products");
const metricTotalViews = document.querySelector("#metric-total-views");
const metricTotalFavorites = document.querySelector("#metric-total-favorites");
const metricTotalConversations = document.querySelector("#metric-total-conversations");
const metricTotalPublications = document.querySelector("#metric-total-publications");
const dashboardSchoolName = document.querySelector("#dashboard-school-name");
const dashboardMemberSince = document.querySelector("#dashboard-member-since");
const dashboardRating = document.querySelector("#dashboard-rating");
const dashboardResponseTime = document.querySelector("#dashboard-response-time");
const dashboardSalesCount = document.querySelector("#dashboard-sales-count");

const state = {
  currentSection: "publications",
  currentState: "active",
  currentUser: null,
  favoriteCountMap: new Map(),
  messageCounts: {},
  pendingNotice: "",
  pendingProductIds: new Set(),
  products: [],
  profile: null,
  stats: {
    activeCount: 0,
    soldCount: 0,
    totalConversations: 0,
    totalFavorites: 0,
    totalPublications: 0,
    totalViews: 0
  },
  publicationsByState: {
    active: [],
    paused: [],
    sold: []
  }
};

const tabToState = {
  "tab-activas": "active",
  "tab-pausadas": "paused",
  "tab-vendidas": "sold"
};

const sectionMeta = {
  messages: {
    description: "Seguí todas tus conversaciones activas y contestá rápido desde un solo lugar.",
    title: "Mensajes"
  },
  publications: {
    description: "Administrá tus materiales, revisá métricas reales y seguí el estado de cada publicación.",
    title: "Mis publicaciones"
  },
  purchases: {
    description: "Acá vas a concentrar tu historial de compras cuando empieces a reservar materiales.",
    title: "Compras"
  },
  sales: {
    description: "Revisá tus materiales vendidos y el rendimiento de tus publicaciones cerradas.",
    title: "Ventas"
  },
  settings: {
    description: "Actualizá tu perfil, tu colegio y la zona usada para personalizar la experiencia.",
    title: "Ajustes"
  }
};

const toast = createToast();

initPerfil();

async function initPerfil() {
  hydrateViewState();
  bindEvents();

  state.currentUser = await getCurrentUser();

  if (!state.currentUser) {
    window.location.replace(
      `login.html?next=${encodeURIComponent(getCurrentProfileDestination())}`
    );
    return;
  }

  const currentProfile = await getCurrentProfile(true);

  if (!currentProfile?.school_code) {
    window.location.replace(
      `index.html?onboarding=1&next=${encodeURIComponent(getCurrentProfileDestination())}`
    );
    return;
  }

  await hydrateDashboard(state.currentUser.id);
  renderCounts();
  renderDashboard();
  renderSettingsForm();
  renderCurrentSection();

  if (state.pendingNotice) {
    showToast(state.pendingNotice);
  }
}

function getCurrentProfileDestination() {
  return `perfil.html${window.location.search}`;
}

function hydrateViewState() {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const allowedViews = new Set(["publications", "messages", "purchases", "sales", "settings"]);

  if (rawView === "favorites") {
    state.currentSection = "publications";
    state.pendingNotice = "Favoritos se está rediseñando.";
    params.delete("view");
    history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    return;
  }

  state.currentSection = allowedViews.has(rawView) ? rawView : "publications";

  if (state.currentSection === "sales") {
    state.currentState = "sold";
  }
}

function createToast() {
  const element = document.createElement("div");
  element.className = "profile-toast";
  element.hidden = true;
  document.body.appendChild(element);
  return element;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

async function hydrateDashboard(userId) {
  const dashboard = await loadUserDashboard(userId);

  state.profile = dashboard.profile;
  state.products = dashboard.products || [];
  state.favoriteCountMap = dashboard.favoriteCountMap instanceof Map ? dashboard.favoriteCountMap : new Map();
  state.messageCounts = Object.fromEntries(dashboard.messageCountMap || []);
  state.stats = dashboard.stats || state.stats;

  hydrateProfileCard();
  partitionProducts();
}

function hydrateProfileCard() {
  document.getElementById("profile-name").textContent = state.profile?.name || "Mi perfil";
  const schoolLink = document.getElementById("profile-school");
  schoolLink.textContent = state.profile?.school_name || "Colegio no especificado";

  if (state.profile?.school_code) {
    schoolLink.href = `colegio.html?code=${encodeURIComponent(state.profile.school_code)}`;
  } else {
    schoolLink.removeAttribute("href");
  }

  document.getElementById("profile-avatar").textContent = getInitials(state.profile?.name);
}

function partitionProducts() {
  const activeStatuses = new Set(["available", "reserved"]);

  state.publicationsByState.active = state.products
    .filter((product) => activeStatuses.has(product.status))
    .map(mapProductToPublication);

  state.publicationsByState.paused = state.products
    .filter((product) => product.status === "paused")
    .map(mapProductToPublication);

  state.publicationsByState.sold = state.products
    .filter((product) => product.status === "sold")
    .map(mapProductToPublication);
}

function mapProductToPublication(product) {
  return {
    category: product.category || "Otros",
    condition: product.condition || "Usado",
    favorites: getProductFavoriteCount(product, state.favoriteCountMap),
    id: product.id,
    image_url: product.image_url || FALLBACK_PRODUCT_IMAGE,
    messages: Number(state.messageCounts[product.id] || 0),
    price: formatPrice(product.price),
    published: formatPublishedDate(product.created_at),
    size: product.size || null,
    status: product.status || "available",
    subject: product.subject || null,
    subcategory: product.subcategory || null,
    title: product.title || "Producto sin título",
    visits: Number(product.views || 0)
  };
}

function renderCounts() {
  document.querySelectorAll("[data-count-for]").forEach((counter) => {
    const statusKey = counter.getAttribute("data-count-for");
    counter.textContent = `(${state.publicationsByState[statusKey].length})`;
  });
}

function renderDashboard() {
  metricActiveProducts.textContent = String(state.stats.activeCount || 0);
  metricSoldProducts.textContent = String(state.stats.soldCount || 0);
  metricTotalViews.textContent = String(state.stats.totalViews || 0);
  metricTotalFavorites.textContent = String(state.stats.totalFavorites || 0);
  metricTotalConversations.textContent = String(state.stats.totalConversations || 0);
  metricTotalPublications.textContent = String(state.stats.totalPublications || 0);

  dashboardSchoolName.textContent = state.profile?.school_name || "Colegio no especificado";
  dashboardMemberSince.textContent = formatMemberSince(state.profile?.member_since);
  dashboardRating.textContent = formatRating(state.profile?.rating);
  dashboardResponseTime.textContent = formatResponseTime(state.profile?.response_time);
  dashboardSalesCount.textContent = String(state.profile?.sales_count || state.stats.soldCount || 0);
  dashboardSummary.textContent = `Publicaste ${state.stats.totalPublications || 0} materiales, acumulaste ${state.stats.totalViews || 0} vistas y ${state.stats.totalFavorites || 0} favoritos reales.`;
}

function renderSettingsForm() {
  if (!settingsForm) return;

  settingsName.value = state.profile?.name || "";
  settingsEmail.value = state.currentUser?.email || "";
  settingsSchoolCode.value = state.profile?.school_code || "";
  settingsSchoolName.value = state.profile?.school_name || "";
  settingsZone.value = state.profile?.zone_code || "";
}

function renderCurrentSection() {
  updateSectionUi();

  if (state.currentSection === "publications") {
    renderPublicationList(state.publicationsByState[state.currentState], "No tenés publicaciones en esta sección.");
    return;
  }

  if (state.currentSection === "sales") {
    renderPublicationList(state.publicationsByState.sold, "Todavía no marcaste publicaciones como vendidas.");
    return;
  }

  if (state.currentSection === "settings") {
    renderSettingsForm();
    return;
  }

  if (state.currentSection === "messages") {
    renderUtilitySection({
      actionHref: "mensajes.html",
      actionLabel: "Abrir bandeja de mensajes",
      body:
        "Centralizá todas tus conversaciones con compradores y vendedores. Desde acá podés entrar al chat completo y responder rápido.",
      eyebrow: "Comunicación",
      metrics: [
        { label: "Conversaciones", value: String(state.stats.totalConversations || 0) },
        { label: "Productos activos", value: String(state.stats.activeCount || 0) }
      ],
      title: "Tu centro de mensajes"
    });
    return;
  }

  renderUtilitySection({
    actionHref: "index.html",
    actionLabel: "Explorar marketplace",
    body:
      "Todavía no armamos un historial de compras completo. En la próxima iteración vamos a mostrar reservas, acuerdos y materiales comprados.",
    eyebrow: "Próximamente",
    metrics: [
      { label: "Reservados", value: String(state.publicationsByState.active.filter((item) => item.status === "reserved").length) },
      { label: "Colegio activo", value: state.profile?.school_name || "Sin colegio" }
    ],
    title: "Compras en preparación"
  });
}

function updateSectionUi() {
  const meta = sectionMeta[state.currentSection] || sectionMeta.publications;
  const showsPublicationContent = state.currentSection === "publications" || state.currentSection === "sales";
  const showsSettings = state.currentSection === "settings";

  sectionTitle.textContent = meta.title;
  sectionDescription.textContent = meta.description;

  dashboardOverview.hidden = !showsPublicationContent;
  publicationPanel.hidden = !showsPublicationContent;
  securityBanner.hidden = !showsPublicationContent;
  utilityPanel.hidden = showsPublicationContent || showsSettings;
  settingsPanel.hidden = !showsSettings;
  publishButton.hidden = state.currentSection !== "publications";
  publicationTabs.hidden = state.currentSection !== "publications";

  profileViewButtons.forEach((button) => {
    const isActive = button.getAttribute("data-profile-view") === state.currentSection;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function renderPublicationList(items, emptyMessage) {
  if (!listElement || !template) return;

  listElement.innerHTML = "";

  if (!items.length) {
    listElement.innerHTML = `
      <div class="profile-empty-card">
        ${escapeHtml(emptyMessage)}
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    listElement.appendChild(buildPublicationCard(item));
  });
}

function renderUtilitySection(config) {
  utilityPanel.innerHTML = `
    <article class="utility-panel__card">
      <div class="utility-panel__copy">
        <p class="section-kicker">${escapeHtml(config.eyebrow)}</p>
        <h2>${escapeHtml(config.title)}</h2>
        <p>${escapeHtml(config.body)}</p>
      </div>

      <div class="utility-panel__metrics">
        ${(config.metrics || [])
          .map(
            (item) => `
              <div class="utility-metric">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>

      <div class="utility-panel__actions">
        <a class="publish-button publish-button--green" href="${escapeHtml(config.actionHref)}">
          ${escapeHtml(config.actionLabel)}
        </a>
      </div>
    </article>
  `;
}

function buildPublicationCard(item) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".publication-card");
  const thumb = fragment.querySelector(".publication-thumb");
  const title = fragment.querySelector(".publication-card__title");
  const subline = fragment.querySelector(".publication-card__subline");
  const price = fragment.querySelector(".publication-card__price");
  const condition = fragment.querySelector(".condition-pill");
  const stats = fragment.querySelectorAll(".publication-stat");
  const published = fragment.querySelector(".publication-card__time");
  const menuTrigger = fragment.querySelector(".publication-menu__trigger");
  const dropdown = fragment.querySelector(".publication-menu__dropdown");

  card.dataset.productId = item.id;

  if (thumb) {
    thumb.innerHTML = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:cover;border-radius:18px;">`;
    const image = thumb.querySelector("img");
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };
  }

  title.textContent = item.title;
  if (subline) {
    const details = [
      item.category,
      item.subject,
      item.subcategory,
      item.size
        ? `${item.category === "Uniformes" ? "Talle" : "Tamaño"} ${item.size}`
        : null
    ].filter(Boolean);

    subline.textContent = details.join(" · ");
    subline.hidden = !details.length;
  }

  price.textContent = item.price;
  condition.textContent = item.condition;
  condition.dataset.condition = item.condition;

  stats[0].querySelector(".publication-stat__value").textContent = item.visits;
  stats[0].querySelector(".publication-stat__label").textContent =
    item.visits === 1 ? "visita" : "vistas";

  stats[1].querySelector(".publication-stat__value").textContent = item.favorites;
  stats[1].querySelector(".publication-stat__label").textContent =
    item.favorites === 1 ? "favorito" : "favoritos";

  stats[2].querySelector(".publication-stat__value").textContent = item.messages;
  stats[2].querySelector(".publication-stat__label").textContent =
    item.messages === 1 ? "mensaje" : "mensajes";

  published.textContent = `${item.published} · ${getStatusLabel(item.status)}`;
  dropdown.innerHTML = buildMenuActions(item.status);

  card.addEventListener("click", (event) => {
    if (event.target.closest(".publication-menu")) {
      return;
    }

    window.location.href = `producto.html?id=${encodeURIComponent(item.id)}`;
  });

  menuTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = dropdown.hidden;
    closeMenusExcept(dropdown);
    dropdown.hidden = !willOpen;
    card.classList.toggle("is-menu-open", willOpen);
    menuTrigger.setAttribute("aria-expanded", String(willOpen));
  });

  dropdown.querySelectorAll("[data-status-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const nextStatus = button.getAttribute("data-status-action");
      const updated = await updateProductStatus(item.id, nextStatus, button);
      if (updated) {
        closeMenusExcept(null);
      }
    });
  });

  dropdown.querySelector("[data-edit-action]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    window.location.href = `publicar.html?edit=${encodeURIComponent(item.id)}`;
  });

  return fragment;
}

function buildMenuActions(status) {
  if (status === "paused") {
    return `
      <button type="button" role="menuitem" data-edit-action>Editar publicación</button>
      <button type="button" role="menuitem" data-status-action="available">Reactivar producto</button>
      <button type="button" role="menuitem" data-status-action="sold">Marcar como vendido</button>
    `;
  }

  if (status === "sold") {
    return `
      <button type="button" role="menuitem" data-edit-action>Editar publicación</button>
      <button type="button" role="menuitem" data-status-action="available">Volver a publicar</button>
    `;
  }

  return `
    <button type="button" role="menuitem" data-edit-action>Editar publicación</button>
    <button type="button" role="menuitem" data-status-action="paused">Pausar producto</button>
    <button type="button" role="menuitem" data-status-action="sold">Marcar como vendido</button>
  `;
}

async function updateProductStatus(productId, nextStatus, sourceButton) {
  const allowedStatuses = new Set(["available", "paused", "sold"]);

  if (!allowedStatuses.has(nextStatus) || state.pendingProductIds.has(productId)) {
    return false;
  }

  state.pendingProductIds.add(productId);
  sourceButton?.setAttribute("aria-busy", "true");
  sourceButton?.setAttribute("disabled", "");

  try {
    const updatePayload = {
      status: nextStatus,
      updated_at: new Date().toISOString()
    };

    if (nextStatus === "available") {
      updatePayload.reserved_for = null;
    }

    const { data: updatedProduct, error } = await window.colegioLibreSupabase
      .from("products")
      .update(updatePayload)
      .eq("id", productId)
      .eq("user_id", state.currentUser.id)
      .select("id, status")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!updatedProduct) {
      showToast("No tenés permiso para modificar esta publicación.");
      return false;
    }

    await hydrateDashboard(state.currentUser.id);
    renderCounts();
    renderDashboard();
    renderCurrentSection();

    const successMessages = {
      available: "La publicación volvió a estar disponible.",
      paused: "La publicación quedó pausada.",
      sold: "La publicación se marcó como vendida."
    };
    showToast(successMessages[nextStatus]);
    return true;
  } catch (error) {
    console.error("Error actualizando estado:", error);
    showToast("No se pudo actualizar el estado.");
    return false;
  } finally {
    state.pendingProductIds.delete(productId);
    sourceButton?.removeAttribute("aria-busy");
    sourceButton?.removeAttribute("disabled");
  }
}

function activateTab(nextState) {
  state.currentState = nextState;

  tabs.forEach((tab) => {
    const isActive = tabToState[tab.id] === nextState;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  renderCurrentSection();
}

function activateSection(nextSection) {
  const allowedViews = new Set(["publications", "messages", "purchases", "sales", "settings"]);
  state.currentSection = allowedViews.has(nextSection) ? nextSection : "publications";

  if (state.currentSection === "sales") {
    state.currentState = "sold";
  } else if (state.currentSection === "publications" && state.currentState === "sold") {
    state.currentState = "active";
  }

  tabs.forEach((tab) => {
    const isActive = tabToState[tab.id] === state.currentState;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  const url = new URL(window.location.href);
  if (state.currentSection === "publications") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", state.currentSection);
  }

  history.replaceState(null, "", url.pathname + url.search + url.hash);
  setSidebarOpen(false);
  renderCurrentSection();
}

function closeMenusExcept(exception) {
  document.querySelectorAll(".publication-menu").forEach((menu) => {
    const trigger = menu.querySelector(".publication-menu__trigger");
    const dropdown = menu.querySelector(".publication-menu__dropdown");
    const isException = dropdown === exception;

    dropdown.hidden = !isException;
    menu.closest(".publication-card")?.classList.toggle("is-menu-open", isException);
    trigger.setAttribute("aria-expanded", String(isException));
  });
}

function setSidebarOpen(isOpen) {
  document.body.dataset.sidebarOpen = String(isOpen);
  if (overlay) overlay.hidden = !isOpen;
  accountToggle?.setAttribute("aria-expanded", String(isOpen));
}

function bindEvents() {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tabToState[tab.id]);
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".publication-menu")) {
      closeMenusExcept(null);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenusExcept(null);
      setSidebarOpen(false);
    }
  });

  accountToggle?.addEventListener("click", () => {
    const nextValue = document.body.dataset.sidebarOpen !== "true";
    setSidebarOpen(nextValue);
  });

  overlay?.addEventListener("click", () => setSidebarOpen(false));

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      setSidebarOpen(false);
    }
  });

  document.querySelectorAll(".search-bar").forEach((searchForm) => {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = searchForm.querySelector('input[type="search"]');
      const term = input?.value.trim();
      const url = term ? `index.html?search=${encodeURIComponent(term)}` : "index.html";
      window.location.href = url;
    });
  });

  settingsForm?.addEventListener("submit", handleSettingsSubmit);
  settingsLogoutButton?.addEventListener("click", handleLogout);
  settingsSchoolCode?.addEventListener("input", () => {
    settingsSchoolName.value = "";
  });

  bindNavigation();
}

function bindNavigation() {
  const headerButtons = Array.from(document.querySelectorAll(".header-action"));
  headerButtons[0]?.addEventListener("click", () => activateSection("messages"));
  headerButtons[1]?.addEventListener("click", () => activateSection("settings"));
  headerButtons[2]?.addEventListener("click", () => activateSection("publications"));

  profileViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateSection(button.getAttribute("data-profile-view"));
    });
  });

  document.querySelectorAll("[data-profile-action='logout']").forEach((button) => {
    button.addEventListener("click", handleLogout);
  });
}

async function handleSettingsSubmit(event) {
  event.preventDefault();

  const name = settingsName.value.trim();
  const requestedSchoolCode = settingsSchoolCode.value.trim().toUpperCase();
  const requestedZone = settingsZone.value.trim();

  if (!name) {
    showToast("Completá tu nombre para guardar los ajustes.");
    return;
  }

  let schoolCode = null;
  let schoolName = null;
  let zoneCode = requestedZone || null;

  if (requestedSchoolCode) {
    const { data: school, error } = await window.colegioLibreSupabase
      .from("schools")
      .select("*")
      .eq("code", requestedSchoolCode)
      .maybeSingle();

    if (error || !school) {
      console.error("Error validando colegio:", error);
      showToast("Ese código de colegio no existe.");
      return;
    }

    schoolCode = school.code;
    schoolName = school.name;
    if (!zoneCode) {
      zoneCode = school.zone || null;
    }
  }

  const payload = {
    id: state.currentUser.id,
    member_since: state.profile?.member_since || state.profile?.created_at || new Date().toISOString(),
    name,
    school_code: schoolCode,
    school_name: schoolName,
    zone_code: zoneCode
  };

  const { error } = await window.colegioLibreSupabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.error("Error guardando ajustes:", error);
    showToast("No se pudieron guardar los ajustes.");
    return;
  }

  await hydrateDashboard(state.currentUser.id);
  renderCounts();
  renderDashboard();
  renderSettingsForm();
  renderCurrentSection();
  showToast("Ajustes guardados correctamente.");
}

async function handleLogout() {
  const { error } = await window.colegioLibreSupabase.auth.signOut();

  if (error) {
    console.error("Error cerrando sesión:", error);
    showToast("No se pudo cerrar la sesión.");
    return;
  }

  window.location.href = "index.html";
}

})();
