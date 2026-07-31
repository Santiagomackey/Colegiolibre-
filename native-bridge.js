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
        iconColor: "#67C23A"
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

  async function initializePushNotifications() {
    const pushNotifications = capacitor.Plugins?.PushNotifications;
    const client = window.colegioLibreSupabase;
    const api = window.colegioLibreApi;
    if (!pushNotifications || !client || !api?.getCurrentUser) return;

    const user = await api.getCurrentUser();
    if (!user) return;

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

    await pushNotifications.addListener(
      "pushNotificationActionPerformed",
      (event) => {
        const data = event?.notification?.data || {};
        const destination = data.url || data.action_url;
        if (destination) window.location.href = destination;
      }
    );

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

  window.colegioLibreNative = {
    isNative,
    platform: isNative ? capacitor.getPlatform?.() : "web",
    requestNotificationPermission,
    showNotification,
    takePhoto
  };

  void initializeNativeListeners();
})();
