import { randomUUID } from "node:crypto";
import type { ConnectionType } from "@mindmatch/shared";
import { db, schema } from "../db";
import { hashToken } from "../security/tokens";
import type { SeedAnchor } from "./anchor";
import { canonicalUuidPair } from "./canonical-pair";
import {
  DEMO_CLINIC_NAME,
  DEMO_CLINIC_SLUG,
  DEMO_CLINIC_TIMEZONE,
  DEMO_DOCTOR_EMAIL,
} from "./data/clinic";
import { CHECK_INS, CHECK_IN_DAYS } from "./data/check-ins";
import {
  CONNECTIONS,
  DIRECT_CONVERSATIONS,
  SUPPORT_GROUP,
} from "./data/conversations";
import { INTERESTS } from "./data/interests";
import { MATCHES, pairKey } from "./data/matches";
import { PATIENTS, type PatientKey } from "./data/patients";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const FRIENDSHIP: ConnectionType = "friendship";

export interface SeedMaps {
  readonly clinicId: string;
  readonly doctorUserId: string;
  readonly userIdByKey: Record<PatientKey, string>;
  readonly profileIdByKey: Record<PatientKey, string>;
  readonly invitationIdByKey: Record<PatientKey, string>;
  readonly interestIdBySlug: Record<string, string>;
  readonly matchScoreIdByPair: Record<string, string>;
  readonly connectionIdByPair: Record<string, string>;
}

/** Inserta TODO el dataset demo dentro de la transacción. */
export async function insertDemoTenant(
  tx: Transaction,
  anchor: SeedAnchor,
  passwordHash: string,
): Promise<SeedMaps> {
  // 1) Clínica
  const clinicId = randomUUID();
  await tx.insert(schema.clinics).values({
    id: clinicId,
    name: DEMO_CLINIC_NAME,
    slug: DEMO_CLINIC_SLUG,
    timezone: DEMO_CLINIC_TIMEZONE,
    status: "active",
  });
  await tx.insert(schema.demoClocks).values({
    clinicId,
    currentDate: anchor.today,
  });

  // 2) Doctora
  const doctorUserId = randomUUID();
  await tx.insert(schema.users).values({
    id: doctorUserId,
    clinicId,
    role: "doctor",
    email: DEMO_DOCTOR_EMAIL.toLowerCase(),
    passwordHash,
    status: "active",
  });

  // 3) Pacientes
  const userIdByKey = {} as Record<PatientKey, string>;
  for (const patient of PATIENTS) {
    const id = randomUUID();
    userIdByKey[patient.key] = id;
    await tx.insert(schema.users).values({
      id,
      clinicId,
      role: "patient",
      email: patient.email.toLowerCase(),
      passwordHash,
      status: "active",
    });
  }

  // 4) Catálogo de intereses
  const interestIdBySlug: Record<string, string> = {};
  for (const interest of INTERESTS) {
    const id = randomUUID();
    interestIdBySlug[interest.slug] = id;
    await tx.insert(schema.interests).values({
      id,
      clinicId,
      name: interest.name,
      slug: interest.slug,
      active: true,
    });
  }

  // 5) Invitaciones (todas aceptadas, históricas y coherentes)
  const invitationIdByKey = {} as Record<PatientKey, string>;
  const createdAt = anchor.timestamp(anchor.date(60), "09:00");
  const acceptedAt = anchor.timestamp(anchor.date(52), "12:00");
  const expiresAt = anchor.timestamp(anchor.date(46), "23:59");
  for (const patient of PATIENTS) {
    const id = randomUUID();
    invitationIdByKey[patient.key] = id;
    await tx.insert(schema.invitations).values({
      id,
      clinicId,
      createdByUserId: doctorUserId,
      email: patient.email.toLowerCase(),
      patientName: patient.displayName,
      birthDate: patient.birthDate,
      allowedConnectionTypes: patient.allowedConnectionTypes,
      restrictionsJson: { seed: true, maxConnections: 10 },
      // Hash ficticio, estable y exclusivo del fixture. Nunca se expone ni se
      // puede volver a aceptar (la invitación ya está `accepted`).
      tokenHash: hashToken(`mindmatch-demo|invitation|${patient.email.toLowerCase()}`),
      status: "accepted",
      expiresAt,
      acceptedAt,
      createdAt,
    });
  }

  // 6) Perfiles sociales
  const profileIdByKey = {} as Record<PatientKey, string>;
  const onboardingCompletedAt = anchor.timestamp(anchor.date(40), "10:00");
  for (const patient of PATIENTS) {
    const id = randomUUID();
    profileIdByKey[patient.key] = id;
    await tx.insert(schema.patientProfiles).values({
      id,
      clinicId,
      userId: userIdByKey[patient.key],
      sourceInvitationId: invitationIdByKey[patient.key],
      displayName: patient.displayName,
      birthDate: patient.birthDate,
      city: patient.city,
      bio: patient.bio,
      goals: patient.goals,
      connectionTypes: patient.connectionTypes,
      avatarUrl: null,
      onboardingCompletedAt,
    });
  }

  // 7) Intereses por perfil (peso descendente, 1..5)
  for (const patient of PATIENTS) {
    const profileId = profileIdByKey[patient.key];
    let position = 0;
    for (const slug of patient.interestSlugs) {
      const interestId = interestIdBySlug[slug];
      if (!interestId) {
        throw new Error(`Interés desconocido en seed: ${slug}`);
      }
      await tx.insert(schema.patientInterests).values({
        id: randomUUID(),
        clinicId,
        patientProfileId: profileId,
        interestId,
        weight: Math.max(1, 5 - position),
      });
      position += 1;
    }
  }

  // 8) Registro clínico mínimo
  for (const patient of PATIENTS) {
    await tx.insert(schema.patientClinical).values({
      id: randomUUID(),
      clinicId,
      patientUserId: userIdByKey[patient.key],
      assignedDoctorUserId: doctorUserId,
      consentStatus: "accepted",
      careStatus: "active",
    });
  }

  // 9) Preferencias de check-in
  for (const patient of PATIENTS) {
    await tx.insert(schema.checkInPreferences).values({
      id: randomUUID(),
      clinicId,
      patientUserId: userIdByKey[patient.key],
      enabled: true,
      enabledOn: anchor.today,
      localTime: patient.checkInLocalTime,
      timezone: DEMO_CLINIC_TIMEZONE,
    });
  }

  // 10) Check-ins: 14 días consecutivos terminando hoy (Bogotá)
  for (const patient of PATIENTS) {
    const series = CHECK_INS[patient.key];
    for (let j = 0; j < CHECK_IN_DAYS; j += 1) {
      const daysAgo = CHECK_IN_DAYS - 1 - j; // j=0 => hace 13 días; j=13 => hoy
      await tx.insert(schema.checkIns).values({
        id: randomUUID(),
        clinicId,
        patientUserId: userIdByKey[patient.key],
        checkInDate: anchor.date(daysAgo),
        mood: series.mood[j]!,
        sleep: series.sleep[j]!,
        connectedWithSomeone: series.connected[j]!,
      });
    }
  }

  // 11) Match scores (par canónico por UUID)
  const matchScoreIdByPair: Record<string, string> = {};
  for (const match of MATCHES) {
    const [patientAId, patientBId] = canonicalUuidPair(
      profileIdByKey[match.a],
      profileIdByKey[match.b],
    );
    const id = randomUUID();
    matchScoreIdByPair[pairKey(match.a, match.b)] = id;
    await tx.insert(schema.matchScores).values({
      id,
      clinicId,
      patientAId,
      patientBId,
      score: match.score,
      explanation: match.explanation,
      source: "demo",
      hardFiltersPassed: true,
    });
  }

  // 12) Conexiones (todas friendship; cada una con su match score)
  const connectionIdByPair: Record<string, string> = {};
  for (const connection of CONNECTIONS) {
    const key = pairKey(connection.a, connection.b);
    const matchScoreId = matchScoreIdByPair[key];
    if (!matchScoreId) {
      throw new Error(`Conexión sin match score: ${key}`);
    }
    const [patientAId, patientBId] = canonicalUuidPair(
      profileIdByKey[connection.a],
      profileIdByKey[connection.b],
    );
    const id = randomUUID();
    connectionIdByPair[key] = id;
    await tx.insert(schema.connections).values({
      id,
      clinicId,
      patientAId,
      patientBId,
      matchScoreId,
      connectionType: FRIENDSHIP,
      status: connection.status,
    });
  }

  // 13) Conversaciones directas + miembros + mensajes
  for (const conversation of DIRECT_CONVERSATIONS) {
    const key = pairKey(conversation.a, conversation.b);
    const connectionId = connectionIdByPair[key];
    if (!connectionId) {
      throw new Error(`Conversación directa sin conexión: ${key}`);
    }
    const conversationId = randomUUID();
    await tx.insert(schema.conversations).values({
      id: conversationId,
      clinicId,
      connectionId,
      type: "direct",
      title: null,
      status: "active",
    });
    for (const memberKey of [conversation.a, conversation.b]) {
      await tx.insert(schema.conversationMembers).values({
        id: randomUUID(),
        clinicId,
        conversationId,
        userId: userIdByKey[memberKey],
        memberRole: "member",
      });
    }
    const base = anchor.timestamp(anchor.date(1), "15:00");
    let index = 0;
    for (const message of conversation.messages) {
      await tx.insert(schema.messages).values({
        id: randomUUID(),
        clinicId,
        conversationId,
        senderUserId: userIdByKey[message.sender],
        messageType: "text",
        body: message.body,
        sentAt: new Date(base.getTime() + index * 3 * 60_000),
      });
      index += 1;
    }
  }

  // 14) Grupo de apoyo + conversación group + miembros + mensajes
  const groupConversationId = randomUUID();
  await tx.insert(schema.conversations).values({
    id: groupConversationId,
    clinicId,
    connectionId: null,
    type: "group",
    title: SUPPORT_GROUP.title,
    status: "active",
  });
  await tx.insert(schema.supportGroups).values({
    id: randomUUID(),
    clinicId,
    conversationId: groupConversationId,
    name: SUPPORT_GROUP.title,
    description: SUPPORT_GROUP.description,
    maxMembers: SUPPORT_GROUP.maxMembers,
    status: "active",
  });
  for (const member of SUPPORT_GROUP.members) {
    await tx.insert(schema.conversationMembers).values({
      id: randomUUID(),
      clinicId,
      conversationId: groupConversationId,
      userId: userIdByKey[member.key],
      memberRole: member.role,
    });
  }
  const groupBase = anchor.timestamp(anchor.date(3), "18:00");
  let groupIndex = 0;
  for (const message of SUPPORT_GROUP.messages) {
    await tx.insert(schema.messages).values({
      id: randomUUID(),
      clinicId,
      conversationId: groupConversationId,
      senderUserId: userIdByKey[message.sender],
      messageType: "text",
      body: message.body,
      sentAt: new Date(groupBase.getTime() + groupIndex * 7 * 60_000),
    });
    groupIndex += 1;
  }

  return {
    clinicId,
    doctorUserId,
    userIdByKey,
    profileIdByKey,
    invitationIdByKey,
    interestIdBySlug,
    matchScoreIdByPair,
    connectionIdByPair,
  };
}
