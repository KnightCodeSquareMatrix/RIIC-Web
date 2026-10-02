CREATE TABLE "app"."billing_wallet" (
	"user_id" text PRIMARY KEY NOT NULL,
	"paid_points" integer DEFAULT 0 NOT NULL,
	"monthly_points" integer DEFAULT 0 NOT NULL,
	"monthly_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "app"."billing_order" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"provider" text DEFAULT 'afdian' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_fen" integer NOT NULL,
	"points" integer NOT NULL,
	"custom_order_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_order_id" text,
	"payment_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "app"."billing_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"points_delta" integer NOT NULL,
	"paid_points_after" integer NOT NULL,
	"monthly_points_after" integer NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "app"."agent_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"run_id" text,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"upstream_cost_rmb_fen" integer,
	"charged_cost_rmb_fen" integer,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "agent_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE "app"."billing_cdk" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"issuer_user_id" text NOT NULL,
	"redeemer_user_id" text,
	"points" integer NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_at" timestamp with time zone,
	CONSTRAINT "billing_cdk_issuer_user_id_user_id_fk" FOREIGN KEY ("issuer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
	CONSTRAINT "billing_cdk_redeemer_user_id_user_id_fk" FOREIGN KEY ("redeemer_user_id") REFERENCES "public"."user"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_order_custom_order_uidx" ON "app"."billing_order" USING btree ("custom_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_order_idempotency_uidx" ON "app"."billing_order" USING btree ("user_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "billing_order_user_created_idx" ON "app"."billing_order" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "billing_order_status_created_idx" ON "app"."billing_order" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_ledger_idempotency_uidx" ON "app"."billing_ledger" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "billing_ledger_user_created_idx" ON "app"."billing_ledger" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_usage_idempotency_uidx" ON "app"."agent_usage" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "agent_usage_user_created_idx" ON "app"."agent_usage" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cdk_code_hash_uidx" ON "app"."billing_cdk" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "billing_cdk_issuer_created_idx" ON "app"."billing_cdk" USING btree ("issuer_user_id","created_at");
