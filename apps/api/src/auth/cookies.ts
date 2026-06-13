import type { FastifyReply } from "fastify";
import { env } from "../env";

export const refreshCookieName = "mindmatch_refresh";

export function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(refreshCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/auth",
    maxAge: env.JWT_REFRESH_TTL,
  });
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(refreshCookieName, {
    path: "/auth",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}
