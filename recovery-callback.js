(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "index.html";
  const recoveryCode = params.get("code") || "";
  const hash = location.hash || "";
  const title = document.querySelector("#callback-title");
  const message = document.querySelector("#callback-message");
  const loader = document.querySelector("#callback-loader");
  const action = document.querySelector("#callback-action");
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function showError() {
    title.textContent = "El enlace no está disponible";
    message.textContent = "Puede haber vencido o ya haber sido utilizado. Pedí un enlace nuevo desde Iniciar sesión.";
    loader.hidden = true;
    action.href = "login.html";
    action.textContent = "Volver a iniciar sesión";
    action.hidden = false;
  }

  async function finish() {
    try {
      const client = window.colegioLibreSupabase;
      let session = null;

      /* Supabase puede entregar recuperación con PKCE (?code=...) o con los
         tokens en el hash. Procesamos ambos explícitamente para que nunca se
         confunda una recuperación con un inicio de sesión normal. */
      if (recoveryCode) {
        const { data, error } = await client.auth.exchangeCodeForSession(recoveryCode);
        if (error) {
          /* El cliente puede haber canjeado el código automáticamente antes de
             ejecutar este archivo. En ese caso recuperamos esa misma sesión. */
          const current = await client.auth.getSession();
          if (current.error || !current.data?.session) throw error;
          session = current.data.session;
        } else {
          session = data?.session || null;
        }
      } else if (hash.includes("access_token=")) {
        const values = new URLSearchParams(hash.replace(/^#/, ""));
        const accessToken = values.get("access_token");
        const refreshToken = values.get("refresh_token");
        if (!accessToken || !refreshToken) throw new Error("missing recovery tokens");
        const { data, error } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (error) throw error;
        session = data?.session || null;
      } else {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        session = data?.session || null;
      }

      if (!session?.user) throw new Error("missing recovery session");

      const recoveryMarker = {
        createdAt: Date.now(),
        next
      };
      window.sessionStorage.setItem(
        "colegiolibre-password-recovery",
        JSON.stringify(recoveryMarker)
      );

      if (mobile && session.access_token && session.refresh_token) {
        const tokenHash = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          type: "recovery"
        }).toString();
        const deepLink = `colegiolibre://auth/callback?type=recovery&next=${encodeURIComponent(next)}#${tokenHash}`;
        title.textContent = "Creá tu nueva contraseña";
        message.textContent = "Estamos abriendo la aplicación de ColegioLibre…";
        action.href = deepLink;
        action.textContent = "Abrir la aplicación";
        action.hidden = false;
        location.href = deepLink;
        window.setTimeout(() => {
          const webTarget = `login.html?mode=recovery&next=${encodeURIComponent(next)}`;
          message.textContent = "Si la aplicación no se abrió, continuá de forma segura en la website.";
          action.href = webTarget;
          action.textContent = "Cambiar contraseña en la website";
        }, 1400);
        return;
      }

      location.replace(`login.html?mode=recovery&next=${encodeURIComponent(next)}`);
    } catch (error) {
      console.error("Error preparando la recuperación:", error);
      showError();
    }
  }

  void finish();
})();
