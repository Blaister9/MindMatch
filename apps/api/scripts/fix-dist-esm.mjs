import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, "dist");

if (!existsSync(distRoot)) {
  throw new Error("No existe apps/api/dist. Ejecuta primero tsc -p tsconfig.build.json.");
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))) {
      files.push(fullPath);
    }
  }
  return files;
}

function toSpecifier(fromFile, targetFile) {
  let specifier = relative(dirname(fromFile), targetFile).split(sep).join("/");
  if (!specifier.startsWith(".")) specifier = `./${specifier}`;
  return specifier;
}

function resolveRelative(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  const direct = `${base}.js`;
  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  const index = join(base, "index.js");
  if (existsSync(index) && statSync(index).isFile()) return index;

  throw new Error(
    `No se pudo resolver el import relativo "${specifier}" desde ${relative(packageRoot, fromFile)}`,
  );
}

function shouldRewrite(specifier) {
  return (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !specifier.includes("?") &&
    !specifier.includes("#") &&
    extname(specifier) === ""
  );
}

const importExportPattern =
  /(\b(?:from|import)\s*(?:\(\s*)?["'])(\.{1,2}\/[^"']+)(["'])/g;

let rewrites = 0;
for (const file of walk(distRoot)) {
  const source = readFileSync(file, "utf8");
  const next = source.replace(importExportPattern, (match, prefix, specifier, suffix) => {
    if (!shouldRewrite(specifier)) return match;
    rewrites += 1;
    return `${prefix}${toSpecifier(file, resolveRelative(file, specifier))}${suffix}`;
  });
  if (next !== source) writeFileSync(file, next);
}

console.log(`ESM dist imports verificados (${rewrites} specifier(s) relativos reescritos).`);
