# Shared navigation — v1.0.32

The supplied transparent PNG is used unchanged at `images/colegiolibre-logo-transparent.png`. It appears at the top right of the shared public header. The header contains a single search form, Messages/Favorites/account actions, the signed-in account name, and a compact navy secondary navigation strip. Categories use a native accessible dropdown; account/settings/orders are in the account menu. The language selector remains available in the strip on desktop and phones.

ColegioLibre now intentionally uses a light appearance. Retained dark preferences are reset before first paint, the dark-mode control is removed, and native/system colors receive the light theme. Existing dark CSS is retained for compatibility but is not selectable.

The canonical markup lives in `templates/site-header.html`; `npm run sync:header` copies it to 23 public pages. The header is present in initial HTML, not injected after hydration. The account and navigation controller is `site-header.js`; styles are isolated in `site-header.css` to avoid legacy per-page header overrides. Administrative consoles keep their specialized controls; authentication callback pages keep their minimal flow.

Browser QA checked desktop and 390px phone home/browse layouts, category opening, language placement and switching, and simulated signed-in Profile/Messages headers. Tests cover identical public markup, retained-dark preference handling, account names, translation, sign-out state and profile-read failure. No private messages, payment credentials or account settings were changed for QA. Android bundled web assets are synchronized; the ZIP contains source, not a compiled APK.
