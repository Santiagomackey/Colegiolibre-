# ColegioLibre

Marketplace de materiales escolares usados para estudiantes de Argentina.

## Desarrollo local

El proyecto es un sitio estático hecho con HTML, CSS y JavaScript. Para probarlo localmente, ejecutá un servidor web dentro de esta carpeta. Por ejemplo:

```bash
python3 -m http.server 8000
```

Después abrí `http://localhost:8000`.

## Publicación

El sitio está preparado para desplegarse en Vercel sin un comando de compilación. El directorio raíz del proyecto debe ser esta carpeta.

## Backend

La autenticación y los datos utilizan Supabase. La clave incluida en el frontend es una clave pública (`publishable`); nunca agregues una clave `service_role` ni otros secretos privados al repositorio.

## Auditoría antes de publicar

Ejecutá:

```bash
node scripts/validate-project.mjs
node scripts/audit-release.mjs
```

Después completá `PRUEBAS-ANTES-DE-LANZAR.txt` con dos cuentas de prueba. El
análisis automático valida estructura, seguridad y referencias; las acciones
entre usuarios necesitan una prueba real contra Supabase.

## Configuración final de producción

Después de ejecutar los archivos SQL anteriores, abrí un Query nuevo en Supabase
y ejecutá:

`sql/8_ENDURECER_PRODUCCION_Y_AUDITORIA.sql`

Este archivo agrega:

- Galería persistente de hasta seis imágenes por producto.
- Índices para productos, favoritos, mensajes y notificaciones.
- Historial administrativo.
- Límites básicos contra spam.
- Desactivación segura de cuenta.

## Lanzamiento nacional

La versión nacional agrega políticas de Storage por usuario, catálogo público
solo para productos aprobados, validación de publicaciones, límites contra
abuso, retención y plantillas de email. Seguí `LANZAMIENTO-NACIONAL.txt`,
ejecutá `sql/11_PREPARAR_LANZAMIENTO_NACIONAL.sql` en Supabase y validá con:

```bash
npm run release:national
```

Para un lanzamiento público es obligatorio configurar un SMTP propio en
Supabase: el servicio de email incluido es únicamente para pruebas y no soporta
un volumen real de registros.

## Favoritos

La página `favoritos.html` requiere una sesión iniciada. Lee únicamente los
favoritos del usuario autenticado mediante las políticas RLS existentes y
permite buscar, ordenar, abrir o quitar productos guardados.
