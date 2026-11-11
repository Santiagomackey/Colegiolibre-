package com.colegiolibre.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.view.View;
import android.view.Gravity;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private View navigationSurface;

    @Override
    protected void load() {
        // Configure the viewport before Capacitor starts loading the website.
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView != null) {
            webView.getSettings().setUseWideViewPort(false);
            webView.getSettings().setLoadWithOverviewMode(false);
        }
        super.load();
    }

    private void paintNavigationInset(int surface) {
        if (Build.VERSION.SDK_INT < 35) return;
        View decor = getWindow().getDecorView();
        if (!(decor instanceof FrameLayout)) return;
        if (navigationSurface == null) {
            navigationSurface = new View(this);
            navigationSurface.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            navigationSurface.setClickable(false);
            navigationSurface.setFocusable(false);
            navigationSurface.setElevation(64 * getResources().getDisplayMetrics().density);
            FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, 0, Gravity.BOTTOM);
            ((FrameLayout) decor).addView(navigationSurface, layout);
            ViewCompat.setOnApplyWindowInsetsListener(navigationSurface, (view, insets) -> {
                FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) view.getLayoutParams();
                int height = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
                if (params.height != height) {
                    params.height = height;
                    view.setLayoutParams(params);
                }
                return insets;
            });
            ViewCompat.requestApplyInsets(navigationSurface);
        }
        navigationSurface.setBackgroundColor(surface);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel("colegiolibre-general", "Mensajes y alertas", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Mensajes y coincidencias de materiales");
            channel.enableVibration(true);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        applySystemTheme(currentTheme());
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemTheme(currentTheme());
    }

    private String currentTheme() {
        String stored = getSharedPreferences("colegiolibre_appearance", 0)
            .getString("theme", null);
        if ("dark".equals(stored) || "light".equals(stored)) return stored;
        boolean dark = (getResources().getConfiguration().uiMode
            & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        return dark ? "dark" : "light";
    }

    @SuppressWarnings("deprecation")
    public void applySystemTheme(String theme) {
        boolean dark = "dark".equals(theme);
        int surface = Color.parseColor(dark ? "#07090C" : "#FFFFFF");
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(surface));
        window.getDecorView().setBackgroundColor(surface);
        if (findViewById(android.R.id.content) != null) {
            findViewById(android.R.id.content).setBackgroundColor(surface);
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(surface);
        }
        // Paint behind transparent gesture bars natively, even before web CSS loads.
        paintNavigationInset(surface);
        window.setStatusBarColor(Build.VERSION.SDK_INT >= 35 ? Color.TRANSPARENT : surface);
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= 35 ? Color.TRANSPARENT : surface);
        if (Build.VERSION.SDK_INT >= 28) window.setNavigationBarDividerColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
}
