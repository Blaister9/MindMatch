import { and, eq } from "drizzle-orm";
import { env } from "../env";
import { bogotaTodayYmd } from "../domain/dates";
import { schema } from "../db";
import type { Reader } from "../matching/types";
import { DEMO_CLINIC_SLUG } from "../seed/data/clinic";

export function realTodayBogota(): string {
  return bogotaTodayYmd();
}

export async function todayForClinic(ex: Reader, clinicId: string): Promise<string> {
  const [clinic] = await ex
    .select({ slug: schema.clinics.slug })
    .from(schema.clinics)
    .where(eq(schema.clinics.id, clinicId))
    .limit(1);
  if (clinic?.slug === DEMO_CLINIC_SLUG && env.DEMO_MODE) {
    const [clock] = await ex
      .select({ currentDate: schema.demoClocks.currentDate })
      .from(schema.demoClocks)
      .where(eq(schema.demoClocks.clinicId, clinicId))
      .limit(1);
    return clock?.currentDate ?? realTodayBogota();
  }
  return realTodayBogota();
}

export async function isDemoClinic(ex: Reader, clinicId: string): Promise<boolean> {
  const [clinic] = await ex
    .select({ slug: schema.clinics.slug })
    .from(schema.clinics)
    .where(and(eq(schema.clinics.id, clinicId), eq(schema.clinics.slug, DEMO_CLINIC_SLUG)))
    .limit(1);
  return Boolean(clinic);
}
