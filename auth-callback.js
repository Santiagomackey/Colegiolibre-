(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const next = params.get("next") || "index.html";
  const hash = location.hash || "";
  const title = document.querySelector("#callback-title");
  const message = document.querySelector("#callback-message");
  const loader = document.querySelector("#callback-loader");
  const action = document.querySelector("#callback-action");
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function showError() {
    title.textContent = "No pudimos verificar el enlace";
    message.textContent = "El enlace puede haber vencido o ya fue utilizado. Podés volver a iniciar sesión.";
    loader.hidden = true;
    action.hidden = false;
  }

  async function finish() {
    try {
      const { data, error } = await window.colegioLibreSupabase.auth.getSession();
      if (error) throw error;
      if (!data?.session && !hash.includes("access_token=")) throw new Error("missing session");
      window.sessionStorage.removeItem("colegiolibre-pending-verification");
      if (mobile && hash.includes("access_token=")) {
        const deepLink = `colegiolibre://auth/callback?next=${encodeURIComponent(next)}${hash}`;
        title.textContent = "Email verificado";
        message.textContent = "Estamos abriendo la aplicación de ColegioLibre…";
        action.href = deepLink;
        action.textContent = "Abrir la aplicación";
        action.hidden = false;
        location.href = deepLink;
        window.setTimeout(() => {
          message.textContent = "Si la aplicación no se abrió, podés continuar en la website.";
          action.href = next;
          action.textContent = "Continuar en la website";
        }, 1400);
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
