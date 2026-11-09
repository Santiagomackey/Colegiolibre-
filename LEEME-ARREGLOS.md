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

Se ejecutaron las validaciones del proyecto, auditoría de lanzamiento, PWA y preparación nacional. Pasan 29 pruebas, incluyendo regresiones del catálogo, URLs nativas, privacidad/esquema de telemetría y estados de error de Explore.

Se revisaron visualmente login de escritorio y login/registro y Explore en marcos de ancho móvil. No se observó desbordamiento horizontal en los marcos inspeccionados. Se comprobó el tema oscuro del formulario. Son revisiones responsive de navegador; no equivalen a pruebas en un Android físico.

Pendiente de comprobar con cuenta de prueba y teléfono: inicio/registro/recuperación completos, publicación y cámara, chat, favoritos, notificaciones y retorno desde autenticación externa. Las comprobaciones de SQL incluidas validan los archivos del proyecto; no certifican la configuración actual de tu Supabase. Revisá la configuración SMTP/OAuth ya documentada antes de publicar para usuarios reales.

## Carga inicial y texto de cuenta

El inicio incluye los estilos críticos del encabezado en el propio HTML, antes de que se analice el contenido visible. Así la composición móvil no espera a la descarga de home-header.css ni a la recuperación de sesión. Se reserva espacio para los avisos y para el botón de cuenta: muestra Iniciar sesión sin sesión y Mi perfil cuando se recupera la cuenta. Los estilos completos y la versión incluida en el HTML se comparan en una prueba para evitar diferencias futuras. Se verificó el encabezado inicial sin hojas compartidas ni scripts, a 320 y 820 px, además de las composiciones con y sin sesión a 390 px. Estas revisiones no sustituyen la prueba en un teléfono físico.

Reemplazá el proyecto completo y volvé a desplegarlo. El cambio de caché PWA está incluido. Para una instalación Android con recursos empaquetados antiguos, compilá e instalá un APK nuevo con las instrucciones de esta entrega.

## Alertas y corrección móvil completa

- Se rediseñaron la sección de alertas del inicio y /busco: menos ruido visual, tipografía legible, acciones azules claras, solicitudes recientes y estados vacíos/de error diferenciados. El formulario mantiene sus nombres y campos; presupuesto y descripción están agrupados como detalles opcionales.
- La web de inicio incluye ahora mobile.css completo y home-header.css en el HTML, antes del body. Todo el inicio comparte el breakpoint móvil de 980 px, incluida la composición de la portada; no depende de la recuperación de sesión para cambiar al diseño móvil.
- Los controles de tema claro/oscuro y ES/EN vuelven a estar fijos encima de la navegación inferior. Se crean apenas existe el body y no esperan a que terminen las consultas ni los scripts de datos. Cambiar el idioma ya no recarga la página.
- Se verificaron los controles con clics en la vista responsive y el inicio completo a 390 y 820 px. Se comprobaron los estilos iniciales incrustados mediante una prueba de integridad. Las 29 pruebas y las validaciones del proyecto pasan; no se realizó una prueba con un teléfono físico ni se generó un APK nuevo.

Aplicación: reemplazá el proyecto completo con esta carpeta y volvé a desplegarlo. El sitio en producción se comprobó durante la revisión y todavía servía la versión con solo el encabezado incrustado, no esta corrección móvil completa. Para una app Android con recursos antiguos, compilá e instalá el APK actualizado con las instrucciones anteriores. El footer azul y el logo oficial se conservan.
