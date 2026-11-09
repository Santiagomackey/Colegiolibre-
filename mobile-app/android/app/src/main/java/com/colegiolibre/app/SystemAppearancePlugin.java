package com.colegiolibre.app;

import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Theme only; no permissions, credentials or arbitrary native arguments. */
@CapacitorPlugin(name = "SystemAppearance")
public class SystemAppearancePlugin extends Plugin {
    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme");
        if (!"light".equals(theme) && !"dark".equals(theme)) {
            call.reject("Expected light or dark");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (!(getActivity() instanceof MainActivity)) {
                call.reject("Activity unavailable");
                return;
            }
            MainActivity activity = (MainActivity) getActivity();
            activity.getSharedPreferences("colegiolibre_appearance", 0)
                .edit().putString("theme", theme).apply();
            activity.applySystemTheme(theme);
            View view = activity.getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(view);
            JSObject result = new JSObject();
            result.put("theme", theme);
            if (insets != null) {
                float density = activity.getResources().getDisplayMetrics().density;
                result.put("bottomInset", Math.round(insets.getInsets(
                    WindowInsetsCompat.Type.navigationBars()).bottom / density));
            }
            call.resolve(result);
        });
    }
}
