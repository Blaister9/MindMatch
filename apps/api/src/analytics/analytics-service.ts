import { and, eq, gte, inArray, lte, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type {
  AlertsAggregationResponse,
  FunnelDataQualityIssue,
  FunnelResponse,
  FunnelStage,
  MatchingMetricsResponse,
  MoodSeriesResponse,
} from "@mindmatch/shared";
import { db, schema } from "../db";
import { alertAsOfFallbackExpr, alertBusinessDateExpr } from "../domain/alert-date";
import type { Reader } from "../matching/types";
import { dateRange } from "../pulse/dates";

function bogotaDate(col: AnyColumn): SQL<string> {
  return sql<string>`(${col} at time zone 'America/Bogota')::date`;
}

// ── Ánimo colectivo (desde patient_daily_metrics; sin imputar nulos) ──
export async function getMoodSeries(
  ex: Reader,
  clinicId: string,
  from: string,
  to: string,
): Promise<MoodSeriesResponse> {
  const rows = await ex
    .select({
      date: schema.patientDailyMetrics.metricDate,
      average: sql<number | null>`avg(${schema.patientDailyMetrics.moodValue})`,
      sampleSize: sql<number>`count(${schema.patientDailyMetrics.moodValue})::int`,
      rowCount: sql<number>`count(*)::int`,
    })
    .from(schema.patientDailyMetrics)
    .where(
      and(
        eq(schema.patientDailyMetrics.clinicId, clinicId),
        gte(schema.patientDailyMetrics.metricDate, from),
        lte(schema.patientDailyMetrics.metricDate, to),
      ),
    )
    .groupBy(schema.patientDailyMetrics.metricDate);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const anyRows = rows.some((r) => r.rowCount > 0);
  const points = dateRange(from, to).map((date) => {
    const row = byDate.get(date);
    const sampleSize = row?.sampleSize ?? 0;
    return {
      date,
      average: sampleSize > 0 && row?.average != null ? Number(row.average) : null,
      sampleSize,
    };
  });
  return { from, to, dataStatus: anyRows ? "ok" : "not_generated", points };
}

// ── Alertas agregadas (desde clinical.alerts; nunca inputsJson) ──
export async function getAlertsAggregation(
  ex: Reader,
  clinicId: string,
  from: string,
  to: string,
): Promise<AlertsAggregationResponse> {
  // Fecha de negocio de la alerta (asOfDate para R1–R5, triggered_at para R6).
  const dateExpr = alertBusinessDateExpr();
  const monthExpr = sql<string>`to_char(${dateExpr}, 'YYYY-MM')`;
  const where = and(
    eq(schema.alerts.clinicId, clinicId),
    gte(dateExpr, from),
    lte(dateExpr, to),
  );

  const byRule = await ex
    .select({ ruleCode: schema.alerts.ruleCode, count: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(where)
    .groupBy(schema.alerts.ruleCode);
  const bySeverity = await ex
    .select({ severity: schema.alerts.severity, count: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(where)
    .groupBy(schema.alerts.severity);
  const monthly = await ex
    .select({ period: monthExpr, count: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(where)
    .groupBy(monthExpr)
    .orderBy(monthExpr);
  const [fallback] = await ex
    .select({ n: sql<number>`count(*) filter (where ${alertAsOfFallbackExpr()})::int` })
    .from(schema.alerts)
    .where(where);

  const total = byRule.reduce((acc, r) => acc + r.count, 0);
  return {
    from,
    to,
    total,
    byRuleCode: byRule.map((r) => ({ ruleCode: r.ruleCode, count: r.count })),
    bySeverity: bySeverity.map((r) => ({ severity: r.severity, count: r.count })),
    monthlySeries: monthly.map((r) => ({ period: r.period, count: r.count })),
    fallbackCount: fallback?.n ?? 0,
  };
}

// ── Matching (tasa de decisiones + estado operativo) ──
export async function getMatchingMetrics(
  ex: Reader,
  clinicId: string,
): Promise<MatchingMetricsResponse> {
  const decisions = await ex
    .select({ decision: schema.matchDecisions.decision, count: sql<number>`count(*)::int` })
    .from(schema.matchDecisions)
    .where(eq(schema.matchDecisions.clinicId, clinicId))
    .groupBy(schema.matchDecisions.decision);
  const byDecision = new Map(decisions.map((d) => [d.decision, d.count]));
  const approved = byDecision.get("approve") ?? 0;
  const total = decisions.reduce((acc, d) => acc + d.count, 0);

  const [activeConn] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connections)
    .where(and(eq(schema.connections.clinicId, clinicId), eq(schema.connections.status, "active")));
  const [pending] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connections)
    .where(and(eq(schema.connections.clinicId, clinicId), eq(schema.connections.status, "pending_approval")));

  return {
    approvalRate: total > 0 ? approved / total : null,
    professionalDecisionsTotal: total,
    approvedDecisions: approved,
    activeConnections: activeConn?.n ?? 0,
    pendingMatches: pending?.n ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

// ── Embudo por cohorte de invitaciones ──
const FUNNEL_LABELS: Record<FunnelStage["key"], string> = {
  invited: "Invitada",
  accepted: "Aceptada",
  profile_completed: "Perfil completado",
  swiped: "Primer swipe",
  connected: "Conexión creada",
  active_connection: "Conexión activa",
  messaged: "Primer mensaje",
  checked_in: "Primer check-in",
};

export async function getFunnel(
  ex: Reader,
  clinicId: string,
  to: string,
  from: string | null,
): Promise<FunnelResponse> {
  const createdDate = bogotaDate(schema.invitations.createdAt);
  const cohortWhere = and(
    eq(schema.invitations.clinicId, clinicId),
    lte(createdDate, to),
    ...(from ? [gte(createdDate, from)] : []),
  );
  const invitations = await ex
    .select({ id: schema.invitations.id, status: schema.invitations.status })
    .from(schema.invitations)
    .where(cohortWhere);

  const invited = invitations.length;
  const acceptedInvIds = invitations
    .filter((i) => i.status === "accepted")
    .map((i) => i.id);
  const accepted = acceptedInvIds.length;

  let profileCompleted = 0;
  let swiped = 0;
  let connected = 0;
  let activeConnection = 0;
  let messaged = 0;
  let checkedIn = 0;

  if (acceptedInvIds.length > 0) {
    const profiles = await ex
      .select({
        profileId: schema.patientProfiles.id,
        userId: schema.patientProfiles.userId,
        onboardingCompletedAt: schema.patientProfiles.onboardingCompletedAt,
      })
      .from(schema.patientProfiles)
      .where(
        and(
          eq(schema.patientProfiles.clinicId, clinicId),
          inArray(schema.patientProfiles.sourceInvitationId, acceptedInvIds),
        ),
      );
    const cohortProfileIds = profiles.map((p) => p.profileId);
    const cohortUserIds = profiles.map((p) => p.userId);

    profileCompleted = profiles.filter(
      (p) =>
        p.onboardingCompletedAt &&
        p.onboardingCompletedAt.toISOString().slice(0, 10) <= to,
    ).length;

    if (cohortProfileIds.length > 0) {
      const swipedRows = await ex
        .select({ actor: schema.swipes.actorPatientId })
        .from(schema.swipes)
        .where(
          and(
            eq(schema.swipes.clinicId, clinicId),
            inArray(schema.swipes.actorPatientId, cohortProfileIds),
            lte(bogotaDate(schema.swipes.createdAt), to),
          ),
        )
        .groupBy(schema.swipes.actorPatientId);
      swiped = swipedRows.length;

      const connRows = await ex
        .select({
          a: schema.connections.patientAId,
          b: schema.connections.patientBId,
          status: schema.connections.status,
        })
        .from(schema.connections)
        .where(
          and(
            eq(schema.connections.clinicId, clinicId),
            lte(bogotaDate(schema.connections.createdAt), to),
          ),
        );
      const cohortProfileSet = new Set(cohortProfileIds);
      const connectedSet = new Set<string>();
      const activeSet = new Set<string>();
      for (const c of connRows) {
        for (const pid of [c.a, c.b]) {
          if (!cohortProfileSet.has(pid)) continue;
          connectedSet.add(pid);
          if (c.status === "active") activeSet.add(pid);
        }
      }
      connected = connectedSet.size;
      activeConnection = activeSet.size;
    }

    if (cohortUserIds.length > 0) {
      const msgRows = await ex
        .select({ sender: schema.messages.senderUserId })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.clinicId, clinicId),
            inArray(schema.messages.senderUserId, cohortUserIds),
            lte(bogotaDate(schema.messages.sentAt), to),
          ),
        )
        .groupBy(schema.messages.senderUserId);
      messaged = msgRows.length;

      const checkRows = await ex
        .select({ patient: schema.checkIns.patientUserId })
        .from(schema.checkIns)
        .where(
          and(
            eq(schema.checkIns.clinicId, clinicId),
            inArray(schema.checkIns.patientUserId, cohortUserIds),
            lte(schema.checkIns.checkInDate, to),
          ),
        )
        .groupBy(schema.checkIns.patientUserId);
      checkedIn = checkRows.length;
    }
  }

  const counts: Record<FunnelStage["key"], number> = {
    invited,
    accepted,
    profile_completed: profileCompleted,
    swiped,
    connected,
    active_connection: activeConnection,
    messaged,
    checked_in: checkedIn,
  };
  const stages: FunnelStage[] = (Object.keys(counts) as FunnelStage["key"][]).map(
    (key) => ({ key, label: FUNNEL_LABELS[key], patients: counts[key] }),
  );

  // Una etapa nunca debería superar a la inmediatamente anterior. Reportamos
  // cada aumento como un issue estructurado, SIN modificar los conteos reales.
  const issues: FunnelDataQualityIssue[] = [];
  for (let i = 1; i < stages.length; i += 1) {
    const previous = stages[i - 1]!;
    const current = stages[i]!;
    if (current.patients > previous.patients) {
      issues.push({
        previousStage: previous.key,
        currentStage: current.key,
        previousCount: previous.patients,
        currentCount: current.patients,
      });
    }
  }

  return {
    from,
    to,
    cohortLabel: "Conversión de pacientes invitados en el periodo",
    stages,
    dataQualityWarning: issues.length > 0,
    dataQualityIssues: issues,
  };
}
