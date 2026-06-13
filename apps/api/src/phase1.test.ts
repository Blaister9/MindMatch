import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { buildApp } from "./app";
import { db, queryClient, schema } from "./db";
import { hashPassword } from "./security/passwords";
import { createOpaqueToken, hashToken } from "./security/tokens";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await queryClient.end();
});

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
  if (!clinic) throw new Error("clinic not created");
  return clinic;
}

async function createUser(
  clinicId: string,
  role: "doctor" | "patient",
  status: "active" | "suspended" = "active",
) {
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

// Cada login usa una IP distinta para que el rate-limit por IP de /auth/login
// (max 8/min) no se acumule a lo largo de toda la suite. No cambia el
// comportamiento de producción; es aislamiento de prueba.
let loginIpCounter = 0;
function nextRemoteAddress() {
  loginIpCounter += 1;
  const n = loginIpCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

async function login(clinicSlug: string, email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: nextRemoteAddress(),
    payload: { clinicSlug, email, password },
  });
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function createInvitation(clinicId: string, doctorId: string, overrides = {}) {
  const token = createOpaqueToken();
  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      id: randomUUID(),
      clinicId,
      createdByUserId: doctorId,
      email: `paciente-${randomUUID()}@demo.com`,
      patientName: "Paciente Demo",
      birthDate: "1995-05-10",
      allowedConnectionTypes: ["friendship", "group"],
      restrictionsJson: {},
      tokenHash: hashToken(token),
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    })
    .returning();
  if (!invitation) throw new Error("invitation not created");
  return { invitation, token };
}

describe("fase 1 auth guards", () => {
  it("sin access token recibe 401", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("token inválido recibe 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: bearer("token-invalido"),
    });
    expect(response.statusCode).toBe(401);
  });

  it("usuario suspendido después de emitir JWT recibe 401", async () => {
    const clinic = await createClinic();
    const { user } = await createUser(clinic.id, "doctor");
    const token = app.jwt.sign({
      sub: user.id,
      clinicId: clinic.id,
      role: "doctor",
    });
    await db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, user.id));

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: bearer(token),
    });
    expect(response.statusCode).toBe(401);
  });

  it("ruta doctor rechaza patient y ruta patient rechaza doctor", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const patient = await createUser(clinic.id, "patient");
    const doctorLogin = await login(clinic.slug, doctor.user.email, doctor.password);
    const patientLogin = await login(clinic.slug, patient.user.email, patient.password);
    const doctorToken = doctorLogin.json<{ accessToken: string }>().accessToken;
    const patientToken = patientLogin.json<{ accessToken: string }>().accessToken;

    const doctorRoute = await app.inject({
      method: "GET",
      url: "/doctor/invitations",
      headers: bearer(patientToken),
    });
    const patientRoute = await app.inject({
      method: "GET",
      url: "/patient/profile",
      headers: bearer(doctorToken),
    });

    expect(doctorRoute.statusCode).toBe(403);
    expect(patientRoute.statusCode).toBe(403);
  });
});

describe("login multi-tenant", () => {
  async function createUserWithEmail(
    clinicId: string,
    email: string,
    role: "doctor" | "patient" = "doctor",
    status: "active" | "suspended" = "active",
  ) {
    const password = "Demo123!";
    const [user] = await db
      .insert(schema.users)
      .values({
        id: randomUUID(),
        clinicId,
        role,
        email,
        passwordHash: await hashPassword(password),
        status,
      })
      .returning();
    if (!user) throw new Error("user not created");
    return { user, password };
  }

  it("mismo email en dos clínicas: cada slug autentica al usuario correcto", async () => {
    const clinicA = await createClinic();
    const clinicB = await createClinic();
    const sharedEmail = `compartido-${randomUUID()}@demo.com`;
    const userA = await createUserWithEmail(clinicA.id, sharedEmail);
    const userB = await createUserWithEmail(clinicB.id, sharedEmail);

    const loginA = await login(clinicA.slug, sharedEmail, userA.password);
    const loginB = await login(clinicB.slug, sharedEmail, userB.password);

    expect(loginA.statusCode).toBe(200);
    expect(loginB.statusCode).toBe(200);
    const bodyA = loginA.json<{ user: { userId: string; clinicId: string } }>();
    const bodyB = loginB.json<{ user: { userId: string; clinicId: string } }>();
    expect(bodyA.user.clinicId).toBe(clinicA.id);
    expect(bodyA.user.userId).toBe(userA.user.id);
    expect(bodyB.user.clinicId).toBe(clinicB.id);
    expect(bodyB.user.userId).toBe(userB.user.id);
    // El usuario de la otra clínica nunca se selecciona pese al email idéntico.
    expect(bodyA.user.userId).not.toBe(userB.user.id);
  });

  it("slug incorrecto devuelve error genérico sin revelar el motivo", async () => {
    const clinic = await createClinic();
    const { user, password } = await createUser(clinic.id, "doctor");

    const wrongSlug = await login(
      `no-existe-${randomUUID()}`,
      user.email,
      password,
    );
    const wrongPassword = await login(clinic.slug, user.email, "Incorrecta1!");

    expect(wrongSlug.statusCode).toBe(401);
    expect(wrongPassword.statusCode).toBe(401);
    // Respuesta idéntica para "clínica inexistente" y "contraseña incorrecta":
    // no se revela qué dato falló ni la existencia de clínica/email.
    expect(wrongSlug.json()).toEqual(wrongPassword.json());
    expect(JSON.stringify(wrongSlug.json())).not.toContain(clinic.slug);
    expect(JSON.stringify(wrongSlug.json())).not.toContain(user.email);
  });

  it("usuario de otra clínica no es seleccionado con el slug equivocado", async () => {
    const clinicA = await createClinic();
    const clinicB = await createClinic();
    const { user, password } = await createUser(clinicA.id, "doctor");

    // Email válido en clinicA, pero pedimos login con el slug de clinicB.
    const response = await login(clinicB.slug, user.email, password);
    expect(response.statusCode).toBe(401);
  });

  it("clínica inactiva no permite login", async () => {
    const clinic = await createClinic();
    const { user, password } = await createUser(clinic.id, "doctor");
    await db
      .update(schema.clinics)
      .set({ status: "inactive" })
      .where(eq(schema.clinics.id, clinic.id));

    const response = await login(clinic.slug, user.email, password);
    expect(response.statusCode).toBe(401);
  });

  it("cuenta no activa devuelve el mismo 401 genérico", async () => {
    const clinic = await createClinic();
    const { user, password } = await createUser(clinic.id, "doctor", "suspended");
    const baseline = await login(clinic.slug, user.email, "Incorrecta1!");

    const response = await login(clinic.slug, user.email, password);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(baseline.json());
  });
});

describe("fase 1 tenant isolation", () => {
  it("doctor no consulta ni revoca invitación de otra clínica", async () => {
    const clinicA = await createClinic();
    const clinicB = await createClinic();
    const doctorA = await createUser(clinicA.id, "doctor");
    const doctorB = await createUser(clinicB.id, "doctor");
    const { invitation } = await createInvitation(clinicB.id, doctorB.user.id);
    const loginA = await login(clinicA.slug, doctorA.user.email, doctorA.password);
    const tokenA = loginA.json<{ accessToken: string }>().accessToken;

    const list = await app.inject({
      method: "GET",
      url: "/doctor/invitations",
      headers: bearer(tokenA),
    });
    const revoke = await app.inject({
      method: "POST",
      url: `/doctor/invitations/${invitation.id}/revoke`,
      headers: bearer(tokenA),
    });

    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain(invitation.id);
    expect(revoke.statusCode).toBe(404);
  });

  it("paciente solo accede a su perfil y no recibe campos clínicos", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const patient = await createUser(clinic.id, "patient");
    const otherPatient = await createUser(clinic.id, "patient");
    const invite = await createInvitation(clinic.id, doctor.user.id, {
      email: patient.user.email,
      status: "accepted",
      acceptedAt: new Date(),
    });
    await db.insert(schema.patientProfiles).values({
      id: randomUUID(),
      clinicId: clinic.id,
      userId: patient.user.id,
      sourceInvitationId: invite.invitation.id,
      displayName: "Paciente Propio",
      birthDate: "1995-05-10",
      city: "Bogotá",
      bio: "Bio social",
      goals: "Metas",
      connectionTypes: ["friendship"],
    });
    const otherInvite = await createInvitation(clinic.id, doctor.user.id, {
      email: otherPatient.user.email,
      status: "accepted",
      acceptedAt: new Date(),
    });
    await db.insert(schema.patientProfiles).values({
      id: randomUUID(),
      clinicId: clinic.id,
      userId: otherPatient.user.id,
      sourceInvitationId: otherInvite.invitation.id,
      displayName: "Otro Paciente",
      birthDate: "1995-05-10",
      city: "Cali",
      bio: "Bio",
      goals: "Metas",
      connectionTypes: ["friendship"],
    });

    const patientLogin = await login(clinic.slug, patient.user.email, patient.password);
    const response = await app.inject({
      method: "GET",
      url: "/patient/profile",
      headers: bearer(patientLogin.json<{ accessToken: string }>().accessToken),
    });
    const body = JSON.stringify(response.json());

    expect(response.statusCode).toBe(200);
    expect(body).toContain("Paciente Propio");
    expect(body).not.toContain("Otro Paciente");
    expect(body).not.toContain("clinical");
    expect(body).not.toContain("risk");
    expect(body).not.toContain("managementNote");
  });

  it("endpoint doctor de fase 1 no devuelve contenido de mensajes", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const doctorLogin = await login(clinic.slug, doctor.user.email, doctor.password);
    const response = await app.inject({
      method: "GET",
      url: "/doctor/invitations",
      headers: bearer(doctorLogin.json<{ accessToken: string }>().accessToken),
    });
    const body = JSON.stringify(response.json());

    expect(response.statusCode).toBe(200);
    expect(body).not.toContain("body");
    expect(body).not.toContain("messages");
  });
});

describe("fase 1 refresh tokens", () => {
  it("refresh inválido, vencido y revocado reciben 401", async () => {
    const clinic = await createClinic();
    const patient = await createUser(clinic.id, "patient");
    const expired = createOpaqueToken();
    const revoked = createOpaqueToken();
    await db.insert(schema.refreshTokens).values([
      {
        id: randomUUID(),
        clinicId: clinic.id,
        userId: patient.user.id,
        tokenHash: hashToken(expired),
        expiresAt: new Date(Date.now() - 1000),
      },
      {
        id: randomUUID(),
        clinicId: clinic.id,
        userId: patient.user.id,
        tokenHash: hashToken(revoked),
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(),
      },
    ]);

    for (const cookie of ["bad", expired, revoked]) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        headers: { cookie: `mindmatch_refresh=${cookie}` },
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it("refresh rotado no puede reutilizarse", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const loginResponse = await login(clinic.slug, doctor.user.email, doctor.password);
    const oldCookie = loginResponse.cookies[0]?.value;
    expect(oldCookie).toBeTruthy();

    const firstRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `mindmatch_refresh=${oldCookie}` },
    });
    const secondRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `mindmatch_refresh=${oldCookie}` },
    });

    expect(firstRefresh.statusCode).toBe(200);
    expect(secondRefresh.statusCode).toBe(401);
  });
});

describe("fase 1 invitations", () => {
  it("invitación vencida, revocada y aceptada no puede aceptarse", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const expired = await createInvitation(clinic.id, doctor.user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const revoked = await createInvitation(clinic.id, doctor.user.id, {
      status: "revoked",
    });
    const accepted = await createInvitation(clinic.id, doctor.user.id, {
      status: "accepted",
      acceptedAt: new Date(),
    });

    for (const item of [expired, revoked, accepted]) {
      const response = await app.inject({
        method: "POST",
        url: "/invitations/accept",
        payload: {
          token: item.token,
          password: "Paciente123!",
          passwordConfirmation: "Paciente123!",
        },
      });
      expect(response.statusCode).not.toBe(200);
    }
  });

  it("dos aceptaciones concurrentes no crean duplicados", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const { invitation, token } = await createInvitation(clinic.id, doctor.user.id);

    const payload = {
      token,
      password: "Paciente123!",
      passwordConfirmation: "Paciente123!",
    };
    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/invitations/accept", payload }),
      app.inject({ method: "POST", url: "/invitations/accept", payload }),
    ]);
    const successCount = responses.filter((response) => response.statusCode === 200)
      .length;
    const profiles = await db
      .select()
      .from(schema.patientProfiles)
      .where(eq(schema.patientProfiles.sourceInvitationId, invitation.id));

    expect(successCount).toBe(1);
    expect(profiles).toHaveLength(1);
  });

  it("tipos de conexión no pueden ampliar los autorizados y menor de 18 se rechaza", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const { token } = await createInvitation(clinic.id, doctor.user.id, {
      allowedConnectionTypes: ["friendship"],
    });
    const accept = await app.inject({
      method: "POST",
      url: "/invitations/accept",
      payload: {
        token,
        password: "Paciente123!",
        passwordConfirmation: "Paciente123!",
      },
    });
    const accessToken = accept.json<{ accessToken: string }>().accessToken;

    const invalidProfile = await app.inject({
      method: "PUT",
      url: "/patient/profile",
      headers: bearer(accessToken),
      payload: {
        displayName: "Paciente",
        city: "Bogotá",
        bio: "Bio social",
        goals: "Metas",
        connectionTypes: ["friendship", "romantic"],
        avatarUrl: "/avatars/default.svg",
        interestIds: [],
      },
    });

    const doctorLogin = await login(clinic.slug, doctor.user.email, doctor.password);
    const minor = await app.inject({
      method: "POST",
      url: "/doctor/invitations",
      headers: bearer(doctorLogin.json<{ accessToken: string }>().accessToken),
      payload: {
        patientName: "Menor",
        email: `menor-${randomUUID()}@demo.com`,
        birthDate: new Date().toISOString().slice(0, 10),
        allowedConnectionTypes: ["friendship"],
        restrictionsJson: {},
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    expect(invalidProfile.statusCode).toBe(400);
    expect(minor.statusCode).toBe(400);
  });

  it("responses no contienen hashes ni secretos", async () => {
    const clinic = await createClinic();
    const doctor = await createUser(clinic.id, "doctor");
    const response = await login(clinic.slug, doctor.user.email, doctor.password);
    const body = JSON.stringify(response.json());
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("tokenHash");
    expect(body).not.toContain(doctor.password);
  });
});
