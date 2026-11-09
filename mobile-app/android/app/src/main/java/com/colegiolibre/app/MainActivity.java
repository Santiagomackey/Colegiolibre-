package com.colegiolibre.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
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
        // Android 15+ draws behind transparent bars. CSS paints the gesture inset.
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
