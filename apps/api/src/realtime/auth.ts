import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { jwtPayloadSchema } from "@mindmatch/shared";
import { db, schema } from "../db";
import type { AppSocket } from "./events";

/**
 * Middleware de handshake: valida el access token, recarga el usuario desde DB
 * y guarda el contexto en `socket.data`. Errores genéricos; no loguea el token.
 */
export function socketAuthMiddleware(app: FastifyInstance) {
  return async (socket: AppSocket, next: (err?: Error) => void) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || token.length === 0) {
        return next(new Error("UNAUTHORIZED"));
      }

      // verify lanza si el token es inválido o expirado.
      const decoded = app.jwt.verify(token) as Record<string, unknown>;
      const payload = jwtPayloadSchema.parse(decoded);
      const exp = decoded.exp;
      if (typeof exp !== "number") {
        return next(new Error("UNAUTHORIZED"));
      }

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
        return next(new Error("UNAUTHORIZED"));
      }

      socket.data = {
        userId: user.id,
        clinicId: user.clinicId,
        role: user.role,
        email: user.email,
        exp,
      };
      return next();
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  };
}
