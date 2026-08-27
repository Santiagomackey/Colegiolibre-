(() => {
  "use strict";

  const DISMISS_KEY = "colegiolibre-pwa-install-dismissed";
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isMobileDevice =
    window.navigator.userAgentData?.mobile === true ||
    /iphone|ipod|android.+mobile|windows phone/i.test(window.navigator.userAgent);
  const isHome = ["", "/", "/index.html"].includes(window.location.pathname);
  let installPrompt = null;
  let refreshing = false;

  if (isStandalone) document.documentElement.dataset.displayMode = "standalone";

  function language() {
    return document.documentElement.dataset.language === "en" ? "en" : "es";
  }

  function copy() {
    return language() === "en"
      ? {
          installTitle: "Install ColegioLibre",
          installText: "Use it like an app from your home screen.",
          iosText: "In Safari, tap Share and then “Add to Home Screen”.",
          install: "Install",
          close: "Not now",
          updateTitle: "A new version is ready",
          updateText: "Update to get the latest improvements.",
          update: "Update",
          later: "Later"
        }
      : {
          installTitle: "Instalá ColegioLibre",
          installText: "Usala como una app desde tu pantalla de inicio.",
          iosText: "En Safari, tocá Compartir y después “Agregar a inicio”.",
          install: "Instalar",
          close: "Ahora no",
          updateTitle: "Hay una nueva versión",
          updateText: "Actualizá para recibir las últimas mejoras.",
          update: "Actualizar",
          later: "Después"
        };
  }

  function createInstallCard() {
    if (
      !isMobileDevice ||
      !isHome ||
      isStandalone
    ) return null;

    const existingCard = document.getElementById("pwa-install-card");
    if (existingCard) return existingCard;

    const text = copy();
    const card = document.createElement("aside");
    card.className = "pwa-install-card";
    card.id = "pwa-install-card";
    card.hidden = true;
    card.setAttribute("aria-live", "polite");
    card.innerHTML = `
      <img class="pwa-install-card__icon" src="./images/icon-192.png" alt="" />
      <div class="pwa-install-card__copy">
        <strong>${text.installTitle}</strong>
        <p>${isIOS ? text.iosText : text.installText}</p>
      </div>
      <div class="pwa-install-card__actions">
        <button id="pwa-install-button" type="button">${text.install}</button>
        <button class="pwa-install-card__dismiss" id="pwa-install-dismiss" type="button" aria-label="${text.close}">×</button>
      </div>
    `;
    document.body.appendChild(card);

    card.querySelector("#pwa-install-dismiss").addEventListener("click", () => {
      sessionStorage.setItem(DISMISS_KEY, "true");
      card.hidden = true;
    });

    card.querySelector("#pwa-install-button").addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      card.hidden = true;
    });

    return card;
  }

  function showInstallCard() {
    if (sessionStorage.getItem(DISMISS_KEY) === "true") return;
    const card = createInstallCard();
    if (!card) return;
    const installButton = card.querySelector("#pwa-install-button");
    installButton.hidden = isIOS || !installPrompt;
    card.hidden = !(installPrompt || isIOS);
  }

  function showUpdate(registration) {
    if (document.getElementById("pwa-update-toast")) return;
    const text = copy();
    const toast = document.createElement("aside");
    toast.className = "pwa-update-toast";
    toast.id = "pwa-update-toast";
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = `
      <strong>${text.updateTitle}</strong>
      <p>${text.updateText}</p>
      <div class="pwa-update-toast__actions">
        <button id="pwa-update-now" type="button">${text.update}</button>
        <button class="pwa-update-toast__later" id="pwa-update-later" type="button">${text.later}</button>
      </div>
    `;
    document.body.appendChild(toast);

    toast.querySelector("#pwa-update-now").addEventListener("click", () => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
    toast.querySelector("#pwa-update-later").addEventListener("click", () => {
      toast.hidden = true;
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    showInstallCard();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    document.getElementById("pwa-install-card")?.remove();
  });

  if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js", {
          scope: "/"
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdate(registration);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdate(registration);
            }
          });
        });
      } catch {
        // La web sigue funcionando aunque el navegador no permita instalar la PWA.
      }
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showInstallCard, { once: true });
  } else {
    showInstallCard();
  }
})();
