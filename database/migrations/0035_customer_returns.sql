CREATE TABLE "erp_private"."customer_return_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"return_id" text NOT NULL,
	"position" integer NOT NULL,
	"delivery_line_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"condition" text NOT NULL,
	"location" text NOT NULL,
	"cost_bdt" numeric(24, 2) NOT NULL,
	"credit_bdt" numeric(24, 2) NOT NULL,
	"discount_bdt" numeric(24, 2) NOT NULL,
	"fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"delivery_value_bdt" numeric(24, 2) NOT NULL,
	"delivery_discount_bdt" numeric(24, 2) NOT NULL,
	CONSTRAINT "return_line_values" CHECK ("erp_private"."customer_return_lines"."quantity">0 and "erp_private"."customer_return_lines"."cost_bdt">=0 and "erp_private"."customer_return_lines"."credit_bdt">=0 and "erp_private"."customer_return_lines"."discount_bdt">=0 and "erp_private"."customer_return_lines"."condition" in ('Saleable','Quarantine','Damaged','Expired'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."customer_return_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"movement_id" text NOT NULL,
	CONSTRAINT "customer_return_postings_line_id_unique" UNIQUE("line_id"),
	CONSTRAINT "customer_return_postings_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "customer_return_postings_movement_id_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."customer_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"delivery_id" text NOT NULL,
	"invoice_id" text,
	"customer_id" text NOT NULL,
	"order_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"received_date" date NOT NULL,
	"reason" text NOT NULL,
	"inspection" text NOT NULL,
	"proof_reference" text NOT NULL,
	"credit_bdt" numeric(24, 2) NOT NULL,
	"cost_bdt" numeric(24, 2) NOT NULL,
	"exposure_bdt" numeric(24, 2) NOT NULL,
	"applied_bdt" numeric(24, 2),
	"state" text DEFAULT 'Draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload_hash" text NOT NULL,
	"preparer_ids" jsonb NOT NULL,
	"revision_of_id" text,
	"approval_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_date" date,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	CONSTRAINT "customer_returns_number_unique" UNIQUE("number"),
	CONSTRAINT "customer_returns_revision_of_id_unique" UNIQUE("revision_of_id"),
	CONSTRAINT "customer_returns_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "return_values" CHECK ("erp_private"."customer_returns"."credit_bdt">=0 and "erp_private"."customer_returns"."cost_bdt">=0 and "erp_private"."customer_returns"."exposure_bdt"="erp_private"."customer_returns"."credit_bdt"+"erp_private"."customer_returns"."cost_bdt" and ("erp_private"."customer_returns"."applied_bdt" is null or "erp_private"."customer_returns"."applied_bdt" between 0 and "erp_private"."customer_returns"."credit_bdt") and "erp_private"."customer_returns"."kind" in ('Invoiced Return','Uninvoiced Refusal') and ("erp_private"."customer_returns"."kind"='Invoiced Return')=("erp_private"."customer_returns"."invoice_id" is not null) and "erp_private"."customer_returns"."state" in ('Draft','Submitted','Posted','Superseded') and "erp_private"."customer_returns"."version">0 and ("erp_private"."customer_returns"."state"<>'Posted' or ("erp_private"."customer_returns"."posted_date" is not null and "erp_private"."customer_returns"."posted_by" is not null and "erp_private"."customer_returns"."posted_at" is not null and "erp_private"."customer_returns"."applied_bdt" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."return_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"return_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_bdt" numeric(24, 2) NOT NULL,
	"account_id" text,
	"invoice_id" text,
	"transaction_id" text,
	"reason" text NOT NULL,
	"proof_reference" text NOT NULL,
	"payload_hash" text NOT NULL,
	"approval_id" text NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date,
	"posted_by" text,
	CONSTRAINT "return_settlements_number_unique" UNIQUE("number"),
	CONSTRAINT "return_settlements_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "return_settlements_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "return_settlement_values" CHECK ("erp_private"."return_settlements"."amount_bdt">0 and "erp_private"."return_settlements"."kind" in ('Refund','Apply Credit') and (("erp_private"."return_settlements"."kind"='Refund' and "erp_private"."return_settlements"."account_id" is not null and "erp_private"."return_settlements"."invoice_id" is null) or ("erp_private"."return_settlements"."kind"='Apply Credit' and "erp_private"."return_settlements"."invoice_id" is not null and "erp_private"."return_settlements"."account_id" is null and "erp_private"."return_settlements"."transaction_id" is null)) and "erp_private"."return_settlements"."state" in ('Submitted','Posted') and ("erp_private"."return_settlements"."state"<>'Posted' or ("erp_private"."return_settlements"."date" is not null and "erp_private"."return_settlements"."posted_by" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" DROP CONSTRAINT "batch_source";--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_lines" ADD COLUMN "cost_bdt" numeric(24, 2);--> statement-breakpoint
ALTER TABLE "erp_private"."invoice_lines" ADD COLUMN "refusal_line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD COLUMN "return_line_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_lines" ADD CONSTRAINT "customer_return_lines_return_id_customer_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "erp_private"."customer_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_lines" ADD CONSTRAINT "customer_return_lines_delivery_line_id_delivery_lines_id_fk" FOREIGN KEY ("delivery_line_id") REFERENCES "erp_private"."delivery_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_postings" ADD CONSTRAINT "customer_return_postings_line_id_customer_return_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "erp_private"."customer_return_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_postings" ADD CONSTRAINT "customer_return_postings_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_return_postings" ADD CONSTRAINT "customer_return_postings_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "erp_private"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "erp_private"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "erp_private"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "erp_private"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_revision_of_id_customer_returns_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "erp_private"."customer_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_returns" ADD CONSTRAINT "customer_returns_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_return_id_customer_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "erp_private"."customer_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "erp_private"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_transaction_id_account_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "erp_private"."account_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_line_unique" ON "erp_private"."customer_return_lines" USING btree ("return_id","delivery_line_id");--> statement-breakpoint
CREATE INDEX "return_original_line_idx" ON "erp_private"."customer_return_lines" USING btree ("delivery_line_id");--> statement-breakpoint
CREATE INDEX "return_order_idx" ON "erp_private"."customer_returns" USING btree ("order_id","received_date");--> statement-breakpoint
CREATE INDEX "return_customer_idx" ON "erp_private"."customer_returns" USING btree ("customer_id","posted_date");--> statement-breakpoint
CREATE INDEX "return_settlement_idx" ON "erp_private"."return_settlements" USING btree ("return_id","state");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_return_line_id_customer_return_lines_id_fk" FOREIGN KEY ("return_line_id") REFERENCES "erp_private"."customer_return_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_return_line_id_unique" UNIQUE("return_line_id");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "batch_source" CHECK (num_nonnulls("erp_private"."stock_batches"."opening_position_id","erp_private"."stock_batches"."receipt_line_id","erp_private"."stock_batches"."correction_line_id","erp_private"."stock_batches"."return_line_id")=1 and (("erp_private"."stock_batches"."receipt_line_id" is not null and "erp_private"."stock_batches"."source_import_id" is not null) or ("erp_private"."stock_batches"."receipt_line_id" is null and "erp_private"."stock_batches"."source_import_id" is null)));