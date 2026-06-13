CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE SCHEMA "social";
--> statement-breakpoint
CREATE SCHEMA "clinical";
--> statement-breakpoint
CREATE SCHEMA "analytics";
--> statement-breakpoint
CREATE TYPE "social"."clinic_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "social"."connection_status" AS ENUM('pending_approval', 'approved', 'paused', 'rejected', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "social"."connection_type" AS ENUM('friendship', 'group', 'romantic');--> statement-breakpoint
CREATE TYPE "social"."conversation_member_role" AS ENUM('member', 'moderator');--> statement-breakpoint
CREATE TYPE "social"."conversation_status" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "social"."conversation_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "social"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "social"."match_score_source" AS ENUM('demo', 'calculated');--> statement-breakpoint
CREATE TYPE "social"."message_report_status" AS ENUM('open', 'reviewed', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "social"."message_type" AS ENUM('text', 'system');--> statement-breakpoint
CREATE TYPE "social"."support_group_status" AS ENUM('active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "social"."swipe_decision" AS ENUM('like', 'pass');--> statement-breakpoint
CREATE TYPE "social"."user_role" AS ENUM('doctor', 'patient');--> statement-breakpoint
CREATE TYPE "social"."user_status" AS ENUM('invited', 'active', 'suspended', 'inactive');--> statement-breakpoint
CREATE TYPE "social"."wellness_mission_status" AS ENUM('assigned', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "clinical"."alert_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "clinical"."alert_status" AS ENUM('open', 'managed', 'dismissed');--> statement-breakpoint
CREATE TYPE "clinical"."care_status" AS ENUM('active', 'paused', 'discharged');--> statement-breakpoint
CREATE TYPE "clinical"."consent_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TYPE "clinical"."match_decision" AS ENUM('approve', 'pause', 'reject');--> statement-breakpoint
CREATE TYPE "clinical"."pulse_rule_code" AS ENUM('R1', 'R2', 'R3', 'R4', 'R5', 'R6');--> statement-breakpoint
CREATE TYPE "clinical"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "analytics"."analytics_event_type" AS ENUM('invitation_created', 'invitation_accepted', 'profile_completed', 'swipe_like', 'mutual_match', 'match_approved', 'conversation_started', 'check_in_completed', 'alert_created', 'mission_completed');--> statement-breakpoint
CREATE TYPE "analytics"."analytics_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "social"."clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"status" "social"."clinic_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social"."connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_a_id" uuid NOT NULL,
	"patient_b_id" uuid NOT NULL,
	"match_score_id" uuid,
	"connection_type" "social"."connection_type" NOT NULL,
	"status" "social"."connection_status" DEFAULT 'pending_approval' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "connections_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "connections_canonical_pair_chk" CHECK ("social"."connections"."patient_a_id" < "social"."connections"."patient_b_id")
);
--> statement-breakpoint
CREATE TABLE "social"."conversation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"member_role" "social"."conversation_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"connection_id" uuid,
	"type" "social"."conversation_type" NOT NULL,
	"title" varchar(160),
	"status" "social"."conversation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "conversations_direct_requires_connection_chk" CHECK (("social"."conversations"."type" = 'direct' AND "social"."conversations"."connection_id" IS NOT NULL) OR ("social"."conversations"."type" = 'group' AND "social"."conversations"."connection_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "social"."interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interests_clinic_id_id_unique" UNIQUE("clinic_id","id")
);
--> statement-breakpoint
CREATE TABLE "social"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"patient_name" varchar(160) NOT NULL,
	"birth_date" date NOT NULL,
	"allowed_connection_types" "social"."connection_type"[] NOT NULL,
	"restrictions_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"token_hash" text NOT NULL,
	"status" "social"."invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_birth_date_adult_chk" CHECK ("social"."invitations"."birth_date" <= CURRENT_DATE - INTERVAL '18 years'),
	CONSTRAINT "invitations_allowed_connection_types_nonempty_chk" CHECK (cardinality("social"."invitations"."allowed_connection_types") > 0)
);
--> statement-breakpoint
CREATE TABLE "social"."match_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_a_id" uuid NOT NULL,
	"patient_b_id" uuid NOT NULL,
	"score" real NOT NULL,
	"explanation" text NOT NULL,
	"source" "social"."match_score_source" NOT NULL,
	"hard_filters_passed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_scores_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "match_scores_score_chk" CHECK ("social"."match_scores"."score" >= 0 AND "social"."match_scores"."score" <= 1),
	CONSTRAINT "match_scores_canonical_pair_chk" CHECK ("social"."match_scores"."patient_a_id" < "social"."match_scores"."patient_b_id")
);
--> statement-breakpoint
CREATE TABLE "social"."message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reason" varchar(120) NOT NULL,
	"details" text,
	"status" "social"."message_report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "social"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"message_type" "social"."message_type" DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "messages_clinic_id_id_unique" UNIQUE("clinic_id","id")
);
--> statement-breakpoint
CREATE TABLE "social"."patient_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_profile_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_interests_weight_chk" CHECK ("social"."patient_interests"."weight" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "social"."patient_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"birth_date" date NOT NULL,
	"city" varchar(120) NOT NULL,
	"bio" text NOT NULL,
	"goals" text NOT NULL,
	"connection_types" "social"."connection_type"[] NOT NULL,
	"avatar_url" text,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_profiles_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "patient_profiles_birth_date_adult_chk" CHECK ("social"."patient_profiles"."birth_date" <= CURRENT_DATE - INTERVAL '18 years'),
	CONSTRAINT "patient_profiles_connection_types_nonempty_chk" CHECK (cardinality("social"."patient_profiles"."connection_types") > 0)
);
--> statement-breakpoint
CREATE TABLE "social"."profile_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_profile_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" varchar(120) NOT NULL,
	"dimensions" integer DEFAULT 1536 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_embeddings_dimensions_chk" CHECK ("social"."profile_embeddings"."dimensions" = 1536)
);
--> statement-breakpoint
CREATE TABLE "social"."refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social"."support_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"max_members" integer NOT NULL,
	"status" "social"."support_group_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_groups_max_members_chk" CHECK ("social"."support_groups"."max_members" > 0)
);
--> statement-breakpoint
CREATE TABLE "social"."swipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"actor_patient_id" uuid NOT NULL,
	"target_patient_id" uuid NOT NULL,
	"decision" "social"."swipe_decision" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_distinct_patients_chk" CHECK ("social"."swipes"."actor_patient_id" <> "social"."swipes"."target_patient_id")
);
--> statement-breakpoint
CREATE TABLE "social"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"role" "social"."user_role" NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text,
	"status" "social"."user_status" DEFAULT 'invited' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clinic_id_id_unique" UNIQUE("clinic_id","id")
);
--> statement-breakpoint
CREATE TABLE "social"."wellness_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"due_date" date,
	"status" "social"."wellness_mission_status" DEFAULT 'assigned' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical"."alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"rule_code" "clinical"."pulse_rule_code" NOT NULL,
	"severity" "clinical"."alert_severity" NOT NULL,
	"status" "clinical"."alert_status" DEFAULT 'open' NOT NULL,
	"inputs_json" jsonb NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"managed_at" timestamp with time zone,
	"managed_by_user_id" uuid,
	"management_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical"."check_in_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"local_time" time NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical"."check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"check_in_date" date NOT NULL,
	"mood" integer NOT NULL,
	"sleep" integer NOT NULL,
	"connected_with_someone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_ins_mood_chk" CHECK ("clinical"."check_ins"."mood" BETWEEN 1 AND 5),
	CONSTRAINT "check_ins_sleep_chk" CHECK ("clinical"."check_ins"."sleep" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "clinical"."match_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"doctor_user_id" uuid NOT NULL,
	"decision" "clinical"."match_decision" NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical"."patient_clinical" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"assigned_doctor_user_id" uuid NOT NULL,
	"consent_status" "clinical"."consent_status" DEFAULT 'pending' NOT NULL,
	"care_status" "clinical"."care_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical"."professional_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"doctor_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical"."risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"level" "clinical"."risk_level" NOT NULL,
	"score" real,
	"rule_codes" "clinical"."pulse_rule_code"[] NOT NULL,
	"inputs_json" jsonb NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_scores_score_chk" CHECK ("clinical"."risk_scores"."score" IS NULL OR ("clinical"."risk_scores"."score" >= 0 AND "clinical"."risk_scores"."score" <= 1)),
	CONSTRAINT "risk_scores_rule_codes_nonempty_chk" CHECK (cardinality("clinical"."risk_scores"."rule_codes") > 0)
);
--> statement-breakpoint
CREATE TABLE "analytics"."clinic_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"metric_date" date NOT NULL,
	"active_patients" integer DEFAULT 0 NOT NULL,
	"check_ins_completed" integer DEFAULT 0 NOT NULL,
	"alerts_low" integer DEFAULT 0 NOT NULL,
	"alerts_medium" integer DEFAULT 0 NOT NULL,
	"alerts_high" integer DEFAULT 0 NOT NULL,
	"matches_pending" integer DEFAULT 0 NOT NULL,
	"matches_approved" integer DEFAULT 0 NOT NULL,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"messages_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_daily_metrics_nonnegative_chk" CHECK ("analytics"."clinic_daily_metrics"."active_patients" >= 0 AND "analytics"."clinic_daily_metrics"."check_ins_completed" >= 0 AND "analytics"."clinic_daily_metrics"."alerts_low" >= 0 AND "analytics"."clinic_daily_metrics"."alerts_medium" >= 0 AND "analytics"."clinic_daily_metrics"."alerts_high" >= 0 AND "analytics"."clinic_daily_metrics"."matches_pending" >= 0 AND "analytics"."clinic_daily_metrics"."matches_approved" >= 0 AND "analytics"."clinic_daily_metrics"."active_connections" >= 0 AND "analytics"."clinic_daily_metrics"."messages_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"event_type" "analytics"."analytics_event_type" NOT NULL,
	"actor_user_id" uuid,
	"subject_user_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."patient_daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_user_id" uuid NOT NULL,
	"metric_date" date NOT NULL,
	"check_in_completed" boolean DEFAULT false NOT NULL,
	"mood_value" integer,
	"sleep_value" integer,
	"active_connections" integer DEFAULT 0 NOT NULL,
	"messages_sent" integer DEFAULT 0 NOT NULL,
	"alerts_count" integer DEFAULT 0 NOT NULL,
	"highest_alert_severity" "analytics"."analytics_severity",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_daily_metrics_mood_value_chk" CHECK ("analytics"."patient_daily_metrics"."mood_value" IS NULL OR ("analytics"."patient_daily_metrics"."mood_value" BETWEEN 1 AND 5)),
	CONSTRAINT "patient_daily_metrics_sleep_value_chk" CHECK ("analytics"."patient_daily_metrics"."sleep_value" IS NULL OR ("analytics"."patient_daily_metrics"."sleep_value" BETWEEN 1 AND 5)),
	CONSTRAINT "patient_daily_metrics_nonnegative_chk" CHECK ("analytics"."patient_daily_metrics"."active_connections" >= 0 AND "analytics"."patient_daily_metrics"."messages_sent" >= 0 AND "analytics"."patient_daily_metrics"."alerts_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "social"."connections" ADD CONSTRAINT "connections_patient_a_fk" FOREIGN KEY ("clinic_id","patient_a_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."connections" ADD CONSTRAINT "connections_patient_b_fk" FOREIGN KEY ("clinic_id","patient_b_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."connections" ADD CONSTRAINT "connections_match_score_fk" FOREIGN KEY ("clinic_id","match_score_id") REFERENCES "social"."match_scores"("clinic_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."conversation_members" ADD CONSTRAINT "conversation_members_conversation_fk" FOREIGN KEY ("clinic_id","conversation_id") REFERENCES "social"."conversations"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."conversation_members" ADD CONSTRAINT "conversation_members_user_fk" FOREIGN KEY ("clinic_id","user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."conversations" ADD CONSTRAINT "conversations_connection_fk" FOREIGN KEY ("clinic_id","connection_id") REFERENCES "social"."connections"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."interests" ADD CONSTRAINT "interests_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "social"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."invitations" ADD CONSTRAINT "invitations_created_by_user_fk" FOREIGN KEY ("clinic_id","created_by_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."match_scores" ADD CONSTRAINT "match_scores_patient_a_fk" FOREIGN KEY ("clinic_id","patient_a_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."match_scores" ADD CONSTRAINT "match_scores_patient_b_fk" FOREIGN KEY ("clinic_id","patient_b_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."message_reports" ADD CONSTRAINT "message_reports_message_fk" FOREIGN KEY ("clinic_id","message_id") REFERENCES "social"."messages"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."message_reports" ADD CONSTRAINT "message_reports_reporter_user_fk" FOREIGN KEY ("clinic_id","reporter_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("clinic_id","conversation_id") REFERENCES "social"."conversations"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."messages" ADD CONSTRAINT "messages_sender_user_fk" FOREIGN KEY ("clinic_id","sender_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."patient_interests" ADD CONSTRAINT "patient_interests_patient_profile_fk" FOREIGN KEY ("clinic_id","patient_profile_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."patient_interests" ADD CONSTRAINT "patient_interests_interest_fk" FOREIGN KEY ("clinic_id","interest_id") REFERENCES "social"."interests"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."patient_profiles" ADD CONSTRAINT "patient_profiles_user_fk" FOREIGN KEY ("clinic_id","user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."profile_embeddings" ADD CONSTRAINT "profile_embeddings_patient_profile_fk" FOREIGN KEY ("clinic_id","patient_profile_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_fk" FOREIGN KEY ("clinic_id","user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."support_groups" ADD CONSTRAINT "support_groups_conversation_fk" FOREIGN KEY ("clinic_id","conversation_id") REFERENCES "social"."conversations"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."swipes" ADD CONSTRAINT "swipes_actor_patient_fk" FOREIGN KEY ("clinic_id","actor_patient_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."swipes" ADD CONSTRAINT "swipes_target_patient_fk" FOREIGN KEY ("clinic_id","target_patient_id") REFERENCES "social"."patient_profiles"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."users" ADD CONSTRAINT "users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "social"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."wellness_missions" ADD CONSTRAINT "wellness_missions_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social"."wellness_missions" ADD CONSTRAINT "wellness_missions_assigned_by_user_fk" FOREIGN KEY ("clinic_id","assigned_by_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."alerts" ADD CONSTRAINT "alerts_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."alerts" ADD CONSTRAINT "alerts_managed_by_user_fk" FOREIGN KEY ("clinic_id","managed_by_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."check_in_preferences" ADD CONSTRAINT "check_in_preferences_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."check_ins" ADD CONSTRAINT "check_ins_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."match_decisions" ADD CONSTRAINT "match_decisions_connection_fk" FOREIGN KEY ("clinic_id","connection_id") REFERENCES "social"."connections"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."match_decisions" ADD CONSTRAINT "match_decisions_doctor_user_fk" FOREIGN KEY ("clinic_id","doctor_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."patient_clinical" ADD CONSTRAINT "patient_clinical_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."patient_clinical" ADD CONSTRAINT "patient_clinical_assigned_doctor_user_fk" FOREIGN KEY ("clinic_id","assigned_doctor_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."professional_notes" ADD CONSTRAINT "professional_notes_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."professional_notes" ADD CONSTRAINT "professional_notes_doctor_user_fk" FOREIGN KEY ("clinic_id","doctor_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical"."risk_scores" ADD CONSTRAINT "risk_scores_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."clinic_daily_metrics" ADD CONSTRAINT "clinic_daily_metrics_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "social"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "social"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_actor_user_fk" FOREIGN KEY ("clinic_id","actor_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."events" ADD CONSTRAINT "events_subject_user_fk" FOREIGN KEY ("clinic_id","subject_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."patient_daily_metrics" ADD CONSTRAINT "patient_daily_metrics_patient_user_fk" FOREIGN KEY ("clinic_id","patient_user_id") REFERENCES "social"."users"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinics_slug_uidx" ON "social"."clinics" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_pair_type_uidx" ON "social"."connections" USING btree ("clinic_id","patient_a_id","patient_b_id","connection_type");--> statement-breakpoint
CREATE INDEX "connections_status_idx" ON "social"."connections" USING btree ("clinic_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_members_unique_uidx" ON "social"."conversation_members" USING btree ("clinic_id","conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "social"."conversation_members" USING btree ("clinic_id","user_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "social"."conversations" USING btree ("clinic_id","status");--> statement-breakpoint
-- Manual: garantiza una sola conversacion directa activa por conexion.
CREATE UNIQUE INDEX "conversations_active_direct_connection_uidx" ON "social"."conversations" USING btree ("clinic_id","connection_id") WHERE "type" = 'direct' AND "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "interests_clinic_slug_uidx" ON "social"."interests" USING btree ("clinic_id","slug");--> statement-breakpoint
CREATE INDEX "interests_clinic_active_idx" ON "social"."interests" USING btree ("clinic_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uidx" ON "social"."invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_clinic_email_idx" ON "social"."invitations" USING btree ("clinic_id","email");--> statement-breakpoint
CREATE INDEX "invitations_status_expires_idx" ON "social"."invitations" USING btree ("clinic_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_scores_pair_uidx" ON "social"."match_scores" USING btree ("clinic_id","patient_a_id","patient_b_id");--> statement-breakpoint
CREATE INDEX "match_scores_clinic_score_idx" ON "social"."match_scores" USING btree ("clinic_id","score");--> statement-breakpoint
CREATE INDEX "message_reports_status_idx" ON "social"."message_reports" USING btree ("clinic_id","status");--> statement-breakpoint
CREATE INDEX "message_reports_created_at_idx" ON "social"."message_reports" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_at_idx" ON "social"."messages" USING btree ("clinic_id","conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_sender_sent_at_idx" ON "social"."messages" USING btree ("clinic_id","sender_user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_interests_unique_uidx" ON "social"."patient_interests" USING btree ("clinic_id","patient_profile_id","interest_id");--> statement-breakpoint
CREATE INDEX "patient_interests_interest_idx" ON "social"."patient_interests" USING btree ("clinic_id","interest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_profiles_clinic_user_uidx" ON "social"."patient_profiles" USING btree ("clinic_id","user_id");--> statement-breakpoint
CREATE INDEX "patient_profiles_clinic_id_idx" ON "social"."patient_profiles" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "patient_profiles_clinic_city_idx" ON "social"."patient_profiles" USING btree ("clinic_id","city");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_embeddings_profile_model_uidx" ON "social"."profile_embeddings" USING btree ("clinic_id","patient_profile_id","embedding_model");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_uidx" ON "social"."refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_clinic_user_idx" ON "social"."refresh_tokens" USING btree ("clinic_id","user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "social"."refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_groups_conversation_uidx" ON "social"."support_groups" USING btree ("clinic_id","conversation_id");--> statement-breakpoint
CREATE INDEX "support_groups_status_idx" ON "social"."support_groups" USING btree ("clinic_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "swipes_actor_target_uidx" ON "social"."swipes" USING btree ("clinic_id","actor_patient_id","target_patient_id");--> statement-breakpoint
CREATE INDEX "swipes_target_idx" ON "social"."swipes" USING btree ("clinic_id","target_patient_id");--> statement-breakpoint
CREATE INDEX "users_clinic_id_idx" ON "social"."users" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "users_clinic_role_idx" ON "social"."users" USING btree ("clinic_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clinic_email_lower_uidx" ON "social"."users" USING btree ("clinic_id",lower("email"));--> statement-breakpoint
CREATE INDEX "wellness_missions_patient_status_idx" ON "social"."wellness_missions" USING btree ("clinic_id","patient_user_id","status");--> statement-breakpoint
CREATE INDEX "wellness_missions_due_date_idx" ON "social"."wellness_missions" USING btree ("clinic_id","due_date");--> statement-breakpoint
CREATE INDEX "alerts_triage_idx" ON "clinical"."alerts" USING btree ("clinic_id","status","severity","triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_patient_triggered_idx" ON "clinical"."alerts" USING btree ("clinic_id","patient_user_id","triggered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_preferences_patient_uidx" ON "clinical"."check_in_preferences" USING btree ("clinic_id","patient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_patient_date_uidx" ON "clinical"."check_ins" USING btree ("clinic_id","patient_user_id","check_in_date");--> statement-breakpoint
CREATE INDEX "check_ins_patient_date_idx" ON "clinical"."check_ins" USING btree ("clinic_id","patient_user_id","check_in_date");--> statement-breakpoint
-- Manual: soporta lecturas del pulso por paciente con fecha descendente.
CREATE INDEX "check_ins_patient_date_desc_idx" ON "clinical"."check_ins" USING btree ("clinic_id","patient_user_id","check_in_date" DESC);--> statement-breakpoint
CREATE INDEX "match_decisions_connection_created_idx" ON "clinical"."match_decisions" USING btree ("clinic_id","connection_id","created_at");--> statement-breakpoint
CREATE INDEX "match_decisions_doctor_created_idx" ON "clinical"."match_decisions" USING btree ("clinic_id","doctor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_clinical_patient_uidx" ON "clinical"."patient_clinical" USING btree ("clinic_id","patient_user_id");--> statement-breakpoint
CREATE INDEX "patient_clinical_doctor_idx" ON "clinical"."patient_clinical" USING btree ("clinic_id","assigned_doctor_user_id");--> statement-breakpoint
CREATE INDEX "professional_notes_patient_created_idx" ON "clinical"."professional_notes" USING btree ("clinic_id","patient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "risk_scores_patient_evaluated_idx" ON "clinical"."risk_scores" USING btree ("clinic_id","patient_user_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "risk_scores_level_idx" ON "clinical"."risk_scores" USING btree ("clinic_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_daily_metrics_date_uidx" ON "analytics"."clinic_daily_metrics" USING btree ("clinic_id","metric_date");--> statement-breakpoint
CREATE INDEX "clinic_daily_metrics_metric_date_idx" ON "analytics"."clinic_daily_metrics" USING btree ("clinic_id","metric_date");--> statement-breakpoint
CREATE INDEX "events_event_time_idx" ON "analytics"."events" USING btree ("clinic_id","event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "events_actor_time_idx" ON "analytics"."events" USING btree ("clinic_id","actor_user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_daily_metrics_patient_date_uidx" ON "analytics"."patient_daily_metrics" USING btree ("clinic_id","patient_user_id","metric_date");--> statement-breakpoint
CREATE INDEX "patient_daily_metrics_patient_date_idx" ON "analytics"."patient_daily_metrics" USING btree ("clinic_id","patient_user_id","metric_date");
