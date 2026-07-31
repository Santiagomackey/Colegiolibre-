import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.colegiolibre.app",
  appName: "ColegioLibre",
  webDir: "www",
  bundledWebRuntime: false,
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"]
    },
    LocalNotifications: {
      smallIcon: "ic_stat_colegiolibre",
      iconColor: "#67C23A"
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0B2E6B",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    }
  }
};

export default config;
