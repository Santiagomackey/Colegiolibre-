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
  "mobile-app/www/index.html"
];

required.forEach((file) => assert(exists(file), `Falta ${file}.`));

const config = JSON.parse(read("mobile-app/capacitor.config.json"));
assert(config.appId === "com.colegiolibre.app", "El identificador nativo es incorrecto.");
assert(config.server?.url === "https://www.colego.com.ar", "La app debe usar el dominio oficial.");

const manifest = read("mobile-app/android/app/src/main/AndroidManifest.xml");
assert(manifest.includes("android.permission.CAMERA"), "Android no declara permiso de cámara.");
assert(manifest.includes("android.permission.POST_NOTIFICATIONS"), "Android no declara permiso de notificaciones.");
assert(manifest.includes('android:host="open"'), "Android no declara el deep link de productos.");
assert(manifest.includes("ic_stat_colegiolibre"), "Android no declara el isotipo de notificaciones.");

if (exists("mobile-app/ios/App/App/Info.plist")) {
  const info = read("mobile-app/ios/App/App/Info.plist");
  assert(info.includes("NSCameraUsageDescription"), "iOS no explica el uso de la cámara.");
  assert(info.includes("NSPhotoLibraryUsageDescription"), "iOS no explica el uso de las fotos.");
}

const publishHtml = read("publicar.html");
assert(publishHtml.includes('capture="environment"'), "Publicar no habilita la cámara trasera.");
assert(publishHtml.includes("native-bridge.js"), "Publicar no carga el puente nativo.");

const notifications = read("notifications.js");
assert(read("service-worker.js").includes("self.registration.showNotification") && notifications.includes("pushManager.subscribe"), "Faltan avisos del sistema.");
assert(notifications.includes("requestPermission"), "Falta la solicitud explícita de permiso.");
assert(exists("recovery-callback.html"), "Falta el callback de recuperación.");
assert(exists("open-app.html"), "Falta el puente web hacia la aplicación.");
assert(read("login.js").includes('"/recovery-callback"'), "Recuperar contraseña no usa su callback dedicado.");
assert(read("producto.js").includes("/open-app?path="), "Los productos no generan un enlace móvil.");

if (failures.length) {
  console.error(`Validación móvil fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validación móvil correcta: ${required.length} archivos, cámara, avisos, Android e iOS configurados.`);
