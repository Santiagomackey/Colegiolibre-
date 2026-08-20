const SUPABASE_URL = "https://riqhwmszshleyyaxlwqu.supabase.co";
const SUPABASE_KEY = "sb_publishable_FYZUQhaTqN6gL-KenUnzWg__nGQLrhJ";

const FALLBACK_PRODUCT_IMAGE = "images/materiales.webp";

const PRODUCT_STATUS = {
  available: "Disponible",
  paused: "Pausado",
  reserved: "Reservado",
  sold: "Vendido"
};

window.colegioLibreConfig = Object.freeze({
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  publicSiteUrl: "https://colegiolibre.vercel.app"
});

function createUnavailableError() {
  return new Error("Supabase no está disponible en esta página.");
}

function createQueryStub() {
  const result = {
    data: [],
    error: createUnavailableError()
  };

  let proxy = null;

  proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        }

        if (prop === "single" || prop === "maybeSingle") {
          return () =>
            Promise.resolve({
              data: null,
              error: result.error
            });
        }

        if (prop === "select") {
          return () => proxy;
        }

        return () => proxy;
      }
    }
  );

  return proxy;
}

function createSupabaseFallbackClient() {
  return {
    auth: {
      getSession: async () => ({
        data: { session: null },
        error: createUnavailableError()
      }),
      getUser: async () => ({
        data: { user: null },
        error: createUnavailableError()
      }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe() {}
          }
        }
      }),
      resetPasswordForEmail: async () => ({
        data: null,
        error: createUnavailableError()
      }),
      exchangeCodeForSession: async () => ({
        data: { session: null },
        error: createUnavailableError()
      }),
      signInWithPassword: async () => ({
        data: null,
        error: createUnavailableError()
      }),
      signOut: async () => ({
        error: null
      }),
      signUp: async () => ({
        data: null,
        error: createUnavailableError()
      }),
      setSession: async () => ({
        data: { session: null },
        error: createUnavailableError()
      }),
      updateUser: async () => ({
        data: null,
        error: createUnavailableError()
      })
    },
    channel() {
      return {
        on() {
          return this;
        },
        subscribe() {
          return this;
        }
      };
    },
    from() {
      return createQueryStub();
    },
    removeChannel() {
      return null;
    },
    rpc: async () => ({
      data: null,
      error: createUnavailableError()
    }),
    storage: {
      from() {
        return {
          getPublicUrl() {
            return { data: { publicUrl: "" } };
          },
          upload: async () => ({
            error: createUnavailableError()
          })
        };
      }
    }
  };
}

const hasSupabaseFactory = Boolean(window.supabase && window.supabase.createClient);

const client = hasSupabaseFactory
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true
      }
    })
  : createSupabaseFallbackClient();

if (!hasSupabaseFactory) {
  console.warn("Supabase JS no cargó. Se usa un cliente fallback para no romper la UI.");
}

let currentUserPromise = null;
let currentProfilePromise = null;
let authStateReady = false;
let resolveAuthStateReady;
const authStateReadyPromise = new Promise((resolve) => {
  resolveAuthStateReady = resolve;
});

client.auth.onAuthStateChange((event, session) => {
  currentUserPromise = Promise.resolve(session?.user || null);
  currentProfilePromise = null;
  if (!authStateReady) {
    authStateReady = true;
    resolveAuthStateReady();
  }
  window.dispatchEvent(
    new CustomEvent("colegiolibre:auth-state", {
      detail: { event, user: session?.user || null }
    })
  );
});

window.colegioLibreSupabase = client;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getInitials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function formatPrice(price) {
  const locale =
    window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
  return `$${Number(price || 0).toLocaleString(locale)}`;
}

function formatRelativeDate(dateValue) {
  if (!dateValue) return "Reciente";

  const date = new Date(dateValue);
  const now = new Date();
  const diffMs = Math.max(0, now - date);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;

  const locale =
    window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
  return date.toLocaleDateString(locale);
}

function formatPublishedDate(dateValue) {
  if (!dateValue) return "Publicado recientemente";

  const relative = formatRelativeDate(dateValue);

  if (relative === "Hoy") return "Publicado hoy";
  if (relative === "Ayer") return "Publicado ayer";
  if (relative.startsWith("Hace ")) return `Publicado ${relative.toLowerCase()}`;

  return `Publicado el ${relative}`;
}

function formatDateTime(dateValue) {
  if (!dateValue) return "";

  const locale =
    window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
  return new Date(dateValue).toLocaleString(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  });
}

function formatViews(count) {
  const value = Number(count || 0);
  return value === 1 ? "1 vista" : `${value} vistas`;
}

function formatMemberSince(dateValue) {
  if (!dateValue) return "Reciente";

  const locale =
    window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
  return new Date(dateValue).toLocaleDateString(locale, {
    month: "long",
    year: "numeric"
  });
}

function formatResponseTime(minutesValue) {
  const minutes = Number(minutesValue);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "Sin datos";
  }

  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))} min`;
  }

  const hours = minutes / 60;

  if (hours < 24) {
    return `${Math.round(hours * 10) / 10} h`;
  }

  const days = hours / 24;
  return `${Math.round(days * 10) / 10} dias`;
}

function formatRating(value) {
  const rating = Number(value);

  if (!Number.isFinite(rating) || rating <= 0) {
    return "Nueva";
  }

  return `${rating.toFixed(1)} / 5`;
}

function buildLocation(product) {
  return (
    product.location ||
    product.custom_location ||
    product.zone_name ||
    product.zone_code ||
    "Sin ubicación"
  );
}

function getStatusLabel(status) {
  return PRODUCT_STATUS[status] || PRODUCT_STATUS.available;
}

function getSchoolLabel(source) {
  return (source && (source.school_name || source.school)) || "Colegio no especificado";
}

function getZoneLabel(source) {
  return (source && (source.zone_code || source.zone || source.location)) || "Zona no especificada";
}

function safeProductRecord(product) {
  return {
    category: (product && product.category) || "Otros",
    condition: (product && product.condition) || "Usado",
    created_at: (product && product.created_at) || null,
    description: (product && product.description) || "",
    id: (product && product.id) || "",
    image_url: (product && product.image_url) || FALLBACK_PRODUCT_IMAGE,
    location: buildLocation(product),
    favorites_count: Number((product && product.favorites_count) || 0),
    moderation_confidence:
      product && product.moderation_confidence !== null
        ? Number(product.moderation_confidence)
        : null,
    moderation_reason: (product && product.moderation_reason) || null,
    moderation_source: (product && product.moderation_source) || null,
    moderation_status: (product && product.moderation_status) || "approved",
    moderated_at: (product && product.moderated_at) || null,
    price: Number((product && product.price) || 0),
    reserved_for: (product && product.reserved_for) || null,
    school_code: (product && product.school_code) || null,
    school_level: (product && product.school_level) || null,
    school_name: getSchoolLabel(product),
    school_year:
      product && product.school_year !== null && product.school_year !== undefined
        ? Number(product.school_year)
        : null,
    seller_name: (product && product.seller_name) || "Usuario ColegioLibre",
    size: (product && product.size) || null,
    status: (product && product.status) || "available",
    subject: (product && product.subject) || null,
    subcategory: (product && product.subcategory) || null,
    title: (product && product.title) || "Producto sin título",
    updated_at: (product && (product.updated_at || product.created_at)) || null,
    user_id: (product && product.user_id) || null,
    views: Number((product && product.views) || 0),
    zone_code: getZoneLabel(product)
  };
}

function safeSchoolRecord(school) {
  const schoolSearchableName = [
    school && school.display_name,
    school && school.name,
    school && school.short_name,
    school && school.aliases,
    school && school.code,
    school && school.address
  ].join(" ").toLocaleLowerCase("es");
  const preferredName = schoolSearchableName.includes("eccleston")
    ? "Eccleston School"
    : (school && (school.display_name || school.name)) || "Colegio sin nombre";

  return {
    accent_color: (school && school.accent_color) || "#FFC72C",
    address: (school && school.address) || "",
    aliases: (school && school.aliases) || "",
    city: (school && school.city) || "",
    code: (school && (school.community_code || school.code)) || "",
    database_code: (school && school.code) || "",
    community_code: (school && school.community_code) || "",
    created_at: (school && school.created_at) || null,
    cue: (school && school.cue) || "",
    department: (school && school.department) || "",
    display_name: preferredName,
    education_levels: Array.isArray(school && school.education_levels)
      ? school.education_levels
      : [],
    id: (school && (school.school_id || school.id)) || null,
    is_active: school ? school.is_active !== false : true,
    portal_enabled: school ? school.portal_enabled === true : false,
    membership_status: (school && school.membership_status) || "lead",
    logo_url: (school && school.logo_url) || "",
    logo_background: (school && school.logo_background) || "",
    logo_scale: Number((school && school.logo_scale) || 145),
    logo_x: Number((school && school.logo_x) || 0),
    logo_y: Number((school && school.logo_y) || 0),
    name: preferredName,
    official_name: (school && school.name) || "",
    primary_color: (school && school.primary_color) || "#0B2E6B",
    short_name: (school && school.short_name) || "",
    province: (school && school.province) || "Buenos Aires",
    secondary_color: (school && school.secondary_color) || "#67C23A",
    updated_at: (school && school.updated_at) || null,
    zone_code: (school && school.zone_code) || ""
  };
}

function safeProfileRecord(profile) {
  return {
    account_status: (profile && profile.account_status) || "active",
    created_at: (profile && profile.created_at) || null,
    id: (profile && profile.id) || null,
    member_since: (profile && (profile.member_since || profile.created_at)) || null,
    moderation_restriction_until:
      (profile && profile.moderation_restriction_until) || null,
    moderation_strikes: Number((profile && profile.moderation_strikes) || 0),
    name: (profile && profile.name) || "Usuario ColegioLibre",
    rating: Number((profile && profile.rating) || 0),
    rating_count: Number((profile && profile.rating_count) || 0),
    response_time: Number((profile && profile.response_time) || 0),
    role: (profile && profile.role) || "user",
    sales_count: Number((profile && profile.sales_count) || 0),
    school_code: (profile && profile.school_code) || null,
    school_level: (profile && profile.school_level) || null,
    school_name: (profile && profile.school_name) || "Colegio no especificado",
    school_verification_status:
      (profile && profile.school_verification_status) || "unverified",
    school_verification_updated_at:
      (profile && profile.school_verification_updated_at) || null,
    school_verified_at: (profile && profile.school_verified_at) || null,
    verification_method: (profile && profile.verification_method) || null,
    zone_code: (profile && profile.zone_code) || "Zona no especificada"
  };
}

function getStaticProductCatalog() {
  if (typeof window.getColegioLibreStaticProducts === "function") {
    return window.getColegioLibreStaticProducts().map(safeProductRecord);
  }

  if (Array.isArray(window.colegioLibreStaticProducts)) {
    return window.colegioLibreStaticProducts.map((product) => safeProductRecord(product));
  }

  return [];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getCurrentUser(force = false) {
  if (!currentUserPromise || force) {
    currentUserPromise = (async () => {
      await Promise.race([
        authStateReadyPromise,
        new Promise((resolve) => window.setTimeout(resolve, 900))
      ]);
      const sessionResult = await client.auth.getSession();
      const sessionUser = sessionResult?.data?.session?.user || null;
      if (sessionUser) return sessionUser;

      // getUser valida el token con Supabase y evita mostrar un falso estado
      // deslogueado mientras el almacenamiento local termina de restaurarse.
      const userResult = await client.auth.getUser().catch(() => null);
      return userResult?.data?.user || null;
    })().catch(() => null);
  }

  return currentUserPromise;
}

async function getCurrentProfile(force = false) {
  if (!currentProfilePromise || force) {
    currentProfilePromise = (async () => {
      const user = await getCurrentUser(force);

      if (!user) return null;

      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error cargando perfil actual:", error);
        return null;
      }

      return data ? safeProfileRecord(data) : null;
    })();
  }

  return currentProfilePromise;
}

async function requireAuthRedirect(target = "login.html") {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = target;
    return null;
  }

  return user;
}

async function fetchFavoriteIds(productIds = null) {
  const user = await getCurrentUser();

  if (!user) return new Set();

  let query = client.from("favorites").select("product_id").eq("user_id", user.id);

  if (Array.isArray(productIds) && productIds.length) {
    query = query.in("product_id", productIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error cargando favoritos:", error);
    return new Set();
  }

  return new Set((data || []).map((item) => item.product_id));
}

function isMissingRelationError(error) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "42703" ||
        (error.message && /relation|column|does not exist/i.test(error.message)))
  );
}

async function fetchFavoriteCountMap(productIds = []) {
  if (!Array.isArray(productIds) || !productIds.length) {
    return new Map();
  }

  const { data, error } = await client.from("favorites").select("product_id").in("product_id", productIds);

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error("Error contando favoritos:", error);
    }
    return new Map();
  }

  return (data || []).reduce((registry, item) => {
    const currentCount = registry.get(item.product_id) || 0;
    registry.set(item.product_id, currentCount + 1);
    return registry;
  }, new Map());
}

async function fetchConversationCountMap(productIds = [], sellerId = null) {
  let query = client.from("conversations").select("product_id");

  if (sellerId) {
    query = query.eq("seller_id", sellerId);
  }

  if (Array.isArray(productIds) && productIds.length) {
    query = query.in("product_id", productIds);
  }

  const { data, error } = await query;

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error("Error contando conversaciones:", error);
    }
    return new Map();
  }

  return (data || []).reduce((registry, item) => {
    const currentCount = registry.get(item.product_id) || 0;
    registry.set(item.product_id, currentCount + 1);
    return registry;
  }, new Map());
}

function getProductFavoriteCount(product, favoriteCountMap = null) {
  if (!product) return 0;

  if (favoriteCountMap instanceof Map && product.id && favoriteCountMap.has(product.id)) {
    return Number(favoriteCountMap.get(product.id) || 0);
  }

  return Number(product.favorites_count || 0);
}

function calculateDashboardStats(products = [], options = {}) {
  const favoriteCountMap = options.favoriteCountMap instanceof Map ? options.favoriteCountMap : new Map();
  const messageCountMap = options.messageCountMap instanceof Map ? options.messageCountMap : new Map();

  return products.reduce(
    (accumulator, product) => {
      const favoriteCount = getProductFavoriteCount(product, favoriteCountMap);
      const messageCount = Number(messageCountMap.get(product.id) || 0);
      const status = product.status || "available";

      accumulator.totalPublications += 1;
      accumulator.totalViews += Number(product.views || 0);
      accumulator.totalFavorites += favoriteCount;
      accumulator.totalConversations += messageCount;

      if (status === "sold") {
        accumulator.soldCount += 1;
      } else if (status === "paused") {
        accumulator.pausedCount += 1;
      } else if (status === "reserved") {
        accumulator.reservedCount += 1;
        accumulator.activeCount += 1;
      } else {
        accumulator.activeCount += 1;
      }

      return accumulator;
    },
    {
      activeCount: 0,
      pausedCount: 0,
      reservedCount: 0,
      soldCount: 0,
      totalConversations: 0,
      totalFavorites: 0,
      totalPublications: 0,
      totalViews: 0
    }
  );
}

async function fetchProductsByUser(userId) {
  if (!userId) return [];

  const { data, error } = await client
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error cargando productos del usuario:", error);
    return getStaticProductCatalog().filter((product) => product.user_id === userId);
  }

  const products = (data || []).map(safeProductRecord);

  if (products.length) {
    return products;
  }

  return getStaticProductCatalog().filter((product) => product.user_id === userId);
}

async function loadUserDashboard(userId) {
  const [profileResult, products] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    fetchProductsByUser(userId)
  ]);

  if (profileResult.error && !isMissingRelationError(profileResult.error)) {
    console.error("Error cargando perfil del dashboard:", profileResult.error);
  }

  const productIds = products.map((product) => product.id).filter(Boolean);
  const [favoriteCountMap, messageCountMap] = await Promise.all([
    fetchFavoriteCountMap(productIds),
    fetchConversationCountMap(productIds, userId)
  ]);

  const stats = calculateDashboardStats(products, {
    favoriteCountMap,
    messageCountMap
  });

  const profileSeed =
    profileResult.data ||
    (products[0]
      ? {
          id: userId,
          member_since: products[products.length - 1]?.created_at || products[0]?.created_at || null,
          name: products[0].seller_name,
          school_code: products[0].school_code,
          school_name: products[0].school_name,
          zone_code: products[0].zone_code
        }
      : {});

  const profile = safeProfileRecord(profileSeed);

  if (!profile.sales_count) {
    profile.sales_count = stats.soldCount;
  }

  if (!profile.member_since) {
    profile.member_since = profile.created_at || products[products.length - 1]?.created_at || null;
  }

  return {
    favoriteCountMap,
    messageCountMap,
    products,
    profile,
    stats
  };
}

async function loadPublicProfileBundle(userId) {
  const dashboard = await loadUserDashboard(userId);
  const visibleProducts = dashboard.products.filter((product) => product.status !== "paused");
  const stats = calculateDashboardStats(visibleProducts, {
    favoriteCountMap: dashboard.favoriteCountMap,
    messageCountMap: dashboard.messageCountMap
  });

  return {
    favoriteCountMap: dashboard.favoriteCountMap,
    messageCountMap: dashboard.messageCountMap,
    products: visibleProducts,
    profile: dashboard.profile,
    stats
  };
}

async function toggleFavorite(productId) {
  const user = await getCurrentUser();

  if (!user) {
    return { requiresAuth: true };
  }

  const { data: existing, error: existingError } = await client
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existingError) {
    console.error("Error verificando favorito:", existingError);
    return { error: existingError };
  }

  if (existing && existing.id) {
    const { error } = await client.from("favorites").delete().eq("id", existing.id);

    if (error) {
      console.error("Error quitando favorito:", error);
      return { error };
    }

    return { active: false };
  }

  const { error } = await client.from("favorites").insert({
    product_id: productId,
    user_id: user.id
  });

  if (error) {
    console.error("Error guardando favorito:", error);
    return { error };
  }

  return { active: true };
}

async function ensureConversation({ buyerId, productId, sellerId }) {
  if (!buyerId || !productId || !sellerId) {
    return { error: new Error("Faltan datos para crear la conversación.") };
  }

  if (buyerId === sellerId) {
    return { error: new Error("No podés abrir un chat con tu propio producto.") };
  }

  const findExistingConversation = () =>
    client
    .from("conversations")
    .select("*")
    .eq("product_id", productId)
    .eq("buyer_id", buyerId)
    .eq("seller_id", sellerId)
    .maybeSingle();

  const { data: existing, error: existingError } =
    await findExistingConversation();

  if (existingError) {
    console.error("Error buscando conversación:", existingError);
    return { error: existingError };
  }

  if (existing) {
    return { conversation: existing, created: false };
  }

  const { data: createdConversation, error } = await client
    .from("conversations")
    .insert({
      buyer_id: buyerId,
      product_id: productId,
      seller_id: sellerId
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: racedConversation, error: retryError } =
        await findExistingConversation();

      if (racedConversation && !retryError) {
        return { conversation: racedConversation, created: false };
      }
    }

    console.error("Error creando conversación:", error);
    return { error };
  }

  return { conversation: createdConversation, created: true };
}

async function incrementProductViews(product) {
  const safeProduct = safeProductRecord(product);

  if (!safeProduct.id) return safeProduct.views;

  const sessionKey = `colegiolibre:viewed:${safeProduct.id}`;

  if (window.sessionStorage.getItem(sessionKey) === "true") {
    return safeProduct.views;
  }

  const { data: rpcData, error: rpcError } = await client.rpc("increment_product_views", {
    product_id_input: safeProduct.id
  });

  if (!rpcError && typeof rpcData === "number") {
    window.sessionStorage.setItem(sessionKey, "true");
    return rpcData;
  }

  const nextViews = Number(safeProduct.views || 0) + 1;
  const { error: fallbackError } = await client
    .from("products")
    .update({
      updated_at: new Date().toISOString(),
      views: nextViews
    })
    .eq("id", safeProduct.id);

  if (fallbackError) {
    console.error("Error incrementando vistas:", rpcError || fallbackError);
    return safeProduct.views;
  }

  window.sessionStorage.setItem(sessionKey, "true");
  return nextViews;
}

async function getSchoolByCode(code) {
  if (!code) return null;

  const normalizedCode = String(code)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");

  if (!normalizedCode) return null;

  const { data: exactSchool, error: exactError } = await client
    .from("schools")
    .select("*")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (exactError) {
    console.error("Error cargando colegio por código:", exactError);
    return null;
  }

  if (exactSchool) {
    return safeSchoolRecord(exactSchool);
  }

  const { data: communitySchools, error: communityError } = await client
    .from("schools")
    .select("*")
    .eq("community_code", normalizedCode)
    .eq("is_active", true)
    .limit(1);

  if (communityError) {
    if (!isMissingRelationError(communityError)) {
      console.error(
        "Error cargando comunidad escolar:",
        communityError
      );
    }
    return null;
  }

  return communitySchools?.[0]
    ? safeSchoolRecord(communitySchools[0])
    : null;
}

async function searchSchools(query, limit = 18) {
  const normalizedQuery = String(query || "").trim();

  if (normalizedQuery.length < 2) {
    return [];
  }

  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 18, 1),
    30
  );
  const { data, error } = await client.rpc("search_schools", {
    p_limit: safeLimit,
    p_query: normalizedQuery
  });

  function schoolSearchScore(school) {
    const needle = normalizeText(normalizedQuery);
    const name = normalizeText(school.display_name || school.name);
    const aliases = normalizeText(school.aliases);
    const address = normalizeText(school.address);
    const city = normalizeText(school.city);

    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(` ${needle}`) || name.includes(needle)) return 2;
    if (aliases === needle || aliases.startsWith(needle)) return 3;
    if (aliases.includes(needle)) return 4;
    if (city.includes(needle)) return 5;
    if (address.includes(needle)) return 6;
    return 7;
  }

  function rankSchools(records) {
    return records
      .map(safeSchoolRecord)
      .sort((left, right) => {
        const scoreDifference = schoolSearchScore(left) - schoolSearchScore(right);
        if (scoreDifference) return scoreDifference;
        return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
      });
  }

  if (!error) {
    return rankSchools(data || []);
  }

  console.warn("La búsqueda avanzada de colegios no respondió; se usa búsqueda directa.", error);

  const safeTerm = normalizedQuery
    .replace(/[%_(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  if (!safeTerm) return [];

  const pattern = `%${safeTerm}%`;
  const fallbackResponse = await client
    .from("schools")
    .select("*")
    .eq("is_active", true)
    .or(
      [
        `name.ilike.${pattern}`,
        `display_name.ilike.${pattern}`,
        `aliases.ilike.${pattern}`,
        `address.ilike.${pattern}`,
        `city.ilike.${pattern}`,
        `code.ilike.${pattern}`,
        `cue.ilike.${pattern}`
      ].join(",")
    )
    .limit(safeLimit);

  if (fallbackResponse.error) {
    console.error("Error buscando colegios:", fallbackResponse.error);
    return [];
  }

  return rankSchools(fallbackResponse.data || []);
}

async function fetchSchools({ includeInactive = false } = {}) {
  let query = client
    .from("schools")
    .select("*")
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error cargando colegios:", error);
    return [];
  }

  return (data || []).map(safeSchoolRecord);
}

async function fetchUnreadNotificationCount(userId = null) {
  const currentUser = userId ? { id: userId } : await getCurrentUser();

  if (!currentUser?.id) {
    return 0;
  }

  const { count, error } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", currentUser.id)
    .eq("read", false);

  if (error) {
    if (!isMissingRelationError(error)) {
      console.error("Error cargando notificaciones:", error);
    }
    return 0;
  }

  return Number(count || 0);
}

async function isAdminUser() {
  const profile = await getCurrentProfile();

  if (profile && profile.role === "admin") {
    return true;
  }

  const user = await getCurrentUser();

  if (!user) return false;

  const { data, error } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    const isMissingRelation = error.code === "42P01" || (error.message && error.message.includes("relation"));

    if (!isMissingRelation) {
      console.error("Error verificando admin:", error);
    }

    return false;
  }

  return Boolean(data && data.user_id);
}

function isAccountRestricted(profile) {
  if (!profile) return false;
  if (profile.account_status === "banned") return true;

  const restrictionUntil = profile.moderation_restriction_until
    ? new Date(profile.moderation_restriction_until).getTime()
    : null;

  if (restrictionUntil && restrictionUntil > Date.now()) return true;
  if (profile.account_status === "suspended" && !restrictionUntil) return true;
  return false;
}

window.colegioLibreApi = {
  FALLBACK_PRODUCT_IMAGE,
  buildLocation,
  calculateDashboardStats,
  client,
  ensureConversation,
  escapeHtml,
  fetchFavoriteIds,
  fetchFavoriteCountMap,
  fetchConversationCountMap,
  fetchSchools,
  fetchProductsByUser,
  fetchUnreadNotificationCount,
  formatDateTime,
  formatMemberSince,
  formatPrice,
  formatPublishedDate,
  formatRating,
  formatRelativeDate,
  formatResponseTime,
  formatViews,
  getCurrentProfile,
  getCurrentUser,
  getInitials,
  getProductFavoriteCount,
  getSchoolByCode,
  getSchoolLabel,
  getStatusLabel,
  getZoneLabel,
  incrementProductViews,
  isAdminUser,
  isAccountRestricted,
  isMissingRelationError,
  loadPublicProfileBundle,
  loadUserDashboard,
  normalizeText,
  requireAuthRedirect,
  safeProfileRecord,
  safeProductRecord,
  safeSchoolRecord,
  searchSchools,
  toggleFavorite
};
