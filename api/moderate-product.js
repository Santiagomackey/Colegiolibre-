const ALLOWED_CATEGORIES = new Set([
  "libros",
  "apuntes",
  "cuadernos",
  "utiles",
  "útiles",
  "mochilas",
  "tecnologia",
  "tecnología",
  "uniformes",
  "otros"
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_TIMEOUT_MS = 10_000;

const CRITICAL_PATTERNS = [
  /\b(arma|armas|pistola|revolver|revólver|municion|munición|explosivo)\b/i,
  /\b(cocaina|cocaína|marihuana|droga|drogas|mdma|lsd)\b/i,
  /\b(pornografia|pornografía|contenido sexual|servicio sexual)\b/i
];

const BLOCK_PATTERNS = [
  /\b(vape|vaper|cigarrillo|tabaco|alcohol|cerveza|vodka)\b/i,
  /\b(dni falso|certificado falso|documento falso|entrada falsa)\b/i,
  /\b(medicamento|pastillas|receta médica)\b/i,
  /\b(robado|robada|sin número de serie)\b/i,
  /\b(transferime|transferencia antes|seña por fuera|pago por fuera)\b/i,
  /\b(whatsapp|telegram)\b/i,
  /https?:\/\//i
];

function sendJson(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SUPABASE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function productText(product) {
  return [
    product.title,
    product.category,
    product.description,
    product.condition,
    product.subject,
    product.subcategory,
    product.size
  ]
    .filter(Boolean)
    .join(" ");
}

function localDecision(product) {
  const text = productText(product);
  const category = normalize(product.category);

  if (CRITICAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      decision: "rejected",
      reason: "El contenido parece incluir un artículo peligroso o prohibido.",
      severity: "critical",
      source: "local"
    };
  }

  if (BLOCK_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      decision: "rejected",
      reason: "La publicación contiene contenido o datos que no están permitidos en ColegioLibre.",
      severity: "high",
      source: "local"
    };
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return {
      decision: "rejected",
      reason: "La categoría no está permitida en ColegioLibre.",
      severity: "medium",
      source: "local"
    };
  }

  return {
    decision: "approved",
    reason: "Publicación escolar aprobada automáticamente.",
    severity: "low",
    source: "local"
  };
}

function env() {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !serviceRoleKey || !anonKey) {
    throw new Error("Faltan variables privadas de Supabase en Vercel.");
  }
  return { baseUrl, serviceRoleKey, anonKey };
}

async function authenticateUser(accessToken) {
  const { baseUrl, anonKey } = env();
  const response = await fetchWithTimeout(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function loadProduct(productId) {
  const { baseUrl, serviceRoleKey } = env();
  const fields = [
    "id",
    "user_id",
    "title",
    "category",
    "condition",
    "price",
    "description",
    "school_level",
    "school_year",
    "subject",
    "subcategory",
    "size",
    "status",
    "moderation_status"
  ].join(",");

  const response = await fetchWithTimeout(
    `${baseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=${fields}&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`No se pudo leer la publicación (${response.status}).`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function applyDecision(productId, decision) {
  const { baseUrl, serviceRoleKey } = env();
  const approved = decision.decision === "approved";
  const now = new Date().toISOString();

  const body = {
    status: approved ? "available" : "paused",
    moderation_status: approved ? "approved" : "rejected",
    moderation_reason: decision.reason,
    moderation_source: decision.source,
    moderation_confidence: approved ? 1 : 0.99,
    moderated_at: now,
    updated_at: now
  };

  const response = await fetchWithTimeout(
    `${baseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(body)
    }
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `No se pudo actualizar la publicación (${response.status}).`);
  }

  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Método no permitido." });
  }

  const authorization = String(request.headers.authorization || "");
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  const productId = String(request.body?.productId || "").trim();

  if (!accessToken || !productId) {
    return sendJson(response, 400, {
      error: "Falta la sesión o el identificador de la publicación."
    });
  }

  if (accessToken.length > 4096 || !UUID_PATTERN.test(productId)) {
    return sendJson(response, 400, {
      error: "La solicitud de moderación no es válida."
    });
  }

  try {
    const user = await authenticateUser(accessToken);
    if (!user?.id) {
      return sendJson(response, 401, { error: "La sesión no es válida." });
    }

    const product = await loadProduct(productId);
    if (!product || product.user_id !== user.id) {
      return sendJson(response, 404, {
        error: "La publicación no existe o no te pertenece."
      });
    }

    if (product.moderation_status !== "pending") {
      return sendJson(response, 200, {
        decision: product.moderation_status,
        status: product.status,
        alreadyProcessed: true
      });
    }

    const decision = localDecision(product);
    const applied = await applyDecision(product.id, decision);

    return sendJson(response, 200, {
      decision: decision.decision,
      reason: decision.reason,
      status: decision.decision === "approved" ? "available" : "paused",
      result: applied
    });
  } catch (error) {
    console.error("No se pudo moderar la publicación:", error);
    return sendJson(response, 500, {
      error: "No pudimos revisar la publicación en este momento.",
      detail: String(error?.message || error || "unknown").slice(0, 300)
    });
  }
}
