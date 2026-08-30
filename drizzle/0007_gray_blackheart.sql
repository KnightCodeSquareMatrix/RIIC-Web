CREATE TABLE "app"."telemetry_event" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"data_owner_tag" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"duration_ms" integer,
	"value" integer,
	"page" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."telemetry_event" ADD CONSTRAINT "telemetry_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_event_created_at_idx" ON "app"."telemetry_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "telemetry_event_type_created_at_idx" ON "app"."telemetry_event" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_event_name_created_at_idx" ON "app"."telemetry_event" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_event_user_created_at_idx" ON "app"."telemetry_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "telemetry_event_owner_created_at_idx" ON "app"."telemetry_event" USING btree ("data_owner_tag","created_at");