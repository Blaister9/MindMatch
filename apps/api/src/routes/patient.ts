import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  updatePatientProfileSchema,
  type ConnectionType,
} from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { db, schema } from "../db";
import { sendError } from "../http/errors";
import {
  serializeInterest,
  serializePatientProfile,
} from "../http/serializers";
import { parseBody } from "../http/validation";

function isSubset<T extends string>(requested: T[], allowed: T[]) {
  return requested.every((item) => allowed.includes(item));
}

async function loadOwnProfile(clinicId: string, userId: string) {
  const [profile] = await db
    .select({
      id: schema.patientProfiles.id,
      clinicId: schema.patientProfiles.clinicId,
      userId: schema.patientProfiles.userId,
      sourceInvitationId: schema.patientProfiles.sourceInvitationId,
      displayName: schema.patientProfiles.displayName,
      birthDate: schema.patientProfiles.birthDate,
      city: schema.patientProfiles.city,
      bio: schema.patientProfiles.bio,
      goals: schema.patientProfiles.goals,
      connectionTypes: schema.patientProfiles.connectionTypes,
      avatarUrl: schema.patientProfiles.avatarUrl,
      onboardingCompletedAt: schema.patientProfiles.onboardingCompletedAt,
      allowedConnectionTypes: schema.invitations.allowedConnectionTypes,
    })
    .from(schema.patientProfiles)
    .innerJoin(
      schema.invitations,
      eq(schema.patientProfiles.sourceInvitationId, schema.invitations.id),
    )
    .where(
      and(
        eq(schema.patientProfiles.clinicId, clinicId),
        eq(schema.patientProfiles.userId, userId),
        eq(schema.invitations.clinicId, clinicId),
      ),
    )
    .limit(1);

  if (!profile) return undefined;

  const interestRows = await db
    .select({
      id: schema.interests.id,
      name: schema.interests.name,
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
        eq(schema.patientInterests.clinicId, clinicId),
        eq(schema.patientInterests.patientProfileId, profile.id),
      ),
    );

  return serializePatientProfile({
    ...profile,
    connectionTypes: profile.connectionTypes as ConnectionType[],
    allowedConnectionTypes: profile.allowedConnectionTypes as ConnectionType[],
    interests: interestRows,
  });
}

export async function patientRoutes(app: FastifyInstance) {
  app.get(
    "/patient/interests",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request) => {
      const auth = requireAuthContext(request);
      const interests = await db
        .select({
          id: schema.interests.id,
          name: schema.interests.name,
          slug: schema.interests.slug,
        })
        .from(schema.interests)
        .where(
          and(
            eq(schema.interests.clinicId, auth.clinicId),
            eq(schema.interests.active, true),
          ),
        );

      return { interests: interests.map(serializeInterest) };
    },
  );

  app.get(
    "/patient/profile",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const profile = await loadOwnProfile(auth.clinicId, auth.userId);
      if (!profile) {
        return sendError(reply, 404, "NOT_FOUND");
      }
      return { profile };
    },
  );

  app.put(
    "/patient/profile",
    { preHandler: [authenticate, requireRole("patient")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const body = parseBody(updatePatientProfileSchema, request, reply);
      if (!body) return;

      const [profile] = await db
        .select({
          id: schema.patientProfiles.id,
          sourceInvitationId: schema.patientProfiles.sourceInvitationId,
          allowedConnectionTypes: schema.invitations.allowedConnectionTypes,
        })
        .from(schema.patientProfiles)
        .innerJoin(
          schema.invitations,
          eq(schema.patientProfiles.sourceInvitationId, schema.invitations.id),
        )
        .where(
          and(
            eq(schema.patientProfiles.clinicId, auth.clinicId),
            eq(schema.patientProfiles.userId, auth.userId),
            eq(schema.invitations.clinicId, auth.clinicId),
          ),
        )
        .limit(1);

      if (!profile) {
        return sendError(reply, 404, "NOT_FOUND");
      }

      const allowed = profile.allowedConnectionTypes as ConnectionType[];
      if (!isSubset(body.connectionTypes, allowed)) {
        return sendError(reply, 400, "VALIDATION_ERROR");
      }

      const activeInterests =
        body.interestIds.length === 0
          ? []
          : await db
              .select({ id: schema.interests.id })
              .from(schema.interests)
              .where(
                and(
                  eq(schema.interests.clinicId, auth.clinicId),
                  eq(schema.interests.active, true),
                  inArray(schema.interests.id, body.interestIds),
                ),
              );

      if (activeInterests.length !== body.interestIds.length) {
        return sendError(reply, 400, "VALIDATION_ERROR");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.patientProfiles)
          .set({
            displayName: body.displayName,
            city: body.city,
            bio: body.bio,
            goals: body.goals,
            connectionTypes: body.connectionTypes,
            avatarUrl: body.avatarUrl,
            onboardingCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.patientProfiles.clinicId, auth.clinicId),
              eq(schema.patientProfiles.userId, auth.userId),
            ),
          );

        await tx
          .delete(schema.patientInterests)
          .where(
            and(
              eq(schema.patientInterests.clinicId, auth.clinicId),
              eq(schema.patientInterests.patientProfileId, profile.id),
            ),
          );

        if (body.interestIds.length > 0) {
          await tx.insert(schema.patientInterests).values(
            body.interestIds.map((interestId) => ({
              clinicId: auth.clinicId,
              patientProfileId: profile.id,
              interestId,
              weight: 1,
            })),
          );
        }
      });

      const updated = await loadOwnProfile(auth.clinicId, auth.userId);
      if (!updated) return sendError(reply, 404, "NOT_FOUND");
      return { profile: updated };
    },
  );
}
