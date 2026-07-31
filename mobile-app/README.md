# Aplicación móvil de ColegioLibre

Requiere Node.js 20 o posterior.

```bash
npm install
npm run sync
```

Primera generación de plataformas:

```bash
npx cap add android
npx cap add ios
npm run assets
```

Abrir Android Studio:

```bash
npm run android
```

Abrir Xcode en una Mac:

```bash
npm run ios
```

La aplicación usa la misma web y Supabase que Vercel. Incluye cámara,
notificaciones locales y push mediante Firebase, OAuth mediante navegador
seguro y bloqueo vertical.

Android ya incluye `firebase/google-services.json`. Para activar el registro de
dispositivos, ejecutar `database/04_push_notifications.sql` en Supabase.
Las credenciales privadas de la cuenta de servicio Firebase y de Supabase se
guardan únicamente como variables de entorno de Vercel.
