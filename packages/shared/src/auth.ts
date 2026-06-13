import { z } from "zod";
import { roleSchema } from "./roles";

export const userStatusSchema = z.enum([
  "invited",
  "active",
  "suspended",
  "inactive",
]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const loginSchema = z.object({
  // Multi-tenant: el login se resuelve por clínica + email, nunca por email global.
  clinicSlug: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: roleSchema,
  clinicId: z.string().uuid(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const authUserSchema = z.object({
  userId: z.string().uuid(),
  clinicId: z.string().uuid(),
  role: roleSchema,
  status: userStatusSchema,
  email: z.string().email(),
  displayName: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const meResponseSchema = z.object({
  user: authUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
