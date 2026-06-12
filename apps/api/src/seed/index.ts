import { queryClient } from "../db";

/**
 * Seed de datos demo.
 *
 * TODO(Fase 2): implementar según la sección "Modo demo" del CLAUDE.md:
 *   1 clínica, 1 doctora (doctora@demo.com / Demo123!), 8 pacientes
 *   colombianos, matches pre-calculados, 2 conversaciones, 1 grupo de
 *   apoyo y 14 días de check-ins (Mariana con patrón descendente).
 *
 * Debe ser idempotente: correr `pnpm seed` dos veces seguidas resetea limpio.
 */
async function seed() {
  console.log("🌱 Seed vacío (placeholder). Se implementa en la Fase 2.");
}

seed()
  .catch((err) => {
    console.error("❌ Error en el seed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
