(function () {

const {
  FALLBACK_PRODUCT_IMAGE,
  escapeHtml,
  fetchFavoriteIds,
  formatMemberSince,
  formatPrice,
  formatPublishedDate,
  formatRating,
  formatResponseTime,
  formatViews,
  getCurrentUser,
  getProductFavoriteCount,
  getInitials,
  loadPublicProfileBundle,
  safeProductRecord,
  toggleFavorite
} = window.colegioLibreApi;

const publicUserId = new URLSearchParams(window.location.search).get("id");

const elements = {
  accountLink: document.getElementById("public-account-link"),
  emptyState: document.getElementById("public-empty-state"),
  grid: document.getElementById("public-products-grid"),
  name: document.getElementById("profile-name"),
  profileRating: document.getElementById("profile-rating"),
  profileResponseTime: document.getElementById("profile-response-time"),
  productsCount: document.getElementById("profile-products-count"),
  schoolCommunityLink: document.getElementById("school-community-link"),
  schoolLink: document.getElementById("profile-school-link"),
  searchForm: document.getElementById("public-profile-search-form"),
  searchInput: document.getElementById("public-profile-search"),
  soldCount: document.getElementById("profile-sold-count"),
  tabCountActive: document.getElementById("tab-count-active"),
  tabCountSold: document.getElementById("tab-count-sold"),
  tabs: Array.from(document.querySelectorAll(".public-tab")),
  toast: document.getElementById("toast"),
  totalFavorites: document.getElementById("profile-total-favorites"),
  totalViews: document.getElementById("profile-total-views"),
  userAvatar: document.getElementById("profile-avatar"),
  userSince: document.getElementById("profile-member-since"),
  zone: document.getElementById("profile-zone")
};

const state = {
  currentTab: "active",
  favoriteCountMap: new Map(),
  favoriteIds: new Set(),
  products: [],
  profile: null,
  stats: {
    soldCount: 0,
    totalFavorites: 0,
    totalPublications: 0,
    totalViews: 0
  }
};

initPublicProfile();

async function initPublicProfile() {
  bindEvents();

  const currentUser = await getCurrentUser();
  if (elements.accountLink) {
    elements.accountLink.href = currentUser ? "perfil.html" : "login.html";
    elements.accountLink.textContent = currentUser ? "Mi cuenta" : "Ingresar";
  }

  if (!publicUserId) {
    window.location.href = "index.html";
    return;
  }

  await loadBundle();
  renderTabs();
  renderProducts();
}

function bindEvents() {
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentTab = button.dataset.state || "active";
      renderTabs();
      renderProducts();
    });
  });

  elements.searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const term = elements.searchInput?.value.trim();
    const url = term ? `index.html?search=${encodeURIComponent(term)}` : "index.html";
    window.location.href = url;
  });
}

async function loadBundle() {
  const bundle = await loadPublicProfileBundle(publicUserId);

  state.profile = bundle.profile || null;
  state.products = (bundle.products || []).map(safeProductRecord);
  state.favoriteCountMap = bundle.favoriteCountMap || new Map();
  state.stats = bundle.stats || state.stats;
  state.favoriteIds = await fetchFavoriteIds(state.products.map((product) => product.id));
  hydrateProfileSummary();
}

function hydrateProfileSummary() {
  const fallbackProduct = state.products[0] || null;
  const profileName = state.profile?.name || fallbackProduct?.seller_name || "Vendedor ColegioLibre";
  const schoolName = state.profile?.school_name || fallbackProduct?.school_name || "Colegio no especificado";
  const schoolCode = state.profile?.school_code || fallbackProduct?.school_code || null;
  const zoneLabel = state.profile?.zone_code || fallbackProduct?.zone_code || "Zona no especificada";
  const totalViews = state.stats.totalViews || state.products.reduce((sum, product) => sum + Number(product.views || 0), 0);
  const totalPublished = state.stats.totalPublications || state.products.length;

  document.title = `ColegioLibre | ${profileName}`;

  elements.name.textContent = profileName;
  elements.userAvatar.textContent = getInitials(profileName);
  elements.zone.textContent = zoneLabel;
  elements.productsCount.textContent = String(totalPublished);
  elements.soldCount.textContent = String(state.stats.soldCount || 0);
  elements.profileRating.textContent = formatRating(state.profile?.rating);
  elements.profileResponseTime.textContent = formatResponseTime(state.profile?.response_time);
  elements.totalViews.textContent = formatViews(totalViews);
  elements.totalFavorites.textContent = String(state.stats.totalFavorites || 0);
  elements.userSince.textContent = formatMemberSince(state.profile?.member_since);

  if (schoolCode) {
    const schoolHref = `colegio.html?code=${encodeURIComponent(schoolCode)}`;
    elements.schoolLink.href = schoolHref;
    elements.schoolLink.textContent = schoolName;
    elements.schoolCommunityLink.href = schoolHref;
    elements.schoolCommunityLink.textContent = `Ver comunidad de ${schoolName}`;
  } else {
    elements.schoolLink.removeAttribute("href");
    elements.schoolLink.textContent = schoolName;
    elements.schoolCommunityLink.removeAttribute("href");
    elements.schoolCommunityLink.textContent = "Colegio no disponible";
  }
}

function renderTabs() {
  const activeCount = getProductsForCurrentTab("active").length;
  const soldCount = getProductsForCurrentTab("sold").length;

  elements.tabCountActive.textContent = `(${activeCount})`;
  elements.tabCountSold.textContent = `(${soldCount})`;

  elements.tabs.forEach((button) => {
    const isActive = button.dataset.state === state.currentTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function getProductsForCurrentTab(tabName = state.currentTab) {
  if (tabName === "sold") {
    return state.products.filter((product) => product.status === "sold");
  }

  return state.products.filter((product) => product.status === "available" || product.status === "reserved");
}

function renderProducts() {
  const products = getProductsForCurrentTab();
  elements.grid.innerHTML = "";

  if (!products.length) {
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;

  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "public-card";
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Abrir producto ${product.title}`);
    card.innerHTML = `
      <div class="public-card__media">
        <span class="public-card__badge">${escapeHtml(product.condition)}</span>
        <button
          class="public-card__favorite ${state.favoriteIds.has(product.id) ? "is-active" : ""}"
          type="button"
          aria-label="Guardar ${escapeHtml(product.title)} en favoritos"
          aria-pressed="${state.favoriteIds.has(product.id)}"
          data-favorite-id="${escapeHtml(product.id)}"
        >
          <svg class="icon"><use href="#icon-heart"></use></svg>
        </button>
        <img src="${escapeHtml(product.image_url || FALLBACK_PRODUCT_IMAGE)}" alt="${escapeHtml(product.title)}" />
      </div>
      <div class="public-card__body">
        <div class="public-card__meta">
          <span class="public-card__school">${escapeHtml(product.school_name || "ColegioLibre")}</span>
          <span>${escapeHtml(product.location)}</span>
        </div>
        <h3 class="public-card__title">${escapeHtml(product.title)}</h3>
        <p class="public-card__price">${escapeHtml(formatPrice(product.price))}</p>
        <div class="public-card__footer">
          <span><svg class="icon"><use href="#icon-clock"></use></svg>${escapeHtml(formatPublishedDate(product.created_at))}</span>
          <span><svg class="icon"><use href="#icon-box"></use></svg>${escapeHtml(formatViews(product.views))}</span>
          <span><svg class="icon"><use href="#icon-heart"></use></svg>${escapeHtml(String(getProductFavoriteCount(product, state.favoriteCountMap)))}</span>
        </div>
      </div>
    `;

    const image = card.querySelector("img");
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };

    const favoriteButton = card.querySelector("[data-favorite-id]");
    favoriteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await handleFavoriteToggle(product.id, favoriteButton);
    });

    card.addEventListener("click", () => {
      window.location.href = `producto.html?id=${encodeURIComponent(product.id)}`;
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = `producto.html?id=${encodeURIComponent(product.id)}`;
      }
    });

    elements.grid.appendChild(card);
  });
}

async function handleFavoriteToggle(productId, button) {
  const result = await toggleFavorite(productId);

  if (result?.requiresAuth) {
    window.location.href = "login.html";
    return;
  }

  if (result?.error) {
    console.error("Error actualizando favorito:", result.error);
    showToast("No se pudo actualizar el favorito.");
    return;
  }

  if (result.active) {
    state.favoriteIds.add(productId);
  } else {
    state.favoriteIds.delete(productId);
  }

  const isActive = Boolean(result.active);
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
  showToast(isActive ? "Producto guardado en favoritos." : "Producto quitado de favoritos.");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2200);
}

})();
