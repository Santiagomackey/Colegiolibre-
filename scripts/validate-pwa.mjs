import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const manifest = JSON.parse(read("manifest.webmanifest"));
assert(manifest.name === "ColegioLibre", "El manifiesto debe usar el nombre ColegioLibre.");
assert(manifest.display === "standalone", "La PWA debe abrirse en modo standalone.");
assert(manifest.start_url, "Falta start_url en el manifiesto.");
assert(manifest.scope === "/", "El scope de la PWA debe ser /.");
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "Faltan iconos PWA.");

for (const icon of manifest.icons || []) {
  const iconPath = String(icon.src || "").replace(/^\//, "");
  assert(exists(iconPath), `No existe el icono ${icon.src}.`);
  if (!exists(iconPath) || !iconPath.endsWith(".png")) continue;
  const png = fs.readFileSync(path.join(root, iconPath));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const expected = Number.parseInt(icon.sizes, 10);
  assert(width === expected && height === expected, `${icon.src} no coincide con ${icon.sizes}.`);
}

const pages = [
  "index.html",
  "producto.html",
  "publicar.html",
  "perfil.html",
  "favoritos.html",
  "mensajes.html",
  "colegio.html",
  "perfil-publico.html",
  "ayuda.html",
  "seguridad.html",
  "login.html",
  "privacidad.html",
  "terminos.html",
  "productos-prohibidos.html",
  "beta.html",
  "beta-admin.html",
  "404.html"
];

for (const page of pages) {
  const html = read(page);
  assert(html.includes("manifest.webmanifest"), `${page} no enlaza el manifiesto.`);
  assert(html.includes("apple-touch-icon.png"), `${page} no enlaza el icono de iOS.`);
  assert(html.includes("pwa.css"), `${page} no carga los estilos PWA.`);
  assert(html.includes("pwa.js"), `${page} no registra la PWA.`);
}

const worker = read("service-worker.js");
assert(worker.includes("colegiolibre-pwa-v"), "El service worker no tiene una versión de caché.");
assert(worker.includes('request.mode === "navigate"'), "Falta la estrategia de navegación.");
assert(worker.includes("self.clients.claim()"), "El service worker no toma control al activarse.");

const vercel = JSON.parse(read("vercel.json"));
const headerSources = (vercel.headers || []).map((entry) => entry.source);
assert(headerSources.includes("/service-worker.js"), "Faltan headers específicos para el service worker.");
assert(headerSources.includes("/manifest.webmanifest"), "Faltan headers específicos para el manifiesto.");

if (failures.length) {
  console.error(`Validación PWA fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`PWA válida: manifiesto, ${manifest.icons.length} iconos, service worker y ${pages.length} páginas comprobadas.`);
