(function () {

const INSTITUTION_PORTAL = window.ColegioLibreInstitution || {
  enabled: false,
  schoolCode: "",
  schoolName: "",
  schoolMatch: ""
};

function createLocalApiFallback() {
  const localFallbackImage = "images/materiales.webp";
  const statusLabels = {
    available: "Disponible",
    paused: "Pausado",
    reserved: "Reservado",
    sold: "Vendido"
  };

  function localNormalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function localEscapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function localFormatPrice(price) {
    const locale =
      window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
    return `$${Number(price || 0).toLocaleString(locale)}`;
  }

  function localGetStatusLabel(status) {
    return statusLabels[status] || statusLabels.available;
  }

  function localGetZoneLabel(source) {
    return (source && (source.zone_code || source.zone || source.location)) || "Zona no especificada";
  }

  function localSafeProductRecord(product) {
    return {
      category: (product && product.category) || "Otros",
      condition: (product && product.condition) || "Usado",
      created_at: (product && product.created_at) || null,
      description: (product && product.description) || "",
      id: (product && product.id) || "",
      image_url: (product && product.image_url) || localFallbackImage,
      location: (product && product.location) || "Sin ubicacion",
      price: Number((product && product.price) || 0),
      school_code: (product && product.school_code) || null,
      school_level: (product && product.school_level) || null,
      school_name: (product && (product.school_name || product.school)) || "Colegio no especificado",
      school_year:
        product && product.school_year !== null && product.school_year !== undefined
          ? Number(product.school_year)
          : null,
      seller_name: (product && product.seller_name) || "Usuario ColegioLibre",
      size: (product && product.size) || null,
      status: (product && product.status) || "available",
      subject: (product && product.subject) || null,
      subcategory: (product && product.subcategory) || null,
      title: (product && product.title) || "Producto sin titulo",
      updated_at: (product && (product.updated_at || product.created_at)) || null,
      user_id: (product && product.user_id) || null,
      views: Number((product && product.views) || 0),
      zone_code: localGetZoneLabel(product)
    };
  }

  function readLocalFavorites() {
    try {
      return JSON.parse(window.localStorage.getItem("colegiolibre-local-favorites") || "[]");
    } catch (_error) {
      return [];
    }
  }

  function writeLocalFavorites(ids) {
    window.localStorage.setItem("colegiolibre-local-favorites", JSON.stringify(ids));
  }

  return {
    FALLBACK_PRODUCT_IMAGE: localFallbackImage,
    escapeHtml: localEscapeHtml,
    fetchFavoriteIds: async (productIds = null) => {
      const ids = readLocalFavorites();
      const filteredIds =
        Array.isArray(productIds) && productIds.length ? ids.filter((id) => productIds.includes(id)) : ids;
      return new Set(filteredIds);
    },
    formatPrice: localFormatPrice,
    getCurrentProfile: async () => null,
    getCurrentUser: async () => null,
    getStatusLabel: localGetStatusLabel,
    getZoneLabel: localGetZoneLabel,
    normalizeText: localNormalizeText,
    safeProductRecord: localSafeProductRecord,
    toggleFavorite: async (productId) => {
      const favorites = new Set(readLocalFavorites());

      if (favorites.has(productId)) {
        favorites.delete(productId);
        writeLocalFavorites(Array.from(favorites));
        return { active: false };
      }

      favorites.add(productId);
      writeLocalFavorites(Array.from(favorites));
      return { active: true };
    }
  };
}

function getStaticProducts() {
  if (typeof window.getColegioLibreStaticProducts === "function") {
    return window.getColegioLibreStaticProducts();
  }

  return Array.isArray(window.colegioLibreStaticProducts) ? window.colegioLibreStaticProducts.map((item) => ({ ...item })) : [];
}

const colegioLibreApi = Object.assign(createLocalApiFallback(), window.colegioLibreApi || {});

const {
  FALLBACK_PRODUCT_IMAGE,
  escapeHtml,
  fetchFavoriteIds,
  formatPrice,
  getCurrentProfile,
  getCurrentUser,
  getStatusLabel,
  getZoneLabel,
  normalizeText,
  safeProductRecord,
  toggleFavorite
} = colegioLibreApi;

const HOME_RECOMMENDED_LIMIT = 5;
const HOME_FILTERED_LIMIT = 10;
const CATEGORY_SHELF_LIMIT = 5;
const CATEGORY_SHELF_MAX = 4;
const HOME_QUERY_LIMIT = 150;
const conditionOptions = ["Nuevo", "Como nuevo", "Usado", "Muy usado"];
const categoryOptions = ["Libros", "Apuntes", "Cuadernos", "Útiles", "Mochilas", "Tecnología", "Uniformes", "Otros"];
const schoolYearOptions = [1, 2, 3, 4, 5, 6, 7];
const subjectOptions = [
  "Matemática",
  "Lengua y Literatura",
  "Inglés",
  "Historia",
  "Geografía",
  "Biología",
  "Física",
  "Química",
  "Economía",
  "Francés",
  "Otra"
];

const categoryFilterConfig = {
  Libros: {
    academic: true,
    subject: true
  },
  Apuntes: {
    academic: true,
    subject: true
  },
  Cuadernos: {
    optionLabel: "Tipo de cuaderno",
    options: ["Rayado", "Cuadriculado", "Liso", "Carpeta", "Repuesto de hojas", "Otro"]
  },
  "Útiles": {
    optionLabel: "Tipo de útil",
    options: ["Escritura", "Geometría", "Arte", "Organización", "Cartuchera", "Otro"]
  },
  Mochilas: {
    sizeLabel: "Tamaño",
    sizes: ["Chica", "Mediana", "Grande"]
  },
  "Tecnología": {
    optionLabel: "Tipo de tecnología",
    options: ["Calculadora", "Tablet", "Notebook", "Accesorio", "Otro"]
  },
  Uniformes: {
    optionLabel: "Prenda",
    options: ["Remera", "Chomba", "Buzo", "Campera", "Pantalón", "Pollera", "Short", "Calzado", "Otro"],
    sizeLabel: "Talle",
    sizes: ["4", "6", "8", "10", "12", "14", "16", "XS", "S", "M", "L", "XL", "XXL", "Otro"]
  },
  Otros: {
    optionLabel: "Tipo de producto",
    options: ["Material deportivo", "Instrumento", "Accesorio escolar", "Otro"]
  }
};

const categoryShelfDetails = {
  Libros: {
    icon: "book",
    description: "Manuales, novelas, diccionarios y libros para todas las materias."
  },
  Apuntes: {
    icon: "notebook",
    description: "Resúmenes, guías, modelos de examen y material de estudio por materia."
  },
  Cuadernos: {
    icon: "notebook",
    description: "Cuadernos nuevos o con pocas hojas usadas, carpetas y repuestos."
  },
  "Útiles": {
    icon: "pencil",
    description: "Cartucheras, reglas, compases, calculadoras y materiales de clase."
  },
  Mochilas: {
    icon: "backpack",
    description: "Mochilas, bolsos y accesorios escolares listos para seguir usándose."
  },
  "Tecnología": {
    icon: "laptop",
    description: "Calculadoras, tablets, accesorios y tecnología para estudiar."
  },
  Uniformes: {
    icon: "users",
    description: "Remeras, buzos, pantalones y prendas escolares filtradas por talle."
  },
  Otros: {
    icon: "tag",
    description: "Todo lo demás que puede servirle a otro estudiante."
  }
};

const trustFeatures = [
  {
    description: "Moderación, reportes y chat seguro",
    icon: "shield",
    title: "Seguridad"
  },
  {
    description: "Dale una segunda vida",
    icon: "leaf",
    title: "Sustentable"
  },
  {
    description: "Mejores precios",
    icon: "tag",
    title: "Económico"
  },
  {
    description: "Hecho por estudiantes",
    icon: "users",
    title: "Comunidad"
  }
];

const popularCategories = [
  { icon: "book", label: "Libros" },
  { icon: "notebook", label: "Apuntes" },
  { icon: "notebook", label: "Cuadernos" },
  { icon: "pencil", label: "Útiles" },
  { icon: "backpack", label: "Mochilas" },
  { icon: "laptop", label: "Tecnología" },
  { icon: "users", label: "Uniformes" },
  { icon: "tag", label: "Otros" }
];

const recentSearches = ["calculadora científica", "libro de física", "mochila usada"];

const trendingProducts = [
  "Apuntes de Historia",
  "Cartuchera completa",
  "Libro de Matemática 3"
];

const marketplaceSteps = [
  {
    description: "Filtrá por estado, categoría, precio y colegio para encontrar exactamente lo que necesitás.",
    title: "Buscá por materia o categoría"
  },
  {
    description: "Chateá con estudiantes de tu comunidad, coordiná entrega y resolvé dudas rápido.",
    title: "Conectate con estudiantes reales"
  },
  {
    description: "Publicá gratis, ahorrá plata y mové materiales dentro de tu red escolar.",
    title: "Comprá, vendé o intercambiá"
  }
];

const state = {
  activeCategory: null,
  activeCondition: null,
  activeLevel: null,
  activeSize: null,
  activeScope: "country",
  activeSubject: null,
  activeSubcategory: null,
  activeYear: null,
  favorites: new Set(),
  loadError: null,
  loading: true,
  products: [],
  profile: null,
  randomOrder: new Map(),
  requestedScope: null,
  searchTerm: "",
  showOnlyFavorites: false,
  sortBy: "random",
  user: null
};

const elements = {
  accountButton: document.getElementById("accountButton"),
  accountText: document.getElementById("accountText"),
  categoryDrawer: document.getElementById("category-drawer"),
  categoryLinks: document.querySelectorAll("[data-category-link]"),
  categoryMarketplace: document.getElementById("category-marketplace"),
  categoryOverlay: document.getElementById("category-overlay"),
  categoryPills: document.getElementById("category-pills"),
  categorySpecificFilters: document.getElementById("category-specific-filters"),
  categoryShelves: document.getElementById("category-shelves"),
  clearFilters: document.getElementById("clear-filters"),
  closeCategories: document.getElementById("close-categories"),
  closeMenuLinks: document.querySelectorAll("[data-close-menu]"),
  conditionPills: document.getElementById("condition-pills"),
  currentYear: document.getElementById("current-year"),
  desktopSearchForm: document.getElementById("search-form-desktop"),
  desktopSearchInput: document.getElementById("desktop-search"),
  emptyState: document.getElementById("empty-state"),
  filterSummary: document.getElementById("filter-summary"),
  headerFavoritesLink: document.getElementById("header-favorites-link"),
  headerLogoutButton: document.getElementById("header-logout-button"),
  headerMessagesLink: document.getElementById("header-messages-link"),
  headerPublishLink: document.getElementById("header-publish-link"),
  logoImages: document.querySelectorAll("[data-logo]"),
  menuToggle: document.getElementById("menu-toggle"),
  mobileAccountLink: document.getElementById("mobile-account-link"),
  mobileFavoritesLink: document.getElementById("mobile-favorites-link"),
  mobileMenu: document.getElementById("mobile-menu"),
  mobileMessagesLink: document.getElementById("mobile-messages-link"),
  mobileLogoutButton: document.getElementById("mobile-logout-button"),
  mobilePublishLink: document.getElementById("mobile-publish-link"),
  mobileSearchForm: document.getElementById("search-form-mobile"),
  mobileSearchInput: document.getElementById("mobile-search"),
  openCategories: document.getElementById("open-categories"),
  popularCategories: document.getElementById("popular-categories"),
  productGrid: document.getElementById("product-grid"),
  productsKicker: document.getElementById("products-kicker"),
  productsTitle: document.getElementById("products-title"),
  recentSearches: document.getElementById("recent-searches"),
  scopeButtons: Array.from(document.querySelectorAll(".scope-btn")),
  scopeSummaryLabel: document.getElementById("scope-summary-label"),
  sortSelect: document.getElementById("sort-select"),
  schoolLevelFilter: document.getElementById("school-level-filter"),
  levelFilterGroup: document.getElementById("level-filter-group"),
  sizeFilterGroup: document.getElementById("size-filter-group"),
  sizeFilterLabel: document.getElementById("size-filter-label"),
  sizePills: document.getElementById("size-pills"),
  stepsGrid: document.getElementById("steps-grid"),
  subjectFilter: document.getElementById("subject-filter"),
  subjectFilterGroup: document.getElementById("subject-filter-group"),
  subcategoryFilter: document.getElementById("subcategory-filter"),
  subcategoryFilterGroup: document.getElementById("subcategory-filter-group"),
  subcategoryFilterLabel: document.getElementById("subcategory-filter-label"),
  trendingProducts: document.getElementById("trending-products"),
  trustGrid: document.getElementById("trust-grid"),
  yearFilterGroup: document.getElementById("year-filter-group"),
  yearPills: document.getElementById("year-pills")
};

const toast = createToast();

init();

function normalizeProductRecord(product) {
  const normalized = safeProductRecord(product);
  const rawYear =
    product && product.school_year !== null && product.school_year !== undefined
      ? Number(product.school_year)
      : null;

  return {
    ...normalized,
    school_level:
      (product && product.school_level) ||
      normalized.school_level ||
      null,
    school_year:
      Number.isInteger(rawYear) && schoolYearOptions.includes(rawYear)
        ? rawYear
        : null,
    size: (product && product.size) || normalized.size || null,
    subject: (product && product.subject) || normalized.subject || null,
    subcategory: (product && product.subcategory) || normalized.subcategory || null
  };
}

async function init() {
  hydrateLogos();
  renderTrustFeatures();
  renderSidebar();
  renderSteps();
  renderCategoryPills();
  renderConditionPills();
  renderYearPills();
  renderSkeletons();
  bindEvents();
  setupReveal();
  hydrateUrlState();

  if (state.showOnlyFavorites) {
    window.location.replace("favoritos.html");
    return;
  }

  let onboardingResult = null;
  if (typeof initOnboarding === "function") {
    const onboardingDestination = state.showOnlyFavorites
      ? "favoritos.html"
      : state.requestedScope === "school"
        ? "colegio.html"
        : "";

    onboardingResult = await initOnboarding({
      next: onboardingDestination
    });
  }

  state.user = onboardingResult?.user || await getCurrentUser();
  state.profile =
    onboardingResult?.profile ||
    (state.user ? await getCurrentProfile(true) : null);

  if (state.showOnlyFavorites && !state.user) {
    window.location.replace(buildLoginUrl("favoritos.html"));
    return;
  }

  if (state.requestedScope === "school" && state.profile?.school_code) {
    window.location.replace(buildSchoolCommunityUrl(state.profile));
    return;
  }

  const canUseRequestedScope =
    state.requestedScope === "country" ||
    (state.requestedScope === "zone" && state.profile?.zone_code);
  state.activeScope = INSTITUTION_PORTAL.enabled
    ? "school"
    : canUseRequestedScope
      ? state.requestedScope
      : "country";

  await loadProducts();
  await refreshFavorites();
  await refreshAccountButton();

  if (elements.currentYear) {
    elements.currentYear.textContent = String(new Date().getFullYear());
  }
}

function hydrateUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.searchTerm = (params.get("search") || "").trim();
  state.showOnlyFavorites = params.get("favorites") === "1";
  state.activeCategory = params.get("category") || null;
  state.activeCondition = conditionOptions.includes(params.get("condition"))
    ? params.get("condition")
    : null;
  state.activeLevel = params.get("level") || null;
  state.activeSize = params.get("size") || null;
  state.activeSubject = params.get("subject") || null;
  state.activeSubcategory = params.get("type") || null;
  state.requestedScope = ["school", "zone", "country"].includes(params.get("scope"))
    ? params.get("scope")
    : null;
  state.sortBy = ["random", "recent", "price-asc", "price-desc"].includes(params.get("sort"))
    ? params.get("sort")
    : "random";

  const requestedYear = Number(params.get("year"));
  state.activeYear = schoolYearOptions.includes(requestedYear) ? requestedYear : null;
  clearIncompatibleCategoryFilters();

  if (elements.schoolLevelFilter) {
    elements.schoolLevelFilter.value = state.activeLevel || "";
  }

  if (elements.sortSelect) {
    elements.sortSelect.value = state.sortBy;
  }

  syncSearchInputs(state.searchTerm);
}

function createToast() {
  const element = document.createElement("div");
  element.className = "home-toast";
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
  }, 2200);
}

function hydrateLogos() {
  elements.logoImages.forEach((image) => {
    image.src = "images/logo-horizontal.webp";
    image.alt = "ColegioLibre";
  });
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function renderTrustFeatures() {
  if (!elements.trustGrid) return;

  elements.trustGrid.innerHTML = trustFeatures
    .map(
      (feature) => `
        <article class="trust-card reveal">
          <span class="trust-icon">${icon(feature.icon)}</span>
          <h3>${feature.title}</h3>
          <p>${feature.description}</p>
        </article>
      `
    )
    .join("");
}

function renderSidebar() {
  if (elements.popularCategories) {
    elements.popularCategories.innerHTML = `
      <div class="sidebar-list">
        ${popularCategories
          .map(
            (category) => `
              <button class="sidebar-link" type="button" data-category-button="${category.label}">
                <span class="sidebar-link-main">
                  <span class="sidebar-link-icon">${icon(category.icon)}</span>
                  <span>${category.label}</span>
                </span>
                ${icon("chevron")}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  if (elements.recentSearches) {
    elements.recentSearches.innerHTML = recentSearches
      .map(
        (term) => `
          <button class="tag-button" type="button" data-search-chip="${escapeHtml(term)}">
            “${escapeHtml(term)}”
          </button>
        `
      )
      .join("");
  }

  if (elements.trendingProducts) {
    elements.trendingProducts.innerHTML = `
      <div class="trend-list">
        ${trendingProducts
          .map(
            (product, index) => `
              <button class="trend-link" type="button" data-search-chip="${escapeHtml(product)}">
                <span class="trend-label">
                  <span class="trend-index">0${index + 1}</span>
                  <span>${escapeHtml(product)}</span>
                </span>
                ${icon("chevron")}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }
}

function renderSteps() {
  if (!elements.stepsGrid) return;

  elements.stepsGrid.innerHTML = marketplaceSteps
    .map(
      (step, index) => `
        <article class="step-card reveal">
          <span class="step-index">0${index + 1}</span>
          <h3>${step.title}</h3>
          <p>${step.description}</p>
        </article>
      `
    )
    .join("");

  window.colegioLibrePreferences?.refresh?.(elements.stepsGrid);
}

function renderConditionPills() {
  if (!elements.conditionPills) return;

  elements.conditionPills.innerHTML = conditionOptions
    .map((condition) => {
      const isActive = state.activeCondition === condition;
      return `
        <button
          class="condition-pill${isActive ? " is-active" : ""}"
          type="button"
          data-condition="${condition}"
          aria-pressed="${String(isActive)}"
        >
          ${condition}
        </button>
      `;
    })
    .join("");
}

function renderCategoryPills() {
  if (!elements.categoryPills) return;

  const options = [
    { label: "Recomendados", value: "" },
    ...categoryOptions.map((category) => ({
      label: category,
      value: category
    }))
  ];

  elements.categoryPills.innerHTML = options
    .map((option) => {
      const isActive = option.value
        ? state.activeCategory === option.value
        : state.activeCategory === null;

      return `
        <button
          class="category-pill${isActive ? " is-active" : ""}"
          type="button"
          data-category-filter="${escapeHtml(option.value)}"
          aria-pressed="${String(isActive)}"
        >
          ${escapeHtml(option.label)}
        </button>
      `;
    })
    .join("");
}

function renderYearPills() {
  if (!elements.yearPills) return;

  const options = [
    { label: "Todos", value: "" },
    ...schoolYearOptions.map((year) => ({
      label: `${year}.º`,
      value: String(year)
    }))
  ];

  elements.yearPills.innerHTML = options
    .map((option) => {
      const isActive = option.value
        ? state.activeYear === Number(option.value)
        : state.activeYear === null;

      return `
        <button
          class="year-pill${isActive ? " is-active" : ""}"
          type="button"
          data-school-year="${option.value}"
          aria-pressed="${String(isActive)}"
        >
          ${option.label}
        </button>
      `;
    })
    .join("");
}

function renderCategorySpecificFilters() {
  if (!elements.categorySpecificFilters) return;

  const config = categoryFilterConfig[state.activeCategory] || null;
  const hasSpecificFilters = Boolean(state.activeCategory && config);

  elements.categorySpecificFilters.hidden = !hasSpecificFilters;

  [
    elements.levelFilterGroup,
    elements.yearFilterGroup,
    elements.subjectFilterGroup,
    elements.subcategoryFilterGroup,
    elements.sizeFilterGroup
  ].forEach((group) => {
    if (group) group.hidden = true;
  });

  if (!hasSpecificFilters) return;

  if (config.academic) {
    elements.levelFilterGroup.hidden = false;
    elements.yearFilterGroup.hidden = false;
    elements.schoolLevelFilter.value = state.activeLevel || "";
  }

  if (config.subject) {
    elements.subjectFilterGroup.hidden = false;
    elements.subjectFilter.innerHTML = [
      '<option value="">Todas</option>',
      ...subjectOptions.map(
        (subject) =>
          `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`
      )
    ].join("");
    elements.subjectFilter.value = state.activeSubject || "";
  }

  if (Array.isArray(config.options) && config.options.length) {
    elements.subcategoryFilterGroup.hidden = false;
    elements.subcategoryFilterLabel.textContent = `${config.optionLabel}:`;
    elements.subcategoryFilter.innerHTML = [
      '<option value="">Todos</option>',
      ...config.options.map(
        (option) =>
          `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
      )
    ].join("");
    elements.subcategoryFilter.value = state.activeSubcategory || "";
  }

  if (Array.isArray(config.sizes) && config.sizes.length) {
    elements.sizeFilterGroup.hidden = false;
    elements.sizeFilterLabel.textContent = `${config.sizeLabel}:`;
    elements.sizePills.innerHTML = [
      { label: "Todos", value: "" },
      ...config.sizes.map((size) => ({ label: size, value: size }))
    ]
      .map(({ label, value }) => {
        const isActive = value
          ? state.activeSize === value
          : state.activeSize === null;

        return `
          <button
            class="year-pill${isActive ? " is-active" : ""}"
            type="button"
            data-product-size="${escapeHtml(value)}"
            aria-pressed="${String(isActive)}"
          >
            ${escapeHtml(label)}
          </button>
        `;
      })
      .join("");
  }
}

function renderSkeletons() {
  if (!elements.productGrid) return;

  elements.productGrid.innerHTML = Array.from({ length: HOME_RECOMMENDED_LIMIT }, skeletonCard).join("");
  if (elements.filterSummary) {
    elements.filterSummary.textContent = "Cargando publicaciones reales...";
  }
}

function skeletonCard() {
  return `
    <article class="product-skeleton" aria-hidden="true">
      <div class="skeleton-block skeleton-media"></div>
      <div class="skeleton-pill"></div>
      <div class="skeleton-body">
        <div class="skeleton-block skeleton-title"></div>
        <div class="skeleton-block skeleton-title"></div>
        <div class="skeleton-block skeleton-price"></div>
        <div class="skeleton-block skeleton-location"></div>
      </div>
    </article>
  `;
}

function bindEvents() {
  if (elements.desktopSearchForm) {
    elements.desktopSearchForm.addEventListener("submit", handleSearchSubmit);
  }

  if (elements.mobileSearchForm) {
    elements.mobileSearchForm.addEventListener("submit", handleSearchSubmit);
  }

  [elements.desktopSearchInput, elements.mobileSearchInput].forEach((input) => {
    if (!input) return;

    input.addEventListener("input", (event) => {
      const nextValue = event.currentTarget.value;
      syncSearchInputs(nextValue);
      state.searchTerm = nextValue;
      syncFavoritesUrl();
      renderHome();
    });
  });

  if (elements.conditionPills) {
    elements.conditionPills.addEventListener("click", (event) => {
      const button = event.target.closest("[data-condition]");
      if (!button) return;

      const nextCondition = button.getAttribute("data-condition");
      state.activeCondition = state.activeCondition === nextCondition ? null : nextCondition;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.categoryPills) {
    elements.categoryPills.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category-filter]");
      if (!button) return;

      const category = button.getAttribute("data-category-filter");
      const nextCategory = category || null;

      if (nextCategory !== state.activeCategory) {
        clearCategorySpecificFilters();
      }

      state.activeCategory = nextCategory;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.schoolLevelFilter) {
    elements.schoolLevelFilter.addEventListener("change", (event) => {
      state.activeLevel = event.currentTarget.value || null;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.yearPills) {
    elements.yearPills.addEventListener("click", (event) => {
      const button = event.target.closest("[data-school-year]");
      if (!button) return;

      const rawYear = button.getAttribute("data-school-year");
      state.activeYear = rawYear ? Number(rawYear) : null;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.subjectFilter) {
    elements.subjectFilter.addEventListener("change", (event) => {
      state.activeSubject = event.currentTarget.value || null;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.subcategoryFilter) {
    elements.subcategoryFilter.addEventListener("change", (event) => {
      state.activeSubcategory = event.currentTarget.value || null;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.sizePills) {
    elements.sizePills.addEventListener("click", (event) => {
      const button = event.target.closest("[data-product-size]");
      if (!button) return;

      state.activeSize = button.getAttribute("data-product-size") || null;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.sortSelect) {
    elements.sortSelect.addEventListener("change", (event) => {
      state.sortBy = event.currentTarget.value;
      syncFavoritesUrl();
      renderHome();
    });
  }

  if (elements.clearFilters) {
    elements.clearFilters.addEventListener("click", () => {
      if (state.loadError) {
        loadProducts();
        return;
      }
      clearFilters();
    });
  }

  if (elements.popularCategories) {
    elements.popularCategories.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category-button]");
      if (!button) return;
      applyCategory(button.getAttribute("data-category-button"));
    });
  }

  [elements.recentSearches, elements.trendingProducts].forEach((container) => {
    if (!container) return;

    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-search-chip]");
      if (!button) return;
      const term = button.getAttribute("data-search-chip");
      state.searchTerm = term;
      syncSearchInputs(term);
      syncFavoritesUrl();
      renderHome();
      scrollToProducts();
    });
  });

  if (elements.productGrid) {
    elements.productGrid.addEventListener("click", handleFavoriteClick);
  }

  if (elements.categoryShelves) {
    elements.categoryShelves.addEventListener("click", handleFavoriteClick);
  }

  if (elements.menuToggle) {
    elements.menuToggle.addEventListener("click", () => {
      const expanded = elements.menuToggle.getAttribute("aria-expanded") === "true";
      setMenuState(!expanded);
    });
  }

  elements.closeMenuLinks.forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });

  elements.categoryLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const category = link.getAttribute("data-category-link");
      applyCategory(category);
      setMenuState(false);
    });
  });

  if (elements.openCategories) {
    elements.openCategories.addEventListener("click", openCategoryDrawer);
  }

  if (elements.closeCategories) {
    elements.closeCategories.addEventListener("click", closeCategoryDrawer);
  }

  if (elements.categoryOverlay) {
    elements.categoryOverlay.addEventListener("click", closeCategoryDrawer);
  }

  elements.scopeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const nextScope = button.dataset.scope || "country";

      if (nextScope === "school") {
        const access = await ensureAccountReady("colegio.html");
        if (!access) return;

        window.location.assign(buildSchoolCommunityUrl(access.profile));
        return;
      }

      if (nextScope === "zone") {
        const access = await ensureAccountReady(
          `index.html?scope=${encodeURIComponent(nextScope)}`,
          { requireVerification: false }
        );
        if (!access) return;
      }

      state.activeScope = nextScope;
      syncFavoritesUrl();
      updateScopeButtons();
      renderHome();
    });
  });

  document.addEventListener("click", handleProtectedLinkClick);

  if (elements.mobileAccountLink) {
    elements.mobileAccountLink.addEventListener("click", handleAccountNavigation);
  }

  if (elements.accountButton) {
    elements.accountButton.addEventListener("click", handleAccountNavigation);
  }

  [elements.headerLogoutButton, elements.mobileLogoutButton].forEach((button) => {
    button?.addEventListener("click", handleLogout);
  });

  const authSubscription =
    window.colegioLibreSupabase?.auth?.onAuthStateChange?.(() => {
      window.setTimeout(() => refreshAccountButton(true), 0);
    });

  window.addEventListener(
    "pagehide",
    () => authSubscription?.data?.subscription?.unsubscribe?.(),
    { once: true }
  );

  window.addEventListener("resize", () => {
    if (window.innerWidth > 980) {
      setMenuState(false);
    }
  });
}

async function handleAccountNavigation(event) {
  if (event) {
    event.preventDefault();
  }

  const access = await ensureAccountReady("perfil.html");
  if (access) {
    window.location.assign("perfil.html");
  }
}

function getSafeLocalDestination(rawValue = "index.html") {
  const allowedPages = new Set([
    "index.html",
    "perfil.html",
    "publicar.html",
    "mensajes.html",
    "favoritos.html",
    "colegio.html"
  ]);

  try {
    const url = new URL(rawValue, window.location.href);
    if (window.location.origin !== "null" && url.origin !== window.location.origin) {
      return "index.html";
    }

    const page = url.pathname.split("/").filter(Boolean).pop() || "index.html";
    if (!allowedPages.has(page)) return "index.html";
    return `${page}${url.search}`;
  } catch (_error) {
    return "index.html";
  }
}

function buildLoginUrl(destination) {
  const safeDestination = getSafeLocalDestination(destination);
  return `login.html?next=${encodeURIComponent(safeDestination)}`;
}

function buildOnboardingUrl(destination) {
  const safeDestination = getSafeLocalDestination(destination);
  return `index.html?onboarding=1&next=${encodeURIComponent(safeDestination)}`;
}

async function ensureAccountReady(destination, options = {}) {
  const safeDestination = getSafeLocalDestination(destination);
  const page = safeDestination.split("?")[0];
  const requireActiveAccount =
    options.requireVerification ??
    ["colegio.html", "mensajes.html", "publicar.html"].includes(page);
  const user = await getCurrentUser(true);

  if (!user) {
    window.location.assign(buildLoginUrl(safeDestination));
    return null;
  }

  const profile = await getCurrentProfile(true);
  state.user = user;
  state.profile = profile;

  if (!profile?.school_code) {
    if (typeof initOnboarding === "function") {
      await initOnboarding({ force: true, next: safeDestination });
    } else {
      window.location.assign(buildOnboardingUrl(safeDestination));
    }
    return null;
  }

  if (
    requireActiveAccount &&
    window.colegioLibreApi.isAccountRestricted(profile)
  ) {
    showToast(
      profile.account_status === "banned"
        ? "Tu cuenta está bloqueada. Revisá el estado desde tu perfil."
        : "Tu cuenta está suspendida temporalmente."
    );
    window.setTimeout(() => {
      window.location.assign("perfil.html");
    }, 900);
    return null;
  }

  return { profile, user };
}

async function handleProtectedLinkClick(event) {
  const link = event.target.closest("[data-requires-auth]");
  if (!link) return;

  event.preventDefault();
  const destination = getSafeLocalDestination(link.getAttribute("href"));
  const access = await ensureAccountReady(destination);

  if (access) {
    window.location.assign(destination);
  }
}

function buildSchoolCommunityUrl(profile = state.profile) {
  const schoolCode = String(profile?.school_code || "").trim();
  return schoolCode
    ? `colegio.html?code=${encodeURIComponent(schoolCode)}`
    : "colegio.html";
}

async function handleLogout() {
  const buttons = [elements.headerLogoutButton, elements.mobileLogoutButton]
    .filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
  });

  const { error } = await window.colegioLibreSupabase.auth.signOut();

  if (error) {
    console.error("No se pudo cerrar la sesión:", error);
    buttons.forEach((button) => {
      button.disabled = false;
    });
    showToast("No se pudo cerrar la sesión.");
    return;
  }

  state.user = null;
  state.profile = null;
  state.favorites = new Set();
  showToast("Sesión cerrada.");
  window.setTimeout(() => window.location.assign("index.html"), 350);
}

function handleSearchSubmit(event) {
  event.preventDefault();
  const desktopValue = elements.desktopSearchInput ? elements.desktopSearchInput.value : "";
  const mobileValue = elements.mobileSearchInput ? elements.mobileSearchInput.value : "";
  state.searchTerm = (desktopValue || mobileValue || "").trim();
  syncSearchInputs(state.searchTerm);
  syncFavoritesUrl();
  renderHome();
  scrollToProducts();
}

function syncSearchInputs(value) {
  if (elements.desktopSearchInput && elements.desktopSearchInput.value !== value) {
    elements.desktopSearchInput.value = value;
  }

  if (elements.mobileSearchInput && elements.mobileSearchInput.value !== value) {
    elements.mobileSearchInput.value = value;
  }
}

function clearCategorySpecificFilters() {
  state.activeLevel = null;
  state.activeYear = null;
  state.activeSubject = null;
  state.activeSubcategory = null;
  state.activeSize = null;
}

function clearIncompatibleCategoryFilters() {
  const config = categoryFilterConfig[state.activeCategory] || null;
  let changed = false;

  if (!config?.academic && (state.activeLevel || state.activeYear)) {
    state.activeLevel = null;
    state.activeYear = null;
    changed = true;
  }

  if (!config?.subject && state.activeSubject) {
    state.activeSubject = null;
    changed = true;
  }

  if (!Array.isArray(config?.options) && state.activeSubcategory) {
    state.activeSubcategory = null;
    changed = true;
  }

  if (!Array.isArray(config?.sizes) && state.activeSize) {
    state.activeSize = null;
    changed = true;
  }

  return changed;
}

function clearFilters() {
  state.activeCategory = null;
  state.activeCondition = null;
  clearCategorySpecificFilters();
  state.searchTerm = "";
  state.showOnlyFavorites = false;
  state.sortBy = "random";

  if (elements.sortSelect) {
    elements.sortSelect.value = "random";
  }

  if (elements.schoolLevelFilter) {
    elements.schoolLevelFilter.value = "";
  }

  syncSearchInputs("");
  syncFavoritesUrl();
  renderHome();
}

function applyCategory(category) {
  const nextCategory = state.activeCategory === category ? null : category;

  if (nextCategory !== state.activeCategory) {
    clearCategorySpecificFilters();
  }

  state.activeCategory = nextCategory;
  syncFavoritesUrl();
  renderHome();
  scrollToProducts();
  closeCategoryDrawer();
}

function openCategoryDrawer() {
  if (elements.categoryDrawer) {
    elements.categoryDrawer.classList.add("is-open");
    elements.categoryDrawer.setAttribute("aria-hidden", "false");
    elements.categoryDrawer.inert = false;
  }

  if (elements.categoryOverlay) {
    elements.categoryOverlay.classList.add("is-open");
  }

  document.body.style.overflow = "hidden";
}

function enableFavoritesView() {
  state.showOnlyFavorites = true;
  syncFavoritesUrl();
  renderHome();
  scrollToProducts();
}

function syncFavoritesUrl() {
  const url = new URL(window.location.href);

  if (state.showOnlyFavorites) {
    url.searchParams.set("favorites", "1");
  } else {
    url.searchParams.delete("favorites");
  }

  if (state.searchTerm.trim()) {
    url.searchParams.set("search", state.searchTerm.trim());
  } else {
    url.searchParams.delete("search");
  }

  if (state.activeCategory) {
    url.searchParams.set("category", state.activeCategory);
  } else {
    url.searchParams.delete("category");
  }

  if (state.activeCondition) {
    url.searchParams.set("condition", state.activeCondition);
  } else {
    url.searchParams.delete("condition");
  }

  if (state.activeLevel) {
    url.searchParams.set("level", state.activeLevel);
  } else {
    url.searchParams.delete("level");
  }

  if (state.activeYear) {
    url.searchParams.set("year", String(state.activeYear));
  } else {
    url.searchParams.delete("year");
  }

  if (state.activeSubject) {
    url.searchParams.set("subject", state.activeSubject);
  } else {
    url.searchParams.delete("subject");
  }

  if (state.activeSubcategory) {
    url.searchParams.set("type", state.activeSubcategory);
  } else {
    url.searchParams.delete("type");
  }

  if (state.activeSize) {
    url.searchParams.set("size", state.activeSize);
  } else {
    url.searchParams.delete("size");
  }

  if (state.activeScope) {
    url.searchParams.set("scope", state.activeScope);
  } else {
    url.searchParams.delete("scope");
  }

  if (state.sortBy && state.sortBy !== "random") {
    url.searchParams.set("sort", state.sortBy);
  } else {
    url.searchParams.delete("sort");
  }

  history.replaceState(null, "", url.pathname + url.search + url.hash);
}

function closeCategoryDrawer() {
  if (elements.categoryDrawer) {
    elements.categoryDrawer.classList.remove("is-open");
    elements.categoryDrawer.setAttribute("aria-hidden", "true");
    elements.categoryDrawer.inert = true;
  }

  if (elements.categoryOverlay) {
    elements.categoryOverlay.classList.remove("is-open");
  }

  document.body.style.overflow = "";
}

function setMenuState(isOpen) {
  if (elements.menuToggle) {
    elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
  }

  if (elements.mobileMenu) {
    elements.mobileMenu.hidden = !isOpen;
  }

  document.body.classList.toggle("menu-open", isOpen);
}

function scrollToProducts() {
  const productsSection = document.getElementById("productos");

  if (productsSection) {
    productsSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function setupReveal() {
  document.body.classList.add("js-ready");

  if (typeof IntersectionObserver !== "function") {
    document.querySelectorAll(".reveal").forEach((element) => {
      element.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

async function refreshAccountButton(force = false) {
  if (!elements.accountText) return;

  const user = await getCurrentUser(force);
  const profile = user ? await getCurrentProfile(force) : null;
  const firstName = String(profile?.name || "")
    .trim()
    .split(/\s+/)[0];
  const accountLabel = user ? firstName || "Mi perfil" : "Iniciar sesión";

  state.user = user;
  state.profile = profile;
  elements.accountText.textContent = accountLabel;

  if (elements.accountButton) {
    elements.accountButton.setAttribute("href", user ? "perfil.html" : "login.html");
    elements.accountButton.setAttribute(
      "aria-label",
      user ? `Abrir el perfil de ${accountLabel}` : "Iniciar sesión"
    );
  }

  if (elements.mobileAccountLink) {
    elements.mobileAccountLink.setAttribute("href", user ? "perfil.html" : "login.html");
    const mobileText = elements.mobileAccountLink.querySelector("span");
    if (mobileText) {
      mobileText.textContent = user ? accountLabel : "Iniciar sesión";
    }
  }

  if (elements.headerLogoutButton) {
    elements.headerLogoutButton.hidden = !user;
    elements.headerLogoutButton.disabled = false;
  }

  if (elements.mobileLogoutButton) {
    elements.mobileLogoutButton.hidden = !user;
    elements.mobileLogoutButton.disabled = false;
  }
}

async function loadProducts() {
  const isDemoEnvironment =
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("demo") === "1";
  const staticProducts = (isDemoEnvironment ? getStaticProducts() : [])
    .map(normalizeProductRecord)
    .filter((product) => product.user_id && product.status === "available");

  state.loadError = null;
  if (staticProducts.length) {
    state.products = staticProducts;
    refreshRandomOrder();
    state.loading = false;
    renderHome();
  } else {
    state.loading = true;
    renderSkeletons();
  }

  let data = [];
  let error = null;

  try {
    if (window.colegioLibreSupabase && typeof window.colegioLibreSupabase.from === "function") {
      const response = await window.colegioLibreSupabase
        .from("products")
        .select("*")
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(HOME_QUERY_LIMIT);

      data = response.data || [];
      error = response.error || null;
    } else {
      error = new Error("Cliente de datos no disponible.");
    }
  } catch (queryError) {
    error = queryError;
  }

  let sourceProducts = Array.isArray(data) ? data : [];

  if (error) {
    console.warn("No se pudieron cargar los productos reales:", error);
    state.loadError = "No pudimos conectarnos con las publicaciones.";
    sourceProducts = staticProducts;
  }

  state.products = sourceProducts
    .map(normalizeProductRecord)
    .filter((product) => product.user_id && product.status === "available");

  refreshRandomOrder();
  state.loading = false;
  renderHome();
}

function refreshRandomOrder() {
  const ids = state.products.map((product) => String(product.id || ""));

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  state.randomOrder = new Map(ids.map((id, index) => [id, index]));
}

async function refreshFavorites() {
  const ids = state.products.map((product) => product.id).filter(Boolean);
  state.favorites = await fetchFavoriteIds(ids);
  renderHome();
}

function matchesActiveScope(product) {
  if (INSTITUTION_PORTAL.enabled) {
    const productCode = String(product.school_code || "").trim().toUpperCase();
    if (INSTITUTION_PORTAL.schoolCode && productCode) {
      return productCode === INSTITUTION_PORTAL.schoolCode;
    }
    return normalizeText(product.school_name || product.school)
      .includes(normalizeText(INSTITUTION_PORTAL.schoolMatch));
  }

  if (state.activeScope === "school") {
    return (
      Boolean(state.profile && state.profile.school_code) &&
      product.school_code === state.profile.school_code
    );
  }

  if (state.activeScope === "zone") {
    return (
      Boolean(state.profile && state.profile.zone_code) &&
      normalizeText(product.zone_code) === normalizeText(state.profile.zone_code)
    );
  }

  return true;
}

function getScopedProducts() {
  const query = normalizeText(state.searchTerm);

  return state.products.filter((product) => {
    const matchesCondition = !state.activeCondition || product.condition === state.activeCondition;
    const matchesCategory =
      !state.activeCategory ||
      normalizeText(product.category) === normalizeText(state.activeCategory);
    const matchesLevel = !state.activeLevel || product.school_level === state.activeLevel;
    const matchesYear = !state.activeYear || Number(product.school_year) === state.activeYear;
    const matchesSubject =
      !state.activeSubject ||
      normalizeText(product.subject) === normalizeText(state.activeSubject);
    const matchesSubcategory =
      !state.activeSubcategory ||
      normalizeText(product.subcategory) === normalizeText(state.activeSubcategory);
    const matchesSize =
      !state.activeSize ||
      normalizeText(product.size) === normalizeText(state.activeSize);
    const matchesFavorite = !state.showOnlyFavorites || state.favorites.has(product.id);

    const matchesScope = matchesActiveScope(product);

    const haystack = normalizeText(
      [
        product.title,
        product.description,
        product.location,
        product.condition,
        product.category,
        product.school_name,
        product.school_level,
        product.school_year,
        product.size,
        product.subject,
        product.subcategory,
        product.zone_code,
        product.seller_name
      ].join(" ")
    );

    const matchesQuery = !query || haystack.includes(query);

    return (
      matchesCondition &&
      matchesCategory &&
      matchesLevel &&
      matchesYear &&
      matchesSubject &&
      matchesSubcategory &&
      matchesSize &&
      matchesFavorite &&
      matchesScope &&
      matchesQuery
    );
  });
}

function sortProducts(products) {
  const items = [...products];

  if (state.sortBy === "random") {
    return items.sort((a, b) => {
      const rankA = state.randomOrder.get(String(a.id || "")) ?? Number.MAX_SAFE_INTEGER;
      const rankB = state.randomOrder.get(String(b.id || "")) ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB;
    });
  }

  if (state.sortBy === "price-asc") {
    return items.sort((a, b) => a.price - b.price);
  }

  if (state.sortBy === "price-desc") {
    return items.sort((a, b) => b.price - a.price);
  }

  return items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function hasActiveDiscoveryFilters() {
  return (
    Boolean(state.activeCategory) ||
    Boolean(state.activeCondition) ||
    Boolean(state.activeLevel) ||
    Boolean(state.activeYear) ||
    Boolean(state.activeSubject) ||
    Boolean(state.activeSubcategory) ||
    Boolean(state.activeSize) ||
    Boolean(state.searchTerm.trim()) ||
    state.showOnlyFavorites
  );
}

function getCurrentProductLimit() {
  return hasActiveDiscoveryFilters() ? HOME_FILTERED_LIMIT : HOME_RECOMMENDED_LIMIT;
}

function renderHome() {
  if (clearIncompatibleCategoryFilters()) {
    syncFavoritesUrl();
  }

  renderCategoryPills();
  renderConditionPills();
  renderYearPills();
  renderCategorySpecificFilters();
  updateCategoryLinks();
  updateScopeButtons();
  updateScopeSummary();
  updateProductsHeading();

  const filtered = sortProducts(getScopedProducts());
  const productLimit = getCurrentProductLimit();
  const limited = filtered.slice(0, productLimit);

  renderProductGrid(limited, filtered.length, productLimit);
  renderCategoryShelves();
  
}

function buildCategoryUrl(category) {
  const url = new URL(window.location.href);
  url.searchParams.set("category", category);
  url.searchParams.delete("condition");
  url.searchParams.delete("level");
  url.searchParams.delete("year");
  url.searchParams.delete("subject");
  url.searchParams.delete("type");
  url.searchParams.delete("size");
  url.searchParams.delete("search");
  url.searchParams.delete("favorites");
  url.hash = "productos";
  return `${url.pathname}${url.search}${url.hash}`;
}

function renderCategoryShelves() {
  if (!elements.categoryMarketplace || !elements.categoryShelves) return;

  if (hasActiveDiscoveryFilters()) {
    elements.categoryMarketplace.hidden = true;
    elements.categoryShelves.innerHTML = "";
    return;
  }

  const scopedProducts = sortProducts(
    state.products.filter((product) => matchesActiveScope(product))
  );
  const featuredIds = new Set(
    scopedProducts
      .slice(0, HOME_RECOMMENDED_LIMIT)
      .map((product) => String(product.id || ""))
  );

  const shelves = categoryOptions
    .map((category) => {
      const categoryProducts = scopedProducts
        .filter(
          (product) =>
            normalizeText(product.category) === normalizeText(category)
        );
      const productsWithoutFeatured = categoryProducts.filter(
        (product) => !featuredIds.has(String(product.id || ""))
      );
      const products = (
        productsWithoutFeatured.length ? productsWithoutFeatured : categoryProducts
      ).slice(0, CATEGORY_SHELF_LIMIT);

      return { category, products };
    })
    .filter(({ products }) => products.length)
    .slice(0, CATEGORY_SHELF_MAX);

  elements.categoryMarketplace.hidden = shelves.length === 0;
  elements.categoryShelves.innerHTML = shelves
    .map(({ category, products }) => {
      const details = categoryShelfDetails[category] || categoryShelfDetails.Otros;
      const productsContent = products.length
        ? `
            <div class="category-shelf-grid">
              ${products.map((product) => productCard(product)).join("")}
            </div>
          `
        : `
            <div class="category-shelf-empty">
              <div>
                <strong>Todavía no hay publicaciones en ${escapeHtml(category)}.</strong>
                <span>Podés ser la primera persona en publicar algo en esta categoría.</span>
              </div>
              <a
                href="publicar.html?category=${encodeURIComponent(category)}"
                data-requires-auth
              >Publicar en ${escapeHtml(category)}</a>
            </div>
          `;

      return `
        <section class="category-shelf${products.length ? "" : " is-empty"} reveal is-visible" aria-labelledby="shelf-${normalizeText(category)}">
          <header class="category-shelf__header">
            <div class="category-shelf__title-group">
              <span class="category-shelf__icon">${icon(details.icon)}</span>
              <div>
                <p class="category-shelf__eyebrow">Categoría</p>
                <h3 id="shelf-${normalizeText(category)}">${escapeHtml(category)}</h3>
                <p>${escapeHtml(details.description)}</p>
              </div>
            </div>
            <a class="category-shelf__link" href="${escapeHtml(buildCategoryUrl(category))}">
              Ver todos
              ${icon("chevron")}
            </a>
          </header>
          ${productsContent}
        </section>
      `;
    })
    .join("");

  window.colegioLibrePreferences?.refresh?.(elements.categoryShelves);
}

function updateCategoryLinks() {
  elements.categoryLinks.forEach((link) => {
    const category = link.getAttribute("data-category-link");
    const isActive =
      Boolean(state.activeCategory) &&
      normalizeText(category) === normalizeText(state.activeCategory);

    link.classList.toggle("is-category-active", isActive);
    link.setAttribute("aria-current", isActive ? "true" : "false");
  });
}

function updateScopeButtons() {
  elements.scopeButtons.forEach((button) => {
    const isActive = button.dataset.scope === state.activeScope;
    button.classList.toggle("is-active", isActive);
  });
}

function updateScopeSummary() {
  if (!elements.scopeSummaryLabel) return;

  if (state.showOnlyFavorites) {
    elements.scopeSummaryLabel.textContent = "Viendo tus favoritos";
    return;
  }

  if (INSTITUTION_PORTAL.enabled) {
    elements.scopeSummaryLabel.textContent =
      `Solo publicaciones de ${INSTITUTION_PORTAL.schoolName}`;
    return;
  }

  if (state.activeScope === "school" && state.profile && state.profile.school_name) {
    elements.scopeSummaryLabel.textContent = `Viendo productos de ${state.profile.school_name}`;
    return;
  }

  if (state.activeScope === "zone" && state.profile && state.profile.zone_code) {
    elements.scopeSummaryLabel.textContent = `Viendo productos de ${state.profile.zone_code}`;
    return;
  }

  elements.scopeSummaryLabel.textContent = "Viendo productos de toda Argentina";
}

function updateProductsHeading() {
  if (!elements.productsKicker || !elements.productsTitle) return;

  if (state.showOnlyFavorites) {
    elements.productsKicker.textContent = "Tus guardados";
    elements.productsTitle.textContent = "Productos favoritos";
    return;
  }

  if (state.activeCategory) {
    elements.productsKicker.textContent = "Categoría";
    elements.productsTitle.textContent = `${state.activeCategory} disponibles`;
    return;
  }

  if (state.searchTerm.trim()) {
    elements.productsKicker.textContent = "Resultados";
    elements.productsTitle.textContent = "Resultados de búsqueda";
    return;
  }

  if (INSTITUTION_PORTAL.enabled) {
    elements.productsKicker.textContent = "Comunidad Eccleston";
    elements.productsTitle.textContent = "Publicado por familias del colegio";
    return;
  }

  if (state.activeScope === "zone" && state.profile?.zone_code) {
    elements.productsKicker.textContent = "Cerca tuyo";
    elements.productsTitle.textContent =
      `Recomendados en ${state.profile.zone_code}`;
    return;
  }

  elements.productsKicker.textContent = "Selección nacional";
  elements.productsTitle.textContent = "Recomendados de toda Argentina";
}

function buildSummary(total, productLimit = getCurrentProductLimit()) {
  if (!total) {
    return state.showOnlyFavorites
      ? "Todavía no tenés favoritos para estos filtros."
      : "Sin resultados para los filtros actuales.";
  }

  const shown = Math.min(total, productLimit);
  const parts = [
    total > productLimit
      ? `${shown} productos seleccionados`
      : `${shown} producto${shown === 1 ? "" : "s"} disponible${shown === 1 ? "" : "s"}`
  ];

  if (state.showOnlyFavorites) {
    parts.push("en tus favoritos");
  }

  if (state.activeCategory) {
    parts.push(`en ${state.activeCategory}`);
  }

  if (state.activeCondition) {
    parts.push(`estado ${state.activeCondition.toLowerCase()}`);
  }

  if (state.activeLevel) {
    parts.push(state.activeLevel.toLowerCase());
  }

  if (state.activeYear) {
    parts.push(`${state.activeYear}.º año`);
  }

  if (state.activeSubject) {
    parts.push(state.activeSubject.toLowerCase());
  }

  if (state.activeSubcategory) {
    parts.push(state.activeSubcategory.toLowerCase());
  }

  if (state.activeSize) {
    const sizeLabel =
      state.activeCategory === "Uniformes" ? "talle" : "tamaño";
    parts.push(`${sizeLabel} ${state.activeSize}`);
  }

  if (state.searchTerm.trim()) {
    parts.push(`para “${state.searchTerm.trim()}”`);
  }

  return parts.join(" · ");
}

function renderProductGrid(products, total, productLimit = getCurrentProductLimit()) {
  if (!elements.productGrid) return;

  if (!products.length) {
    elements.productGrid.innerHTML = "";
    elements.emptyState.hidden = false;
    const title = elements.emptyState.querySelector("h3");
    const copy = elements.emptyState.querySelector("p");
    if (state.loadError) {
      if (title) title.textContent = "No pudimos cargar las publicaciones.";
      if (copy) copy.textContent = "Revisá tu conexión y volvé a intentarlo.";
      if (elements.clearFilters) elements.clearFilters.textContent = "Reintentar";
      elements.filterSummary.textContent = "Error de conexión";
    } else {
      if (title) title.textContent = "No encontramos productos para esa búsqueda.";
      if (copy) copy.textContent = "Probá con otro término, otro estado o volvé a ver todos los destacados.";
      if (elements.clearFilters) elements.clearFilters.textContent = "Limpiar filtros";
      elements.filterSummary.textContent = buildSummary(0, productLimit);
    }
    return;
  }

  if (elements.clearFilters) elements.clearFilters.textContent = "Limpiar filtros";
  elements.emptyState.hidden = true;
  elements.filterSummary.textContent = buildSummary(total, productLimit);
  elements.productGrid.innerHTML = products.map((product) => productCard(product)).join("");
}

function productCard(product) {
  const isFavorite = state.favorites.has(product.id);
  const productUrl = `producto.html?id=${encodeURIComponent(product.id)}`;
  const isUniform = normalizeText(product.category) === normalizeText("Uniformes");
  const isBackpack = normalizeText(product.category) === normalizeText("Mochilas");
  const sizeLabel = product.size
    ? `${isUniform ? "Talle" : isBackpack ? "Tamaño" : "Medida"} ${product.size}`
    : "";
  const attributeLabels = [
    product.subject,
    product.subcategory,
    sizeLabel
  ].filter(Boolean);
  const academicLabel = [
    product.school_level && product.school_level !== "No corresponde"
      ? product.school_level
      : null,
    product.school_year ? `${product.school_year}.º` : null
  ]
    .filter(Boolean)
    .join(" · ");

  const schoolLink = product.school_code
    ? `
      <a
        class="product-school-link"
        href="colegio.html?code=${encodeURIComponent(product.school_code)}"
      >
        ${escapeHtml(product.school_name)}
      </a>
    `
    : `
      <span class="product-school-link is-muted">
        ${escapeHtml(product.school_name)}
      </span>
    `;

  return `
    <article class="product-card">
      <div class="product-media">
        <a
          class="product-image-link"
          href="${productUrl}"
          aria-label="Ver ${escapeHtml(product.title)}"
        >
          <img
            src="${escapeHtml(product.image_url || FALLBACK_PRODUCT_IMAGE)}"
            alt="${escapeHtml(product.title)}"
            loading="lazy"
            decoding="async"
          >
        </a>

        <span
          class="condition-badge"
          data-condition="${escapeHtml(product.condition)}"
        >
          ${escapeHtml(product.condition)}
        </span>

        <button
          class="favorite-button"
          type="button"
          aria-label="Guardar ${escapeHtml(product.title)} en favoritos"
          aria-pressed="${String(isFavorite)}"
          data-favorite-button="${encodeURIComponent(product.id)}"
        >
          ${icon("heart")}
        </button>
      </div>

      <div class="product-body">
        <a class="product-main-link" href="${productUrl}">
          <h3 class="product-title" data-product-title data-no-translate>
            ${escapeHtml(product.title)}
          </h3>

          <p class="product-price">
            ${formatPrice(product.price)}
          </p>

          <div class="product-meta">
            ${icon("pin")}
            <span>${escapeHtml(product.location)}</span>
          </div>

          ${
            attributeLabels.length
              ? `
                <div class="product-attribute-chips">
                  ${attributeLabels
                    .map(
                      (label) =>
                        `<span class="product-size-chip">${escapeHtml(label)}</span>`
                    )
                    .join("")}
                </div>
              `
              : ""
          }

          ${
            academicLabel
              ? `
                <div class="product-academic-meta">
                  ${escapeHtml(academicLabel)}
                </div>
              `
              : ""
          }
        </a>

        <div class="product-meta product-meta--secondary">
          ${schoolLink}
        </div>
      </div>
    </article>
  `;
}

async function handleFavoriteClick(event) {
  const button = event.target.closest("[data-favorite-button]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const productId = button.getAttribute("data-favorite-button");
  const result = await toggleFavorite(productId);

  if (result && result.requiresAuth) {
    showToast("Iniciá sesión para guardar favoritos.");
    window.setTimeout(() => {
      window.location.href = buildLoginUrl("index.html");
    }, 500);
    return;
  }

  if (result && result.error) {
    showToast("No se pudo actualizar el favorito.");
    return;
  }

  if (result && result.active) {
    state.favorites.add(productId);
  } else {
    state.favorites.delete(productId);
  }

  renderHome();
  showToast(result && result.active ? "Guardado en favoritos." : "Quitado de favoritos.");
}

})();
