# Autenticación de ColegioLibre

## URLs de producción

En Supabase > Authentication > URL Configuration:

- Site URL: `https://colegiolibre.com`
- Redirect URL: `https://colegiolibre.com/**`
- Mientras se use Vercel: `https://colegiolibre.vercel.app/**`
- Aplicación móvil: `colegiolibre://auth/callback`

## Método activo

La versión actual utiliza email y contraseña con confirmación de cuenta y
recuperación segura. Los accesos con Google y Apple fueron retirados de la
interfaz para mantener el mismo flujo en web, Android y iPhone.

Supabase puede conservar Google configurado sin mostrarlo en la aplicación.
Apple se podrá agregar más adelante cuando exista una membresía activa de Apple
Developer.
