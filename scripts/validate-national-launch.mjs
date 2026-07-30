import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
let checks = 0;

function check(label, condition) {
  checks += 1;
  if (!condition) failures.push(label);
}

const api = read("api/moderate-product.js");
const publish = read("publicar.js");
const sql = read("sql/11_PREPARAR_LANZAMIENTO_NACIONAL.sql");
const vercel = JSON.parse(read("vercel.json"));
const headers = JSON.stringify(vercel.headers || []);
const instructions = read("LANZAMIENTO-NACIONAL.txt");

check("La moderación valida UUID", api.includes("UUID_PATTERN.test(productId)"));
check("La moderación limita tiempos externos", api.includes("fetchWithTimeout"));
check(
  "La API no filtra el error interno al usuario",
  !/error:\s*"No pudimos revisar[^}]+details:/s.test(api)
);
check(
  "Las imágenes se guardan dentro de la carpeta del usuario",
  publish.includes("`${ownerId}/products/${fileName}`")
);
check(
  "Storage limita tamaño y formatos",
  sql.includes("6291456") &&
    sql.includes("'image/jpeg'") &&
    sql.includes("'image/png'") &&
    sql.includes("'image/webp'")
);
check(
  "Storage comprueba propiedad de carpeta",
  sql.includes("(storage.foldername(name))[1] = auth.uid()::text")
);
check(
  "El catálogo público exige producto disponible y aprobado",
  sql.includes("status = 'available'") &&
    sql.includes("coalesce(moderation_status, 'approved') = 'approved'")
);
check(
  "Existen límites para conversaciones, favoritos y reportes",
  [
    "enforce_conversation_rate_limit",
    "enforce_favorite_rate_limit",
    "enforce_report_rate_limit"
  ].every((name) => sql.includes(name))
);
check(
  "Existe retención de datos operativos",
  sql.includes("cleanup_expired_operational_data")
);
check(
  "Vercel evita caché de API",
  headers.includes("/api/(.*)") && headers.includes("no-store, max-age=0")
);
check(
  "La política CSP permite PWA sin abrir scripts externos nuevos",
  headers.includes("worker-src 'self' blob:") &&
    headers.includes("manifest-src 'self'")
);
check(
  "Las instrucciones exigen SMTP de producción",
  instructions.includes("SMTP PERSONALIZADO") &&
    instructions.includes("2 emails por hora")
);
check(
  "Hay plantillas de email de autenticación",
  fs.existsSync(path.join(root, "supabase-email-templates/confirm-signup.html")) &&
    fs.existsSync(path.join(root, "supabase-email-templates/reset-password.html"))
);

if (failures.length) {
  console.error(
    `Preparación nacional incompleta (${failures.length} problema/s):\n- ${failures.join("\n- ")}`
  );
  process.exit(1);
}

console.log(
  `Preparación nacional correcta: ${checks} comprobaciones específicas superadas.`
);
