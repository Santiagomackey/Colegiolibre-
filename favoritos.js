(function () {
  "use strict";

  const elements = {
    count: document.getElementById("favorites-count"),
    countLabel: document.getElementById("favorites-count-label"),
    empty: document.getElementById("favorites-empty"),
    emptyText: document.getElementById("favorites-empty-text"),
    emptyTitle: document.getElementById("favorites-empty-title"),
    error: document.getElementById("favorites-error"),
    grid: document.getElementById("favorites-grid"),
    results: document.getElementById("favorites-results"),
    retry: document.getElementById("favorites-retry"),
    search: document.getElementById("favorites-search"),
    sort: document.getElementById("favorites-sort"),
    toast: document.getElementById("favorites-toast")
  };

  const state = {
    favorites: [],
    products: [],
    query: "",
    sort: "saved",
    user: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    state.user = await getCurrentUser();

    if (!state.user) {
      window.location.replace(buildLoginUrl("favoritos.html"));
      return;
    }

    await loadFavorites();
  }

  function bindEvents() {
    elements.search?.addEventListener("input", () => {
      state.query = normalizeText(elements.search.value);
      renderFavorites();
    });

    elements.sort?.addEventListener("change", () => {
      state.sort = elements.sort.value;
      renderFavorites();
    });

    elements.retry?.addEventListener("click", loadFavorites);
  }

  async function loadFavorites() {
    setLoading(true);

    try {
      const { data: favorites, error: favoritesError } =
        await window.colegioLibreSupabase
          .from("favorites")
          .select("product_id, created_at")
          .eq("user_id", state.user.id)
          .order("created_at", { ascending: false })
          .limit(250);

      if (favoritesError) throw favoritesError;

      state.favorites = favorites || [];
      const ids = state.favorites.map((item) => item.product_id).filter(Boolean);

      if (!ids.length) {
        state.products = [];
        renderFavorites();
        return;
      }

      const { data: products, error: productsError } =
        await window.colegioLibreSupabase
          .from("products")
          .select(
            "id, user_id, title, category, condition, price, image_url, location, school_name, status, created_at, updated_at, moderation_status"
          )
          .in("id", ids)
          .limit(250);

      if (productsError) throw productsError;

      const savedOrder = new Map(
        state.favorites.map((item, index) => [item.product_id, index])
      );

      state.products = (products || [])
        .map((product) => ({
          ...product,
          saved_at:
            state.favorites.find((item) => item.product_id === product.id)
              ?.created_at || null
        }))
        .sort(
          (a, b) =>
            (savedOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (savedOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        );

      renderFavorites();
    } catch (error) {
      console.error("Error cargando favoritos:", error);
      elements.grid.innerHTML = "";
      elements.empty.hidden = true;
      elements.error.hidden = false;
      updateCount(0);
    } finally {
      setLoading(false);
    }
  }

  function renderFavorites() {
    const visibleProducts = getVisibleProducts();
    elements.grid.innerHTML = "";
    elements.error.hidden = true;
    updateCount(state.products.length);

    if (!visibleProducts.length) {
      elements.empty.hidden = false;
      elements.grid.hidden = true;

      if (state.products.length && state.query) {
        elements.emptyTitle.textContent = "No encontramos coincidencias";
        elements.emptyText.textContent =
          "Probá con otro título, categoría, colegio o ubicación.";
      } else {
        elements.emptyTitle.textContent = "Todavía no guardaste productos";
        elements.emptyText.textContent =
          "Cuando encuentres algo que te interese, tocá el corazón para guardarlo acá.";
      }

      return;
    }

    elements.empty.hidden = true;
    elements.grid.hidden = false;
    const fragment = document.createDocumentFragment();

    visibleProducts.forEach((product) => {
      fragment.appendChild(createFavoriteCard(product));
    });

    elements.grid.appendChild(fragment);
  }

  function getVisibleProducts() {
    const filtered = state.products.filter((product) => {
      if (!state.query) return true;
      return normalizeText(
        [
          product.title,
          product.category,
          product.condition,
          product.location,
          product.school_name
        ].join(" ")
      ).includes(state.query);
    });

    return filtered.sort((a, b) => {
      if (state.sort === "price-asc") {
        return numericPrice(a.price) - numericPrice(b.price);
      }

      if (state.sort === "price-desc") {
        return numericPrice(b.price) - numericPrice(a.price);
      }

      if (state.sort === "newest") {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }

      return new Date(b.saved_at || 0) - new Date(a.saved_at || 0);
    });
  }

  function createFavoriteCard(product) {
    const card = document.createElement("article");
    card.className = "favorite-card";
    card.dataset.productId = product.id;

    const status = product.status || "available";
    const statusLabel = {
      available: "Disponible",
      paused: "No disponible",
      reserved: "Reservado",
      sold: "Vendido"
    }[status] || status;

    card.innerHTML = `
      <a
        class="favorite-card__image"
        href="./producto.html?id=${encodeURIComponent(product.id)}"
        aria-label="Ver producto"
      >
        <img
          src="${escapeHtml(product.image_url || FALLBACK_PRODUCT_IMAGE)}"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </a>
      <button
        class="favorite-card__remove"
        type="button"
        aria-label="Quitar de favoritos"
        title="Quitar de favoritos"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.4 4.95 13.5a4.86 4.86 0 0 1 0-6.99 5.08 5.08 0 0 1 7.05 0L12 7.52l1-1.01a5.08 5.08 0 0 1 7.05 0 4.86 4.86 0 0 1 0 6.99Z"></path>
        </svg>
      </button>
      <div class="favorite-card__body">
        <span class="favorite-card__status" data-status="${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
        <a href="./producto.html?id=${encodeURIComponent(product.id)}">
          <h2 data-product-title data-no-translate>${escapeHtml(product.title || "Producto")}</h2>
        </a>
        <p class="favorite-card__price">${formatPrice(product.price)}</p>
        <p class="favorite-card__meta">${escapeHtml(product.location || "Ubicación no especificada")}</p>
        <p class="favorite-card__meta">${escapeHtml(product.school_name || "Sin colegio")}</p>
      </div>
    `;

    const image = card.querySelector("img");
    image.addEventListener("error", () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    }, { once: true });

    card
      .querySelector(".favorite-card__remove")
      .addEventListener("click", () => removeFavorite(product.id, card));

    return card;
  }

  async function removeFavorite(productId, card) {
    const button = card.querySelector(".favorite-card__remove");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    const { error } = await window.colegioLibreSupabase
      .from("favorites")
      .delete()
      .eq("user_id", state.user.id)
      .eq("product_id", productId);

    if (error) {
      console.error("Error quitando favorito:", error);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      showToast("No se pudo quitar el producto de favoritos.");
      return;
    }

    state.products = state.products.filter((product) => product.id !== productId);
    state.favorites = state.favorites.filter(
      (favorite) => favorite.product_id !== productId
    );
    renderFavorites();
    showToast("Producto quitado de favoritos.");
  }

  function setLoading(loading) {
    elements.results.setAttribute("aria-busy", String(loading));
    if (loading) {
      elements.error.hidden = true;
      elements.empty.hidden = true;
      elements.grid.hidden = false;
    }
  }

  function updateCount(count) {
    elements.count.textContent = String(count);
    elements.countLabel.textContent =
      count === 1 ? "producto guardado" : "productos guardados";
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2800);
  }

  function buildLoginUrl(destination) {
    return `login.html?next=${encodeURIComponent(destination)}`;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function numericPrice(value) {
    return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    }).format(numericPrice(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
