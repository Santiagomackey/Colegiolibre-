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
  isAdminUser,
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
  schoolMembership: null,
  transactions: [],
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
  await hydrateTransactions();
  await exposeAdminNavigation();
  renderCounts();
  renderDashboard();
  renderSettingsForm();
  renderCurrentSection();

  if (state.pendingNotice) {
    showToast(state.pendingNotice);
  }
}

async function exposeAdminNavigation() {
  if (!(await isAdminUser())) return;
  const secondaryNav = document.querySelector(".profile-nav--secondary");
  if (!secondaryNav || secondaryNav.querySelector("[data-admin-moderation]")) {
    return;
  }

  secondaryNav.insertAdjacentHTML(
    "afterbegin",
    `
      <a class="profile-nav__item" href="moderacion.html" data-admin-moderation>
        <svg class="icon"><use href="#icon-shield"></use></svg>
        <span>Moderación</span>
      </a>
    `
  );
}

function getCurrentProfileDestination() {
  return `perfil.html${window.location.search}`;
}

function hydrateViewState() {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view");
  const allowedViews = new Set([
    "publications",
    "messages",
    "purchases",
    "sales",
    "settings"
  ]);

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

async function loadSchoolMembership() {
  if (!state.currentUser?.id || !state.profile?.school_code) {
    state.schoolMembership = null;
    return;
  }

  const { data, error } = await window.colegioLibreSupabase
    .from("school_memberships")
    .select("*")
    .eq("user_id", state.currentUser.id)
    .eq("school_code", String(state.profile.school_code).trim().toUpperCase())
    .maybeSingle();

  if (error) {
    console.warn("No se pudo cargar la verificación escolar:", error);
    state.schoolMembership = null;
    return;
  }

  state.schoolMembership = data || null;
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

async function hydrateTransactions() {
  const { data, error } = await window.colegioLibreSupabase
    .from("transactions")
    .select("*")
    .or(
      `buyer_id.eq.${state.currentUser.id},seller_id.eq.${state.currentUser.id}`
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("El historial de operaciones todavía no está disponible:", error);
    state.transactions = [];
    return;
  }

  const productIds = [
    ...new Set((data || []).map((transaction) => transaction.product_id))
  ];
  let products = [];

  if (productIds.length) {
    const productResponse = await window.colegioLibreSupabase
      .from("products")
      .select("id, title, image_url, price")
      .in("id", productIds);
    products = productResponse.data || [];
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  state.transactions = (data || []).map((transaction) => ({
    ...transaction,
    product: productsById.get(transaction.product_id) || null
  }));
}

function mapProductToPublication(product) {
  return {
    category: product.category || "Otros",
    condition: product.condition || "Usado",
    favorites: getProductFavoriteCount(product, state.favoriteCountMap),
    id: product.id,
    image_url: product.image_url || FALLBACK_PRODUCT_IMAGE,
    messages: Number(state.messageCounts[product.id] || 0),
    moderationReason: product.moderation_reason || null,
    moderationStatus: product.moderation_status || "approved",
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

  renderTransactionHistory(
    state.transactions.filter(
      (transaction) => transaction.buyer_id === state.currentUser.id
    )
  );
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

function renderVerificationSection() {
  const profile = state.profile || {};
  const accountStatus = profile.account_status || "active";
  const verificationStatus =
    profile.school_verification_status || "unverified";
  const emailConfirmed = Boolean(state.currentUser?.email_confirmed_at);
  const statusConfig = {
    pending: {
      label: "Pendiente de revisión",
      tone: "warning",
      text:
        "Tu colegio ya fue enviado a revisión. Un administrador puede aprobarlo desde el Centro de moderación."
    },
    rejected: {
      label: "Solicitud rechazada",
      tone: "danger",
      text:
        state.schoolMembership?.rejection_reason ||
        "La solicitud no pudo aprobarse. Revisá tu colegio o probá con un código válido."
    },
    unverified: {
      label: "Colegio sin verificar",
      tone: "neutral",
      text:
        "Verificá tu colegio con un código temporal o enviá una solicitud manual."
    },
    verified: {
      label: "Colegio verificado",
      tone: "success",
      text:
        "Ya podés publicar, contactar vendedores, usar mensajes y entrar a Mi colegio."
    }
  };
  const config = statusConfig[verificationStatus] || statusConfig.unverified;
  const accountLabels = {
    active: "Cuenta activa",
    banned: "Cuenta bloqueada",
    suspended: "Cuenta suspendida"
  };
  const verifiedDate = profile.school_verified_at
    ? formatPublishedDate(profile.school_verified_at)
    : "";

  utilityPanel.innerHTML = `
    <div class="verification-layout">
      <article class="verification-card verification-card--${escapeHtml(config.tone)}">
        <div class="verification-card__icon" aria-hidden="true">
          <svg class="icon"><use href="#icon-shield"></use></svg>
        </div>
        <div>
          <p class="section-kicker">Estado de tu comunidad</p>
          <h2>${escapeHtml(config.label)}</h2>
          <p>${escapeHtml(config.text)}</p>
          <div class="verification-facts">
            <span><strong>Colegio</strong>${escapeHtml(profile.school_name || "Sin colegio")}</span>
            <span><strong>Email</strong>${emailConfirmed ? "Confirmado" : "Pendiente"}</span>
            <span><strong>Cuenta</strong>${escapeHtml(accountLabels[accountStatus] || accountStatus)}</span>
            ${
              verifiedDate
                ? `<span><strong>Verificado</strong>${escapeHtml(verifiedDate)}</span>`
                : ""
            }
          </div>
        </div>
      </article>

      ${
        accountStatus !== "active"
          ? `
            <article class="verification-action-card verification-action-card--blocked">
              <p class="section-kicker">Acceso restringido</p>
              <h3>${escapeHtml(accountLabels[accountStatus])}</h3>
              <p>No podés publicar ni iniciar conversaciones mientras tu cuenta esté restringida. Contactá al equipo administrador de ColegioLibre.</p>
            </article>
          `
          : verificationStatus === "verified"
            ? `
              <article class="verification-action-card">
                <p class="section-kicker">Todo listo</p>
                <h3>Tu acceso está habilitado</h3>
                <p>La verificación pertenece a ${escapeHtml(profile.school_name || "tu colegio")}. Si cambiás de colegio, vas a tener que verificarlo nuevamente.</p>
                <a class="verification-primary-action" href="colegio.html?code=${encodeURIComponent(profile.school_code || "")}">Ir a Mi colegio</a>
              </article>
            `
            : `
              <article class="verification-action-card">
                <p class="section-kicker">Verificación inmediata</p>
                <h3>Ingresá el código de tu colegio</h3>
                <p>Los códigos son temporales y solo sirven para el colegio asociado a tu perfil.</p>
                <form id="verification-code-form" class="verification-code-form">
                  <label>
                    Código
                    <input id="verification-code" type="text" maxlength="20" autocomplete="off" placeholder="CL-A7F2-9K3M" />
                  </label>
                  <button type="submit">Verificar con código</button>
                </form>
                <div class="verification-divider"><span>o</span></div>
                <button
                  class="verification-secondary-action"
                  id="request-school-review"
                  type="button"
                  ${verificationStatus === "pending" ? "disabled" : ""}
                >
                  ${verificationStatus === "pending" ? "Revisión ya solicitada" : "Solicitar revisión manual"}
                </button>
                <small>La revisión manual no cambia tu colegio; solo confirma que pertenecés a esa comunidad.</small>
              </article>
            `
      }
    </div>
  `;

  const codeInput = document.getElementById("verification-code");
  codeInput?.addEventListener("input", () => {
    codeInput.value = codeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
  });
  document
    .getElementById("verification-code-form")
    ?.addEventListener("submit", handleVerificationCode);
  document
    .getElementById("request-school-review")
    ?.addEventListener("click", requestManualVerification);
}

async function handleVerificationCode(event) {
  event.preventDefault();
  const input = document.getElementById("verification-code");
  const button = event.currentTarget.querySelector("button");
  const invitationCode = input?.value.trim().toUpperCase();

  if (!invitationCode) {
    showToast("Ingresá el código de verificación.");
    input?.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "Verificando…";
  const { error } = await window.colegioLibreSupabase.rpc(
    "redeem_school_invite_code",
    { invitation_code: invitationCode }
  );

  if (error) {
    button.disabled = false;
    button.textContent = "Verificar con código";
    showToast(error.message || "El código no es válido.");
    return;
  }

  await refreshVerificationState();
  showToast("Tu colegio quedó verificado.");
}

async function requestManualVerification() {
  const button = document.getElementById("request-school-review");
  button.disabled = true;
  button.textContent = "Enviando…";

  const { error } = await window.colegioLibreSupabase.rpc(
    "request_school_verification"
  );

  if (error) {
    button.disabled = false;
    button.textContent = "Solicitar revisión manual";
    showToast(error.message || "No se pudo enviar la solicitud.");
    return;
  }

  await refreshVerificationState();
  showToast("Solicitud enviada para revisión.");
}

async function refreshVerificationState() {
  await hydrateDashboard(state.currentUser.id);
  await loadSchoolMembership();
  renderDashboard();
  renderVerificationSection();
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

function renderTransactionHistory(transactions) {
  if (!transactions.length) {
    renderUtilitySection({
      actionHref: "index.html",
      actionLabel: "Explorar productos",
      body:
        "Cuando reserves o compres un producto desde el chat, la operación aparecerá acá.",
      eyebrow: "Historial",
      metrics: [
        { label: "Compras verificadas", value: "0" },
        { label: "Colegio", value: state.profile?.school_name || "Sin colegio" }
      ],
      title: "Todavía no tenés compras"
    });
    return;
  }

  const statusLabels = {
    cancelled: "Cancelada",
    completed: "Completada",
    reserved: "Reservada"
  };

  utilityPanel.innerHTML = `
    <div class="transaction-history">
      ${transactions
        .map(
          (transaction) => `
            <article class="transaction-card">
              <img
                src="${escapeHtml(
                  transaction.product?.image_url || FALLBACK_PRODUCT_IMAGE
                )}"
                alt="${escapeHtml(transaction.product?.title || "Producto")}"
                loading="lazy"
                decoding="async"
              />
              <div>
                <span class="transaction-card__status" data-status="${escapeHtml(
                  transaction.status
                )}">${escapeHtml(
                  statusLabels[transaction.status] || transaction.status
                )}</span>
                <h3>${escapeHtml(
                  transaction.product?.title || "Producto de ColegioLibre"
                )}</h3>
                <p>${escapeHtml(
                  transaction.status === "completed"
                    ? "La operación fue confirmada por el vendedor."
                    : transaction.status === "reserved"
                      ? "El vendedor reservó este producto para vos."
                      : transaction.cancelled_by === state.currentUser.id
                        ? "Cancelaste esta reserva."
                        : "El vendedor canceló la reserva."
                )}</p>
              </div>
              <div class="transaction-card__actions">
                <a href="mensajes.html?id=${encodeURIComponent(
                  transaction.conversation_id
                )}">Abrir conversación</a>
                ${
                  transaction.status === "reserved"
                    ? `
                      <button
                        type="button"
                        data-cancel-purchase-reservation="${escapeHtml(
                          transaction.id
                        )}"
                      >
                        Cancelar reserva
                      </button>
                    `
                    : ""
                }
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;

  utilityPanel
    .querySelectorAll("[data-cancel-purchase-reservation]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        cancelPurchaseReservation(
          button.dataset.cancelPurchaseReservation,
          button
        )
      );
    });
}

async function cancelPurchaseReservation(transactionId, button) {
  const transaction = state.transactions.find(
    (item) =>
      item.id === transactionId &&
      item.buyer_id === state.currentUser.id &&
      item.status === "reserved"
  );

  if (!transaction) {
    showToast("Esta reserva ya no está activa.");
    return;
  }

  if (
    !window.confirm(
      "¿Querés cancelar la reserva? El producto volverá a estar disponible."
    )
  ) {
    return;
  }

  button.disabled = true;
  const { error } = await window.colegioLibreSupabase.rpc(
    "cancel_product_reservation",
    { target_conversation: transaction.conversation_id }
  );

  if (error) {
    console.error("Error cancelando la reserva:", error);
    showToast(error.message || "No se pudo cancelar la reserva.");
    button.disabled = false;
    return;
  }

  await hydrateTransactions();
  renderTransactionHistory(
    state.transactions.filter(
      (item) => item.buyer_id === state.currentUser.id
    )
  );
  showToast("Reserva cancelada. El vendedor recibió el aviso.");
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
    thumb.innerHTML = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:18px;">`;
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

  const moderationLabels = {
    approved: "Aprobada",
    manual_review: "En revisión",
    pending: "Revisando",
    rejected: "No aprobada"
  };
  const moderationLabel = moderationLabels[item.moderationStatus];
  published.textContent = `${item.published} · ${
    moderationLabel || getStatusLabel(item.status)
  }`;
  if (
    item.moderationReason &&
    ["pending", "manual_review", "rejected"].includes(item.moderationStatus)
  ) {
    published.title = item.moderationReason;
  }
  dropdown.innerHTML = buildMenuActions(item.status, item.moderationStatus);

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

function buildMenuActions(status, moderationStatus = "approved") {
  if (status === "paused") {
    if (moderationStatus !== "approved") {
      return `
        <button type="button" role="menuitem" data-edit-action>Editar y volver a enviar</button>
        <button type="button" role="menuitem" data-status-action="sold">Marcar como vendido</button>
      `;
    }
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
  const currentProduct = state.products.find((product) => product.id === productId);

  if (!allowedStatuses.has(nextStatus) || state.pendingProductIds.has(productId)) {
    return false;
  }

  if (
    nextStatus === "sold" &&
    !window.confirm(
      "Si la venta fue con alguien del chat, conviene completarla desde esa conversación para registrar al comprador y habilitar las calificaciones. ¿Querés marcarla como vendida sin asociar un comprador?"
    )
  ) {
    return false;
  }

  state.pendingProductIds.add(productId);
  sourceButton?.setAttribute("aria-busy", "true");
  sourceButton?.setAttribute("disabled", "");

  try {
    let response;

    if (nextStatus === "available" && currentProduct?.status === "sold") {
      response = await window.colegioLibreSupabase.rpc(
        "reopen_product_listing",
        { target_product: productId }
      );
    } else {
      const updatePayload = {
        status: nextStatus,
        updated_at: new Date().toISOString()
      };

      if (nextStatus === "available") {
        updatePayload.reserved_for = null;
      }

      response = await window.colegioLibreSupabase
        .from("products")
        .update(updatePayload)
        .eq("id", productId)
        .eq("user_id", state.currentUser.id)
        .select("id, status")
        .maybeSingle();
    }

    const { data, error } = response;
    const updatedProduct = Array.isArray(data) ? data[0] : data;

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
    showToast(error.message || "No se pudo actualizar el estado.");
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
  const allowedViews = new Set([
    "publications",
    "messages",
    "purchases",
    "sales",
    "settings"
  ]);
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
  const previousSchoolCode = String(state.profile?.school_code || "")
    .trim()
    .toUpperCase();

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
  await loadSchoolMembership();
  renderCounts();
  renderDashboard();
  renderSettingsForm();
  renderCurrentSection();
  const schoolChanged =
    previousSchoolCode !==
    String(schoolCode || "").trim().toUpperCase();
  showToast(
    schoolChanged
      ? "Colegio actualizado. Tenés que verificarlo nuevamente."
      : "Ajustes guardados correctamente."
  );
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
