import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const scriptDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const mobileRoot = resolve(scriptDirectory, "..");
const projectRoot = resolve(mobileRoot, "..");
const webDir = resolve(mobileRoot, "www");

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

const ignored = new Set([
  ".git",
  ".github",
  "database",
  "docs",
  "mobile-app",
  "node_modules"
]);

for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (ignored.has(entry.name)) continue;
  await cp(
    resolve(projectRoot, entry.name),
    resolve(webDir, entry.name),
    { recursive: true }
  );
}

console.log("Web de ColegioLibre sincronizada en mobile-app/www.");
