ALTER TABLE "app"."telemetry_event" DROP CONSTRAINT "telemetry_event_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "app"."telemetry_event" ADD CONSTRAINT "telemetry_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telemetry_event_expires_at_idx" ON "app"."telemetry_event" USING btree ("expires_at");