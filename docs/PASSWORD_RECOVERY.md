# Password recovery — v1.0.31

The reset email must lead to `/recovery-callback`, then `/login?mode=recovery`.
A recovery link that falls back to the homepage is forwarded before the Supabase SDK or normal signed-in routing can consume its credentials. The callback owns its exchange: PKCE codes, recovery token hashes, and legacy implicit token fragments are supported. Successful recovery records a short-lived marker tied to the returned user. Expired/missing links never reuse an unrelated existing session.

Phone users complete the reset in the browser. The callback no longer launches the Android app solely because the device is a phone. Existing explicit native recovery callbacks remain supported. No new password or reset tokens are logged.

## Supabase project settings

In Authentication → URL Configuration:

- Site URL: `https://www.colegiolibre.com`
- Allow this exact Redirect URL: `https://www.colegiolibre.com/recovery-callback`
- Keep existing OAuth/signup callback entries. Do not replace the entire list.

In Authentication → Email Templates → Reset Password, the standard link should use `{{ .ConfirmationURL }}`. A link pointing only to `{{ .SiteURL }}` has no recovery credentials and cannot authorize a password change. Restore the default reset template if it was customized incorrectly. The application also accepts `token_hash` with `type=recovery` for deliberately configured templates.

These dashboard settings were not changed from this workspace; no Supabase management credentials are available. The email template and delivery must be verified in the real project.

## Verification

Automated coverage includes homepage/login forwarding, exactly-once exchanges, valid PKCE/token-hash/implicit callbacks, expired links with an already signed-in account, marker expiry, and internal-only return destinations. Browser QA uses a mocked account and password-update API; it confirms form validation, simulated successful save, and the expired-link screen. No real account password was changed and no reset email was sent by the agent.

After deployment, request a **new** reset email. Open it on desktop and phone, verify that the new-password form appears, save a new password yourself, and sign in with it. Used or expired links should offer a new reset request, not sign in to an existing account.

Official references:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
