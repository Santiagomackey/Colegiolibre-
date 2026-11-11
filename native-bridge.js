(() => {
  "use strict";

  const capacitor = window.Capacitor;
  const isNative = Boolean(capacitor?.isNativePlatform?.());
  if (isNative) document.documentElement.dataset.nativeApp = capacitor.getPlatform?.() || "true";

  let appearancePlugin;
  async function syncSystemAppearance() {
    if (!isNative || capacitor.getPlatform?.() !== "android") return;
    try {
      appearancePlugin ||= capacitor.registerPlugin?.("SystemAppearance") || capacitor.Plugins?.SystemAppearance;
      if (!appearancePlugin?.setTheme) return;
      const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      const result = await appearancePlugin.setTheme({theme});
      if (Number.isFinite(result?.bottomInset)) {
        document.documentElement.style.setProperty("--cl-native-bottom", `${Math.max(0,result.bottomInset)}px`);
      }
    } catch (_) { /* Older installed APKs keep working until rebuilt. */ }
  }
  window.addEventListener("colegiolibre:themechange", syncSystemAppearance);
  document.addEventListener("visibilitychange", () => {if (!document.hidden) void syncSystemAppearance()});
  void syncSystemAppearance();

  // Capacitor serves bundled HTML/JS from a local app origin. Relative `/api/...`
  // requests would otherwise stay inside the WebView and never reach Vercel.
  // Route all ColegioLibre backend calls through the production web origin.
  if (isNative && !window.__colegioLibreNativeFetchPatched) {
    window.__colegioLibreNativeFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let nextInput = input;

      if (typeof input === "string" && input.startsWith("/api/")) {
        nextInput = `https://www.colegiolibre.com${input}`;
      } else if (input instanceof Request) {
        try {
          const url = new URL(input.url);
          if ((url.hostname === "localhost" || url.hostname.endsWith(".localhost")) && url.pathname.startsWith("/api/")) {
            nextInput = new Request(`https://www.colegiolibre.com${url.pathname}${url.search}`, input);
          }
        } catch (_error) {
          // Keep the original request if it cannot be normalized.
        }
      }

      return originalFetch(nextInput, init);
    };
  }

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

  const pushState = {permission:'prompt', registered:false, error:null};
  const plugin = name => capacitor?.Plugins?.[name] || (isNative ? capacitor?.registerPlugin?.(name) : null);
  const notificationPath = value => {
    try {
      const url = new URL(value || '/', 'https://www.colegiolibre.com/');
      if (!['https://www.colegiolibre.com','https://colegiolibre.com',window.location?.origin].includes(url.origin)) return '/';
      const page = url.pathname.replace(/\.html$/, '') || '/';
      return ['/', '/producto', '/mensajes', '/perfil', '/favoritos', '/busco', '/compra', '/pedidos'].includes(page) ? page+url.search : '/';
    } catch (_) {return '/'}
  };
  const publishPushState = () => window.dispatchEvent(new CustomEvent('colegiolibre:pushstatechange',{detail:{...pushState}}));
  async function notificationStatus() {
    if (!isNative) return {supported:false,registered:false};
    try {
      const push = plugin('PushNotifications');
      const permissions = await push?.checkPermissions();
      pushState.permission = permissions?.receive || 'denied';
      const display=await plugin('LocalNotifications')?.checkPermissions?.();
      if(display?.display==='denied')pushState.permission='denied';
      if(pushState.permission!=='granted')pushState.registered=false;
      return {supported:Boolean(push),...pushState};
    } catch (_) {return {supported:false,...pushState}}
  }
  async function createNotificationChannels() {
    if (!isNative || capacitor.getPlatform?.() !== 'android') return;
    const channel={id:'colegiolibre-general',name:'Mensajes y alertas',description:'Mensajes y coincidencias de materiales',importance:4,visibility:0,vibration:true,lights:true,lightColor:'#67C23A'};
    await plugin('PushNotifications')?.createChannel?.(channel);
    await plugin('LocalNotifications')?.createChannel?.(channel);
  }

  async function requestNotificationPermission() {
    if (!isNative) return false;
    const pushNotifications = plugin("PushNotifications");
    if (pushNotifications) {
      let result = await pushNotifications.checkPermissions();
      if (result?.receive === "prompt" || result?.receive === "prompt-with-rationale") {
        result = await pushNotifications.requestPermissions();
      }
      pushState.permission = result?.receive || 'denied';
      publishPushState();
      if(result?.receive !== 'granted')return false;
      const local=plugin('LocalNotifications');
      const display=await local?.checkPermissions?.();
      if(display?.display==='denied'){pushState.permission='denied';publishPushState();return false;}
      return true;
    }
    if (!capacitor.Plugins?.LocalNotifications) return false;
    const result = await capacitor.Plugins.LocalNotifications.requestPermissions();
    return result?.display === "granted";
  }

  async function showNotification(title, options = {}) {
    if (!isNative || !plugin("LocalNotifications")) return false;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    await createNotificationChannels();
    await plugin("LocalNotifications").schedule({
      notifications: [{
        id: Math.floor(Date.now() % 2147483647),
        title,
        body: options.body || "",
        extra: { url: notificationPath(options.data?.url) },
        smallIcon: "ic_stat_colegiolibre",
        iconColor: "#67C23A",
        channelId: "colegiolibre-general"
      }]
    });
    return true;
  }

  async function initializeNativeListeners() {
    if (!isNative) return;
    const localNotifications = plugin("LocalNotifications");
    await localNotifications?.addListener?.("localNotificationActionPerformed", (event) => {
      const destination = event?.notification?.extra?.url;
      if (destination) window.location.href = notificationPath(destination);
    });

    const app = capacitor.Plugins?.App;
    const allowedPages = new Set([
      "/", "/producto", "/mensajes", "/favoritos",
      "/perfil", "/publicar", "/colegio", "/busco", "/login", "/compra", "/pedidos", "/mas"
    ]);
    const safeDestination = (rawValue, fallback = "/") => {
      try {
        const url = new URL(rawValue || fallback, "https://app.colegiolibre.local/");
        const page = url.pathname === "/" ? "/" : `/${url.pathname.split("/").filter(Boolean).pop()}`;
        return allowedPages.has(page) ? `${page}${url.search}` : fallback;
      } catch (_error) {
        return fallback;
      }
    };
    const openAppUrl = async (rawUrl) => {
      if (!rawUrl || !String(rawUrl).startsWith("colegiolibre://")) return;
      try {
        const url = new URL(rawUrl);
        await plugin("Browser")?.close?.().catch(() => {});
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
          const { data, error } = await window.colegioLibreSupabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (error) throw error;
          if(authType === "recovery" && data?.session?.user){
            window.sessionStorage.setItem("colegiolibre-password-recovery",JSON.stringify({createdAt:Date.now(),userId:data.session.user.id,next}));
          }
        }
        if (authType !== "recovery") {
          window.localStorage.removeItem("colegiolibre-pending-verification");
        }
        window.location.href = authType === "recovery"
          ? `/login?mode=recovery&next=${encodeURIComponent(next)}`
          : next;
      } catch (error) {
        console.error("No se pudo completar la verificación en la app:", error);
        window.location.href = "/login?verified=1";
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

    await initializePushNotifications().catch(() => {pushState.error="registration_failed";publishPushState()});
  }

  let pushListenersReady = false;
  async function initializePushNotifications() {
    const pushNotifications = plugin("PushNotifications");
    const client = window.colegioLibreSupabase;
    const api = window.colegioLibreApi;
    if (!isNative || !pushNotifications || !client || !api?.getCurrentUser) return false;

    if(capacitor.getPlatform?.() !== 'android'){pushState.error='platform_not_configured';publishPushState();return false;}
    const user = await api.getCurrentUser();
    if (!user) {pushState.error="sign_in_required";publishPushState();return false;}

    if (!pushListenersReady) {
      pushListenersReady = true;
      await pushNotifications.addListener("registration", async (token) => {
        const value = String(token?.value || "").trim();
        if (!value) return;
        const platform = capacitor.getPlatform?.() === "ios" ? "ios" : "android";
        try {
          const {error}=await client.rpc('register_push_token',{p_token:value,p_platform:platform});
          pushState.registered=!error;pushState.error=error?'token_save_failed':null;
        }catch(_){pushState.registered=false;pushState.error='token_save_failed';}
        publishPushState();
      });

      await pushNotifications.addListener("registrationError", (error) => {
        pushState.registered=false;pushState.error="registration_failed";publishPushState();
      });

      await pushNotifications.addListener("pushNotificationReceived", (notification) => {
        if (capacitor.getPlatform?.() === "ios") return;
        const data = notification?.data || {};
        void showNotification(notification?.title || "ColegioLibre", {
          body: notification?.body || "Tenés un nuevo aviso.",
          data: { url: data.url || data.action_url || "/" }
        });
      });

      await pushNotifications.addListener(
        "pushNotificationActionPerformed",
        (event) => {
          const data = event?.notification?.data || {};
          const destination = data.url || data.action_url;
          if (destination) window.location.href = notificationPath(destination);
        }
      );
    }

    const granted = await requestNotificationPermission();
    if (!granted) return;

    await createNotificationChannels();
    pushState.error=null;
    await pushNotifications.register();
    return true;
  }

  let pushRefreshPending = false;
  function refreshPushRegistration() {
    if (pushRefreshPending) return;
    pushRefreshPending = true;
    window.setTimeout(async () => {
      pushRefreshPending = false;
      await initializePushNotifications().catch(() => {pushState.error="registration_failed";publishPushState()});
    }, 250);
  }

  const authSubscription = window.colegioLibreSupabase?.auth?.onAuthStateChange?.(
    (event) => {
      if (event === "SIGNED_OUT" && isNative) {
        pushState.registered=false;
        void plugin('PushNotifications')?.unregister?.().catch(() => {});
        publishPushState();
      }
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
    enablePushNotifications: initializePushNotifications,
    notificationStatus,
    showNotification,
    takePhoto
  };

  void initializeNativeListeners();
})();
