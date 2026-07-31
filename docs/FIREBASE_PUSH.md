# Firebase Push — ColegioLibre

## Archivos de aplicación

- Android: `mobile-app/firebase/google-services.json`.
- iOS: `mobile-app/firebase/GoogleService-Info.plist` (pendiente).

El script `npm run sync` copia automáticamente la configuración Android a
`mobile-app/android/app/google-services.json`.

## Supabase

Ejecutar `database/04_push_notifications.sql` para crear el registro seguro de
dispositivos.

Crear un Database Webhook sobre `public.notifications`:

- Evento: `INSERT`.
- Método: `POST`.
- URL: `https://TU_DOMINIO/api/push-notification`.
- Header: `x-push-secret` con el mismo valor guardado en Vercel.

## Variables privadas de Vercel

Configurar en Production, Preview y Development:

- `FIREBASE_PROJECT_ID=colegiolibre-a8e21`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `SUPABASE_URL=https://riqhwmszshleyyaxlwqu.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUSH_WEBHOOK_SECRET`

`FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` salen de una cuenta de
servicio de Firebase/Google Cloud. Nunca deben guardarse en GitHub.

## Flujo

1. La APK solicita permiso y obtiene un token FCM.
2. La función `register_push_token` lo asocia al usuario de Supabase.
3. Una fila nueva en `notifications` dispara el webhook.
4. Vercel firma una solicitud OAuth y envía el aviso mediante FCM HTTP v1.
5. Al tocar el aviso, la app abre `action_url`.

