import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// El .env vive en la raíz del monorepo (un solo archivo para todo).
const here = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["demo", "development", "production"]).default("demo"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  FRONTEND_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:5174"),
  PATIENT_APP_URL: z.string().url().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  DEFAULT_CLINIC_SLUG: z.string().default("mindmatch-demo"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEMO_DOCTOR_EMAIL: z.string().email().default("doctora@demo.com"),
  DEMO_DOCTOR_PASSWORD: z.string().min(8).default("Demo123!"),
});

const parsed = envSchema.safeParse({
  ...process.env,
  NODE_ENV: process.env.NODE_ENV === "test" ? "demo" : process.env.NODE_ENV,
});

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isDemo = env.NODE_ENV === "demo";

export const frontendOrigins = env.FRONTEND_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
