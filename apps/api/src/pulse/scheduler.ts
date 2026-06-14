import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../db";
import { env } from "../env";
import { realTodayBogota } from "./business-clock";
import { evaluateClinicPulse } from "./pulse-service";
import { runClinicAnalyticsRefresh } from "../analytics/refresh-service";
import { DEMO_CLINIC_SLUG } from "../seed/data/clinic";

async function evaluateNormalClinics() {
  const today = realTodayBogota();
  const clinics = await db
    .select({ id: schema.clinics.id, slug: schema.clinics.slug })
    .from(schema.clinics)
    .where(eq(schema.clinics.status, "active"));
  const analyticsFailures: string[] = [];
  for (const clinic of clinics) {
    if (env.DEMO_MODE && clinic.slug === DEMO_CLINIC_SLUG) continue;
    await evaluateClinicPulse(clinic.id, today);
    // Tras la evaluación diaria, refrescar analytics de esa clínica (idempotente).
    // Un fallo de analytics no aborta el Pulso de otras clínicas; se reporta al
    // final y se reintenta en el próximo arranque del scheduler.
    try {
      await runClinicAnalyticsRefresh(clinic.id);
    } catch {
      analyticsFailures.push(clinic.id);
    }
  }
  if (analyticsFailures.length > 0) {
    throw new Error(`analytics refresh failed for clinics: ${analyticsFailures.join(", ")}`);
  }
}

function msUntilNextBogotaRun(): number {
  const now = new Date();
  const bogotaToday = realTodayBogota();
  const [year, month, day] = bogotaToday.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1, 5, 10, 0));
  return Math.max(60_000, next.getTime() - now.getTime());
}

export function registerPulseScheduler(app: FastifyInstance) {
  if (!env.PULSE_SCHEDULER_ENABLED) return;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      await evaluateNormalClinics();
    } catch (error) {
      app.log.error({ error }, "Error evaluando Pulso Emocional");
    } finally {
      timer = setTimeout(run, msUntilNextBogotaRun());
    }
  };
  timer = setTimeout(run, 1000);
  app.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
}
