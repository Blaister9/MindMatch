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
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
  varchar,
} from "drizzle-orm/pg-core";

export const social = pgSchema("social");

export const clinicStatusEnum = social.enum("clinic_status", [
  "active",
  "inactive",
]);

export const userRoleEnum = social.enum("user_role", ["doctor", "patient"]);

export const userStatusEnum = social.enum("user_status", [
  "invited",
  "active",
  "suspended",
  "inactive",
]);

export const connectionTypeEnum = social.enum("connection_type", [
  "friendship",
  "group",
  "romantic",
]);

export const invitationStatusEnum = social.enum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const matchScoreSourceEnum = social.enum("match_score_source", [
  "demo",
  "calculated",
]);

export const swipeDecisionEnum = social.enum("swipe_decision", [
  "like",
  "pass",
]);

export const connectionStatusEnum = social.enum("connection_status", [
  "pending_approval",
  "approved",
  "paused",
  "rejected",
  "active",
  "closed",
]);

export const conversationTypeEnum = social.enum("conversation_type", [
  "direct",
  "group",
]);

export const conversationStatusEnum = social.enum("conversation_status", [
  "active",
  "paused",
  "closed",
]);

export const conversationMemberRoleEnum = social.enum(
  "conversation_member_role",
  ["member", "moderator"],
);

export const messageTypeEnum = social.enum("message_type", ["text", "system"]);

export const messageReportStatusEnum = social.enum("message_report_status", [
  "open",
  "reviewed",
  "dismissed",
  "actioned",
]);

export const supportGroupStatusEnum = social.enum("support_group_status", [
  "active",
  "paused",
  "closed",
]);

export const wellnessMissionStatusEnum = social.enum(
  "wellness_mission_status",
  ["assigned", "completed", "expired", "cancelled"],
);

const id = () => uuid("id").defaultRandom().primaryKey();
const clinicId = () => uuid("clinic_id").notNull();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const clinics = social.table(
  "clinics",
  {
    id: id(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    status: clinicStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("clinics_slug_uidx").on(table.slug),
  }),
);

export const users = social.table(
  "users",
  {
    id: id(),
    clinicId: clinicId().references(() => clinics.id, { onDelete: "restrict" }),
    role: userRoleEnum("role").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash"),
    status: userStatusEnum("status").default("invited").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    clinicIdIdx: index("users_clinic_id_idx").on(table.clinicId),
    clinicRoleIdx: index("users_clinic_role_idx").on(table.clinicId, table.role),
    clinicUserUnique: unique("users_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
    clinicEmailLowerUnique: uniqueIndex("users_clinic_email_lower_uidx").on(
      table.clinicId,
      sql`lower(${table.email})`,
    ),
  }),
);

export const refreshTokens = social.table(
  "refresh_tokens",
  {
    id: id(),
    clinicId: clinicId(),
    userId: uuid("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    userFk: foreignKey({
      columns: [table.clinicId, table.userId],
      foreignColumns: [users.clinicId, users.id],
      name: "refresh_tokens_user_fk",
    }).onDelete("cascade"),
    tokenHashUnique: uniqueIndex("refresh_tokens_token_hash_uidx").on(
      table.tokenHash,
    ),
    clinicUserIdx: index("refresh_tokens_clinic_user_idx").on(
      table.clinicId,
      table.userId,
    ),
    expiresAtIdx: index("refresh_tokens_expires_at_idx").on(table.expiresAt),
  }),
);

export const invitations = social.table(
  "invitations",
  {
    id: id(),
    clinicId: clinicId(),
    createdByUserId: uuid("created_by_user_id").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    patientName: varchar("patient_name", { length: 160 }).notNull(),
    birthDate: date("birth_date").notNull(),
    allowedConnectionTypes:
      connectionTypeEnum("allowed_connection_types").array().notNull(),
    restrictionsJson: jsonb("restrictions_json")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    status: invitationStatusEnum("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => ({
    creatorFk: foreignKey({
      columns: [table.clinicId, table.createdByUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "invitations_created_by_user_fk",
    }).onDelete("restrict"),
    tokenHashUnique: uniqueIndex("invitations_token_hash_uidx").on(
      table.tokenHash,
    ),
    clinicEmailIdx: index("invitations_clinic_email_idx").on(
      table.clinicId,
      table.email,
    ),
    statusExpiresIdx: index("invitations_status_expires_idx").on(
      table.clinicId,
      table.status,
      table.expiresAt,
    ),
    adultCheck: check(
      "invitations_birth_date_adult_chk",
      sql`${table.birthDate} <= CURRENT_DATE - INTERVAL '18 years'`,
    ),
    allowedTypesNotEmptyCheck: check(
      "invitations_allowed_connection_types_nonempty_chk",
      sql`cardinality(${table.allowedConnectionTypes}) > 0`,
    ),
  }),
);

export const patientProfiles = social.table(
  "patient_profiles",
  {
    id: id(),
    clinicId: clinicId(),
    userId: uuid("user_id").notNull(),
    sourceInvitationId: uuid("source_invitation_id").references(
      () => invitations.id,
      { onDelete: "restrict" },
    ),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    birthDate: date("birth_date").notNull(),
    city: varchar("city", { length: 120 }).notNull(),
    bio: text("bio").notNull(),
    goals: text("goals").notNull(),
    connectionTypes: connectionTypeEnum("connection_types").array().notNull(),
    avatarUrl: text("avatar_url"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    userFk: foreignKey({
      columns: [table.clinicId, table.userId],
      foreignColumns: [users.clinicId, users.id],
      name: "patient_profiles_user_fk",
    }).onDelete("cascade"),
    clinicProfileUnique: unique("patient_profiles_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
    userUnique: uniqueIndex("patient_profiles_clinic_user_uidx").on(
      table.clinicId,
      table.userId,
    ),
    sourceInvitationUnique: uniqueIndex(
      "patient_profiles_source_invitation_uidx",
    ).on(table.sourceInvitationId),
    sourceInvitationIdx: index("patient_profiles_source_invitation_idx").on(
      table.clinicId,
      table.sourceInvitationId,
    ),
    clinicIdx: index("patient_profiles_clinic_id_idx").on(table.clinicId),
    cityIdx: index("patient_profiles_clinic_city_idx").on(
      table.clinicId,
      table.city,
    ),
    adultCheck: check(
      "patient_profiles_birth_date_adult_chk",
      sql`${table.birthDate} <= CURRENT_DATE - INTERVAL '18 years'`,
    ),
    connectionTypesNotEmptyCheck: check(
      "patient_profiles_connection_types_nonempty_chk",
      sql`cardinality(${table.connectionTypes}) > 0`,
    ),
  }),
);

export const interests = social.table(
  "interests",
  {
    id: id(),
    clinicId: clinicId().references(() => clinics.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    clinicInterestUnique: unique("interests_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
    clinicSlugUnique: uniqueIndex("interests_clinic_slug_uidx").on(
      table.clinicId,
      table.slug,
    ),
    clinicActiveIdx: index("interests_clinic_active_idx").on(
      table.clinicId,
      table.active,
    ),
  }),
);

export const patientInterests = social.table(
  "patient_interests",
  {
    id: id(),
    clinicId: clinicId(),
    patientProfileId: uuid("patient_profile_id").notNull(),
    interestId: uuid("interest_id").notNull(),
    weight: integer("weight").default(1).notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    patientProfileFk: foreignKey({
      columns: [table.clinicId, table.patientProfileId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "patient_interests_patient_profile_fk",
    }).onDelete("cascade"),
    interestFk: foreignKey({
      columns: [table.clinicId, table.interestId],
      foreignColumns: [interests.clinicId, interests.id],
      name: "patient_interests_interest_fk",
    }).onDelete("restrict"),
    uniquePatientInterest: uniqueIndex("patient_interests_unique_uidx").on(
      table.clinicId,
      table.patientProfileId,
      table.interestId,
    ),
    interestIdx: index("patient_interests_interest_idx").on(
      table.clinicId,
      table.interestId,
    ),
    weightCheck: check(
      "patient_interests_weight_chk",
      sql`${table.weight} BETWEEN 1 AND 5`,
    ),
  }),
);

export const profileEmbeddings = social.table(
  "profile_embeddings",
  {
    id: id(),
    clinicId: clinicId(),
    patientProfileId: uuid("patient_profile_id").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    embeddingModel: varchar("embedding_model", { length: 120 }).notNull(),
    dimensions: integer("dimensions").default(1536).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientProfileFk: foreignKey({
      columns: [table.clinicId, table.patientProfileId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "profile_embeddings_patient_profile_fk",
    }).onDelete("cascade"),
    profileModelUnique: uniqueIndex("profile_embeddings_profile_model_uidx").on(
      table.clinicId,
      table.patientProfileId,
      table.embeddingModel,
    ),
    dimensionsCheck: check(
      "profile_embeddings_dimensions_chk",
      sql`${table.dimensions} = 1536`,
    ),
  }),
);

export const matchScores = social.table(
  "match_scores",
  {
    id: id(),
    clinicId: clinicId(),
    patientAId: uuid("patient_a_id").notNull(),
    patientBId: uuid("patient_b_id").notNull(),
    score: real("score").notNull(),
    explanation: text("explanation").notNull(),
    source: matchScoreSourceEnum("source").notNull(),
    hardFiltersPassed: boolean("hard_filters_passed").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientAFk: foreignKey({
      columns: [table.clinicId, table.patientAId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "match_scores_patient_a_fk",
    }).onDelete("cascade"),
    patientBFk: foreignKey({
      columns: [table.clinicId, table.patientBId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "match_scores_patient_b_fk",
    }).onDelete("cascade"),
    pairUnique: uniqueIndex("match_scores_pair_uidx").on(
      table.clinicId,
      table.patientAId,
      table.patientBId,
    ),
    clinicMatchScoreUnique: unique("match_scores_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
    scoreIdx: index("match_scores_clinic_score_idx").on(
      table.clinicId,
      table.score,
    ),
    scoreCheck: check(
      "match_scores_score_chk",
      sql`${table.score} >= 0 AND ${table.score} <= 1`,
    ),
    canonicalPairCheck: check(
      "match_scores_canonical_pair_chk",
      sql`${table.patientAId} < ${table.patientBId}`,
    ),
  }),
);

export const swipes = social.table(
  "swipes",
  {
    id: id(),
    clinicId: clinicId(),
    actorPatientId: uuid("actor_patient_id").notNull(),
    targetPatientId: uuid("target_patient_id").notNull(),
    decision: swipeDecisionEnum("decision").notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    actorFk: foreignKey({
      columns: [table.clinicId, table.actorPatientId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "swipes_actor_patient_fk",
    }).onDelete("cascade"),
    targetFk: foreignKey({
      columns: [table.clinicId, table.targetPatientId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "swipes_target_patient_fk",
    }).onDelete("cascade"),
    actorTargetUnique: uniqueIndex("swipes_actor_target_uidx").on(
      table.clinicId,
      table.actorPatientId,
      table.targetPatientId,
    ),
    targetIdx: index("swipes_target_idx").on(table.clinicId, table.targetPatientId),
    distinctPatientsCheck: check(
      "swipes_distinct_patients_chk",
      sql`${table.actorPatientId} <> ${table.targetPatientId}`,
    ),
  }),
);

export const connections = social.table(
  "connections",
  {
    id: id(),
    clinicId: clinicId(),
    patientAId: uuid("patient_a_id").notNull(),
    patientBId: uuid("patient_b_id").notNull(),
    matchScoreId: uuid("match_score_id"),
    connectionType: connectionTypeEnum("connection_type").notNull(),
    status: connectionStatusEnum("status").default("pending_approval").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => ({
    clinicConnectionUnique: unique("connections_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
    patientAFk: foreignKey({
      columns: [table.clinicId, table.patientAId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "connections_patient_a_fk",
    }).onDelete("restrict"),
    patientBFk: foreignKey({
      columns: [table.clinicId, table.patientBId],
      foreignColumns: [patientProfiles.clinicId, patientProfiles.id],
      name: "connections_patient_b_fk",
    }).onDelete("restrict"),
    matchScoreFk: foreignKey({
      columns: [table.clinicId, table.matchScoreId],
      foreignColumns: [matchScores.clinicId, matchScores.id],
      name: "connections_match_score_fk",
    }).onDelete("set null"),
    pairTypeUnique: uniqueIndex("connections_pair_type_uidx").on(
      table.clinicId,
      table.patientAId,
      table.patientBId,
      table.connectionType,
    ),
    statusIdx: index("connections_status_idx").on(table.clinicId, table.status),
    canonicalPairCheck: check(
      "connections_canonical_pair_chk",
      sql`${table.patientAId} < ${table.patientBId}`,
    ),
  }),
);

export const conversations = social.table(
  "conversations",
  {
    id: id(),
    clinicId: clinicId(),
    connectionId: uuid("connection_id"),
    type: conversationTypeEnum("type").notNull(),
    title: varchar("title", { length: 160 }),
    status: conversationStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    clinicConversationUnique: unique("conversations_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
    connectionFk: foreignKey({
      columns: [table.clinicId, table.connectionId],
      foreignColumns: [connections.clinicId, connections.id],
      name: "conversations_connection_fk",
    }).onDelete("restrict"),
    statusIdx: index("conversations_status_idx").on(table.clinicId, table.status),
    directRequiresConnectionCheck: check(
      "conversations_direct_requires_connection_chk",
      sql`(${table.type} = 'direct' AND ${table.connectionId} IS NOT NULL) OR (${table.type} = 'group' AND ${table.connectionId} IS NULL)`,
    ),
  }),
);

export const conversationMembers = social.table(
  "conversation_members",
  {
    id: id(),
    clinicId: clinicId(),
    conversationId: uuid("conversation_id").notNull(),
    userId: uuid("user_id").notNull(),
    memberRole: conversationMemberRoleEnum("member_role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => ({
    conversationFk: foreignKey({
      columns: [table.clinicId, table.conversationId],
      foreignColumns: [conversations.clinicId, conversations.id],
      name: "conversation_members_conversation_fk",
    }).onDelete("cascade"),
    userFk: foreignKey({
      columns: [table.clinicId, table.userId],
      foreignColumns: [users.clinicId, users.id],
      name: "conversation_members_user_fk",
    }).onDelete("cascade"),
    memberUnique: uniqueIndex("conversation_members_unique_uidx").on(
      table.clinicId,
      table.conversationId,
      table.userId,
    ),
    userIdx: index("conversation_members_user_idx").on(table.clinicId, table.userId),
  }),
);

export const messages = social.table(
  "messages",
  {
    id: id(),
    clinicId: clinicId(),
    conversationId: uuid("conversation_id").notNull(),
    senderUserId: uuid("sender_user_id").notNull(),
    messageType: messageTypeEnum("message_type").default("text").notNull(),
    // TODO(produccion): cifrar body con manejo de llaves por tenant antes de hardening.
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    conversationFk: foreignKey({
      columns: [table.clinicId, table.conversationId],
      foreignColumns: [conversations.clinicId, conversations.id],
      name: "messages_conversation_fk",
    }).onDelete("cascade"),
    senderFk: foreignKey({
      columns: [table.clinicId, table.senderUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "messages_sender_user_fk",
    }).onDelete("restrict"),
    conversationSentAtIdx: index("messages_conversation_sent_at_idx").on(
      table.clinicId,
      table.conversationId,
      table.sentAt,
    ),
    senderSentAtIdx: index("messages_sender_sent_at_idx").on(
      table.clinicId,
      table.senderUserId,
      table.sentAt,
    ),
    clinicMessageUnique: unique("messages_clinic_id_id_unique").on(
      table.clinicId,
      table.id,
    ),
  }),
);

export const messageReports = social.table(
  "message_reports",
  {
    id: id(),
    clinicId: clinicId(),
    messageId: uuid("message_id").notNull(),
    reporterUserId: uuid("reporter_user_id").notNull(),
    reason: varchar("reason", { length: 120 }).notNull(),
    details: text("details"),
    status: messageReportStatusEnum("status").default("open").notNull(),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    messageFk: foreignKey({
      columns: [table.clinicId, table.messageId],
      foreignColumns: [messages.clinicId, messages.id],
      name: "message_reports_message_fk",
    }).onDelete("cascade"),
    reporterFk: foreignKey({
      columns: [table.clinicId, table.reporterUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "message_reports_reporter_user_fk",
    }).onDelete("restrict"),
    statusIdx: index("message_reports_status_idx").on(table.clinicId, table.status),
    createdAtIdx: index("message_reports_created_at_idx").on(
      table.clinicId,
      table.createdAt,
    ),
  }),
);

export const supportGroups = social.table(
  "support_groups",
  {
    id: id(),
    clinicId: clinicId(),
    conversationId: uuid("conversation_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").notNull(),
    maxMembers: integer("max_members").notNull(),
    status: supportGroupStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    conversationFk: foreignKey({
      columns: [table.clinicId, table.conversationId],
      foreignColumns: [conversations.clinicId, conversations.id],
      name: "support_groups_conversation_fk",
    }).onDelete("restrict"),
    conversationUnique: uniqueIndex("support_groups_conversation_uidx").on(
      table.clinicId,
      table.conversationId,
    ),
    statusIdx: index("support_groups_status_idx").on(table.clinicId, table.status),
    maxMembersCheck: check(
      "support_groups_max_members_chk",
      sql`${table.maxMembers} > 0`,
    ),
  }),
);

export const wellnessMissions = social.table(
  "wellness_missions",
  {
    id: id(),
    clinicId: clinicId(),
    patientUserId: uuid("patient_user_id").notNull(),
    assignedByUserId: uuid("assigned_by_user_id").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description").notNull(),
    dueDate: date("due_date"),
    status: wellnessMissionStatusEnum("status").default("assigned").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    patientFk: foreignKey({
      columns: [table.clinicId, table.patientUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "wellness_missions_patient_user_fk",
    }).onDelete("cascade"),
    assignedByFk: foreignKey({
      columns: [table.clinicId, table.assignedByUserId],
      foreignColumns: [users.clinicId, users.id],
      name: "wellness_missions_assigned_by_user_fk",
    }).onDelete("restrict"),
    patientStatusIdx: index("wellness_missions_patient_status_idx").on(
      table.clinicId,
      table.patientUserId,
      table.status,
    ),
    dueDateIdx: index("wellness_missions_due_date_idx").on(
      table.clinicId,
      table.dueDate,
    ),
  }),
);
