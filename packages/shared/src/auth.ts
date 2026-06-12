import { z } from "zod";
import { roleSchema } from "./roles";

/** Login de la doctora (email + password). */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Payload del JWT de acceso. */
export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: roleSchema,
  clinicId: z.string().uuid(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

/** Respuesta de autenticación: tokens + usuario básico. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  role: z.infer<typeof roleSchema>;
  clinicId: string;
  displayName: string;
}
