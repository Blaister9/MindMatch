import { randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lte, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import type { Transaction } from "../matching/types";
import { todayForClinic } from "../pulse/business-clock";
import { addDays, dateRange } from "../pulse/dates";
import { advisoryTransactionLock } from "../pulse/locks";

/** Fecha local de Bogotá de una columna timestamptz. */
function bogotaDate(col: AnyColumn): SQL<string> {
  return sql<string>`(${col} at time zone 'America/Bogota')::date`;
}

type Severity = "low" | "medium" | "high";

function higherSeverity(a: Severity | null, b: Severity): Severity {
  const rank: Record<Severity, number> = { low: 1, medium: 2, high: 3 };
  if (!a) return b;
  return rank[b] > rank[a] ? b : a;
}

export interface RefreshResult {
  from: string;
  to: string;
  clinicDates: number;
  patientRows: number;
}

/**
 * Reconstruye métricas históricas EXACTAS (solo desde eventos con fecha) y
 * escribe el snapshot operativo ACTUAL únicamente en la fila de `today`.
 * Idempotente (upsert). Recibe un executor (tx); el caller decide la transacción
 * y el advisory lock. No borra la tabla ni toca otras clínicas.
 */
export async function refreshAnalytics(
  ex: Transaction,
  clinicId: string,
  options: { today: string; from?: string },
): Promise<RefreshResult> {
  // Rango: from = options.from ?? primer check-in ?? today-29; to = today.
  const to = options.today;
  let from = options.from;
  if (!from) {
    const [earliest] = await ex
      .select({ d: sql<string | null>`min(${schema.checkIns.checkInDate})` })
      .from(schema.checkIns)
      .where(eq(schema.checkIns.clinicId, clinicId));
    from = earliest?.d ?? addDays(to, -29);
  }
  if (from > to) from = to;
  const dates = dateRange(from, to);

  // ── Históricos exactos ──
  // Check-ins por (patient, date).
  const checkRows = await ex
    .select({
      date: schema.checkIns.checkInDate,
      patientUserId: schema.checkIns.patientUserId,
      mood: schema.checkIns.mood,
      sleep: schema.checkIns.sleep,
    })
    .from(schema.checkIns)
    .where(
      and(
        eq(schema.checkIns.clinicId, clinicId),
        gte(schema.checkIns.checkInDate, from),
        lte(schema.checkIns.checkInDate, to),
      ),
    );

  // Mensajes por (sender, dateBogota).
  const msgRows = await ex
    .select({
      date: bogotaDate(schema.messages.sentAt),
      patientUserId: schema.messages.senderUserId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.clinicId, clinicId),
        isNull(schema.messages.deletedAt),
        gte(bogotaDate(schema.messages.sentAt), from),
        lte(bogotaDate(schema.messages.sentAt), to),
      ),
    )
    .groupBy(
      bogotaDate(schema.messages.sentAt),
      schema.messages.senderUserId,
    );

  // Alertas por (patient, dateBogota, severity).
  const alertRows = await ex
    .select({
      date: bogotaDate(schema.alerts.triggeredAt),
      patientUserId: schema.alerts.patientUserId,
      severity: schema.alerts.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.clinicId, clinicId),
        gte(bogotaDate(schema.alerts.triggeredAt), from),
        lte(bogotaDate(schema.alerts.triggeredAt), to),
      ),
    )
    .groupBy(
      bogotaDate(schema.alerts.triggeredAt),
      schema.alerts.patientUserId,
      schema.alerts.severity,
    );

  // Decisiones approve por dateBogota.
  const approveRows = await ex
    .select({
      date: bogotaDate(schema.matchDecisions.createdAt),
      count: sql<number>`count(*)::int`,
    })
    .from(schema.matchDecisions)
    .where(
      and(
        eq(schema.matchDecisions.clinicId, clinicId),
        eq(schema.matchDecisions.decision, "approve"),
        gte(bogotaDate(schema.matchDecisions.createdAt), from),
        lte(bogotaDate(schema.matchDecisions.createdAt), to),
      ),
    )
    .groupBy(bogotaDate(schema.matchDecisions.createdAt));

  // ── Snapshot operativo ACTUAL (solo se escribe en la fila de `today`) ──
  const [activePatientsRow] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .innerJoin(
      schema.patientClinical,
      and(
        eq(schema.users.clinicId, schema.patientClinical.clinicId),
        eq(schema.users.id, schema.patientClinical.patientUserId),
      ),
    )
    .where(
      and(
        eq(schema.users.clinicId, clinicId),
        eq(schema.users.role, "patient"),
        eq(schema.users.status, "active"),
        eq(schema.patientClinical.careStatus, "active"),
      ),
    );
  const [pendingRow] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.clinicId, clinicId),
        eq(schema.connections.status, "pending_approval"),
      ),
    );
  const [activeConnRow] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.clinicId, clinicId),
        eq(schema.connections.status, "active"),
      ),
    );
  const activePatients = activePatientsRow?.n ?? 0;
  const pendingMatches = pendingRow?.n ?? 0;
  const activeConnections = activeConnRow?.n ?? 0;

  // ── Agregaciones en memoria ──
  const clinicCheckIns = new Map<string, Set<string>>();
  const patientByKey = new Map<
    string,
    {
      patientUserId: string;
      date: string;
      checkInCompleted: boolean;
      moodValue: number | null;
      sleepValue: number | null;
      messagesSent: number;
      alertsCount: number;
      highestAlertSeverity: Severity | null;
    }
  >();
  const pkey = (p: string, d: string) => `${p}|${d}`;
  const ensure = (p: string, d: string) => {
    const k = pkey(p, d);
    let row = patientByKey.get(k);
    if (!row) {
      row = {
        patientUserId: p,
        date: d,
        checkInCompleted: false,
        moodValue: null,
        sleepValue: null,
        messagesSent: 0,
        alertsCount: 0,
        highestAlertSeverity: null,
      };
      patientByKey.set(k, row);
    }
    return row;
  };

  for (const r of checkRows) {
    const row = ensure(r.patientUserId, r.date);
    row.checkInCompleted = true;
    row.moodValue = r.mood;
    row.sleepValue = r.sleep;
    if (!clinicCheckIns.has(r.date)) clinicCheckIns.set(r.date, new Set());
    clinicCheckIns.get(r.date)!.add(r.patientUserId);
  }
  const clinicMessages = new Map<string, number>();
  for (const r of msgRows) {
    ensure(r.patientUserId, r.date).messagesSent = r.count;
    clinicMessages.set(r.date, (clinicMessages.get(r.date) ?? 0) + r.count);
  }
  const clinicAlerts = new Map<string, { low: number; medium: number; high: number }>();
  for (const r of alertRows) {
    const row = ensure(r.patientUserId, r.date);
    row.alertsCount += r.count;
    row.highestAlertSeverity = higherSeverity(row.highestAlertSeverity, r.severity as Severity);
    const bucket = clinicAlerts.get(r.date) ?? { low: 0, medium: 0, high: 0 };
    bucket[r.severity as Severity] += r.count;
    clinicAlerts.set(r.date, bucket);
  }
  const clinicApprovals = new Map(approveRows.map((r) => [r.date, r.count]));

  // ── Upsert clinic_daily_metrics por fecha ──
  for (const date of dates) {
    const isToday = date === to;
    const alertsBucket = clinicAlerts.get(date) ?? { low: 0, medium: 0, high: 0 };
    await ex
      .insert(schema.clinicDailyMetrics)
      .values({
        id: randomUUID(),
        clinicId,
        metricDate: date,
        // Snapshot operativo SOLO en la fila de hoy; 0 en fechas pasadas.
        activePatients: isToday ? activePatients : 0,
        matchesPending: isToday ? pendingMatches : 0,
        activeConnections: isToday ? activeConnections : 0,
        // Históricos exactos por fecha.
        checkInsCompleted: clinicCheckIns.get(date)?.size ?? 0,
        messagesCount: clinicMessages.get(date) ?? 0,
        alertsLow: alertsBucket.low,
        alertsMedium: alertsBucket.medium,
        alertsHigh: alertsBucket.high,
        matchesApproved: clinicApprovals.get(date) ?? 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.clinicDailyMetrics.clinicId, schema.clinicDailyMetrics.metricDate],
        set: {
          activePatients: isToday ? activePatients : 0,
          matchesPending: isToday ? pendingMatches : 0,
          activeConnections: isToday ? activeConnections : 0,
          checkInsCompleted: clinicCheckIns.get(date)?.size ?? 0,
          messagesCount: clinicMessages.get(date) ?? 0,
          alertsLow: alertsBucket.low,
          alertsMedium: alertsBucket.medium,
          alertsHigh: alertsBucket.high,
          matchesApproved: clinicApprovals.get(date) ?? 0,
          updatedAt: new Date(),
        },
      });
  }

  // ── Upsert patient_daily_metrics (solo filas con eventos del día) ──
  for (const row of patientByKey.values()) {
    await ex
      .insert(schema.patientDailyMetrics)
      .values({
        id: randomUUID(),
        clinicId,
        patientUserId: row.patientUserId,
        metricDate: row.date,
        checkInCompleted: row.checkInCompleted,
        moodValue: row.moodValue,
        sleepValue: row.sleepValue,
        // activeConnections NO se reconstruye históricamente (NOT NULL): 0, no se muestra.
        activeConnections: 0,
        messagesSent: row.messagesSent,
        alertsCount: row.alertsCount,
        highestAlertSeverity: row.highestAlertSeverity,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.patientDailyMetrics.clinicId,
          schema.patientDailyMetrics.patientUserId,
          schema.patientDailyMetrics.metricDate,
        ],
        set: {
          checkInCompleted: row.checkInCompleted,
          moodValue: row.moodValue,
          sleepValue: row.sleepValue,
          activeConnections: 0,
          messagesSent: row.messagesSent,
          alertsCount: row.alertsCount,
          highestAlertSeverity: row.highestAlertSeverity,
          updatedAt: new Date(),
        },
      });
  }

  return { from, to, clinicDates: dates.length, patientRows: patientByKey.size };
}

/**
 * Wrapper para CLI/scheduler: abre su propia transacción + advisory lock
 * tenant-scoped y calcula `today` con el Business Clock. NO usar dentro de otra
 * transacción que ya tenga el lock (en simulate-day se llama a `refreshAnalytics`
 * con el tx existente, sin re-lockear).
 */
export async function runClinicAnalyticsRefresh(
  clinicId: string,
  opts: { from?: string } = {},
): Promise<RefreshResult> {
  return db.transaction(async (tx) => {
    await advisoryTransactionLock(tx, `analytics-refresh:${clinicId}`);
    const today = await todayForClinic(tx, clinicId);
    return refreshAnalytics(tx, clinicId, { today, from: opts.from });
  });
}
