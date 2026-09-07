CREATE TABLE "app"."feedback_link" (
	"feedback_id" text PRIMARY KEY NOT NULL,
	"master_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."quality_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"status" text NOT NULL,
	"summary" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."quality_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"bundle_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."quality_bundle" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"executable_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."quality_case" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sources" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."quality_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"input_hash" text NOT NULL,
	"sources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."feedback_link" ADD CONSTRAINT "feedback_link_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "app"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."feedback_link" ADD CONSTRAINT "feedback_link_master_id_feedback_id_fk" FOREIGN KEY ("master_id") REFERENCES "app"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quality_attempt" ADD CONSTRAINT "quality_attempt_case_id_quality_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "app"."quality_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."quality_case" ADD CONSTRAINT "quality_case_batch_id_quality_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "app"."quality_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_link_master_idx" ON "app"."feedback_link" USING btree ("master_id");--> statement-breakpoint
CREATE INDEX "quality_attempt_case_idx" ON "app"."quality_attempt" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "quality_batch_status_idx" ON "app"."quality_batch" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "quality_case_batch_idx" ON "app"."quality_case" USING btree ("batch_id");