CREATE TABLE "app"."plan_task" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_class" text NOT NULL,
	"request_ip_hmac" text NOT NULL,
	"status" text NOT NULL,
	"encrypted_payload" text,
	"payload_iv" text,
	"wrapped_data_key" text,
	"wrapped_key_iv" text,
	"key_version" text,
	"schema_version" integer,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "plan_task_status_check" CHECK ("app"."plan_task"."status" in ('pending', 'running', 'done', 'failed', 'cancelled')),
	CONSTRAINT "plan_task_account_class_check" CHECK ("app"."plan_task"."account_class" in ('new', 'established')),
	CONSTRAINT "plan_task_payload_lifecycle_check" CHECK ((
    ("app"."plan_task"."status" in ('pending', 'running')
      and "app"."plan_task"."encrypted_payload" is not null
      and "app"."plan_task"."payload_iv" is not null
      and "app"."plan_task"."wrapped_data_key" is not null
      and "app"."plan_task"."wrapped_key_iv" is not null
      and "app"."plan_task"."key_version" is not null
      and "app"."plan_task"."schema_version" is not null)
    or
    ("app"."plan_task"."status" in ('done', 'failed', 'cancelled')
      and "app"."plan_task"."encrypted_payload" is null
      and "app"."plan_task"."payload_iv" is null
      and "app"."plan_task"."wrapped_data_key" is null
      and "app"."plan_task"."wrapped_key_iv" is null
      and "app"."plan_task"."key_version" is null
      and "app"."plan_task"."schema_version" is null)
  ))
);
--> statement-breakpoint
CREATE TABLE "app"."plan_worker_heartbeat" (
	"id" text PRIMARY KEY NOT NULL,
	"release_sha" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD CONSTRAINT "plan_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_task_claim_idx" ON "app"."plan_task" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "plan_task_expires_at_idx" ON "app"."plan_task" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "plan_task_ip_created_at_idx" ON "app"."plan_task" USING btree ("request_ip_hmac","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_task_one_active_per_user_idx" ON "app"."plan_task" USING btree ("user_id") WHERE "app"."plan_task"."status" in ('pending', 'running');