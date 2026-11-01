CREATE TABLE "erp_private"."supplier_claim_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"hold_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"movement_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"value_bdt" numeric(24, 2) NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "supplier_claim_postings_claim_id_unique" UNIQUE("claim_id"),
	CONSTRAINT "supplier_claim_postings_movement_id_unique" UNIQUE("movement_id"),
	CONSTRAINT "supplier_claim_posting_values" CHECK ("erp_private"."supplier_claim_postings"."quantity">0 and "erp_private"."supplier_claim_postings"."value_bdt">=0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claim_postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."supplier_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"receipt_line_id" text NOT NULL,
	"hold_id" text,
	"batch_id" text,
	"supplier_id" text NOT NULL,
	"import_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"cost_bdt" numeric(24, 2) NOT NULL,
	"credit_bdt" numeric(24, 2),
	"resolution" text NOT NULL,
	"reason" text NOT NULL,
	"inspection" text NOT NULL,
	"proof_reference" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"exposure_bdt" numeric(24, 2) NOT NULL,
	"payload_hash" text NOT NULL,
	"preparer_ids" jsonb NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approval_id" text,
	"revision_of_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_date" date,
	"posted_by" text,
	CONSTRAINT "supplier_claims_number_unique" UNIQUE("number"),
	CONSTRAINT "supplier_claims_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "supplier_claims_revision_of_id_unique" UNIQUE("revision_of_id"),
	CONSTRAINT "supplier_claim_values" CHECK ("erp_private"."supplier_claims"."quantity">0 and "erp_private"."supplier_claims"."cost_bdt">=0 and ("erp_private"."supplier_claims"."credit_bdt" is null or "erp_private"."supplier_claims"."credit_bdt">=0) and "erp_private"."supplier_claims"."exposure_bdt"="erp_private"."supplier_claims"."cost_bdt"+coalesce("erp_private"."supplier_claims"."credit_bdt",0) and "erp_private"."supplier_claims"."source_kind" in ('Receipt Rejection','Held Stock') and (("erp_private"."supplier_claims"."source_kind"='Held Stock')=("erp_private"."supplier_claims"."hold_id" is not null and "erp_private"."supplier_claims"."batch_id" is not null)) and "erp_private"."supplier_claims"."resolution" in ('Credit','Replacement','Write-off') and ("erp_private"."supplier_claims"."resolution"='Credit' or "erp_private"."supplier_claims"."credit_bdt" is null) and "erp_private"."supplier_claims"."state" in ('Draft','Submitted','Posted','Superseded') and "erp_private"."supplier_claims"."version">0 and ("erp_private"."supplier_claims"."state"<>'Posted' or ("erp_private"."supplier_claims"."posted_date" is not null and "erp_private"."supplier_claims"."posted_by" is not null and ("erp_private"."supplier_claims"."resolution"<>'Credit' or "erp_private"."supplier_claims"."credit_bdt">0))))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."supplier_replacement_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"claim_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"rejected_quantity" numeric(18, 4) NOT NULL,
	"value_bdt" numeric(24, 2) NOT NULL,
	"lot_number" text NOT NULL,
	"batch_number" text NOT NULL,
	"manufacturing_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"received_date" date NOT NULL,
	"location" text NOT NULL,
	"inspection" text NOT NULL,
	"proof_reference" text NOT NULL,
	"payload_hash" text NOT NULL,
	"fingerprint" text NOT NULL,
	"approval_id" text NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_date" date,
	"posted_by" text,
	CONSTRAINT "supplier_replacement_receipts_number_unique" UNIQUE("number"),
	CONSTRAINT "supplier_replacement_receipts_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "supplier_replacement_values" CHECK ("erp_private"."supplier_replacement_receipts"."quantity">0 and "erp_private"."supplier_replacement_receipts"."rejected_quantity">=0 and "erp_private"."supplier_replacement_receipts"."value_bdt">=0 and "erp_private"."supplier_replacement_receipts"."expiry_date">"erp_private"."supplier_replacement_receipts"."manufacturing_date" and "erp_private"."supplier_replacement_receipts"."manufacturing_date"<="erp_private"."supplier_replacement_receipts"."received_date" and "erp_private"."supplier_replacement_receipts"."state" in ('Submitted','Posted') and "erp_private"."supplier_replacement_receipts"."version">0 and ("erp_private"."supplier_replacement_receipts"."state"<>'Posted' or ("erp_private"."supplier_replacement_receipts"."posted_date" is not null and "erp_private"."supplier_replacement_receipts"."posted_by" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_replacement_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" DROP CONSTRAINT "batch_source";--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" DROP CONSTRAINT "movement_direction";--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" DROP CONSTRAINT "supplier_settlement_values";--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD COLUMN "replacement_receipt_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD COLUMN "supplier_claim_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claim_postings" ADD CONSTRAINT "supplier_claim_postings_claim_id_supplier_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "erp_private"."supplier_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claim_postings" ADD CONSTRAINT "supplier_claim_postings_hold_id_stock_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "erp_private"."stock_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claim_postings" ADD CONSTRAINT "supplier_claim_postings_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claim_postings" ADD CONSTRAINT "supplier_claim_postings_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "erp_private"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "erp_private"."receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_hold_id_stock_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "erp_private"."stock_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "erp_private"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_revision_of_id_supplier_claims_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "erp_private"."supplier_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_claims" ADD CONSTRAINT "supplier_claims_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_replacement_receipts" ADD CONSTRAINT "supplier_replacement_receipts_claim_id_supplier_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "erp_private"."supplier_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_replacement_receipts" ADD CONSTRAINT "supplier_replacement_receipts_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_replacement_receipts" ADD CONSTRAINT "supplier_replacement_receipts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_replacement_receipts" ADD CONSTRAINT "supplier_replacement_receipts_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_claim_hold_idx" ON "erp_private"."supplier_claim_postings" USING btree ("hold_id","date");--> statement-breakpoint
CREATE INDEX "supplier_claim_source_idx" ON "erp_private"."supplier_claims" USING btree ("source_kind","source_id","state");--> statement-breakpoint
CREATE INDEX "supplier_claim_supplier_idx" ON "erp_private"."supplier_claims" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_replacement_claim_idx" ON "erp_private"."supplier_replacement_receipts" USING btree ("claim_id","state");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_replacement_receipt_id_supplier_replacement_receipts_id_fk" FOREIGN KEY ("replacement_receipt_id") REFERENCES "erp_private"."supplier_replacement_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_supplier_claim_id_supplier_claims_id_fk" FOREIGN KEY ("supplier_claim_id") REFERENCES "erp_private"."supplier_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_replacement_receipt_id_unique" UNIQUE("replacement_receipt_id");--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_supplier_claim_id_unique" UNIQUE("supplier_claim_id");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "batch_source" CHECK (num_nonnulls("erp_private"."stock_batches"."opening_position_id","erp_private"."stock_batches"."receipt_line_id","erp_private"."stock_batches"."correction_line_id","erp_private"."stock_batches"."return_line_id","erp_private"."stock_batches"."replacement_receipt_id")=1 and (("erp_private"."stock_batches"."receipt_line_id" is not null and "erp_private"."stock_batches"."source_import_id" is not null) or ("erp_private"."stock_batches"."receipt_line_id" is null and "erp_private"."stock_batches"."source_import_id" is null)));--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD CONSTRAINT "movement_direction" CHECK ("erp_private"."stock_movements"."value_bdt">=0 and (("erp_private"."stock_movements"."type"='Adjustment' and "erp_private"."stock_movements"."adjustment_sign" is not null and "erp_private"."stock_movements"."adjustment_sign" in (-1,1)) or ("erp_private"."stock_movements"."type"='Supplier Return' and "erp_private"."stock_movements"."adjustment_sign"=-1) or ("erp_private"."stock_movements"."type" in ('Receive','Opening','Dispatch','Return') and "erp_private"."stock_movements"."adjustment_sign" is null)));--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlement_values" CHECK ("erp_private"."supplier_settlements"."amount" > 0 and (("erp_private"."supplier_settlements"."entry_type" = 'Payment' and "erp_private"."supplier_settlements"."account_id" is not null and "erp_private"."supplier_settlements"."transaction_id" is not null) or ("erp_private"."supplier_settlements"."entry_type" in ('Obligation','Opening Advance','Credit') and "erp_private"."supplier_settlements"."account_id" is null and "erp_private"."supplier_settlements"."transaction_id" is null and ("erp_private"."supplier_settlements"."entry_type"<>'Opening Advance' or "erp_private"."supplier_settlements"."opening_position_id" is not null))) and (("erp_private"."supplier_settlements"."entry_type"='Credit')=("erp_private"."supplier_settlements"."supplier_claim_id" is not null)));