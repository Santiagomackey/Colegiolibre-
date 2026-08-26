(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "index.html";
  const source = params.get("source") === "app" ? "app" : "web";
  const confirmationCode = params.get("code") || "";
  const hash = location.hash || "";
  const title = document.querySelector("#callback-title");
  const message = document.querySelector("#callback-message");
  const loader = document.querySelector("#callback-loader");
  const action = document.querySelector("#callback-action");

  function showError() {
    title.textContent = "No pudimos verificar el enlace";
    message.textContent = "El enlace puede haber vencido o ya fue utilizado. Podés volver a iniciar sesión.";
    loader.hidden = true;
    action.href = "login.html";
    action.textContent = "Volver a iniciar sesión";
    action.hidden = false;
  }

  async function resolveSession(client) {
    if (confirmationCode) {
      const exchanged = await client.auth.exchangeCodeForSession(confirmationCode);
      if (!exchanged.error && exchanged.data?.session) return exchanged.data.session;
      const current = await client.auth.getSession();
      if (current.error || !current.data?.session) throw exchanged.error || current.error;
      return current.data.session;
    }
    if (hash.includes("access_token=")) {
      const values = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = values.get("access_token");
      const refreshToken = values.get("refresh_token");
      if (!accessToken || !refreshToken) throw new Error("missing confirmation tokens");
      const result = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (result.error) throw result.error;
      return result.data?.session || null;
    }
    const current = await client.auth.getSession();
    if (current.error) throw current.error;
    return current.data?.session || null;
  }

  async function finish() {
    try {
      const session = await resolveSession(window.colegioLibreSupabase);
      if (!session?.user || !session.user.email_confirmed_at) throw new Error("missing confirmed session");
      window.localStorage.removeItem("colegiolibre-pending-verification");
      if (source === "app" && session.access_token && session.refresh_token) {
        const tokenHash = new URLSearchParams({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          type: "verification"
        }).toString();
        const deepLink = `colegiolibre://auth/callback?type=verification&next=${encodeURIComponent(next)}#${tokenHash}`;
        title.textContent = "¡Email verificado!";
        message.textContent = "Estamos abriendo la aplicación de ColegioLibre…";
        action.href = deepLink;
        action.textContent = "Abrir ColegioLibre";
        action.hidden = false;
        location.href = deepLink;
        window.setTimeout(() => {
          message.textContent = "Si la aplicación no se abrió, podés continuar en la website.";
          action.href = next;
          action.textContent = "Continuar en la website";
        }, 1600);
        return;
      }
      title.textContent = "¡Email verificado!";
      message.textContent = "Tu cuenta ya está activa. Estamos abriendo ColegioLibre…";
      window.setTimeout(() => location.replace(next), 750);
    } catch (error) {
      console.error("Error verificando email:", error);
      showError();
    }
  }
  void finish();
})();
