import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  approveMatchInputSchema,
  pauseMatchInputSchema,
  type ConnectionType,
  type DoctorPendingMatch,
  type Interest,
} from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db, schema } from "../db";
import { ageFromBirthDate } from "../domain/dates";
import { sendError } from "../http/errors";
import { parseBody, parseParams } from "../http/validation";
import {
  approveMatch,
  MatchIntegrityError,
  pauseMatch,
} from "../matching/match-decision-service";
import { clampUnit } from "../matching/types";

const connectionIdParams = z.object({ connectionId: z.string().uuid() });

export async function doctorMatchRoutes(app: FastifyInstance) {
  app.get(
    "/doctor/matches/pending",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request) => {
      const auth = requireAuthContext(request);

      // LEFT JOIN para NO ocultar una conexión pendiente sin score (se trata
      // como inconsistencia controlada, no se filtra con INNER JOIN).
      const rows = await db
        .select({
          id: schema.connections.id,
          status: schema.connections.status,
          connectionType: schema.connections.connectionType,
          patientAId: schema.connections.patientAId,
          patientBId: schema.connections.patientBId,
          createdAt: schema.connections.createdAt,
          score: schema.matchScores.score,
          explanation: schema.matchScores.explanation,
        })
        .from(schema.connections)
        .leftJoin(
          schema.matchScores,
          and(
            eq(schema.connections.clinicId, schema.matchScores.clinicId),
            eq(schema.connections.matchScoreId, schema.matchScores.id),
          ),
        )
        .where(
          and(
            eq(schema.connections.clinicId, auth.clinicId),
            eq(schema.connections.status, "pending_approval"),
          ),
        )
        .orderBy(sql`${schema.connections.createdAt} desc`);

      const profileIds = [
        ...new Set(rows.flatMap((r) => [r.patientAId, r.patientBId])),
      ];

      const profiles = profileIds.length
        ? await db
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
                inArray(schema.patientProfiles.id, profileIds),
              ),
            )
        : [];
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      const interestRows = profileIds.length
        ? await db
            .select({
              profileId: schema.patientInterests.patientProfileId,
              id: schema.interests.id,
              name: schema.interests.name,
              slug: schema.interests.slug,
            })
            .from(schema.patientInterests)
            .innerJoin(
              schema.interests,
              and(
                eq(schema.patientInterests.clinicId, schema.interests.clinicId),
                eq(schema.patientInterests.interestId, schema.interests.id),
              ),
            )
            .where(
              and(
                eq(schema.patientInterests.clinicId, auth.clinicId),
                inArray(schema.patientInterests.patientProfileId, profileIds),
              ),
            )
        : [];
      const interestsByProfile = new Map<string, Interest[]>();
      for (const row of interestRows) {
        const list = interestsByProfile.get(row.profileId) ?? [];
        list.push({ id: row.id, name: row.name, slug: row.slug });
        interestsByProfile.set(row.profileId, list);
      }

      const matches: DoctorPendingMatch[] = rows.flatMap((r) => {
        const a = profileById.get(r.patientAId);
        const b = profileById.get(r.patientBId);
        if (!a || !b) return [];
        const aInterests = interestsByProfile.get(a.id) ?? [];
        const bInterests = interestsByProfile.get(b.id) ?? [];
        const bSlugs = new Set(bInterests.map((i) => i.slug));
        const sharedInterestSlugs = aInterests
          .map((i) => i.slug)
          .filter((slug) => bSlugs.has(slug));
        const hasScore = r.score !== null && r.score !== undefined;
        return [
          {
            connectionId: r.id,
            status: r.status,
            connectionType: r.connectionType as ConnectionType,
            compatibility: hasScore ? clampUnit(Number(r.score)) : null,
            explanation: r.explanation ?? null,
            hasScore,
            matchedAt: r.createdAt.toISOString(),
            patients: [
              {
                profileId: a.id,
                displayName: a.displayName,
                age: ageFromBirthDate(a.birthDate),
                city: a.city,
                avatarUrl: a.avatarUrl,
                interests: aInterests,
              },
              {
                profileId: b.id,
                displayName: b.displayName,
                age: ageFromBirthDate(b.birthDate),
                city: b.city,
                avatarUrl: b.avatarUrl,
                interests: bInterests,
              },
            ],
            sharedInterestSlugs,
          },
        ];
      });

      return { matches };
    },
  );

  app.post(
    "/doctor/matches/:connectionId/approve",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(connectionIdParams, request, reply);
      if (!params) return;
      const body = parseBody(approveMatchInputSchema, request, reply);
      if (!body) return;

      try {
        const outcome = await approveMatch(
          { clinicId: auth.clinicId, doctorUserId: auth.userId },
          params.connectionId,
          body.rationale,
        );
        switch (outcome.kind) {
          case "not_found":
            return sendError(reply, 404, "NOT_FOUND");
          case "conflict":
            return sendError(reply, 409, "CONFLICT");
          case "idempotent":
            return {
              connectionId: outcome.connectionId,
              status: outcome.status,
              conversationId: outcome.conversationId,
              conversationCreated: false,
            };
          case "approved":
            return {
              connectionId: outcome.connectionId,
              status: outcome.status,
              conversationId: outcome.conversationId,
              conversationCreated: outcome.conversationCreated,
            };
        }
      } catch (error) {
        if (error instanceof MatchIntegrityError) {
          request.log.error({ err: error }, "Integridad de conversación al aprobar");
          return sendError(reply, 409, "CONFLICT");
        }
        throw error;
      }
    },
  );

  app.post(
    "/doctor/matches/:connectionId/pause",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(connectionIdParams, request, reply);
      if (!params) return;
      const body = parseBody(pauseMatchInputSchema, request, reply);
      if (!body) return;

      const outcome = await pauseMatch(
        { clinicId: auth.clinicId, doctorUserId: auth.userId },
        params.connectionId,
        body.rationale,
      );
      switch (outcome.kind) {
        case "not_found":
          return sendError(reply, 404, "NOT_FOUND");
        case "conflict":
          return sendError(reply, 409, "CONFLICT");
        case "idempotent":
        case "paused":
          return { connectionId: outcome.connectionId, status: outcome.status };
      }
    },
  );
}
