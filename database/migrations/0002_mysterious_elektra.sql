CREATE TABLE "erp_private"."document_numbers" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."document_numbers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."import_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_reference" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"commercial" jsonb NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"current_snapshot_version" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_cases_draft_reference_unique" UNIQUE("draft_reference"),
	CONSTRAINT "import_status" CHECK ("erp_private"."import_cases"."status" in ('Draft','PI Received','LC/TT Opened','In Production','Shipped','At Port','Costing','Cost Finalized','Partially Received','Received','Closed','Cancelled'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."import_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."import_cost_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"amount_foreign" numeric(24, 6) NOT NULL,
	"exchange_rate" numeric(18, 6) NOT NULL,
	"amount_bdt" numeric(24, 2) NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."import_cost_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."import_items" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"currency" text NOT NULL,
	"fob_unit_foreign" numeric(18, 6) NOT NULL,
	"exchange_rate" numeric(18, 6) NOT NULL,
	"fob_total_bdt" numeric(24, 2) NOT NULL,
	"cbm_per_carton" numeric(18, 8) NOT NULL,
	"carton_count" numeric(18, 4) NOT NULL,
	"total_cbm" numeric(18, 8) NOT NULL,
	"cbm_mode" text NOT NULL,
	"hs_code" text DEFAULT '' NOT NULL,
	CONSTRAINT "import_item_nonnegative" CHECK ("erp_private"."import_items"."quantity" > 0 and "erp_private"."import_items"."fob_unit_foreign" >= 0 and "erp_private"."import_items"."exchange_rate" >= 0 and "erp_private"."import_items"."fob_total_bdt" >= 0 and "erp_private"."import_items"."total_cbm" >= 0 and "erp_private"."import_items"."carton_count" >= 0 and "erp_private"."import_items"."cbm_per_carton" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."import_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."landed_cost_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"total_product_value_bdt" numeric(24, 2) NOT NULL,
	"total_additional_cost_bdt" numeric(24, 2) NOT NULL,
	"total_shipment_cost_bdt" numeric(24, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."landed_cost_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."posting_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"resource_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."posting_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."products" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"family" text NOT NULL,
	"variant" text NOT NULL,
	"unit" text NOT NULL,
	"hs_code" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"standard_sale_price" numeric(24, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_price_positive" CHECK ("erp_private"."products"."standard_sale_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."receipt_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"import_item_id" text NOT NULL,
	"quantity_received" numeric(18, 4) NOT NULL,
	"quantity_rejected" numeric(18, 4) NOT NULL,
	"lot_number" text NOT NULL,
	"batch_number" text NOT NULL,
	"manufacturing_date" date,
	"expiry_date" date,
	"warehouse" text NOT NULL,
	"location" text NOT NULL,
	"landed_cost_per_unit" numeric(28, 10) NOT NULL,
	"inventory_value_bdt" numeric(24, 2) NOT NULL,
	CONSTRAINT "receipt_quantity" CHECK ("erp_private"."receipt_lines"."quantity_received" >= 0 and "erp_private"."receipt_lines"."quantity_rejected" >= 0 and "erp_private"."receipt_lines"."quantity_received" + "erp_private"."receipt_lines"."quantity_rejected" > 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."receipt_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"receipt_line_id" text NOT NULL,
	"source_import_id" text NOT NULL,
	"source_reference" text NOT NULL,
	"lot_number" text NOT NULL,
	"batch_number" text NOT NULL,
	"manufacturing_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"received_date" date NOT NULL,
	"quantity_received" numeric(18, 4) NOT NULL,
	"quantity_available" numeric(18, 4) NOT NULL,
	"landed_cost_per_unit" numeric(28, 10) NOT NULL,
	"received_value_bdt" numeric(24, 2) NOT NULL,
	"available_value_bdt" numeric(24, 2) NOT NULL,
	"warehouse" text NOT NULL,
	"location" text NOT NULL,
	CONSTRAINT "stock_batches_receipt_line_id_unique" UNIQUE("receipt_line_id"),
	CONSTRAINT "batch_integrity" CHECK ("erp_private"."stock_batches"."quantity_received" > 0 and "erp_private"."stock_batches"."quantity_available" >= 0 and "erp_private"."stock_batches"."quantity_available" <= "erp_private"."stock_batches"."quantity_received" and "erp_private"."stock_batches"."available_value_bdt" >= 0 and "erp_private"."stock_batches"."expiry_date" > "erp_private"."stock_batches"."manufacturing_date")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"value_bdt" numeric(24, 2) NOT NULL,
	"date" date NOT NULL,
	"reference" text NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_quantity" CHECK ("erp_private"."stock_movements"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"contact_person" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."warehouse_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"receipt_number" text NOT NULL,
	"received_date" date NOT NULL,
	"received_by" text NOT NULL,
	"received_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."import_cases" ADD CONSTRAINT "import_cases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "erp_private"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."import_cases" ADD CONSTRAINT "import_cases_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."import_cost_lines" ADD CONSTRAINT "import_cost_lines_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."import_items" ADD CONSTRAINT "import_items_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."import_items" ADD CONSTRAINT "import_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."landed_cost_snapshots" ADD CONSTRAINT "landed_cost_snapshots_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_warehouse_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "erp_private"."warehouse_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."receipt_lines" ADD CONSTRAINT "receipt_lines_import_item_id_import_items_id_fk" FOREIGN KEY ("import_item_id") REFERENCES "erp_private"."import_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "erp_private"."receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_source_import_id_import_cases_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD CONSTRAINT "stock_movements_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD CONSTRAINT "stock_movements_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_receipts" ADD CONSTRAINT "warehouse_receipts_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_receipts" ADD CONSTRAINT "warehouse_receipts_received_by_employees_id_fk" FOREIGN KEY ("received_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_supplier_created_idx" ON "erp_private"."import_cases" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "cost_import_idx" ON "erp_private"."import_cost_lines" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "import_item_case_idx" ON "erp_private"."import_items" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_case_version_unique" ON "erp_private"."landed_cost_snapshots" USING btree ("import_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "product_code_lower_unique" ON "erp_private"."products" USING btree (lower("code"));--> statement-breakpoint
CREATE INDEX "receipt_line_item_idx" ON "erp_private"."receipt_lines" USING btree ("import_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_number_lower_unique" ON "erp_private"."stock_batches" USING btree (lower("batch_number"));--> statement-breakpoint
CREATE INDEX "batch_fifo_idx" ON "erp_private"."stock_batches" USING btree ("product_id","received_date","id");--> statement-breakpoint
CREATE INDEX "movement_batch_idx" ON "erp_private"."stock_movements" USING btree ("batch_id","date");--> statement-breakpoint
CREATE INDEX "receipt_import_idx" ON "erp_private"."warehouse_receipts" USING btree ("import_id");