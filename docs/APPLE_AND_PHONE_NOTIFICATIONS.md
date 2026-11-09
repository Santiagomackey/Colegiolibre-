# Apple y notificaciones del teléfono

Esta entrega incluye código, no una configuración de producción ni un APK compilado. No se han probado cuentas reales de Apple ni un envío FCM a un teléfono desde este entorno.

## Apple

1. En Apple Developer, configurá Sign in with Apple, un Services ID para la web y su dominio. Registrá la URL de callback que muestra Supabase en Authentication → Sign In / Providers → Apple.
2. En ese proveedor de Supabase cargá el Services ID y el secreto generado con tu clave Apple. Habilitá el proveedor.
3. En Supabase → URL Configuration autorizá `https://www.colegiolibre.com/auth-callback` y el dominio de prueba que uses. Conservá la configuración de email existente.
4. La web usa `provider: apple` y el mismo callback de ColegioLibre. En Android abre el navegador del sistema con Capacitor Browser y vuelve por el enlace `colegiolibre://auth/callback` existente.
5. El secreto OAuth de Apple debe renovarse según su vencimiento. Guardalo en Supabase, nunca dentro del ZIP, JavaScript público o GitHub.
6. Probá una cuenta nueva, una existente, cancelación, email privado de Apple y el regreso a `/busco` desde Android. El nombre puede necesitar completarse en el perfil.

Referencia: https://supabase.com/docs/guides/auth/social-sign-in/auth-apple

## Avisos Android con la app cerrada

1. Ejecutá las migraciones necesarias del proyecto y `database/04_push_notifications.sql` para registrar dispositivos. Para mensajes ejecutá `database/07_v55_mobile_links_and_push.sql`. Para coincidencias ejecutá `database/09_alert_matches.sql` después de `05_growth_payments_forum.sql`, `08_marketplace_loop.sql` y las migraciones de moderación previas. No se ejecutaron automáticamente.
2. Configurá Firebase Cloud Messaging HTTP v1 y la cuenta de servicio. `mobile-app/firebase/google-services.json` ya se copia al proyecto Android al sincronizar.
3. En el servidor de Vercel configurá `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `PUSH_WEBHOOK_SECRET`. Usá los valores de tus propios proyectos; no los agregues al código cliente.
4. En Supabase creá un Database Webhook para `public.notifications`, eventos INSERT y UPDATE, POST a `https://www.colegiolibre.com/api/push-notification`, con el header `x-push-secret` que coincide con la variable del servidor. El endpoint omite los cambios de lectura y las actualizaciones sin nuevo contenido.
5. Desplegá la web y recompilá/reinstalá Android 1.0.26. El plugin Browser es nuevo y requiere `npm --prefix mobile-app ci` y `npm run android:apk`, o el workflow incluido de GitHub Actions. El entorno de edición no tiene Android SDK.
6. Iniciá sesión y tocá Activar avisos en Alertas o en la campana. Aceptá el permiso. Solo se muestra Avisos activados cuando el token del dispositivo pudo guardarse.
7. Con dos cuentas, enviá un mensaje y publicá un material que coincida con una búsqueda de la otra. Comprobá con la app abierta y en segundo plano/cerrada: aviso en la bandeja, sonido según los ajustes del teléfono y navegación correcta al tocarlo. Probá permiso denegado y cierre de sesión. Forzar la detención de la app en Android o bloquear el canal impide la entrega normal.

FCM muestra la notificación en segundo plano; en primer plano la app presenta un aviso local inmediato en el mismo canal. No usa una alarma exacta. El contenido se oculta en la pantalla bloqueada según los ajustes del usuario. Las URLs de destino están limitadas a páginas internas de ColegioLibre.

El navegador puede mostrar avisos mientras el sitio está abierto; esta entrega no agrega Web Push de fondo a una PWA. El emisor del servidor procesa tokens FCM de Android. iOS/APNs requiere una integración separada; no se considera configurado ni probado.

Referencias: https://capacitorjs.com/docs/v7/apis/push-notifications y https://firebase.google.com/docs/cloud-messaging/android/receive

## Alertas

La migración de coincidencias considera palabras de la búsqueda, tildes, alcance, presupuesto y aprobación. Crea una sola notificación por pareja alerta/producto, también cuando una publicación pasa de pendiente a aprobada. No se ejecutó ni probó en la base de producción: verificá estas condiciones con publicaciones de prueba antes de activar el webhook.
