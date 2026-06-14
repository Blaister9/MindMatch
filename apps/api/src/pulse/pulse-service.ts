import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type {
  DoctorAlert,
  PublicAlertEvidence,
  PulseHistoryPoint,
} from "@mindmatch/shared";
import { db, schema } from "../db";
import type { Reader, Transaction } from "../matching/types";
import { addDays, lastNDates } from "./dates";
import { evaluatePatientPulse } from "./evaluate-pulse";
import { PULSE_RULE_REGISTRY } from "./registry";
import { advisoryTransactionLock } from "./locks";
import type { PulseCheckIn, RuleAlertCandidate } from "./types";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function hhmm(value: string): string {
  return value.slice(0, 5);
}

export function toCheckInDto(row: {
  checkInDate: string;
  mood: number;
  sleep: number;
  connectedWithSomeone: boolean;
  updatedAt: Date;
}) {
  return {
    checkInDate: row.checkInDate,
    mood: row.mood,
    sleep: row.sleep,
    connectedWithSomeone: row.connectedWithSomeone,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensurePulsePreference(
  tx: Transaction,
  clinicId: string,
  patientUserId: string,
  businessToday: string,
) {
  const [clinic] = await tx
    .select({ timezone: schema.clinics.timezone })
    .from(schema.clinics)
    .where(eq(schema.clinics.id, clinicId))
    .limit(1);
  const timezone = clinic?.timezone ?? "America/Bogota";
  const inserted = await tx
    .insert(schema.checkInPreferences)
    .values({
      id: randomUUID(),
      clinicId,
      patientUserId,
      enabled: true,
      enabledOn: businessToday,
      localTime: "08:00:00",
      timezone,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const [existing] = await tx
    .select()
    .from(schema.checkInPreferences)
    .where(
      and(
        eq(schema.checkInPreferences.clinicId, clinicId),
        eq(schema.checkInPreferences.patientUserId, patientUserId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Missing check-in preferences");
  return existing;
}

async function loadPatientHistory(
  ex: Reader,
  clinicId: string,
  patientUserId: string,
  asOfDate: string,
): Promise<PulseCheckIn[]> {
  const rows = await ex
    .select({
      date: schema.checkIns.checkInDate,
      mood: schema.checkIns.mood,
      sleep: schema.checkIns.sleep,
      connectedWithSomeone: schema.checkIns.connectedWithSomeone,
    })
    .from(schema.checkIns)
    .where(
      and(
        eq(schema.checkIns.clinicId, clinicId),
        eq(schema.checkIns.patientUserId, patientUserId),
        lte(schema.checkIns.checkInDate, asOfDate),
      ),
    )
    .orderBy(asc(schema.checkIns.checkInDate));
  return rows;
}

async function insertCandidates(
  tx: Transaction,
  clinicId: string,
  patientUserId: string,
  candidates: RuleAlertCandidate[],
): Promise<Array<{ id: string; ruleCode: string; severity: string }>> {
  const created: Array<{ id: string; ruleCode: string; severity: string }> = [];
  for (const candidate of candidates) {
    const [alert] = await tx
      .insert(schema.alerts)
      .values({
        id: randomUUID(),
        clinicId,
        patientUserId,
        ruleCode: candidate.ruleCode,
        severity: candidate.severity,
        status: "open",
        dedupeKey: candidate.dedupeKey,
        inputsJson: candidate.inputsJson,
        triggeredAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({
        id: schema.alerts.id,
        ruleCode: schema.alerts.ruleCode,
        severity: schema.alerts.severity,
      });
    if (alert) created.push(alert);
  }
  return created;
}

export async function evaluatePatientPulseTx(
  tx: Transaction,
  clinicId: string,
  patientUserId: string,
  asOfDate: string,
) {
  const [preference] = await tx
    .select({
      enabled: schema.checkInPreferences.enabled,
      enabledOn: schema.checkInPreferences.enabledOn,
    })
    .from(schema.checkInPreferences)
    .where(
      and(
        eq(schema.checkInPreferences.clinicId, clinicId),
        eq(schema.checkInPreferences.patientUserId, patientUserId),
      ),
    )
    .limit(1);
  const checkIns = await loadPatientHistory(tx, clinicId, patientUserId, asOfDate);
  const candidates = evaluatePatientPulse({
    asOfDate,
    checkIns,
    preference: preference
      ? { enabled: preference.enabled, enabledOn: preference.enabledOn }
      : null,
  });
  return insertCandidates(tx, clinicId, patientUserId, candidates);
}

export async function evaluateClinicPulseTx(
  tx: Transaction,
  clinicId: string,
  asOfDate: string,
) {
  await advisoryTransactionLock(tx, `pulse:clinic:${clinicId}:${asOfDate}`);
  const patients = await tx
    .select({ patientUserId: schema.patientClinical.patientUserId })
    .from(schema.patientClinical)
    .where(
      and(
        eq(schema.patientClinical.clinicId, clinicId),
        eq(schema.patientClinical.careStatus, "active"),
      ),
    );
  const created: Array<{ patientUserId: string; id: string; ruleCode: string; severity: string }> = [];
  for (const patient of patients) {
    const alerts = await evaluatePatientPulseTx(tx, clinicId, patient.patientUserId, asOfDate);
    created.push(...alerts.map((alert) => ({ patientUserId: patient.patientUserId, ...alert })));
  }
  return created;
}

export async function evaluateClinicPulse(clinicId: string, asOfDate: string) {
  return db.transaction((tx) => evaluateClinicPulseTx(tx, clinicId, asOfDate));
}

export async function upsertPatientCheckIn(
  clinicId: string,
  patientUserId: string,
  asOfDate: string,
  input: { mood: number; sleep: number; connectedWithSomeone: boolean },
) {
  return db.transaction(async (tx) => {
    await advisoryTransactionLock(tx, `pulse:checkin:${clinicId}:${patientUserId}:${asOfDate}`);
    await ensurePulsePreference(tx, clinicId, patientUserId, asOfDate);
    const [row] = await tx
      .insert(schema.checkIns)
      .values({
        id: randomUUID(),
        clinicId,
        patientUserId,
        checkInDate: asOfDate,
        mood: input.mood,
        sleep: input.sleep,
        connectedWithSomeone: input.connectedWithSomeone,
      })
      .onConflictDoUpdate({
        target: [
          schema.checkIns.clinicId,
          schema.checkIns.patientUserId,
          schema.checkIns.checkInDate,
        ],
        set: {
          mood: input.mood,
          sleep: input.sleep,
          connectedWithSomeone: input.connectedWithSomeone,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("Check-in not saved");
    await evaluatePatientPulseTx(tx, clinicId, patientUserId, asOfDate);
    return toCheckInDto(row);
  });
}

export async function getHistory(
  ex: Reader,
  clinicId: string,
  patientUserId: string,
  asOfDate: string,
  days: number,
): Promise<PulseHistoryPoint[]> {
  const start = addDays(asOfDate, 1 - days);
  const rows = await ex
    .select({
      date: schema.checkIns.checkInDate,
      mood: schema.checkIns.mood,
      sleep: schema.checkIns.sleep,
      connectedWithSomeone: schema.checkIns.connectedWithSomeone,
    })
    .from(schema.checkIns)
    .where(
      and(
        eq(schema.checkIns.clinicId, clinicId),
        eq(schema.checkIns.patientUserId, patientUserId),
        gte(schema.checkIns.checkInDate, start),
        lte(schema.checkIns.checkInDate, asOfDate),
      ),
    );
  const byDay = new Map(rows.map((row) => [row.date, row]));
  return lastNDates(asOfDate, days).map((date) => {
    const row = byDay.get(date);
    return {
      date,
      mood: row?.mood ?? null,
      sleep: row?.sleep ?? null,
      connectedWithSomeone: row?.connectedWithSomeone ?? null,
    };
  });
}

function publicEvidence(ruleCode: string, inputs: Record<string, unknown>, triggeredAt: Date): PublicAlertEvidence {
  if (ruleCode === "R1") {
    return {
      ruleCode: "R1",
      asOfDate: String(inputs.asOfDate),
      previousAverage: Number(inputs.previousAverage),
      recentAverage: Number(inputs.recentAverage),
      drop: Number(inputs.drop),
      windowStart: String(inputs.windowStart),
      windowEnd: String(inputs.windowEnd),
    };
  }
  if (ruleCode === "R2" || ruleCode === "R4") {
    const start = String(inputs.streakStart);
    return {
      ruleCode,
      asOfDate: String(inputs.asOfDate),
      streakStart: start,
      streakEnd: String(inputs.streakEnd),
      streakLength: Number(inputs.streakLength),
    } as PublicAlertEvidence;
  }
  if (ruleCode === "R3") {
    return {
      ruleCode: "R3",
      asOfDate: String(inputs.asOfDate),
      absenceStart: String(inputs.absenceStart),
      daysWithoutCheckIn: Number(inputs.daysWithoutCheckIn),
    };
  }
  if (ruleCode === "R5") {
    return {
      ruleCode: "R5",
      asOfDate: String(inputs.asOfDate),
      windowStart: String(inputs.windowStart),
      windowEnd: String(inputs.windowEnd),
      slope: Number(inputs.slope),
      daysWithoutConnection: Number(inputs.daysWithoutConnection),
    };
  }
  return {
    ruleCode: "R6",
    reasonCategory: String(inputs.reason ?? "other"),
    triggeredAt: triggeredAt.toISOString(),
  };
}

function evidenceDate(evidence: PublicAlertEvidence, triggeredAt: Date): string {
  if (evidence.ruleCode === "R6") return triggeredAt.toISOString().slice(0, 10);
  return evidence.asOfDate;
}

export async function listDoctorAlerts(
  clinicId: string,
  status: "open" | "managed" | "all" = "open",
): Promise<DoctorAlert[]> {
  const statusFilter = status === "all" ? undefined : eq(schema.alerts.status, status);
  const alerts = await db
    .select({
      alertId: schema.alerts.id,
      patientUserId: schema.alerts.patientUserId,
      ruleCode: schema.alerts.ruleCode,
      severity: schema.alerts.severity,
      status: schema.alerts.status,
      inputsJson: schema.alerts.inputsJson,
      triggeredAt: schema.alerts.triggeredAt,
      managedAt: schema.alerts.managedAt,
      displayName: schema.patientProfiles.displayName,
      avatarUrl: schema.patientProfiles.avatarUrl,
    })
    .from(schema.alerts)
    .innerJoin(
      schema.patientProfiles,
      and(
        eq(schema.alerts.clinicId, schema.patientProfiles.clinicId),
        eq(schema.alerts.patientUserId, schema.patientProfiles.userId),
      ),
    )
    .where(and(eq(schema.alerts.clinicId, clinicId), statusFilter ?? sql`true`))
    .orderBy(desc(schema.alerts.triggeredAt));
  if (alerts.length === 0) return [];

  const ranges = alerts.map((alert) => {
    const evidence = publicEvidence(alert.ruleCode, alert.inputsJson, alert.triggeredAt);
    const asOfDate = evidenceDate(evidence, alert.triggeredAt);
    return { alertId: alert.alertId, patientUserId: alert.patientUserId, asOfDate, start: addDays(asOfDate, -6) };
  });
  const patientIds = [...new Set(ranges.map((r) => r.patientUserId))];
  const minStart = ranges.map((r) => r.start).sort()[0]!;
  const maxEnd = ranges.map((r) => r.asOfDate).sort().at(-1)!;
  const checkRows = await db
    .select({
      patientUserId: schema.checkIns.patientUserId,
      date: schema.checkIns.checkInDate,
      mood: schema.checkIns.mood,
      sleep: schema.checkIns.sleep,
      connectedWithSomeone: schema.checkIns.connectedWithSomeone,
    })
    .from(schema.checkIns)
    .where(
      and(
        eq(schema.checkIns.clinicId, clinicId),
        inArray(schema.checkIns.patientUserId, patientIds),
        gte(schema.checkIns.checkInDate, minStart),
        lte(schema.checkIns.checkInDate, maxEnd),
      ),
    );
  const key = (patientUserId: string, date: string) => `${patientUserId}:${date}`;
  const checkMap = new Map(checkRows.map((row) => [key(row.patientUserId, row.date), row]));

  return alerts.map((alert) => {
    const evidence = publicEvidence(alert.ruleCode, alert.inputsJson, alert.triggeredAt);
    const asOfDate = evidenceDate(evidence, alert.triggeredAt);
    const miniSeries = lastNDates(asOfDate, 7).map((date) => {
      const row = checkMap.get(key(alert.patientUserId, date));
      return {
        date,
        mood: row?.mood ?? null,
        sleep: row?.sleep ?? null,
        connectedWithSomeone: row?.connectedWithSomeone ?? null,
      };
    });
    const meta = PULSE_RULE_REGISTRY[alert.ruleCode];
    return {
      alertId: alert.alertId,
      patientUserId: alert.patientUserId,
      patientDisplayName: alert.displayName,
      avatarUrl: alert.avatarUrl,
      ruleCode: alert.ruleCode,
      ruleName: meta.name,
      ruleDescription: meta.description,
      severity: alert.severity,
      status: alert.status,
      triggeredAt: alert.triggeredAt.toISOString(),
      managedAt: iso(alert.managedAt),
      evidence,
      miniSeries,
    };
  });
}
