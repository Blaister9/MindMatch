import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicDbIdentity } from "./redact.mjs";

export const EXPECTED_SIGNATURE =
  "4d8436fd16990e7d19040b8f20cdcd7d23a87a326ba1fe2dafc174ba0593d772";

export const services = {
  api: { portKey: "API_PORT", defaultPort: 3001, urlKey: "VITE_API_URL" },
  patient: { portKey: "PATIENT_PORT", defaultPort: 5173, urlKey: "PATIENT_APP_URL" },
  doctor: { portKey: "DOCTOR_PORT", defaultPort: 5174 },
};

export function workspaceRoot() {
  return resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

export function envFilePath() {
  return resolve(process.env.DEMO_ENV_FILE || ".env.demo.local");
}

export function parseEnvFile(file) {
  const parsed = {};
  if (!existsSync(file)) return parsed;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    parsed[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return parsed;
}

export function loadDemoEnv({ requireFile = true } = {}) {
  const file = envFilePath();
  if (requireFile && !existsSync(file)) {
    throw new Error(`No existe ${file}. Ejecuta pnpm demo:init.`);
  }
  const fileEnv = parseEnvFile(file);
  return {
    file,
    env: {
      ...process.env,
      ...fileEnv,
      NODE_ENV: fileEnv.NODE_ENV ?? process.env.NODE_ENV ?? "development",
    },
  };
}

export function port(env, key, fallback) {
  const value = Number(env[key] || fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} invalido.`);
  return value;
}

export function urls(env) {
  const apiPort = port(env, "API_PORT", 3001);
  const patientPort = port(env, "PATIENT_PORT", 5173);
  const doctorPort = port(env, "DOCTOR_PORT", 5174);
  return {
    api: `http://127.0.0.1:${apiPort}`,
    patient: `http://127.0.0.1:${patientPort}`,
    doctor: `http://127.0.0.1:${doctorPort}`,
  };
}

export function validateEnv(env, { reset = false, readiness = false } = {}) {
  const errors = [];
  const warnings = [];
  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "FRONTEND_ORIGINS",
    "PATIENT_APP_URL",
    "VITE_API_URL",
    "DEFAULT_CLINIC_SLUG",
    "DEMO_MODE",
    "MATCHING_PROVIDER",
    "DEMO_ALLOWED_DATABASE",
  ];
  for (const key of required) if (!env[key]) errors.push(`${key} ausente.`);
  if (env.NODE_ENV === "production") errors.push("NODE_ENV=production no es valido para RC local.");
  if (env.NODE_ENV !== "development") warnings.push(`NODE_ENV=${env.NODE_ENV}; recomendado development.`);
  if (env.DEMO_MODE !== "true") errors.push("DEMO_MODE debe ser true.");
  if (env.MATCHING_PROVIDER !== "demo") errors.push("MATCHING_PROVIDER debe ser demo.");
  if (env.DEFAULT_CLINIC_SLUG !== "mindmatch-demo") errors.push("DEFAULT_CLINIC_SLUG debe ser mindmatch-demo.");
  if (env.PULSE_SCHEDULER_ENABLED !== "false") errors.push("PULSE_SCHEDULER_ENABLED debe ser false.");
  if (!env.JWT_SECRET || env.JWT_SECRET.includes("__GENERATED") || env.JWT_SECRET.length < 24) {
    errors.push("JWT_SECRET ausente, placeholder o demasiado corto.");
  }
  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.includes("__GENERATED") || env.JWT_REFRESH_SECRET.length < 24) {
    errors.push("JWT_REFRESH_SECRET ausente, placeholder o demasiado corto.");
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) errors.push("JWT_SECRET y JWT_REFRESH_SECRET no pueden ser iguales.");

  try {
    const db = new URL(env.DATABASE_URL);
    const dbName = db.pathname.replace(/^\//, "");
    const dbPort = Number(db.port || "5432");
    if (!["127.0.0.1", "localhost"].includes(db.hostname)) errors.push(`DB remota no permitida: ${db.hostname}.`);
    if (dbPort !== Number(env.SEED_ALLOWED_DB_PORT || 55432)) errors.push("DATABASE_URL port no coincide con SEED_ALLOWED_DB_PORT.");
    if (dbName !== env.DEMO_ALLOWED_DATABASE) errors.push("DATABASE_URL database no coincide con DEMO_ALLOWED_DATABASE.");
  } catch {
    errors.push("DATABASE_URL invalida.");
  }

  const u = urls(env);
  if (env.VITE_API_URL !== u.api) errors.push(`VITE_API_URL debe ser ${u.api}.`);
  if (env.PATIENT_APP_URL !== u.patient) errors.push(`PATIENT_APP_URL debe ser ${u.patient}.`);
  const origins = new Set(env.FRONTEND_ORIGINS.split(",").map((x) => x.trim()));
  if (!origins.has(u.patient) || !origins.has(u.doctor)) errors.push("FRONTEND_ORIGINS debe incluir paciente y doctora con 127.0.0.1.");
  if (reset && env.ALLOW_DEMO_RESET !== "true") errors.push("ALLOW_DEMO_RESET=true requerido para reset.");
  if (readiness && env.ALLOW_DEMO_SEED !== "true") warnings.push("ALLOW_DEMO_SEED no esta activo; reset/seed no podran correr.");
  return { errors, warnings, dbIdentity: env.DATABASE_URL ? publicDbIdentity(env.DATABASE_URL) : null };
}

export function envForChild(env) {
  return { ...process.env, ...env };
}
