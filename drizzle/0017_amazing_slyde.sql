CREATE TABLE "app"."agent_plan_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" jsonb NOT NULL,
	"meta" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."agent_plan_artifact" ADD CONSTRAINT "agent_plan_artifact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_plan_artifact_user_created_at_idx" ON "app"."agent_plan_artifact" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_plan_artifact_expires_at_idx" ON "app"."agent_plan_artifact" USING btree ("expires_at");