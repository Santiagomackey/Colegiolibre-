import crypto from "node:crypto";

const FIREBASE_SCOPE =
  "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function sendJson(response, status, body) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function getGoogleAccessToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  if (!clientEmail || !privateKey) {
    throw new Error("Faltan las credenciales privadas de Firebase.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: FIREBASE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  );
  const unsignedToken = `${header}.${claims}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsignedToken), privateKey)
    .toString("base64url");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Firebase rechazó la credencial.");
  }
  return result.access_token;
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
}

async function loadTokens(userId) {
  const baseUrl = process.env.SUPABASE_URL;
  if (!baseUrl) throw new Error("Falta SUPABASE_URL.");
  const response = await fetch(
    `${baseUrl}/rest/v1/push_tokens?user_id=eq.${encodeURIComponent(
      userId
    )}&select=token,platform`,
    { headers: supabaseHeaders() }
  );
  if (!response.ok) throw new Error("No pudimos consultar los dispositivos.");
  return response.json();
}

async function removeInvalidToken(token) {
  const baseUrl = process.env.SUPABASE_URL;
  await fetch(
    `${baseUrl}/rest/v1/push_tokens?token=eq.${encodeURIComponent(token)}`,
    { method: "DELETE", headers: supabaseHeaders() }
  );
}

async function sendToDevice(accessToken, device, notification) {
  const projectId =
    process.env.FIREBASE_PROJECT_ID || "colegiolibre-a8e21";
  const url =
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/messages:send`;
  const actionUrl = String(notification.action_url || "/index.html");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        token: device.token,
        notification: {
          title: String(notification.title || "ColegioLibre").slice(0, 120),
          body: String(notification.body || "Tenés una nueva notificación.").slice(
            0,
            240
          )
        },
        data: {
          url: actionUrl,
          action_url: actionUrl,
          notification_id: String(notification.id || ""),
          type: String(notification.type || "general")
        },
        android: {
          priority: "high",
          notification: {
            channel_id: "colegiolibre-general",
            sound: "default"
          }
        },
        apns: {
          payload: {
            aps: {
              sound: "default"
            }
          }
        }
      }
    })
  });
  const result = await response.json();
  if (!response.ok) {
    const status = result?.error?.details?.[0]?.errorCode;
    if (status === "UNREGISTERED") await removeInvalidToken(device.token);
    throw new Error(status || result?.error?.message || "FCM rechazó el envío.");
  }
  return result;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Método no permitido." });
  }

  const expectedSecret = process.env.PUSH_WEBHOOK_SECRET;
  const receivedSecret = String(request.headers["x-push-secret"] || "");
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return sendJson(response, 401, { error: "Webhook no autorizado." });
  }

  const notification = request.body?.record || request.body;
  if (!notification?.user_id) {
    return sendJson(response, 400, { error: "La notificación no tiene usuario." });
  }

  try {
    const devices = await loadTokens(notification.user_id);
    if (!devices.length) {
      return sendJson(response, 200, { sent: 0, message: "Sin dispositivos registrados." });
    }

    const accessToken = await getGoogleAccessToken();
    const results = await Promise.allSettled(
      devices.map((device) => sendToDevice(accessToken, device, notification))
    );
    const sent = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - sent;

    return sendJson(response, failed ? 207 : 200, { sent, failed });
  } catch (error) {
    console.error("No se pudo enviar la notificación push:", error);
    return sendJson(response, 500, {
      error: "No pudimos enviar la notificación push."
    });
  }
};
