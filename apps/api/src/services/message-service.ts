import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type {
  MessageCursor,
  MessageType,
  PublicConversation,
  PublicMessage,
} from "@mindmatch/shared";
import { db, schema } from "../db";
import type { Reader, Transaction } from "../matching/types";
import { loadSenderProfiles } from "./conversation-access";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface MessageData {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  messageType: MessageType;
  body: string;
  sentAt: string;
  editedAt: string | null;
  clientMessageId: string | null;
}

export function toPublicMessage(
  data: MessageData,
  viewerUserId: string,
): PublicMessage {
  return { ...data, isMine: data.senderUserId === viewerUserId };
}

// ── Lista de conversaciones (metadata, sin último body) ──────────
export async function listConversations(
  ex: Reader,
  clinicId: string,
  userId: string,
): Promise<PublicConversation[]> {
  const memberRows = await ex
    .select({ conversationId: schema.conversationMembers.conversationId })
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.clinicId, clinicId),
        eq(schema.conversationMembers.userId, userId),
        isNull(schema.conversationMembers.leftAt),
      ),
    );
  const ids = memberRows.map((r) => r.conversationId);
  if (ids.length === 0) return [];

  const conversations = await ex
    .select({
      id: schema.conversations.id,
      type: schema.conversations.type,
      title: schema.conversations.title,
      status: schema.conversations.status,
    })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.clinicId, clinicId),
        inArray(schema.conversations.id, ids),
        eq(schema.conversations.status, "active"),
      ),
    );
  const activeIds = conversations.map((c) => c.id);
  if (activeIds.length === 0) return [];

  // Otro participante (directas) y conteo de miembros (todas), una consulta.
  const members = await ex
    .select({
      conversationId: schema.conversationMembers.conversationId,
      userId: schema.conversationMembers.userId,
      displayName: schema.patientProfiles.displayName,
      avatarUrl: schema.patientProfiles.avatarUrl,
    })
    .from(schema.conversationMembers)
    .leftJoin(
      schema.patientProfiles,
      and(
        eq(schema.conversationMembers.clinicId, schema.patientProfiles.clinicId),
        eq(schema.conversationMembers.userId, schema.patientProfiles.userId),
      ),
    )
    .where(
      and(
        eq(schema.conversationMembers.clinicId, clinicId),
        inArray(schema.conversationMembers.conversationId, activeIds),
        isNull(schema.conversationMembers.leftAt),
      ),
    );

  const memberCount = new Map<string, number>();
  const otherMember = new Map<string, { displayName: string | null; avatarUrl: string | null }>();
  for (const m of members) {
    memberCount.set(m.conversationId, (memberCount.get(m.conversationId) ?? 0) + 1);
    if (m.userId !== userId && !otherMember.has(m.conversationId)) {
      otherMember.set(m.conversationId, {
        displayName: m.displayName,
        avatarUrl: m.avatarUrl,
      });
    }
  }

  const activity = await ex
    .select({
      conversationId: schema.messages.conversationId,
      lastAt: sql<string | null>`max(${schema.messages.sentAt})`,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.clinicId, clinicId),
        inArray(schema.messages.conversationId, activeIds),
        isNull(schema.messages.deletedAt),
      ),
    )
    .groupBy(schema.messages.conversationId);
  const lastActivity = new Map(activity.map((a) => [a.conversationId, a.lastAt]));

  return conversations.map((c) => {
    const other = c.type === "direct" ? otherMember.get(c.id) ?? null : null;
    return {
      conversationId: c.id,
      type: c.type,
      title: c.title,
      status: c.status,
      otherDisplayName: other?.displayName ?? null,
      avatarUrl: other?.avatarUrl ?? null,
      memberCount: memberCount.get(c.id) ?? 0,
      lastActivityAt: iso(lastActivity.get(c.id) ?? null),
    };
  });
}

// ── Historial paginado (keyset) ──────────────────────────────────
const HISTORY_DEFAULT_LIMIT = 30;
const HISTORY_MAX_LIMIT = 100;

export function clampHistoryLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return HISTORY_DEFAULT_LIMIT;
  return Math.min(HISTORY_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export async function getHistory(
  ex: Reader,
  clinicId: string,
  conversationId: string,
  limit: number,
  cursor: MessageCursor | null,
): Promise<{ messages: MessageData[]; nextCursor: MessageCursor | null }> {
  const conditions: SQL[] = [
    eq(schema.messages.clinicId, clinicId),
    eq(schema.messages.conversationId, conversationId),
    isNull(schema.messages.deletedAt),
  ];
  if (cursor) {
    conditions.push(
      sql`(${schema.messages.sentAt}, ${schema.messages.id}) < (${cursor.sentAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await ex
    .select({
      id: schema.messages.id,
      conversationId: schema.messages.conversationId,
      senderUserId: schema.messages.senderUserId,
      messageType: schema.messages.messageType,
      body: schema.messages.body,
      sentAt: schema.messages.sentAt,
      editedAt: schema.messages.editedAt,
      clientMessageId: schema.messages.clientMessageId,
    })
    .from(schema.messages)
    .where(and(...conditions))
    .orderBy(desc(schema.messages.sentAt), desc(schema.messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const oldest = page[page.length - 1];
  const nextCursor: MessageCursor | null =
    hasMore && oldest
      ? { sentAt: oldest.sentAt.toISOString(), id: oldest.id }
      : null;

  const senderProfiles = await loadSenderProfiles(
    ex,
    clinicId,
    [...new Set(page.map((r) => r.senderUserId))],
  );

  // Orden ascendente para render.
  const ascending = [...page].reverse();
  const messages: MessageData[] = ascending.map((r) => {
    const profile = senderProfiles.get(r.senderUserId);
    return {
      id: r.id,
      conversationId: r.conversationId,
      senderUserId: r.senderUserId,
      senderDisplayName: profile?.displayName ?? "Usuario",
      senderAvatarUrl: profile?.avatarUrl ?? null,
      messageType: r.messageType,
      body: r.body,
      sentAt: r.sentAt.toISOString(),
      editedAt: iso(r.editedAt),
      clientMessageId: r.clientMessageId,
    };
  });

  return { messages, nextCursor };
}

// ── Envío idempotente ────────────────────────────────────────────
export type SendOutcome =
  | { status: "created" | "duplicate"; data: MessageData }
  | { status: "conflict" };

export async function sendMessage(
  clinicId: string,
  senderUserId: string,
  conversationId: string,
  clientMessageId: string,
  body: string,
): Promise<SendOutcome> {
  return db.transaction(async (tx: Transaction) => {
    const inserted = await tx
      .insert(schema.messages)
      .values({
        id: randomUUID(),
        clinicId,
        conversationId,
        senderUserId,
        clientMessageId,
        messageType: "text",
        body,
      })
      .onConflictDoNothing()
      .returning({
        id: schema.messages.id,
        sentAt: schema.messages.sentAt,
        editedAt: schema.messages.editedAt,
      });

    const profiles = await loadSenderProfiles(tx, clinicId, [senderUserId]);
    const profile = profiles.get(senderUserId);
    const senderDisplayName = profile?.displayName ?? "Usuario";
    const senderAvatarUrl = profile?.avatarUrl ?? null;

    const createdRow = inserted[0];
    if (createdRow) {
      return {
        status: "created",
        data: {
          id: createdRow.id,
          conversationId,
          senderUserId,
          senderDisplayName,
          senderAvatarUrl,
          messageType: "text",
          body,
          sentAt: createdRow.sentAt.toISOString(),
          editedAt: iso(createdRow.editedAt),
          clientMessageId,
        },
      };
    }

    // Conflicto de idempotencia: ya existe ese clientMessageId para el sender.
    const [existing] = await tx
      .select({
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        body: schema.messages.body,
        sentAt: schema.messages.sentAt,
        editedAt: schema.messages.editedAt,
      })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.clinicId, clinicId),
          eq(schema.messages.senderUserId, senderUserId),
          eq(schema.messages.clientMessageId, clientMessageId),
        ),
      )
      .limit(1);

    if (!existing) return { status: "conflict" };
    if (existing.conversationId !== conversationId || existing.body !== body) {
      return { status: "conflict" };
    }

    return {
      status: "duplicate",
      data: {
        id: existing.id,
        conversationId,
        senderUserId,
        senderDisplayName,
        senderAvatarUrl,
        messageType: "text",
        body: existing.body,
        sentAt: existing.sentAt.toISOString(),
        editedAt: iso(existing.editedAt),
        clientMessageId,
      },
    };
  });
}
