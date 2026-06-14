import test from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "./env.mjs";
import { redact } from "./redact.mjs";

const base = {
  NODE_ENV: "development",
  DEMO_MODE: "true",
  MATCHING_PROVIDER: "demo",
  DEFAULT_CLINIC_SLUG: "mindmatch-demo",
  PULSE_SCHEDULER_ENABLED: "false",
  API_PORT: "3001",
  PATIENT_PORT: "5173",
  DOCTOR_PORT: "5174",
  PATIENT_APP_URL: "http://127.0.0.1:5173",
  VITE_API_URL: "http://127.0.0.1:3001",
  FRONTEND_ORIGINS: "http://127.0.0.1:5173,http://127.0.0.1:5174",
  DATABASE_URL: "postgresql://mindmatch:mindmatch@127.0.0.1:55432/mindmatch",
  REDIS_URL: "redis://127.0.0.1:6379",
  SEED_ALLOWED_DB_PORT: "55432",
  DEMO_ALLOWED_DATABASE: "mindmatch",
  JWT_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
};

test("env valido no produce errores", () => {
  assert.deepEqual(validateEnv(base).errors, []);
});

test("rechaza production, remoto, puerto y slug incorrectos", () => {
  const env = { ...base, NODE_ENV: "production", DATABASE_URL: "postgresql://x:y@example.com:5432/prod", DEFAULT_CLINIC_SLUG: "otro" };
  const errors = validateEnv(env).errors.join("\n");
  assert.match(errors, /production/);
  assert.match(errors, /DB remota/);
  assert.match(errors, /mindmatch-demo/);
});

test("reset exige doble consentimiento", () => {
  assert.match(validateEnv(base, { reset: true }).errors.join("\n"), /ALLOW_DEMO_RESET/);
});

test("redacta secretos", () => {
  const out = redact('JWT_SECRET=abc Authorization: Bearer token "password":"Demo123!" postgresql://u:p@h:1/db');
  assert(!out.includes("Demo123!"));
  assert(!out.includes("Bearer token"));
  assert(!out.includes("u:p"));
});
