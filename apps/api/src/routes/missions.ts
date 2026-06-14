import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { createMissionInputSchema } from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { sendError } from "../http/errors";
import { parseBody, parseParams } from "../http/validation";
import {
  cancelDoctorMission,
  completePatientMission,
  createMission,
  listMissionsForPatient,
} from "../missions/mission-service";

const patientParams = z.object({ patientUserId: z.string().uuid() });
const missionParams = z.object({ missionId: z.string().uuid() });

export async function missionRoutes(app: FastifyInstance) {
  // ── Doctora ──
  app.get(
    "/doctor/patients/:patientUserId/missions",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(patientParams, request, reply);
      if (!params) return;
      return { missions: await listMissionsForPatient(auth.clinicId, params.patientUserId) };
    },
  );

  app.post(
    "/doctor/patients/:patientUserId/missions",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(patientParams, request, reply);
      if (!params) return;
      const body = parseBody(createMissionInputSchema, request, reply);
      if (!body) return;
      const outcome = await createMission(
        auth.clinicId,
        auth.userId,
        params.patientUserId,
        body,
      );
      if (outcome.kind === "patient_not_found") return sendError(reply, 404, "NOT_FOUND");
      if (outcome.kind === "invalid_due_date") return sendError(reply, 400, "VALIDATION_ERROR");
      return { mission: outcome.mission };
    },
  );

  app.post(
    "/doctor/missions/:missionId/cancel",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(missionParams, request, reply);
      if (!params) return;
      const outcome = await cancelDoctorMission(auth.clinicId, params.missionId);
      if (outcome.kind === "not_found") return sendError(reply, 404, "NOT_FOUND");
      if (outcome.kind === "conflict") return sendError(reply, 409, "CONFLICT");
      return { id: params.missionId, status: outcome.status };
    },
  );

  // ── Paciente ──
  app.get(
    "/patient/missions",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request) => {
      const auth = requireAuthContext(request);
      return { missions: await listMissionsForPatient(auth.clinicId, auth.userId) };
    },
  );

  app.post(
    "/patient/missions/:missionId/complete",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(missionParams, request, reply);
      if (!params) return;
      const outcome = await completePatientMission(auth.clinicId, auth.userId, params.missionId);
      if (outcome.kind === "not_found") return sendError(reply, 404, "NOT_FOUND");
      if (outcome.kind === "conflict") return sendError(reply, 409, "CONFLICT");
      return { id: params.missionId, status: outcome.status };
    },
  );
}
