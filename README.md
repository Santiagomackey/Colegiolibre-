# ColegioLibre

Marketplace de materiales escolares con página central y portales
personalizados para instituciones miembro.

## Estructura

- Archivos web en la raíz: despliegue directo en Vercel.
- `api/`: funciones serverless.
- `colegio/eccleston/`: respaldo físico de la ruta institucional.
- `database/`: migraciones de Supabase; no se publica.
- `docs/`: configuración operativa; no se publica.
- `mobile-app/`: proyecto Capacitor limpio; no se publica en Vercel.

## URLs

- `/`: ColegioLibre general.
- `/colegio/eccleston`: portal de Eccleston.
- `/instituciones-admin.html`: administración global de instituciones.
- `/instituciones.html`: bot gratuito de solicitudes institucionales.

## Despliegue

Subir el contenido completo al repositorio conectado con Vercel. El archivo
`.vercelignore` evita publicar código móvil, documentación y SQL.

No ejecutar nuevamente una migración que ya haya sido aplicada.

Para activar el bot, ejecutar una vez `database/03_institution_bot.sql`.
