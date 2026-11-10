# Vincular Mercado Pago — configuración única de ColegioLibre

## Qué cambió para los vendedores

Perfil → Configuración ahora muestra **Vincular Mercado Pago**. El vendedor autoriza a ColegioLibre en la página oficial de Mercado Pago. Después agrega su alias una vez; no necesita copiar un CVU de 22 dígitos en esta opción. Si Mercado Pago no devuelve un nombre, se solicita el titular. Se eliminó el formulario manual de banco/CBU/CVU del perfil. Antes de autorizar solo se muestra el botón de vinculación. El alias se pide después de vincular porque esta integración no importa datos de transferencias desde Mercado Pago.

Se conservan las transferencias externas y la confirmación manual del vendedor. Vincular la cuenta o pulsar Ya transferí **no** confirma un pago. No se implementó Mercado Pago Checkout ni aprobación automática.

No se presupone una API que importe alias/CVU: la vinculación conserva la identidad de la cuenta autorizada; el alias lo ingresa el vendedor y su pertenencia debe comprobarse en la billetera/banco. No se anuncia como cuenta bancaria verificada.

## Activación por el dueño del sitio, una sola vez

1. Aplicá primero `database/10_direct_transfer_orders.sql` si no está ejecutada. Después ejecutá `database/11_mercadopago_link.sql` en Supabase staging. Esta segunda migración crea el vínculo privado, los intentos temporales de OAuth y permite que una cuenta Mercado Pago use un alias sin CVU. Los pedidos existentes conservan sus instrucciones de pago.
2. En Mercado Pago Developers, creá/configurá la aplicación de ColegioLibre. Registrá exactamente esta URL HTTPS de retorno:

   `https://www.colegiolibre.com/api/mercadopago-link`

3. Habilitá PKCE S256 en esa aplicación y el acceso de lectura necesario para autorizar una cuenta. La integración solicita `scope=read`, no permisos para cobrar ni transferir dinero.
4. En las variables privadas del servidor de Vercel configurá:

   - `MERCADOPAGO_CLIENT_ID`
   - `MERCADOPAGO_CLIENT_SECRET`
   - `MERCADOPAGO_REDIRECT_URI=https://www.colegiolibre.com/api/mercadopago-link`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

   Nunca pongas el Client Secret o la clave service-role en archivos públicos, JavaScript del navegador o GitHub. Los vendedores no deben introducir estas credenciales.

5. Desplegá la versión completa. No alcanza con cambiar el texto de un botón: el endpoint, la migración y las variables deben estar activos. Si faltan las credenciales, el botón informa que falta completar la configuración del servidor. Los fallos de carga de Supabase se distinguen de los fallos del servidor y se limpian al recuperarse.
6. Para Android recompilá/reinstalá la versión 1.0.29. Incluye el enlace `colegiolibre://open` para volver desde el navegador externo. Requiere la dependencia Capacitor Browser ya incluida desde 1.0.26. No se incluye APK compilado.

No se configuró una aplicación real de Mercado Pago, no se cargaron credenciales de producción y no se realizó una autorización real desde este entorno. El despliegue de Vercel tampoco se realizó; el CLI disponible pidió iniciar sesión.

## Seguridad y funcionamiento

- El inicio requiere una sesión Supabase validada en el servidor.
- `state`, PKCE y una cookie Secure/HttpOnly/SameSite=Lax atan la respuesta al intento original. Cada lanzamiento y consumo se usa una sola vez y vence a los 10 minutos.
- Un paso de lanzamiento en el navegador externo establece la cookie allí, para no depender de compartir cookies con el WebView de Android.
- Solo el servidor puede completar la identidad vinculada. El navegador no puede establecer el ID de otra cuenta de Mercado Pago.
- No se guardan Access Tokens ni Refresh Tokens. Se usan temporalmente para obtener la identidad, y no se envían al navegador o a Supabase. Esta modalidad manual no necesita acceso continuo a la cuenta.
- Los vínculos e intentos tienen RLS y acceso directo revocado. Solo se conserva el ID de cuenta, nombre disponible y fecha de vinculación; no se guardan email, saldo ni movimientos.
- Quitar el vínculo invalida intentos pendientes. Un callback que llegue después no puede restaurarlo. No cambia datos de cobro ya guardados ni las instrucciones de pedidos existentes.
- **Quitar vínculo en ColegioLibre** elimina la asociación local. El vendedor también puede retirar el permiso de la aplicación desde Mercado Pago. No se anuncia una revocación remota que este código no ejecuta.

## Pruebas antes de publicar

Con cuentas de prueba de Mercado Pago verificá consentimiento y cancelación, retorno al perfil, regreso a Android, alias guardado y una compra manual. Probá también usuario distinto, cookie ausente, enlace vencido/reutilizado, desconexión y fallo de red. Confirmá que ningún paso de OAuth marca un pedido como Pagado.

Los tests automatizados usan solicitudes simuladas para el proveedor y PostgreSQL/PGlite para permisos, nonces, replay y órdenes. No sustituyen una autorización real en staging.

Documentación oficial consultada:

- https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation
- https://www.mercadopago.com.ar/developers/es/reference/authentication/oauth/_oauth_token/post
- https://www.mercadopago.com.ar/developers/es/docs/mp-point/resources/credentials

## Diagnóstico del sitio — 10 de noviembre de 2026

Se confirmó que los RPC de lectura funcionan. El endpoint de producción devuelve HTTP 503 `LINK_NOT_CONFIGURED`. La lista de variables del proyecto de Vercel incluye `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, pero no `MERCADOPAGO_CLIENT_ID` ni `MERCADOPAGO_CLIENT_SECRET`. El dueño debe obtenerlas de su aplicación de Mercado Pago y añadirlas de forma privada en Vercel para producción. Registrar el retorno HTTPS exacto y habilitar PKCE según los pasos anteriores; después redeplegar. No compartir secretos en el chat ni en GitHub. No se completó ninguna autorización real.
