import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  ConnectionType,
  ConversationType,
  DoctorConnectionMetadata,
  DoctorReport,
  ReportReason,
} from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db, schema } from "../db";
import { sendError } from "../http/errors";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function doctorReportRoutes(app: FastifyInstance) {
  app.get(
    "/doctor/connections/metadata",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request) => {
      const auth = requireAuthContext(request);

      const connections = await db
        .select({
          id: schema.connections.id,
          connectionType: schema.connections.connectionType,
          status: schema.connections.status,
          patientAId: schema.connections.patientAId,
          patientBId: schema.connections.patientBId,
        })
        .from(schema.connections)
        .where(
          and(
            eq(schema.connections.clinicId, auth.clinicId),
            eq(schema.connections.status, "active"),
          ),
        );
      if (connections.length === 0) return { connections: [] };

      const conversations = await db
        .select({
          id: schema.conversations.id,
          connectionId: schema.conversations.connectionId,
        })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.clinicId, auth.clinicId),
            eq(schema.conversations.type, "direct"),
            inArray(
              schema.conversations.connectionId,
              connections.map((c) => c.id),
            ),
          ),
        );
      const conversationByConnection = new Map(
        conversations.flatMap((c) => (c.connectionId ? [[c.connectionId, c.id]] : [])),
      );
      const conversationIds = conversations.map((c) => c.id);

      const profileIds = [
        ...new Set(connections.flatMap((c) => [c.patientAId, c.patientBId])),
      ];
      const profiles = await db
        .select({
          id: schema.patientProfiles.id,
          displayName: schema.patientProfiles.displayName,
          avatarUrl: schema.patientProfiles.avatarUrl,
        })
        .from(schema.patientProfiles)
        .where(
          and(
            eq(schema.patientProfiles.clinicId, auth.clinicId),
            inArray(schema.patientProfiles.id, profileIds),
          ),
        );
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      const messageAgg = conversationIds.length
        ? await db
            .select({
              conversationId: schema.messages.conversationId,
              count: sql<number>`count(*)::int`,
              lastAt: sql<string | null>`max(${schema.messages.sentAt})`,
            })
            .from(schema.messages)
            .where(
              and(
                eq(schema.messages.clinicId, auth.clinicId),
                inArray(schema.messages.conversationId, conversationIds),
              ),
            )
            .groupBy(schema.messages.conversationId)
        : [];
      const msgByConversation = new Map(messageAgg.map((m) => [m.conversationId, m]));

      const reportAgg = conversationIds.length
        ? await db
            .select({
              conversationId: schema.messages.conversationId,
              count: sql<number>`count(*)::int`,
              lastAt: sql<string | null>`max(${schema.messageReports.createdAt})`,
            })
            .from(schema.messageReports)
            .innerJoin(
              schema.messages,
              and(
                eq(schema.messageReports.clinicId, schema.messages.clinicId),
                eq(schema.messageReports.messageId, schema.messages.id),
              ),
            )
            .where(
              and(
                eq(schema.messageReports.clinicId, auth.clinicId),
                eq(schema.messageReports.status, "open"),
                inArray(schema.messages.conversationId, conversationIds),
              ),
            )
            .groupBy(schema.messages.conversationId)
        : [];
      const reportByConversation = new Map(reportAgg.map((r) => [r.conversationId, r]));

      const result: DoctorConnectionMetadata[] = connections.flatMap((conn) => {
        const a = profileById.get(conn.patientAId);
        const b = profileById.get(conn.patientBId);
        if (!a || !b) return [];
        const conversationId = conversationByConnection.get(conn.id);
        const msg = conversationId ? msgByConversation.get(conversationId) : undefined;
        const rep = conversationId ? reportByConversation.get(conversationId) : undefined;
        return [
          {
            connectionId: conn.id,
            connectionType: conn.connectionType as ConnectionType,
            status: conn.status,
            patients: [
              { profileId: a.id, displayName: a.displayName, avatarUrl: a.avatarUrl },
              { profileId: b.id, displayName: b.displayName, avatarUrl: b.avatarUrl },
            ],
            messageCount: msg?.count ?? 0,
            lastActivityAt: iso(msg?.lastAt ?? null),
            openReportsCount: rep?.count ?? 0,
            lastReportAt: iso(rep?.lastAt ?? null),
          },
        ];
      });

      return { connections: result };
    },
  );

  app.get(
    "/doctor/reports/open",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);

      const reports = await db
        .select({
          reportId: schema.messageReports.id,
          reason: schema.messageReports.reason,
          details: schema.messageReports.details,
          status: schema.messageReports.status,
          createdAt: schema.messageReports.createdAt,
          reporterUserId: schema.messageReports.reporterUserId,
          reportedUserId: schema.messages.senderUserId,
          conversationId: schema.messages.conversationId,
          conversationType: schema.conversations.type,
          groupTitle: schema.conversations.title,
        })
        .from(schema.messageReports)
        .innerJoin(
          schema.messages,
          and(
            eq(schema.messageReports.clinicId, schema.messages.clinicId),
            eq(schema.messageReports.messageId, schema.messages.id),
          ),
        )
        .innerJoin(
          schema.conversations,
          and(
            eq(schema.messages.clinicId, schema.conversations.clinicId),
            eq(schema.messages.conversationId, schema.conversations.id),
          ),
        )
        .where(
          and(
            eq(schema.messageReports.clinicId, auth.clinicId),
            eq(schema.messageReports.status, "open"),
          ),
        )
        .orderBy(sql`${schema.messageReports.createdAt} desc`);

      if (reports.length === 0) return { reports: [] };

      const userIds = [
        ...new Set(reports.flatMap((r) => [r.reporterUserId, r.reportedUserId])),
      ];
      const profiles = await db
        .select({
          userId: schema.patientProfiles.userId,
          displayName: schema.patientProfiles.displayName,
        })
        .from(schema.patientProfiles)
        .where(
          and(
            eq(schema.patientProfiles.clinicId, auth.clinicId),
            inArray(schema.patientProfiles.userId, userIds),
          ),
        );
      const nameByUser = new Map(profiles.map((p) => [p.userId, p.displayName]));

      // Alertas R6 mapeadas por messageReportId (relación vía inputs_json).
      const alerts = await db
        .select({
          alertId: schema.alerts.id,
          severity: schema.alerts.severity,
          triggeredAt: schema.alerts.triggeredAt,
          reportRef: sql<string | null>`${schema.alerts.inputsJson} ->> 'messageReportId'`,
        })
        .from(schema.alerts)
        .where(
          and(
            eq(schema.alerts.clinicId, auth.clinicId),
            eq(schema.alerts.ruleCode, "R6"),
          ),
        );
      const alertsByReport = new Map<string, typeof alerts>();
      for (const alert of alerts) {
        if (!alert.reportRef) continue;
        const list = alertsByReport.get(alert.reportRef) ?? [];
        list.push(alert);
        alertsByReport.set(alert.reportRef, list);
      }

      // Consistencia: exactamente una alerta R6 por reporte abierto.
      const inconsistent = reports.filter(
        (r) => (alertsByReport.get(r.reportId)?.length ?? 0) !== 1,
      );
      if (inconsistent.length > 0) {
        request.log.error(
          { reportIds: inconsistent.map((r) => r.reportId) },
          "Inconsistencia reporte-alerta R6",
        );
        return sendError(reply, 409, "CONFLICT");
      }

      const result: DoctorReport[] = reports.map((r) => {
        const alert = alertsByReport.get(r.reportId)![0]!;
        return {
          reportId: r.reportId,
          reason: r.reason as ReportReason,
          hasDetails: r.details !== null && r.details.length > 0,
          reporter: {
            userId: r.reporterUserId,
            displayName: nameByUser.get(r.reporterUserId) ?? "Paciente",
          },
          reportedPatient: {
            userId: r.reportedUserId,
            displayName: nameByUser.get(r.reportedUserId) ?? "Paciente",
          },
          conversationId: r.conversationId,
          conversationType: r.conversationType as ConversationType,
          groupTitle: r.conversationType === "group" ? r.groupTitle : null,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          alertId: alert.alertId,
          severity: "high",
          triggeredAt: alert.triggeredAt.toISOString(),
        };
      });

      return { reports: result };
    },
  );
}
