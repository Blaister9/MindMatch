import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import type { ConnectionType } from "@mindmatch/shared";
import { buildApp } from "./app";
import { db, queryClient, schema } from "./db";
import { canonicalUuidPair } from "./domain/pairs";
import { DemoMatchingService, PgVectorMatchingService } from "./matching/providers";
import { hashPassword } from "./security/passwords";

let app: FastifyInstance;

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

async function createClinic(status: "active" | "inactive" = "active") {
  const [clinic] = await db
    .insert(schema.clinics)
    .values({
      id: randomUUID(),
      name: `Clínica ${randomUUID()}`,
      slug: `clinic-${randomUUID()}`,
      timezone: "America/Bogota",
      status,
    })
    .returning();
  if (!clinic) throw new Error("clinic not created");
  return clinic;
}

async function createDoctor(clinicId: string) {
  const password = "Demo123!";
  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      clinicId,
      role: "doctor",
      email: `doctor-${randomUUID()}@demo.com`,
      passwordHash: await hashPassword(password),
      status: "active",
    })
    .returning();
  if (!user) throw new Error("doctor not created");
  return { user, password };
}

interface PatientOptions {
  connectionTypes?: ConnectionType[];
  status?: "active" | "suspended";
  onboarding?: boolean;
  city?: string;
  birthDate?: string;
  interestIds?: string[];
}

async function createPatient(clinicId: string, options: PatientOptions = {}) {
  const password = "Demo123!";
  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      clinicId,
      role: "patient",
      email: `patient-${randomUUID()}@demo.com`,
      passwordHash: await hashPassword(password),
      status: options.status ?? "active",
    })
    .returning();
  if (!user) throw new Error("patient user not created");

  const [profile] = await db
    .insert(schema.patientProfiles)
    .values({
      id: randomUUID(),
      clinicId,
      userId: user.id,
      sourceInvitationId: null,
      displayName: `Paciente ${user.id.slice(0, 6)}`,
      birthDate: options.birthDate ?? "1995-05-10",
      city: options.city ?? "Bogotá",
      bio: "Bio social de prueba.",
      goals: "Conocer personas.",
      connectionTypes: options.connectionTypes ?? ["friendship"],
      avatarUrl: null,
      onboardingCompletedAt:
        options.onboarding === false ? null : new Date(),
    })
    .returning();
  if (!profile) throw new Error("patient profile not created");

  for (const interestId of options.interestIds ?? []) {
    await db.insert(schema.patientInterests).values({
      id: randomUUID(),
      clinicId,
      patientProfileId: profile.id,
      interestId,
      weight: 1,
    });
  }

  return { user, profile, password };
}

async function createInterest(clinicId: string, slug: string) {
  const [interest] = await db
    .insert(schema.interests)
    .values({
      id: randomUUID(),
      clinicId,
      name: slug,
      slug,
      active: true,
    })
    .returning();
  if (!interest) throw new Error("interest not created");
  return interest;
}

async function createDemoScore(
  clinicId: string,
  profileX: string,
  profileY: string,
  score = 0.8,
) {
  const [a, b] = canonicalUuidPair(profileX, profileY);
  const [row] = await db
    .insert(schema.matchScores)
    .values({
      id: randomUUID(),
      clinicId,
      patientAId: a,
      patientBId: b,
      score,
      explanation: "Compatibilidad demo.",
      source: "demo",
      hardFiltersPassed: true,
    })
    .returning();
  if (!row) throw new Error("score not created");
  return row;
}

async function createConnection(
  clinicId: string,
  profileX: string,
  profileY: string,
  options: {
    status?: "pending_approval" | "active" | "paused" | "rejected" | "closed";
    matchScoreId?: string | null;
    connectionType?: ConnectionType;
  } = {},
) {
  const [a, b] = canonicalUuidPair(profileX, profileY);
  const [row] = await db
    .insert(schema.connections)
    .values({
      id: randomUUID(),
      clinicId,
      patientAId: a,
      patientBId: b,
      matchScoreId: options.matchScoreId ?? null,
      connectionType: options.connectionType ?? "friendship",
      status: options.status ?? "pending_approval",
    })
    .returning();
  if (!row) throw new Error("connection not created");
  return row;
}

async function login(clinicSlug: string, email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextIp(),
    payload: { clinicSlug, email, password },
  });
}

async function tokenFor(clinicSlug: string, email: string) {
  const res = await login(clinicSlug, email, "Demo123!");
  return res.json<{ accessToken: string }>().accessToken;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function swipe(token: string, targetProfileId: string, decision: "like" | "pass", extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/patient/swipes",
    headers: bearer(token),
    payload: { targetProfileId, decision, ...extra },
  });
}

function candidates(token: string) {
  return app.inject({
    method: "GET",
    url: "/patient/discovery/candidates",
    headers: bearer(token),
  });
}

describe("fase 3 discovery guards", () => {
  it("paciente sin auth recibe 401", async () => {
    const res = await app.inject({ method: "GET", url: "/patient/discovery/candidates" });
    expect(res.statusCode).toBe(401);
  });

  it("doctor no puede usar rutas de paciente y viceversa", async () => {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const patient = await createPatient(clinic.id);
    const doctorToken = await tokenFor(clinic.slug, doctor.user.email);
    const patientToken = await tokenFor(clinic.slug, patient.user.email);

    const asDoctor = await candidates(doctorToken);
    const asPatient = await app.inject({
      method: "GET",
      url: "/doctor/matches/pending",
      headers: bearer(patientToken),
    });
    expect(asDoctor.statusCode).toBe(403);
    expect(asPatient.statusCode).toBe(403);
  });

  it("no ve perfiles de otra clínica ni a sí mismo", async () => {
    const clinicA = await createClinic();
    const clinicB = await createClinic();
    const self = await createPatient(clinicA.id);
    const sameClinic = await createPatient(clinicA.id);
    const otherClinic = await createPatient(clinicB.id);
    await createDemoScore(clinicA.id, self.profile.id, sameClinic.profile.id);

    const token = await tokenFor(clinicA.slug, self.user.email);
    const res = await candidates(token);
    const body = res.json<{ candidates: Array<{ profileId: string }> }>();
    const ids = body.candidates.map((c) => c.profileId);
    expect(ids).toContain(sameClinic.profile.id);
    expect(ids).not.toContain(self.profile.id);
    expect(ids).not.toContain(otherClinic.profile.id);
  });

  it("excluye candidatos con conexión existente (incl. rejected)", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const connected = await createPatient(clinic.id);
    const rejected = await createPatient(clinic.id);
    await createDemoScore(clinic.id, self.profile.id, connected.profile.id);
    await createDemoScore(clinic.id, self.profile.id, rejected.profile.id);
    await createConnection(clinic.id, self.profile.id, connected.profile.id, {
      status: "active",
    });
    await createConnection(clinic.id, self.profile.id, rejected.profile.id, {
      status: "rejected",
    });

    const token = await tokenFor(clinic.slug, self.user.email);
    const ids = (await candidates(token))
      .json<{ candidates: Array<{ profileId: string }> }>()
      .candidates.map((c) => c.profileId);
    expect(ids).not.toContain(connected.profile.id);
    expect(ids).not.toContain(rejected.profile.id);
  });

  it("filtros duros se ejecutan antes del score (usuario inactivo no aparece pese a score)", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const inactive = await createPatient(clinic.id, { status: "suspended" });
    await createDemoScore(clinic.id, self.profile.id, inactive.profile.id);

    const token = await tokenFor(clinic.slug, self.user.email);
    const ids = (await candidates(token))
      .json<{ candidates: Array<{ profileId: string }> }>()
      .candidates.map((c) => c.profileId);
    expect(ids).not.toContain(inactive.profile.id);
  });

  it("par sin score demo no es descubrible (no inventa compatibilidad)", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const noScore = await createPatient(clinic.id);

    const token = await tokenFor(clinic.slug, self.user.email);
    const ids = (await candidates(token))
      .json<{ candidates: Array<{ profileId: string }> }>()
      .candidates.map((c) => c.profileId);
    expect(ids).not.toContain(noScore.profile.id);
  });

  it("candidato no expone email, birthDate ni clinicId", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const other = await createPatient(clinic.id, { birthDate: "1990-03-03" });
    await createDemoScore(clinic.id, self.profile.id, other.profile.id);

    const token = await tokenFor(clinic.slug, self.user.email);
    const res = await candidates(token);
    const raw = res.payload;
    expect(raw).not.toContain("birthDate");
    expect(raw).not.toContain("1990-03-03");
    expect(raw).not.toContain("@demo.com");
    expect(raw).not.toContain("clinicId");
    const first = res.json<{ candidates: Array<{ age: number }> }>().candidates[0];
    expect(typeof first?.age).toBe("number");
    expect(first?.age).toBeGreaterThanOrEqual(18);
  });
});

describe("fase 3 swipe", () => {
  it("pass excluye el candidato del deck", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const other = await createPatient(clinic.id);
    await createDemoScore(clinic.id, self.profile.id, other.profile.id);
    const token = await tokenFor(clinic.slug, self.user.email);

    const passed = await swipe(token, other.profile.id, "pass");
    expect(passed.statusCode).toBe(200);
    const ids = (await candidates(token))
      .json<{ candidates: Array<{ profileId: string }> }>()
      .candidates.map((c) => c.profileId);
    expect(ids).not.toContain(other.profile.id);
  });

  it("like unilateral no crea conexión", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    await createDemoScore(clinic.id, a.profile.id, b.profile.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);

    const res = await swipe(tokenA, b.profile.id, "like");
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe("liked");
    const conns = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.clinicId, clinic.id));
    expect(conns).toHaveLength(0);
  });

  it("like mutuo crea una sola conexión pending_approval con matchScoreId", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    const score = await createDemoScore(clinic.id, a.profile.id, b.profile.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);
    const tokenB = await tokenFor(clinic.slug, b.user.email);

    await swipe(tokenA, b.profile.id, "like");
    const res = await swipe(tokenB, a.profile.id, "like");
    expect(res.json<{ status: string }>().status).toBe("matched");

    const conns = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.clinicId, clinic.id));
    expect(conns).toHaveLength(1);
    expect(conns[0]?.status).toBe("pending_approval");
    expect(conns[0]?.matchScoreId).toBe(score.id);
  });

  it("score/explicación del frontend son ignorados", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    const score = await createDemoScore(clinic.id, a.profile.id, b.profile.id, 0.61);
    const tokenA = await tokenFor(clinic.slug, a.user.email);
    const tokenB = await tokenFor(clinic.slug, b.user.email);

    await swipe(tokenA, b.profile.id, "like", { score: 0.99, matchScoreId: randomUUID() });
    await swipe(tokenB, a.profile.id, "like", { score: 0.01, explanation: "hack" });

    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.clinicId, clinic.id));
    expect(conn?.matchScoreId).toBe(score.id);
  });

  it("swipe contra par demo sin score es rechazado (404)", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);

    const res = await swipe(tokenA, b.profile.id, "like");
    expect(res.statusCode).toBe(404);
  });

  it("decisión repetida idéntica es idempotente; contraria devuelve 409", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    await createDemoScore(clinic.id, a.profile.id, b.profile.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);

    const first = await swipe(tokenA, b.profile.id, "pass");
    const repeat = await swipe(tokenA, b.profile.id, "pass");
    const opposite = await swipe(tokenA, b.profile.id, "like");
    expect(first.statusCode).toBe(200);
    expect(repeat.statusCode).toBe(200);
    expect(opposite.statusCode).toBe(409);

    const swipes = await db
      .select()
      .from(schema.swipes)
      .where(eq(schema.swipes.clinicId, clinic.id));
    expect(swipes).toHaveLength(1);
    expect(swipes[0]?.decision).toBe("pass");
  });

  it("tipo de conexión respeta las autorizaciones de ambos (romantic)", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id, {
      connectionTypes: ["friendship", "romantic"],
    });
    const b = await createPatient(clinic.id, { connectionTypes: ["romantic"] });
    await createDemoScore(clinic.id, a.profile.id, b.profile.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);
    const tokenB = await tokenFor(clinic.slug, b.user.email);

    await swipe(tokenA, b.profile.id, "like");
    await swipe(tokenB, a.profile.id, "like");
    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.clinicId, clinic.id));
    expect(conn?.connectionType).toBe("romantic");
  });
});

describe("fase 3 concurrencia", () => {
  it("likes mutuos simultáneos no duplican conexión", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    await createDemoScore(clinic.id, a.profile.id, b.profile.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);
    const tokenB = await tokenFor(clinic.slug, b.user.email);

    await Promise.all([
      swipe(tokenA, b.profile.id, "like"),
      swipe(tokenB, a.profile.id, "like"),
    ]);

    const conns = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.clinicId, clinic.id));
    expect(conns).toHaveLength(1);
  });

  it("like y pass simultáneos del mismo actor: una decisión, un 409", async () => {
    const clinic = await createClinic();
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    await createDemoScore(clinic.id, a.profile.id, b.profile.id);
    const tokenA = await tokenFor(clinic.slug, a.user.email);

    const [r1, r2] = await Promise.all([
      swipe(tokenA, b.profile.id, "like"),
      swipe(tokenA, b.profile.id, "pass"),
    ]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const swipes = await db
      .select()
      .from(schema.swipes)
      .where(eq(schema.swipes.clinicId, clinic.id));
    expect(swipes).toHaveLength(1);
  });
});

describe("fase 3 aprobación y pausa", () => {
  async function pendingConnection(withScore = true) {
    const clinic = await createClinic();
    const doctor = await createDoctor(clinic.id);
    const a = await createPatient(clinic.id);
    const b = await createPatient(clinic.id);
    const score = withScore
      ? await createDemoScore(clinic.id, a.profile.id, b.profile.id)
      : null;
    const conn = await createConnection(clinic.id, a.profile.id, b.profile.id, {
      status: "pending_approval",
      matchScoreId: score?.id ?? null,
    });
    const doctorToken = await tokenFor(clinic.slug, doctor.user.email);
    return { clinic, doctor, doctorToken, a, b, conn };
  }

  it("doctor de otra clínica no ve ni decide el match", async () => {
    const ctx = await pendingConnection();
    const otherClinic = await createClinic();
    const otherDoctor = await createDoctor(otherClinic.id);
    const otherToken = await tokenFor(otherClinic.slug, otherDoctor.user.email);

    const pending = await app.inject({
      method: "GET",
      url: "/doctor/matches/pending",
      headers: bearer(otherToken),
    });
    expect(
      pending.json<{ matches: Array<{ connectionId: string }> }>().matches,
    ).toHaveLength(0);

    const approve = await app.inject({
      method: "POST",
      url: `/doctor/matches/${ctx.conn.id}/approve`,
      headers: bearer(otherToken),
      payload: {},
    });
    expect(approve.statusCode).toBe(404);
  });

  it("aprobar crea una conversación con dos pacientes, sin la doctora", async () => {
    const ctx = await pendingConnection();
    const res = await app.inject({
      method: "POST",
      url: `/doctor/matches/${ctx.conn.id}/approve`,
      headers: bearer(ctx.doctorToken),
      payload: { rationale: "Buen match" },
    });
    expect(res.statusCode).toBe(200);

    const convs = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.connectionId, ctx.conn.id));
    expect(convs).toHaveLength(1);
    const convId = convs[0]!.id;
    const members = await db
      .select({ userId: schema.conversationMembers.userId, role: schema.users.role })
      .from(schema.conversationMembers)
      .innerJoin(
        schema.users,
        and(
          eq(schema.conversationMembers.clinicId, schema.users.clinicId),
          eq(schema.conversationMembers.userId, schema.users.id),
        ),
      )
      .where(eq(schema.conversationMembers.conversationId, convId));
    expect(members).toHaveLength(2);
    expect(members.every((m) => m.role === "patient")).toBe(true);
    const ids = members.map((m) => m.userId).sort();
    expect(ids).toEqual([ctx.a.user.id, ctx.b.user.id].sort());

    const [updated] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, ctx.conn.id));
    expect(updated?.status).toBe("active");
  });

  it("segunda aprobación no duplica conversación ni decisión", async () => {
    const ctx = await pendingConnection();
    const url = `/doctor/matches/${ctx.conn.id}/approve`;
    await app.inject({ method: "POST", url, headers: bearer(ctx.doctorToken), payload: {} });
    const second = await app.inject({
      method: "POST",
      url,
      headers: bearer(ctx.doctorToken),
      payload: {},
    });
    expect(second.statusCode).toBe(200);

    const convs = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.connectionId, ctx.conn.id));
    expect(convs).toHaveLength(1);
    const decisions = await db
      .select()
      .from(schema.matchDecisions)
      .where(eq(schema.matchDecisions.connectionId, ctx.conn.id));
    expect(decisions).toHaveLength(1);
  });

  it("conversación con miembros inconsistentes provoca rollback", async () => {
    const ctx = await pendingConnection();
    // Conversación activa preexistente con la doctora como miembro (inconsistente).
    const [conv] = await db
      .insert(schema.conversations)
      .values({
        id: randomUUID(),
        clinicId: ctx.clinic.id,
        connectionId: ctx.conn.id,
        type: "direct",
        status: "active",
        title: null,
      })
      .returning();
    await db.insert(schema.conversationMembers).values({
      id: randomUUID(),
      clinicId: ctx.clinic.id,
      conversationId: conv!.id,
      userId: ctx.doctor.user.id,
      memberRole: "member",
    });

    const res = await app.inject({
      method: "POST",
      url: `/doctor/matches/${ctx.conn.id}/approve`,
      headers: bearer(ctx.doctorToken),
      payload: {},
    });
    expect(res.statusCode).toBe(409);

    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, ctx.conn.id));
    expect(conn?.status).toBe("pending_approval");
    const decisions = await db
      .select()
      .from(schema.matchDecisions)
      .where(eq(schema.matchDecisions.connectionId, ctx.conn.id));
    expect(decisions).toHaveLength(0);
  });

  it("pausar no crea conversación y es idempotente", async () => {
    const ctx = await pendingConnection();
    const url = `/doctor/matches/${ctx.conn.id}/pause`;
    const first = await app.inject({ method: "POST", url, headers: bearer(ctx.doctorToken), payload: {} });
    const second = await app.inject({ method: "POST", url, headers: bearer(ctx.doctorToken), payload: {} });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const convs = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.connectionId, ctx.conn.id));
    expect(convs).toHaveLength(0);
    const [conn] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.id, ctx.conn.id));
    expect(conn?.status).toBe("paused");
  });

  it("pendiente sin score se expone como inconsistencia controlada (no se oculta)", async () => {
    const ctx = await pendingConnection(false);
    const res = await app.inject({
      method: "GET",
      url: "/doctor/matches/pending",
      headers: bearer(ctx.doctorToken),
    });
    const match = res
      .json<{ matches: Array<{ connectionId: string; hasScore: boolean; compatibility: number | null }> }>()
      .matches.find((m) => m.connectionId === ctx.conn.id);
    expect(match).toBeDefined();
    expect(match?.hasScore).toBe(false);
    expect(match?.compatibility).toBeNull();
  });

  it("endpoint doctor no devuelve cuerpos de mensajes", async () => {
    const ctx = await pendingConnection();
    await app.inject({
      method: "POST",
      url: `/doctor/matches/${ctx.conn.id}/approve`,
      headers: bearer(ctx.doctorToken),
      payload: {},
    });
    const res = await app.inject({
      method: "GET",
      url: "/doctor/matches/pending",
      headers: bearer(ctx.doctorToken),
    });
    expect(res.payload).not.toContain("\"body\"");
    expect(res.payload).not.toContain("messages");
  });
});

describe("fase 3 pgvector provider", () => {
  function vec(values: Record<number, number>): number[] {
    const arr = new Array<number>(1536).fill(0);
    for (const [idx, value] of Object.entries(values)) {
      arr[Number(idx)] = value;
    }
    return arr;
  }

  async function addEmbedding(clinicId: string, profileId: string, values: Record<number, number>) {
    await db.insert(schema.profileEmbeddings).values({
      id: randomUUID(),
      clinicId,
      patientProfileId: profileId,
      embedding: vec(values),
      embeddingModel: "test",
      dimensions: 1536,
    });
  }

  it("devuelve vacío de forma controlada si falta el embedding propio", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const other = await createPatient(clinic.id);
    const provider = new PgVectorMatchingService();
    const result = await provider.scoreCandidates(
      db,
      { clinicId: clinic.id, selfProfileId: self.profile.id },
      [other.profile.id],
    );
    expect(result.size).toBe(0);
  });

  it("persiste score calculated al existir ambos embeddings", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const other = await createPatient(clinic.id);
    await addEmbedding(clinic.id, self.profile.id, { 0: 1, 1: 0.5 });
    await addEmbedding(clinic.id, other.profile.id, { 0: 1, 1: 0.2 });
    const provider = new PgVectorMatchingService();

    const ensured = await db.transaction((tx) =>
      provider.ensureScoreRow(
        tx,
        { clinicId: clinic.id, selfProfileId: self.profile.id },
        other.profile.id,
      ),
    );
    expect(ensured).not.toBeNull();
    const [a, b] = canonicalUuidPair(self.profile.id, other.profile.id);
    const [row] = await db
      .select()
      .from(schema.matchScores)
      .where(
        and(
          eq(schema.matchScores.clinicId, clinic.id),
          eq(schema.matchScores.patientAId, a),
          eq(schema.matchScores.patientBId, b),
        ),
      );
    expect(row?.source).toBe("calculated");
    expect(Number(row?.score)).toBeGreaterThanOrEqual(0);
    expect(Number(row?.score)).toBeLessThanOrEqual(1);
  });

  it("demo provider no inventa score para par sin fila", async () => {
    const clinic = await createClinic();
    const self = await createPatient(clinic.id);
    const other = await createPatient(clinic.id);
    const provider = new DemoMatchingService();
    const result = await provider.scoreCandidates(
      db,
      { clinicId: clinic.id, selfProfileId: self.profile.id },
      [other.profile.id],
    );
    expect(result.size).toBe(0);
  });
});
