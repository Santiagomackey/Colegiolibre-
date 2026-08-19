# Autenticación de ColegioLibre

## URLs de producción

En Supabase > Authentication > URL Configuration:

- Site URL: `https://colegiolibre.com`
- Redirect URL: `https://colegiolibre.com/**`
- Mientras se use Vercel: `https://colegiolibre.vercel.app/**`
- Callback obligatorio de verificación: `https://colegiolibre.vercel.app/auth-callback.html`

## Verificación de email antes de lanzar

En Supabase, abrí **Authentication → URL Configuration** y agregá la URL del
callback anterior a **Redirect URLs**. Después, en **Authentication → Providers
→ Email**, activá **Confirm email**. De esta forma una cuenta nueva no puede
iniciar sesión hasta tocar el enlace recibido.

El callback incluido detecta el dispositivo: en una computadora continúa en la
website; en Android intenta abrir `colegiolibre://auth/callback` y transfiere la
sesión verificada a la aplicación. Si la app no está instalada, ofrece continuar
en la website.
- Aplicación móvil: `colegiolibre://auth/callback`

## Método activo

La versión actual utiliza email y contraseña con confirmación de cuenta y
recuperación segura. Los accesos con Google y Apple fueron retirados de la
interfaz para mantener el mismo flujo en web, Android y iPhone.

Supabase puede conservar Google configurado sin mostrarlo en la aplicación.
Apple se podrá agregar más adelante cuando exista una membresía activa de Apple
Developer.
