import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ConversationType } from "@mindmatch/shared";
import { schema } from "../db";
import type { Reader } from "../matching/types";

export type ConversationAccessFailure = "not_found" | "not_member" | "inactive";

export interface ConversationAccess {
  conversationId: string;
  type: ConversationType;
  status: "active" | "paused" | "closed";
  connectionId: string | null;
}

export type ConversationAccessResult =
  | { ok: true; access: ConversationAccess }
  | { ok: false; reason: ConversationAccessFailure };

interface Options {
  /** Estados de conversación permitidos. */
  allowedStatuses: ReadonlyArray<"active" | "paused" | "closed">;
  /** Validar conexión activa (directa) / grupo activo (grupal). */
  verifySubResources: boolean;
}

/**
 * Carga y valida el acceso de un paciente a una conversación. Fuente única para
 * join, historial, envío, typing (active + subrecursos) y reporte (active /
 * paused / closed sin subrecursos).
 */
export async function loadConversationAccess(
  ex: Reader,
  clinicId: string,
  userId: string,
  conversationId: string,
  options: Options,
): Promise<ConversationAccessResult> {
  const [conversation] = await ex
    .select({
      id: schema.conversations.id,
      type: schema.conversations.type,
      status: schema.conversations.status,
      connectionId: schema.conversations.connectionId,
    })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.clinicId, clinicId),
        eq(schema.conversations.id, conversationId),
      ),
    )
    .limit(1);

  if (!conversation) return { ok: false, reason: "not_found" };

  const [membership] = await ex
    .select({ id: schema.conversationMembers.id })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.clinicId, clinicId),
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId),
        isNull(schema.conversationMembers.leftAt),
      ),
    )
    .limit(1);

  if (!membership) return { ok: false, reason: "not_member" };

  if (!options.allowedStatuses.includes(conversation.status)) {
    return { ok: false, reason: "inactive" };
  }

  if (options.verifySubResources) {
    if (conversation.type === "direct") {
      if (!conversation.connectionId) return { ok: false, reason: "inactive" };
      const [connection] = await ex
        .select({ status: schema.connections.status })
        .from(schema.connections)
        .where(
          and(
            eq(schema.connections.clinicId, clinicId),
            eq(schema.connections.id, conversation.connectionId),
          ),
        )
        .limit(1);
      if (!connection || connection.status !== "active") {
        return { ok: false, reason: "inactive" };
      }
    } else {
      const [group] = await ex
        .select({ status: schema.supportGroups.status })
        .from(schema.supportGroups)
        .where(
          and(
            eq(schema.supportGroups.clinicId, clinicId),
            eq(schema.supportGroups.conversationId, conversationId),
          ),
        )
        .limit(1);
      if (!group || group.status !== "active") {
        return { ok: false, reason: "inactive" };
      }
    }
  }

  return {
    ok: true,
    access: {
      conversationId: conversation.id,
      type: conversation.type,
      status: conversation.status,
      connectionId: conversation.connectionId,
    },
  };
}

/** IDs de usuarios miembros activos de una conversación (para fan-out/validación). */
export async function activeMemberUserIds(
  ex: Reader,
  clinicId: string,
  conversationId: string,
): Promise<string[]> {
  const rows = await ex
    .select({ userId: schema.conversationMembers.userId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.clinicId, clinicId),
        eq(schema.conversationMembers.conversationId, conversationId),
        isNull(schema.conversationMembers.leftAt),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Carga displayName/avatar de un conjunto de usuarios paciente (sin N+1). */
export async function loadSenderProfiles(
  ex: Reader,
  clinicId: string,
  userIds: string[],
): Promise<Map<string, { displayName: string; avatarUrl: string | null }>> {
  const map = new Map<string, { displayName: string; avatarUrl: string | null }>();
  if (userIds.length === 0) return map;
  const rows = await ex
    .select({
      userId: schema.patientProfiles.userId,
      displayName: schema.patientProfiles.displayName,
      avatarUrl: schema.patientProfiles.avatarUrl,
    })
    .from(schema.patientProfiles)
    .where(
      and(
        eq(schema.patientProfiles.clinicId, clinicId),
        inArray(schema.patientProfiles.userId, userIds),
      ),
    );
  for (const row of rows) {
    map.set(row.userId, { displayName: row.displayName, avatarUrl: row.avatarUrl });
  }
  return map;
}
