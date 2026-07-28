# ColegioLibre · versión profesional

## Mejoras incluidas

- Publicación protegida: una persona sin sesión es enviada a iniciar sesión.
- Edición sin duplicados y validación de propiedad mediante sesión y RLS.
- Condición `Nuevo` y descripción obligatoria de al menos 20 caracteres.
- Moderación automática con reglas gratuitas, revisión opcional por proveedor y fallback seguro.
- Textos transparentes: ColegioLibre no procesa pagos.
- Página de producto sin contenido ficticio durante la carga.
- Home con cinco recomendados y secciones por categoría, evitando repetir los destacados cuando hay alternativas.
- Imágenes dinámicas con carga diferida y hero optimizado en WebP.
- Ajustes responsive, scrolling horizontal controlado, foco de teclado y soporte de movimiento reducido.
- Términos, Privacidad, Seguridad, Ayuda y Productos prohibidos.
- Páginas privadas y administrativas fuera de la indexación de buscadores.
- Metadatos SEO, Open Graph, `robots.txt`, `sitemap.xml` y página 404.
- Encabezados de seguridad y caché estática mediante `vercel.json`.
- Validador local para JavaScript, JSON, IDs, recursos y secretos.
- Consulta SQL de solo lectura para comprobar RLS, políticas, triggers y consistencia.
- Modo oscuro global, responsive y persistente.
- Selector Español/English en todas las páginas, incluidos formularios, paneles y contenido dinámico.
- Estructura de Vercel corregida: `api/` contiene únicamente `moderate-product.js`.
- Tema oscuro negro profesional con superficies, bordes y contraste propios.
- Consulta inicial del Home limitada para no descargar la tabla completa.
- Máximo de cuatro estanterías relevantes y eliminación de categorías vacías en el Home.
- Renderizado diferido de secciones fuera de pantalla mediante `content-visibility`.
- Traducciones dinámicas agrupadas en tareas de baja prioridad para evitar bloqueos.

## Límites que requieren una prueba real

La validación local no puede simular las políticas RLS, el envío de correos, Realtime,
Storage ni las variables privadas del proyecto publicado. Usá la lista de prueba de
`INSTRUCCIONES-DESPLIEGUE.txt` con dos cuentas distintas antes de abrir el sitio a todo
el público.

## Próxima función grande recomendada

Una vez aprobada esta versión, el siguiente módulo debería ser **“Estoy buscando”**:
pedidos de libros, uniformes y útiles que generen coincidencias y notificaciones cuando
otra persona publique algo compatible. Conviene construirlo como una versión separada
después de cerrar la prueba de lanzamiento.
