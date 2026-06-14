import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ConversationType, ReportReason } from "@mindmatch/shared";
import { db, schema } from "../db";
import type { Transaction } from "../matching/types";
import { loadConversationAccess } from "./conversation-access";

export interface ReportR6Event {
  alertId: string;
  reportId: string;
  reportedUserId: string;
  patientDisplayName: string;
  reasonCategory: ReportReason;
  conversationId: string;
  conversationType: ConversationType;
  triggeredAt: string;
}

export type ReportOutcome =
  | {
      kind: "created";
      report: { reportId: string; status: "open"; createdAt: string };
      event: ReportR6Event;
    }
  | {
      kind: "existing";
      report: { reportId: string; status: string; createdAt: string };
    }
  | { kind: "conflict" }
  | { kind: "rejected"; reason: "not_found" | "invalid" | "own_message" | "not_member" };

function normalizeDetails(details: string | undefined): string | null {
  if (details === undefined) return null;
  const trimmed = details.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Crea un reporte y, si es nuevo, una alerta R6 en la MISMA transacción.
 * Idempotente por (clinic, message, reporter). R6 apunta al autor del mensaje.
 */
export async function reportMessage(
  clinicId: string,
  reporterUserId: string,
  messageId: string,
  reason: ReportReason,
  rawDetails: string | undefined,
): Promise<ReportOutcome> {
  const details = normalizeDetails(rawDetails);

  return db.transaction(async (tx: Transaction) => {
    const [message] = await tx
      .select({
        senderUserId: schema.messages.senderUserId,
        messageType: schema.messages.messageType,
        deletedAt: schema.messages.deletedAt,
        conversationId: schema.messages.conversationId,
        conversationType: schema.conversations.type,
      })
      .from(schema.messages)
      .innerJoin(
        schema.conversations,
        and(
          eq(schema.messages.clinicId, schema.conversations.clinicId),
          eq(schema.messages.conversationId, schema.conversations.id),
        ),
      )
      .where(
        and(eq(schema.messages.clinicId, clinicId), eq(schema.messages.id, messageId)),
      )
      .limit(1);

    if (!message) return { kind: "rejected", reason: "not_found" };
    if (message.messageType === "system" || message.deletedAt !== null) {
      return { kind: "rejected", reason: "invalid" };
    }
    if (message.senderUserId === reporterUserId) {
      return { kind: "rejected", reason: "own_message" };
    }

    // Reportar funciona en active/paused/closed; exige membresía del reportante.
    const access = await loadConversationAccess(
      tx,
      clinicId,
      reporterUserId,
      message.conversationId,
      { allowedStatuses: ["active", "paused", "closed"], verifySubResources: false },
    );
    if (!access.ok) {
      return { kind: "rejected", reason: access.reason === "not_member" ? "not_member" : "invalid" };
    }

    // El autor reportado debe ser paciente del mismo tenant.
    const [reportedUser] = await tx
      .select({ role: schema.users.role, displayName: schema.patientProfiles.displayName })
      .from(schema.users)
      .leftJoin(
        schema.patientProfiles,
        and(
          eq(schema.patientProfiles.clinicId, schema.users.clinicId),
          eq(schema.patientProfiles.userId, schema.users.id),
        ),
      )
      .where(
        and(eq(schema.users.clinicId, clinicId), eq(schema.users.id, message.senderUserId)),
      )
      .limit(1);
    if (!reportedUser || reportedUser.role !== "patient") {
      return { kind: "rejected", reason: "invalid" };
    }

    const inserted = await tx
      .insert(schema.messageReports)
      .values({
        id: randomUUID(),
        clinicId,
        messageId,
        reporterUserId,
        reason,
        details,
        status: "open",
      })
      .onConflictDoNothing()
      .returning({
        id: schema.messageReports.id,
        status: schema.messageReports.status,
        createdAt: schema.messageReports.createdAt,
      });

    const newReport = inserted[0];
    if (!newReport) {
      // Ya existía: idempotente si reason+details coinciden, si no 409.
      const [existing] = await tx
        .select({
          id: schema.messageReports.id,
          status: schema.messageReports.status,
          createdAt: schema.messageReports.createdAt,
          reason: schema.messageReports.reason,
          details: schema.messageReports.details,
        })
        .from(schema.messageReports)
        .where(
          and(
            eq(schema.messageReports.clinicId, clinicId),
            eq(schema.messageReports.messageId, messageId),
            eq(schema.messageReports.reporterUserId, reporterUserId),
          ),
        )
        .limit(1);
      if (!existing) return { kind: "conflict" };
      const sameReason = existing.reason === reason;
      const sameDetails = (existing.details ?? null) === details;
      if (sameReason && sameDetails) {
        return {
          kind: "existing",
          report: {
            reportId: existing.id,
            status: existing.status,
            createdAt: existing.createdAt.toISOString(),
          },
        };
      }
      return { kind: "conflict" };
    }

    // Reporte nuevo => alerta R6 atómica.
    const triggeredAt = new Date();
    const alertId = randomUUID();
    await tx.insert(schema.alerts).values({
      id: alertId,
      clinicId,
      patientUserId: message.senderUserId,
      ruleCode: "R6",
      severity: "high",
      status: "open",
      inputsJson: {
        messageReportId: newReport.id,
        conversationId: message.conversationId,
        reportedMessageId: messageId,
        reporterUserId,
        reportedUserId: message.senderUserId,
        reason,
        triggeredAt: triggeredAt.toISOString(),
      },
      triggeredAt,
    });

    return {
      kind: "created",
      report: {
        reportId: newReport.id,
        status: "open",
        createdAt: newReport.createdAt.toISOString(),
      },
      event: {
        alertId,
        reportId: newReport.id,
        reportedUserId: message.senderUserId,
        patientDisplayName: reportedUser.displayName ?? "Paciente",
        reasonCategory: reason,
        conversationId: message.conversationId,
        conversationType: message.conversationType as ConversationType,
        triggeredAt: triggeredAt.toISOString(),
      },
    };
  });
}
