import { z } from "zod";
import { connectionTypeSchema } from "./connection";
import { interestSchema } from "./interests";

/** Estado social de una conexión (espejo del enum de DB, contrato público). */
export const connectionStatusSchema = z.enum([
  "pending_approval",
  "approved",
  "paused",
  "rejected",
  "active",
  "closed",
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

// ── Discovery: candidato público (NUNCA email/birthDate/clinicId/clinical) ──
export const publicCandidateSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string(),
  age: z.number().int().min(18),
  city: z.string(),
  bio: z.string(),
  goals: z.string(),
  interests: z.array(interestSchema),
  sharedInterestSlugs: z.array(z.string()),
  avatarUrl: z.string().nullable(),
  compatibility: z.number().min(0).max(1),
  explanation: z.string().nullable(),
  suggestedConnectionType: connectionTypeSchema,
});
export type PublicCandidate = z.infer<typeof publicCandidateSchema>;

export const candidatesResponseSchema = z.object({
  candidates: z.array(publicCandidateSchema),
});
export type CandidatesResponse = z.infer<typeof candidatesResponseSchema>;

// ── Swipe ────────────────────────────────────────────────────────
export const swipeDecisionSchema = z.enum(["like", "pass"]);
export type SwipeDecision = z.infer<typeof swipeDecisionSchema>;

export const swipeInputSchema = z.object({
  targetProfileId: z.string().uuid(),
  decision: swipeDecisionSchema,
});
export type SwipeInput = z.infer<typeof swipeInputSchema>;

export const swipeResultStatusSchema = z.enum([
  "recorded",
  "liked",
  "matched",
  "already_connected",
]);
export type SwipeResultStatus = z.infer<typeof swipeResultStatusSchema>;

export const swipeResultSchema = z.object({
  decision: swipeDecisionSchema,
  status: swipeResultStatusSchema,
  connection: z
    .object({
      status: connectionStatusSchema,
      connectionType: connectionTypeSchema,
    })
    .optional(),
});
export type SwipeResult = z.infer<typeof swipeResultSchema>;

// ── Conexiones del paciente (sin mensajes) ───────────────────────
export const patientConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  status: connectionStatusSchema,
  connectionType: connectionTypeSchema,
  createdAt: z.string(),
  other: z.object({
    profileId: z.string().uuid(),
    displayName: z.string(),
    city: z.string(),
    age: z.number().int().min(18),
    avatarUrl: z.string().nullable(),
  }),
});
export type PatientConnection = z.infer<typeof patientConnectionSchema>;

export const patientConnectionsResponseSchema = z.object({
  connections: z.array(patientConnectionSchema),
});
export type PatientConnectionsResponse = z.infer<
  typeof patientConnectionsResponseSchema
>;

// ── Bandeja de la doctora (sin cuerpos de mensajes) ──────────────
export const matchPatientSchema = z.object({
  profileId: z.string().uuid(),
  displayName: z.string(),
  age: z.number().int().min(18),
  city: z.string(),
  avatarUrl: z.string().nullable(),
  interests: z.array(interestSchema),
});
export type MatchPatient = z.infer<typeof matchPatientSchema>;

export const doctorPendingMatchSchema = z.object({
  connectionId: z.string().uuid(),
  status: connectionStatusSchema,
  connectionType: connectionTypeSchema,
  // null cuando la conexión no tiene score (inconsistencia controlada, no se oculta).
  compatibility: z.number().min(0).max(1).nullable(),
  explanation: z.string().nullable(),
  hasScore: z.boolean(),
  matchedAt: z.string(),
  patients: z.array(matchPatientSchema).length(2),
  sharedInterestSlugs: z.array(z.string()),
});
export type DoctorPendingMatch = z.infer<typeof doctorPendingMatchSchema>;

export const doctorPendingMatchesResponseSchema = z.object({
  matches: z.array(doctorPendingMatchSchema),
});
export type DoctorPendingMatchesResponse = z.infer<
  typeof doctorPendingMatchesResponseSchema
>;

export const approveMatchInputSchema = z.object({
  rationale: z.string().trim().max(1000).optional(),
});
export type ApproveMatchInput = z.infer<typeof approveMatchInputSchema>;

export const pauseMatchInputSchema = z.object({
  rationale: z.string().trim().max(1000).optional(),
});
export type PauseMatchInput = z.infer<typeof pauseMatchInputSchema>;

export const matchActionResultSchema = z.object({
  connectionId: z.string().uuid(),
  status: connectionStatusSchema,
  conversationId: z.string().uuid().optional(),
  conversationCreated: z.boolean().optional(),
});
export type MatchActionResult = z.infer<typeof matchActionResultSchema>;
