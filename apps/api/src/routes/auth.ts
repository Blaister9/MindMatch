import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loginSchema, type AuthUser } from "@mindmatch/shared";
import { authenticate, requireAuthContext } from "../auth/guards";
import {
  clearRefreshCookie,
  refreshCookieName,
  setRefreshCookie,
} from "../auth/cookies";
import { db, schema } from "../db";
import { env } from "../env";
import { sendError } from "../http/errors";
import { parseBody } from "../http/validation";
import { hashPassword, verifyPassword } from "../security/passwords";
import { createOpaqueToken, hashToken } from "../security/tokens";

export function toAuthUser(user: {
  id: string;
  clinicId: string;
  role: "doctor" | "patient";
  status: "active";
  email: string;
}): AuthUser {
  return {
    userId: user.id,
    clinicId: user.clinicId,
    role: user.role,
    status: user.status,
    email: user.email,
    displayName: user.email,
  };
}

export function signAccessToken(app: FastifyInstance, user: AuthUser): string {
  return app.jwt.sign(
    { sub: user.userId, clinicId: user.clinicId, role: user.role },
    { expiresIn: env.JWT_ACCESS_TTL },
  );
}

export async function createRefreshToken(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  user: AuthUser,
) {
  const refreshToken = createOpaqueToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL * 1000);

  await tx.insert(schema.refreshTokens).values({
    id: randomUUID(),
    clinicId: user.clinicId,
    userId: user.userId,
    tokenHash,
    expiresAt,
  });

  return refreshToken;
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = parseBody(loginSchema, request, reply);
      if (!body) return;

      const clinicSlug = body.clinicSlug.trim().toLowerCase();
      const email = body.email.toLowerCase();

      // 1) Resolver el tenant por slug + estado activo. El clinicId siempre sale
      //    de DB; nunca confiamos en una afirmación de clínica del frontend.
      const [clinic] = await db
        .select({ id: schema.clinics.id })
        .from(schema.clinics)
        .where(
          and(
            eq(schema.clinics.slug, clinicSlug),
            eq(schema.clinics.status, "active"),
          ),
        )
        .limit(1);

      // 2) Buscar el usuario dentro de esa clínica (email case-insensitive).
      //    Todas las fallas devuelven el mismo 401 genérico: no revelamos si
      //    falló la clínica, el email, el estado o la contraseña.
      const [user] = clinic
        ? await db
            .select({
              id: schema.users.id,
              clinicId: schema.users.clinicId,
              role: schema.users.role,
              status: schema.users.status,
              email: schema.users.email,
              passwordHash: schema.users.passwordHash,
            })
            .from(schema.users)
            .where(
              and(
                eq(schema.users.clinicId, clinic.id),
                sql`lower(${schema.users.email}) = ${email}`,
              ),
            )
            .limit(1)
        : [];

      if (!user || user.status !== "active" || !user.passwordHash) {
        return sendError(reply, 401, "INVALID_CREDENTIALS");
      }

      const passwordOk = await verifyPassword(body.password, user.passwordHash);
      if (!passwordOk) {
        return sendError(reply, 401, "INVALID_CREDENTIALS");
      }

      const authUser = toAuthUser({
        id: user.id,
        clinicId: user.clinicId,
        role: user.role,
        status: "active",
        email: user.email,
      });

      const refreshToken = await db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.users.id, user.id));

        return createRefreshToken(tx, authUser);
      });

      setRefreshCookie(reply, refreshToken);
      return {
        accessToken: signAccessToken(app, authUser),
        user: authUser,
      };
    },
  );

  app.post(
    "/auth/refresh",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies[refreshCookieName];
      if (!refreshToken) {
        return sendError(reply, 401, "UNAUTHORIZED");
      }

      const now = new Date();
      const oldHash = hashToken(refreshToken);

      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({
            id: schema.refreshTokens.id,
            clinicId: schema.refreshTokens.clinicId,
            userId: schema.refreshTokens.userId,
          })
          .from(schema.refreshTokens)
          .where(
            and(
              eq(schema.refreshTokens.tokenHash, oldHash),
              isNull(schema.refreshTokens.revokedAt),
              gt(schema.refreshTokens.expiresAt, now),
            ),
          )
          .limit(1);

        if (!existing) return undefined;

        const revoked = await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: now })
          .where(
            and(
              eq(schema.refreshTokens.id, existing.id),
              isNull(schema.refreshTokens.revokedAt),
            ),
          )
          .returning({ id: schema.refreshTokens.id });

        if (revoked.length !== 1) return undefined;

        const [user] = await tx
          .select({
            id: schema.users.id,
            clinicId: schema.users.clinicId,
            role: schema.users.role,
            status: schema.users.status,
            email: schema.users.email,
          })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.id, existing.userId),
              eq(schema.users.clinicId, existing.clinicId),
            ),
          )
          .limit(1);

        if (!user || user.status !== "active") return undefined;

        const authUser = toAuthUser({
          id: user.id,
          clinicId: user.clinicId,
          role: user.role,
          status: "active",
          email: user.email,
        });
        const newRefreshToken = await createRefreshToken(tx, authUser);
        return { authUser, newRefreshToken };
      });

      if (!result) {
        clearRefreshCookie(reply);
        return sendError(reply, 401, "UNAUTHORIZED");
      }

      setRefreshCookie(reply, result.newRefreshToken);
      return {
        accessToken: signAccessToken(app, result.authUser),
        user: result.authUser,
      };
    },
  );

  app.post(
    "/auth/logout",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const auth = requireAuthContext(request);
      const refreshToken = request.cookies[refreshCookieName];
      if (refreshToken) {
        await db
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.refreshTokens.clinicId, auth.clinicId),
              eq(schema.refreshTokens.userId, auth.userId),
              eq(schema.refreshTokens.tokenHash, hashToken(refreshToken)),
              isNull(schema.refreshTokens.revokedAt),
            ),
          );
      }

      clearRefreshCookie(reply);
      return { ok: true };
    },
  );

  app.get("/auth/me", { preHandler: [authenticate] }, async (request) => {
    const auth = requireAuthContext(request);
    return {
      user: {
        userId: auth.userId,
        clinicId: auth.clinicId,
        role: auth.role,
        status: auth.status,
        email: auth.email,
        displayName: auth.email,
      },
    };
  });
}

export { hashPassword };
