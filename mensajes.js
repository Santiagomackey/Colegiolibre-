(function () {
  "use strict";

  const {
    FALLBACK_PRODUCT_IMAGE,
    escapeHtml,
    formatDateTime,
    formatPrice,
    formatRelativeDate,
    getCurrentProfile,
    getCurrentUser,
    getInitials,
    getStatusLabel,
    safeProductRecord
  } = window.colegioLibreApi;

  const params = new URLSearchParams(window.location.search);
  const requestedConversationId =
    params.get("id") || params.get("conversation");

  const elements = {
    accountLink: document.getElementById("messages-account-link"),
    chatAvatar: document.getElementById("chat-avatar"),
    chatSafetyActions: document.getElementById("chat-safety-actions"),
    chatSubtitle: document.getElementById("chat-subtitle"),
    chatTitle: document.getElementById("chat-title"),
    blockUserButton: document.getElementById("block-user-button"),
    conversationList: document.getElementById("conversation-list"),
    conversationSearch: document.getElementById("conversation-search"),
    globalSearchForm: document.getElementById("global-search-form"),
    globalSearchInput: document.getElementById("global-search-input"),
    inboxCount: document.getElementById("inbox-count"),
    messageCounter: document.getElementById("message-counter"),
    messageForm: document.getElementById("message-form"),
    messageInput: document.getElementById("message-input"),
    messagesList: document.getElementById("messages-list"),
    mobileBackButton: document.getElementById("mobile-back-button"),
    productPanel: document.getElementById("product-panel"),
    reportConversationButton: document.getElementById("report-conversation-button"),
    reportModal: document.getElementById("conversation-report-modal"),
    reportBackdrop: document.getElementById("conversation-report-backdrop"),
    reportClose: document.getElementById("conversation-report-close"),
    reportCancel: document.getElementById("conversation-report-cancel"),
    reportForm: document.getElementById("conversation-report-form"),
    reportReason: document.getElementById("conversation-report-reason"),
    reportDetails: document.getElementById("conversation-report-details"),
    sendButton: document.querySelector("#message-form button"),
    toast: document.getElementById("messages-toast"),
    typingIndicator: document.getElementById("typing-indicator")
  };

  const state = {
    activeConversationId: null,
    activeMessages: [],
    conversations: [],
    currentUser: null,
    databaseChannel: null,
    readAtSupported: true,
    searchTerm: "",
    sending: false,
    typingChannel: null,
    typingHideTimer: null,
    typingStopTimer: null,
    userBlocked: false
  };

  initMessagesPage();

  async function initMessagesPage() {
    bindEvents();

    state.currentUser = await getCurrentUser(true);
    const destination = `mensajes.html${window.location.search}`;

    if (!state.currentUser) {
      window.location.replace(
        `login.html?next=${encodeURIComponent(destination)}`
      );
      return;
    }

    const profile = await getCurrentProfile(true);
    if (!profile?.school_code) {
      window.location.replace(
        `index.html?onboarding=1&next=${encodeURIComponent(destination)}`
      );
      return;
    }

    if (window.colegioLibreApi.isAccountRestricted(profile)) {
      window.location.replace("perfil.html");
      return;
    }

    elements.accountLink.href = "perfil.html";
    await refreshConversations({ preserveSelection: false });

    if (requestedConversationId) {
      await openConversation(requestedConversationId, { pushHistory: false });
    } else {
      renderConversationList();
      renderEmptyChat();
    }

    subscribeDatabaseChanges();
  }

  function bindEvents() {
    elements.globalSearchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const term = elements.globalSearchInput?.value.trim();
      window.location.href = term
        ? `index.html?search=${encodeURIComponent(term)}`
        : "index.html";
    });

    elements.conversationSearch?.addEventListener("input", (event) => {
      state.searchTerm = event.currentTarget.value.trim();
      renderConversationList();
    });

    elements.messageForm?.addEventListener("submit", handleSendMessage);
    elements.messageInput?.addEventListener("input", handleComposerInput);
    elements.messageInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        elements.messageForm.requestSubmit();
      }
    });

    elements.mobileBackButton?.addEventListener("click", () => {
      document.body.dataset.view = "list";
    });

    elements.reportConversationButton?.addEventListener(
      "click",
      openConversationReport
    );
    elements.reportBackdrop?.addEventListener("click", closeConversationReport);
    elements.reportClose?.addEventListener("click", closeConversationReport);
    elements.reportCancel?.addEventListener("click", closeConversationReport);
    elements.reportForm?.addEventListener("submit", submitConversationReport);
    elements.blockUserButton?.addEventListener("click", toggleActiveUserBlock);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.reportModal?.hidden) {
        closeConversationReport();
      }
    });

    window.addEventListener("beforeunload", cleanRealtimeChannels);
  }

  async function refreshConversations({ preserveSelection = true } = {}) {
    const { data, error } = await window.colegioLibreSupabase
      .from("conversations")
      .select("*")
      .not("seller_id", "is", null)
      .or(
        `buyer_id.eq.${state.currentUser.id},seller_id.eq.${state.currentUser.id}`
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando conversaciones:", error);
      state.conversations = [];
      renderConversationList();
      if (!preserveSelection) {
        renderEmptyChat("No se pudieron cargar tus conversaciones.");
      }
      return;
    }

    const uniqueRows = dedupeConversations(data || []);
    if (!uniqueRows.length) {
      state.conversations = [];
      state.activeConversationId = null;
      renderConversationList();
      renderEmptyChat("Todavía no tenés conversaciones activas.");
      renderProductPlaceholder();
      setComposerEnabled(false);
      return;
    }

    state.conversations = await loadConversationRelations(uniqueRows);

    if (preserveSelection && state.activeConversationId) {
      const exists = state.conversations.some(
        (conversation) => conversation.id === state.activeConversationId
      );
      if (!exists) {
        state.activeConversationId = null;
        renderEmptyChat();
        renderProductPlaceholder();
        setComposerEnabled(false);
      }
    }

    renderConversationList();
  }

  function dedupeConversations(rows) {
    const registry = new Map();

    rows
      .filter((row) => row.product_id && row.buyer_id && row.seller_id)
      .forEach((row) => {
        const key = [row.product_id, row.buyer_id, row.seller_id].join("|");
        const previous = registry.get(key);
        if (!previous || getConversationSortTime(row) >= getConversationSortTime(previous)) {
          registry.set(key, row);
        }
      });

    return Array.from(registry.values());
  }

  function getConversationSortTime(conversation) {
    return new Date(
      conversation.last_message_at ||
        conversation.updated_at ||
        conversation.created_at ||
        0
    ).getTime();
  }

  async function loadConversationRelations(rows) {
    const otherUserIds = Array.from(
      new Set(rows.map(getOtherUserId).filter(Boolean))
    );
    const productIds = Array.from(
      new Set(rows.map((row) => row.product_id).filter(Boolean))
    );
    const conversationIds = rows.map((row) => row.id);

    const [profilesResponse, productsResponse, messagesResponse, unreadMap] =
      await Promise.all([
        otherUserIds.length
          ? window.colegioLibreSupabase
              .from("profiles")
              .select("id, name, school_name, zone_code")
              .in("id", otherUserIds)
          : Promise.resolve({ data: [] }),
        productIds.length
          ? window.colegioLibreSupabase
              .from("products")
              .select("*")
              .in("id", productIds)
          : Promise.resolve({ data: [] }),
        fetchLastMessages(conversationIds),
        fetchUnreadCounts(conversationIds)
      ]);

    if (profilesResponse.error) {
      console.warn("No se pudieron cargar algunos perfiles:", profilesResponse.error);
    }
    if (productsResponse.error) {
      console.warn("No se pudieron cargar algunos productos:", productsResponse.error);
    }

    const profilesById = new Map(
      (profilesResponse.data || []).map((profile) => [profile.id, profile])
    );
    const productsById = new Map(
      (productsResponse.data || []).map((product) => [
        product.id,
        safeProductRecord(product)
      ])
    );
    const lastMessageByConversation = new Map();

    (messagesResponse || []).forEach((message) => {
      if (!lastMessageByConversation.has(message.conversation_id)) {
        lastMessageByConversation.set(message.conversation_id, message);
      }
    });

    return rows
      .map((row) => {
        const lastMessage = lastMessageByConversation.get(row.id) || null;
        return {
          ...row,
          lastMessage,
          otherProfile: profilesById.get(getOtherUserId(row)) || null,
          product: productsById.get(row.product_id) || null,
          sortAt:
            lastMessage?.created_at ||
            row.last_message_at ||
            row.updated_at ||
            row.created_at,
          unreadCount: unreadMap.get(row.id) || 0
        };
      })
      .sort(
        (left, right) =>
          new Date(right.sortAt || 0) - new Date(left.sortAt || 0)
      );
  }

  async function fetchLastMessages(conversationIds) {
    if (!conversationIds.length) return [];

    const columns = state.readAtSupported
      ? "id, conversation_id, body, created_at, sender_id, read_at"
      : "id, conversation_id, body, created_at, sender_id";
    const response = await window.colegioLibreSupabase
      .from("messages")
      .select(columns)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    if (
      response.error &&
      state.readAtSupported &&
      isMissingColumnError(response.error, "read_at")
    ) {
      state.readAtSupported = false;
      return fetchLastMessages(conversationIds);
    }

    if (response.error) {
      console.error("Error cargando últimos mensajes:", response.error);
      return [];
    }

    return response.data || [];
  }

  async function fetchUnreadCounts(conversationIds) {
    const registry = new Map();
    if (!conversationIds.length || !state.readAtSupported) return registry;

    const { data, error } = await window.colegioLibreSupabase
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .neq("sender_id", state.currentUser.id)
      .is("read_at", null);

    if (error) {
      if (isMissingColumnError(error, "read_at")) {
        state.readAtSupported = false;
      } else {
        console.error("Error cargando mensajes no leídos:", error);
      }
      return registry;
    }

    (data || []).forEach((message) => {
      registry.set(
        message.conversation_id,
        (registry.get(message.conversation_id) || 0) + 1
      );
    });

    return registry;
  }

  function getOtherUserId(conversation) {
    return conversation.buyer_id === state.currentUser.id
      ? conversation.seller_id
      : conversation.buyer_id;
  }

  function getConversationName(conversation) {
    if (conversation.otherProfile?.name) return conversation.otherProfile.name;
    if (conversation.buyer_id === state.currentUser.id) {
      return conversation.product?.seller_name || "Vendedor";
    }
    return "Comprador";
  }

  function getConversationSchool(conversation) {
    return (
      conversation.otherProfile?.school_name ||
      conversation.product?.school_name ||
      "Colegio no especificado"
    );
  }

  function renderConversationList() {
    const query = normalize(state.searchTerm);
    const filtered = state.conversations.filter((conversation) => {
      const haystack = normalize(
        `${getConversationName(conversation)} ${getConversationSchool(conversation)} ${conversation.product?.title || ""} ${conversation.lastMessage?.body || ""}`
      );
      return !query || haystack.includes(query);
    });

    const totalUnread = state.conversations.reduce(
      (total, conversation) => total + Number(conversation.unreadCount || 0),
      0
    );
    elements.inboxCount.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    elements.inboxCount.hidden = totalUnread === 0;
    elements.conversationList.innerHTML = "";

    if (!filtered.length) {
      elements.conversationList.innerHTML = `
        <div class="conversation-empty">
          <strong>No hay conversaciones para mostrar.</strong>
          <span>Probá con otro término o iniciá una desde un producto.</span>
        </div>
      `;
      return;
    }

    filtered.forEach((conversation) => {
      const unreadCount = Number(conversation.unreadCount || 0);
      const item = document.createElement("button");
      item.type = "button";
      item.className = [
        "conversation-item",
        conversation.id === state.activeConversationId ? "is-active" : "",
        unreadCount ? "has-unread" : ""
      ]
        .filter(Boolean)
        .join(" ");
      item.setAttribute(
        "aria-label",
        `${getConversationName(conversation)}, ${conversation.product?.title || "producto"}${unreadCount ? `, ${unreadCount} sin leer` : ""}`
      );
      item.innerHTML = `
        <div class="conversation-avatar">${escapeHtml(
          getInitials(getConversationName(conversation))
        )}</div>
        <div class="conversation-copy">
          <div class="conversation-row">
            <p class="conversation-title">${escapeHtml(
              getConversationName(conversation)
            )}</p>
            <div class="conversation-time-wrap">
              <span class="conversation-time">${escapeHtml(
                formatConversationTime(
                  conversation.lastMessage?.created_at || conversation.created_at
                )
              )}</span>
              ${
                unreadCount
                  ? `<span class="conversation-unread">${unreadCount > 99 ? "99+" : unreadCount}</span>`
                  : ""
              }
            </div>
          </div>
          <p class="conversation-school">${escapeHtml(
            getConversationSchool(conversation)
          )}</p>
          <p class="conversation-product">${escapeHtml(
            conversation.product?.title || "Producto no disponible"
          )}</p>
          <p class="conversation-last">${escapeHtml(
            conversation.lastMessage?.body ||
              "Todavía no hay mensajes en esta conversación."
          )}</p>
        </div>
      `;
      item.addEventListener("click", () => openConversation(conversation.id));
      elements.conversationList.appendChild(item);
    });
  }

  async function openConversation(conversationId, { pushHistory = true } = {}) {
    if (!conversationId) return;

    let conversation = state.conversations.find(
      (item) => item.id === conversationId
    );

    if (!conversation) {
      const { data, error } = await window.colegioLibreSupabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .maybeSingle();

      if (error || !data) {
        console.error("Error cargando conversación:", error);
        showToast("No se pudo abrir la conversación.");
        return;
      }

      if (
        data.buyer_id !== state.currentUser.id &&
        data.seller_id !== state.currentUser.id
      ) {
        showToast("No tenés acceso a esta conversación.");
        return;
      }

      conversation = (await loadConversationRelations([data]))[0] || null;
      if (conversation) state.conversations.unshift(conversation);
    }

    if (!conversation) {
      showToast("No se encontró la conversación.");
      return;
    }

    state.activeConversationId = conversation.id;
    if (pushHistory) {
      history.replaceState(
        null,
        "",
        `mensajes.html?id=${encodeURIComponent(conversation.id)}`
      );
    }

    renderConversationList();
    renderConversationHeader(conversation);
    renderProductPanel(conversation);
    setComposerEnabled(true);
    document.body.dataset.view = "chat";
    await subscribeTyping(conversation.id);
    await loadMessages(conversation.id);
    await markConversationNotificationsRead(conversation.id);
  }

  function renderConversationHeader(conversation) {
    const name = getConversationName(conversation);
    elements.chatAvatar.textContent = getInitials(name);
    elements.chatTitle.textContent = name;
    elements.chatSubtitle.textContent = getConversationSchool(conversation);
    elements.typingIndicator.hidden = true;
    elements.chatSafetyActions.hidden = false;
    void hydrateBlockState(conversation);
  }

  function renderProductPanel(conversation) {
    const product = conversation.product;
    if (!product) {
      renderProductPlaceholder("El producto asociado ya no está disponible.");
      return;
    }

    const isSeller = conversation.seller_id === state.currentUser.id;
    const ownerActions = isSeller
      ? buildOwnerProductActions(product, conversation)
      : "";

    elements.productPanel.innerHTML = `
      <article class="product-card">
        <div class="product-card__media">
          <span class="product-card__status" data-status="${escapeHtml(
            product.status
          )}">${escapeHtml(getStatusLabel(product.status))}</span>
          <img src="${escapeHtml(
            product.image_url || FALLBACK_PRODUCT_IMAGE
          )}" alt="${escapeHtml(product.title)}" />
        </div>
        <div class="product-card__body">
          <h3>${escapeHtml(product.title)}</h3>
          <p class="product-card__price">${escapeHtml(
            formatPrice(product.price)
          )}</p>
          <div class="product-card__meta">
            <p class="product-card__school">
              <svg class="icon"><use href="#icon-message"></use></svg>
              ${escapeHtml(product.school_name || "Colegio no especificado")}
            </p>
            <p class="product-card__location">
              <svg class="icon"><use href="#icon-pin"></use></svg>
              ${escapeHtml(product.location)}
            </p>
            <p class="product-card__location">
              <svg class="icon"><use href="#icon-clock"></use></svg>
              ${escapeHtml(formatRelativeDate(product.created_at))}
            </p>
          </div>
        </div>
        <div class="product-card__actions">
          ${ownerActions}
          <a class="view-product-link" href="producto.html?id=${encodeURIComponent(
            product.id
          )}">
            <span>Ver producto</span>
            <svg class="icon"><use href="#icon-open"></use></svg>
          </a>
        </div>
        <div class="conversation-trust" id="conversation-trust-panel"></div>
      </article>
    `;

    const image = elements.productPanel.querySelector("img");
    image.onerror = () => {
      image.src = FALLBACK_PRODUCT_IMAGE;
    };

    elements.productPanel
      .querySelectorAll("[data-product-status]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          updateProductStatus(conversation, button.dataset.productStatus)
        );
      });

    void hydrateConversationTrust(conversation);
  }

  function buildOwnerProductActions(product, conversation) {
    if (product.status === "sold") {
      return `
        <div class="product-owner-actions">
          <button class="product-status-action product-status-action--primary" type="button" data-product-status="available">
            Volver a publicar
          </button>
        </div>
      `;
    }

    if (product.status === "reserved") {
      if (
        product.reserved_for &&
        product.reserved_for !== conversation.buyer_id
      ) {
        return `
          <div class="trust-status-card">
            <strong>Reservado para otro comprador</strong>
            <span>Abrí la conversación correcta para administrar esa reserva.</span>
          </div>
        `;
      }

      return `
        <div class="product-owner-actions">
          <button class="product-status-action" type="button" data-product-status="available">
            Quitar reserva
          </button>
          <button class="product-status-action product-status-action--danger" type="button" data-product-status="sold">
            Marcar vendido
          </button>
        </div>
      `;
    }

    if (product.status === "available") {
      return `
        <div class="product-owner-actions">
          <button class="product-status-action product-status-action--primary" type="button" data-product-status="reserved">
            Reservar
          </button>
          <button class="product-status-action product-status-action--danger" type="button" data-product-status="sold">
            Marcar vendido
          </button>
        </div>
      `;
    }

    if (product.status === "paused") {
      return `
        <div class="product-owner-actions">
          <button class="product-status-action product-status-action--primary" type="button" data-product-status="available">
            Reactivar
          </button>
          <button class="product-status-action product-status-action--danger" type="button" data-product-status="sold">
            Marcar vendido
          </button>
        </div>
      `;
    }

    return "";
  }

  async function updateProductStatus(conversation, nextStatus) {
    if (conversation.seller_id !== state.currentUser.id || !conversation.product) {
      showToast("Solo el vendedor puede cambiar el estado.");
      return;
    }

    const confirmations = {
      available: "¿Querés volver a mostrar este producto como disponible?",
      reserved: "¿Querés reservar este producto para este comprador?",
      sold: "¿Confirmás que el producto fue vendido?"
    };
    if (!window.confirm(confirmations[nextStatus])) return;

    const buttons = elements.productPanel.querySelectorAll(
      "[data-product-status]"
    );
    buttons.forEach((button) => {
      button.disabled = true;
    });

    let response;

    if (nextStatus === "reserved") {
      response = await window.colegioLibreSupabase.rpc(
        "reserve_product_for_conversation",
        { target_conversation: conversation.id }
      );
    } else if (nextStatus === "sold") {
      response = await window.colegioLibreSupabase.rpc(
        "complete_sale_for_conversation",
        { target_conversation: conversation.id }
      );
    } else if (
      nextStatus === "available" &&
      conversation.product.status === "reserved"
    ) {
      response = await window.colegioLibreSupabase.rpc(
        "cancel_product_reservation",
        { target_conversation: conversation.id }
      );
    } else if (
      nextStatus === "available" &&
      conversation.product.status === "sold"
    ) {
      response = await window.colegioLibreSupabase.rpc(
        "reopen_product_listing",
        { target_product: conversation.product.id }
      );
    } else {
      response = await window.colegioLibreSupabase
        .from("products")
        .update({
          status: nextStatus,
          reserved_for: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", conversation.product.id)
        .eq("user_id", state.currentUser.id)
        .select("*")
        .single();
    }

    const { data, error } = response;

    if (error) {
      console.error("Error cambiando estado:", error);
      showToast(error.message || "No se pudo cambiar el estado del producto.");
      buttons.forEach((button) => {
        button.disabled = false;
      });
      return;
    }

    const productData = Array.isArray(data) ? data[0] : data;
    conversation.product = safeProductRecord(productData);
    renderProductPanel(conversation);
    showToast(
      nextStatus === "reserved"
        ? "Producto reservado."
        : nextStatus === "sold"
          ? "Producto marcado como vendido."
          : "Producto disponible nuevamente."
    );
  }

  async function hydrateConversationTrust(conversation) {
    const panel = elements.productPanel.querySelector(
      "#conversation-trust-panel"
    );
    if (!panel || !conversation.product) return;

    if (conversation.product.status === "reserved") {
      panel.innerHTML = `
        <div class="trust-status-card">
          <strong>Reserva registrada</strong>
          <span>
            ColegioLibre no procesa pagos. Revisen el producto y coordinen el
            intercambio en un lugar seguro.
          </span>
        </div>
      `;
      return;
    }

    if (conversation.product.status !== "sold") {
      panel.innerHTML = `
        <div class="trust-status-card">
          <strong>Intercambio sin pagos dentro de la plataforma</strong>
          <span>
            No envíes dinero por adelantado. Usá este chat para coordinar y
            revisá el producto antes de pagar.
          </span>
        </div>
      `;
      return;
    }

    const { data: transaction, error: transactionError } =
      await window.colegioLibreSupabase
        .from("transactions")
        .select("id, buyer_id, seller_id, status, completed_at")
        .eq("conversation_id", conversation.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (transactionError || !transaction) {
      panel.innerHTML = `
        <div class="trust-status-card trust-status-card--complete">
          <strong>Venta finalizada</strong>
          <span>La operación quedó marcada como completada.</span>
        </div>
      `;
      return;
    }

    const { data: ownReview } = await window.colegioLibreSupabase
      .from("reviews")
      .select("id, rating, comment")
      .eq("transaction_id", transaction.id)
      .eq("reviewer_id", state.currentUser.id)
      .maybeSingle();

    if (ownReview) {
      panel.innerHTML = `
        <div class="trust-status-card trust-status-card--complete">
          <strong>Gracias por calificar esta operación</strong>
          <span>Tu calificación: ${"★".repeat(
            Number(ownReview.rating || 0)
          )}${"☆".repeat(5 - Number(ownReview.rating || 0))}</span>
        </div>
      `;
      return;
    }

    const reviewedName = getConversationName(conversation);
    const inputName = `review-rating-${transaction.id}`;
    panel.innerHTML = `
      <div class="trust-status-card trust-status-card--complete">
        <strong>Venta finalizada</strong>
        <span>Calificá tu experiencia con ${escapeHtml(reviewedName)}.</span>
        <form class="review-form" data-review-form data-transaction-id="${escapeHtml(
          transaction.id
        )}">
          <div class="review-form__stars" aria-label="Calificación">
            ${[5, 4, 3, 2, 1]
              .map(
                (rating) => `
                  <input
                    id="${inputName}-${rating}"
                    name="${inputName}"
                    type="radio"
                    value="${rating}"
                    ${rating === 5 ? "required" : ""}
                  />
                  <label for="${inputName}-${rating}" aria-label="${rating} estrellas">★</label>
                `
              )
              .join("")}
          </div>
          <textarea
            maxlength="500"
            data-review-comment
            placeholder="Comentario opcional (máximo 500 caracteres)"
          ></textarea>
          <button type="submit">Enviar calificación</button>
        </form>
      </div>
    `;

    panel
      .querySelector("[data-review-form]")
      ?.addEventListener("submit", (event) =>
        submitReview(event, conversation)
      );
  }

  async function submitReview(event, conversation) {
    event.preventDefault();
    const form = event.currentTarget;
    const rating = Number(
      new FormData(form).get(`review-rating-${form.dataset.transactionId}`)
    );
    const comment = form.querySelector("[data-review-comment]")?.value.trim();
    const submitButton = form.querySelector('button[type="submit"]');

    if (!rating) {
      showToast("Elegí una calificación de 1 a 5 estrellas.");
      return;
    }

    submitButton.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "submit_transaction_review",
      {
        target_transaction: form.dataset.transactionId,
        selected_rating: rating,
        review_comment: comment || null
      }
    );

    if (error) {
      console.error("Error enviando calificación:", error);
      showToast(error.message || "No se pudo enviar la calificación.");
      submitButton.disabled = false;
      return;
    }

    showToast("Calificación enviada. ¡Gracias!");
    await hydrateConversationTrust(conversation);
  }

  function getActiveConversation() {
    return state.conversations.find(
      (conversation) => conversation.id === state.activeConversationId
    );
  }

  async function hydrateBlockState(conversation) {
    const otherUserId = getOtherUserId(conversation);
    const { data, error } = await window.colegioLibreSupabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", state.currentUser.id)
      .eq("blocked_id", otherUserId)
      .maybeSingle();

    state.userBlocked = !error && Boolean(data);
    elements.blockUserButton.dataset.blocked = String(state.userBlocked);
    elements.blockUserButton.querySelector("span").textContent =
      state.userBlocked ? "Desbloquear" : "Bloquear";

    if (
      conversation.id === state.activeConversationId &&
      state.userBlocked
    ) {
      setComposerEnabled(false);
      elements.messageInput.placeholder = "Desbloqueá al usuario para volver a escribir.";
    } else if (conversation.id === state.activeConversationId) {
      setComposerEnabled(true);
      elements.messageInput.placeholder = "Escribí un mensaje...";
    }
  }

  async function toggleActiveUserBlock() {
    const conversation = getActiveConversation();
    if (!conversation) return;

    const otherUserId = getOtherUserId(conversation);
    const action = state.userBlocked ? "unblock_user" : "block_user";
    const question = state.userBlocked
      ? "¿Querés desbloquear a este usuario?"
      : "¿Querés bloquear a este usuario? No podrán seguir enviándose mensajes.";

    if (!window.confirm(question)) return;

    elements.blockUserButton.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(action, {
      target_user: otherUserId
    });
    elements.blockUserButton.disabled = false;

    if (error) {
      console.error("Error actualizando bloqueo:", error);
      showToast(error.message || "No se pudo actualizar el bloqueo.");
      return;
    }

    state.userBlocked = !state.userBlocked;
    await hydrateBlockState(conversation);
    showToast(state.userBlocked ? "Usuario bloqueado." : "Usuario desbloqueado.");
  }

  function openConversationReport() {
    if (!getActiveConversation()) return;
    elements.reportModal.hidden = false;
    document.body.style.overflow = "hidden";
    elements.reportReason.focus();
  }

  function closeConversationReport() {
    elements.reportModal.hidden = true;
    document.body.style.overflow = "";
    elements.reportForm.reset();
  }

  async function submitConversationReport(event) {
    event.preventDefault();
    const conversation = getActiveConversation();
    if (!conversation) return;

    const submitButton = elements.reportForm.querySelector(
      'button[type="submit"]'
    );
    submitButton.disabled = true;

    const { error } = await window.colegioLibreSupabase.rpc(
      "create_safety_report",
      {
        selected_target_type: "conversation",
        selected_target_id: conversation.id,
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

    closeConversationReport();
    showToast("Reporte enviado. Gracias por avisarnos.");
  }

  function renderProductPlaceholder(
    message = "Cuando abras un chat, vas a ver acá el material asociado."
  ) {
    elements.productPanel.innerHTML = `
      <div class="product-empty">
        <strong>Producto de la conversación</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  async function loadMessages(conversationId) {
    const columns = state.readAtSupported ? "*" : "id, conversation_id, sender_id, body, created_at";
    const { data, error } = await window.colegioLibreSupabase
      .from("messages")
      .select(columns)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (
      error &&
      state.readAtSupported &&
      isMissingColumnError(error, "read_at")
    ) {
      state.readAtSupported = false;
      await loadMessages(conversationId);
      return;
    }

    if (error) {
      console.error("Error cargando mensajes:", error);
      renderEmptyChat("No se pudieron cargar los mensajes.");
      return;
    }

    state.activeMessages = data || [];
    await markConversationRead(conversationId);
    renderMessages();
  }

  async function markConversationRead(conversationId) {
    if (!state.readAtSupported) return;

    const readAt = new Date().toISOString();
    const { error } = await window.colegioLibreSupabase
      .from("messages")
      .update({ read_at: readAt })
      .eq("conversation_id", conversationId)
      .neq("sender_id", state.currentUser.id)
      .is("read_at", null);

    if (error) {
      if (isMissingColumnError(error, "read_at")) {
        state.readAtSupported = false;
      } else {
        console.error("Error marcando mensajes como leídos:", error);
      }
      return;
    }

    state.activeMessages = state.activeMessages.map((message) =>
      message.sender_id !== state.currentUser.id && !message.read_at
        ? { ...message, read_at: readAt }
        : message
    );

    const activeConversation = state.conversations.find(
      (conversation) => conversation.id === conversationId
    );
    if (activeConversation) activeConversation.unreadCount = 0;
    renderConversationList();
  }

  async function markConversationNotificationsRead(conversationId) {
    const { error } = await window.colegioLibreSupabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", state.currentUser.id)
      .eq("conversation_id", conversationId)
      .eq("read", false);

    if (
      error &&
      error.code !== "42P01" &&
      !String(error.message || "").includes("notifications")
    ) {
      console.error("Error actualizando avisos del chat:", error);
      return;
    }

    window.colegioLibreNotifications?.refresh?.();
  }

  function renderMessages() {
    elements.messagesList.innerHTML = "";

    if (!state.activeMessages.length) {
      elements.messagesList.innerHTML = `
        <div class="empty-chat">
          <strong>Todavía no hay mensajes.</strong>
          <span>Escribí el primero para abrir la conversación.</span>
        </div>
      `;
      return;
    }

    const stream = document.createElement("div");
    stream.className = "message-stream";

    state.activeMessages.forEach((message) => {
      const isMine = message.sender_id === state.currentUser.id;
      const article = document.createElement("article");
      article.className = isMine ? "message is-mine" : "message";
      const status = isMine
        ? `<span class="message__status"><svg class="icon"><use href="#icon-check"></use></svg>${
            message.read_at ? "Leído" : "Enviado"
          }</span>`
        : `<span class="message__time">${escapeHtml(
            formatDateTime(message.created_at)
          )}</span>`;
      article.innerHTML = `
        <div class="message__body">${escapeHtml(message.body)}</div>
        ${
          isMine
            ? `<span class="message__time">${escapeHtml(
                formatDateTime(message.created_at)
              )}</span>${status}`
            : status
        }
      `;
      stream.appendChild(article);
    });

    elements.messagesList.appendChild(stream);
    elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
  }

  function renderEmptyChat(
    message = "Elegí un chat de la izquierda para empezar."
  ) {
    elements.chatAvatar.textContent = "?";
    elements.chatTitle.textContent = "Seleccioná una conversación";
    elements.chatSubtitle.textContent = "ColegioLibre";
    elements.typingIndicator.hidden = true;
    elements.chatSafetyActions.hidden = true;
    elements.messagesList.innerHTML = `
      <div class="empty-chat">
        <strong>No hay conversación abierta.</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }

  function setComposerEnabled(enabled) {
    elements.messageInput.disabled = !enabled;
    elements.sendButton.disabled = !enabled;
    if (!enabled) {
      elements.messageInput.value = "";
      updateComposerUi();
    }
  }

  function handleComposerInput() {
    updateComposerUi();
    sendTypingEvent(true);
    window.clearTimeout(state.typingStopTimer);
    state.typingStopTimer = window.setTimeout(() => sendTypingEvent(false), 1100);
  }

  function updateComposerUi() {
    const length = elements.messageInput.value.length;
    elements.messageCounter.textContent = `${length}/2000`;
    elements.messageInput.style.height = "auto";
    elements.messageInput.style.height = `${Math.min(
      elements.messageInput.scrollHeight,
      140
    )}px`;
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    if (!state.activeConversationId || state.sending) return;

    const body = elements.messageInput.value.trim();
    if (!body) return;

    state.sending = true;
    elements.sendButton.disabled = true;
    sendTypingEvent(false);

    const { error } = await window.colegioLibreSupabase.from("messages").insert({
      body,
      conversation_id: state.activeConversationId,
      sender_id: state.currentUser.id
    });

    state.sending = false;
    elements.sendButton.disabled = false;

    if (error) {
      console.error("Error enviando mensaje:", error);
      showToast(
        error.code === "42501"
          ? "No se pueden enviar mensajes en esta conversación."
          : "No se pudo enviar el mensaje."
      );
      return;
    }

    elements.messageInput.value = "";
    updateComposerUi();
    await loadMessages(state.activeConversationId);
    await refreshConversations();
    elements.messageInput.focus();
  }

  function subscribeDatabaseChanges() {
    if (state.databaseChannel) {
      window.colegioLibreSupabase.removeChannel(state.databaseChannel);
    }

    state.databaseChannel = window.colegioLibreSupabase
      .channel(`colegiolibre-inbox-${state.currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const conversationId = payload.new?.conversation_id;
          if (!conversationId) return;

          const known = state.conversations.some(
            (conversation) => conversation.id === conversationId
          );
          if (!known && conversationId !== state.activeConversationId) {
            await refreshConversations();
            return;
          }

          if (conversationId === state.activeConversationId) {
            await loadMessages(conversationId);
            await markConversationNotificationsRead(conversationId);
          }
          await refreshConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        async (payload) => {
          if (payload.new?.conversation_id === state.activeConversationId) {
            await loadMessages(state.activeConversationId);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        async (payload) => {
          const conversation = payload.new;
          if (
            conversation?.buyer_id === state.currentUser.id ||
            conversation?.seller_id === state.currentUser.id
          ) {
            await refreshConversations();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products" },
        async (payload) => {
          const conversation = state.conversations.find(
            (item) => item.product_id === payload.new?.id
          );
          if (!conversation) return;
          conversation.product = safeProductRecord(payload.new);
          if (conversation.id === state.activeConversationId) {
            renderProductPanel(conversation);
          }
        }
      )
      .subscribe();
  }

  async function subscribeTyping(conversationId) {
    if (state.typingChannel) {
      await window.colegioLibreSupabase.removeChannel(state.typingChannel);
    }

    state.typingChannel = window.colegioLibreSupabase
      .channel(`conversation-typing-${conversationId}`, {
        config: { broadcast: { self: false } }
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (
          payload?.userId === state.currentUser.id ||
          conversationId !== state.activeConversationId
        ) {
          return;
        }

        elements.typingIndicator.hidden = !payload?.typing;
        window.clearTimeout(state.typingHideTimer);
        if (payload?.typing) {
          state.typingHideTimer = window.setTimeout(() => {
            elements.typingIndicator.hidden = true;
          }, 1800);
        }
      })
      .subscribe();
  }

  function sendTypingEvent(typing) {
    if (!state.typingChannel || !state.activeConversationId) return;
    state.typingChannel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        typing: Boolean(typing),
        userId: state.currentUser.id
      }
    });
  }

  function cleanRealtimeChannels() {
    sendTypingEvent(false);
    if (state.databaseChannel) {
      window.colegioLibreSupabase.removeChannel(state.databaseChannel);
    }
    if (state.typingChannel) {
      window.colegioLibreSupabase.removeChannel(state.typingChannel);
    }
  }

  function isMissingColumnError(error, columnName) {
    return (
      error?.code === "42703" ||
      String(error?.message || "").includes(`column "${columnName}"`) ||
      String(error?.message || "").includes(columnName)
    );
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function formatConversationTime(dateValue) {
    if (!dateValue) return "";
    const date = new Date(dateValue);
    const now = new Date();
    const sameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    return sameDay
      ? date.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit"
        })
      : date.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit"
        });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 2400);
  }
})();
