# ColegioLibre para Android y iOS

Esta carpeta contiene el contenedor nativo de ColegioLibre. La aplicación abre
la versión oficial publicada en Vercel y agrega acceso a cámara, navegación
nativa y avisos locales.

## Primera preparación

1. Instalá Node.js LTS y Android Studio.
2. Abrí una terminal dentro de `mobile-app`.
3. Ejecutá `npm install`.
4. Ejecutá `npm run sync`.
5. Para Android: `npm run open:android`.
6. Para iOS, desde una Mac con Xcode: `npm run open:ios`.

## Antes de publicar en las tiendas

- Reemplazar iconos y splash nativos por los definitivos.
- Definir firma y ficha de Play Console.
- Definir Team, Bundle ID y firma en Xcode.
- Agregar Firebase Cloud Messaging y APNs para avisos remotos con la app cerrada.
- Publicar una política de privacidad y completar los formularios de datos.

Los avisos incluidos en esta versión funcionan cuando ColegioLibre está abierto.
Los avisos remotos en segundo plano requieren FCM/APNs y no deben simularse sin
configurar esas plataformas.
