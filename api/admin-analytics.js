const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

function json(res, status, body) {
  res.status(status).json(body);
}

function authHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`
  };
}

function serviceHeaders() {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

async function getAuthenticatedUser(token) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: authHeaders(token)
  });
  if (!response.ok) return null;
  return response.json();
}

async function assertAdmin(userId) {
  const params = new URLSearchParams({
    id: `eq.${userId}`,
    select: "id,role,account_status"
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${params}`, {
    headers: serviceHeaders()
  });
  if (!response.ok) return false;
  const rows = await response.json();
  const profile = rows?.[0];
  return profile?.role === "admin" && profile?.account_status !== "banned";
}

async function fetchAllAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;
  while (page <= 20) {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers: serviceHeaders() }
    );
    if (!response.ok) {
      throw new Error(`Auth users ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    const batch = Array.isArray(payload?.users) ? payload.users : [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

async function fetchTable(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: serviceHeaders()
  });
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function isoMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Método no permitido." });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json(res, 500, { error: "Faltan variables privadas de Supabase." });
  }

  const bearer = String(req.headers.authorization || "");
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  if (!token) return json(res, 401, { error: "Sesión requerida." });

  try {
    const user = await getAuthenticatedUser(token);
    if (!user?.id) return json(res, 401, { error: "Sesión inválida." });
    if (!(await assertAdmin(user.id))) {
      return json(res, 403, { error: "Acceso exclusivo para administradores." });
    }

    const [authUsers, profiles, products] = await Promise.all([
      fetchAllAuthUsers(),
      fetchTable("profiles?select=id,name,school_name,school_code,role,account_status,created_at,member_since"),
      fetchTable("products?select=id,user_id,title,category,status,moderation_status,price,created_at,views,school_name&order=created_at.desc&limit=1000")
    ]);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const productCounts = new Map();
    for (const product of products) {
      productCounts.set(product.user_id, (productCounts.get(product.user_id) || 0) + 1);
    }

    const registeredUsers = authUsers.length;
    const signedIn24h = authUsers.filter((item) => now - isoMs(item.last_sign_in_at) <= day).length;
    const signedIn7d = authUsers.filter((item) => now - isoMs(item.last_sign_in_at) <= 7 * day).length;
    const newUsers7d = authUsers.filter((item) => now - isoMs(item.created_at) <= 7 * day).length;
    const activeProducts = products.filter((item) => item.status === "available" || item.status === "reserved").length;
    const soldProducts = products.filter((item) => item.status === "sold").length;
    const publishers = new Set(products.map((item) => item.user_id).filter(Boolean));

    const users = authUsers
      .map((authUser) => {
        const profile = profileMap.get(authUser.id) || {};
        return {
          id: authUser.id,
          email: cleanEmail(authUser.email),
          name: profile.name || "Sin nombre",
          school_name: profile.school_name || "Sin colegio",
          role: profile.role || "user",
          account_status: profile.account_status || "active",
          created_at: authUser.created_at || profile.created_at || null,
          last_sign_in_at: authUser.last_sign_in_at || null,
          products_count: productCounts.get(authUser.id) || 0,
          email_confirmed: Boolean(authUser.email_confirmed_at || authUser.confirmed_at)
        };
      })
      .sort((a, b) => isoMs(b.last_sign_in_at) - isoMs(a.last_sign_in_at));

    const recentProducts = products.slice(0, 100).map((product) => {
      const owner = users.find((item) => item.id === product.user_id);
      return {
        id: product.id,
        title: product.title || "Producto sin título",
        category: product.category || "Otros",
        status: product.status || "available",
        moderation_status: product.moderation_status || "approved",
        price: Number(product.price || 0),
        views: Number(product.views || 0),
        created_at: product.created_at || null,
        school_name: product.school_name || owner?.school_name || "Sin colegio",
        publisher_name: owner?.name || "Usuario",
        publisher_email: owner?.email || ""
      };
    });

    const topPublishers = users
      .filter((item) => item.products_count > 0)
      .sort((a, b) => b.products_count - a.products_count)
      .slice(0, 20)
      .map(({ id, email, name, school_name, products_count, last_sign_in_at }) => ({
        id,
        email,
        name,
        school_name,
        products_count,
        last_sign_in_at
      }));

    res.setHeader("Cache-Control", "no-store");
    return json(res, 200, {
      generated_at: new Date().toISOString(),
      metrics: {
        registered_users: registeredUsers,
        signed_in_24h: signedIn24h,
        signed_in_7d: signedIn7d,
        new_users_7d: newUsers7d,
        total_products: products.length,
        active_products: activeProducts,
        sold_products: soldProducts,
        publishers: publishers.size
      },
      users,
      recent_products: recentProducts,
      top_publishers: topPublishers
    });
  } catch (error) {
    console.error("admin-analytics error", error);
    return json(res, 500, {
      error: "No se pudo cargar Analytics de ColegioLibre.",
      detail: String(error?.message || error).slice(0, 300)
    });
  }
}
