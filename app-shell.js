(() => {
  const native = window.Capacitor?.isNativePlatform?.() === true ||
    window.location.protocol === "capacitor:";
  const mobileStandalone = navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone) and (any-pointer: coarse)").matches;

  if (native) document.documentElement.dataset.nativeApp = window.Capacitor?.getPlatform?.() || "true";
  if (native || mobileStandalone) {
    document.documentElement.dataset.appShell = "true";
  }
})();
