import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

const here = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(here, "../../.env") });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Drizzle solo gestiona nuestros tres esquemas, nunca toca `public`.
  schemaFilter: ["social", "clinical", "analytics"],
  verbose: true,
  strict: true,
});
