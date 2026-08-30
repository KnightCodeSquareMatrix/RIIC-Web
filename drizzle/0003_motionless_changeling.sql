CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE TABLE "app"."feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"diagnostic_id" text NOT NULL,
	"plan_run_diagnostic_id" text,
	"user_id" text,
	"kind" text NOT NULL,
	"room" jsonb,
	"note" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"artifact_key" text,
	"artifact_bytes" bigint,
	"artifact_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."feedback_event" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"actor_user_id" text,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."plan_run" (
	"diagnostic_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"data_owner_tag" text,
	"source_type" text NOT NULL,
	"status" text NOT NULL,
	"layout_template" text NOT NULL,
	"room_count" integer NOT NULL,
	"operator_count" integer NOT NULL,
	"rotation" text NOT NULL,
	"fiammetta_enable" boolean NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"solver_executable_sha256" text,
	"protocol_version" integer,
	"plan_schema_version" integer,
	"artifact_key" text,
	"artifact_bytes" bigint,
	"artifact_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."policy_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."feedback" ADD CONSTRAINT "feedback_plan_run_diagnostic_id_plan_run_diagnostic_id_fk" FOREIGN KEY ("plan_run_diagnostic_id") REFERENCES "app"."plan_run"("diagnostic_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_event" ADD CONSTRAINT "feedback_event_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "app"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_event" ADD CONSTRAINT "feedback_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD CONSTRAINT "plan_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."policy_consent" ADD CONSTRAINT "policy_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_created_at_idx" ON "app"."feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_status_created_at_idx" ON "app"."feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_diagnostic_id_idx" ON "app"."feedback" USING btree ("diagnostic_id");--> statement-breakpoint
CREATE INDEX "feedback_user_created_at_idx" ON "app"."feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_event_feedback_created_at_idx" ON "app"."feedback_event" USING btree ("feedback_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_run_created_at_idx" ON "app"."plan_run" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "plan_run_status_created_at_idx" ON "app"."plan_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "plan_run_error_code_created_at_idx" ON "app"."plan_run" USING btree ("error_code","created_at");--> statement-breakpoint
CREATE INDEX "plan_run_solver_created_at_idx" ON "app"."plan_run" USING btree ("solver_executable_sha256","created_at");--> statement-breakpoint
CREATE INDEX "plan_run_user_created_at_idx" ON "app"."plan_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_consent_user_versions_uidx" ON "app"."policy_consent" USING btree ("user_id","terms_version","privacy_version");--> statement-breakpoint
CREATE INDEX "policy_consent_user_accepted_at_idx" ON "app"."policy_consent" USING btree ("user_id","accepted_at");
