import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { DEMO_CLINIC_SLUG, DEMO_DOCTOR_EMAIL } from "./data/clinic";

/**
 * Error de aborto controlado del seed: el índice lo presenta como mensaje claro
 * (sin stack) y sale con código distinto de cero, sin tocar la base.
 */
export class SeedAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedAbort";
  }
}

/**
 * Guardas de entorno (sin DB). Se ejecutan ANTES de abrir la transacción
 * destructiva. Si algo falla, lanza SeedAbort y no se modifica nada.
 */
export function assertSeedEnvironment(): void {
  const problems: string[] = [];

  if (env.NODE_ENV === "production") {
    problems.push("NODE_ENV es 'production'.");
  }
  if (!env.ALLOW_DEMO_SEED) {
    problems.push("ALLOW_DEMO_SEED debe ser 'true'.");
  }

  let host = "";
  let port = 0;
  try {
    const url = new URL(env.DATABASE_URL);
    host = url.hostname;
    port = Number(url.port || "5432");
  } catch {
    problems.push("DATABASE_URL no es una URL válida.");
  }

  if (host && host !== "localhost" && host !== "127.0.0.1") {
    problems.push(`El host de la base de datos no es local: '${host}'.`);
  }
  if (port && port !== env.SEED_ALLOWED_DB_PORT) {
    problems.push(
      `El puerto de la base de datos (${port}) no coincide con SEED_ALLOWED_DB_PORT (${env.SEED_ALLOWED_DB_PORT}).`,
    );
  }

  // El slug objetivo está fijado en código; comprobación defensiva.
  if (DEMO_CLINIC_SLUG !== "mindmatch-demo") {
    problems.push(`El slug objetivo no es 'mindmatch-demo' (${DEMO_CLINIC_SLUG}).`);
  }

  if (problems.length > 0) {
    throw new SeedAbort(
      `No se cumplen las guardas de seguridad del seed:\n - ${problems.join("\n - ")}`,
    );
  }
}

/**
 * Aborta si la doctora demo está activa en una clínica distinta de
 * `mindmatch-demo`. NO borra esa clínica; solo impide sembrar para evitar
 * ambigüedad de login multi-tenant. Read-only, fuera de la transacción.
 */
export async function assertNoForeignDemoDoctor(): Promise<void> {
  const email = DEMO_DOCTOR_EMAIL.toLowerCase();
  const rows = await db
    .select({ slug: schema.clinics.slug })
    .from(schema.users)
    .innerJoin(schema.clinics, eq(schema.users.clinicId, schema.clinics.id))
    .where(
      and(
        sql`lower(${schema.users.email}) = ${email}`,
        eq(schema.users.status, "active"),
      ),
    );

  const foreign = [...new Set(rows.map((row) => row.slug))].filter(
    (slug) => slug !== DEMO_CLINIC_SLUG,
  );

  if (foreign.length > 0) {
    throw new SeedAbort(
      `La doctora demo (${DEMO_DOCTOR_EMAIL}) está activa en otra(s) clínica(s): ` +
        `${foreign.join(", ")}. El seed no continúa para no romper el login ` +
        `multi-tenant y NO borra esa clínica automáticamente. Resuélvelo a mano ` +
        `o usa una base local nueva.`,
    );
  }
}
