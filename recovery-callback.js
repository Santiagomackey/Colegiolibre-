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
    title.textContent = "El enlace no está disponible";
    message.textContent = "Puede haber vencido o ya haber sido utilizado. Pedí un enlace nuevo desde Iniciar sesión.";
    loader.hidden = true;
    action.href = "login.html";
    action.textContent = "Volver a iniciar sesión";
    action.hidden = false;
  }

  async function finish() {
    try {
      const { data, error } = await window.colegioLibreSupabase.auth.getSession();
      if (error) throw error;
      if (!data?.session && !hash.includes("access_token=")) throw new Error("missing recovery session");

      if (mobile && hash.includes("access_token=")) {
        const deepLink = `colegiolibre://auth/callback?type=recovery&next=${encodeURIComponent(next)}${hash}`;
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
