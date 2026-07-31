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

Para instalar o actualizar el bot, ejecutar `database/03_institution_bot.sql`
en Supabase. La migración es repetible y agrega:

- solicitudes institucionales verificables;
- aprobación y rechazo desde el panel global;
- asignación automática del administrador del colegio;
- notificaciones gratuitas para administradores y representantes.

Las notificaciones aparecen dentro de ColegioLibre y, si el usuario habilitó
los permisos, también se muestran en el dispositivo mientras la aplicación
está activa.
