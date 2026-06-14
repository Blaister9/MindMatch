ALTER TABLE "clinical"."alerts" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "clinical"."check_in_preferences" ADD COLUMN "enabled_on" date;--> statement-breakpoint
CREATE TABLE "social"."demo_clocks" (
	"clinic_id" uuid PRIMARY KEY NOT NULL,
	"current_date" date NOT NULL,
	"last_request_id" uuid,
	"last_result_json" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "social"."demo_clocks" ADD CONSTRAINT "demo_clocks_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "social"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "clinical"."check_in_preferences"
SET "enabled_on" = CASE
	WHEN "enabled" = true THEN (("created_at" AT TIME ZONE 'America/Bogota')::date)
	ELSE NULL
END;--> statement-breakpoint
DO $$
DECLARE
  invalid_ids uuid[];
  duplicate_refs text[];
BEGIN
  SELECT array_agg(id)
  INTO invalid_ids
  FROM "clinical"."alerts"
  WHERE "rule_code" = 'R6'
    AND (
      "inputs_json" ->> 'messageReportId' IS NULL
      OR NOT (("inputs_json" ->> 'messageReportId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    );

  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid R6 alert inputs_json.messageReportId for alert ids: %', invalid_ids;
  END IF;

  SELECT array_agg(report_ref)
  INTO duplicate_refs
  FROM (
    SELECT "inputs_json" ->> 'messageReportId' AS report_ref
    FROM "clinical"."alerts"
    WHERE "rule_code" = 'R6'
    GROUP BY report_ref
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_refs IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate R6 alerts for message report ids: %', duplicate_refs;
  END IF;
END $$;--> statement-breakpoint
UPDATE "clinical"."alerts"
SET "dedupe_key" = 'R6:' || ("inputs_json" ->> 'messageReportId')
WHERE "rule_code" = 'R6'
  AND "dedupe_key" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_episode_dedupe_uidx" ON "clinical"."alerts" USING btree ("clinic_id","patient_user_id","rule_code","dedupe_key") WHERE "clinical"."alerts"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "alerts_patient_rule_status_idx" ON "clinical"."alerts" USING btree ("clinic_id","patient_user_id","rule_code","status","triggered_at");--> statement-breakpoint
CREATE INDEX "check_ins_clinic_date_idx" ON "clinical"."check_ins" USING btree ("clinic_id","check_in_date");
