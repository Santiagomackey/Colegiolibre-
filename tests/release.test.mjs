import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("los productos demo están restringidos al entorno local", () => {
  for (const file of ["script.js", "producto.js"]) {
    const source = read(file);
    assert.match(source, /localhost/);
    assert.match(source, /127\.0\.0\.1/);
    assert.match(source, /demo/);
  }
});

test("las páginas privadas no se indexan", () => {
  const robots = read("robots.txt");
  for (const route of ["/admin.html", "/moderacion.html", "/mensajes.html", "/perfil.html", "/publicar.html"]) {
    assert.ok(robots.includes(`Disallow: ${route}`), `Falta proteger ${route}`);
  }
});

test("Vercel aplica encabezados mínimos de seguridad", () => {
  const config = read("vercel.json");
  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy"
  ]) {
    assert.ok(config.includes(header), `Falta ${header}`);
  }
});

test("los recursos visuales principales permanecen debajo de 750 KB", () => {
  for (const file of [
    "images/materiales.webp",
    "images/logo-horizontal.webp",
    "images/caja-colegiolibre.webp"
  ]) {
    const bytes = fs.statSync(path.join(root, file)).size;
    assert.ok(bytes < 750_000, `${file} pesa ${bytes} bytes`);
  }
});

test("el modo oscuro cubre componentes que antes tuvieron fallos de contraste", () => {
  const css = read("preferences.css");
  for (const selector of [
    ".category-drawer",
    ".drawer-section a",
    ".condition-selector label",
    ".upload-tile",
    ".similar-section",
    ".similar-card__title",
    ".profile-sidebar",
    ".publication-card"
  ]) {
    assert.ok(css.includes(selector), `Falta cobertura oscura para ${selector}`);
  }
});

test("el formulario de publicación permite edición y varias imágenes", () => {
  const html = read("publicar.html");
  const js = read("publicar.js");
  assert.match(html, /multiple/);
  assert.match(js, /isEditMode/);
  assert.match(js, /\.update\(/);
  assert.match(js, /imageSlots/);
});

test("el monitoreo técnico protege datos personales y requiere autenticación", () => {
  const telemetry = read("telemetry.js");
  const sql = read("sql/10_CONFIGURAR_MONITOREO_ERRORES.sql");

  assert.match(telemetry, /\[email\]/);
  assert.match(telemetry, /auth\.getUser/);
  assert.match(telemetry, /if \(!user\) return/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /auth\.uid\(\) = user_id/);
});

test("el administrador muestra la salud técnica de la plataforma", () => {
  const html = read("admin.html");
  const js = read("admin.js");
  const css = read("preferences.css");

  assert.match(html, /id="metric-errors"/);
  assert.match(html, /id="technical-errors-list"/);
  assert.match(js, /from\("client_errors"\)/);
  assert.match(js, /renderTechnicalErrors/);
  assert.match(css, /\.technical-panel/);
  assert.match(css, /\.technical-error/);
});

test("publicar mantiene un único fondo oscuro sin cortes rectangulares", () => {
  const css = read("preferences.css");

  assert.match(css, /html\[data-theme="dark"\] \.publish-form\s*\{/);
  assert.match(css, /background: transparent !important/);
  assert.match(css, /html\[data-theme="dark"\] \.preview-panel\s*\{/);
});

test("el modo oscuro conserva contraste en todas las páginas públicas", () => {
  const css = read("preferences.css");

  for (const selector of [
    ".product-school-link",
    ".home-category-title",
    ".forgot-link",
    ".auth-switch-copy button",
    ".product-taxonomy",
    ".attributes-grid dd",
    ".school-hero__copy",
    ".footer-contact-btn",
    ".legal-nav__primary",
    ".legal-cta"
  ]) {
    assert.ok(css.includes(selector), `Falta contraste oscuro para ${selector}`);
  }
});

test("los logos oscuros están acotados por página y publicar conserva su vista previa", () => {
  const preferences = read("preferences.css");
  const publishCss = read("publicar.css");
  const publishHtml = read("publicar.html");

  assert.match(publishHtml, /class="[^"]*\bpublish-body\b[^"]*"/);
  assert.match(preferences, /\.publish-body/);
  assert.doesNotMatch(preferences, /:is\(\.brand-link,\s*\.legal-brand\)/);
  assert.match(publishCss, /\.preview-panel\s*\{[\s\S]*?position: sticky/);
  assert.doesNotMatch(publishCss, /\.preview-panel\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(preferences, /\)\s+\.site-header \.brand-link img\s*\{[\s\S]*?width:\s*188px !important/);
  assert.match(publishCss, /@media \(max-width: 1220px\)[\s\S]*?\.preview-panel\s*\{[\s\S]*?position: relative/);
});

test("los avisos mantienen contraste en el encabezado oscuro", () => {
  const css = read("preferences.css");

  assert.match(css, /\.cl-notification-trigger\s*\{/);
  assert.match(css, /\.cl-notification-mark-all/);
  assert.match(css, /\.cl-notification-system/);
});

test("el desplazamiento evita repintados costosos", () => {
  const css = read("polish.css");

  assert.match(css, /scroll-behavior:\s*auto !important/);
  assert.match(css, /\.site-header,[\s\S]*?backdrop-filter:\s*none !important/);
  assert.match(css, /\.product-card,[\s\S]*?content-visibility:\s*auto/);
  assert.match(css, /contain-intrinsic-size:\s*auto 420px/);
});

test("la interfaz móvil usa un único header y navegación compacta", () => {
  const css = read("mobile.css");
  const publish = read("publicar.html");
  const messages = read("mensajes.html");
  const profile = read("perfil.html");
  const favorites = read("favoritos.html");

  assert.match(css, /--mobile-nav-height:\s*62px/);
  assert.match(css, /\.mobile-subpage \.site-header \.search-bar,[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.search-bar--desktop\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.search-bar--mobile\s*\{[\s\S]*?flex-direction:\s*row/);
  assert.match(publish, /class="publish-body mobile-subpage"/);
  assert.match(messages, /class="mobile-subpage mobile-messages"/);
  assert.match(profile, /class="mobile-subpage mobile-profile"/);
  assert.match(favorites, /class="mobile-subpage mobile-favorites"/);
});

test("la interfaz móvil no estira preferencias ni paneles sobre el contenido", () => {
  const css = read("mobile.css");

  assert.match(
    css,
    /\.mobile-subpage\[data-mobile-nav="true"\] \.preference-controls\s*\{[\s\S]*?bottom:\s*auto !important/
  );
  assert.match(
    css,
    /\.mobile-subpage\[data-mobile-nav="true"\] \.preference-controls\s*\{[\s\S]*?height:\s*auto !important/
  );
  assert.match(
    css,
    /body\[data-mobile-nav="true"\] \.cl-notification-panel\s*\{[\s\S]*?left:\s*10px !important/
  );
  assert.match(
    css,
    /body\[data-mobile-nav="true"\] \.cl-notification-panel\s*\{[\s\S]*?width:\s*auto !important/
  );
});

test("los logos internos conservan contraste y tamaño en celular", () => {
  const css = read("mobile.css");

  assert.match(
    css,
    /\.mobile-subpage \.site-header \.brand-link\s*\{[\s\S]*?background:\s*#ffffff !important/
  );
  assert.match(
    css,
    /\.mobile-subpage \.site-header \.brand-link img\s*\{[\s\S]*?width:\s*134px !important/
  );
});

test("la versión nacional protege catálogo, imágenes y API", () => {
  const sql = read("sql/11_PREPARAR_LANZAMIENTO_NACIONAL.sql");
  const publish = read("publicar.js");
  const api = read("api/moderate-product.js");
  const vercel = read("vercel.json");

  assert.match(sql, /Public reads approved available products/);
  assert.match(sql, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(sql, /enforce_conversation_rate_limit/);
  assert.match(sql, /cleanup_expired_operational_data/);
  assert.match(publish, /\$\{ownerId\}\/products\/\$\{fileName\}/);
  assert.match(api, /fetchWithTimeout/);
  assert.match(api, /UUID_PATTERN\.test\(productId\)/);
  assert.doesNotMatch(
    api,
    /error:\s*"No pudimos revisar la publicación en este momento\.",\s*details:/
  );
  assert.match(vercel, /Cross-Origin-Opener-Policy/);
  assert.match(vercel, /"source": "\/api\/\(\.\*\)"/);
});

test("el inicio traduce las descripciones institucionales y de categorías", () => {
  const preferences = read("preferences.js");
  const home = read("index.html");
  const script = read("script.js");

  assert.match(
    preferences,
    /"Diseñado para que comprar, vender y cambiar materiales sea rápido, confiable y accesible en todo el país\.":\s*"Designed to make buying, selling and exchanging school supplies quick, reliable and accessible nationwide\."/
  );
  assert.match(
    preferences,
    /"Manuales, novelas, diccionarios y libros para todas las materias\.":\s*"Textbooks, novels, dictionaries and books for every subject\."/
  );
  assert.match(
    preferences,
    /"Remeras, buzos, pantalones y prendas escolares filtradas por talle\.":\s*"School shirts, sweatshirts, trousers and uniforms filtered by size\."/
  );
  assert.match(preferences, /\.trim\(\)\.replace\(\/\\s\+\/g,\s*" "\)/);
  assert.match(home, /preferences\.js\?v=20260730-15/);
  assert.match(script, /refresh\?\.\(elements\.categoryShelves\)/);
});
