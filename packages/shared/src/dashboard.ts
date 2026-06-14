import { z } from "zod";
import { alertSeveritySchema, connectionTypeSchema } from "./connection";
import { connectionStatusSchema } from "./matching";
import { missionSchema } from "./missions";
import { pulseRuleCodeSchema, pulseHistoryPointSchema } from "./pulse";

export const patientStatusColorSchema = z.enum(["green", "yellow", "red"]);
export type PatientStatusColor = z.infer<typeof patientStatusColorSchema>;

/** Razones operativas cerradas; la UI las traduce con un registry fijo. */
export const patientStatusReasonSchema = z.enum([
  "high_alert_open",
  "medium_or_low_alert_open",
  "check_in_missing_3_plus_days",
  "check_in_missing_1_2_days",
  "up_to_date",
  "preference_disabled_no_open_alerts",
]);
export type PatientStatusReason = z.infer<typeof patientStatusReasonSchema>;

export const dashboardSummarySchema = z.object({
  today: z.string(),
  demoMode: z.boolean(),
  activePatients: z.number().int(),
  checkInsToday: z.number().int(),
  openAlertsTotal: z.number().int(),
  openAlertsToday: z.number().int(),
  pendingMatches: z.number().int(),
  generatedAt: z.string(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const patientCardSchema = z.object({
  patientUserId: z.string().uuid(),
  displayName: z.string(),
  city: z.string(),
  avatarUrl: z.string().nullable(),
  statusColor: patientStatusColorSchema,
  statusReason: patientStatusReasonSchema,
  lastCheckInDate: z.string().nullable(),
  openAlertsCount: z.number().int(),
  activeConnectionsCount: z.number().int(),
  pendingMissionsCount: z.number().int(),
});
export type PatientCard = z.infer<typeof patientCardSchema>;

export const patientCardsResponseSchema = z.object({
  today: z.string(),
  patients: z.array(patientCardSchema),
});
export type PatientCardsResponse = z.infer<typeof patientCardsResponseSchema>;

export const patientOverviewConnectionSchema = z.object({
  connectionId: z.string().uuid(),
  connectionType: connectionTypeSchema,
  status: connectionStatusSchema,
  otherDisplayName: z.string(),
  otherAvatarUrl: z.string().nullable(),
});

export const patientOverviewAlertSchema = z.object({
  alertId: z.string().uuid(),
  ruleCode: pulseRuleCodeSchema,
  severity: alertSeveritySchema,
  status: z.enum(["open", "managed", "dismissed"]),
  triggeredAt: z.string(),
});

export const patientOverviewCheckInSchema = z.object({
  date: z.string(),
  mood: z.number().int(),
  sleep: z.number().int(),
  connectedWithSomeone: z.boolean(),
});

export const patientOverviewSchema = z.object({
  patientUserId: z.string().uuid(),
  displayName: z.string(),
  city: z.string(),
  bio: z.string(),
  goals: z.string(),
  avatarUrl: z.string().nullable(),
  connectionTypes: z.array(connectionTypeSchema),
  statusColor: patientStatusColorSchema,
  statusReason: patientStatusReasonSchema,
  preference: z.object({
    enabled: z.boolean(),
    localTime: z.string(),
    timezone: z.string(),
    enabledOn: z.string().nullable(),
  }),
  connections: z.array(patientOverviewConnectionSchema),
  recentCheckIns: z.array(patientOverviewCheckInSchema),
  pulsePoints: z.array(pulseHistoryPointSchema),
  alerts: z.array(patientOverviewAlertSchema),
  missions: z.array(missionSchema),
});
export type PatientOverview = z.infer<typeof patientOverviewSchema>;
