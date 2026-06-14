import { eq } from "drizzle-orm";
import { db, queryClient, schema } from "../db";
import { runClinicAnalyticsRefresh } from "../analytics/refresh-service";
import { DEMO_CLINIC_SLUG } from "../seed/data/clinic";

/**
 * CLI: `pnpm analytics:refresh [--all] [--clinic=<slug>] [--from=YYYY-MM-DD]`.
 * Usa el servicio directo (sin HTTP), advisory lock tenant-scoped por clínica.
 * Reporta solo slugs, fechas y conteos. Sale con código != 0 si falla.
 */
async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const clinicArg = args.find((a) => a.startsWith("--clinic="))?.split("=")[1];
  const from = args.find((a) => a.startsWith("--from="))?.split("=")[1];

  const clinics = await db
    .select({ id: schema.clinics.id, slug: schema.clinics.slug })
    .from(schema.clinics)
    .where(all ? eq(schema.clinics.status, "active") : undefined);

  const targets = all
    ? clinics
    : clinics.filter((c) => c.slug === (clinicArg ?? DEMO_CLINIC_SLUG));

  if (targets.length === 0) {
    console.error("No se encontraron clínicas objetivo para analytics:refresh.");
    process.exitCode = 1;
    return;
  }

  for (const clinic of targets) {
    const result = await runClinicAnalyticsRefresh(clinic.id, from ? { from } : {});
    console.log(
      `📊 ${clinic.slug}: rango ${result.from}..${result.to} · ` +
        `${result.clinicDates} días clínica · ${result.patientRows} filas paciente.`,
    );
  }
}

main()
  .catch((error) => {
    console.error("❌ Error en analytics:refresh:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
