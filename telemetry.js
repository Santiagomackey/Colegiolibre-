const SUPABASE_URL = "https://riqhwmszshleyyaxlwqu.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eDrbeuMnSqyN_NqPXw0iHQ_mh5mJjzJ";
const GA_MEASUREMENT_ID = "G-Z4KWLEPTV4";
const APP_VERSION = "web-20260901-ga4-debug";
const GA_DEBUG_STORAGE_KEY = "colegiolibre-ga-debug";
const AUTH_SESSION_EVENT_KEY = "colegiolibre-ga-authenticated-session-v1";

const supabase = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function getAppSurface() {
  if (isNativeApp()) return "android_app";
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  return standalone ? "pwa" : "web";
}

function syncGaDebugMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ga_debug") === "1") localStorage.setItem(GA_DEBUG_STORAGE_KEY, "1");
    if (params.get("ga_debug") === "0") localStorage.removeItem(GA_DEBUG_STORAGE_KEY);
    return localStorage.getItem(GA_DEBUG_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

const GA_DEBUG_MODE = syncGaDebugMode();

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
window.gtag("js", new Date());
window.gtag("config", GA_MEASUREMENT_ID, {
  anonymize_ip: true,
  debug_mode: GA_DEBUG_MODE
});

function track(name, params = {}) {
  window.gtag?.("event", name, {
    ...params,
    app_surface: params.app_surface || getAppSurface(),
    ...(GA_DEBUG_MODE ? { debug_mode: true } : {})
  });
}

function priceRange(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  if (n < 10000) return "under_10k";
  if (n < 25000) return "10k_25k";
  if (n < 50000) return "25k_50k";
  if (n < 100000) return "50k_100k";
  return "100k_plus";
}

async function applyUserAnalytics(user) {
  if (!user) {
    window.gtag?.("config", GA_MEASUREMENT_ID, {
      user_id: null,
      anonymize_ip: true,
      debug_mode: GA_DEBUG_MODE
    });
    window.gtag?.("set", "user_properties", {
      auth_state: "signed_out",
      app_surface: getAppSurface(),
      has_school: "no",
      school_level: "unknown"
    });
    return;
  }

  let profile = null;
  try {
    const { data } = await supabase.from("profiles").select("school_code,school_name,school_level").eq("id", user.id).maybeSingle();
    profile = data || null;
  } catch (_) {}

  const hasSchool = Boolean(profile?.school_code || profile?.school_name);
  const schoolLevel = String(profile?.school_level || "unknown").slice(0, 36);

  window.gtag?.("config", GA_MEASUREMENT_ID, {
    user_id: user.id,
    anonymize_ip: true,
    debug_mode: GA_DEBUG_MODE
  });
  window.gtag?.("set", "user_properties", {
    auth_state: "signed_in",
    app_surface: getAppSurface(),
    has_school: hasSchool ? "yes" : "no",
    school_level: schoolLevel
  });

  try {
    if (!sessionStorage.getItem(AUTH_SESSION_EVENT_KEY)) {
      track("authenticated_session", {
        has_school: hasSchool ? "yes" : "no",
        school_level: schoolLevel
      });
      sessionStorage.setItem(AUTH_SESSION_EVENT_KEY, "1");
    }
  } catch (_) {}
}

async function initAuthAnalytics() {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    await applyUserAnalytics(data?.user || null);
    supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => applyUserAnalytics(session?.user || null), 0);
    });
  } catch (_) {}
}

function bindMarketplaceTracking() {
  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.("a,button,[data-product-id],[data-id]");
    if (!target) return;
    const text = String(target.textContent || "").trim().toLowerCase();
    const itemId = String(target.dataset?.productId || target.dataset?.id || "").slice(0, 80);

    if (itemId && (target.matches("[data-product-id]") || /producto|ver|detalle/.test(text))) {
      track("view_item", {
        currency: "ARS",
        items: [{ item_id: itemId, item_name: `Producto ${itemId.slice(0, 8)}`, item_category: "school_product" }]
      });
    }
    if (/favorit|guardar/.test(text)) track("add_to_favorites", { item_id: itemId || "unknown", page: location.pathname });
    if (/quitar.*favorit|eliminar.*favorit/.test(text)) track("remove_from_favorites", { item_id: itemId || "unknown", page: location.pathname });
    if (/vendid/.test(text)) track("product_sold", { item_id: itemId || "unknown", page: location.pathname });
    if (/pausar/.test(text)) track("product_paused", { item_id: itemId || "unknown", page: location.pathname });
    if (/reactivar/.test(text)) track("product_reactivated", { item_id: itemId || "unknown", page: location.pathname });
    if (/enviar|mandar/.test(text) && /mensaje/.test(location.pathname + " " + document.title.toLowerCase())) track("message_sent", { page: "mensajes.html" });
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = String(form.action || "").toLowerCase();
    const page = location.pathname.toLowerCase();
    const data = new FormData(form);

    if (/publicar/.test(page + " " + action) && !new URLSearchParams(location.search).has("edit")) {
      const category = String(data.get("category") || data.get("categoria") || "unknown").slice(0, 40);
      const condition = String(data.get("condition") || data.get("estado") || data.get("condicion") || "unknown").slice(0, 40);
      const price = data.get("price") || data.get("precio");
      track("publish_product", { category, condition, price_range: priceRange(price) });
    }

    if (/login|ingresar/.test(page + " " + action)) track("login", { method: "email" });
    if (/register|registro|signup|crear-cuenta/.test(page + " " + action)) track("sign_up", { method: "email" });
  }, true);

  document.addEventListener("change", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    const name = String(el.name || el.id || "").toLowerCase();
    if (/school|colegio/.test(name)) track("school_selected", { has_school: Boolean(el.value) ? "yes" : "no" });
  }, true);

  let searchTimer;
  document.addEventListener("input", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement)) return;
    const marker = `${el.name || ""} ${el.id || ""} ${el.placeholder || ""}`.toLowerCase();
    if (!/buscar|search/.test(marker)) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = String(el.value || "").trim();
      if (q.length >= 2) track("marketplace_search", { query_length: q.length, page: location.pathname });
    }, 700);
  }, true);
}

function reportClientError(kind, message, source) {
  try {
    const safe = String(message || "unknown").replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").slice(0, 500);
    if (!supabase) return;
    supabase.from("client_errors").insert({ kind, message: safe, source: String(source || location.pathname).slice(0, 180), app_version: APP_VERSION }).then(() => {}).catch(() => {});
  } catch (_) {}
}

window.addEventListener("error", (e) => reportClientError("error", e.message, e.filename));
window.addEventListener("unhandledrejection", (e) => reportClientError("unhandledrejection", e.reason?.message || e.reason, location.pathname));

if (GA_DEBUG_MODE) console.info("[ColegioLibre] GA4 debug mode enabled");
initAuthAnalytics();
bindMarketplaceTracking();
