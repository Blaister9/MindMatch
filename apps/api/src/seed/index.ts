import { db, queryClient } from "../db";
import { env } from "../env";
import { hashPassword } from "../security/passwords";
import { createAnchor } from "./anchor";
import { DEMO_CLINIC_SLUG } from "./data/clinic";
import {
  assertNoForeignDemoDoctor,
  assertSeedEnvironment,
  SeedAbort,
} from "./guards";
import { insertDemoTenant } from "./insert-demo-tenant";
import { resetDemoTenant } from "./reset-demo-tenant";
import { verifyDemoSeed } from "./verify-demo-seed";

/**
 * Seed de datos demo (Fase 2).
 *
 * Idempotente y atómico: resetea SOLO el tenant `mindmatch-demo`, inserta todo
 * el dataset y verifica los invariantes DENTRO de la misma transacción. Si la
 * verificación crítica falla, hace rollback (no persiste un seed inválido).
 * Tras el commit, repite una verificación de solo lectura.
 */
async function seed() {
  // 1) Guardas previas (fuera de transacción). No tocan la base.
  assertSeedEnvironment();
  await assertNoForeignDemoDoctor();

  // 2) Ancla de fechas calculada una sola vez (hoy en Bogotá).
  const anchor = createAnchor();

  // 3) Hash de contraseña (mismo bcrypt de Fase 1); compartido por todos los
  //    usuarios demo (todos usan Demo123!). No se imprime.
  const passwordHash = await hashPassword(env.DEMO_DOCTOR_PASSWORD);

  // 4) Transacción única: reset → insert → verificación crítica.
  const result = await db.transaction(async (tx) => {
    await resetDemoTenant(tx);
    await insertDemoTenant(tx, anchor, passwordHash);
    // Verificación dentro de la transacción: si falla, lanza y se hace rollback.
    return verifyDemoSeed(tx, anchor);
  });

  // 5) Verificación de solo lectura tras el commit (confirma lo persistido).
  const postCommit = await verifyDemoSeed(db, anchor);

  console.log(`🌱 Seed demo completado para el tenant '${DEMO_CLINIC_SLUG}'.`);
  console.table(result.counts);
  console.log(`🔏 Firma lógica (in-tx):     ${result.signature}`);
  console.log(`🔏 Firma lógica (post-commit): ${postCommit.signature}`);
  if (result.signature !== postCommit.signature) {
    throw new Error("La firma lógica cambió entre la transacción y el commit.");
  }
  console.log("👤 Cuentas demo: doctora@demo.com y <nombre>@demo.com (clave Demo123!).");
}

seed()
  .catch((error) => {
    if (error instanceof SeedAbort) {
      console.error(`⛔ Seed abortado:\n${error.message}`);
    } else {
      console.error("❌ Error en el seed:", error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
