(() => {
  "use strict";

  const DISMISS_KEY = "colegiolibre-pwa-install-dismissed";
  const APK_URL = "./downloads/ColegioLibre-1.0.22.apk";
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isAndroid = /android/i.test(window.navigator.userAgent);
  const isNativeApp =
    window.Capacitor?.isNativePlatform?.() === true ||
    window.location.protocol === "capacitor:";
  const isMobileDevice =
    window.navigator.userAgentData?.mobile === true ||
    /iphone|ipod|android.+mobile|windows phone/i.test(window.navigator.userAgent);
  const isHome = ["", "/", "/index.html"].includes(window.location.pathname);
  let refreshing = false;

  if (isStandalone) document.documentElement.dataset.displayMode = "standalone";

  function language() {
    return document.documentElement.dataset.language === "en" ? "en" : "es";
  }

  function copy() {
    return language() === "en"
      ? {
          installTitle: "Download ColegioLibre",
          installText: "Android version 1.0.22 · 9.5 MB",
          install: "Download APK",
          close: "Not now",
          updateTitle: "A new version is ready",
          updateText: "Update to get the latest improvements.",
          update: "Update",
          later: "Later"
        }
      : {
          installTitle: "Descargá ColegioLibre",
          installText: "Versión Android 1.0.22 · 9,5 MB",
          install: "Descargar APK",
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
      !isAndroid ||
      isNativeApp ||
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
        <p>${text.installText}</p>
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

    card.querySelector("#pwa-install-button").addEventListener("click", () => {
      window.location.assign(APK_URL);
    });

    return card;
  }

  function showInstallCard() {
    if (sessionStorage.getItem(DISMISS_KEY) === "true") return;
    const card = createInstallCard();
    if (!card) return;
    card.hidden = false;
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
    showInstallCard();
  });

  window.addEventListener("appinstalled", () => {
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
