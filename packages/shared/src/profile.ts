import { z } from "zod";
import { connectionTypeSchema } from "./connection";

export const patientProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  birthDate: z.string(),
  city: z.string(),
  bio: z.string(),
  goals: z.string(),
  connectionTypes: z.array(connectionTypeSchema),
  allowedConnectionTypes: z.array(connectionTypeSchema),
  avatarUrl: z.string().nullable(),
  onboardingCompletedAt: z.string().nullable(),
  interests: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type PatientProfile = z.infer<typeof patientProfileSchema>;

export const updatePatientProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  bio: z.string().trim().min(1).max(1000),
  goals: z.string().trim().min(1).max(1000),
  connectionTypes: z.array(connectionTypeSchema).min(1),
  avatarUrl: z.string().trim().max(300).nullable(),
  interestIds: z.array(z.string().uuid()).max(20),
});
export type UpdatePatientProfileInput = z.infer<
  typeof updatePatientProfileSchema
>;

export const patientProfileResponseSchema = z.object({
  profile: patientProfileSchema,
});
export type PatientProfileResponse = z.infer<
  typeof patientProfileResponseSchema
>;
