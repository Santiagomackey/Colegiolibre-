# Google login setup (required)

The Google button is now connected to Supabase `signInWithOAuth`. It will only work after provider configuration.

1. In Google Cloud Console, configure OAuth consent screen and create a Web application OAuth client.
2. Add the Supabase callback URL shown under Supabase Authentication > Providers > Google as an authorized redirect URI in Google Cloud.
3. In Supabase Authentication > Providers > Google, enable Google and enter the client ID and secret. Do not commit secrets to this repository.
4. In Supabase Authentication > URL Configuration, allow `https://colegiolibre.vercel.app/auth-callback` and the actual production domain callback. Set the production Site URL correctly.
5. Test signup and login with Google, callback session persistence, existing accounts, sign-out, and next-page navigation.
6. Native Android/iOS: OAuth from an external browser requires an app deep-link/universal-link return path, browser close, and session handling. The current native Capacitor configuration loads the remote site; native Google OAuth must be tested on device before release.

No Google client secret is embedded in the app.
