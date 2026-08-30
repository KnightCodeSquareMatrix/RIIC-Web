CREATE TABLE "app"."plan_cache" (
	"key_hmac" text PRIMARY KEY NOT NULL,
	"solver_executable_sha256" text NOT NULL,
	"protocol_version" integer NOT NULL,
	"plan_schema_version" integer NOT NULL,
	"public_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"hit_count" bigint DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."plan_cache_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"cache_key_hmac" text NOT NULL,
	"diagnostic_id" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."plan_cache_reference" ADD CONSTRAINT "plan_cache_reference_cache_key_hmac_plan_cache_key_hmac_fk" FOREIGN KEY ("cache_key_hmac") REFERENCES "app"."plan_cache"("key_hmac") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_cache_reference" ADD CONSTRAINT "plan_cache_reference_diagnostic_id_plan_run_diagnostic_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "app"."plan_run"("diagnostic_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."plan_cache_reference" ADD CONSTRAINT "plan_cache_reference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_cache_expires_at_idx" ON "app"."plan_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "plan_cache_lease_expires_at_idx" ON "app"."plan_cache" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_cache_reference_cache_run_uidx" ON "app"."plan_cache_reference" USING btree ("cache_key_hmac","diagnostic_id");--> statement-breakpoint
CREATE INDEX "plan_cache_reference_user_idx" ON "app"."plan_cache_reference" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_cache_reference_diagnostic_idx" ON "app"."plan_cache_reference" USING btree ("diagnostic_id");