# ColegioLibre — Unified web and mobile design

- The login and create-account views now use the same clean, centered visual style on desktop and mobile.
- Existing email/password, password recovery, registration and Google OAuth code is retained.
- The editorial footer now shows all useful sections on the mobile website and bundled native app; older mobile hiding rules are overridden.
- Updated stylesheet cache versions across web and bundled mobile HTML.

Important: the Capacitor app may load the live website via server.url. Deploy the web files to the configured live domain for changes to appear in that mode. Google OAuth still requires Supabase and Google Cloud provider configuration, including correct callback URLs.
