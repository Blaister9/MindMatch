import { eq } from "drizzle-orm";
import { db, queryClient, schema } from "../db";
import { env } from "../env";
import { DEMO_CLINIC_SLUG } from "../seed/data/clinic";
import { realTodayBogota } from "../pulse/business-clock";
import { evaluateClinicPulse } from "../pulse/pulse-service";

async function main() {
  const today = realTodayBogota();
  const clinics = await db
    .select({ id: schema.clinics.id, slug: schema.clinics.slug })
    .from(schema.clinics)
    .where(eq(schema.clinics.status, "active"));
  let evaluated = 0;
  for (const clinic of clinics) {
    if (env.DEMO_MODE && clinic.slug === DEMO_CLINIC_SLUG) continue;
    await evaluateClinicPulse(clinic.id, today);
    evaluated += 1;
  }
  console.log(`Pulso evaluado para ${evaluated} clinicas en fecha ${today}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await queryClient.end();
  });
