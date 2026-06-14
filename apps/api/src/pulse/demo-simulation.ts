import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { SimulateDayResponse } from "@mindmatch/shared";
import { db, schema } from "../db";
import { env } from "../env";
import { addDays } from "./dates";
import { advisoryTransactionLock } from "./locks";
import { evaluateClinicPulseTx } from "./pulse-service";
import { DEMO_CLINIC_SLUG } from "../seed/data/clinic";
import { PATIENTS, type PatientKey } from "../seed/data/patients";

const STABLE_PATTERNS: Record<Exclude<PatientKey, "mariana">, readonly number[]> = {
  daniel: [4, 4, 5, 4],
  laura: [4, 5, 4, 4],
  andres: [5, 4, 4, 5],
  valentina: [4, 3, 4, 4],
  camilo: [4, 5, 4, 4],
  juliana: [4, 4, 3, 4],
  felipe: [4, 4, 5, 4],
};

function nextFixture(patientKey: PatientKey, dayIndex: number) {
  if (patientKey === "mariana") {
    return { mood: 1, sleep: 3, connectedWithSomeone: true };
  }
  const values = STABLE_PATTERNS[patientKey];
  return {
    mood: values[dayIndex % values.length]!,
    sleep: 4,
    connectedWithSomeone: dayIndex % 3 !== 1,
  };
}

export async function simulateDemoDay(
  clinicId: string,
  requestId: string,
): Promise<SimulateDayResponse | { rejected: "not_demo" | "production" }> {
  if (env.NODE_ENV === "production") return { rejected: "production" };
  if (!env.DEMO_MODE) return { rejected: "not_demo" };

  return db.transaction(async (tx) => {
    await advisoryTransactionLock(tx, `demo-simulate:${clinicId}`);
    const [clinic] = await tx
      .select({ id: schema.clinics.id, slug: schema.clinics.slug })
      .from(schema.clinics)
      .where(and(eq(schema.clinics.id, clinicId), eq(schema.clinics.slug, DEMO_CLINIC_SLUG)))
      .limit(1);
    if (!clinic) return { rejected: "not_demo" as const };

    const [clock] = await tx
      .select()
      .from(schema.demoClocks)
      .where(eq(schema.demoClocks.clinicId, clinicId))
      .for("update")
      .limit(1);
    if (!clock) throw new Error("Missing demo clock");
    if (clock.lastRequestId === requestId && clock.lastResultJson) {
      return clock.lastResultJson as SimulateDayResponse;
    }

    const nextDate = addDays(clock.currentDate, 1);
    const daysAdvanced = Number(
      (
        await tx.execute(sql<{ days: number }>`
          select (${nextDate}::date - ${clock.currentDate}::date)::int as days
        `)
      )[0]?.days ?? 1,
    );
    const profileRows = await tx
      .select({
        email: schema.users.email,
        userId: schema.users.id,
        displayName: schema.patientProfiles.displayName,
      })
      .from(schema.users)
      .innerJoin(
        schema.patientProfiles,
        and(
          eq(schema.users.clinicId, schema.patientProfiles.clinicId),
          eq(schema.users.id, schema.patientProfiles.userId),
        ),
      )
      .where(and(eq(schema.users.clinicId, clinicId), eq(schema.users.role, "patient")));
    const byEmail = new Map(profileRows.map((row) => [row.email.toLowerCase(), row]));
    let insertedCheckIns = 0;
    for (const patient of PATIENTS) {
      const row = byEmail.get(patient.email.toLowerCase());
      if (!row) throw new Error(`Missing demo patient ${patient.key}`);
      const fixture = nextFixture(patient.key, daysAdvanced - 1);
      const inserted = await tx
        .insert(schema.checkIns)
        .values({
          id: randomUUID(),
          clinicId,
          patientUserId: row.userId,
          checkInDate: nextDate,
          mood: fixture.mood,
          sleep: fixture.sleep,
          connectedWithSomeone: fixture.connectedWithSomeone,
        })
        .onConflictDoNothing()
        .returning({ id: schema.checkIns.id });
      insertedCheckIns += inserted.length;
    }

    const created = await evaluateClinicPulseTx(tx, clinicId, nextDate);
    const nameByUser = new Map(profileRows.map((row) => [row.userId, row.displayName]));
    const result: SimulateDayResponse = {
      previousDate: clock.currentDate,
      currentDate: nextDate,
      insertedCheckIns,
      createdAlerts: created.map((alert) => ({
        patientDisplayName: nameByUser.get(alert.patientUserId) ?? "Paciente",
        ruleCode: alert.ruleCode as SimulateDayResponse["createdAlerts"][number]["ruleCode"],
        severity: alert.severity as SimulateDayResponse["createdAlerts"][number]["severity"],
      })),
    };
    await tx
      .update(schema.demoClocks)
      .set({
        currentDate: nextDate,
        lastRequestId: requestId,
        lastResultJson: result,
        updatedAt: new Date(),
      })
      .where(eq(schema.demoClocks.clinicId, clinicId));
    return result;
  });
}
