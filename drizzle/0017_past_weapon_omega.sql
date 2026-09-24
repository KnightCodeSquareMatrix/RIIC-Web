CREATE TABLE "game_report" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_key" text NOT NULL,
	"source_type" text NOT NULL,
	"days" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_report_source_type_check" CHECK ("game_report"."source_type" IN ('screenshot', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "game_report" ADD CONSTRAINT "game_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_report_user_role_created_idx" ON "game_report" USING btree ("user_id","role_key","created_at");