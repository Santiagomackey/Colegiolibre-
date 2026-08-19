function sendJson(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function getCurrentUser(request) {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  return response.ok ? response.json() : null;
}

const PRICES = {
  Institucional: { monthly: 24900, annual: 249000 },
  "Red Escolar": { monthly: 59900, annual: 599000 }
};

export default async function handler(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Método no permitido." });
  try {
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
    const user = await getCurrentUser(request);
    if (!user) return sendJson(response, 401, { error: "Iniciá sesión para contratar un plan." });

    const requestId = String(request.body?.request_id || "");
    const lookup = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/institution_requests?id=eq.${encodeURIComponent(requestId)}&applicant_user_id=eq.${encodeURIComponent(user.id)}&select=*`,
      { headers: serviceHeaders() }
    );
    const institutionRequest = (await lookup.json())[0];
    if (!institutionRequest || institutionRequest.status !== "approved") {
      return sendJson(response, 403, { error: "Primero debemos aprobar la solicitud institucional." });
    }

    const plan = institutionRequest.requested_plan;
    const billing = institutionRequest.billing_cycle || "monthly";
    const amount = PRICES[plan]?.[billing];
    if (!amount) return sendJson(response, 400, { error: "Ese plan no requiere pago o no es válido." });

    const backUrl = `${process.env.PUBLIC_SITE_URL || "https://colegiolibre.vercel.app"}/instituciones.html?payment=return`;
    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `colegiolibre-${institutionRequest.id}-${billing}`
      },
      body: JSON.stringify({
        reason: `ColegioLibre - Plan ${plan}`,
        external_reference: institutionRequest.id,
        payer_email: institutionRequest.contact_email || user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: billing === "annual" ? "years" : "months",
          transaction_amount: amount,
          currency_id: "ARS"
        },
        back_url: backUrl,
        status: "pending"
      })
    });
    const subscription = await mpResponse.json();
    if (!mpResponse.ok || !subscription.id || !subscription.init_point) {
      throw new Error(subscription.message || "Mercado Pago rechazó la suscripción.");
    }

    await fetch(`${process.env.SUPABASE_URL}/rest/v1/institution_subscriptions?on_conflict=request_id`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        request_id: institutionRequest.id,
        user_id: user.id,
        plan,
        billing_cycle: billing,
        amount,
        currency: "ARS",
        provider_subscription_id: subscription.id,
        status: subscription.status || "pending",
        init_point: subscription.init_point,
        updated_at: new Date().toISOString()
      })
    });
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/institution_requests?id=eq.${encodeURIComponent(institutionRequest.id)}`, {
      method: "PATCH",
      headers: serviceHeaders(),
      body: JSON.stringify({
        subscription_status: subscription.status || "pending",
        mercadopago_subscription_id: subscription.id
      })
    });
    return sendJson(response, 200, { init_point: subscription.init_point });
  } catch (error) {
    console.error("No se pudo crear la suscripción:", error);
    return sendJson(response, 500, { error: "No pudimos iniciar el pago. Revisá la configuración de Mercado Pago en Vercel." });
  }
}
