const supabaseUrl = process.env.SUPABASE_URL || "https://riqhwmszshleyyaxlwqu.supabase.co";
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_FYZUQhaTqN6gL-KenUnzWg__nGQLrhJ";

const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, {
  headers: { apikey: publishableKey },
  cache: "no-store"
});

if (!response.ok) {
  console.error(`No se pudo comprobar Auth: HTTP ${response.status}.`);
  process.exit(1);
}

const settings = await response.json();
const failures = [];
if (settings.disable_signup) failures.push("El registro está desactivado.");
if (!settings.external?.email) failures.push("El proveedor Email está desactivado.");
if (settings.mailer_autoconfirm === true) {
  failures.push("Confirm email está desactivado (mailer_autoconfirm=true). Supabase no enviará correos.");
}

if (failures.length) {
  console.error("Auth todavía no está listo para pre-launch:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Auth listo: registro por email activo y confirmación obligatoria habilitada.");
