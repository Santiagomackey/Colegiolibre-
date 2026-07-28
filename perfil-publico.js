(function () {
  "use strict";

  const {
    FALLBACK_PRODUCT_IMAGE,
    escapeHtml,
    formatMemberSince,
    formatPrice,
    formatRelativeDate,
    getCurrentUser,
    getInitials,
    safeProductRecord
  } = window.colegioLibreApi;

  const profileId = new URLSearchParams(window.location.search).get("id");
  const elements = {
    avatar: document.getElementById("profile-avatar"),
    blockButton: document.getElementById("block-profile-button"),
    memberSince: document.getElementById("profile-member-since"),
    name: document.getElementById("profile-name"),
    productCount: document.getElementById("profile-product-count"),
    products: document.getElementById("public-products"),
    productsEmpty: document.getElementById("products-empty"),
    profileActions: document.getElementById("profile-actions"),
    rating: document.getElementById("profile-rating"),
    ratingCount: document.getElementById("profile-rating-count"),
    reportBackdrop: document.getElementById("user-report-backdrop"),
    reportButton: document.getElementById("report-user-button"),
    reportCancel: document.getElementById("user-report-cancel"),
    reportClose: document.getElementById("user-report-close"),
    reportDetails: document.getElementById("user-report-details"),
    reportForm: document.getElementById("user-report-form"),
    reportModal: document.getElementById("user-report-modal"),
    reportReason: document.getElementById("user-report-reason"),
    reviews: document.getElementById("reviews-list"),
    reviewsEmpty: document.getElementById("reviews-empty"),
    salesCount: document.getElementById("profile-sales-count"),
    school: document.getElementById("profile-school"),
    searchForm: document.getElementById("public-profile-search"),
    searchInput: document.getElementById("public-profile-search-input"),
    toast: document.getElementById("public-profile-toast"),
    verifiedBadge: document.getElementById("verified-badge"),
    zone: document.getElementById("profile-zone")
  };

  const state = {
    currentUser: null,
    isBlocked: false,
    profile: null
  };

  bindEvents();
  void initPublicProfile();

  async function initPublicProfile() {
    if (!profileId) {
      showToast("No se encontró el perfil.");
      return;
    }

    state.currentUser = await getCurrentUser();
    const [profileResponse, productsResponse, reviewsResponse] =
      await Promise.all([
        window.colegioLibreSupabase
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .maybeSingle(),
        window.colegioLibreSupabase
          .from("products")
          .select("*")
          .eq("user_id", profileId)
          .in("status", ["available", "reserved"])
          .order("created_at", { ascending: false }),
        window.colegioLibreSupabase
          .from("reviews")
          .select("id, reviewer_id, rating, comment, created_at")
          .eq("reviewed_id", profileId)
          .order("created_at", { ascending: false })
          .limit(30)
      ]);

    if (profileResponse.error || !profileResponse.data) {
      console.error("Error cargando perfil:", profileResponse.error);
      showToast("No se pudo cargar este perfil.");
      return;
    }

    state.profile = profileResponse.data;
    renderProfile(profileResponse.data);
    renderProducts(productsResponse.data || []);
    await renderReviews(reviewsResponse.data || []);

    if (state.currentUser && state.currentUser.id !== profileId) {
      elements.profileActions.hidden = false;
      await hydrateBlockState();
    }
  }

  function bindEvents() {
    elements.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const term = elements.searchInput.value.trim();
      window.location.href = term
        ? `index.html?search=${encodeURIComponent(term)}`
        : "index.html";
    });

    elements.reportButton.addEventListener("click", openReport);
    elements.blockButton.addEventListener("click", toggleBlock);
    elements.reportBackdrop.addEventListener("click", closeReport);
    elements.reportClose.addEventListener("click", closeReport);
    elements.reportCancel.addEventListener("click", closeReport);
    elements.reportForm.addEventListener("submit", submitReport);
  }

  function renderProfile(profile) {
    const rating = Number(profile.rating || 0);
    const ratingCount = Number(profile.rating_count || 0);
    const salesCount = Number(profile.sales_count || 0);

    elements.name.textContent = profile.name || "Usuario ColegioLibre";
    elements.avatar.textContent = getInitials(profile.name);
    elements.school.textContent = profile.school_name || "Colegio no especificado";
    elements.zone.textContent = profile.zone_code || "Zona no especificada";
    elements.memberSince.textContent = `Miembro desde ${formatMemberSince(
      profile.member_since || profile.created_at
    )}`;
    elements.rating.textContent = ratingCount
      ? `${rating.toFixed(1)} ★`
      : "Sin calificaciones";
    elements.ratingCount.textContent = String(ratingCount);
    elements.salesCount.textContent = String(salesCount);
    elements.verifiedBadge.hidden = true;
    document.title = `${profile.name || "Perfil"} | ColegioLibre`;
  }

  function renderProducts(products) {
    const safeProducts = products.map(safeProductRecord);
    elements.productCount.textContent = String(safeProducts.length);
    elements.products.innerHTML = "";
    elements.productsEmpty.hidden = safeProducts.length > 0;

    safeProducts.forEach((product) => {
      const link = document.createElement("a");
      link.className = "product-card";
      link.href = `producto.html?id=${encodeURIComponent(product.id)}`;
      link.innerHTML = `
        <img src="${escapeHtml(
          product.image_url || FALLBACK_PRODUCT_IMAGE
        )}" alt="${escapeHtml(product.title)}" />
        <div class="product-card__body">
          <h3 data-product-title data-no-translate>${escapeHtml(product.title)}</h3>
          <strong>${escapeHtml(formatPrice(product.price))}</strong>
          <span>${escapeHtml(product.location)} · ${escapeHtml(
            formatRelativeDate(product.created_at)
          )}</span>
        </div>
      `;
      link.querySelector("img").addEventListener("error", (event) => {
        event.currentTarget.src = FALLBACK_PRODUCT_IMAGE;
      });
      elements.products.appendChild(link);
    });
  }

  async function renderReviews(reviews) {
    elements.reviews.innerHTML = "";
    elements.reviewsEmpty.hidden = reviews.length > 0;
    if (!reviews.length) return;

    const reviewerIds = [...new Set(reviews.map((review) => review.reviewer_id))];
    const { data: reviewers } = await window.colegioLibreSupabase
      .from("profiles")
      .select("id, name")
      .in("id", reviewerIds);
    const names = new Map(
      (reviewers || []).map((profile) => [profile.id, profile.name])
    );

    reviews.forEach((review) => {
      const card = document.createElement("article");
      card.className = "review-card";
      card.innerHTML = `
        <div class="review-card__head">
          <strong>${escapeHtml(names.get(review.reviewer_id) || "Usuario de ColegioLibre")}</strong>
          <span class="review-card__stars">${"★".repeat(
            Number(review.rating)
          )}${"☆".repeat(5 - Number(review.rating))}</span>
        </div>
        ${
          review.comment
            ? `<p>${escapeHtml(review.comment)}</p>`
            : "<p>Calificación sin comentario.</p>"
        }
        <time>${escapeHtml(formatRelativeDate(review.created_at))}</time>
      `;
      elements.reviews.appendChild(card);
    });
  }

  async function requireLogin() {
    if (state.currentUser) return true;
    window.location.href = `login.html?next=${encodeURIComponent(
      `perfil-publico.html?id=${profileId}`
    )}`;
    return false;
  }

  async function hydrateBlockState() {
    const { data } = await window.colegioLibreSupabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", state.currentUser.id)
      .eq("blocked_id", profileId)
      .maybeSingle();
    state.isBlocked = Boolean(data);
    elements.blockButton.dataset.blocked = String(state.isBlocked);
    elements.blockButton.textContent = state.isBlocked ? "Desbloquear" : "Bloquear";
  }

  async function toggleBlock() {
    if (!(await requireLogin())) return;
    const question = state.isBlocked
      ? "¿Querés desbloquear a este usuario?"
      : "¿Querés bloquear a este usuario? No podrán iniciar nuevas conversaciones.";
    if (!window.confirm(question)) return;

    elements.blockButton.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      state.isBlocked ? "unblock_user" : "block_user",
      { target_user: profileId }
    );
    elements.blockButton.disabled = false;

    if (error) {
      showToast(error.message || "No se pudo actualizar el bloqueo.");
      return;
    }

    state.isBlocked = !state.isBlocked;
    await hydrateBlockState();
    showToast(state.isBlocked ? "Usuario bloqueado." : "Usuario desbloqueado.");
  }

  async function openReport() {
    if (!(await requireLogin())) return;
    elements.reportModal.hidden = false;
    document.body.style.overflow = "hidden";
    elements.reportReason.focus();
  }

  function closeReport() {
    elements.reportModal.hidden = true;
    document.body.style.overflow = "";
    elements.reportForm.reset();
  }

  async function submitReport(event) {
    event.preventDefault();
    const submitButton = elements.reportForm.querySelector('[type="submit"]');
    submitButton.disabled = true;

    const { error } = await window.colegioLibreSupabase.rpc(
      "create_safety_report",
      {
        selected_target_type: "user",
        selected_target_id: profileId,
        selected_reason: elements.reportReason.value,
        report_details: elements.reportDetails.value.trim() || null
      }
    );
    submitButton.disabled = false;

    if (error) {
      showToast(error.message || "No se pudo enviar el reporte.");
      return;
    }

    closeReport();
    showToast("Reporte enviado. Gracias por avisarnos.");
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2500);
  }
})();
