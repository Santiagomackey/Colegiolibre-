// Google Analytics 4 + ColegioLibre marketplace analytics
(function () {
  "use strict";

  const GA_MEASUREMENT_ID = "G-Z4KWLEPTV4";
  const DEDUPE_MS = 2000;
  const recentEvents = new Map();
  const PENDING_LOGIN_KEY = "colegiolibre-ga-pending-login";
  const PUBLISH_DRAFT_KEY = "colegiolibre-ga-publish-draft";
  const PENDING_PUBLISH_KEY = "colegiolibre-ga-pending-publish";
  const CONTEXT_SENT_KEY = "colegiolibre-ga-context-sent";

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };

  function appSurface() {
    try {
      if (window.Capacitor?.isNativePlatform?.()) return "android_app";
      if (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true) return "pwa";
    } catch (_error) {}
    return "web";
  }

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

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    app_surface: appSurface()
  });

  window.trackColegioLibreEvent = function (eventName, parameters = {}) {
    if (!eventName || typeof window.gtag !== "function") return;

    const payload = {
      app_surface: appSurface(),
      ...parameters
    };
    const fingerprint = `${eventName}:${JSON.stringify(payload)}`;
    const now = Date.now();
    const previous = recentEvents.get(fingerprint) || 0;
    if (now - previous < DEDUPE_MS) return;

    recentEvents.set(fingerprint, now);
    for (const [key, timestamp] of recentEvents) {
      if (now - timestamp > 15000) recentEvents.delete(key);
    }

    window.gtag("event", eventName, payload);
  };

  function setAnalyticsIdentity(user, profile = null) {
    const userId = user?.id ? String(user.id).slice(0, 128) : null;
    const schoolLevel = String(profile?.school_level || "unknown").slice(0, 40);
    const hasSchool = Boolean(profile?.school_code || profile?.school_name);

    window.gtag("config", GA_MEASUREMENT_ID, {
      user_id: userId || undefined,
      anonymize_ip: true
    });

    window.gtag("set", "user_properties", {
      auth_state: userId ? "signed_in" : "signed_out",
      app_surface: appSurface(),
      has_school: hasSchool ? "yes" : "no",
      school_level: schoolLevel
    });
  }

  async function hydrateAnalyticsIdentity() {
    const client = window.colegioLibreSupabase;
    if (!client?.auth) {
      setAnalyticsIdentity(null);
      return;
    }

    try {
      const { data } = await client.auth.getUser();
      const user = data?.user || null;
      if (!user) {
        setAnalyticsIdentity(null);
        return;
      }

      let profile = null;
      if (typeof client.from === "function") {
        try {
          const result = await client
            .from("profiles")
            .select("school_code,school_name,school_level")
            .eq("id", user.id)
            .maybeSingle();
          profile = result?.data || null;
        } catch (_error) {}
      }

      setAnalyticsIdentity(user, profile);

      try {
        if (!window.sessionStorage.getItem(CONTEXT_SENT_KEY)) {
          window.sessionStorage.setItem(CONTEXT_SENT_KEY, "1");
          window.trackColegioLibreEvent("signed_in_session", {
            has_school: Boolean(profile?.school_code || profile?.school_name),
            school_level: String(profile?.school_level || "unknown").slice(0, 40)
          });
        }
      } catch (_error) {}
    } catch (_error) {
      setAnalyticsIdentity(null);
    }
  }

  function restorePendingLogin() {
    let pending = null;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(PENDING_LOGIN_KEY) || "null");
    } catch (_error) {}

    if (!pending?.at || Date.now() - Number(pending.at) > 15000) {
      window.sessionStorage.removeItem(PENDING_LOGIN_KEY);
      return;
    }

    if (pageName() === "login.html") return;

    window.sessionStorage.removeItem(PENDING_LOGIN_KEY);
    window.setTimeout(() => {
      window.trackColegioLibreEvent("login", { method: pending.method || "email" });
      hydrateAnalyticsIdentity();
    }, 250);
  }

  function bindAuthTracking() {
    const auth = window.colegioLibreSupabase?.auth;
    if (!auth) return;

    if (typeof auth.onAuthStateChange === "function") {
      auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          try { window.sessionStorage.removeItem(CONTEXT_SENT_KEY); } catch (_error) {}
          setAnalyticsIdentity(null);
          return;
        }
        if (event !== "SIGNED_IN" || !session?.user) return;

        setAnalyticsIdentity(session.user);

        if (pageName() === "login.html") {
          try {
            window.sessionStorage.setItem(
              PENDING_LOGIN_KEY,
              JSON.stringify({ at: Date.now(), method: "email" })
            );
          } catch (_error) {}

          window.gtag("event", "login", {
            method: "email",
            app_surface: appSurface(),
            transport_type: "beacon"
          });
        }

        window.setTimeout(hydrateAnalyticsIdentity, 300);
      });
    }

    if (!auth.__colegiolibreAnalyticsSignUpPatched && typeof auth.signUp === "function") {
      auth.__colegiolibreAnalyticsSignUpPatched = true;
      const originalSignUp = auth.signUp.bind(auth);
      auth.signUp = async function () {
        const result = await originalSignUp(...arguments);
        const user = result?.data?.user;
        const identities = Array.isArray(user?.identities) ? user.identities : null;
        if (!result?.error && user && (!identities || identities.length > 0)) {
          setAnalyticsIdentity(user);
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
    const raw = window.sessionStorage.getItem(PENDING_PUBLISH_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw);
      if (!pending?.at || Date.now() - Number(pending.at) > 30000) {
        window.sessionStorage.removeItem(PENDING_PUBLISH_KEY);
        return;
      }
      if (pageName() === "publicar.html") return;

      window.sessionStorage.removeItem(PENDING_PUBLISH_KEY);
      window.trackColegioLibreEvent("publish_product", {
        item_id: String(pending.item_id || "").slice(0, 120),
        category: String(pending.category || "unknown").slice(0, 60),
        condition: String(pending.condition || "unknown").slice(0, 40),
        price_range: String(pending.price_range || "unknown")
      });
    } catch (_error) {
      window.sessionStorage.removeItem(PENDING_PUBLISH_KEY);
    }
  }

  function bindPublishTracking() {
    const form = document.getElementById("publish-form");
    const toast = document.getElementById("toast");
    if (!form) return;

    const existingDraft = window.sessionStorage.getItem(PUBLISH_DRAFT_KEY);
    if (existingDraft) {
      try {
        const parsed = JSON.parse(existingDraft);
        if (!parsed?.at || Date.now() - Number(parsed.at) > 60000) {
          window.sessionStorage.removeItem(PUBLISH_DRAFT_KEY);
        }
      } catch (_error) {
        window.sessionStorage.removeItem(PUBLISH_DRAFT_KEY);
      }
    }

    form.addEventListener("submit", () => {
      const category = form.querySelector("#categoria")?.value || "unknown";
      const condition = form.querySelector('input[name="estado"]:checked')?.value || "unknown";
      const price = form.querySelector("#precio")?.value;

      window.sessionStorage.setItem(
        PUBLISH_DRAFT_KEY,
        JSON.stringify({
          at: Date.now(),
          category,
          condition,
          price_range: priceRange(price)
        })
      );
    });

    if (!toast) return;

    const confirmSuccessfulPublish = () => {
      const message = String(toast.textContent || "").toLowerCase();
      if (!message.includes("producto recibido")) return;

      const rawDraft = window.sessionStorage.getItem(PUBLISH_DRAFT_KEY);
      if (!rawDraft) return;

      try {
        const draft = JSON.parse(rawDraft);
        if (!draft?.at || Date.now() - Number(draft.at) > 60000) return;

        const params = new URLSearchParams(window.location.search);
        window.sessionStorage.setItem(
          PENDING_PUBLISH_KEY,
          JSON.stringify({
            at: Date.now(),
            item_id: params.get("id") || "",
            category: draft.category || "unknown",
            condition: draft.condition || "unknown",
            price_range: draft.price_range || "unknown"
          })
        );
        window.sessionStorage.removeItem(PUBLISH_DRAFT_KEY);
      } catch (_error) {}
    };

    const observer = new MutationObserver(confirmSuccessfulPublish);
    observer.observe(toast, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  function bindSearchTracking() {
    document.addEventListener("submit", (event) => {
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
    }, true);
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
    return null;
  }

  function bindFavoriteTracking() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest('[data-favorite-button], #main-favorite-button, #save-button, .similar-card__favorite');
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
    }, true);
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
      if (!profile) return;
      const hasSchool = Boolean(profile.school_code || profile.school_name);
      setAnalyticsIdentity(event?.detail?.user || null, profile);
      window.trackColegioLibreEvent("school_selected", {
        has_school: hasSchool,
        school_level: String(profile.school_level || "unknown").slice(0, 40)
      });
    });
  }

  function bindProductStatusTracking() {
    document.addEventListener("click", (event) => {
      const target = event.target.closest("button, [role='button'], a");
      if (!target) return;
      const rawAction = String(
        target.getAttribute("data-action") ||
        target.getAttribute("data-product-action") ||
        target.getAttribute("data-status-action") ||
        target.getAttribute("data-status") ||
        target.textContent || ""
      ).toLowerCase();

      let eventName = "";
      if (/vendid|sold/.test(rawAction)) eventName = "product_sold";
      else if (/pausar|paused|pause/.test(rawAction)) eventName = "product_paused";
      else if (/reactivar|available|reactivate/.test(rawAction)) eventName = "product_reactivated";
      if (!eventName) return;

      const card = target.closest("[data-product-id], .publication-card");
      const itemId = String(card?.getAttribute("data-product-id") || safeProductId() || "").slice(0, 120);
      window.setTimeout(() => {
        window.trackColegioLibreEvent(eventName, { item_id: itemId, page: pageName() });
      }, 1000);
    }, true);
  }

  function initAnalyticsEvents() {
    hydrateAnalyticsIdentity();
    bindAuthTracking();
    restorePendingLogin();
    trackProductView();
    restorePendingPublish();
    bindPublishTracking();
    bindSearchTracking();
    bindFavoriteTracking();
    bindMessageTracking();
    bindSchoolTracking();
    bindProductStatusTracking();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAnalyticsEvents, { once: true });
  } else {
    initAnalyticsEvents();
  }
})();

// Lightweight authenticated client-error reporting
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
        app_version: "web-20260901-ga4-user-marketplace"
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
