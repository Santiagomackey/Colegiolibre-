(function () {
  "use strict";

  const api = window.colegioLibreApi;
  const client = window.colegioLibreSupabase;

  if (!api?.getCurrentUser || !client?.from) return;

  const state = {
    channel: null,
    currentUser: null,
    notifications: [],
    openTrigger: null,
    panel: null,
    triggers: []
  };

  initNotifications();

  async function initNotifications() {
    state.currentUser = await api.getCurrentUser();
    if (!state.currentUser) return;

    injectTriggers();
    createPanel();
    bindGlobalEvents();
    await loadNotifications();
    subscribeRealtime();
  }

  function injectTriggers() {
    const containers = Array.from(document.querySelectorAll(".header-actions"));

    containers.forEach((container) => {
      if (container.querySelector(".cl-notification-trigger")) return;

      const trigger = document.createElement("button");
      trigger.className = "cl-notification-trigger";
      trigger.type = "button";
      trigger.setAttribute("aria-label", "Abrir notificaciones");
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML = `
        <svg class="cl-notification-trigger__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"></path>
          <path d="M10 21h4"></path>
        </svg>
        <span class="cl-notification-trigger__label">Avisos</span>
        <span class="cl-notification-badge" hidden>0</span>
      `;

      const accountElement =
        container.querySelector("#accountButton") ||
        container.querySelector("#messages-account-link") ||
        container.querySelector('[aria-label="Mi cuenta"]') ||
        container.lastElementChild;

      let referenceElement = accountElement;
      while (
        referenceElement &&
        referenceElement.parentElement !== container
      ) {
        referenceElement = referenceElement.parentElement;
      }

      container.insertBefore(
        trigger,
        referenceElement?.parentElement === container ? referenceElement : null
      );
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePanel(trigger);
      });
      state.triggers.push(trigger);
    });
  }

  function createPanel() {
    const panel = document.createElement("aside");
    panel.className = "cl-notification-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Notificaciones");
    panel.innerHTML = `
      <div class="cl-notification-panel__header">
        <div>
          <h2 class="cl-notification-panel__title">Notificaciones</h2>
          <p class="cl-notification-panel__subtitle" data-notification-summary>
            Cargando…
          </p>
        </div>
        <div class="cl-notification-panel__tools">
          <button class="cl-notification-system" type="button" data-enable-system>
            Activar avisos
          </button>
          <button class="cl-notification-mark-all" type="button" data-mark-all disabled>
            Marcar leídas
          </button>
        </div>
      </div>
      <div class="cl-notification-list" data-notification-list>
        <div class="cl-notification-loading">Cargando notificaciones…</div>
      </div>
    `;

    panel.querySelector("[data-mark-all]").addEventListener("click", markAllRead);
    panel.querySelector("[data-enable-system]").addEventListener("click", enableSystemNotifications);
    panel.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(panel);
    state.panel = panel;
    updateSystemPermissionButton();
  }

  function bindGlobalEvents() {
    document.addEventListener("click", closePanel);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });
    window.addEventListener("resize", () => {
      if (!state.panel?.hidden && state.openTrigger) {
        positionPanel(state.openTrigger);
      }
    });
    window.addEventListener("beforeunload", () => {
      if (state.channel) client.removeChannel(state.channel);
    });
  }

  async function loadNotifications() {
    const { data, error } = await client
      .from("notifications")
      .select(
        "id, type, title, body, product_id, conversation_id, action_url, read, created_at, updated_at, metadata"
      )
      .eq("user_id", state.currentUser.id)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) {
      if (!isMissingNotificationsTable(error)) {
        console.error("Error cargando notificaciones:", error);
      }
      state.notifications = [];
      renderNotifications(
        isMissingNotificationsTable(error)
          ? "Configurá primero las notificaciones en Supabase."
          : "No se pudieron cargar las notificaciones."
      );
      return;
    }

    state.notifications = data || [];
    await markVisibleConversationNotifications();
    renderNotifications();
  }

  async function markVisibleConversationNotifications() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    const activeConversationId = new URLSearchParams(window.location.search).get(
      "id"
    );

    if (page !== "mensajes.html" || !activeConversationId) return;

    const matchingIds = state.notifications
      .filter(
        (notification) =>
          !notification.read &&
          notification.conversation_id === activeConversationId
      )
      .map((notification) => notification.id);

    if (!matchingIds.length) return;

    const { error } = await client
      .from("notifications")
      .update({ read: true })
      .eq("user_id", state.currentUser.id)
      .in("id", matchingIds);

    if (!error) {
      state.notifications = state.notifications.map((notification) =>
        matchingIds.includes(notification.id)
          ? { ...notification, read: true }
          : notification
      );
    }
  }

  function renderNotifications(errorMessage = "") {
    const unreadCount = state.notifications.filter(
      (notification) => !notification.read
    ).length;

    state.triggers.forEach((trigger) => {
      const badge = trigger.querySelector(".cl-notification-badge");
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badge.hidden = unreadCount === 0;
      trigger.setAttribute(
        "aria-label",
        unreadCount
          ? `Abrir notificaciones, ${unreadCount} sin leer`
          : "Abrir notificaciones"
      );
    });

    const summary = state.panel.querySelector("[data-notification-summary]");
    const markAllButton = state.panel.querySelector("[data-mark-all]");
    const list = state.panel.querySelector("[data-notification-list]");

    summary.textContent = unreadCount
      ? `${unreadCount} ${unreadCount === 1 ? "aviso nuevo" : "avisos nuevos"}`
      : "Estás al día";
    markAllButton.disabled = unreadCount === 0;

    if (errorMessage) {
      list.innerHTML = `
        <div class="cl-notification-empty">
          <div>
            <strong>No pudimos mostrar los avisos</strong>
            <span>${escapeHtml(errorMessage)}</span>
          </div>
        </div>
      `;
      return;
    }

    if (!state.notifications.length) {
      list.innerHTML = `
        <div class="cl-notification-empty">
          <div>
            <strong>Todavía no hay notificaciones</strong>
            <span>Cuando alguien te escriba o guarde un producto, aparecerá acá.</span>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = state.notifications
      .map(
        (notification) => `
          <button
            class="cl-notification-item${notification.read ? "" : " is-unread"}"
            type="button"
            data-notification-id="${escapeHtml(notification.id)}"
          >
            <span class="cl-notification-item__icon" data-type="${escapeHtml(
              notification.type
            )}">
              ${getNotificationIcon(notification.type)}
            </span>
            <span class="cl-notification-item__copy">
              <span class="cl-notification-item__title">${escapeHtml(
                getNotificationTitle(notification)
              )}</span>
              <span class="cl-notification-item__body">${escapeHtml(
                notification.body || ""
              )}</span>
              <span class="cl-notification-item__time">${escapeHtml(
                formatRelativeTime(notification.updated_at || notification.created_at)
              )}</span>
            </span>
          </button>
        `
      )
      .join("");

    list.querySelectorAll("[data-notification-id]").forEach((button) => {
      button.addEventListener("click", () =>
        openNotification(button.dataset.notificationId)
      );
    });
  }

  async function openNotification(notificationId) {
    const notification = state.notifications.find(
      (item) => item.id === notificationId
    );
    if (!notification) return;

    if (!notification.read) {
      await client
        .from("notifications")
        .update({ read: true })
        .eq("id", notification.id)
        .eq("user_id", state.currentUser.id);
    }

    const destination =
      getSafeDestination(notification.action_url) ||
      (notification.conversation_id
        ? `mensajes.html?id=${encodeURIComponent(notification.conversation_id)}`
        : notification.product_id
          ? `producto.html?id=${encodeURIComponent(notification.product_id)}`
          : "index.html");

    window.location.href = destination;
  }

  async function markAllRead() {
    const button = state.panel.querySelector("[data-mark-all]");
    button.disabled = true;

    const { error } = await client
      .from("notifications")
      .update({ read: true })
      .eq("user_id", state.currentUser.id)
      .eq("read", false);

    if (error) {
      console.error("Error marcando notificaciones:", error);
      button.disabled = false;
      showToast("No se pudieron marcar como leídas.");
      return;
    }

    state.notifications = state.notifications.map((notification) => ({
      ...notification,
      read: true
    }));
    renderNotifications();
  }

  function subscribeRealtime() {
    state.channel = client
      .channel(`colegiolibre-notifications-${state.currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${state.currentUser.id}`
        },
        async (payload) => {
          await loadNotifications();
          const isFreshUpdate =
            payload.eventType === "UPDATE" &&
            payload.new?.read === false &&
            payload.old?.updated_at !== payload.new?.updated_at;

          if (payload.eventType === "INSERT" || isFreshUpdate) {
            showToast(payload.new?.title || "Tenés una nueva notificación.");
            await showSystemNotification(payload.new || {});
          }
        }
      )
      .subscribe();
  }

  async function enableSystemNotifications() {
    const button = state.panel?.querySelector("[data-enable-system]");
    if (button) button.disabled = true;
    try {
      if (window.colegioLibreNative?.isNative) {
        await window.colegioLibreNative.requestNotificationPermission();
      } else if ("Notification" in window) {
        await Notification.requestPermission();
      }
    } catch {
      showToast("No se pudieron activar los avisos del dispositivo.");
    } finally {
      if (button) button.disabled = false;
      updateSystemPermissionButton();
    }
  }

  function updateSystemPermissionButton() {
    const button = state.panel?.querySelector("[data-enable-system]");
    if (!button) return;
    if (window.colegioLibreNative?.isNative) {
      button.textContent = "Avisos del teléfono";
      return;
    }
    if (!("Notification" in window)) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    button.textContent =
      Notification.permission === "granted"
        ? "Avisos activados"
        : Notification.permission === "denied"
          ? "Avisos bloqueados"
          : "Activar avisos";
    button.disabled = Notification.permission === "denied";
  }

  async function showSystemNotification(notification) {
    const title = notification.title || "ColegioLibre";
    const options = {
      body: notification.body || "Tenés una nueva notificación.",
      icon: "/images/icon-192.png",
      badge: "/images/icon-192.png",
      tag: `colegiolibre-${notification.id || Date.now()}`,
      data: {
        url:
          getSafeDestination(notification.action_url) ||
          (notification.conversation_id
            ? `mensajes.html?id=${encodeURIComponent(notification.conversation_id)}`
            : notification.product_id
              ? `producto.html?id=${encodeURIComponent(notification.product_id)}`
              : "index.html")
      }
    };

    if (window.colegioLibreNative?.isNative) {
      await window.colegioLibreNative.showNotification(title, options);
      return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
    }
  }

  function togglePanel(trigger) {
    const shouldOpen = state.panel.hidden || state.openTrigger !== trigger;
    state.triggers.forEach((item) =>
      item.setAttribute("aria-expanded", "false")
    );

    if (!shouldOpen) {
      closePanel();
      return;
    }

    state.openTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    state.panel.hidden = false;
    positionPanel(trigger);
  }

  function closePanel() {
    if (!state.panel) return;
    state.panel.hidden = true;
    state.openTrigger = null;
    state.triggers.forEach((item) =>
      item.setAttribute("aria-expanded", "false")
    );
  }

  function positionPanel(trigger) {
    if (window.innerWidth <= 700) {
      state.panel.style.top = "";
      state.panel.style.right = "";
      state.panel.style.left = "";
      state.panel.style.width = "";
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(410, window.innerWidth - 24);
    const right = Math.max(12, window.innerWidth - rect.right);
    const top = Math.min(
      rect.bottom + 10,
      window.innerHeight - Math.min(620, window.innerHeight - 24)
    );

    state.panel.style.width = `${panelWidth}px`;
    state.panel.style.right = `${right}px`;
    state.panel.style.left = "auto";
    state.panel.style.top = `${Math.max(12, top)}px`;
  }

  function getSafeDestination(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      if (window.location.origin !== "null" && url.origin !== window.location.origin) {
        return "";
      }
      return `${url.pathname.split("/").pop() || "index.html"}${url.search}`;
    } catch (_error) {
      return "";
    }
  }

  function getDefaultTitle(type) {
    const titles = {
      favorite: "Guardaron tu producto",
      message: "Nuevo mensaje",
      wanted_match: "Encontramos lo que buscabas",
      reservation_cancelled: "Reserva cancelada",
      review_requested: "Calificá la operación",
      reserved: "Producto reservado",
      sold: "Producto vendido",
      available: "Producto disponible"
    };
    return titles[type] || "Novedad en ColegioLibre";
  }

  function getNotificationTitle(notification) {
    const baseTitle =
      notification.title || getDefaultTitle(notification.type);
    const count = Number(notification.metadata?.count || 1);
    return count > 1 ? `${baseTitle} (${count})` : baseTitle;
  }

  function getNotificationIcon(type) {
    if (type === "favorite") {
      return '<svg viewBox="0 0 24 24"><path d="M12 20.4 4.95 13.5a4.86 4.86 0 0 1 0-6.99 5.08 5.08 0 0 1 7.05 0L12 7.52l1-1.01a5.08 5.08 0 0 1 7.05 0 4.86 4.86 0 0 1 0 6.99Z"></path></svg>';
    }
    if (type === "message") {
      return '<svg viewBox="0 0 24 24"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"></path><path d="M8 9h8M8 13h5"></path></svg>';
    }
    if (type === "sold") {
      return '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>';
    }
    if (type === "review_requested") {
      return '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.7 5.48 6.05.88-4.38 4.27 1.03 6.03L12 17.32 6.6 20.16l1.03-6.03-4.38-4.27 6.05-.88Z"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-8 4Z"></path><path d="M4 7v10l8 4 8-4V7M12 11v10"></path></svg>';
  }

  function formatRelativeTime(value) {
    if (!value) return "Ahora";
    const date = new Date(value);
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "Ahora";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days} d`;
    return date.toLocaleDateString(
      window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR",
      {
      day: "2-digit",
      month: "short"
      }
    );
  }

  function isMissingNotificationsTable(error) {
    const text = String(error?.message || "");
    return error?.code === "42P01" || text.includes("notifications");
  }

  function escapeHtml(value) {
    return api.escapeHtml
      ? api.escapeHtml(value)
      : String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "cl-notification-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  window.colegioLibreNotifications = {
    refresh: loadNotifications
  };
})();
