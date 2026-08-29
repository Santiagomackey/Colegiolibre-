// Google Analytics 4
(function () {
  "use strict";

  const GA_MEASUREMENT_ID = "G-Z4KWLEPTV4";
  const recentEvents = new Map();
  const DEDUPE_MS = 2000;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];

  window.gtag = function () {
    const args = Array.from(arguments);

    if (args[0] === "event") {
      const eventName = String(args[1] || "");
      const parameters = args[2] && typeof args[2] === "object" ? args[2] : {};
      const fingerprint = `${eventName}:${JSON.stringify(parameters)}`;
      const now = Date.now();
      const previous = recentEvents.get(fingerprint) || 0;

      if (now - previous < DEDUPE_MS) return;
      recentEvents.set(fingerprint, now);

      if (recentEvents.size > 80) {
        for (const [key, timestamp] of recentEvents) {
          if (now - timestamp > 15000) recentEvents.delete(key);
        }
      }
    }

    window.dataLayer.push(args);
  };

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true
  });

  window.trackColegioLibreEvent = function (eventName, parameters = {}) {
    if (!eventName || typeof window.gtag !== "function") return;
    window.gtag("event", eventName, parameters);
  };

  function pageName() {
    return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function safeProductId() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get("id") || "").slice(0, 120);
  }

  function priceRange(value) {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return "unknown";
    if (price < 10000) return "under_10k";
    if (price < 25000) return "10k_25k";
    if (price < 50000) return "25k_50k";
    if (price < 100000) return "50k_100k";
    return "100k_plus";
  }

  function favoriteState(button) {
    if (!button) return null;
    const ariaPressed = button.getAttribute("aria-pressed");
    if (ariaPressed === "true") return true;
    if (ariaPressed === "false") return false;

    if (button.dataset.active === "true" || button.dataset.favorite === "true") return true;
    if (button.dataset.active === "false" || button.dataset.favorite === "false") return false;

    const classes = String(button.className || "").toLowerCase();
    if (/is-active|active|favorited|saved/.test(classes)) return true;

    const label = String(
      button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || ""
    ).toLowerCase();
    if (/quitar|remove/.test(label) && /favorit|guardad|saved/.test(label)) return true;
    if (/guardar|agregar|add/.test(label) && /favorit|saved/.test(label)) return false;

    return null;
  }

  function patchAuthTracking() {
    const auth = window.colegioLibreSupabase?.auth;
    if (!auth || auth.__colegiolibreAnalyticsPatched) return;

    auth.__colegiolibreAnalyticsPatched = true;

    if (typeof auth.signInWithPassword === "function") {
      const originalSignIn = auth.signInWithPassword.bind(auth);
      auth.signInWithPassword = async function () {
        const result = await originalSignIn(...arguments);
        if (!result?.error && result?.data?.user) {
          window.trackColegioLibreEvent("login", { method: "email" });
        }
        return result;
      };
    }

    if (typeof auth.signUp === "function") {
      const originalSignUp = auth.signUp.bind(auth);
      auth.signUp = async function () {
        const result = await originalSignUp(...arguments);
        const user = result?.data?.user;
        const identities = Array.isArray(user?.identities) ? user.identities : null;
        if (!result?.error && user && (!identities || identities.length > 0)) {
          window.trackColegioLibreEvent("sign_up", { method: "email" });
        }
        return result;
      };
    }
  }

  function trackProductView() {
    if (pageName() !== "producto.html") return;
    const itemId = safeProductId();
    if (!itemId) return;

    window.trackColegioLibreEvent("view_item", {
      item_id: itemId,
      item_type: "school_product"
    });
  }

  function restorePendingPublish() {
    const raw = window.sessionStorage.getItem("colegiolibre-ga-pending-publish");
    if (!raw) return;

    window.sessionStorage.removeItem("colegiolibre-ga-pending-publish");

    try {
      const pending = JSON.parse(raw);
      if (!pending?.at || Date.now() - Number(pending.at) > 20000) return;
      if (pageName() === "publicar.html") return;

      window.trackColegioLibreEvent("publish_product", {
        category: String(pending.category || "unknown").slice(0, 60),
        condition: String(pending.condition || "unknown").slice(0, 40),
        price_range: String(pending.price_range || "unknown")
      });
    } catch (_error) {}
  }

  function bindPublishTracking() {
    const form = document.getElementById("publish-form");
    if (!form) return;

    form.addEventListener("submit", () => {
      const category = form.querySelector("#categoria")?.value || "unknown";
      const condition = form.querySelector('input[name="estado"]:checked')?.value || "unknown";
      const price = form.querySelector("#precio")?.value;

      window.sessionStorage.setItem(
        "colegiolibre-ga-pending-publish",
        JSON.stringify({ at: Date.now(), category, condition, price_range: priceRange(price) })
      );
    });
  }

  function bindSearchTracking() {
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (!form.matches('[role="search"], .search-bar, #search-form-desktop, #search-form-mobile, #global-search-form')) return;

        const input = form.querySelector('input[type="search"], input[type="text"]');
        const value = String(input?.value || "").trim();
        if (!value) return;

        window.trackColegioLibreEvent("marketplace_search", {
          query_length: Math.min(value.length, 100),
          page: pageName()
        });
      },
      true
    );
  }

  function bindFavoriteTracking() {
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest(
          '[data-favorite-button], #main-favorite-button, #save-button, .similar-card__favorite'
        );
        if (!button) return;

        const before = favoriteState(button);
        window.setTimeout(() => {
          const after = favoriteState(button);
          const itemId = safeProductId() || String(button.getAttribute("data-favorite-button") || "").slice(0, 120);

          if (after === true && before !== true) {
            window.trackColegioLibreEvent("add_to_favorites", { item_id: itemId, page: pageName() });
          } else if (after === false && before === true) {
            window.trackColegioLibreEvent("remove_from_favorites", { item_id: itemId, page: pageName() });
          }
        }, 900);
      },
      true
    );
  }

  function bindMessageTracking() {
    const form = document.getElementById("message-form");
    const input = document.getElementById("message-input");
    if (!form || !input) return;

    form.addEventListener("submit", () => {
      if (!String(input.value || "").trim()) return;

      window.setTimeout(() => {
        if (!String(input.value || "").trim()) {
          window.trackColegioLibreEvent("message_sent", { page: "mensajes.html" });
        }
      }, 1200);
    });
  }

  function bindSchoolTracking() {
    window.addEventListener("colegiolibre:profile-ready", (event) => {
      const profile = event?.detail?.profile;
      if (!profile?.school_code) return;

      window.trackColegioLibreEvent("school_selected", {
        has_school: true,
        school_level: String(profile.school_level || "unknown").slice(0, 40)
      });
    });
  }

  function bindSoldTracking() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target.closest("button, [role='button'], a");
        if (!target) return;

        const action = String(
          target.getAttribute("data-action") ||
          target.getAttribute("data-product-action") ||
          target.getAttribute("data-status") ||
          target.textContent ||
          ""
        ).toLowerCase();

        if (!/vendid|sold/.test(action)) return;

        window.setTimeout(() => {
          const card = target.closest("[data-product-id], .publication-card");
          const itemId = String(card?.getAttribute("data-product-id") || "").slice(0, 120);
          const statusText = String(card?.textContent || target.textContent || "").toLowerCase();
          if (/vendid|sold/.test(statusText)) {
            window.trackColegioLibreEvent("product_sold", { item_id: itemId, page: pageName() });
          }
        }, 1200);
      },
      true
    );
  }

  function initAnalyticsEvents() {
    patchAuthTracking();
    trackProductView();
    restorePendingPublish();
    bindPublishTracking();
    bindSearchTracking();
    bindFavoriteTracking();
    bindMessageTracking();
    bindSchoolTracking();
    bindSoldTracking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAnalyticsEvents, { once: true });
  } else {
    initAnalyticsEvents();
  }
})();

(() => {
  "use strict";

  const MAX_REPORTS_PER_SESSION = 8;
  const sent = new Set();
  let reports = 0;

  function clean(value, limit = 500) {
    return String(value || "")
      .replace(/https?:\/\/[^\s]+/gi, "[url]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
  }

  async function reportClientError({ message, source = "window", line = null, column = null }) {
    if (reports >= MAX_REPORTS_PER_SESSION) return;
    const safeMessage = clean(message);
    if (!safeMessage) return;

    const fingerprint = `${source}:${safeMessage}:${line || 0}:${column || 0}`;
    if (sent.has(fingerprint)) return;
    sent.add(fingerprint);

    const client = window.colegioLibreSupabase;
    if (!client?.auth || typeof client.from !== "function") return;

    try {
      const { data } = await client.auth.getUser();
      const user = data?.user;
      if (!user) return;

      reports += 1;
      await client.from("client_errors").insert({
        user_id: user.id,
        page_path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
        error_source: clean(source, 120),
        error_message: safeMessage,
        line_number: Number.isFinite(line) ? line : null,
        column_number: Number.isFinite(column) ? column : null,
        app_version: "web-20260829-ga4-events"
      });
    } catch (_error) {}
  }

  window.addEventListener("error", (event) => {
    reportClientError({
      message: event.message,
      source: event.filename || "window",
      line: event.lineno,
      column: event.colno
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientError({
      message: event.reason?.message || event.reason || "Promesa rechazada",
      source: "unhandledrejection"
    });
  });
})();
