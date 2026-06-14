import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reportInputSchema } from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { sendError } from "../http/errors";
import { parseBody, parseParams } from "../http/validation";
import { reportMessage } from "../services/report-service";
import { allowReport } from "../realtime/rate-limit";
import { doctorsRoom } from "../realtime/rooms";

const messageIdParams = z.object({ messageId: z.string().uuid() });

export async function reportRoutes(app: FastifyInstance) {
  app.post(
    "/patient/messages/:messageId/report",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(messageIdParams, request, reply);
      if (!params) return;
      const body = parseBody(reportInputSchema, request, reply);
      if (!body) return;

      if (!allowReport(auth.userId)) {
        return sendError(reply, 429, "RATE_LIMITED");
      }

      const outcome = await reportMessage(
        auth.clinicId,
        auth.userId,
        params.messageId,
        body.reason,
        body.details,
      );

      switch (outcome.kind) {
        case "rejected":
          if (outcome.reason === "not_found") return sendError(reply, 404, "NOT_FOUND");
          if (outcome.reason === "not_member") return sendError(reply, 403, "FORBIDDEN");
          if (outcome.reason === "own_message") return sendError(reply, 403, "FORBIDDEN");
          return sendError(reply, 400, "VALIDATION_ERROR");
        case "conflict":
          return sendError(reply, 409, "CONFLICT");
        case "existing":
          return {
            reportId: outcome.report.reportId,
            status: outcome.report.status,
            createdAt: outcome.report.createdAt,
            outcome: "existing" as const,
          };
        case "created": {
          // Emisión realtime DESPUÉS del commit; su fallo no revierte la DB.
          try {
            app.io?.to(doctorsRoom(auth.clinicId)).emit("report:created", {
              alertId: outcome.event.alertId,
              reportId: outcome.event.reportId,
              ruleCode: "R6",
              severity: "high",
              reportedUserId: outcome.event.reportedUserId,
              patientDisplayName: outcome.event.patientDisplayName,
              reasonCategory: outcome.event.reasonCategory,
              conversationId: outcome.event.conversationId,
              conversationType: outcome.event.conversationType,
              triggeredAt: outcome.event.triggeredAt,
            });
          } catch (error) {
            request.log.error({ err: error }, "Fallo al emitir report:created");
          }
          return {
            reportId: outcome.report.reportId,
            status: outcome.report.status,
            createdAt: outcome.report.createdAt,
            outcome: "created" as const,
          };
        }
      }
    },
  );
}
