CREATE TABLE "app"."operbox_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"content_hmac" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"payload_iv" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"wrapped_key_iv" text NOT NULL,
	"key_version" text NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."saved_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"diagnostic_id" text NOT NULL,
	"title" text NOT NULL,
	"public_result" jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."user_workspace" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_revision" bigint DEFAULT 1 NOT NULL,
	"state" jsonb NOT NULL,
	"operbox_snapshot_id" text,
	"current_saved_plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."workspace_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"state" jsonb NOT NULL,
	"operbox_snapshot_id" text,
	"saved_plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."operbox_snapshot" ADD CONSTRAINT "operbox_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."saved_plan" ADD CONSTRAINT "saved_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_workspace" ADD CONSTRAINT "user_workspace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_workspace" ADD CONSTRAINT "user_workspace_operbox_snapshot_id_operbox_snapshot_id_fk" FOREIGN KEY ("operbox_snapshot_id") REFERENCES "app"."operbox_snapshot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."user_workspace" ADD CONSTRAINT "user_workspace_current_saved_plan_id_saved_plan_id_fk" FOREIGN KEY ("current_saved_plan_id") REFERENCES "app"."saved_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_revision" ADD CONSTRAINT "workspace_revision_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_revision" ADD CONSTRAINT "workspace_revision_operbox_snapshot_id_operbox_snapshot_id_fk" FOREIGN KEY ("operbox_snapshot_id") REFERENCES "app"."operbox_snapshot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."workspace_revision" ADD CONSTRAINT "workspace_revision_saved_plan_id_saved_plan_id_fk" FOREIGN KEY ("saved_plan_id") REFERENCES "app"."saved_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operbox_snapshot_user_created_at_idx" ON "app"."operbox_snapshot" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "operbox_snapshot_expires_at_idx" ON "app"."operbox_snapshot" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operbox_snapshot_user_content_hmac_uidx" ON "app"."operbox_snapshot" USING btree ("user_id","content_hmac");--> statement-breakpoint
CREATE INDEX "saved_plan_user_created_at_idx" ON "app"."saved_plan" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_plan_user_pinned_created_at_idx" ON "app"."saved_plan" USING btree ("user_id","pinned","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_plan_user_diagnostic_id_uidx" ON "app"."saved_plan" USING btree ("user_id","diagnostic_id");--> statement-breakpoint
CREATE INDEX "user_workspace_updated_at_idx" ON "app"."user_workspace" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_revision_user_revision_uidx" ON "app"."workspace_revision" USING btree ("user_id","revision");--> statement-breakpoint
CREATE INDEX "workspace_revision_user_created_at_idx" ON "app"."workspace_revision" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_revision_expires_at_idx" ON "app"."workspace_revision" USING btree ("expires_at");