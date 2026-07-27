(function () {

const {
  FALLBACK_PRODUCT_IMAGE,
  escapeHtml,
  fetchFavoriteIds,
  formatPrice,
  getCurrentUser,
  getInitials,
  getSchoolByCode,
  safeProductRecord,
  toggleFavorite
} = window.colegioLibreApi;

const schoolCode = (
  new URLSearchParams(window.location.search).get("code") || ""
)
  .trim()
  .toUpperCase();

const elements = {
  categoriesCount: document.getElementById("school-categories-count"),
  emptyState: document.getElementById("school-empty-state"),
  globalSearchForm: document.getElementById("school-global-search-form"),
  globalSearchInput: document.getElementById("school-global-search"),
  grid: document.getElementById("school-products-grid"),
  location: document.getElementById("school-location"),
  logo: document.getElementById("school-logo"),
  logoWrap: document.getElementById("school-logo-wrap"),
  name: document.getElementById("school-name"),
  officialName: document.getElementById("school-official-name"),
  productsCount: document.getElementById("school-products-count"),
  productsSearch: document.getElementById("school-products-search"),
  publishersCount: document.getElementById("school-publishers-count"),
  publishersList: document.getElementById("publisher-list"),
  schoolCategoryFilter: document.getElementById("school-category-filter"),
  schoolCodeLabel: document.getElementById("school-code-label"),
  schoolPublishLink: document.getElementById("school-publish-link"),
  toast: document.getElementById("school-toast")
};

const state = {
  favoriteIds: new Set(),
  products: [],
  school: null,
  searchTerm: "",
  selectedCategory: ""
};

initSchoolPage();

async function initSchoolPage() {
  bindEvents();

  if (!schoolCode) {
    window.location.href = "index.html";
    return;
  }

  await loadSchool();

  if (!state.school) {
    renderSchoolNotFound();
    return;
  }

  await loadSchoolProducts();
  renderHero();
  renderProducts();
  renderPublishers();
}

function bindEvents() {
  elements.globalSearchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const term = elements.globalSearchInput?.value.trim();
    const url = term ? `index.html?search=${encodeURIComponent(term)}` : "index.html";
    window.location.href = url;
  });

  elements.productsSearch?.addEventListener("input", (event) => {
    state.searchTerm = event.currentTarget.value.trim();
    renderProducts();
  });

  elements.schoolCategoryFilter?.addEventListener("change", (event) => {
    state.selectedCategory = event.currentTarget.value;
    renderProducts();
  });
}

async function loadSchool() {
  state.school = await getSchoolByCode(schoolCode);
}

async function loadSchoolProducts() {
  const { data, error } = await window.colegioLibreSupabase
    .from("products")
    .select("*")
    .eq("school_code", schoolCode)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando productos del colegio:", error);
    state.products = [];
    return;
  }

  state.products = (data || [])
    .map(safeProductRecord)
    .filter((product) => product.status === "available" || product.status === "reserved");

  state.favoriteIds = await fetchFavoriteIds(state.products.map((product) => product.id));
}

function renderHero() {
  const schoolName =
    state.school?.display_name ||
    state.school?.name ||
    state.products[0]?.school_name ||
    `Colegio ${schoolCode}`;
  const schoolLocation = [
    state.school?.zone,
    state.school?.city,
    state.school?.province
  ]
    .filter(Boolean)
    .join(" · ") || state.products[0]?.zone_code || "Ubicación no especificada";
  const publishers = getUniquePublishers();
  const categories = new Set(state.products.map((product) => product.category).filter(Boolean));

  document.title = `ColegioLibre | ${schoolName}`;
  elements.name.textContent = schoolName;
  elements.location.innerHTML = `
    <svg class="icon"><use href="#icon-pin"></use></svg>
    <span>${escapeHtml(schoolLocation)}</span>
  `;
  elements.productsCount.textContent = String(state.products.length);
  elements.publishersCount.textContent = String(publishers.length);
  elements.categoriesCount.textContent = String(categories.size);
  elements.schoolCodeLabel.textContent = `Código ${schoolCode.toUpperCase()}`;
  elements.schoolPublishLink.href =
    `publicar.html?school=${encodeURIComponent(schoolCode)}`;

  const officialName = state.school?.official_name || "";
  const shouldShowOfficialName =
    officialName &&
    normalize(officialName) !== normalize(schoolName);
  elements.officialName.hidden = !shouldShowOfficialName;
  elements.officialName.textContent = shouldShowOfficialName
    ? `Nombre oficial: ${officialName}`
    : "";

  const schoolLogoUrl = getSafeImageUrl(state.school?.logo_url);
  elements.logoWrap.hidden = !schoolLogoUrl;
  if (schoolLogoUrl) {
    elements.logo.src = schoolLogoUrl;
    elements.logo.alt = `Logo de ${schoolName}`;
    elements.logo.onerror = () => {
      elements.logoWrap.hidden = true;
    };
  }

  applySchoolTheme(state.school);
}

function renderSchoolNotFound() {
  document.title = "ColegioLibre | Colegio no encontrado";
  elements.name.textContent = "No encontramos este colegio";
  elements.location.innerHTML = `
    <svg class="icon"><use href="#icon-pin"></use></svg>
    <span>Revisá el enlace o buscá nuevamente tu colegio.</span>
  `;
  elements.schoolCodeLabel.textContent = `Código ${schoolCode}`;
  elements.schoolPublishLink.href = "index.html?onboarding=1";
  elements.schoolPublishLink.textContent = "Buscar mi colegio";
  elements.grid.innerHTML = "";
  elements.emptyState.hidden = false;
  elements.emptyState.textContent =
    "Este código no coincide con una comunidad escolar activa.";
  elements.publishersList.innerHTML = `
    <div class="school-empty-state">
      Elegí tu colegio desde el buscador para entrar a su comunidad.
    </div>
  `;
}

function applySchoolTheme(school) {
  const root = document.documentElement;
  const primary = getSafeColor(school?.primary_color, "#0B2E6B");
  const secondary = getSafeColor(school?.secondary_color, "#67C23A");
  const accent = getSafeColor(school?.accent_color, "#FFC72C");

  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-soft", primary);
  root.style.setProperty("--color-accent-green", secondary);
  root.style.setProperty("--color-accent-yellow", accent);
}

function getSafeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function getSafeImageUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (_error) {
    return "";
  }
}

function getUniquePublishers() {
  const registry = new Map();

  state.products.forEach((product) => {
    if (!product.user_id) return;

    const existing = registry.get(product.user_id) || {
      count: 0,
      name: product.seller_name || "Estudiante",
      school_name: product.school_name || "ColegioLibre",
      user_id: product.user_id,
      zone_code: product.zone_code || "Zona no especificada"
    };

    existing.count += 1;
    registry.set(product.user_id, existing);
  });

  return Array.from(registry.values()).sort((left, right) => right.count - left.count);
}

function getFilteredProducts() {
  const normalizedQuery = normalize(state.searchTerm);

  return state.products.filter((product) => {
    const matchesCategory = !state.selectedCategory || product.category === state.selectedCategory;
    const matchesSearch =
      !normalizedQuery ||
      normalize(
        `${product.title} ${product.description} ${product.seller_name} ${product.category} ${product.location}`
      ).includes(normalizedQuery);

    return matchesCategory && matchesSearch;
  });
}

function renderProducts() {
  const products = getFilteredProducts();
  elements.grid.innerHTML = "";

  if (!products.length) {
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;

  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "school-product-card";
    card.tabIndex = 0;
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `Abrir producto ${product.title}`);
    card.innerHTML = `
      <div class="school-product-card__media">
        <span class="school-product-card__badge">${escapeHtml(product.condition)}</span>
        <button
          class="school-product-card__favorite ${state.favoriteIds.has(product.id) ? "is-active" : ""}"
          type="button"
          aria-label="Guardar ${escapeHtml(product.title)} en favoritos"
          aria-pressed="${state.favoriteIds.has(product.id)}"
          data-favorite-id="${escapeHtml(product.id)}"
        >
          <svg class="icon"><use href="#icon-heart"></use></svg>
        </button>
        <img src="${escapeHtml(product.image_url || FALLBACK_PRODUCT_IMAGE)}" alt="${escapeHtml(product.title)}" />
      </div>
      <div class="school-product-card__body">
        <span class="school-product-card__seller">${escapeHtml(product.seller_name || "Estudiante")}</span>
        <h3 class="school-product-card__title">${escapeHtml(product.title)}</h3>
        <p class="school-product-card__price">${escapeHtml(formatPrice(product.price))}</p>
        <span class="school-product-card__location">${escapeHtml(product.location)}</span>
      </div>
    `;

    const image = card.querySelector("img");
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };

    const favoriteButton = card.querySelector("[data-favorite-id]");
    favoriteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await toggleFavoriteState(product.id, favoriteButton);
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

async function toggleFavoriteState(productId, button) {
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

function renderPublishers() {
  const publishers = getUniquePublishers();
  elements.publishersList.innerHTML = "";

  if (!publishers.length) {
    elements.publishersList.innerHTML = `
      <div class="school-empty-state">
        Este colegio todavía no tiene estudiantes publicando.
      </div>
    `;
    return;
  }

  publishers.slice(0, 6).forEach((publisher) => {
    const card = document.createElement("article");
    card.className = "publisher-card";
    card.innerHTML = `
      <div class="publisher-card__avatar">${escapeHtml(getInitials(publisher.name))}</div>
      <div class="publisher-card__copy">
        <h3>${escapeHtml(publisher.name)}</h3>
        <p>${escapeHtml(publisher.zone_code)}</p>
        <p>${escapeHtml(String(publisher.count))} publicaciones activas en esta comunidad</p>
        <a class="publisher-card__link" href="perfil-publico.html?id=${encodeURIComponent(publisher.user_id)}">
          <span>Ver perfil</span>
          <svg class="icon"><use href="#icon-chevron"></use></svg>
        </a>
      </div>
    `;

    elements.publishersList.appendChild(card);
  });
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
