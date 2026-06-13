import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { clinics, users } from "./social";

export const analytics = pgSchema("analytics");

export const analyticsEventTypeEnum = analytics.enum("analytics_event_type", [
  "invitation_created",
  "invitation_accepted",
  "profile_completed",
  "swipe_like",
  "mutual_match",
  "match_approved",
  "conversation_started",
  "check_in_completed",
  "alert_created",
  "mission_completed",
]);

export const analyticsSeverityEnum = analytics.enum("analytics_severity", [
  "low",
  "medium",
  "high",
]);

const id = () => uuid("id").defaultRandom().primaryKey();
const clinicId = () => uuid("clinic_id").notNull();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const events = analytics.table(
  "events",
  {
    id: id(),
    clinicId: clinicId().references(() => clinics.id, { onDelete: "restrict" }),
    eventType: analyticsEventTypeEnum("event_type").notNull(),
    actorUserId: uuid("actor_user_id"),
    subjectUserId: uuid("subject_user_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
  },
  (table) => ({
    actorFk: foreignKey({
      columns: [table.clinicId, table.actorUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "events_actor_user_fk",
    }).onDelete("set null"),
    subjectFk: foreignKey({
      columns: [table.clinicId, table.subjectUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "events_subject_user_fk",
    }).onDelete("set null"),
    eventTimeIdx: index("events_event_time_idx").on(
      table.clinicId,
      table.eventType,
      table.occurredAt,
    ),
    actorTimeIdx: index("events_actor_time_idx").on(
      table.clinicId,
      table.actorUserId,
      table.occurredAt,
    ),
  }),
);

export const clinicDailyMetrics = analytics.table(
  "clinic_daily_metrics",
  {
    id: id(),
    clinicId: clinicId().references(() => clinics.id, { onDelete: "restrict" }),
    metricDate: date("metric_date").notNull(),
    activePatients: integer("active_patients").default(0).notNull(),
    checkInsCompleted: integer("check_ins_completed").default(0).notNull(),
    alertsLow: integer("alerts_low").default(0).notNull(),
    alertsMedium: integer("alerts_medium").default(0).notNull(),
    alertsHigh: integer("alerts_high").default(0).notNull(),
    matchesPending: integer("matches_pending").default(0).notNull(),
    matchesApproved: integer("matches_approved").default(0).notNull(),
    activeConnections: integer("active_connections").default(0).notNull(),
    messagesCount: integer("messages_count").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    dateUnique: uniqueIndex("clinic_daily_metrics_date_uidx").on(
      table.clinicId,
      table.metricDate,
    ),
    metricDateIdx: index("clinic_daily_metrics_metric_date_idx").on(
      table.clinicId,
      table.metricDate,
    ),
    nonNegativeCheck: check(
      "clinic_daily_metrics_nonnegative_chk",
      sql`${table.activePatients} >= 0 AND ${table.checkInsCompleted} >= 0 AND ${table.alertsLow} >= 0 AND ${table.alertsMedium} >= 0 AND ${table.alertsHigh} >= 0 AND ${table.matchesPending} >= 0 AND ${table.matchesApproved} >= 0 AND ${table.activeConnections} >= 0 AND ${table.messagesCount} >= 0`,
    ),
  }),
);

export const patientDailyMetrics = analytics.table(
  "patient_daily_metrics",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    metricDate: date("metric_date").notNull(),
    checkInCompleted: boolean("check_in_completed").default(false).notNull(),
    moodValue: integer("mood_value"),
    sleepValue: integer("sleep_value"),
    activeConnections: integer("active_connections").default(0).notNull(),
    messagesSent: integer("messages_sent").default(0).notNull(),
    alertsCount: integer("alerts_count").default(0).notNull(),
    highestAlertSeverity: analyticsSeverityEnum("highest_alert_severity"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "patient_daily_metrics_patient_user_fk",
    }).onDelete("cascade"),
    patientDateUnique: uniqueIndex("patient_daily_metrics_patient_date_uidx").on(
      table.clinicId,
      table.patientUserId,
      table.metricDate,
    ),
    patientDateIdx: index("patient_daily_metrics_patient_date_idx").on(
      table.clinicId,
      table.patientUserId,
      table.metricDate,
    ),
    moodValueCheck: check(
      "patient_daily_metrics_mood_value_chk",
      sql`${table.moodValue} IS NULL OR (${table.moodValue} BETWEEN 1 AND 5)`,
    ),
    sleepValueCheck: check(
      "patient_daily_metrics_sleep_value_chk",
      sql`${table.sleepValue} IS NULL OR (${table.sleepValue} BETWEEN 1 AND 5)`,
    ),
    nonNegativeCheck: check(
      "patient_daily_metrics_nonnegative_chk",
      sql`${table.activeConnections} >= 0 AND ${table.messagesSent} >= 0 AND ${table.alertsCount} >= 0`,
    ),
  }),
);
