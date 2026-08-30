ALTER TABLE "app"."plan_run" ADD COLUMN "calculation_context" jsonb;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "public_result_sha256" text;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "operbox_content_hmac" text;--> statement-breakpoint
ALTER TABLE "app"."plan_run" ADD COLUMN "operbox_hmac_key_version" text;--> statement-breakpoint
ALTER TABLE "app"."saved_plan" ADD COLUMN "calculation_context" jsonb;--> statement-breakpoint
ALTER TABLE "app"."saved_plan" ADD COLUMN "operbox_content_hmac" text;--> statement-breakpoint
ALTER TABLE "app"."saved_plan" ADD COLUMN "operbox_hmac_key_version" text;