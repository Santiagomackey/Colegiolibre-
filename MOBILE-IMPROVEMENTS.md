# ColegioLibre — mobile quality pass (2026-11-07)

## Changes
- Fixed mobile navigation detection for both clean URLs (`/perfil`) and direct `.html` paths (`/perfil.html`), including `/index.html`.
- Improved small-screen nav sizing, safe-area bottom spacing and content clearance.
- Improved input sizing to prevent iOS auto-zoom, horizontal overflow containment, image scaling, visible keyboard focus and reduced-motion support.
- Updated mobile asset cache versions on pages that load the shared navigation.

## Important deployment note
The Capacitor configuration includes `server.url=https://colegiolibre.com`. The installed native app therefore loads the **deployed website**, not the bundled `www` files. Deploy the root web files to the live domain to see these improvements in the native app. Do not remove `server.url` without reviewing relative `/api` routes, OAuth callbacks, push integration and deep links.

## Verification
Run `npm test`, `npm run validate` and test the deployed pages on actual Android/iOS phones. Existing test failures may be unrelated to the mobile changes. A native APK was not built here.
