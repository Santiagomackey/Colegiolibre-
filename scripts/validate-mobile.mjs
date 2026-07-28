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

const required = [
  "native-bridge.js",
  "mobile-app/package.json",
  "mobile-app/package-lock.json",
  "mobile-app/capacitor.config.json",
  "mobile-app/android/app/src/main/AndroidManifest.xml",
  "mobile-app/ios/App/App/Info.plist",
  "mobile-app/www/index.html"
];

required.forEach((file) => assert(exists(file), `Falta ${file}.`));

const config = JSON.parse(read("mobile-app/capacitor.config.json"));
assert(config.appId === "com.colegiolibre.app", "El identificador nativo es incorrecto.");
assert(config.server?.url === "https://colegiolibre.vercel.app", "La app no apunta al dominio oficial.");
assert(config.server?.cleartext === false, "La app debe exigir HTTPS.");

const manifest = read("mobile-app/android/app/src/main/AndroidManifest.xml");
assert(manifest.includes("android.permission.CAMERA"), "Android no declara permiso de cámara.");
assert(manifest.includes("android.permission.POST_NOTIFICATIONS"), "Android no declara permiso de notificaciones.");

const info = read("mobile-app/ios/App/App/Info.plist");
assert(info.includes("NSCameraUsageDescription"), "iOS no explica el uso de la cámara.");
assert(info.includes("NSPhotoLibraryUsageDescription"), "iOS no explica el uso de las fotos.");

const publishHtml = read("publicar.html");
assert(publishHtml.includes('capture="environment"'), "Publicar no habilita la cámara trasera.");
assert(publishHtml.includes("native-bridge.js"), "Publicar no carga el puente nativo.");

const notifications = read("notifications.js");
assert(notifications.includes("showSystemNotification"), "Faltan avisos del sistema.");
assert(notifications.includes("requestPermission"), "Falta la solicitud explícita de permiso.");

if (failures.length) {
  console.error(`Validación móvil fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validación móvil correcta: ${required.length} archivos, cámara, avisos, Android e iOS configurados.`);
