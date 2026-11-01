CREATE TABLE "erp_private"."account_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"date" date NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"collection_id" text,
	"reversal_of_id" text,
	"description" text NOT NULL,
	"party_id" text,
	"party_name" text,
	"reference" text,
	"remarks" text,
	"voucher_number" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_transactions_reversal_of_id_unique" UNIQUE("reversal_of_id"),
	CONSTRAINT "account_transactions_voucher_number_unique" UNIQUE("voucher_number"),
	CONSTRAINT "account_transaction_values" CHECK ("erp_private"."account_transactions"."amount" > 0 and "erp_private"."account_transactions"."direction" in ('In','Out'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."cash_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"account_number" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "cash_account_type" CHECK ("erp_private"."cash_accounts"."type" in ('Cash','Bank','Mobile Banking'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."cash_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."collection_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"receivable_entry_id" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	CONSTRAINT "allocation_positive" CHECK ("erp_private"."collection_allocations"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."collection_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."collections" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"order_id" text,
	"invoice_id" text,
	"owner_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"payment_mode" text NOT NULL,
	"account_id" text NOT NULL,
	"reference_number" text DEFAULT '' NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Posted' NOT NULL,
	"posted_by" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	CONSTRAINT "collections_receipt_number_unique" UNIQUE("receipt_number"),
	CONSTRAINT "collection_amount" CHECK ("erp_private"."collections"."amount" > 0),
	CONSTRAINT "collection_status" CHECK ("erp_private"."collections"."status" in ('Posted','Reversed')),
	CONSTRAINT "collection_payment_mode" CHECK ("erp_private"."collections"."payment_mode" in ('Cash','bKash','Bank Transfer','Cheque'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"challan_number" text NOT NULL,
	"order_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"owner_id" text NOT NULL,
	"date" date NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"receiver_name" text DEFAULT '' NOT NULL,
	"override_reason" text DEFAULT '' NOT NULL,
	"dispatched_by" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_challan_number_unique" UNIQUE("challan_number")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."delivery_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"product_id" text NOT NULL,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount" numeric(24, 2) NOT NULL,
	"line_total" numeric(24, 2) NOT NULL,
	"delivery_id" text NOT NULL,
	"order_line_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"batch_number" text NOT NULL,
	"stock_movement_id" text NOT NULL,
	"cost_bdt" numeric(24, 2) NOT NULL,
	CONSTRAINT "delivery_lines_stock_movement_id_unique" UNIQUE("stock_movement_id"),
	CONSTRAINT "delivery_line_values" CHECK ("erp_private"."delivery_lines"."quantity" > 0 and "erp_private"."delivery_lines"."unit_price" >= 0 and "erp_private"."delivery_lines"."discount" >= 0 and "erp_private"."delivery_lines"."line_total" >= 0 and "erp_private"."delivery_lines"."cost_bdt" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."delivery_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."invoice_deliveries" (
	"invoice_id" text NOT NULL,
	"delivery_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"product_id" text NOT NULL,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount" numeric(24, 2) NOT NULL,
	"line_total" numeric(24, 2) NOT NULL,
	"invoice_id" text NOT NULL,
	"delivery_line_id" text NOT NULL,
	CONSTRAINT "invoice_line_values" CHECK ("erp_private"."invoice_lines"."quantity" > 0 and "erp_private"."invoice_lines"."unit_price" >= 0 and "erp_private"."invoice_lines"."discount" >= 0 and "erp_private"."invoice_lines"."line_total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."sales_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"order_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"date" date NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"subtotal" numeric(24, 2) NOT NULL,
	"discount_total" numeric(24, 2) NOT NULL,
	"total" numeric(24, 2) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"cancelled_by" text,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoice_status" CHECK ("erp_private"."sales_invoices"."status" in ('Draft','Approved','Cancelled')),
	CONSTRAINT "invoice_totals" CHECK ("erp_private"."sales_invoices"."subtotal" >= 0 and "erp_private"."sales_invoices"."discount_total" >= 0 and "erp_private"."sales_invoices"."total" = "erp_private"."sales_invoices"."subtotal" - "erp_private"."sales_invoices"."discount_total" and "erp_private"."sales_invoices"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD COLUMN "invoice_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD COLUMN "collection_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD CONSTRAINT "account_transactions_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD CONSTRAINT "account_transactions_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "erp_private"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD CONSTRAINT "account_transactions_reversal_of_id_account_transactions_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "erp_private"."account_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD CONSTRAINT "account_transactions_created_by_user_id_employees_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."cash_accounts" ADD CONSTRAINT "cash_accounts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collection_allocations" ADD CONSTRAINT "collection_allocations_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "erp_private"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collection_allocations" ADD CONSTRAINT "collection_allocations_receivable_entry_id_customer_entries_id_fk" FOREIGN KEY ("receivable_entry_id") REFERENCES "erp_private"."customer_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "erp_private"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "erp_private"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."collections" ADD CONSTRAINT "collections_reversed_by_employees_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."deliveries" ADD CONSTRAINT "deliveries_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "erp_private"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."deliveries" ADD CONSTRAINT "deliveries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."deliveries" ADD CONSTRAINT "deliveries_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."deliveries" ADD CONSTRAINT "deliveries_dispatched_by_employees_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."delivery_lines" ADD CONSTRAINT "delivery_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."delivery_lines" ADD CONSTRAINT "delivery_lines_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "erp_private"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."delivery_lines" ADD CONSTRAINT "delivery_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "erp_private"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."delivery_lines" ADD CONSTRAINT "delivery_lines_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."delivery_lines" ADD CONSTRAINT "delivery_lines_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "erp_private"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "erp_private"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "erp_private"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_lines" ADD CONSTRAINT "invoice_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "erp_private"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_lines" ADD CONSTRAINT "invoice_lines_delivery_line_id_delivery_lines_id_fk" FOREIGN KEY ("delivery_line_id") REFERENCES "erp_private"."delivery_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ADD CONSTRAINT "sales_invoices_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "erp_private"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ADD CONSTRAINT "sales_invoices_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ADD CONSTRAINT "sales_invoices_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ADD CONSTRAINT "sales_invoices_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_invoices" ADD CONSTRAINT "sales_invoices_cancelled_by_employees_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transaction_date_idx" ON "erp_private"."account_transactions" USING btree ("account_id","date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_source_unique" ON "erp_private"."account_transactions" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_account_name_unique" ON "erp_private"."cash_accounts" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "collection_entry_unique" ON "erp_private"."collection_allocations" USING btree ("collection_id","receivable_entry_id");--> statement-breakpoint
CREATE INDEX "allocation_receivable_idx" ON "erp_private"."collection_allocations" USING btree ("receivable_entry_id");--> statement-breakpoint
CREATE INDEX "collection_customer_date_idx" ON "erp_private"."collections" USING btree ("customer_id","date");--> statement-breakpoint
CREATE INDEX "delivery_order_date_idx" ON "erp_private"."deliveries" USING btree ("order_id","date");--> statement-breakpoint
CREATE INDEX "delivery_line_order_idx" ON "erp_private"."delivery_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_delivery_pair_unique" ON "erp_private"."invoice_deliveries" USING btree ("invoice_id","delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_active_invoice_unique" ON "erp_private"."invoice_deliveries" USING btree ("delivery_id") WHERE "erp_private"."invoice_deliveries"."active";--> statement-breakpoint
CREATE INDEX "invoice_lines_parent_idx" ON "erp_private"."invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_delivery_line_unique" ON "erp_private"."invoice_lines" USING btree ("invoice_id","delivery_line_id");--> statement-breakpoint
CREATE INDEX "invoice_customer_date_idx" ON "erp_private"."sales_invoices" USING btree ("customer_id","date");--> statement-breakpoint
CREATE INDEX "invoice_order_idx" ON "erp_private"."sales_invoices" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "erp_private"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "erp_private"."collections"("id") ON DELETE no action ON UPDATE no action;