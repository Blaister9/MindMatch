import { z } from "zod";
import { connectionTypeSchema } from "./connection";
import { adultBirthDateSchema, futureDateTimeSchema } from "./dates";

export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const createInvitationSchema = z.object({
  patientName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  birthDate: adultBirthDateSchema,
  allowedConnectionTypes: z.array(connectionTypeSchema).min(1),
  restrictionsJson: z.record(z.unknown()).default({}),
  expiresAt: futureDateTimeSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationTokenSchema = z.object({
  token: z.string().min(32).max(512),
});
export type InvitationTokenInput = z.infer<typeof invitationTokenSchema>;

export const acceptInvitationSchema = invitationTokenSchema.extend({
  password: z.string().min(8).max(256),
  passwordConfirmation: z.string().min(8).max(256),
}).refine((value) => value.password === value.passwordConfirmation, {
  message: "Las contraseñas no coinciden.",
  path: ["passwordConfirmation"],
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const publicInvitationSchema = z.object({
  patientName: z.string(),
  email: z.string().email(),
  birthDate: z.string(),
  allowedConnectionTypes: z.array(connectionTypeSchema),
  status: invitationStatusSchema,
  expiresAt: z.string(),
});
export type PublicInvitation = z.infer<typeof publicInvitationSchema>;

export const doctorInvitationSchema = z.object({
  id: z.string().uuid(),
  patientName: z.string(),
  email: z.string().email(),
  birthDate: z.string(),
  allowedConnectionTypes: z.array(connectionTypeSchema),
  restrictionsJson: z.record(z.unknown()),
  status: invitationStatusSchema,
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DoctorInvitation = z.infer<typeof doctorInvitationSchema>;

export const createInvitationResponseSchema = z.object({
  invitation: doctorInvitationSchema,
  inviteUrl: z.string().url(),
});
export type CreateInvitationResponse = z.infer<
  typeof createInvitationResponseSchema
>;

export const listInvitationsResponseSchema = z.object({
  invitations: z.array(doctorInvitationSchema),
});
export type ListInvitationsResponse = z.infer<
  typeof listInvitationsResponseSchema
>;

export const validateInvitationResponseSchema = z.object({
  invitation: publicInvitationSchema,
});
export type ValidateInvitationResponse = z.infer<
  typeof validateInvitationResponseSchema
>;
