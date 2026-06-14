import { z } from "zod";
import { isoDateSchema } from "./dates";

export const missionStatusSchema = z.enum([
  "assigned",
  "completed",
  "expired",
  "cancelled",
]);
export type MissionStatus = z.infer<typeof missionStatusSchema>;

/** Misión de bienestar visible (sin ids internos: assignedBy, clinicId). */
export const missionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  dueDate: z.string().nullable(),
  status: missionStatusSchema,
  /** Derivado: assigned + dueDate < businessToday. No persiste `expired`. */
  overdue: z.boolean(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Mission = z.infer<typeof missionSchema>;

export const missionsResponseSchema = z.object({
  missions: z.array(missionSchema),
});
export type MissionsResponse = z.infer<typeof missionsResponseSchema>;

export const createMissionInputSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(3).max(1000),
    // Opcional; el servidor valida dueDate >= businessToday.
    dueDate: isoDateSchema.nullable().optional(),
  })
  .strict();
export type CreateMissionInput = z.infer<typeof createMissionInputSchema>;

export const missionActionResultSchema = z.object({
  id: z.string().uuid(),
  status: missionStatusSchema,
});
export type MissionActionResult = z.infer<typeof missionActionResultSchema>;
