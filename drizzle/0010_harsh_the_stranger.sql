ALTER TABLE "app"."plan_task" DROP CONSTRAINT "plan_task_status_check";--> statement-breakpoint
ALTER TABLE "app"."plan_task" DROP CONSTRAINT "plan_task_payload_lifecycle_check";--> statement-breakpoint
DROP INDEX "app"."plan_task_one_active_per_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "plan_task_one_active_per_user_idx" ON "app"."plan_task" USING btree ("user_id") WHERE "app"."plan_task"."status" in ('buffered', 'pending', 'running');--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD CONSTRAINT "plan_task_status_check" CHECK ("app"."plan_task"."status" in ('buffered', 'pending', 'running', 'done', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "app"."plan_task" ADD CONSTRAINT "plan_task_payload_lifecycle_check" CHECK ((
    ("app"."plan_task"."status" in ('buffered', 'pending', 'running')
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
  ));