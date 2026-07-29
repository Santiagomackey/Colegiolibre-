import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const requiredPages = [
  "index.html",
  "login.html",
  "publicar.html",
  "producto.html",
  "perfil.html",
  "perfil-publico.html",
  "favoritos.html",
  "mensajes.html",
  "colegio.html",
  "ayuda.html",
  "seguridad.html",
  "productos-prohibidos.html",
  "terminos.html",
  "privacidad.html",
  "404.html"
];

const publicSeoPages = [
  "index.html",
  "ayuda.html",
  "seguridad.html",
  "productos-prohibidos.html",
  "terminos.html",
  "privacidad.html"
];

const failures = [];
const checks = [];

function check(name, condition, detail) {
  checks.push({ name, condition });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

for (const page of requiredPages) {
  check(`Existe ${page}`, fs.existsSync(path.join(root, page)));
}

for (const page of requiredPages) {
  const html = read(page);
  check(`${page} tiene título`, /<title>[^<]+<\/title>/i.test(html));
  check(`${page} tiene favicon`, /rel=["']icon["']/i.test(html));
  check(
    `${page} usa Supabase fijado o no lo necesita`,
    !html.includes("@supabase/supabase-js") ||
      /@supabase\/supabase-js@2\.\d+\.\d+/.test(html)
  );
  check(
    `${page} protege el CDN con integridad o no lo necesita`,
    !html.includes("@supabase/supabase-js") ||
      /integrity=["']sha384-[^"']+["']/.test(html)
  );
}

for (const page of publicSeoPages) {
  const html = read(page);
  check(`${page} tiene descripción`, /name=["']description["']/i.test(html));
  check(`${page} tiene canonical`, /rel=["']canonical["']/i.test(html));
}

const vercel = JSON.parse(read("vercel.json"));
const headerText = JSON.stringify(vercel.headers || []);
for (const header of [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "X-Frame-Options",
  "Permissions-Policy"
]) {
  check(`Vercel configura ${header}`, headerText.includes(header));
}

const allBrowserJs = fs
  .readdirSync(root)
  .filter((file) => file.endsWith(".js"))
  .map((file) => read(file))
  .join("\n");

check(
  "No quedan console.log de depuración",
  !/\bconsole\.log\s*\(/.test(allBrowserJs)
);
check(
  "Los títulos de productos están protegidos de traducción",
  allBrowserJs.includes("data-product-title") &&
    read("preferences.js").includes("[data-product-title]")
);
check(
  "Existe página dedicada de favoritos",
  read("favoritos.js").includes("loadFavorites") &&
    read("favoritos.html").includes("favorites-results")
);
check(
  "Publicar soporta edición",
  read("publicar.js").includes("isEditMode") &&
    read("publicar.js").includes(".update(")
);
check(
  "Publicar usa la ubicación real del colegio",
  read("publicar.js").includes("getSchoolByCode(profile.school_code)") &&
    read("publicar.js").includes("school?.zone_code") &&
    !read("publicar.html").includes("<option>Caballito, CABA</option>")
);
check(
  "Modo oscuro cubre formularios, publicaciones y conversaciones",
  [
    ".publish-form",
    ".publication-card",
    ".message:not(.is-mine)",
    ".legal-document",
    ".cl-notification-panel"
  ].every((selector) => read("preferences.css").includes(selector))
);
check(
  "Perfil permite administrar estados",
  ["paused", "available", "sold"].every((status) =>
    read("perfil.js").includes(status)
  )
);
check(
  "Las páginas privadas están fuera del índice",
  [
    "admin.html",
    "moderacion.html",
    "mensajes.html",
    "perfil.html",
    "publicar.html"
  ].every((page) => read("robots.txt").includes(`Disallow: /${page}`))
);

if (failures.length) {
  console.error(`Auditoría de lanzamiento fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Auditoría de lanzamiento correcta: ${checks.length} comprobaciones superadas.`
);
