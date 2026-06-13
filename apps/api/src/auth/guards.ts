import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@mindmatch/shared";
import { jwtPayloadSchema } from "@mindmatch/shared";
import { db, schema } from "../db";
import { sendError } from "../http/errors";

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const decoded = await request.jwtVerify();
    const payload = jwtPayloadSchema.parse(decoded);

    const [user] = await db
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
          eq(schema.users.id, payload.sub),
          eq(schema.users.clinicId, payload.clinicId),
        ),
      )
      .limit(1);

    if (
      !user ||
      user.status !== "active" ||
      user.role !== payload.role ||
      user.clinicId !== payload.clinicId
    ) {
      return sendError(reply, 401, "UNAUTHORIZED");
    }

    request.auth = {
      userId: user.id,
      clinicId: user.clinicId,
      role: user.role,
      status: "active",
      email: user.email,
    };
  } catch {
    return sendError(reply, 401, "UNAUTHORIZED");
  }
}

export function requireRole(role: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return sendError(reply, 401, "UNAUTHORIZED");
    }

    if (request.auth.role !== role) {
      return sendError(reply, 403, "FORBIDDEN");
    }
  };
}

export function requireAuthContext(request: FastifyRequest) {
  if (!request.auth) {
    throw new Error("Missing auth context");
  }
  return request.auth;
}
