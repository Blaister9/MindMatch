import { z } from "zod";
import { alertSeveritySchema } from "./connection";
import { isoDateSchema } from "./dates";
import { pulseRuleCodeSchema } from "./pulse";

export const analyticsRangeQuerySchema = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .strict();
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

export const analyticsDataStatusSchema = z.enum(["ok", "not_generated"]);
export type AnalyticsDataStatus = z.infer<typeof analyticsDataStatusSchema>;

// ── Ánimo colectivo (histórico exacto desde patient_daily_metrics) ──
export const moodSeriesPointSchema = z.object({
  date: z.string(),
  average: z.number().nullable(),
  sampleSize: z.number().int(),
});
export type MoodSeriesPoint = z.infer<typeof moodSeriesPointSchema>;

export const moodSeriesResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  dataStatus: analyticsDataStatusSchema,
  points: z.array(moodSeriesPointSchema),
});
export type MoodSeriesResponse = z.infer<typeof moodSeriesResponseSchema>;

// ── Alertas agregadas (desde clinical.alerts, sin inputsJson) ──
export const alertsAggregationResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  total: z.number().int(),
  byRuleCode: z.array(
    z.object({ ruleCode: pulseRuleCodeSchema, count: z.number().int() }),
  ),
  bySeverity: z.array(
    z.object({ severity: alertSeveritySchema, count: z.number().int() }),
  ),
  monthlySeries: z.array(
    z.object({ period: z.string(), count: z.number().int() }),
  ),
  /** Alertas R1–R5 sin asOfDate válido que cayeron al fallback triggered_at. */
  fallbackCount: z.number().int(),
});
export type AlertsAggregationResponse = z.infer<
  typeof alertsAggregationResponseSchema
>;

// ── Matching (estado operativo + tasa de decisiones) ──
export const matchingMetricsResponseSchema = z.object({
  approvalRate: z.number().nullable(),
  professionalDecisionsTotal: z.number().int(),
  approvedDecisions: z.number().int(),
  activeConnections: z.number().int(),
  pendingMatches: z.number().int(),
  generatedAt: z.string(),
});
export type MatchingMetricsResponse = z.infer<
  typeof matchingMetricsResponseSchema
>;

// ── Embudo por cohorte de invitaciones ──
export const funnelStageKeySchema = z.enum([
  "invited",
  "accepted",
  "profile_completed",
  "swiped",
  "connected",
  "active_connection",
  "messaged",
  "checked_in",
]);
export type FunnelStageKey = z.infer<typeof funnelStageKeySchema>;

export const funnelStageSchema = z.object({
  key: funnelStageKeySchema,
  label: z.string(),
  patients: z.number().int(),
});
export type FunnelStage = z.infer<typeof funnelStageSchema>;

export const funnelDataQualityIssueSchema = z.object({
  previousStage: funnelStageKeySchema,
  currentStage: funnelStageKeySchema,
  previousCount: z.number().int(),
  currentCount: z.number().int(),
});
export type FunnelDataQualityIssue = z.infer<typeof funnelDataQualityIssueSchema>;

export const funnelResponseSchema = z.object({
  from: z.string().nullable(),
  to: z.string(),
  cohortLabel: z.string(),
  stages: z.array(funnelStageSchema),
  dataQualityWarning: z.boolean(),
  dataQualityIssues: z.array(funnelDataQualityIssueSchema),
});
export type FunnelResponse = z.infer<typeof funnelResponseSchema>;

// ── Resumen de analítica (snapshot operativo actual) ──
export const analyticsSummaryResponseSchema = z.object({
  today: z.string(),
  generatedAt: z.string(),
  dataStatus: analyticsDataStatusSchema,
  snapshotDate: z.string().nullable(),
  isCurrentSnapshot: z.boolean(),
  matching: matchingMetricsResponseSchema,
});
export type AnalyticsSummaryResponse = z.infer<
  typeof analyticsSummaryResponseSchema
>;
