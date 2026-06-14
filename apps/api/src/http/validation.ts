import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { sendError } from "./errors";

export function parseBody<T>(
  schema: z.ZodSchema<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    sendError(reply, 400, "VALIDATION_ERROR");
    return undefined;
  }
  return parsed.data;
}

export function parseParams<T>(
  schema: z.ZodSchema<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  const parsed = schema.safeParse(request.params);
  if (!parsed.success) {
    sendError(reply, 400, "VALIDATION_ERROR");
    return undefined;
  }
  return parsed.data;
}

export function parseQuery<T>(
  schema: z.ZodSchema<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | undefined {
  const parsed = schema.safeParse(request.query);
  if (!parsed.success) {
    sendError(reply, 400, "VALIDATION_ERROR");
    return undefined;
  }
  return parsed.data;
}
