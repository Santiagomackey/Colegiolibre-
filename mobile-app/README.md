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
notificaciones locales, preparación para push, OAuth mediante navegador
seguro y bloqueo vertical. Las credenciales de Firebase, APNs, Google y Apple
no se guardan en el repositorio.
