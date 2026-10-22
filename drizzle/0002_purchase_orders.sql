CREATE TABLE "purchase_order_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"recommendation_id" integer NOT NULL,
	"sku_id" text NOT NULL,
	"sku_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"uom" text NOT NULL,
	"final_action" text NOT NULL,
	"was_overridden" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"run_id" integer NOT NULL,
	"distributor_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"po_date" date NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_by" text,
	"status_changed_at" timestamp with time zone,
	"zoho_purchaseorder_id" text,
	"zoho_synced_at" timestamp with time zone,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_sku_id_skus_sku_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("sku_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_distributor_id_distributors_distributor_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("distributor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pol_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "pol_rec_idx" ON "purchase_order_lines" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "po_run_idx" ON "purchase_orders" USING btree ("run_id");