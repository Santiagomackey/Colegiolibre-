# ColegioLibre 1.0.23 — correcciones de la auditoría

Esta carpeta contiene el sitio completo y el código Android actualizado. Conserva el logo oficial del footer y su fondo azul. Reemplazá el proyecto completo: no mezcles archivos con ZIP anteriores.

## Publicar la web

1. Subí el contenido de esta carpeta a tu repositorio, con index.html y vercel.json en la raíz.
2. Dejá que Vercel complete el despliegue. Las variables de entorno y los datos de Supabase existentes se conservan en sus servicios.
3. Abrí la web y comprobá el catálogo. Si no hay publicaciones disponibles y aprobadas, verás un estado vacío real. Los productos de ejemplo y sus vendedores ficticios ya no se muestran.

Esta entrega no se ha desplegado en colegiolibre.com. Tampoco modifica ni elimina filas de Supabase.

## Generar el APK desde terminal, sin Android Studio

Necesitás Node.js 20.19 o posterior, JDK 21 y Android SDK con platform 36 y build tools. ANDROID_HOME debe apuntar a tu SDK. Por ejemplo en Windows, si tu SDK está en C:\Android:

```powershell
$env:ANDROID_HOME = 'C:\Android'
npm --prefix mobile-app ci
npm run android:apk
```

El comando sincroniza la web actual, registra los plugins nativos y genera `mobile-app/artifacts/ColegioLibre-1.0.23-debug.apk` para probar en un teléfono. El APK de prueba usa una firma de depuración; para actualizar una instalación firmada de producción necesitás la misma clave de firma original.

También podés generar el APK de prueba sin instalar el SDK en tu PC: subí el proyecto a GitHub, abrí Actions → Crear APK Android → Run workflow y descargá el artefacto ColegioLibre-Android-debug al finalizar. El flujo conserva los cambios nativos y se ejecuta también al cambiar archivos de la web. Ese flujo está preparado, pero no se ha ejecutado desde esta entrega.

Para generar la versión de distribución:

```powershell
npm --prefix mobile-app run android:release
```

El resultado sin firmar debe firmarse con la clave de producción existente antes de distribuirlo. No hay un APK nuevo compilado en este ZIP: este entorno no dispone de Android SDK ni de tu clave de firma. Se quitó el APK viejo para no volver a distribuir una versión anterior. El botón de instalación web usa la PWA y, cuando el navegador no ofrece instalación automática, muestra los pasos del menú.

La app usa una sola configuración Capacitor, carga https://www.colegiolibre.com y requiere conexión. Por eso primero hay que desplegar la web corregida. Se incluyen también los recursos web sincronizados y el splash con la marca oficial.

## Corregido

- Catálogo sin productos de ejemplo, reseñas de actividad inventadas ni fotos de stock asociadas a esos ejemplos.
- Explore consulta productos reales, disponibles y aprobados, con filtros en servidor, páginas de 24 resultados, botón Ver más, cancelación de búsquedas anteriores, límite de espera y reintento.
- Categorías controladas con tildes y equivalencias para etiquetas antiguas sin tildes; no se reescriben títulos de usuarios.
- URLs de API nativa, URL pública, metadatos canonical y compartir corregidos.
- Telemetría aislada del resto de scripts, con cliente autenticado existente y campos compatibles con la tabla client_errors.
- Perfiles y publicaciones inexistentes muestran un estado estable y una acción para continuar/reintentar.
- Login sin superposición de iconos ni huecos de campos ocultos. Registro, recuperación y verificación usan el mismo sistema de estilos.
- Tipografía sans serif, acciones principales azul ColegioLibre, temas claro/oscuro explícitos y controles de preferencias fuera de las acciones.
- Filtros móviles plegables, navegación móvil en Explore, fotos faltantes identificadas como tales y menos espacio en la cabecera.
- Pantalla de apertura con el logo maestro, sin barra de progreso simulada ni espera mínima en cada página.
- Splash y recursos Android con la marca, una configuración Capacitor y versión 1.0.23/versionCode 23.
- Sincronización móvil con lista permitida de recursos; no copia APK, API, SQL, pruebas ni documentos de desarrollo.
- Validador corregido para rutas de Vercel sin extensión, rutas desde la raíz y etiquetas base; pruebas antiguas comprueban requisitos sin fijar una versión vieja de CSS.

## Verificación y límites

Se ejecutaron las validaciones del proyecto, auditoría de lanzamiento, PWA y preparación nacional. Pasan 28 pruebas, incluyendo regresiones del catálogo, URLs nativas, privacidad/esquema de telemetría y estados de error de Explore.

Se revisaron visualmente login de escritorio y login/registro y Explore en marcos de ancho móvil. No se observó desbordamiento horizontal en los marcos inspeccionados. Se comprobó el tema oscuro del formulario. Son revisiones responsive de navegador; no equivalen a pruebas en un Android físico.

Pendiente de comprobar con cuenta de prueba y teléfono: inicio/registro/recuperación completos, publicación y cámara, chat, favoritos, notificaciones y retorno desde autenticación externa. Las comprobaciones de SQL incluidas validan los archivos del proyecto; no certifican la configuración actual de tu Supabase. Revisá la configuración SMTP/OAuth ya documentada antes de publicar para usuarios reales.

## Corrección del encabezado después de iniciar sesión

Se unificó el breakpoint del inicio en 980 px. En ese ancho o menor se muestra un solo logo, una sola búsqueda y botones compactos para cuenta, avisos y menú; los accesos duplicados de escritorio se ocultan también después de recuperar la sesión. Se revisó el encabezado con etiquetas de sesión iniciada a 320, 390 y 820 px, y sin sesión a 390 px. La prueba cubre composición responsive, sin iniciar sesión con credenciales reales.

Subí/reemplazá el proyecto y volvé a desplegar la web. Para una app Android que tenga recursos antiguos empaquetados, compilá e instalá el nuevo APK usando las instrucciones anteriores. No se incluye un APK nuevo compilado.
