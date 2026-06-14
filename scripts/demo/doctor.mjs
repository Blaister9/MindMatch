import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run, pnpmBin } from "./lib/commands.mjs";
import { loadDemoEnv, port, urls, validateEnv, workspaceRoot } from "./lib/env.mjs";
import { portOwner } from "./lib/ports.mjs";
import { readState, manifestPath } from "./lib/runtime.mjs";
import { redact } from "./lib/redact.mjs";

const root = workspaceRoot();
const { file, env } = loadDemoEnv();
const state = readState();
const results = [];
const add = (level, message) => results.push({ level, message });

function version() {
  try {
    return readFileSync(join(root, "VERSION"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

const v = validateEnv(env, { readiness: true });
for (const msg of v.warnings) add("WARN", msg);
for (const msg of v.errors) add("ERROR", msg);
add("OK", `RC ${version()} usando env ${file}`);
add("OK", `DB ${v.dbIdentity || "no disponible"}`);

try {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 22) add("OK", `Node ${process.versions.node}`);
  else add("ERROR", `Node ${process.versions.node}; se requiere >=22.`);
} catch {
  add("ERROR", "No se pudo validar Node.");
}

try {
  const out = await run(pnpmBin(), ["--version"], { env, silent: true, label: "pnpm --version" });
  add(out.stdout.trim().startsWith("11.") ? "OK" : "WARN", `pnpm ${out.stdout.trim()}`);
} catch (error) {
  add("ERROR", `pnpm no disponible: ${error.message}`);
}

for (const [label, args] of [
  ["Docker CLI", ["--version"]],
  ["Docker Compose", ["compose", "version"]],
  ["Docker Engine", ["info"]],
]) {
  try {
    await run("docker", args, { env, silent: true, label });
    add("OK", label);
  } catch (error) {
    add("ERROR", `${label} no disponible: ${error.message}`);
  }
}

for (const [service, p] of Object.entries({
  api: port(env, "API_PORT", 3001),
  patient: port(env, "PATIENT_PORT", 5173),
  doctor: port(env, "DOCTOR_PORT", 5174),
})) {
  const owner = await portOwner(p);
  if (!owner) add("OK", `Puerto ${p} (${service}) libre.`);
  else if (state.services?.[service]?.pid === owner.pid) add("OK", `Puerto ${p} (${service}) ocupado por RC registrado PID ${owner.pid}.`);
  else add("ERROR", `Puerto ${p} (${service}) ocupado por PID ${owner.pid}: ${redact(owner.commandLine)}`);
}

for (const filePath of [
  "apps/api/scripts/fix-dist-esm.mjs",
  "packages/shared/scripts/fix-dist-esm.mjs",
  "apps/api/dist/index.js",
  "apps/patient-app/dist/index.html",
  "apps/doctor-panel/dist/index.html",
]) {
  const level = existsSync(join(root, filePath)) ? "OK" : filePath.includes("/dist/") ? "WARN" : "ERROR";
  add(level, `${filePath}${level === "WARN" ? " no generado aun" : ""}`);
}
add(existsSync(manifestPath) ? "OK" : "WARN", "build manifest");

const u = urls(env);
add("OK", `URLs: API ${u.api}, paciente ${u.patient}, doctora ${u.doctor}`);

for (const r of results) console.log(`${r.level}: ${r.message}`);
if (results.some((r) => r.level === "ERROR")) process.exit(1);
