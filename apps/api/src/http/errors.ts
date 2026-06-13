import type { FastifyReply } from "fastify";
import type { PublicErrorCode } from "@mindmatch/shared";

const defaultMessages: Record<PublicErrorCode, string> = {
  UNAUTHORIZED: "No tienes una sesión válida.",
  FORBIDDEN: "No tienes permisos para esta acción.",
  VALIDATION_ERROR: "Revisa los datos e inténtalo de nuevo.",
  INVALID_CREDENTIALS: "Correo o contraseña inválidos.",
  INVALID_INVITATION: "La invitación no es válida.",
  INVITATION_EXPIRED: "La invitación está vencida.",
  INVITATION_REVOKED: "La invitación fue revocada.",
  INVITATION_USED: "La invitación ya fue utilizada.",
  NOT_FOUND: "No encontramos el recurso solicitado.",
  RATE_LIMITED: "Demasiados intentos. Inténtalo de nuevo más tarde.",
};

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  error: PublicErrorCode,
  message = defaultMessages[error],
) {
  return reply.status(statusCode).send({ error, message });
}
