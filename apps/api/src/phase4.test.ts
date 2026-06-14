import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { io as clientIo, type Socket as ClientSocket } from "socket.io-client";
import { and, eq } from "drizzle-orm";
import {
  calmElapsed,
  calmFinish,
  calmInitial,
  calmPause,
  calmResume,
  calmStart,
  calmView,
  type MessageAck,
  type SimpleAck,
} from "@mindmatch/shared";
import { buildApp } from "./app";
import { db, queryClient, schema } from "./db";
import { canonicalUuidPair } from "./domain/pairs";
import { hashPassword } from "./security/passwords";

let restApp: FastifyInstance;
let realtimeApp: FastifyInstance;
let realtimeUrl: string;

beforeAll(async () => {
  restApp = buildApp();
  await restApp.ready();
  realtimeApp = buildApp({ enableRealtime: true, typingExpiryMs: 100 });
  await realtimeApp.listen({ port: 0, host: "127.0.0.1" });
  const address = realtimeApp.server.address();
  if (!address || typeof address === "string") throw new Error("missing server address");
  realtimeUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await restApp.close();
  await realtimeApp.close();
  await queryClient.end();
});

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function createClinic() {
  const [clinic] = await db
    .insert(schema.clinics)
    .values({
      id: randomUUID(),
      name: `Clinica ${randomUUID()}`,
      slug: `clinic-${randomUUID()}`,
      timezone: "America/Bogota",
      status: "active",
    })
    .returning();
  if (!clinic) throw new Error("clinic not created");
  return clinic;
}

async function createUser(clinicId: string, role: "doctor" | "patient", status: "active" | "suspended" = "active") {
  const password = "Demo123!";
  const [user] = await db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      clinicId,
      role,
      email: `${role}-${randomUUID()}@demo.com`,
      passwordHash: await hashPassword(password),
      status,
    })
    .returning();
  if (!user) throw new Error("user not created");
  return { user, password };
}

async function createPatient(clinicId: string, name: string, status: "active" | "suspended" = "active") {
  const account = await createUser(clinicId, "patient", status);
  const [profile] = await db
    .insert(schema.patientProfiles)
    .values({
      id: randomUUID(),
      clinicId,
      userId: account.user.id,
      sourceInvitationId: null,
      displayName: name,
      birthDate: "1995-05-10",
      city: "Bogota",
      bio: "Bio social.",
      goals: "Conocer personas.",
      connectionTypes: ["friendship"],
      avatarUrl: null,
      onboardingCompletedAt: new Date(),
    })
    .returning();
  if (!profile) throw new Error("profile not created");
  return { ...account, profile };
}

async function createDirectConversation(status: "active" | "paused" | "closed" = "active") {
  const clinic = await createClinic();
  const doctor = await createUser(clinic.id, "doctor");
  const a = await createPatient(clinic.id, "Ana");
  const b = await createPatient(clinic.id, "Bruno");
  const [pa, pb] = canonicalUuidPair(a.profile.id, b.profile.id);
  const [connection] = await db
    .insert(schema.connections)
    .values({
      id: randomUUID(),
      clinicId: clinic.id,
      patientAId: pa,
      patientBId: pb,
      connectionType: "friendship",
      status: "active",
    })
    .returning();
  if (!connection) throw new Error("connection not created");
  const [conversation] = await db
    .insert(schema.conversations)
    .values({
      id: randomUUID(),
      clinicId: clinic.id,
      connectionId: connection.id,
      type: "direct",
      status,
      title: null,
    })
    .returning();
  if (!conversation) throw new Error("conversation not created");
  await db.insert(schema.conversationMembers).values([
    { id: randomUUID(), clinicId: clinic.id, conversationId: conversation.id, userId: a.user.id },
    { id: randomUUID(), clinicId: clinic.id, conversationId: conversation.id, userId: b.user.id },
  ]);
  return { clinic, doctor, a, b, connection, conversation };
}

function tokenFor(app: FastifyInstance, user: { id: string; clinicId: string; role: "doctor" | "patient" }, expiresIn = "15m") {
  return app.jwt.sign({ sub: user.id, clinicId: user.clinicId, role: user.role }, { expiresIn });
}

function expiredTokenFor(app: FastifyInstance, user: { id: string; clinicId: string; role: "doctor" | "patient" }) {
  return app.jwt.sign({
    sub: user.id,
    clinicId: user.clinicId,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) - 60,
  });
}

function connectSocket(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = clientIo(realtimeUrl, {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emitAck<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (ack: T) => resolve(ack));
  });
}

describe("fase 4 historial REST", () => {
  it("paciente miembro ve historial paginado sin clinicId ni campos clinicos; doctora no accede", async () => {
    const ctx = await createDirectConversation();
    await db.insert(schema.messages).values([
      { id: randomUUID(), clinicId: ctx.clinic.id, conversationId: ctx.conversation.id, senderUserId: ctx.a.user.id, body: "uno", sentAt: new Date("2026-01-01T10:00:00Z") },
      { id: randomUUID(), clinicId: ctx.clinic.id, conversationId: ctx.conversation.id, senderUserId: ctx.b.user.id, body: "dos", sentAt: new Date("2026-01-01T10:01:00Z") },
      { id: randomUUID(), clinicId: ctx.clinic.id, conversationId: ctx.conversation.id, senderUserId: ctx.a.user.id, body: "tres", sentAt: new Date("2026-01-01T10:02:00Z") },
    ]);
    const patientToken = tokenFor(restApp, ctx.a.user);
    const doctorToken = tokenFor(restApp, ctx.doctor.user);

    const page1 = await restApp.inject({
      method: "GET",
      url: `/patient/conversations/${ctx.conversation.id}/messages?limit=2`,
      headers: bearer(patientToken),
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json<{ messages: Array<{ id: string; body: string }>; nextCursor: string | null }>();
    expect(body1.messages.map((m) => m.body)).toEqual(["dos", "tres"]);
    expect(page1.payload).not.toContain("clinicId");
    expect(page1.payload).not.toContain("clinical");
    expect(page1.payload).not.toContain("risk");

    const page2 = await restApp.inject({
      method: "GET",
      url: `/patient/conversations/${ctx.conversation.id}/messages?limit=2&cursor=${body1.nextCursor}`,
      headers: bearer(patientToken),
    });
    const body2 = page2.json<{ messages: Array<{ id: string; body: string }> }>();
    expect(body2.messages.map((m) => m.id)).not.toEqual(expect.arrayContaining(body1.messages.map((m) => m.id)));

    const invalidCursor = await restApp.inject({
      method: "GET",
      url: `/patient/conversations/${ctx.conversation.id}/messages?cursor=bad`,
      headers: bearer(patientToken),
    });
    const asDoctor = await restApp.inject({
      method: "GET",
      url: `/patient/conversations/${ctx.conversation.id}/messages`,
      headers: bearer(doctorToken),
    });
    expect(invalidCursor.statusCode).toBe(400);
    expect(asDoctor.statusCode).toBe(403);
  });
});

describe("fase 4 sockets y mensajes", () => {
  it("rechaza handshake sin token, token expirado y usuario suspendido", async () => {
    const clinic = await createClinic();
    const suspended = await createPatient(clinic.id, "Suspendida", "suspended");
    await expect(connectSocket("")).rejects.toBeTruthy();
    await expect(connectSocket(tokenFor(realtimeApp, suspended.user))).rejects.toBeTruthy();
    await expect(connectSocket(expiredTokenFor(realtimeApp, suspended.user))).rejects.toBeTruthy();
  });

  it("envia mensajes solo entre miembros, deduplica retry e identifica conflictos", async () => {
    const ctx = await createDirectConversation();
    const otherClinic = await createClinic();
    const outsider = await createPatient(otherClinic.id, "Otra");
    const a = await connectSocket(tokenFor(realtimeApp, ctx.a.user));
    const b = await connectSocket(tokenFor(realtimeApp, ctx.b.user));
    const outside = await connectSocket(tokenFor(realtimeApp, outsider.user));
    try {
      expect(await emitAck<SimpleAck>(a, "conversation:join", { conversationId: ctx.conversation.id })).toEqual({ ok: true });
      expect(await emitAck<SimpleAck>(b, "conversation:join", { conversationId: ctx.conversation.id })).toEqual({ ok: true });
      expect(await emitAck<SimpleAck>(outside, "conversation:join", { conversationId: ctx.conversation.id })).toEqual({ ok: false, code: "NOT_FOUND" });

      const received = new Promise((resolve) => b.once("message:new", resolve));
      const clientMessageId = randomUUID();
      const first = await emitAck<MessageAck>(a, "message:send", {
        conversationId: ctx.conversation.id,
        clientMessageId,
        body: " Hola ",
      });
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.status).toBe("created");
      await expect(received).resolves.toMatchObject({ body: "Hola", conversationId: ctx.conversation.id });

      const duplicate = await emitAck<MessageAck>(a, "message:send", {
        conversationId: ctx.conversation.id,
        clientMessageId,
        body: "Hola",
      });
      const conflict = await emitAck<MessageAck>(a, "message:send", {
        conversationId: ctx.conversation.id,
        clientMessageId,
        body: "Cambio",
      });
      expect(duplicate).toMatchObject({ ok: true, status: "duplicate" });
      expect(conflict).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT" });

      const rows = await db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.clinicId, ctx.clinic.id),
            eq(schema.messages.clientMessageId, clientMessageId),
          ),
        );
      expect(rows).toHaveLength(1);
    } finally {
      a.disconnect();
      b.disconnect();
      outside.disconnect();
    }
  });

  it("typing se limita a miembros y expira en servidor", async () => {
    const ctx = await createDirectConversation();
    const a = await connectSocket(tokenFor(realtimeApp, ctx.a.user));
    const b = await connectSocket(tokenFor(realtimeApp, ctx.b.user));
    try {
      await emitAck<SimpleAck>(a, "conversation:join", { conversationId: ctx.conversation.id });
      await emitAck<SimpleAck>(b, "conversation:join", { conversationId: ctx.conversation.id });
      const start = new Promise((resolve) => b.once("typing:update", resolve));
      a.emit("typing:start", { conversationId: ctx.conversation.id });
      await expect(start).resolves.toMatchObject({ userId: ctx.a.user.id, isTyping: true });
      const stop = new Promise((resolve) => b.once("typing:update", resolve));
      await expect(stop).resolves.toMatchObject({ userId: ctx.a.user.id, isTyping: false });
    } finally {
      a.disconnect();
      b.disconnect();
    }
  }, 6000);
});

describe("fase 4 reportes R6 y doctor", () => {
  it("crea un reporte R6 atomico, sin exponer alertId al paciente ni body a doctora", async () => {
    const ctx = await createDirectConversation();
    const [message] = await db
      .insert(schema.messages)
      .values({
        id: randomUUID(),
        clinicId: ctx.clinic.id,
        conversationId: ctx.conversation.id,
        senderUserId: ctx.a.user.id,
        body: "mensaje sensible",
      })
      .returning();
    if (!message) throw new Error("message not created");
    const doctor = await connectSocket(tokenFor(realtimeApp, ctx.doctor.user));
    const event = new Promise((resolve) => doctor.once("report:created", resolve));
    const reporterToken = tokenFor(realtimeApp, ctx.b.user);
    const res = await realtimeApp.inject({
      method: "POST",
      url: `/patient/messages/${message.id}/report`,
      headers: bearer(reporterToken),
      payload: { reason: "safety_concern", details: "detalle privado" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain("alertId");
    await expect(event).resolves.toMatchObject({
      ruleCode: "R6",
      severity: "high",
      reportedUserId: ctx.a.user.id,
      reasonCategory: "safety_concern",
    });
    doctor.disconnect();

    const reports = await db.select().from(schema.messageReports).where(eq(schema.messageReports.messageId, message.id));
    const alerts = await db.select().from(schema.alerts).where(eq(schema.alerts.ruleCode, "R6"));
    expect(reports).toHaveLength(1);
    const reportAlerts = alerts.filter((alert) => alert.inputsJson.messageReportId === reports[0]!.id);
    expect(reportAlerts).toHaveLength(1);
    const inputs = JSON.stringify(reportAlerts[0]!.inputsJson);
    expect(inputs).not.toContain("mensaje sensible");
    expect(inputs).not.toContain("detalle privado");

    const duplicate = await restApp.inject({
      method: "POST",
      url: `/patient/messages/${message.id}/report`,
      headers: bearer(reporterToken),
      payload: { reason: "safety_concern", details: "detalle privado" },
    });
    const changed = await restApp.inject({
      method: "POST",
      url: `/patient/messages/${message.id}/report`,
      headers: bearer(reporterToken),
      payload: { reason: "spam", details: "detalle privado" },
    });
    expect(duplicate.json<{ outcome: string }>().outcome).toBe("existing");
    expect(changed.statusCode).toBe(409);

    const doctorRes = await restApp.inject({
      method: "GET",
      url: "/doctor/reports/open",
      headers: bearer(tokenFor(restApp, ctx.doctor.user)),
    });
    expect(doctorRes.statusCode).toBe(200);
    expect(doctorRes.payload).toContain("hasDetails");
    expect(doctorRes.payload).not.toContain("mensaje sensible");
    expect(doctorRes.payload).not.toContain("detalle privado");
  });

  it("rechaza reporte propio, mensaje system y conserva metadata doctor sin preview", async () => {
    const ctx = await createDirectConversation();
    const [own] = await db.insert(schema.messages).values({
      id: randomUUID(),
      clinicId: ctx.clinic.id,
      conversationId: ctx.conversation.id,
      senderUserId: ctx.a.user.id,
      body: "propio",
    }).returning();
    const [system] = await db.insert(schema.messages).values({
      id: randomUUID(),
      clinicId: ctx.clinic.id,
      conversationId: ctx.conversation.id,
      senderUserId: ctx.a.user.id,
      messageType: "system",
      body: "sistema",
    }).returning();
    const token = tokenFor(restApp, ctx.a.user);
    const ownReport = await restApp.inject({ method: "POST", url: `/patient/messages/${own!.id}/report`, headers: bearer(token), payload: { reason: "other" } });
    const systemReport = await restApp.inject({ method: "POST", url: `/patient/messages/${system!.id}/report`, headers: bearer(tokenFor(restApp, ctx.b.user)), payload: { reason: "other" } });
    const metadata = await restApp.inject({ method: "GET", url: "/doctor/connections/metadata", headers: bearer(tokenFor(restApp, ctx.doctor.user)) });
    expect(ownReport.statusCode).toBe(403);
    expect(systemReport.statusCode).toBe(400);
    expect(metadata.statusCode).toBe(200);
    expect(metadata.payload).not.toContain("propio");
    expect(metadata.payload).not.toContain("preview");
    expect(metadata.payload).not.toContain("body");
  });
});

describe("fase 4 modo calma", () => {
  it("modela respiracion 4-7-8 por 3 ciclos con pausa, resume, finish y reset", () => {
    const started = calmStart(calmInitial(), 1000);
    expect(calmView(calmElapsed(started, 4999))).toMatchObject({ phase: "inhale", cycle: 1 });
    expect(calmView(calmElapsed(started, 5000))).toMatchObject({ phase: "hold", cycle: 1 });
    expect(calmView(calmElapsed(started, 12000))).toMatchObject({ phase: "exhale", cycle: 1 });
    expect(calmView(calmElapsed(started, 20000))).toMatchObject({ phase: "inhale", cycle: 2 });
    const paused = calmPause(started, 2500);
    expect(calmElapsed(paused, 9999)).toBe(1500);
    const resumed = calmResume(paused, 10000);
    expect(calmElapsed(resumed, 10500)).toBe(2000);
    expect(calmView(calmElapsed(calmFinish(resumed), 11000))).toMatchObject({ finished: true, cycle: 3 });
    expect(calmInitial()).toEqual({ status: "idle", elapsedMs: 0, lastResumeAt: null });
  });
});
