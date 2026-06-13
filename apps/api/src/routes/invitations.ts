import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationTokenSchema,
  isAdultOnDate,
  type ConnectionType,
} from "@mindmatch/shared";
import { authenticate, requireAuthContext, requireRole } from "../auth/guards";
import { setRefreshCookie } from "../auth/cookies";
import {
  createRefreshToken,
  signAccessToken,
  toAuthUser,
} from "./auth";
import { db, schema } from "../db";
import { env } from "../env";
import { sendError } from "../http/errors";
import {
  serializeDoctorInvitation,
  serializePublicInvitation,
} from "../http/serializers";
import { parseBody, parseParams } from "../http/validation";
import { hashPassword } from "../security/passwords";
import { createOpaqueToken, hashToken } from "../security/tokens";
import { z } from "zod";

const invitationIdParamsSchema = z.object({ id: z.string().uuid() });

function effectiveStatus(row: {
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: Date | string;
}) {
  if (row.status === "pending" && new Date(row.expiresAt) <= new Date()) {
    return "expired" as const;
  }
  return row.status;
}

function inviteUrl(token: string) {
  return `${env.PATIENT_APP_URL}/invitacion#token=${encodeURIComponent(token)}`;
}

function isSubset<T extends string>(requested: T[], allowed: T[]) {
  return requested.every((item) => allowed.includes(item));
}

export async function invitationRoutes(app: FastifyInstance) {
  app.post(
    "/doctor/invitations",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const body = parseBody(createInvitationSchema, request, reply);
      if (!body) return;

      if (!isAdultOnDate(body.birthDate)) {
        return sendError(reply, 400, "VALIDATION_ERROR");
      }

      const token = createOpaqueToken();
      const [created] = await db
        .insert(schema.invitations)
        .values({
          id: randomUUID(),
          clinicId: auth.clinicId,
          createdByUserId: auth.userId,
          email: body.email.toLowerCase(),
          patientName: body.patientName,
          birthDate: body.birthDate,
          allowedConnectionTypes: body.allowedConnectionTypes,
          restrictionsJson: body.restrictionsJson,
          tokenHash: hashToken(token),
          status: "pending",
          expiresAt: new Date(body.expiresAt),
        })
        .returning();

      if (!created) {
        return sendError(reply, 400, "VALIDATION_ERROR");
      }

      return {
        invitation: serializeDoctorInvitation({
          ...created,
          restrictionsJson: created.restrictionsJson as Record<string, unknown>,
          allowedConnectionTypes:
            created.allowedConnectionTypes as ConnectionType[],
        }),
        inviteUrl: inviteUrl(token),
      };
    },
  );

  app.get(
    "/doctor/invitations",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request) => {
      const auth = requireAuthContext(request);
      const rows = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.clinicId, auth.clinicId))
        .orderBy(desc(schema.invitations.createdAt));

      return {
        invitations: rows.map((row) =>
          serializeDoctorInvitation({
            ...row,
            status: effectiveStatus(row),
            restrictionsJson: row.restrictionsJson as Record<string, unknown>,
            allowedConnectionTypes: row.allowedConnectionTypes as ConnectionType[],
          }),
        ),
      };
    },
  );

  app.post(
    "/doctor/invitations/:id/revoke",
    { preHandler: [authenticate, requireRole("doctor")] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const params = parseParams(invitationIdParamsSchema, request, reply);
      if (!params) return;

      const revoked = await db
        .update(schema.invitations)
        .set({ status: "revoked" })
        .where(
          and(
            eq(schema.invitations.id, params.id),
            eq(schema.invitations.clinicId, auth.clinicId),
            eq(schema.invitations.status, "pending"),
            gt(schema.invitations.expiresAt, new Date()),
          ),
        )
        .returning();

      if (revoked.length !== 1) {
        return sendError(reply, 404, "NOT_FOUND");
      }
      const revokedInvitation = revoked[0];
      if (!revokedInvitation) {
        return sendError(reply, 404, "NOT_FOUND");
      }

      return {
        invitation: serializeDoctorInvitation({
          ...revokedInvitation,
          restrictionsJson: revokedInvitation.restrictionsJson as Record<
            string,
            unknown
          >,
          allowedConnectionTypes:
            revokedInvitation.allowedConnectionTypes as ConnectionType[],
        }),
      };
    },
  );

  app.post(
    "/invitations/validate",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = parseBody(invitationTokenSchema, request, reply);
      if (!body) return;

      const [invitation] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.tokenHash, hashToken(body.token)))
        .limit(1);

      if (!invitation) {
        return sendError(reply, 404, "INVALID_INVITATION");
      }

      if (invitation.status === "revoked") {
        return sendError(reply, 410, "INVITATION_REVOKED");
      }
      if (invitation.status === "accepted") {
        return sendError(reply, 410, "INVITATION_USED");
      }
      if (invitation.status === "expired" || invitation.expiresAt <= new Date()) {
        return sendError(reply, 410, "INVITATION_EXPIRED");
      }

      return {
        invitation: serializePublicInvitation({
          ...invitation,
          allowedConnectionTypes:
            invitation.allowedConnectionTypes as ConnectionType[],
        }),
      };
    },
  );

  app.post(
    "/invitations/accept",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = parseBody(acceptInvitationSchema, request, reply);
      if (!body) return;

      const now = new Date();
      const passwordHash = await hashPassword(body.password);
      const result = await db.transaction(async (tx) => {
        const [invitation] = await tx
          .update(schema.invitations)
          .set({ status: "accepted", acceptedAt: now })
          .where(
            and(
              eq(schema.invitations.tokenHash, hashToken(body.token)),
              eq(schema.invitations.status, "pending"),
              gt(schema.invitations.expiresAt, now),
            ),
          )
          .returning();

        if (!invitation) {
          return undefined;
        }

        const [existingUser] = await tx
          .select()
          .from(schema.users)
          .where(
            and(
              eq(schema.users.clinicId, invitation.clinicId),
              sql`lower(${schema.users.email}) = ${invitation.email.toLowerCase()}`,
            ),
          )
          .limit(1);

        let user:
          | {
              id: string;
              clinicId: string;
              role: "doctor" | "patient";
              status: "active";
              email: string;
            }
          | undefined;

        if (existingUser) {
          if (existingUser.role !== "patient") return undefined;
          const [updatedUser] = await tx
            .update(schema.users)
            .set({
              passwordHash,
              status: "active",
              updatedAt: now,
            })
            .where(
              and(
                eq(schema.users.id, existingUser.id),
                eq(schema.users.clinicId, invitation.clinicId),
              ),
            )
            .returning({
              id: schema.users.id,
              clinicId: schema.users.clinicId,
              role: schema.users.role,
              status: schema.users.status,
              email: schema.users.email,
            });
          if (updatedUser?.status === "active") {
            user = {
              id: updatedUser.id,
              clinicId: updatedUser.clinicId,
              role: updatedUser.role,
              status: "active",
              email: updatedUser.email,
            };
          }
        } else {
          const [createdUser] = await tx
            .insert(schema.users)
            .values({
              id: randomUUID(),
              clinicId: invitation.clinicId,
              role: "patient",
              email: invitation.email,
              passwordHash,
              status: "active",
            })
            .returning({
              id: schema.users.id,
              clinicId: schema.users.clinicId,
              role: schema.users.role,
              status: schema.users.status,
              email: schema.users.email,
            });
          if (createdUser?.status === "active") {
            user = {
              id: createdUser.id,
              clinicId: createdUser.clinicId,
              role: createdUser.role,
              status: "active",
              email: createdUser.email,
            };
          }
        }

        if (!user) return undefined;

        const [profile] = await tx
          .insert(schema.patientProfiles)
          .values({
            id: randomUUID(),
            clinicId: invitation.clinicId,
            userId: user.id,
            sourceInvitationId: invitation.id,
            displayName: invitation.patientName,
            birthDate: invitation.birthDate,
            city: "",
            bio: "",
            goals: "",
            connectionTypes: invitation.allowedConnectionTypes,
            avatarUrl: "/avatars/default.svg",
          })
          .returning({ id: schema.patientProfiles.id });

        if (!profile) return undefined;

        const authUser = toAuthUser(user);
        const refreshToken = await createRefreshToken(tx, authUser);

        return { authUser, refreshToken };
      });

      if (!result) {
        const [invitation] = await db
          .select({
            status: schema.invitations.status,
            expiresAt: schema.invitations.expiresAt,
          })
          .from(schema.invitations)
          .where(eq(schema.invitations.tokenHash, hashToken(body.token)))
          .limit(1);

        if (!invitation) return sendError(reply, 404, "INVALID_INVITATION");
        if (invitation.status === "revoked") {
          return sendError(reply, 410, "INVITATION_REVOKED");
        }
        if (invitation.status === "accepted") {
          return sendError(reply, 410, "INVITATION_USED");
        }
        if (invitation.status === "expired" || invitation.expiresAt <= now) {
          return sendError(reply, 410, "INVITATION_EXPIRED");
        }
        return sendError(reply, 404, "INVALID_INVITATION");
      }

      setRefreshCookie(reply, result.refreshToken);
      return {
        accessToken: signAccessToken(app, result.authUser),
        user: result.authUser,
      };
    },
  );
}
