import { z } from "zod";

export const publicErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "INVALID_CREDENTIALS",
  "INVALID_INVITATION",
  "INVITATION_EXPIRED",
  "INVITATION_REVOKED",
  "INVITATION_USED",
  "NOT_FOUND",
  "RATE_LIMITED",
]);

export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>;

export interface PublicErrorResponse {
  error: PublicErrorCode;
  message: string;
}
