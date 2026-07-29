const origin = process.env.COLEGIO_LIBRE_URL || "https://colegiolibre.vercel.app";
const routes = [
  "/",
  "/login.html",
  "/ayuda.html",
  "/seguridad.html",
  "/productos-prohibidos.html",
  "/terminos.html",
  "/privacidad.html",
  "/manifest.webmanifest",
  "/service-worker.js"
];

const failures = [];

for (const route of routes) {
  try {
    const response = await fetch(new URL(route, origin), { redirect: "follow" });
    if (!response.ok) failures.push(`${route}: HTTP ${response.status}`);
    if (route === "/" && !response.headers.get("content-security-policy")) {
      failures.push("/: falta Content-Security-Policy");
    }
  } catch (error) {
    failures.push(`${route}: ${error.message}`);
  }
}

if (failures.length) {
  console.error("Falló la prueba de producción:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Producción responde correctamente en ${routes.length} rutas.`);
