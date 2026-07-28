import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const ignoredDirectories = new Set([".git", ".vercel", "node_modules"]);
const files = [];
const errors = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const absolute = join(directory, entry);
    const info = statSync(absolute);
    if (info.isDirectory()) walk(absolute);
    else files.push(absolute);
  }
}

function projectPath(absolute) {
  return relative(rootPath, absolute).replaceAll("\\", "/");
}

function report(message) {
  errors.push(message);
}

walk(rootPath);

const apiFiles = files.filter((file) => projectPath(file).startsWith("api/"));
for (const file of apiFiles) {
  if (extname(file) !== ".js") {
    report(
      `Archivo inválido dentro de api/: ${projectPath(file)}. ` +
      "Vercel reserva esa carpeta para funciones JavaScript."
    );
  }
}

const apiNames = new Set();
for (const file of apiFiles) {
  const route = projectPath(file).replace(/^api\//, "").replace(/\.[^.]+$/, "");
  if (apiNames.has(route)) report(`Ruta API duplicada en Vercel: /api/${route}`);
  apiNames.add(route);
}

for (const file of files.filter((item) => extname(item) === ".js")) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    report(`JavaScript inválido: ${projectPath(file)}\n${error.stderr || error.message}`);
  }
}

for (const file of files.filter((item) => extname(item) === ".json")) {
  try {
    JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    report(`JSON inválido: ${projectPath(file)} (${error.message})`);
  }
}

for (const file of files.filter((item) => extname(item) === ".html")) {
  const html = readFileSync(file, "utf8");
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(
    (match) => match[1]
  );
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) {
    report(`IDs duplicados en ${projectPath(file)}: ${duplicates.join(", ")}`);
  }

  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#?]+)(?:[?#][^"']*)?["']/gi)) {
    const reference = match[1].trim();
    if (
      !reference ||
      /^(?:https?:|mailto:|tel:|data:|blob:|\/\/)/i.test(reference)
    ) {
      continue;
    }

    const normalizedReference = reference.startsWith("/")
      ? reference.slice(1)
      : reference;
    const target = new URL(normalizedReference, new URL(projectPath(file), root));
    if (target.protocol !== "file:") continue;
    if (!existsSync(fileURLToPath(target))) {
      report(`Recurso inexistente en ${projectPath(file)}: ${reference}`);
    }
  }
}

const forbiddenSecretPatterns = [
  { name: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Supabase service role JWT", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g }
];

for (const file of files.filter((item) =>
  [".html", ".js", ".json", ".md", ".txt"].includes(extname(item))
)) {
  const content = readFileSync(file, "utf8");
  for (const { name, pattern } of forbiddenSecretPatterns) {
    if (pattern.test(content)) report(`${name} expuesta en ${projectPath(file)}`);
    pattern.lastIndex = 0;
  }
}

if (errors.length) {
  console.error(`\nValidación fallida (${errors.length} problema/s):\n`);
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  process.exit(1);
}

console.log(
  `Validación correcta: ${files.length} archivos, JavaScript/JSON válidos, sin IDs duplicados, referencias locales rotas ni secretos detectados.`
);
