import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db } from "../db";
import { sendError } from "../http/errors";
import { parseParams } from "../http/validation";
import {
  clampHistoryLimit,
  getHistory,
  listConversations,
  toPublicMessage,
} from "../services/message-service";
import { loadConversationAccess } from "../services/conversation-access";
import { decodeCursor, encodeCursor } from "../services/cursor";

const conversationIdParams = z.object({ conversationId: z.string().uuid() });

export async function conversationRoutes(app: FastifyInstance) {
  app.get(
    "/patient/conversations",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request) => {
      const auth = requireAuthContext(request);
      const conversations = await listConversations(db, auth.clinicId, auth.userId);
      return { conversations };
    },
  );

  app.get(
    "/patient/conversations/:conversationId/messages",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(conversationIdParams, request, reply);
      if (!params) return;

      const access = await loadConversationAccess(
        db,
        auth.clinicId,
        auth.userId,
        params.conversationId,
        { allowedStatuses: ["active"], verifySubResources: true },
      );
      // Cualquier fallo se trata como NOT_FOUND (no revela membresía/estado).
      if (!access.ok) return sendError(reply, 404, "NOT_FOUND");

      const query = request.query as { cursor?: unknown; limit?: unknown };
      const limit = clampHistoryLimit(query.limit);
      let cursor = null;
      if (typeof query.cursor === "string" && query.cursor.length > 0) {
        cursor = decodeCursor(query.cursor);
        if (!cursor) return sendError(reply, 400, "VALIDATION_ERROR");
      }

      const { messages, nextCursor } = await getHistory(
        db,
        auth.clinicId,
        params.conversationId,
        limit,
        cursor,
      );

      return {
        messages: messages.map((m) => toPublicMessage(m, auth.userId)),
        nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
      };
    },
  );
}
