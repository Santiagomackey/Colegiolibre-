(function () {

function createProductPageFallbackApi() {
  const localFallbackImage = "images/materiales.webp";
  const statusLabels = {
    available: "Disponible",
    paused: "Pausado",
    reserved: "Reservado",
    sold: "Vendido"
  };

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

  function localFormatRelativeDate(dateValue) {
    if (!dateValue) return "Reciente";

    const date = new Date(dateValue);
    const now = new Date();
    const diffMs = Math.max(0, now - date);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) return `Hace ${diffDays} dias`;

    const locale =
      window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
    return date.toLocaleDateString(locale);
  }

  function localFormatPublishedDate(dateValue) {
    const relative = localFormatRelativeDate(dateValue);
    if (relative === "Hoy") return "Publicado hoy";
    if (relative === "Ayer") return "Publicado ayer";
    if (relative.indexOf("Hace ") === 0) return `Publicado ${relative.toLowerCase()}`;
    return `Publicado el ${relative}`;
  }

  function localFormatViews(count) {
    const value = Number(count || 0);
    return value === 1 ? "1 vista" : `${value} vistas`;
  }

  function localGetInitials(name) {
    return String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
  }

  function localGetSchoolLabel(source) {
    return (source && (source.school_name || source.school)) || "Colegio no especificado";
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
      image_urls:
        product && Array.isArray(product.image_urls)
          ? product.image_urls.filter(Boolean)
          : [],
      location: (product && product.location) || "Sin ubicacion",
      price: Number((product && product.price) || 0),
      school_code: (product && product.school_code) || null,
      school_level: (product && product.school_level) || null,
      school_name: localGetSchoolLabel(product),
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
    ensureConversation: async () => ({
      error: new Error("La mensajeria en modo local requiere iniciar sesion real.")
    }),
    escapeHtml: localEscapeHtml,
    fetchFavoriteIds: async (productIds = null) => {
      const ids = readLocalFavorites();
      const filteredIds =
        Array.isArray(productIds) && productIds.length ? ids.filter((id) => productIds.includes(id)) : ids;
      return new Set(filteredIds);
    },
    formatPrice: localFormatPrice,
    formatPublishedDate: localFormatPublishedDate,
    formatViews: localFormatViews,
    getCurrentProfile: async () => null,
    getCurrentUser: async () => null,
    getInitials: localGetInitials,
    getSchoolLabel: localGetSchoolLabel,
    getStatusLabel: localGetStatusLabel,
    getZoneLabel: localGetZoneLabel,
    incrementProductViews: async (product) => Number((product && product.views) || 0),
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

function getStaticProductById(productIdValue) {
  if (typeof window.getColegioLibreStaticProductById === "function") {
    return window.getColegioLibreStaticProductById(productIdValue);
  }

  if (!Array.isArray(window.colegioLibreStaticProducts)) {
    return null;
  }

  return window.colegioLibreStaticProducts.find((product) => product.id === productIdValue) || null;
}

function getStaticProductList() {
  if (typeof window.getColegioLibreStaticProducts === "function") {
    return window.getColegioLibreStaticProducts();
  }

  return Array.isArray(window.colegioLibreStaticProducts) ? window.colegioLibreStaticProducts.map((item) => ({ ...item })) : [];
}

const colegioLibreApi = Object.assign(createProductPageFallbackApi(), window.colegioLibreApi || {});

const {
  FALLBACK_PRODUCT_IMAGE,
  ensureConversation,
  escapeHtml,
  fetchFavoriteIds,
  formatPrice,
  formatPublishedDate,
  formatViews,
  getCurrentProfile,
  getCurrentUser,
  getInitials,
  getSchoolLabel,
  getStatusLabel,
  getZoneLabel,
  incrementProductViews,
  safeProductRecord,
  toggleFavorite
} = colegioLibreApi;

const CONDITION_OPTIONS = ["Nuevo", "Como nuevo", "Usado", "Muy usado"];
const VIEW_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const productId = new URLSearchParams(window.location.search).get("id");

const elements = {
  attributesGrid: document.querySelector("#product-attributes"),
  attributesSection: document.querySelector("#attributes-section"),
  availabilityNotice: document.querySelector("#availability-notice"),
  breadcrumbList: document.querySelector("#breadcrumb-list"),
  conditionPills: document.querySelector("#condition-pills"),
  conditionBadge: document.querySelector("#product-condition-badge"),
  contactButton: document.querySelector("#contact-button"),
  descriptionCopy: document.querySelector("#description-copy"),
  galleryThumbs: document.querySelector("#gallery-thumbs"),
  mainFavoriteButton: document.querySelector("#main-favorite-button"),
  mainImage: document.querySelector("#main-product-image"),
  ownerEditButton: document.querySelector("#owner-edit-button"),
  productCategory: document.querySelector("#product-category"),
  productClassification: document.querySelector("#product-classification"),
  productLocation: document.querySelector("#product-location"),
  productPrice: document.querySelector("#product-price"),
  productPublishedDate: document.querySelector("#product-published-date"),
  reportButton: document.querySelector("#report-product-button"),
  reportModal: document.querySelector("#product-report-modal"),
  reportBackdrop: document.querySelector("#product-report-backdrop"),
  reportClose: document.querySelector("#product-report-close"),
  reportCancel: document.querySelector("#product-report-cancel"),
  reportForm: document.querySelector("#product-report-form"),
  reportReason: document.querySelector("#product-report-reason"),
  reportDetails: document.querySelector("#product-report-details"),
  productSchoolLink: document.querySelector("#product-school-link"),
  productTitle: document.querySelector("#product-title"),
  productUpdatedDate: document.querySelector("#product-updated-date"),
  productUpdatedRow: document.querySelector("#product-updated-row"),
  productViews: document.querySelector("#product-views"),
  saveButton: document.querySelector("#save-button"),
  shareButton: document.querySelector("#share-button"),
  sellerAvatar: document.querySelector("#seller-avatar"),
  sellerName: document.querySelector("#seller-name"),
  sellerProfileLink: document.querySelector("#seller-profile-link"),
  sellerRatingSummary: document.querySelector("#seller-rating-summary"),
  sellerSchool: document.querySelector("#seller-school"),
  sellerSchoolLink: document.querySelector("#seller-school-link"),
  sellerZone: document.querySelector("#seller-zone"),
  similarEmpty: document.querySelector("#similar-empty"),
  similarGrid: document.querySelector("#similar-grid"),
  similarTemplate: document.querySelector("#similar-card-template"),
  similarViewAll: document.querySelector("#similar-view-all"),
  statusBadge: document.querySelector("#product-status-badge"),
  toast: document.querySelector("#toast")
};

let currentProduct = null;
let currentUser = null;
let favoriteIds = new Set();

initProductPage();

async function initProductPage() {
  bindEvents();

  if (!productId) {
    showToast("No se encontró el producto.");
    return;
  }

  currentUser = await getCurrentUser();
  await refreshFavorites();
  await loadProduct();
}

function bindEvents() {
  document.querySelectorAll(".search-bar").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector('input[type="search"]');
      const term = input?.value.trim();
      const url = term ? `index.html?search=${encodeURIComponent(term)}` : "index.html";
      window.location.href = url;
    });
  });

  bindHeaderNavigation();
  elements.mainFavoriteButton?.addEventListener("click", () => handleFavoriteToggle(productId));
  elements.saveButton?.addEventListener("click", () => handleFavoriteToggle(productId));
  elements.contactButton?.addEventListener("click", handleContactSeller);
  elements.reportButton?.addEventListener("click", openProductReport);
  elements.reportBackdrop?.addEventListener("click", closeProductReport);
  elements.reportClose?.addEventListener("click", closeProductReport);
  elements.reportCancel?.addEventListener("click", closeProductReport);
  elements.reportForm?.addEventListener("submit", submitProductReport);
  elements.shareButton?.addEventListener("click", shareCurrentProduct);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.reportModal?.hidden) {
      closeProductReport();
    }
  });
}

function bindHeaderNavigation() {
  const headerButtons = Array.from(document.querySelectorAll(".header-action"));
  headerButtons[0]?.addEventListener("click", () => {
    window.location.href = "mensajes.html";
  });
  headerButtons[1]?.addEventListener("click", () => {
    window.location.href = "favoritos.html";
  });
  headerButtons[2]?.addEventListener("click", () => {
    window.location.href = "perfil.html";
  });
  document.querySelector(".header-cta")?.addEventListener("click", () => {
    window.location.href = "publicar.html";
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2200);
}

async function refreshFavorites() {
  favoriteIds = await fetchFavoriteIds(productId ? [productId] : []);
}

function normalizeProductRecord(product) {
  const normalized = safeProductRecord(product || {});
  const rawYear =
    product && product.school_year !== null && product.school_year !== undefined
      ? Number(product.school_year)
      : normalized.school_year;

  return {
    ...normalized,
    images:
      product && Array.isArray(product.images)
        ? product.images
        : [],
    image_urls:
      product && Array.isArray(product.image_urls)
        ? product.image_urls.filter(Boolean)
        : Array.isArray(normalized.image_urls)
          ? normalized.image_urls.filter(Boolean)
          : [],
    school_level:
      (product && product.school_level) ||
      normalized.school_level ||
      null,
    school_year: Number.isInteger(rawYear) ? rawYear : null,
    size: (product && product.size) || normalized.size || null,
    subject: (product && product.subject) || normalized.subject || null,
    subcategory:
      (product && product.subcategory) ||
      normalized.subcategory ||
      null
  };
}

function getProductImages(product) {
  const candidates = [
    product?.image_url,
    ...(Array.isArray(product?.image_urls) ? product.image_urls : []),
    ...(Array.isArray(product?.images) ? product.images : [])
  ]
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.url || item?.image_url || null;
    })
    .filter(Boolean);

  const uniqueImages = Array.from(new Set(candidates));
  return uniqueImages.length ? uniqueImages.slice(0, 6) : [FALLBACK_PRODUCT_IMAGE];
}

function getProductClassification(product) {
  if (product.subcategory) return product.subcategory;
  if (product.subject) return product.subject;
  if (product.school_level) {
    return product.school_year
      ? `${product.school_level} · ${product.school_year}.º`
      : product.school_level;
  }
  if (product.size) {
    return product.category === "Uniformes"
      ? `Talle ${product.size}`
      : `Tamaño ${product.size}`;
  }
  return getStatusLabel(product.status);
}

function getProductAttributes(product) {
  const category = product.category || "Otros";
  const attributes = [];

  if (category === "Libros" || category === "Apuntes") {
    attributes.push(
      ["Materia", product.subject],
      ["Nivel", product.school_level],
      ["Año o grado", product.school_year ? `${product.school_year}.º` : null]
    );
  } else if (category === "Uniformes") {
    attributes.push(
      ["Prenda", product.subcategory],
      ["Talle", product.size]
    );
  } else if (category === "Mochilas") {
    attributes.push(["Tamaño", product.size]);
  } else {
    const labels = {
      Cuadernos: "Tipo de cuaderno",
      "Útiles": "Tipo de útil",
      "Tecnología": "Tipo de tecnología",
      Otros: "Tipo de producto"
    };
    attributes.push([labels[category] || "Tipo", product.subcategory]);
  }

  return attributes.filter(([, value]) => value !== null && value !== undefined && value !== "");
}

async function loadProduct() {
  const staticProduct = getStaticProductById(productId);

  if (staticProduct) {
    currentProduct = normalizeProductRecord(staticProduct);
    renderProduct(currentProduct);
    renderSeller(currentProduct);
    await renderSimilarProducts(currentProduct);
  }

  let data = null;
  let error = null;

  try {
    if (window.colegioLibreSupabase && typeof window.colegioLibreSupabase.from === "function") {
      const response = await window.colegioLibreSupabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .maybeSingle();

      data = response.data || null;
      error = response.error || null;
    } else {
      error = new Error("Cliente de datos no disponible.");
    }
  } catch (queryError) {
    error = queryError;
  }

  if (error || !data) {
    if (error) {
      console.warn("Se cargó una ficha local porque falló Supabase:", error);
    }

    data = getStaticProductById(productId);
  }

  if (!data) {
    showToast("No se pudo cargar el producto.");
    return;
  }

  currentProduct = normalizeProductRecord(data);
  renderProduct(currentProduct);
  renderSeller(currentProduct);
  await updateViews(currentProduct);
  await renderSimilarProducts(currentProduct);
}

async function updateViews(product) {
  const isOwner = Boolean(currentUser && currentUser.id === product.user_id);
  const viewStorageKey = "colegiolibre-product-view-times";
  let viewTimes = {};

  try {
    viewTimes = JSON.parse(window.localStorage.getItem(viewStorageKey) || "{}");
  } catch (_error) {
    viewTimes = {};
  }

  const previousViewTime = Number(viewTimes[product.id] || 0);
  const canCountView =
    !isOwner &&
    (!previousViewTime || Date.now() - previousViewTime >= VIEW_COOLDOWN_MS);

  if (!canCountView) {
    elements.productViews.textContent = formatViews(product.views);
    return;
  }

  const nextViews = await incrementProductViews(product);
  currentProduct.views = Number(nextViews || product.views || 0);

  if (elements.productViews) {
    elements.productViews.textContent = formatViews(currentProduct.views);
  }

  viewTimes[product.id] = Date.now();

  try {
    window.localStorage.setItem(viewStorageKey, JSON.stringify(viewTimes));
  } catch (_error) {
    // La vista ya fue procesada; el almacenamiento local es solo un control adicional.
  }
}

function renderProduct(product) {
  document.title = `ColegioLibre | ${product.title}`;

  elements.productTitle.textContent = product.title;
  elements.productPrice.textContent = formatPrice(product.price);
  elements.productLocation.textContent = product.location;
  elements.productPublishedDate.textContent = formatPublishedDate(product.created_at);
  renderUpdatedDate(product);
  elements.productViews.textContent = formatViews(product.views);
  elements.conditionBadge.textContent = product.condition;
  elements.conditionBadge.dataset.condition = product.condition;
  elements.productCategory.textContent = product.category || "Otros";
  elements.productClassification.textContent = getProductClassification(product);

  renderBreadcrumbs(product);
  renderStatus(product);
  renderAttributes(product);
  renderCondition(product.condition);
  renderDescription(product.description);
  renderGallery(product);
  renderSchoolLinks(product);
  setFavoriteState(favoriteIds.has(product.id));
  updateProductActions(product);
}

function renderUpdatedDate(product) {
  if (!elements.productUpdatedRow || !elements.productUpdatedDate) return;

  const createdAt = new Date(product.created_at || 0).getTime();
  const updatedAt = new Date(product.updated_at || product.created_at || 0).getTime();
  const wasUpdated =
    Number.isFinite(createdAt) &&
    Number.isFinite(updatedAt) &&
    updatedAt - createdAt > 60 * 1000;

  elements.productUpdatedRow.hidden = !wasUpdated;
  if (wasUpdated) {
    elements.productUpdatedDate.textContent = `Actualizado ${formatPublishedDate(
      product.updated_at
    ).replace(/^Publicado\s*/i, "").toLowerCase()}`;
  }
}

async function shareCurrentProduct() {
  if (!currentProduct) return;

  const shareData = {
    title: currentProduct.title,
    text: `${currentProduct.title} en ColegioLibre`,
    url: window.location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(window.location.href);
    showToast("Enlace copiado.");
  } catch (error) {
    if (error?.name !== "AbortError") {
      showToast("No se pudo compartir la publicación.");
    }
  }
}

function renderBreadcrumbs(product) {
  const classification = getProductClassification(product);
  const items = [
    {
      label: "Inicio",
      href: "./index.html"
    },
    {
      label: product.category || "Producto",
      href: `./index.html?category=${encodeURIComponent(product.category || "Otros")}#productos`
    },
    classification && classification !== getStatusLabel(product.status)
      ? { label: classification }
      : null,
    {
      label: product.title
    }
  ].filter(Boolean);

  elements.breadcrumbList.innerHTML = "";

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.innerHTML = item.href
      ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
      : `<span>${escapeHtml(item.label)}</span>`;

    if (index < items.length - 1) {
      li.insertAdjacentHTML(
        "beforeend",
        '<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right"></use></svg>'
      );
    }

    elements.breadcrumbList.appendChild(li);
  });
}

function renderStatus(product) {
  const status = product.status || "available";
  const label = getStatusLabel(status);

  elements.statusBadge.textContent = label;
  elements.statusBadge.dataset.status = status;

  const messages = {
    paused: "Esta publicación está pausada y no aparece en el Home.",
    reserved: "Este producto se encuentra reservado.",
    sold: "Este producto ya fue vendido."
  };

  const message = messages[status] || "";
  elements.availabilityNotice.hidden = !message;
  elements.availabilityNotice.textContent = message;
  elements.availabilityNotice.dataset.status = status;
}

function renderAttributes(product) {
  const attributes = getProductAttributes(product);
  elements.attributesSection.hidden = attributes.length === 0;
  elements.attributesGrid.innerHTML = attributes
    .map(
      ([label, value]) => `
        <div class="attribute-card">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `
    )
    .join("");
}

function renderCondition(activeCondition) {
  const conditions = CONDITION_OPTIONS.includes(activeCondition)
    ? CONDITION_OPTIONS
    : [...CONDITION_OPTIONS, activeCondition].filter(Boolean);

  elements.conditionPills.innerHTML = conditions
    .map((condition) => {
      const isActive = condition === activeCondition;
      return `
        <span
          class="condition-pill${isActive ? " is-active" : ""}"
          data-condition="${escapeHtml(condition)}"
          ${isActive ? 'aria-current="true"' : ""}
        >
          ${escapeHtml(condition)}
        </span>
      `;
    })
    .join("");
}

function renderDescription(description) {
  elements.descriptionCopy.innerHTML = "";

  const lines = String(description || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!lines.length) {
    elements.descriptionCopy.innerHTML = "<p>El vendedor todavía no agregó una descripción.</p>";
    return;
  }

  lines.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    elements.descriptionCopy.appendChild(paragraph);
  });
}

function renderGallery(product) {
  const images = getProductImages(product);
  const imageUrl = images[0];
  elements.galleryThumbs.innerHTML = "";

  elements.mainImage.src = imageUrl;
  elements.mainImage.alt = product.title;
  elements.mainImage.onerror = () => {
    elements.mainImage.src = FALLBACK_PRODUCT_IMAGE;
  };

  images.forEach((url, index) => {
    const thumb = document.createElement("button");
    const image = document.createElement("img");
    image.decoding = "async";
    image.loading = "lazy";

    thumb.className = `gallery-thumb${index === 0 ? " is-active" : ""}`;
    thumb.type = "button";
    thumb.setAttribute(
      "aria-label",
      index === 0 ? "Ver imagen principal" : `Ver imagen ${index + 1}`
    );
    thumb.setAttribute("aria-pressed", String(index === 0));

    image.src = url;
    image.alt = `${product.title} · imagen ${index + 1}`;
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };

    thumb.appendChild(image);
    thumb.addEventListener("click", () => {
      elements.mainImage.src = url;
      elements.mainImage.alt = image.alt;
      elements.galleryThumbs.querySelectorAll(".gallery-thumb").forEach((item) => {
        const isSelected = item === thumb;
        item.classList.toggle("is-active", isSelected);
        item.setAttribute("aria-pressed", String(isSelected));
      });
    });

    elements.galleryThumbs.appendChild(thumb);
  });
}

function renderSchoolLinks(product) {
  if (!product.school_code) {
    elements.productSchoolLink.textContent = "Colegio no especificado";
    elements.productSchoolLink.removeAttribute("href");
    elements.sellerSchoolLink.textContent = "Colegio no disponible";
    elements.sellerSchoolLink.removeAttribute("href");
    return;
  }

  const href = `colegio.html?code=${encodeURIComponent(product.school_code)}`;
  const label = product.school_name || "Ver colegio";

  elements.productSchoolLink.href = href;
  elements.productSchoolLink.textContent = `Ver comunidad de ${label}`;
  elements.sellerSchoolLink.href = href;
  elements.sellerSchoolLink.textContent = label;
}

function renderSeller(product) {
  elements.sellerName.textContent = product.seller_name;
  elements.sellerSchool.textContent = getSchoolLabel(product);
  elements.sellerZone.textContent = getZoneLabel(product);
  elements.sellerAvatar.textContent = getInitials(product.seller_name);

  if (product.user_id) {
    elements.sellerProfileLink.href = `perfil-publico.html?id=${encodeURIComponent(product.user_id)}`;
  } else {
    elements.sellerProfileLink.removeAttribute("href");
  }

  void hydrateSellerTrust(product.user_id);
}

async function hydrateSellerTrust(userId) {
  if (!elements.sellerRatingSummary || !userId) return;

  const { data, error } = await window.colegioLibreSupabase
    .from("profiles")
    .select(
      "rating, rating_count, sales_count, school_code, school_verification_status"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    elements.sellerRatingSummary.innerHTML =
      "<span>Miembro de la comunidad ColegioLibre</span>";
    return;
  }

  const rating = Number(data.rating || 0);
  const ratingCount = Number(data.rating_count || 0);
  const salesCount = Number(data.sales_count || 0);
  const stars = ratingCount ? `${rating.toFixed(1)} ★` : "Sin calificaciones";

  elements.sellerRatingSummary.innerHTML = `
    <strong>${stars}</strong>
    <span>${ratingCount} ${ratingCount === 1 ? "calificación" : "calificaciones"} · ${salesCount} ${salesCount === 1 ? "venta" : "ventas"}</span>
    <span class="verified-school-badge">Miembro de la comunidad</span>
  `;
}

function updateProductActions(product) {
  if (!elements.contactButton) return;

  const isOwner = Boolean(currentUser && currentUser.id === product.user_id);
  const isUnavailable = ["sold", "paused", "reserved"].includes(product.status);

  elements.contactButton.hidden = isOwner;
  elements.ownerEditButton.hidden = !isOwner;
  elements.ownerEditButton.href = isOwner
    ? `publicar.html?edit=${encodeURIComponent(product.id)}`
    : "#";
  elements.saveButton.hidden = isOwner;
  elements.mainFavoriteButton.hidden = isOwner;
  elements.reportButton.hidden = isOwner;

  if (isOwner) return;

  elements.contactButton.disabled = isUnavailable;

  if (product.status === "sold") {
    elements.contactButton.textContent = "Producto vendido";
    return;
  }

  if (product.status === "paused") {
    elements.contactButton.textContent = "Publicación pausada";
    return;
  }

  if (product.status === "reserved") {
    elements.contactButton.textContent = "Producto reservado";
    return;
  }

  elements.contactButton.textContent = "Contactar vendedor";
}

async function renderSimilarProducts(product) {
  let similarProducts = [];

  if (elements.similarViewAll) {
    elements.similarViewAll.href =
      `./index.html?category=${encodeURIComponent(product.category || "Otros")}#productos`;
  }

  try {
    if (window.colegioLibreSupabase && typeof window.colegioLibreSupabase.from === "function") {
      const { data, error } = await window.colegioLibreSupabase
        .from("products")
        .select("*")
        .not("user_id", "is", null)
        .neq("id", product.id)
        .eq("category", product.category)
        .eq("status", "available")
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        throw error;
      }

      similarProducts = (data || []).map(normalizeProductRecord);
    }
  } catch (error) {
    console.warn("Se cargaron similares locales porque falló Supabase:", error);
  }

  if (!similarProducts.length) {
    similarProducts = getStaticProductList()
      .filter(
        (item) =>
          item.id !== product.id &&
          item.category === product.category &&
          (item.status || "available") === "available"
      )
      .map(normalizeProductRecord);
  }

  similarProducts = similarProducts
    .sort((first, second) => {
      const score = (item) =>
        Number(Boolean(product.subcategory && item.subcategory === product.subcategory)) * 3 +
        Number(Boolean(product.subject && item.subject === product.subject)) * 2 +
        Number(Boolean(product.size && item.size === product.size));

      return score(second) - score(first);
    })
    .slice(0, 4);

  const similarFavoriteIds = await fetchFavoriteIds(similarProducts.map((item) => item.id));

  elements.similarGrid.innerHTML = "";
  elements.similarEmpty.hidden = similarProducts.length > 0;

  similarProducts.forEach((item) => {
    const fragment = elements.similarTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".similar-card");
    const badge = fragment.querySelector(".similar-card__badge");
    const favoriteButton = fragment.querySelector(".similar-card__favorite");
    const image = fragment.querySelector(".similar-card__image");
    const meta = fragment.querySelector(".similar-card__meta");
    const price = fragment.querySelector(".similar-card__price");
    const title = fragment.querySelector(".similar-card__title");

    badge.textContent = item.condition;
    badge.dataset.condition = item.condition;
    title.textContent = item.title;
    price.textContent = formatPrice(item.price);
    meta.textContent =
      item.subcategory ||
      item.subject ||
      (item.size
        ? `${item.category === "Uniformes" ? "Talle" : "Tamaño"} ${item.size}`
        : item.location);
    image.src = item.image_url || FALLBACK_PRODUCT_IMAGE;
    image.alt = item.title;
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };

    const isFavorite = similarFavoriteIds.has(item.id);
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.classList.toggle("is-active", isFavorite);

    favoriteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      event.preventDefault();

      const result = await toggleFavorite(item.id);

      if (result?.requiresAuth) {
        window.location.href = "login.html";
        return;
      }

      if (result?.error) {
        showToast("No se pudo actualizar el favorito.");
        return;
      }

      const nextValue = Boolean(result.active);
      favoriteButton.setAttribute("aria-pressed", String(nextValue));
      favoriteButton.classList.toggle("is-active", nextValue);
      showToast(nextValue ? "Producto similar guardado." : "Producto similar quitado.");
    });

    card.addEventListener("click", () => {
      window.location.href = `producto.html?id=${encodeURIComponent(item.id)}`;
    });

    elements.similarGrid.appendChild(fragment);
  });
}

function setFavoriteState(isActive) {
  [elements.mainFavoriteButton, elements.saveButton].forEach((element) => {
    element?.setAttribute("aria-pressed", String(isActive));
    element?.classList.toggle("is-active", isActive);
  });
}

async function handleFavoriteToggle(id) {
  const result = await toggleFavorite(id);

  if (result?.requiresAuth) {
    showToast("Iniciá sesión para guardar favoritos.");
    window.setTimeout(() => {
      window.location.href = "login.html";
    }, 500);
    return;
  }

  if (result?.error) {
    showToast("No se pudo actualizar el favorito.");
    return;
  }

  if (result.active) {
    favoriteIds.add(id);
  } else {
    favoriteIds.delete(id);
  }

  setFavoriteState(Boolean(result.active));
  showToast(result.active ? "Producto guardado en favoritos." : "Producto quitado de favoritos.");
}

async function openProductReport() {
  if (!currentProduct) return;

  const user = currentUser || (await getCurrentUser());
  const destination = `producto.html?id=${encodeURIComponent(currentProduct.id)}`;

  if (!user) {
    window.location.href = `login.html?next=${encodeURIComponent(destination)}`;
    return;
  }

  if (user.id === currentProduct.user_id) {
    showToast("No podés reportar tu propia publicación.");
    return;
  }

  currentUser = user;
  elements.reportModal.hidden = false;
  document.body.style.overflow = "hidden";
  elements.reportReason.focus();
}

function closeProductReport() {
  elements.reportModal.hidden = true;
  document.body.style.overflow = "";
  elements.reportForm.reset();
}

async function submitProductReport(event) {
  event.preventDefault();
  if (!currentProduct) return;

  const submitButton = elements.reportForm.querySelector(
    'button[type="submit"]'
  );
  submitButton.disabled = true;

  const { error } = await window.colegioLibreSupabase.rpc(
    "create_safety_report",
    {
      selected_target_type: "product",
      selected_target_id: currentProduct.id,
      selected_reason: elements.reportReason.value,
      report_details: elements.reportDetails.value.trim() || null
    }
  );

  submitButton.disabled = false;
  if (error) {
    console.error("Error enviando reporte:", error);
    showToast(error.message || "No se pudo enviar el reporte.");
    return;
  }

  closeProductReport();
  showToast("Reporte enviado. Gracias por cuidar la comunidad.");
}

async function handleContactSeller() {
  if (!currentProduct || currentProduct.status !== "available") {
    showToast("Este producto no está disponible para contactar.");
    return;
  }

  const user = currentUser || (await getCurrentUser());
  const destination = `producto.html?id=${encodeURIComponent(currentProduct.id)}`;

  if (!user) {
    window.location.href = `login.html?next=${encodeURIComponent(destination)}`;
    return;
  }

  const profile = await getCurrentProfile(true);
  if (!profile?.school_code) {
    window.location.href =
      `index.html?onboarding=1&next=${encodeURIComponent(destination)}`;
    return;
  }

  if (window.colegioLibreApi.isAccountRestricted(profile)) {
    showToast("Tu cuenta no está habilitada para iniciar conversaciones.");
    window.setTimeout(() => {
      window.location.href = "perfil.html";
    }, 900);
    return;
  }

  if (!currentProduct?.user_id) {
    showToast("Este producto no tiene vendedor disponible.");
    return;
  }

  if (user.id === currentProduct.user_id) {
    showToast("No podés contactarte con tu propio producto.");
    return;
  }

  elements.contactButton.disabled = true;
  elements.contactButton.classList.add("is-loading");
  elements.contactButton.textContent = "Abriendo conversación…";

  const { conversation, error } = await ensureConversation({
    buyerId: user.id,
    productId: currentProduct.id,
    sellerId: currentProduct.user_id
  });

  if (error || !conversation) {
    console.error("Error creando conversación:", error);
    showToast("No se pudo abrir la conversación.");
    elements.contactButton.disabled = false;
    elements.contactButton.classList.remove("is-loading");
    elements.contactButton.textContent = "Contactar vendedor";
    return;
  }

  window.location.href = `mensajes.html?id=${encodeURIComponent(conversation.id)}`;
}

})();
