import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { sendError } from "../http/errors";
import { parseParams } from "../http/validation";
import {
  getDashboardSummary,
  getPatientCards,
  getPatientOverview,
} from "../dashboard/dashboard-service";

const patientParams = z.object({ patientUserId: z.string().uuid() });

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    "/doctor/dashboard/summary",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request) => {
      const auth = requireAuthContext(request);
      return getDashboardSummary(auth.clinicId);
    },
  );

  app.get(
    "/doctor/dashboard/patients",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request) => {
      const auth = requireAuthContext(request);
      return getPatientCards(auth.clinicId);
    },
  );

  app.get(
    "/doctor/patients/:patientUserId/overview",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(patientParams, request, reply);
      if (!params) return;
      const overview = await getPatientOverview(auth.clinicId, params.patientUserId);
      if (!overview) return sendError(reply, 404, "NOT_FOUND");
      return overview;
    },
  );
}
