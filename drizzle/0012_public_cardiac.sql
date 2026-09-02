ALTER TABLE "app"."plan_run" ADD COLUMN "execution_source" text;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "solver_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "worker_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "artifact_status" text;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "artifact_finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD COLUMN "solver_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD COLUMN "solver_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD COLUMN "execution_source" text;--> statement-breakpoint
ALTER TABLE "app"."plan_worker_heartbeat" ADD COLUMN "solver_lanes" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plan_worker_heartbeat" ADD COLUMN "pipeline_depth" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plan_worker_heartbeat" ADD COLUMN "in_flight" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."plan_worker_heartbeat" ADD COLUMN "service_time_ewma_ms" integer;
