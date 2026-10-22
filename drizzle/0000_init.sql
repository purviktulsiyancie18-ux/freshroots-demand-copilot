CREATE TABLE "ai_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar" (
	"year_month" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"is_festival" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cleaning_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"sheet" text,
	"row_num" integer,
	"column_name" text,
	"before" text,
	"after" text,
	"fix_type" text,
	"level" text NOT NULL,
	"message" text,
	"sku_id" text
);
--> statement-breakpoint
CREATE TABLE "distributors" (
	"distributor_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku_id" text NOT NULL,
	"location" text NOT NULL,
	"units_on_hand" integer NOT NULL,
	"as_of_date" date NOT NULL,
	"upload_id" integer
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"recommendation_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"run_id" integer NOT NULL,
	"original_action" text NOT NULL,
	"original_qty" integer NOT NULL,
	"new_action" text NOT NULL,
	"new_qty" integer NOT NULL,
	"reason_code" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"avg4" double precision NOT NULL,
	"avg12" double precision NOT NULL,
	"is_festival" boolean NOT NULL,
	"adjusted_weekly" double precision NOT NULL,
	"units_on_hand" integer NOT NULL,
	"weeks_of_cover" double precision,
	"flags" text[] NOT NULL,
	"action" text NOT NULL,
	"recommended_qty" integer NOT NULL,
	"rule_trace" text NOT NULL,
	"needs_judgment_by_rule" boolean NOT NULL,
	"forecast_weekly" integer[],
	"ai_reason" text,
	"ai_tag" text,
	"ai_judgment_reason" text,
	"ai_confidence" text,
	"ai_unavailable" boolean DEFAULT false NOT NULL,
	"final_tag" text DEFAULT 'NEEDS_JUDGMENT' NOT NULL,
	"judgment_triggers" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"final_action" text,
	"final_qty" integer,
	"decided_by" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rule_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" numeric NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_config_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"old_value" numeric,
	"new_value" numeric NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" integer NOT NULL,
	"run_date" date NOT NULL,
	"status" text DEFAULT 'parsing' NOT NULL,
	"config_snapshot" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" jsonb,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"sku_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"perishability" text NOT NULL,
	"standard_reorder_qty" integer NOT NULL,
	"uom" text NOT NULL,
	"distributor_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_names" text[] NOT NULL,
	"raw_blob_ref" text,
	"raw_rows" jsonb,
	"status" text DEFAULT 'received' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_sales" (
	"sku_id" text NOT NULL,
	"iso_week" text NOT NULL,
	"units_sold" integer NOT NULL,
	"upload_id" integer,
	CONSTRAINT "weekly_sales_sku_id_iso_week_pk" PRIMARY KEY("sku_id","iso_week")
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaning_log" ADD CONSTRAINT "cleaning_log_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_distributor_id_distributors_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("distributor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sales" ADD CONSTRAINT "weekly_sales_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_sales" ADD CONSTRAINT "weekly_sales_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cleaning_run_idx" ON "cleaning_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "inv_upload_idx" ON "inventory_snapshots" USING btree ("upload_id");--> statement-breakpoint
CREATE INDEX "ovr_sku_idx" ON "overrides" USING btree ("sku_id");--> statement-breakpoint
CREATE INDEX "rec_run_idx" ON "recommendations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "rec_sku_idx" ON "recommendations" USING btree ("sku_id");