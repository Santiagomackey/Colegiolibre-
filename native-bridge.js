(() => {
  "use strict";

  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  if (isNative) document.documentElement.dataset.nativeApp = capacitor.getPlatform?.() || "true";

  async function takePhoto() {
    if (!isNative || !capacitor.Plugins?.Camera) return null;
    try {
      const photo = await capacitor.Plugins.Camera.getPhoto({
        quality: 86,
        allowEditing: false,
        correctOrientation: true,
        resultType: "uri",
        source: "CAMERA",
        saveToGallery: false,
        width: 1800
      });
      if (!photo?.webPath) return null;
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const extension = blob.type.split("/")[1] || "jpeg";
      return new File([blob], `colegiolibre-${Date.now()}.${extension}`, {
        type: blob.type || "image/jpeg"
      });
    } catch (error) {
      if (/cancel/i.test(error?.message || "")) throw new Error("USER_CANCELLED");
      throw error;
    }
  }

  async function requestNotificationPermission() {
    if (!isNative) return false;
    const pushNotifications = capacitor.Plugins?.PushNotifications;
    if (pushNotifications) {
      let result = await pushNotifications.checkPermissions();
      if (result?.receive === "prompt" || result?.receive === "prompt-with-rationale") {
        result = await pushNotifications.requestPermissions();
      }
      return result?.receive === "granted";
    }
    if (!capacitor.Plugins?.LocalNotifications) return false;
    const result = await capacitor.Plugins.LocalNotifications.requestPermissions();
    return result?.display === "granted";
  }

  async function showNotification(title, options = {}) {
    if (!isNative || !capacitor.Plugins?.LocalNotifications) return false;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    await capacitor.Plugins.LocalNotifications.schedule({
      notifications: [{
        id: Math.floor(Date.now() % 2147483647),
        title,
        body: options.body || "",
        schedule: { at: new Date(Date.now() + 150) },
        extra: { url: options.data?.url || "index.html" },
        smallIcon: "ic_stat_colegiolibre",
        iconColor: "#67C23A",
        channelId: "colegiolibre-general"
      }]
    });
    return true;
  }

  async function initializeNativeListeners() {
    if (!isNative) return;
    const localNotifications = capacitor.Plugins?.LocalNotifications;
    await localNotifications?.addListener?.("localNotificationActionPerformed", (event) => {
      const destination = event?.notification?.extra?.url;
      if (destination) window.location.href = destination;
    });

    const app = capacitor.Plugins?.App;
    const allowedPages = new Set([
      "index.html", "producto.html", "mensajes.html", "favoritos.html",
      "perfil.html", "publicar.html", "colegio.html", "busco.html", "login.html"
    ]);
    const safeDestination = (rawValue, fallback = "index.html") => {
      try {
        const url = new URL(rawValue || fallback, "https://app.colegiolibre.local/");
        const page = url.pathname.split("/").filter(Boolean).pop() || "index.html";
        return allowedPages.has(page) ? `${page}${url.search}` : fallback;
      } catch (_error) {
        return fallback;
      }
    };
    const openAppUrl = async (rawUrl) => {
      if (!rawUrl || !String(rawUrl).startsWith("colegiolibre://")) return;
      try {
        const url = new URL(rawUrl);
        if (url.host === "open") {
          window.location.href = safeDestination(url.searchParams.get("path"));
          return;
        }
        if (url.host !== "auth" || url.pathname !== "/callback") return;
        const values = new URLSearchParams((url.hash || "").replace(/^#/, ""));
        const accessToken = values.get("access_token");
        const refreshToken = values.get("refresh_token");
        const next = safeDestination(url.searchParams.get("next"));
        const authType = url.searchParams.get("type") || values.get("type") || "verification";
        if (accessToken && refreshToken && window.colegioLibreSupabase?.auth?.setSession) {
          const { error } = await window.colegioLibreSupabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) throw error;
        }
        if (authType !== "recovery") {
          window.localStorage.removeItem("colegiolibre-pending-verification");
        }
        window.location.href = authType === "recovery"
          ? `login.html?mode=recovery&next=${encodeURIComponent(next)}`
          : next;
      } catch (error) {
        console.error("No se pudo completar la verificación en la app:", error);
        window.location.href = "login.html?verified=1";
      }
    };

    await app?.addListener?.("appUrlOpen", ({ url }) => void openAppUrl(url));
    const launch = await app?.getLaunchUrl?.();
    if (launch?.url) await openAppUrl(launch.url);

    await app?.addListener?.("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else app.minimizeApp?.();
    });

    try {
      await capacitor.Plugins?.ScreenOrientation?.lock?.({
        orientation: "portrait"
      });
    } catch (_error) {
      // La web sigue funcionando si el dispositivo no admite este bloqueo.
    }

    await initializePushNotifications();
  }

  let pushListenersReady = false;
  async function initializePushNotifications() {
    const pushNotifications = capacitor.Plugins?.PushNotifications;
    const client = window.colegioLibreSupabase;
    const api = window.colegioLibreApi;
    if (!pushNotifications || !client || !api?.getCurrentUser) return;

    const user = await api.getCurrentUser();
    if (!user) return;

    if (!pushListenersReady) {
      pushListenersReady = true;
      await pushNotifications.addListener("registration", async (token) => {
        const value = String(token?.value || "").trim();
        if (!value) return;
        const platform = capacitor.getPlatform?.() === "ios" ? "ios" : "android";
        const { error } = await client.rpc("register_push_token", {
          p_token: value,
          p_platform: platform
        });
        if (error) console.error("No se pudo registrar el dispositivo:", error);
      });

      await pushNotifications.addListener("registrationError", (error) => {
        console.error("Firebase no pudo registrar las notificaciones:", error);
      });

      await pushNotifications.addListener("pushNotificationReceived", (notification) => {
        const data = notification?.data || {};
        void showNotification(notification?.title || "ColegioLibre", {
          body: notification?.body || "Tenés un nuevo aviso.",
          data: { url: data.url || data.action_url || "index.html" }
        });
      });

      await pushNotifications.addListener(
        "pushNotificationActionPerformed",
        (event) => {
          const data = event?.notification?.data || {};
          const destination = data.url || data.action_url;
          if (destination) window.location.href = destination;
        }
      );
    }

    const granted = await requestNotificationPermission();
    if (!granted) return;

    if (capacitor.getPlatform?.() === "android") {
      await pushNotifications.createChannel({
        id: "colegiolibre-general",
        name: "Avisos de ColegioLibre",
        description: "Mensajes, operaciones y novedades de tu comunidad escolar",
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: "#67C23A"
      });
    }

    await pushNotifications.register();
  }

  let pushRefreshPending = false;
  function refreshPushRegistration() {
    if (pushRefreshPending) return;
    pushRefreshPending = true;
    window.setTimeout(async () => {
      pushRefreshPending = false;
      await initializePushNotifications();
    }, 250);
  }

  const authSubscription = window.colegioLibreSupabase?.auth?.onAuthStateChange?.(
    (event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        refreshPushRegistration();
      }
    }
  );

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshPushRegistration();
  });

  window.addEventListener("pagehide", () => {
    authSubscription?.data?.subscription?.unsubscribe?.();
  }, { once: true });

  window.colegioLibreNative = {
    isNative,
    platform: isNative ? capacitor.getPlatform?.() : "web",
    requestNotificationPermission,
    showNotification,
    takePhoto
  };

  void initializeNativeListeners();
})();
