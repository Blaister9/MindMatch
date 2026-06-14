import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { connections, users } from "./social";

export const clinical = pgSchema("clinical");

export const consentStatusEnum = clinical.enum("consent_status", [
  "pending",
  "accepted",
  "revoked",
]);

export const careStatusEnum = clinical.enum("care_status", [
  "active",
  "paused",
  "discharged",
]);

export const riskLevelEnum = clinical.enum("risk_level", [
  "low",
  "medium",
  "high",
]);

export const pulseRuleCodeEnum = clinical.enum("pulse_rule_code", [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
]);

export const alertSeverityEnum = clinical.enum("alert_severity", [
  "low",
  "medium",
  "high",
]);

export const alertStatusEnum = clinical.enum("alert_status", [
  "open",
  "managed",
  "dismissed",
]);

export const matchDecisionEnum = clinical.enum("match_decision", [
  "approve",
  "pause",
  "reject",
]);

const id = () => uuid("id").defaultRandom().primaryKey();
const clinicId = () => uuid("clinic_id").notNull();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const patientClinical = clinical.table(
  "patient_clinical",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    assignedDoctorUserId: uuid("assigned_doctor_user_id").notNull(),
    consentStatus: consentStatusEnum("consent_status").default("pending").notNull(),
    careStatus: careStatusEnum("care_status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "patient_clinical_patient_user_fk",
    }).onDelete("restrict"),
    doctorFk: foreignKey({
      columns: [table.clinicId, table.assignedDoctorUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "patient_clinical_assigned_doctor_user_fk",
    }).onDelete("restrict"),
    patientUnique: uniqueIndex("patient_clinical_patient_uidx").on(
      table.clinicId,
      table.patientUserId,
    ),
    doctorIdx: index("patient_clinical_doctor_idx").on(
      table.clinicId,
      table.assignedDoctorUserId,
    ),
  }),
);

export const checkInPreferences = clinical.table(
  "check_in_preferences",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    enabledOn: date("enabled_on"),
    localTime: time("local_time").notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "check_in_preferences_patient_user_fk",
    }).onDelete("cascade"),
    patientUnique: uniqueIndex("check_in_preferences_patient_uidx").on(
      table.clinicId,
      table.patientUserId,
    ),
  }),
);

export const checkIns = clinical.table(
  "check_ins",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    checkInDate: date("check_in_date").notNull(),
    mood: integer("mood").notNull(),
    sleep: integer("sleep").notNull(),
    connectedWithSomeone: boolean("connected_with_someone").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "check_ins_patient_user_fk",
    }).onDelete("cascade"),
    patientDateUnique: uniqueIndex("check_ins_patient_date_uidx").on(
      table.clinicId,
      table.patientUserId,
      table.checkInDate,
    ),
    patientDateIdx: index("check_ins_patient_date_idx").on(
      table.clinicId,
      table.patientUserId,
      table.checkInDate,
    ),
    moodCheck: check("check_ins_mood_chk", sql`${table.mood} BETWEEN 1 AND 5`),
    sleepCheck: check("check_ins_sleep_chk", sql`${table.sleep} BETWEEN 1 AND 5`),
  }),
);

export const riskScores = clinical.table(
  "risk_scores",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    level: riskLevelEnum("level").notNull(),
    score: real("score"),
    ruleCodes: pulseRuleCodeEnum("rule_codes").array().notNull(),
    inputsJson: jsonb("inputs_json").$type<Record<string, unknown>>().notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "risk_scores_patient_user_fk",
    }).onDelete("cascade"),
    patientEvaluatedIdx: index("risk_scores_patient_evaluated_idx").on(
      table.clinicId,
      table.patientUserId,
      table.evaluatedAt,
    ),
    levelIdx: index("risk_scores_level_idx").on(table.clinicId, table.level),
    scoreCheck: check(
      "risk_scores_score_chk",
      sql`${table.score} IS NULL OR (${table.score} >= 0 AND ${table.score} <= 1)`,
    ),
    ruleCodesNotEmptyCheck: check(
      "risk_scores_rule_codes_nonempty_chk",
      sql`cardinality(${table.ruleCodes}) > 0`,
    ),
  }),
);

export const alerts = clinical.table(
  "alerts",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    ruleCode: pulseRuleCodeEnum("rule_code").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    status: alertStatusEnum("status").default("open").notNull(),
    dedupeKey: text("dedupe_key"),
    inputsJson: jsonb("inputs_json").$type<Record<string, unknown>>().notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull(),
    managedAt: timestamp("managed_at", { withTimezone: true }),
    managedByUserId: uuid("managed_by_user_id"),
    managementNote: text("management_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "alerts_patient_user_fk",
    }).onDelete("cascade"),
    managedByFk: foreignKey({
      columns: [table.clinicId, table.managedByUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "alerts_managed_by_user_fk",
    }).onDelete("set null"),
    triageIdx: index("alerts_triage_idx").on(
      table.clinicId,
      table.status,
      table.severity,
      table.triggeredAt,
    ),
    patientTriggeredIdx: index("alerts_patient_triggered_idx").on(
      table.clinicId,
      table.patientUserId,
      table.triggeredAt,
    ),
    dedupeUnique: uniqueIndex("alerts_episode_dedupe_uidx")
      .on(table.clinicId, table.patientUserId, table.ruleCode, table.dedupeKey)
      .where(sql`${table.dedupeKey} IS NOT NULL`),
    patientRuleStatusIdx: index("alerts_patient_rule_status_idx").on(
      table.clinicId,
      table.patientUserId,
      table.ruleCode,
      table.status,
      table.triggeredAt,
    ),
  }),
);

export const matchDecisions = clinical.table(
  "match_decisions",
  {
    id: id(),
    clinicId: clinicId(),
    connectionId: uuid("connection_id").notNull(),
    doctorUserId: uuid("doctor_user_id").notNull(),
    decision: matchDecisionEnum("decision").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    connectionFk: foreignKey({
      columns: [table.clinicId, table.connectionId],
      foreignColumns: [connections.clinicId, connections.id],
      name: "match_decisions_connection_fk",
    }).onDelete("restrict"),
    doctorFk: foreignKey({
      columns: [table.clinicId, table.doctorUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "match_decisions_doctor_user_fk",
    }).onDelete("restrict"),
    connectionCreatedIdx: index("match_decisions_connection_created_idx").on(
      table.clinicId,
      table.connectionId,
      table.createdAt,
    ),
    doctorCreatedIdx: index("match_decisions_doctor_created_idx").on(
      table.clinicId,
      table.doctorUserId,
      table.createdAt,
    ),
  }),
);

export const professionalNotes = clinical.table(
  "professional_notes",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    doctorUserId: uuid("doctor_user_id").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "professional_notes_patient_user_fk",
    }).onDelete("cascade"),
    doctorFk: foreignKey({
      columns: [table.clinicId, table.doctorUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "professional_notes_doctor_user_fk",
    }).onDelete("restrict"),
    patientCreatedIdx: index("professional_notes_patient_created_idx").on(
      table.clinicId,
      table.patientUserId,
      table.createdAt,
    ),
  }),
);
