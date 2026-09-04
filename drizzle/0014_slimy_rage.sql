CREATE TABLE "app"."skill_annotation" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"note" text NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."skill_annotation" ADD CONSTRAINT "skill_annotation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."skill_annotation" ADD CONSTRAINT "skill_annotation_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_annotation_operator_skill_uidx" ON "app"."skill_annotation" USING btree ("operator_id","skill_id");--> statement-breakpoint
CREATE INDEX "skill_annotation_updated_at_idx" ON "app"."skill_annotation" USING btree ("updated_at");