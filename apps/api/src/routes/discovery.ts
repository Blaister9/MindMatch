import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  swipeInputSchema,
  type ConnectionStatus,
  type ConnectionType,
  type PatientConnection,
} from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db, schema } from "../db";
import { ageFromBirthDate } from "../domain/dates";
import { sendError } from "../http/errors";
import { parseBody } from "../http/validation";
import { getCandidates, resolveSelfProfile } from "../matching/discovery-service";
import { getMatchingService } from "../matching/providers";
import { recordSwipe } from "../matching/swipe-service";

const PATIENT_CONNECTION_STATES = [
  "pending_approval",
  "active",
  "paused",
  "rejected",
  "closed",
] as const;

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

export async function discoveryRoutes(app: FastifyInstance) {
  app.get(
    "/patient/discovery/candidates",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const self = await resolveSelfProfile(db, auth.clinicId, auth.userId);
      if (!self) return sendError(reply, 404, "NOT_FOUND");

      const limit = clampLimit((request.query as { limit?: unknown }).limit);
      const provider = getMatchingService();
      const candidates = await getCandidates(
        db,
        { clinicId: auth.clinicId, selfProfileId: self.id },
        self,
        provider,
        limit,
      );
      return { candidates };
    },
  );

  app.post(
    "/patient/swipes",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const body = parseBody(swipeInputSchema, request, reply);
      if (!body) return;

      const self = await resolveSelfProfile(db, auth.clinicId, auth.userId);
      if (!self) return sendError(reply, 404, "NOT_FOUND");

      const outcome = await recordSwipe(
        { clinicId: auth.clinicId, selfProfileId: self.id },
        self.connectionTypes,
        body.targetProfileId,
        body.decision,
        getMatchingService(),
      );

      switch (outcome.kind) {
        case "rejected":
          if (outcome.reason === "no_type" || outcome.reason === "no_score") {
            return sendError(reply, 409, "CONFLICT");
          }
          return sendError(reply, 404, "NOT_FOUND");
        case "conflict":
          return sendError(reply, 409, "CONFLICT");
        case "pass":
          return { decision: "pass" as const, status: "recorded" as const };
        case "liked":
          return { decision: "like" as const, status: "liked" as const };
        case "matched":
          return {
            decision: "like" as const,
            status: "matched" as const,
            connection: {
              status: outcome.connectionStatus,
              connectionType: outcome.connectionType,
            },
          };
        case "already_connected":
          return {
            decision: "like" as const,
            status: "already_connected" as const,
            connection: {
              status: outcome.connectionStatus as ConnectionStatus,
              connectionType: outcome.connectionType,
            },
          };
      }
    },
  );

  app.get(
    "/patient/connections",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const self = await resolveSelfProfile(db, auth.clinicId, auth.userId);
      if (!self) return sendError(reply, 404, "NOT_FOUND");

      const rows = await db
        .select({
          id: schema.connections.id,
          status: schema.connections.status,
          connectionType: schema.connections.connectionType,
          patientAId: schema.connections.patientAId,
          patientBId: schema.connections.patientBId,
          createdAt: schema.connections.createdAt,
        })
        .from(schema.connections)
        .where(
          and(
            eq(schema.connections.clinicId, auth.clinicId),
            or(
              eq(schema.connections.patientAId, self.id),
              eq(schema.connections.patientBId, self.id),
            ),
            inArray(schema.connections.status, [...PATIENT_CONNECTION_STATES]),
          ),
        )
        .orderBy(sql`${schema.connections.createdAt} desc`);

      const otherIds = rows.map((r) =>
        r.patientAId === self.id ? r.patientBId : r.patientAId,
      );
      const others =
        otherIds.length === 0
          ? []
          : await db
              .select({
                id: schema.patientProfiles.id,
                displayName: schema.patientProfiles.displayName,
                city: schema.patientProfiles.city,
                avatarUrl: schema.patientProfiles.avatarUrl,
                birthDate: schema.patientProfiles.birthDate,
              })
              .from(schema.patientProfiles)
              .where(
                and(
                  eq(schema.patientProfiles.clinicId, auth.clinicId),
                  inArray(schema.patientProfiles.id, otherIds),
                ),
              );
      const otherById = new Map(others.map((o) => [o.id, o]));

      const connections: PatientConnection[] = rows.flatMap((r) => {
        const otherId = r.patientAId === self.id ? r.patientBId : r.patientAId;
        const other = otherById.get(otherId);
        if (!other) return [];
        return [
          {
            connectionId: r.id,
            status: r.status,
            connectionType: r.connectionType as ConnectionType,
            createdAt: r.createdAt.toISOString(),
            other: {
              profileId: other.id,
              displayName: other.displayName,
              city: other.city,
              age: ageFromBirthDate(other.birthDate),
              avatarUrl: other.avatarUrl,
            },
          },
        ];
      });

      return { connections };
    },
  );
}
