import { and, desc, eq, gte, inArray, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type {
  DashboardSummary,
  PatientCard,
  PatientOverview,
} from "@mindmatch/shared";
import { db, schema } from "../db";
import { env } from "../env";
import { isDemoClinic, todayForClinic } from "../pulse/business-clock";
import { getHistory } from "../pulse/pulse-service";
import { classifyPatientStatus } from "./patient-status";

function bogotaDate(col: AnyColumn): SQL<string> {
  return sql<string>`(${col} at time zone 'America/Bogota')::date`;
}

export async function getDashboardSummary(clinicId: string): Promise<DashboardSummary> {
  const today = await todayForClinic(db, clinicId);
  const demoMode = env.DEMO_MODE && (await isDemoClinic(db, clinicId));

  const [activePatients] = await db
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

  const [checkInsToday] = await db
    .select({ n: sql<number>`count(distinct ${schema.checkIns.patientUserId})::int` })
    .from(schema.checkIns)
    .where(and(eq(schema.checkIns.clinicId, clinicId), eq(schema.checkIns.checkInDate, today)));

  const [openTotal] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(and(eq(schema.alerts.clinicId, clinicId), eq(schema.alerts.status, "open")));

  const [openToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.clinicId, clinicId),
        eq(schema.alerts.status, "open"),
        eq(bogotaDate(schema.alerts.triggeredAt), today),
      ),
    );

  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.clinicId, clinicId),
        eq(schema.connections.status, "pending_approval"),
      ),
    );

  return {
    today,
    demoMode,
    activePatients: activePatients?.n ?? 0,
    checkInsToday: checkInsToday?.n ?? 0,
    openAlertsTotal: openTotal?.n ?? 0,
    openAlertsToday: openToday?.n ?? 0,
    pendingMatches: pending?.n ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

export async function getPatientCards(
  clinicId: string,
): Promise<{ today: string; patients: PatientCard[] }> {
  const today = await todayForClinic(db, clinicId);

  // 1) Pacientes activos + perfil.
  const patients = await db
    .select({
      userId: schema.users.id,
      profileId: schema.patientProfiles.id,
      displayName: schema.patientProfiles.displayName,
      city: schema.patientProfiles.city,
      avatarUrl: schema.patientProfiles.avatarUrl,
    })
    .from(schema.users)
    .innerJoin(
      schema.patientClinical,
      and(
        eq(schema.users.clinicId, schema.patientClinical.clinicId),
        eq(schema.users.id, schema.patientClinical.patientUserId),
      ),
    )
    .innerJoin(
      schema.patientProfiles,
      and(
        eq(schema.users.clinicId, schema.patientProfiles.clinicId),
        eq(schema.users.id, schema.patientProfiles.userId),
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
  if (patients.length === 0) return { today, patients: [] };

  const userIds = patients.map((p) => p.userId);
  const profileIds = patients.map((p) => p.profileId);

  // 2) Preferencias.
  const prefs = await db
    .select({
      patientUserId: schema.checkInPreferences.patientUserId,
      enabled: schema.checkInPreferences.enabled,
      enabledOn: schema.checkInPreferences.enabledOn,
    })
    .from(schema.checkInPreferences)
    .where(
      and(
        eq(schema.checkInPreferences.clinicId, clinicId),
        inArray(schema.checkInPreferences.patientUserId, userIds),
      ),
    );
  const prefByUser = new Map(prefs.map((p) => [p.patientUserId, p]));

  // 3) Último check-in.
  const lastCheckIns = await db
    .select({
      patientUserId: schema.checkIns.patientUserId,
      lastDate: sql<string | null>`max(${schema.checkIns.checkInDate})`,
    })
    .from(schema.checkIns)
    .where(and(eq(schema.checkIns.clinicId, clinicId), inArray(schema.checkIns.patientUserId, userIds)))
    .groupBy(schema.checkIns.patientUserId);
  const lastByUser = new Map(lastCheckIns.map((r) => [r.patientUserId, r.lastDate]));

  // 4) Alertas abiertas (conteo + severidades presentes).
  const openAlerts = await db
    .select({
      patientUserId: schema.alerts.patientUserId,
      count: sql<number>`count(*)::int`,
      hasHigh: sql<boolean>`bool_or(${schema.alerts.severity} = 'high')`,
      hasMediumLow: sql<boolean>`bool_or(${schema.alerts.severity} in ('medium','low'))`,
    })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.clinicId, clinicId),
        eq(schema.alerts.status, "open"),
        inArray(schema.alerts.patientUserId, userIds),
      ),
    )
    .groupBy(schema.alerts.patientUserId);
  const alertsByUser = new Map(openAlerts.map((r) => [r.patientUserId, r]));

  // 5) Conexiones activas por profile.
  const activeConns = await db
    .select({ a: schema.connections.patientAId, b: schema.connections.patientBId })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.clinicId, clinicId),
        eq(schema.connections.status, "active"),
        or(
          inArray(schema.connections.patientAId, profileIds),
          inArray(schema.connections.patientBId, profileIds),
        ),
      ),
    );
  const activeConnByProfile = new Map<string, number>();
  for (const c of activeConns) {
    for (const pid of [c.a, c.b]) {
      activeConnByProfile.set(pid, (activeConnByProfile.get(pid) ?? 0) + 1);
    }
  }

  // 6) Misiones pendientes.
  const missions = await db
    .select({
      patientUserId: schema.wellnessMissions.patientUserId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.wellnessMissions)
    .where(
      and(
        eq(schema.wellnessMissions.clinicId, clinicId),
        eq(schema.wellnessMissions.status, "assigned"),
        inArray(schema.wellnessMissions.patientUserId, userIds),
      ),
    )
    .groupBy(schema.wellnessMissions.patientUserId);
  const missionsByUser = new Map(missions.map((r) => [r.patientUserId, r.count]));

  const cards: PatientCard[] = patients.map((p) => {
    const pref = prefByUser.get(p.userId);
    const alerts = alertsByUser.get(p.userId);
    const severities: Array<"low" | "medium" | "high"> = [];
    if (alerts?.hasHigh) severities.push("high");
    if (alerts?.hasMediumLow) severities.push("medium");
    const status = classifyPatientStatus({
      openAlertSeverities: severities,
      lastCheckInDate: lastByUser.get(p.userId) ?? null,
      preferenceEnabled: pref?.enabled ?? false,
      enabledOn: pref?.enabledOn ?? null,
      today,
    });
    return {
      patientUserId: p.userId,
      displayName: p.displayName,
      city: p.city,
      avatarUrl: p.avatarUrl,
      statusColor: status.color,
      statusReason: status.reason,
      lastCheckInDate: lastByUser.get(p.userId) ?? null,
      openAlertsCount: alerts?.count ?? 0,
      activeConnectionsCount: activeConnByProfile.get(p.profileId) ?? 0,
      pendingMissionsCount: missionsByUser.get(p.userId) ?? 0,
    };
  });

  return { today, patients: cards };
}

export async function getPatientOverview(
  clinicId: string,
  patientUserId: string,
): Promise<PatientOverview | null> {
  const today = await todayForClinic(db, clinicId);

  const [profile] = await db
    .select({
      profileId: schema.patientProfiles.id,
      displayName: schema.patientProfiles.displayName,
      city: schema.patientProfiles.city,
      bio: schema.patientProfiles.bio,
      goals: schema.patientProfiles.goals,
      avatarUrl: schema.patientProfiles.avatarUrl,
      connectionTypes: schema.patientProfiles.connectionTypes,
    })
    .from(schema.patientProfiles)
    .innerJoin(
      schema.patientClinical,
      and(
        eq(schema.patientProfiles.clinicId, schema.patientClinical.clinicId),
        eq(schema.patientProfiles.userId, schema.patientClinical.patientUserId),
      ),
    )
    .where(
      and(
        eq(schema.patientProfiles.clinicId, clinicId),
        eq(schema.patientProfiles.userId, patientUserId),
      ),
    )
    .limit(1);
  if (!profile) return null;

  const [pref] = await db
    .select({
      enabled: schema.checkInPreferences.enabled,
      enabledOn: schema.checkInPreferences.enabledOn,
      localTime: schema.checkInPreferences.localTime,
      timezone: schema.checkInPreferences.timezone,
    })
    .from(schema.checkInPreferences)
    .where(
      and(
        eq(schema.checkInPreferences.clinicId, clinicId),
        eq(schema.checkInPreferences.patientUserId, patientUserId),
      ),
    )
    .limit(1);

  const [lastCheckIn] = await db
    .select({ lastDate: sql<string | null>`max(${schema.checkIns.checkInDate})` })
    .from(schema.checkIns)
    .where(
      and(eq(schema.checkIns.clinicId, clinicId), eq(schema.checkIns.patientUserId, patientUserId)),
    );

  const openAlertRows = await db
    .select({
      alertId: schema.alerts.id,
      ruleCode: schema.alerts.ruleCode,
      severity: schema.alerts.severity,
      status: schema.alerts.status,
      triggeredAt: schema.alerts.triggeredAt,
    })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.clinicId, clinicId),
        eq(schema.alerts.patientUserId, patientUserId),
        inArray(schema.alerts.status, ["open", "managed"]),
      ),
    )
    .orderBy(desc(schema.alerts.triggeredAt))
    .limit(20);

  const openSeverities = openAlertRows
    .filter((a) => a.status === "open")
    .map((a) => a.severity as "low" | "medium" | "high");
  const status = classifyPatientStatus({
    openAlertSeverities: openSeverities,
    lastCheckInDate: lastCheckIn?.lastDate ?? null,
    preferenceEnabled: pref?.enabled ?? false,
    enabledOn: pref?.enabledOn ?? null,
    today,
  });

  const recentCheckIns = await db
    .select({
      date: schema.checkIns.checkInDate,
      mood: schema.checkIns.mood,
      sleep: schema.checkIns.sleep,
      connectedWithSomeone: schema.checkIns.connectedWithSomeone,
    })
    .from(schema.checkIns)
    .where(
      and(eq(schema.checkIns.clinicId, clinicId), eq(schema.checkIns.patientUserId, patientUserId)),
    )
    .orderBy(desc(schema.checkIns.checkInDate))
    .limit(7);

  const pulsePoints = await getHistory(db, clinicId, patientUserId, today, 14);

  // Conexiones del paciente (otro participante).
  const connRows = await db
    .select({
      id: schema.connections.id,
      connectionType: schema.connections.connectionType,
      status: schema.connections.status,
      a: schema.connections.patientAId,
      b: schema.connections.patientBId,
    })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.clinicId, clinicId),
        or(
          eq(schema.connections.patientAId, profile.profileId),
          eq(schema.connections.patientBId, profile.profileId),
        ),
      ),
    );
  const otherIds = connRows.map((c) => (c.a === profile.profileId ? c.b : c.a));
  const others = otherIds.length
    ? await db
        .select({
          id: schema.patientProfiles.id,
          displayName: schema.patientProfiles.displayName,
          avatarUrl: schema.patientProfiles.avatarUrl,
        })
        .from(schema.patientProfiles)
        .where(
          and(
            eq(schema.patientProfiles.clinicId, clinicId),
            inArray(schema.patientProfiles.id, otherIds),
          ),
        )
    : [];
  const otherById = new Map(others.map((o) => [o.id, o]));

  const missionRows = await db
    .select({
      id: schema.wellnessMissions.id,
      title: schema.wellnessMissions.title,
      description: schema.wellnessMissions.description,
      dueDate: schema.wellnessMissions.dueDate,
      status: schema.wellnessMissions.status,
      completedAt: schema.wellnessMissions.completedAt,
      createdAt: schema.wellnessMissions.createdAt,
    })
    .from(schema.wellnessMissions)
    .where(
      and(
        eq(schema.wellnessMissions.clinicId, clinicId),
        eq(schema.wellnessMissions.patientUserId, patientUserId),
      ),
    )
    .orderBy(desc(schema.wellnessMissions.createdAt));

  return {
    patientUserId,
    displayName: profile.displayName,
    city: profile.city,
    bio: profile.bio,
    goals: profile.goals,
    avatarUrl: profile.avatarUrl,
    connectionTypes: profile.connectionTypes,
    statusColor: status.color,
    statusReason: status.reason,
    preference: {
      enabled: pref?.enabled ?? false,
      localTime: (pref?.localTime ?? "08:00:00").slice(0, 5),
      timezone: pref?.timezone ?? "America/Bogota",
      enabledOn: pref?.enabledOn ?? null,
    },
    connections: connRows.flatMap((c) => {
      const otherId = c.a === profile.profileId ? c.b : c.a;
      const other = otherById.get(otherId);
      if (!other) return [];
      return [
        {
          connectionId: c.id,
          connectionType: c.connectionType,
          status: c.status,
          otherDisplayName: other.displayName,
          otherAvatarUrl: other.avatarUrl,
        },
      ];
    }),
    recentCheckIns: [...recentCheckIns].reverse(),
    pulsePoints,
    alerts: openAlertRows.map((a) => ({
      alertId: a.alertId,
      ruleCode: a.ruleCode,
      severity: a.severity,
      status: a.status,
      triggeredAt: a.triggeredAt.toISOString(),
    })),
    missions: missionRows.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      dueDate: m.dueDate,
      status: m.status,
      overdue: m.status === "assigned" && m.dueDate !== null && m.dueDate < today,
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
