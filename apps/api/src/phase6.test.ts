import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { buildApp } from "./app";
import { db, queryClient, schema } from "./db";
import { classifyPatientStatus } from "./dashboard/patient-status";
import { runClinicAnalyticsRefresh } from "./analytics/refresh-service";
import {
  getAlertsAggregation,
  getFunnel,
  getMatchingMetrics,
  getMoodSeries,
} from "./analytics/analytics-service";
import { bogotaTodayYmd } from "./domain/dates";
import { addDays } from "./pulse/dates";
import { canonicalUuidPair } from "./domain/pairs";
import { hashPassword } from "./security/passwords";

let app: FastifyInstance;
const TODAY = bogotaTodayYmd();

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await queryClient.end();
});

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  const n = ipCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

async function createClinic() {
  const [clinic] = await db
    .insert(schema.clinics)
    .values({
      id: randomUUID(),
      name: `Clínica ${randomUUID()}`,
      slug: `clinic-${randomUUID()}`,
      timezone: "America/Bogota",
      status: "active",
    })
    .returning();
  if (!clinic) throw new Error("clinic");
  return clinic;
}

async function createDoctor(clinicId: string) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      clinicId,
      role: "doctor",
      email: `doctor-${randomUUID()}@demo.com`,
      passwordHash: await hashPassword("Demo123!"),
      status: "active",
    })
    .returning();
  if (!user) throw new Error("doctor");
  return user;
}

interface PatientOpts {
  careStatus?: "active" | "paused" | "discharged";
  prefEnabled?: boolean;
  enabledOn?: string | null;
  onboarding?: boolean;
}

async function createPatient(clinicId: string, doctorId: string, opts: PatientOpts = {}) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      clinicId,
      role: "patient",
      email: `patient-${randomUUID()}@demo.com`,
      passwordHash: await hashPassword("Demo123!"),
      status: "active",
    })
    .returning();
  if (!user) throw new Error("patient user");
  const [profile] = await db
    .insert(schema.patientProfiles)
    .values({
      id: randomUUID(),
      clinicId,
      userId: user.id,
      sourceInvitationId: null,
      displayName: `Paciente ${user.id.slice(0, 5)}`,
      birthDate: "1996-01-01",
      city: "Bogotá",
      bio: "Bio social.",
      goals: "Metas.",
      connectionTypes: ["friendship"],
      avatarUrl: null,
      onboardingCompletedAt: opts.onboarding === false ? null : new Date(),
    })
    .returning();
  if (!profile) throw new Error("profile");
  await db.insert(schema.patientClinical).values({
    id: randomUUID(),
    clinicId,
    patientUserId: user.id,
    assignedDoctorUserId: doctorId,
    consentStatus: "accepted",
    careStatus: opts.careStatus ?? "active",
  });
  await db.insert(schema.checkInPreferences).values({
    id: randomUUID(),
    clinicId,
    patientUserId: user.id,
    enabled: opts.prefEnabled ?? true,
    enabledOn: opts.enabledOn === undefined ? addDays(TODAY, -30) : opts.enabledOn,
    localTime: "08:00:00",
    timezone: "America/Bogota",
  });
  return { user, profile };
}

async function createCheckIn(
  clinicId: string,
  patientUserId: string,
  date: string,
  mood: number,
  sleep = 4,
  connected = true,
) {
  await db.insert(schema.checkIns).values({
    id: randomUUID(),
    clinicId,
    patientUserId,
    checkInDate: date,
    mood,
    sleep,
    connectedWithSomeone: connected,
  });
}

async function createAlert(
  clinicId: string,
  patientUserId: string,
  severity: "low" | "medium" | "high",
  status: "open" | "managed" = "open",
  ruleCode: "R1" | "R2" | "R3" | "R4" | "R5" | "R6" = "R1",
  opts: { asOfDate?: string | null; triggeredAt?: Date } = {},
) {
  const inputs: Record<string, unknown> = {};
  if (opts.asOfDate !== null) inputs.asOfDate = opts.asOfDate ?? TODAY;
  await db.insert(schema.alerts).values({
    id: randomUUID(),
    clinicId,
    patientUserId,
    ruleCode,
    severity,
    status,
    inputsJson: inputs,
    triggeredAt: opts.triggeredAt ?? new Date(),
  });
}

async function login(clinicSlug: string, email: string) {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextIp(),
    payload: { clinicSlug, email, password: "Demo123!" },
  });
}
async function tokenFor(clinicSlug: string, email: string) {
  return (await login(clinicSlug, email)).json<{ accessToken: string }>().accessToken;
}
function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("fase 6 semáforo (puro)", () => {
  const base = { enabledOn: addDays(TODAY, -30), preferenceEnabled: true, today: TODAY };
  it("alerta high → red aunque check-in actualizado", () => {
    expect(
      classifyPatientStatus({ ...base, openAlertSeverities: ["high"], lastCheckInDate: TODAY }).color,
    ).toBe("red");
  });
  it("alerta medium/low → yellow", () => {
    expect(
      classifyPatientStatus({ ...base, openAlertSeverities: ["medium"], lastCheckInDate: TODAY }).color,
    ).toBe("yellow");
  });
  it("3 días sin check-in → red", () => {
    const r = classifyPatientStatus({ ...base, openAlertSeverities: [], lastCheckInDate: addDays(TODAY, -3) });
    expect(r.color).toBe("red");
    expect(r.reason).toBe("check_in_missing_3_plus_days");
  });
  it("1-2 días sin check-in → yellow", () => {
    expect(
      classifyPatientStatus({ ...base, openAlertSeverities: [], lastCheckInDate: addDays(TODAY, -2) }).color,
    ).toBe("yellow");
  });
  it("al día sin alertas → green", () => {
    const r = classifyPatientStatus({ ...base, openAlertSeverities: [], lastCheckInDate: TODAY });
    expect(r.color).toBe("green");
    expect(r.reason).toBe("up_to_date");
  });
  it("preferencia deshabilitada → solo alertas (green sin alertas)", () => {
    const r = classifyPatientStatus({
      openAlertSeverities: [],
      lastCheckInDate: null,
      preferenceEnabled: false,
      enabledOn: null,
      today: TODAY,
    });
    expect(r.color).toBe("green");
    expect(r.reason).toBe("preference_disabled_no_open_alerts");
  });
  it("preferencia deshabilitada + alerta high → red", () => {
    expect(
      classifyPatientStatus({
        openAlertSeverities: ["high"],
        lastCheckInDate: null,
        preferenceEnabled: false,
        enabledOn: null,
        today: TODAY,
      }).color,
    ).toBe("red");
  });
  it("alerta managed no llega (severidades vacías) → staleness manda", () => {
    expect(
      classifyPatientStatus({ ...base, openAlertSeverities: [], lastCheckInDate: addDays(TODAY, -3) }).color,
    ).toBe("red");
  });
});

describe("fase 6 dashboard", () => {
  it("métricas exactas + tenant + sin cuerpos de mensajes", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const p1 = await createPatient(clinic.id, doctor.id);
    const p2 = await createPatient(clinic.id, doctor.id);
    await createCheckIn(clinic.id, p1.user.id, TODAY, 4);
    await createAlert(clinic.id, p2.user.id, "high");
    // conexión pendiente
    const [a, b] = canonicalUuidPair(p1.profile.id, p2.profile.id);
    await db.insert(schema.connections).values({
      id: randomUUID(),
      clinicId: clinic.id,
      patientAId: a,
      patientBId: b,
      connectionType: "friendship",
      status: "pending_approval",
    });

    const token = await tokenFor(clinic.slug, doctor.email);
    const res = await app.inject({ method: "GET", url: "/doctor/dashboard/summary", headers: bearer(token) });
    const body = res.json<{ activePatients: number; checkInsToday: number; openAlertsTotal: number; pendingMatches: number }>();
    expect(body.activePatients).toBe(2);
    expect(body.checkInsToday).toBe(1);
    expect(body.openAlertsTotal).toBe(1);
    expect(body.pendingMatches).toBe(1);

    const cardsRes = await app.inject({ method: "GET", url: "/doctor/dashboard/patients", headers: bearer(token) });
    expect(cardsRes.payload).not.toContain('"body"');
    const cards = cardsRes.json<{ patients: Array<{ patientUserId: string; statusColor: string }> }>();
    const card2 = cards.patients.find((c) => c.patientUserId === p2.user.id);
    expect(card2?.statusColor).toBe("red");
  });

  it("doctor de otra clínica no ve overview del paciente", async () => {
    const clinicA = await createClinic();
    const docA = await createDoctor(clinicA.id);
    const patient = await createPatient(clinicA.id, docA.id);
    const clinicB = await createClinic();
    const docB = await createDoctor(clinicB.id);
    const tokenB = await tokenFor(clinicB.slug, docB.email);
    const res = await app.inject({
      method: "GET",
      url: `/doctor/patients/${patient.user.id}/overview`,
      headers: bearer(tokenB),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("fase 6 misiones", () => {
  async function setup() {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const patient = await createPatient(clinic.id, doctor.id);
    const doctorToken = await tokenFor(clinic.slug, doctor.email);
    const patientToken = await tokenFor(clinic.slug, patient.user.email);
    return { clinic, doctor, patient, doctorToken, patientToken };
  }

  it("crea, lista propia, completa idempotente; otro paciente no", async () => {
    const ctx = await setup();
    const created = await app.inject({
      method: "POST",
      url: `/doctor/patients/${ctx.patient.user.id}/missions`,
      headers: bearer(ctx.doctorToken),
      payload: { title: "Dar una caminata corta", description: "Diez minutos al aire libre." },
    });
    expect(created.statusCode).toBe(200);
    const missionId = created.json<{ mission: { id: string } }>().mission.id;

    const list = await app.inject({ method: "GET", url: "/patient/missions", headers: bearer(ctx.patientToken) });
    const missions = list.json<{ missions: Array<{ id: string; title: string }> }>().missions;
    expect(missions.some((m) => m.id === missionId)).toBe(true);
    expect(list.payload).not.toContain("assignedByUserId");
    expect(list.payload).not.toContain("clinicId");

    const c1 = await app.inject({ method: "POST", url: `/patient/missions/${missionId}/complete`, headers: bearer(ctx.patientToken) });
    const c2 = await app.inject({ method: "POST", url: `/patient/missions/${missionId}/complete`, headers: bearer(ctx.patientToken) });
    expect(c1.statusCode).toBe(200);
    expect(c2.statusCode).toBe(200);
    expect(c2.json<{ status: string }>().status).toBe("completed");

    // otro paciente no puede completar
    const other = await createPatient(ctx.clinic.id, ctx.doctor.id);
    const otherToken = await tokenFor(ctx.clinic.slug, other.user.email);
    const cOther = await app.inject({ method: "POST", url: `/doctor/patients/${ctx.patient.user.id}/missions`, headers: bearer(ctx.doctorToken), payload: { title: "Otra misión corta", description: "Algo tranquilo." } });
    const otherMissionId = cOther.json<{ mission: { id: string } }>().mission.id;
    const cross = await app.inject({ method: "POST", url: `/patient/missions/${otherMissionId}/complete`, headers: bearer(otherToken) });
    expect(cross.statusCode).toBe(404);
  });

  it("dueDate hoy válida; pasada rechazada", async () => {
    const ctx = await setup();
    const okRes = await app.inject({
      method: "POST",
      url: `/doctor/patients/${ctx.patient.user.id}/missions`,
      headers: bearer(ctx.doctorToken),
      payload: { title: "Misión con fecha", description: "Para hoy.", dueDate: TODAY },
    });
    expect(okRes.statusCode).toBe(200);
    const badRes = await app.inject({
      method: "POST",
      url: `/doctor/patients/${ctx.patient.user.id}/missions`,
      headers: bearer(ctx.doctorToken),
      payload: { title: "Misión vencida", description: "Pasada.", dueDate: addDays(TODAY, -1) },
    });
    expect(badRes.statusCode).toBe(400);
  });

  it("cancelar: assigned→cancelled idempotente; completed→409", async () => {
    const ctx = await setup();
    const created = await app.inject({ method: "POST", url: `/doctor/patients/${ctx.patient.user.id}/missions`, headers: bearer(ctx.doctorToken), payload: { title: "Cancelable corta", description: "Texto." } });
    const id = created.json<{ mission: { id: string } }>().mission.id;
    const x1 = await app.inject({ method: "POST", url: `/doctor/missions/${id}/cancel`, headers: bearer(ctx.doctorToken) });
    const x2 = await app.inject({ method: "POST", url: `/doctor/missions/${id}/cancel`, headers: bearer(ctx.doctorToken) });
    expect(x1.statusCode).toBe(200);
    expect(x2.statusCode).toBe(200);

    const c2 = await app.inject({ method: "POST", url: `/doctor/patients/${ctx.patient.user.id}/missions`, headers: bearer(ctx.doctorToken), payload: { title: "Completada corta", description: "Texto." } });
    const id2 = c2.json<{ mission: { id: string } }>().mission.id;
    await app.inject({ method: "POST", url: `/patient/missions/${id2}/complete`, headers: bearer(ctx.patientToken) });
    const cancelDone = await app.inject({ method: "POST", url: `/doctor/missions/${id2}/cancel`, headers: bearer(ctx.doctorToken) });
    expect(cancelDone.statusCode).toBe(409);
  });

  it("completar y cancelar concurrentes dejan un solo estado final", async () => {
    const ctx = await setup();
    const created = await app.inject({ method: "POST", url: `/doctor/patients/${ctx.patient.user.id}/missions`, headers: bearer(ctx.doctorToken), payload: { title: "Carrera corta", description: "Texto." } });
    const id = created.json<{ mission: { id: string } }>().mission.id;
    await Promise.all([
      app.inject({ method: "POST", url: `/patient/missions/${id}/complete`, headers: bearer(ctx.patientToken) }),
      app.inject({ method: "POST", url: `/doctor/missions/${id}/cancel`, headers: bearer(ctx.doctorToken) }),
    ]);
    const [row] = await db
      .select({ status: schema.wellnessMissions.status })
      .from(schema.wellnessMissions)
      .where(eq(schema.wellnessMissions.id, id));
    expect(["completed", "cancelled"]).toContain(row?.status);
  });
});

describe("fase 6 analytics", () => {
  it("refresh idempotente + mood no imputa + snapshot solo en today", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const p1 = await createPatient(clinic.id, doctor.id);
    await createPatient(clinic.id, doctor.id); // segundo activo
    await createCheckIn(clinic.id, p1.user.id, TODAY, 4);
    await createCheckIn(clinic.id, p1.user.id, addDays(TODAY, -2), 2);

    const r1 = await runClinicAnalyticsRefresh(clinic.id);
    const r2 = await runClinicAnalyticsRefresh(clinic.id);
    const [clinicCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.clinicDailyMetrics)
      .where(eq(schema.clinicDailyMetrics.clinicId, clinic.id));
    expect(r1.from).toBe(r2.from);
    // idempotente: una fila por fecha (sin duplicar)
    expect(clinicCount?.n).toBe(r1.clinicDates);

    // mood: el día -1 (sin check-in) no debe imputar; el -2 promedia 2.
    const mood = await getMoodSeries(db, clinic.id, addDays(TODAY, -3), TODAY);
    const dayMinus1 = mood.points.find((p) => p.date === addDays(TODAY, -1));
    expect(dayMinus1?.average).toBeNull();
    expect(dayMinus1?.sampleSize).toBe(0);
    const dayMinus2 = mood.points.find((p) => p.date === addDays(TODAY, -2));
    expect(dayMinus2?.average).toBe(2);
    expect(dayMinus2?.sampleSize).toBe(1);

    // snapshot operativo solo en today: fecha pasada tiene activePatients=0.
    const [pastRow] = await db
      .select({ active: schema.clinicDailyMetrics.activePatients })
      .from(schema.clinicDailyMetrics)
      .where(and(eq(schema.clinicDailyMetrics.clinicId, clinic.id), eq(schema.clinicDailyMetrics.metricDate, addDays(TODAY, -2))));
    expect(pastRow?.active).toBe(0);
    const [todayRow] = await db
      .select({ active: schema.clinicDailyMetrics.activePatients })
      .from(schema.clinicDailyMetrics)
      .where(and(eq(schema.clinicDailyMetrics.clinicId, clinic.id), eq(schema.clinicDailyMetrics.metricDate, TODAY)));
    expect(todayRow?.active).toBe(2);
  });

  it("GET analytics sin snapshots no escribe", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const token = await tokenFor(clinic.slug, doctor.email);
    await app.inject({ method: "GET", url: "/doctor/analytics/mood", headers: bearer(token) });
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.patientDailyMetrics)
      .where(eq(schema.patientDailyMetrics.clinicId, clinic.id));
    expect(count?.n).toBe(0);
  });

  it("matching usa denominador correcto", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const p1 = await createPatient(clinic.id, doctor.id);
    const p2 = await createPatient(clinic.id, doctor.id);
    const [a, b] = canonicalUuidPair(p1.profile.id, p2.profile.id);
    const [conn] = await db
      .insert(schema.connections)
      .values({ id: randomUUID(), clinicId: clinic.id, patientAId: a, patientBId: b, connectionType: "friendship", status: "active" })
      .returning();
    await db.insert(schema.matchDecisions).values([
      { id: randomUUID(), clinicId: clinic.id, connectionId: conn!.id, doctorUserId: doctor.id, decision: "approve", rationale: "x" },
      { id: randomUUID(), clinicId: clinic.id, connectionId: conn!.id, doctorUserId: doctor.id, decision: "pause", rationale: "y" },
    ]);
    const m = await getMatchingMetrics(db, clinic.id);
    expect(m.professionalDecisionsTotal).toBe(2);
    expect(m.approvedDecisions).toBe(1);
    expect(m.approvalRate).toBe(0.5);
    expect(m.activeConnections).toBe(1);
  });

  it("funnel por cohorte cuenta pacientes únicos y no crece con actividad externa", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    // Invitación de la cohorte → paciente que avanza varias etapas.
    const [inv] = await db
      .insert(schema.invitations)
      .values({
        id: randomUUID(),
        clinicId: clinic.id,
        createdByUserId: doctor.id,
        email: `coh-${randomUUID()}@demo.com`,
        patientName: "Cohorte",
        birthDate: "1996-01-01",
        allowedConnectionTypes: ["friendship"],
        restrictionsJson: {},
        tokenHash: randomUUID(),
        status: "accepted",
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: new Date(),
      })
      .returning();
    const member = await createPatient(clinic.id, doctor.id);
    await db
      .update(schema.patientProfiles)
      .set({ sourceInvitationId: inv!.id })
      .where(eq(schema.patientProfiles.id, member.profile.id));
    await createCheckIn(clinic.id, member.user.id, TODAY, 4);
    // múltiples mensajes del mismo paciente → cuenta una vez
    const groupConv = await db
      .insert(schema.conversations)
      .values({ id: randomUUID(), clinicId: clinic.id, connectionId: null, type: "group", title: "G", status: "active" })
      .returning();
    for (let i = 0; i < 3; i += 1) {
      await db.insert(schema.messages).values({
        id: randomUUID(),
        clinicId: clinic.id,
        conversationId: groupConv[0]!.id,
        senderUserId: member.user.id,
        messageType: "text",
        body: "hola",
      });
    }
    // Paciente fuera de la cohorte (sin invitación en rango) con actividad.
    const outsider = await createPatient(clinic.id, doctor.id);
    await createCheckIn(clinic.id, outsider.user.id, TODAY, 5);
    // El miembro avanza swipe + conexión activa para que el embudo sea monótono.
    await db.insert(schema.swipes).values({
      id: randomUUID(),
      clinicId: clinic.id,
      actorPatientId: member.profile.id,
      targetPatientId: outsider.profile.id,
      decision: "like",
    });
    const [ca, cb] = canonicalUuidPair(member.profile.id, outsider.profile.id);
    await db.insert(schema.connections).values({
      id: randomUUID(),
      clinicId: clinic.id,
      patientAId: ca,
      patientBId: cb,
      connectionType: "friendship",
      status: "active",
    });

    const funnel = await getFunnel(db, clinic.id, TODAY, null);
    const invited = funnel.stages.find((s) => s.key === "invited")!.patients;
    const checkedIn = funnel.stages.find((s) => s.key === "checked_in")!.patients;
    const messaged = funnel.stages.find((s) => s.key === "messaged")!.patients;
    expect(invited).toBe(1);
    expect(checkedIn).toBe(1); // solo el de la cohorte, no el outsider
    expect(messaged).toBe(1); // 3 mensajes → 1 paciente
    expect(funnel.dataQualityWarning).toBe(false);
    expect(funnel.dataQualityIssues).toHaveLength(0);
  });

  it("embudo: connected > swiped genera issue sin alterar conteos", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const [inv] = await db
      .insert(schema.invitations)
      .values({
        id: randomUUID(),
        clinicId: clinic.id,
        createdByUserId: doctor.id,
        email: `coh2-${randomUUID()}@demo.com`,
        patientName: "Cohorte2",
        birthDate: "1996-01-01",
        allowedConnectionTypes: ["friendship"],
        restrictionsJson: {},
        tokenHash: randomUUID(),
        status: "accepted",
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: new Date(),
      })
      .returning();
    const member = await createPatient(clinic.id, doctor.id);
    const partner = await createPatient(clinic.id, doctor.id);
    await db
      .update(schema.patientProfiles)
      .set({ sourceInvitationId: inv!.id })
      .where(eq(schema.patientProfiles.id, member.profile.id));
    // Conexión activa SIN swipe previo (inconsistencia heredada típica del seed).
    const [ca, cb] = canonicalUuidPair(member.profile.id, partner.profile.id);
    await db.insert(schema.connections).values({
      id: randomUUID(),
      clinicId: clinic.id,
      patientAId: ca,
      patientBId: cb,
      connectionType: "friendship",
      status: "active",
    });

    const funnel = await getFunnel(db, clinic.id, TODAY, null);
    expect(funnel.dataQualityWarning).toBe(true);
    const issue = funnel.dataQualityIssues.find(
      (i) => i.previousStage === "swiped" && i.currentStage === "connected",
    );
    expect(issue).toEqual({ previousStage: "swiped", currentStage: "connected", previousCount: 0, currentCount: 1 });
    // Conteos reales intactos.
    expect(funnel.stages.find((s) => s.key === "swiped")!.patients).toBe(0);
    expect(funnel.stages.find((s) => s.key === "connected")!.patients).toBe(1);
  });
});

describe("microfase: fecha de negocio de alertas", () => {
  it("openAlertsToday usa asOfDate (R1-R5) y triggered_at (R6)", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const patient = await createPatient(clinic.id, doctor.id);
    // A: R1 con asOfDate=hoy pero triggered_at viejo → cuenta hoy.
    await createAlert(clinic.id, patient.user.id, "high", "open", "R1", {
      asOfDate: TODAY,
      triggeredAt: new Date("2020-01-01T12:00:00Z"),
    });
    // B: R1 con asOfDate=-5 pero triggered_at ahora → NO cuenta hoy.
    await createAlert(clinic.id, patient.user.id, "medium", "open", "R1", {
      asOfDate: addDays(TODAY, -5),
      triggeredAt: new Date(),
    });
    // C: R6 sin asOfDate, triggered_at ahora → cuenta hoy (usa triggered_at).
    await createAlert(clinic.id, patient.user.id, "high", "open", "R6", { asOfDate: null });

    const token = await tokenFor(clinic.slug, doctor.email);
    const sum = (await app.inject({ method: "GET", url: "/doctor/dashboard/summary", headers: bearer(token) })).json<{
      openAlertsTotal: number;
      openAlertsToday: number;
    }>();
    expect(sum.openAlertsTotal).toBe(3);
    expect(sum.openAlertsToday).toBe(2); // A + C, no B
  });

  it("agregación de alertas usa fecha de negocio y cuenta fallback", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const patient = await createPatient(clinic.id, doctor.id);
    // R1 con asOfDate=hoy, triggered viejo → dentro del rango [hoy,hoy].
    await createAlert(clinic.id, patient.user.id, "high", "open", "R1", {
      asOfDate: TODAY,
      triggeredAt: new Date("2020-01-01T12:00:00Z"),
    });
    // R2 sin asOfDate válido, triggered hoy → fallback a triggered_at (hoy).
    await createAlert(clinic.id, patient.user.id, "high", "open", "R2", {
      asOfDate: null,
      triggeredAt: new Date(),
    });
    const agg = await getAlertsAggregation(db, clinic.id, TODAY, TODAY);
    expect(agg.total).toBe(2);
    expect(agg.fallbackCount).toBe(1);
    const r1 = agg.byRuleCode.find((r) => r.ruleCode === "R1");
    expect(r1?.count).toBe(1);
  });
});

describe("microfase: integridad de snapshots", () => {
  it("operativos históricos quedan en 0 y no se exponen como hechos", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const p1 = await createPatient(clinic.id, doctor.id);
    const p2 = await createPatient(clinic.id, doctor.id);
    // conexión activa actual + check-in pasado.
    const [a, b] = canonicalUuidPair(p1.profile.id, p2.profile.id);
    await db.insert(schema.connections).values({ id: randomUUID(), clinicId: clinic.id, patientAId: a, patientBId: b, connectionType: "friendship", status: "active" });
    await createCheckIn(clinic.id, p1.user.id, addDays(TODAY, -3), 3);

    await runClinicAnalyticsRefresh(clinic.id);

    // Fechas pasadas: operativos = 0 técnico (no estado actual repetido).
    const [past] = await db
      .select({
        active: schema.clinicDailyMetrics.activeConnections,
        pending: schema.clinicDailyMetrics.matchesPending,
        patients: schema.clinicDailyMetrics.activePatients,
        checks: schema.clinicDailyMetrics.checkInsCompleted,
      })
      .from(schema.clinicDailyMetrics)
      .where(and(eq(schema.clinicDailyMetrics.clinicId, clinic.id), eq(schema.clinicDailyMetrics.metricDate, addDays(TODAY, -3))));
    expect(past?.active).toBe(0);
    expect(past?.pending).toBe(0);
    expect(past?.patients).toBe(0);
    expect(past?.checks).toBe(1); // histórico exacto sí

    // patient_daily.activeConnections siempre 0 (no reconstruido).
    const [pdm] = await db
      .select({ active: schema.patientDailyMetrics.activeConnections, mood: schema.patientDailyMetrics.moodValue })
      .from(schema.patientDailyMetrics)
      .where(and(eq(schema.patientDailyMetrics.clinicId, clinic.id), eq(schema.patientDailyMetrics.patientUserId, p1.user.id), eq(schema.patientDailyMetrics.metricDate, addDays(TODAY, -3))));
    expect(pdm?.active).toBe(0);
    expect(pdm?.mood).toBe(3);

    // El endpoint de matching expone el estado actual desde la fuente (1), no el 0 histórico.
    const m = await getMatchingMetrics(db, clinic.id);
    expect(m.activeConnections).toBe(1);
  });
});
