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
const sectionTitle = document.querySelector("#profile-section-title");
const sectionDescription = document.querySelector("#profile-section-description");
const publishButton = document.querySelector("#publish-product-link");
const publicationTabs = document.querySelector("#publication-tabs");
const profileViewButtons = Array.from(document.querySelectorAll("[data-profile-view]"));
const dashboardOverview = document.querySelector("#dashboard-overview");
const publicationPanel = document.querySelector("#publication-panel");
const securityBanner = document.querySelector("#security-banner");
const utilityPanel = document.querySelector("#utility-panel");
const accountPreferences = document.querySelector("#account-preferences");
const settingsPanel = document.querySelector("#settings-panel");
const settingsForm = document.querySelector("#settings-form");
const settingsName = document.querySelector("#settings-name");
const settingsEmail = document.querySelector("#settings-email");
const settingsSchoolCode = document.querySelector("#settings-school-code");
const settingsSchoolName = document.querySelector("#settings-school-name");
const settingsZone = document.querySelector("#settings-zone");
const settingsPasswordButton = document.querySelector("#settings-password-button");
const settingsDeactivateButton = document.querySelector("#settings-deactivate-button");

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
  currentSection: "profile",
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
    description: "Administrá tus publicaciones y revisá su estado.",
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
  profile: { title: "Mi perfil", description: "" },
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

  state.currentUser = await getCurrentUser(true);

  if (!state.currentUser) {
    window.location.replace(
      `/login?next=${encodeURIComponent(getCurrentProfileDestination())}`
    );
    return;
  }

  const currentProfile = await getCurrentProfile(true);

  if (!currentProfile?.school_code) {
    window.location.replace(
      `/?onboarding=1&next=${encodeURIComponent(getCurrentProfileDestination())}`
    );
    return;
  }

  await hydrateDashboard(state.currentUser.id);
  await hydrateTransactions();
  renderCounts();
  renderDashboard();
  renderSettingsForm();
  renderCurrentSection();

  if (state.pendingNotice) {
    showToast(state.pendingNotice);
  }
}

function getCurrentProfileDestination() {
  return `/perfil${window.location.search}`;
}

function hydrateViewState() {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get("view") === "settings" && (params.get("section") === "cobro" || location.hash === "#datos-cobro")
    ? "billing" : params.get("view");
  const allowedViews = new Set([
    "publications",
    "messages",
    "purchases",
    "sales",
    "settings",
    "billing",
    "requests",
    "profile"
  ]);

  if (rawView === "favorites") {
    window.location.replace("/favoritos");
    return;
  }

  state.currentSection = allowedViews.has(rawView) ? rawView : "profile";

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
    schoolLink.href = `/colegio?code=${encodeURIComponent(state.profile.school_code)}`;
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

  document.getElementById("account-name").textContent = state.profile?.name || "Mi cuenta";
  document.getElementById("account-avatar").textContent = getInitials(state.profile?.name);
  settingsName.value = state.profile?.name || "";
  settingsEmail.value = state.currentUser?.email || "";
  document.getElementById("account-settings-email").textContent = settingsEmail.value;
  settingsSchoolCode.value = state.profile?.school_code || "";
  settingsSchoolName.value = state.profile?.school_name || "";
  settingsZone.value = state.profile?.zone_code || "";
}

function renderCurrentSection() {
  updateSectionUi();

  if (state.currentSection === "requests") {
    void renderAccountRequests();
    return;
  }

  if (state.currentSection === "publications") {
    renderPublicationList(state.publicationsByState[state.currentState], "No tenés publicaciones en esta sección.");
    return;
  }

  if (state.currentSection === "sales") {
    renderPublicationList(state.publicationsByState.sold, "Todavía no marcaste publicaciones como vendidas.");
    return;
  }

  if (state.currentSection === "profile" || state.currentSection === "settings" || state.currentSection === "billing") {
    renderSettingsForm();
    return;
  }

  if (state.currentSection === "messages") {
    renderUtilitySection({
      actionHref: "/mensajes",
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

async function renderAccountRequests() {
  const list = document.getElementById("account-request-list");
  const client = window.colegioLibreSupabase;
  list.textContent = "Cargando pedidos…";
  try {
    const { data, error } = await client.from("wanted_posts")
      .select("id,title,category,min_price,max_price,match_paused")
      .eq("user_id", state.currentUser.id).eq("status", "active")
      .order("created_at", { ascending: false }).limit(12);
    if (error) throw error;
    if (!data.length) {
      list.textContent = "Todavía no guardaste materiales.";
      return;
    }
    const rows = data.map(item => {
      const row = document.createElement("article");
      row.className = "account-request-row";
      const name = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.title;
      name.append(title);
      if (item.category) {
        const category = document.createElement("small");
        category.textContent = item.category;
        name.append(category);
      }
      const budget = document.createElement("span");
      budget.textContent = item.min_price != null && item.max_price != null
        ? formatPrice(item.min_price) + " a " + formatPrice(item.max_price)
        : item.max_price != null ? "Hasta " + formatPrice(item.max_price)
        : item.min_price != null ? "Desde " + formatPrice(item.min_price) : "Sin presupuesto";
      const badge = document.createElement("span");
      badge.className = "account-request-badge";
      badge.textContent = item.match_paused ? "Pausado" : "Consultando…";
      row.append(name, budget, badge);
      if (!item.match_paused) {
        void Promise.resolve(client.rpc("colego_match_results", { p_wanted: item.id })).then(({ data, error }) => {
          if (error) throw error;
          if (!data?.length) {
            badge.textContent = "Buscando";
            return;
          }
          badge.textContent = "Coincidencia encontrada";
          badge.dataset.found = "true";
          const link = document.createElement("a");
          link.href = "/producto?id=" + encodeURIComponent(data[0].id);
          link.textContent = "Ver coincidencia";
          row.append(link);
        }).catch(() => { badge.textContent = "Coincidencias no disponibles"; });
      }
      return row;
    });
    list.replaceChildren(...rows);
  } catch (_) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Volver a intentar";
    retry.addEventListener("click", () => void renderAccountRequests());
    list.replaceChildren("No pudimos cargar tus pedidos. ", retry);
  }
}

function updateSectionUi() {
  const meta = sectionMeta[state.currentSection] || sectionMeta.publications;
  const showsPublicationContent = state.currentSection === "publications" || state.currentSection === "sales";
  const showsSettings = state.currentSection === "settings";
  const showsProfile = state.currentSection === "profile";
  const showsRequests = state.currentSection === "requests";
  const showsBilling = state.currentSection === "billing";
  document.getElementById("datos-cobro").hidden = !showsBilling;
  if (showsBilling) document.getElementById("account-billing-link").setAttribute("aria-current", "page");
  else document.getElementById("account-billing-link").removeAttribute("aria-current");
  document.body.dataset.accountView = state.currentSection;
  document.getElementById("account-requests").hidden = !showsRequests;
  sectionTitle.closest(".content-header").hidden = showsProfile || showsSettings || showsRequests || showsBilling;

  sectionTitle.textContent = meta.title;
  sectionDescription.textContent = meta.description;

  dashboardOverview.hidden = !showsPublicationContent;
  publicationPanel.hidden = !showsPublicationContent;
  securityBanner.hidden = !showsPublicationContent;
  utilityPanel.hidden = showsPublicationContent || showsSettings || showsProfile || showsRequests || showsBilling;
  settingsPanel.hidden = !showsProfile;
  accountPreferences.hidden = !showsSettings;
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
              <p>No podés publicar ni iniciar conversaciones mientras tu cuenta esté restringida. Contactá al equipo administrador de ColeGo.</p>
            </article>
          `
          : verificationStatus === "verified"
            ? `
              <article class="verification-action-card">
                <p class="section-kicker">Todo listo</p>
                <h3>Tu acceso está habilitado</h3>
                <p>La verificación pertenece a ${escapeHtml(profile.school_name || "tu colegio")}. Si cambiás de colegio, vas a tener que verificarlo nuevamente.</p>
                <a class="verification-primary-action" href="/colegio?code=${encodeURIComponent(profile.school_code || "")}">Ir a Mi colegio</a>
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
      actionHref: "/",
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
                  transaction.product?.title || "Producto de ColeGo"
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
                <a href="/mensajes?id=${encodeURIComponent(
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
  const quickActions = fragment.querySelector(".publication-quick-actions");
  const edit = document.createElement("a");
  edit.href = "/publicar?edit=" + encodeURIComponent(item.id);
  edit.textContent = "Editar";
  edit.addEventListener("click", (event) => event.stopPropagation());
  if (item.status === "available") {
    const pause = document.createElement("button");
    pause.type = "button";
    pause.textContent = "Pausar";
    pause.addEventListener("click", (event) => {
      event.stopPropagation();
      void updateProductStatus(item.id, "paused", pause);
    });
    quickActions.append(pause);
  }
  quickActions.append(edit);

  if (thumb) {
    thumb.innerHTML = `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:18px;">`;
    const image = thumb.querySelector("img");
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };
  }

  const listingLink = document.createElement("a");
  listingLink.href = "/producto?id=" + encodeURIComponent(item.id);
  listingLink.textContent = item.title;
  title.append(listingLink);
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
  dropdown.insertAdjacentHTML("beforeend", '<button type="button" role="menuitem" data-delete-action>Eliminar publicación</button>');
  if (state.currentSection === "publications") {
    card.insertBefore(price, quickActions.parentElement);
    subline.after(published);
    const detailText = [subline.textContent, item.published,
      item.moderationStatus !== "approved" ? moderationLabel : ""].filter(Boolean).join(" · ");
    published.textContent = detailText;
    subline.hidden = true;
    condition.hidden = true;
    edit.setAttribute("aria-label", "Editar publicación");
    edit.title = "Editar publicación";
    edit.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg>';
    const pause = quickActions.querySelector("button");
    if (pause) pause.insertAdjacentHTML("afterbegin", '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="3" height="16" rx="1"/><rect x="15" y="4" width="3" height="16" rx="1"/></svg>');
    const activity = document.createElement("div");
    activity.className = "publication-menu-activity";
    activity.setAttribute("role", "presentation");
    activity.textContent = [
      item.visits + (item.visits === 1 ? " visita" : " vistas"),
      item.favorites + (item.favorites === 1 ? " favorito" : " favoritos"),
      item.messages + (item.messages === 1 ? " mensaje" : " mensajes")
    ].join(" · ");
    for (const stat of stats) stat.remove();
    dropdown.append(activity);
  }

  card.addEventListener("click", (event) => {
    if (event.target.closest(".publication-menu, a")) {
      return;
    }

    window.location.href = `/producto?id=${encodeURIComponent(item.id)}`;
  });

  menuTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = dropdown.hidden;
    closeMenusExcept(dropdown);
    dropdown.hidden = !willOpen;
    card.classList.toggle("is-menu-open", willOpen);
    menuTrigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) dropdown.querySelector("button")?.focus();
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
    window.location.href = `/publicar?edit=${encodeURIComponent(item.id)}`;
  });

  dropdown.querySelector("[data-delete-action]").addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!window.confirm("¿Querés eliminar esta publicación?")) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const { error } = await window.colegioLibreSupabase.rpc("delete_own_listing", { p_product_id: item.id });
      if (error) throw error;
      await hydrateDashboard(state.currentUser.id);
      renderCounts();
      renderDashboard();
      renderCurrentSection();
      showToast("Publicación eliminada.");
    } catch (error) {
      const code = String(error?.message || "");
      showToast(code.includes("LISTING_HAS_ORDERS")
        ? "Esta publicación tiene un pedido asociado y se conserva en tu historial."
        : "No pudimos eliminar la publicación. Volvé a intentar.");
    } finally {
      button.disabled = false;
    }
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
    "settings",
    "billing",
    "requests",
    "profile"
  ]);
  state.currentSection = allowedViews.has(nextSection) ? nextSection : "profile";

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
  if (state.currentSection === "profile") {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", state.currentSection);
  }
  url.searchParams.delete("section");
  if (url.hash === "#datos-cobro") url.hash = "";

  history.replaceState(null, "", url.pathname + url.search + url.hash);
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

async function sendSettingsPasswordLink() {
  const status = document.getElementById("settings-password-status");
  const email = state.currentUser?.email;
  if (!email) {
    status.textContent = "Tu cuenta no tiene un correo asociado.";
    return;
  }
  settingsPasswordButton.disabled = true;
  status.textContent = "Enviando el enlace…";
  try {
    const base = window.colegioLibreConfig?.publicSiteUrl || "https://www.colego.com.ar";
    sessionStorage.setItem("colegiolibre-recovery-next", "/perfil?view=settings");
    const { error } = await window.colegioLibreSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/recovery-callback", base).href
    });
    if (error) throw error;
    status.textContent = "Te enviamos un enlace a tu correo para cambiar la contraseña.";
  } catch (_) {
    status.textContent = "No pudimos enviar el enlace. Volvé a intentar en un momento.";
  } finally {
    settingsPasswordButton.disabled = false;
  }
}

function bindEmailChange() {
  const button = document.getElementById("settings-email-button");
  const form = document.getElementById("settings-email-change");
  const input = document.getElementById("settings-new-email");
  const status = document.getElementById("settings-email-status");
  if (!button || !form || !input || !status) return;
  button.addEventListener("click", () => {
    form.hidden = !form.hidden;
    button.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) input.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (email.toLowerCase() === state.currentUser?.email?.toLowerCase()) {
      status.textContent = "Ese correo ya está asociado a tu cuenta.";
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = "Solicitando el cambio…";
    try {
      const base = window.colegioLibreConfig?.publicSiteUrl || "https://www.colego.com.ar";
      const { error } = await window.colegioLibreSupabase.auth.updateUser({ email }, {
        emailRedirectTo: new URL("/auth-callback", base).href
      });
      if (error) throw error;
      form.reset();
      form.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.focus();
      status.textContent = "Revisá tus correos y seguí las instrucciones de confirmación.";
    } catch (_) {
      status.textContent = "No pudimos solicitar el cambio. Revisá el correo o volvé a intentar más tarde.";
    } finally {
      submit.disabled = false;
    }
  });
}

function bindEvents() {
  bindEmailChange();
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
      const trigger = document.querySelector(".publication-menu__trigger[aria-expanded=true]");
      closeMenusExcept(null);
      trigger?.focus();
    }
  });

  document.querySelectorAll(".search-bar").forEach((searchForm) => {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = searchForm.querySelector('input[type="search"]');
      const term = input?.value.trim();
      const url = term ? `/?search=${encodeURIComponent(term)}` : "/";
      window.location.href = url;
    });
  });

  settingsForm?.addEventListener("submit", handleSettingsSubmit);
  settingsPasswordButton?.addEventListener("click", sendSettingsPasswordLink);
  settingsDeactivateButton?.addEventListener("click", handleAccountDeactivation);
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
      zoneCode = school.zone_code || school.city || school.province || null;
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

  window.location.href = "/";
}

async function handleAccountDeactivation() {
  const firstConfirmation = window.confirm(
    "¿Querés desactivar tu cuenta? Tus publicaciones activas se pausarán y se eliminarán tus favoritos."
  );
  if (!firstConfirmation) return;

  const confirmationText = window.prompt(
    'Para confirmar, escribí "DESACTIVAR".'
  );
  if (confirmationText !== "DESACTIVAR") {
    showToast("La cuenta no fue desactivada.");
    return;
  }

  settingsDeactivateButton.disabled = true;
  settingsDeactivateButton.textContent = "Desactivando...";

  const { error } = await window.colegioLibreSupabase.rpc(
    "deactivate_own_account"
  );

  if (error) {
    console.error("Error desactivando cuenta:", error);
    settingsDeactivateButton.disabled = false;
    settingsDeactivateButton.textContent = "Desactivar cuenta";
    showToast(
      error.message ||
        "No se pudo desactivar la cuenta. Ejecutá primero el archivo SQL 8."
    );
    return;
  }

  await window.colegioLibreSupabase.auth.signOut();
  window.location.replace("/");
}

})();
