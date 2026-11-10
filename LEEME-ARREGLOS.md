# ColegioLibre 1.0.25 — correcciones de la auditoría

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

El comando sincroniza la web actual, registra los plugins nativos y genera `mobile-app/artifacts/ColegioLibre-1.0.25-debug.apk` para probar en un teléfono. El APK de prueba usa una firma de depuración; para actualizar una instalación firmada de producción necesitás la misma clave de firma original.

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
- Splash y recursos Android con la marca, una configuración Capacitor y versión 1.0.25/versionCode 25.
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

## Navegación y tema (1.0.25)

Los controles móviles usan tonos neutros en ambos temas. La franja inferior deja de mostrar el azul del pie de página. El plugin Android SystemAppearance sincroniza el color de las barras y sus iconos con el tema elegido. Es necesario desplegar la web y recompilar/reinstalar el APK; cambiar solo los archivos web no incorpora el plugin a una app ya instalada.

Verificación: 30 pruebas automatizadas, validación del proyecto, auditoría de lanzamiento y PWA correctas. Vista móvil revisada en navegador en ambos temas. No se ha compilado ni probado este cambio nativo en Android; no se incluye APK nuevo.

## Ajustes de interfaz móvil y escritorio

Preferencias fijas abajo a la derecha (encima de la navegación cuando exista), también en acceso. Botón de cuenta móvil con icono y nombre o Iniciar sesión debajo. Se eliminaron las cuatro tarjetas de beneficios y Cómo funciona ahora tiene tres pasos compactos. Encabezado de alertas negro en modo oscuro. Comprobado en navegador a ancho móvil y escritorio; 31 pruebas automatizadas correctas. No se ha desplegado esta versión ni compilado un APK nuevo.

## Versión 1.0.25: móvil compacto y barras Android

Se conserva el orden de las secciones y el estilo de ColegioLibre. Se reducen encabezados, banner, espacios y paneles de favoritos para mostrar más contenido en el teléfono. El encabezado con nombre y notificaciones se revisó a 320 y 390 px mediante una vista de prueba, sin iniciar una cuenta real.

Los recursos CSS/JS usan identificadores nuevos y el service worker descarga primero el código de interfaz de la red, con respaldo offline. Esto evita combinar una página nueva con un diseño anterior cacheado.

Android ahora limita el WebView al ancho del teléfono y dibuja una superficie nativa detrás de la barra de gestos de Android 15+, blanca u oscura según el tema. El pie de página conserva su azul de marca.

IMPORTANTE: desplegá esta versión web y compilá/reinstalá el APK 1.0.25 (versionCode 25). Subir solo la web no actualiza el código Android de una app instalada. El ZIP no contiene un APK compilado. El entorno de edición no dispone de Android SDK; el intento de compilación se detuvo por ese motivo. Podés generar el APK con npm run android:apk o con el workflow incluido de GitHub Actions.

Verificación: 32 pruebas correctas, validación del proyecto, auditoría y PWA correctas. Código nativo pendiente de compilación y prueba en dispositivo.

## Versión 1.0.26 — alertas, Apple y avisos Android

Alertas tiene pestañas Comunidad/Mis alertas, vista previa, presupuesto visible, validación y mejor manejo de errores. Apple se agrega junto a Google usando Supabase y el callback existente, con navegador externo en Android. El registro push ahora es accesible desde la interfaz; los avisos en primer plano usan una notificación inmediata y el canal Android se crea desde código nativo para los avisos en segundo plano.

Leé docs/APPLE_AND_PHONE_NOTIFICATIONS.md antes de desplegar. Apple necesita configurarse en Supabase/Apple Developer; FCM necesita credenciales privadas del servidor y el webhook de Supabase. La migración database/09_alert_matches.sql está preparada pero no se ha ejecutado en una base real. Android 1.0.26 requiere recompilar/reinstalar; este ZIP contiene fuente, no un APK. No se ha probado entrega push en un teléfono real ni una cuenta Apple real.

Verificación: 37 pruebas automatizadas correctas, validación del proyecto/auditoría/PWA correctas. Vistas de alertas y Apple revisadas en navegador a ancho móvil y escritorio; vista previa y pestaña Mis alertas comprobadas como invitado.

## Versión 1.0.27 — compras por transferencia

Datos de cobro privados en Perfil, Comprar desde Producto, checkout con alias/CBU/CVU e importe congelado, confirmación manual exclusiva del vendedor y seguimiento en Mis pedidos. La conversación se crea con el pedido para coordinar en el colegio. Incluye español/inglés y ambos temas.

Aplicá database/10_direct_transfer_orders.sql antes de desplegar. Leé docs/DIRECT_TRANSFER_PAYMENTS.md para permisos, pruebas de staging y límites. El dinero se mueve externamente: el aviso del comprador nunca confirma el pago. No se ejecutó la migración en producción ni se compiló un APK.

Validación de transferencias: 44 pruebas correctas (incluye PostgreSQL/PGlite), validación general, auditoría, PWA y 13 comprobaciones nacionales. La migración y la configuración real deben verificarse en Supabase staging antes de publicar.

## Versión 1.0.28 — Vincular Mercado Pago

La pantalla de cobro ahora prioriza Vincular Mercado Pago, con autorización OAuth/PKCE en el servidor, identidad privada y un alias ingresado una vez. Los datos bancarios manuales quedan en un desplegable. No modifica la confirmación manual de pagos. Aplicar database/11_mercadopago_link.sql después de la 10, configurar la aplicación OAuth y las variables privadas una sola vez. Guía: docs/MERCADOPAGO_ACCOUNT_LINK.md. No se configuró ni probó una vinculación real.
