import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const target = resolve(process.env.DEMO_ENV_FILE || ".env.demo.local");
const source = resolve(".env.demo.example");

if (existsSync(target)) {
  console.log(`${target} ya existe. No se sobrescribio.`);
  process.exit(0);
}

let text = readFileSync(source, "utf8");
text = text.replace("JWT_SECRET=__GENERATED_BY_DEMO_INIT__", `JWT_SECRET=${randomBytes(32).toString("hex")}`);
text = text.replace("JWT_REFRESH_SECRET=__GENERATED_BY_DEMO_INIT__", `JWT_REFRESH_SECRET=${randomBytes(32).toString("hex")}`);
writeFileSync(target, text);
console.log(`Creado ${target}.`);
console.log("Se generaron secretos locales y no se imprimieron. Revisa puertos si tu equipo ya usa alguno.");
