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
const PROVIDER_TIMEOUT_MS = 18_000;

const CRITICAL_PATTERNS = [
  /\b(arma|armas|pistola|revolver|revólver|municion|munición|explosivo)\b/i,
  /\b(cocaina|cocaína|marihuana|droga|drogas|mdma|lsd)\b/i,
  /\b(pornografia|pornografía|contenido sexual|servicio sexual)\b/i
];

const BLOCK_PATTERNS = [
  /\b(vape|vaper|cigarrillo|tabaco|alcohol|cerveza|vodka)\b/i,
  /\b(dni falso|certificado falso|documento falso|entrada falsa)\b/i,
  /\b(medicamento|pastillas|receta médica)\b/i,
  /\b(robado|robada|sin número de serie)\b/i
];

const REVIEW_PATTERNS = [
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
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
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
    `Título: ${product.title || ""}`,
    `Categoría: ${product.category || ""}`,
    `Descripción: ${product.description || ""}`,
    `Estado: ${product.condition || ""}`,
    `Precio ARS: ${product.price || ""}`,
    `Nivel: ${product.school_level || ""}`,
    `Año: ${product.school_year || ""}`,
    `Materia: ${product.subject || ""}`,
    `Subcategoría: ${product.subcategory || ""}`,
    `Talle: ${product.size || ""}`
  ].join("\n");
}

function localDecision(product) {
  const text = productText(product);
  const category = normalize(product.category);

  if (CRITICAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      decision: "rejected",
      reason: "El contenido parece incluir un artículo peligroso o prohibido.",
      severity: "critical",
      source: "fallback",
      confidence: 0.98
    };
  }

  if (BLOCK_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      decision: "rejected",
      reason: "El producto no está permitido en un marketplace escolar.",
      severity: "high",
      source: "fallback",
      confidence: 0.94
    };
  }

  if (REVIEW_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      decision: "rejected",
      reason:
        "No compartas datos de contacto, enlaces ni propuestas de pago por fuera de ColegioLibre.",
      severity: "medium",
      source: "fallback",
      confidence: 0.96
    };
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return {
      decision: "manual_review",
      reason: "La categoría no pudo identificarse con suficiente seguridad.",
      severity: "low",
      source: "fallback",
      confidence: 0.62
    };
  }

  return {
    decision: "approved",
    reason: "Publicación escolar aprobada automáticamente.",
    severity: "low",
    source: "fallback",
    confidence: 0.88
  };
}

async function supabaseRequest(path, options = {}, useServiceRole = false) {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const apiKey = useServiceRole ? serviceRoleKey : anonKey;

  if (!baseUrl || !apiKey) {
    throw new Error("Faltan variables privadas de Supabase en Vercel.");
  }

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const message = data?.message || data?.msg || data?.error_description || raw;
    throw new Error(message || `Supabase respondió ${response.status}.`);
  }

  return data;
}

async function authenticateUser(accessToken) {
  const baseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY.");
  }

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
  const fields = [
    "id",
    "user_id",
    "title",
    "category",
    "condition",
    "price",
    "description",
    "image_url",
    "school_level",
    "school_year",
    "subject",
    "subcategory",
    "size",
    "moderation_status"
  ].join(",");

  const rows = await supabaseRequest(
    `/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=${fields}&limit=1`,
    {},
    true
  );

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function matchDatabaseRules(product) {
  const rules = await supabaseRequest(
    "/rest/v1/prohibited_product_rules?is_active=eq.true&select=field,match_type,pattern,severity,reason,adds_strike",
    {},
    true
  );

  const values = {
    title: normalize(product.title),
    description: normalize(product.description),
    category: normalize(product.category)
  };
  values.all = `${values.title} ${values.description} ${values.category}`.trim();

  for (const rule of rules || []) {
    const field = values[rule.field] === undefined ? "all" : rule.field;
    const expected = normalize(rule.pattern);
    const actual = values[field];
    const matches =
      rule.match_type === "exact"
        ? actual === expected
        : expected.length >= 2 && actual.includes(expected);

    if (!matches) continue;

    return {
      decision: rule.severity === "block" ? "rejected" : "manual_review",
      reason: rule.reason,
      severity:
        rule.severity === "block" && rule.adds_strike ? "high" : "medium",
      source: "rules",
      confidence: 1,
      details: {
        matched_rule: rule.pattern,
        field: rule.field,
        adds_strike: Boolean(rule.adds_strike)
      }
    };
  }

  return null;
}

async function callOpenAIModeration(product, apiKey) {
  const input = [{ type: "text", text: productText(product) }];

  if (/^https:\/\//i.test(String(product.image_url || ""))) {
    input.push({
      type: "image_url",
      image_url: { url: product.image_url }
    });
  }

  async function request(moderationInput) {
    const response = await fetchWithTimeout("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: moderationInput
      })
    }, PROVIDER_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`OpenAI Moderation respondió ${response.status}.`);
    }

    return response.json();
  }

  let data;
  try {
    data = await request(input);
  } catch (error) {
    if (input.length === 1) throw error;
    data = await request(input.slice(0, 1));
  }

  const result = data?.results?.[0];
  if (!result?.flagged) return null;

  const activeCategories = Object.entries(result.categories || {})
    .filter(([, active]) => active)
    .map(([name]) => name);
  const critical = activeCategories.some((name) =>
    /sexual\/minors|self-harm\/intent|self-harm\/instructions/i.test(name)
  );

  return {
    decision: "rejected",
    reason: critical
      ? "El sistema detectó contenido crítico que no puede publicarse."
      : "El sistema detectó contenido inseguro o no permitido.",
    severity: critical ? "critical" : "high",
    source: "openai",
    confidence: Math.max(
      0,
      ...Object.values(result.category_scores || {}).map(Number)
    ),
    details: { categories: activeCategories }
  };
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
    }
  }

  return "";
}

async function callOpenAIListingReview(product, apiKey) {
  const model = process.env.OPENAI_REVIEW_MODEL || "gpt-5.6-sol";
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "Sos el revisor de ColegioLibre, un marketplace argentino de materiales escolares que también usan menores. Aprobá únicamente bienes escolares legales y apropiados: libros, apuntes, cuadernos, útiles, mochilas, tecnología educativa, uniformes y artículos directamente relacionados. Rechazá armas, drogas, alcohol, tabaco/vapeo, medicamentos, material sexual, documentos falsos, artículos robados y servicios peligrosos. Rechazá con severidad medium los datos de contacto, enlaces o pedidos de pago externo. Usá manual_review únicamente cuando el producto sea realmente ambiguo. No inventes datos."
        },
        {
          role: "user",
          content: productText(product)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "colegiolibre_listing_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              decision: {
                type: "string",
                enum: ["approved", "rejected", "manual_review"]
              },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"]
              },
              reason: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["decision", "severity", "reason", "confidence"]
          }
        }
      }
    })
  }, PROVIDER_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`OpenAI Responses respondió ${response.status}.`);
  }

  const data = await response.json();
  const parsed = JSON.parse(extractResponseText(data));

  return {
    ...parsed,
    source: "openai",
    details: {
      response_id: data.id || null,
      model: data.model || model
    }
  };
}

async function decide(product) {
  const databaseRule = await matchDatabaseRules(product);
  if (databaseRule) return databaseRule;

  const firstPass = localDecision(product);
  if (firstPass.decision === "rejected") return firstPass;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return firstPass;

  const unsafe = await callOpenAIModeration(product, apiKey);
  if (unsafe) return unsafe;

  return callOpenAIListingReview(product, apiKey);
}

async function applyDecision(productId, decision) {
  return supabaseRequest(
    "/rest/v1/rpc/apply_automated_moderation_decision",
    {
      method: "POST",
      body: JSON.stringify({
        target_product_id: productId,
        next_decision: decision.decision,
        decision_reason: decision.reason,
        decision_severity: decision.severity,
        decision_source: decision.source,
        decision_confidence: decision.confidence,
        decision_details: decision.details || {}
      })
    },
    true
  );
}

module.exports = async function handler(request, response) {
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
        alreadyProcessed: true
      });
    }

    let decision;
    try {
      decision = await decide(product);
    } catch (error) {
      console.error("Fallo el proveedor de moderación:", error);
      decision = {
        decision: "manual_review",
        reason: "No pudimos completar la revisión automática. Un administrador la revisará.",
        severity: "low",
        source: "fallback",
        confidence: 0.5,
        details: { provider_error: error.message }
      };
    }

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
      error: "No pudimos revisar la publicación en este momento."
    });
  }
};
