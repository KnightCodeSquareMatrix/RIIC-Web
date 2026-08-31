CREATE TABLE "app"."plan_task" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD CONSTRAINT "plan_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_task_claim_idx" ON "app"."plan_task" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_task_one_active_per_user_idx" ON "app"."plan_task" USING btree ("user_id") WHERE "app"."plan_task"."user_id" is not null and "app"."plan_task"."status" in ('pending', 'running');