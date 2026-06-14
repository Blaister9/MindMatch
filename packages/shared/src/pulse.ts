import { z } from "zod";
import { alertSeveritySchema } from "./connection";

export const pulseRuleCodeSchema = z.enum(["R1", "R2", "R3", "R4", "R5", "R6"]);
export type PulseRuleCode = z.infer<typeof pulseRuleCodeSchema>;

export const alertStatusSchema = z.enum(["open", "managed", "dismissed"]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const checkInDtoSchema = z.object({
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  connectedWithSomeone: z.boolean(),
  updatedAt: z.string(),
});
export type CheckInDto = z.infer<typeof checkInDtoSchema>;

export const pulseTodayResponseSchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
  checkIn: checkInDtoSchema.nullable(),
  preference: z.object({
    enabled: z.boolean(),
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string(),
  }),
});
export type PulseTodayResponse = z.infer<typeof pulseTodayResponseSchema>;

export const upsertCheckInInputSchema = z
  .object({
    mood: z.number().int().min(1).max(5),
    sleep: z.number().int().min(1).max(5),
    connectedWithSomeone: z.boolean(),
  })
  .strict();
export type UpsertCheckInInput = z.infer<typeof upsertCheckInInputSchema>;

export const pulseHistoryQuerySchema = z.object({
  days: z.coerce.number().int().refine((value) => value === 7 || value === 30).default(7),
});

export const pulseHistoryPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().int().min(1).max(5).nullable(),
  sleep: z.number().int().min(1).max(5).nullable(),
  connectedWithSomeone: z.boolean().nullable(),
});
export type PulseHistoryPoint = z.infer<typeof pulseHistoryPointSchema>;

export const pulseHistoryResponseSchema = z.object({
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int(),
  points: z.array(pulseHistoryPointSchema),
});
export type PulseHistoryResponse = z.infer<typeof pulseHistoryResponseSchema>;

export const pulsePreferencesResponseSchema = z.object({
  enabled: z.boolean(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
});
export type PulsePreferencesResponse = z.infer<typeof pulsePreferencesResponseSchema>;

export const updatePulsePreferencesInputSchema = z
  .object({
    enabled: z.boolean(),
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .strict();
export type UpdatePulsePreferencesInput = z.infer<typeof updatePulsePreferencesInputSchema>;

export const manageAlertInputSchema = z
  .object({
    managementNote: z.string().trim().max(1000).optional(),
  })
  .strict();
export type ManageAlertInput = z.infer<typeof manageAlertInputSchema>;

export const publicAlertEvidenceSchema = z.discriminatedUnion("ruleCode", [
  z.object({
    ruleCode: z.literal("R1"),
    asOfDate: z.string(),
    previousAverage: z.number(),
    recentAverage: z.number(),
    drop: z.number(),
    windowStart: z.string(),
    windowEnd: z.string(),
  }),
  z.object({
    ruleCode: z.literal("R2"),
    asOfDate: z.string(),
    streakStart: z.string(),
    streakEnd: z.string(),
    streakLength: z.number().int(),
  }),
  z.object({
    ruleCode: z.literal("R3"),
    asOfDate: z.string(),
    absenceStart: z.string(),
    daysWithoutCheckIn: z.number().int(),
  }),
  z.object({
    ruleCode: z.literal("R4"),
    asOfDate: z.string(),
    streakStart: z.string(),
    streakEnd: z.string(),
    streakLength: z.number().int(),
  }),
  z.object({
    ruleCode: z.literal("R5"),
    asOfDate: z.string(),
    windowStart: z.string(),
    windowEnd: z.string(),
    slope: z.number(),
    daysWithoutConnection: z.number().int(),
  }),
  z.object({
    ruleCode: z.literal("R6"),
    reasonCategory: z.string(),
    triggeredAt: z.string(),
  }),
]);
export type PublicAlertEvidence = z.infer<typeof publicAlertEvidenceSchema>;

export const doctorAlertSchema = z.object({
  alertId: z.string().uuid(),
  patientUserId: z.string().uuid(),
  patientDisplayName: z.string(),
  avatarUrl: z.string().nullable(),
  ruleCode: pulseRuleCodeSchema,
  ruleName: z.string(),
  ruleDescription: z.string(),
  severity: alertSeveritySchema,
  status: alertStatusSchema,
  triggeredAt: z.string(),
  managedAt: z.string().nullable(),
  evidence: publicAlertEvidenceSchema,
  miniSeries: z.array(pulseHistoryPointSchema),
});
export type DoctorAlert = z.infer<typeof doctorAlertSchema>;

export const doctorAlertsResponseSchema = z.object({
  alerts: z.array(doctorAlertSchema),
});
export type DoctorAlertsResponse = z.infer<typeof doctorAlertsResponseSchema>;

export const simulateDayInputSchema = z.object({ requestId: z.string().uuid() }).strict();
export type SimulateDayInput = z.infer<typeof simulateDayInputSchema>;

export const simulateDayResponseSchema = z.object({
  currentDate: z.string(),
  previousDate: z.string(),
  insertedCheckIns: z.number().int(),
  createdAlerts: z.array(
    z.object({
      patientDisplayName: z.string(),
      ruleCode: pulseRuleCodeSchema,
      severity: alertSeveritySchema,
    }),
  ),
});
export type SimulateDayResponse = z.infer<typeof simulateDayResponseSchema>;
