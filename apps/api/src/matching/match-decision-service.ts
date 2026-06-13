import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";

export class MatchIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchIntegrityError";
  }
}

export interface DecisionContext {
  readonly clinicId: string;
  readonly doctorUserId: string;
}

export type ApproveOutcome =
  | { kind: "not_found" }
  | { kind: "conflict"; status: string }
  | { kind: "idempotent"; connectionId: string; status: "active"; conversationId: string | undefined }
  | {
      kind: "approved";
      connectionId: string;
      status: "active";
      conversationId: string;
      conversationCreated: boolean;
    };

export type PauseOutcome =
  | { kind: "not_found" }
  | { kind: "conflict"; status: string }
  | { kind: "idempotent"; connectionId: string; status: "paused" }
  | { kind: "paused"; connectionId: string; status: "paused" };

/**
 * Aprobación transaccional e idempotente: pending_approval -> active. Crea (de
 * forma idempotente) una conversación directa con exactamente los dos pacientes;
 * la doctora nunca es miembro. Solo registra match_decisions en la transición
 * real. Aborta con rollback ante miembros inconsistentes.
 */
export async function approveMatch(
  ctx: DecisionContext,
  connectionId: string,
  rationale: string | undefined,
): Promise<ApproveOutcome> {
  return db.transaction(async (tx) => {
    const [conn] = await tx
      .select({
        id: schema.connections.id,
        status: schema.connections.status,
        patientAId: schema.connections.patientAId,
        patientBId: schema.connections.patientBId,
      })
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.id, connectionId),
          eq(schema.connections.clinicId, ctx.clinicId),
        ),
      )
      .for("update")
      .limit(1);

    if (!conn) return { kind: "not_found" };

    if (conn.status === "active") {
      const [conv] = await tx
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.clinicId, ctx.clinicId),
            eq(schema.conversations.connectionId, connectionId),
            eq(schema.conversations.type, "direct"),
            eq(schema.conversations.status, "active"),
          ),
        )
        .limit(1);
      return { kind: "idempotent", connectionId, status: "active", conversationId: conv?.id };
    }

    if (conn.status !== "pending_approval") {
      return { kind: "conflict", status: conn.status };
    }

    // Usuarios pacientes de la conexión (mismo tenant garantizado por FK).
    const profiles = await tx
      .select({
        profileId: schema.patientProfiles.id,
        userId: schema.patientProfiles.userId,
      })
      .from(schema.patientProfiles)
      .where(
        and(
          eq(schema.patientProfiles.clinicId, ctx.clinicId),
          inArray(schema.patientProfiles.id, [conn.patientAId, conn.patientBId]),
        ),
      );
    if (profiles.length !== 2) {
      throw new MatchIntegrityError("No se resolvieron ambos pacientes de la conexión.");
    }
    const patientUserIds = profiles.map((p) => p.userId);

    // Evidencia de aprobación (solo en la transición real).
    await tx.insert(schema.matchDecisions).values({
      id: randomUUID(),
      clinicId: ctx.clinicId,
      connectionId,
      doctorUserId: ctx.doctorUserId,
      decision: "approve",
      rationale: rationale && rationale.length > 0 ? rationale : "Aprobado desde el panel.",
    });

    // Conversación directa idempotente (índice único parcial como respaldo).
    const insertedConv = await tx
      .insert(schema.conversations)
      .values({
        id: randomUUID(),
        clinicId: ctx.clinicId,
        connectionId,
        type: "direct",
        title: null,
        status: "active",
      })
      .onConflictDoNothing()
      .returning({ id: schema.conversations.id });

    let conversationId: string;
    let conversationCreated: boolean;
    const created = insertedConv[0];
    if (created) {
      conversationId = created.id;
      conversationCreated = true;
    } else {
      const [existingConv] = await tx
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.clinicId, ctx.clinicId),
            eq(schema.conversations.connectionId, connectionId),
            eq(schema.conversations.type, "direct"),
            eq(schema.conversations.status, "active"),
          ),
        )
        .limit(1);
      if (!existingConv) {
        throw new MatchIntegrityError("Conversación activa no encontrada tras conflicto.");
      }
      conversationId = existingConv.id;
      conversationCreated = false;
    }

    // Miembros idempotentes (exactamente los dos pacientes).
    for (const userId of patientUserIds) {
      await tx
        .insert(schema.conversationMembers)
        .values({
          id: randomUUID(),
          clinicId: ctx.clinicId,
          conversationId,
          userId,
          memberRole: "member",
        })
        .onConflictDoNothing();
    }

    // Verificación de integridad: exactamente 2 miembros, ambos pacientes de la
    // conexión, sin la doctora. Cualquier inconsistencia => rollback.
    const members = await tx
      .select({ userId: schema.conversationMembers.userId, role: schema.users.role })
      .from(schema.conversationMembers)
      .innerJoin(
        schema.users,
        and(
          eq(schema.conversationMembers.clinicId, schema.users.clinicId),
          eq(schema.conversationMembers.userId, schema.users.id),
        ),
      )
      .where(
        and(
          eq(schema.conversationMembers.clinicId, ctx.clinicId),
          eq(schema.conversationMembers.conversationId, conversationId),
        ),
      );

    const memberIds = new Set(members.map((m) => m.userId));
    if (members.length !== 2 || memberIds.size !== 2) {
      throw new MatchIntegrityError("La conversación no tiene exactamente dos miembros.");
    }
    if (!patientUserIds.every((id) => memberIds.has(id))) {
      throw new MatchIntegrityError("Los miembros no corresponden a los pacientes de la conexión.");
    }
    if (members.some((m) => m.role !== "patient")) {
      throw new MatchIntegrityError("Un miembro no es paciente (la doctora no puede ser miembro).");
    }

    await tx
      .update(schema.connections)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(schema.connections.id, connectionId),
          eq(schema.connections.clinicId, ctx.clinicId),
          eq(schema.connections.status, "pending_approval"),
        ),
      );

    return { kind: "approved", connectionId, status: "active", conversationId, conversationCreated };
  });
}

/**
 * Pausa transaccional e idempotente: SOLO pending_approval -> paused.
 * No crea conversación, no borra score ni swipes.
 */
export async function pauseMatch(
  ctx: DecisionContext,
  connectionId: string,
  rationale: string | undefined,
): Promise<PauseOutcome> {
  return db.transaction(async (tx) => {
    const [conn] = await tx
      .select({ id: schema.connections.id, status: schema.connections.status })
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.id, connectionId),
          eq(schema.connections.clinicId, ctx.clinicId),
        ),
      )
      .for("update")
      .limit(1);

    if (!conn) return { kind: "not_found" };
    if (conn.status === "paused") return { kind: "idempotent", connectionId, status: "paused" };
    if (conn.status !== "pending_approval") return { kind: "conflict", status: conn.status };

    await tx.insert(schema.matchDecisions).values({
      id: randomUUID(),
      clinicId: ctx.clinicId,
      connectionId,
      doctorUserId: ctx.doctorUserId,
      decision: "pause",
      rationale: rationale && rationale.length > 0 ? rationale : "Pausado desde el panel.",
    });

    await tx
      .update(schema.connections)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(schema.connections.id, connectionId),
          eq(schema.connections.clinicId, ctx.clinicId),
          eq(schema.connections.status, "pending_approval"),
        ),
      );

    return { kind: "paused", connectionId, status: "paused" };
  });
}
