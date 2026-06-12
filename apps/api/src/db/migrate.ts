import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../env";

// Cliente dedicado a migraciones (una sola conexión).
const migrationClient = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(migrationClient);

async function main() {
  // pgvector debe existir antes de crear columnas `vector`.
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("✅ Migraciones aplicadas correctamente.");
}

main()
  .catch((err) => {
    console.error("❌ Error aplicando migraciones:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await migrationClient.end();
  });
