CREATE TABLE "erp_private"."quality_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_control_id" text,
	"customer_return_id" text,
	"supplier_claim_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_resources_stock_control_id_unique" UNIQUE("stock_control_id"),
	CONSTRAINT "quality_resources_customer_return_id_unique" UNIQUE("customer_return_id"),
	CONSTRAINT "quality_resources_supplier_claim_id_unique" UNIQUE("supplier_claim_id"),
	CONSTRAINT "quality_resource_parent" CHECK (num_nonnulls("erp_private"."quality_resources"."stock_control_id","erp_private"."quality_resources"."customer_return_id","erp_private"."quality_resources"."supplier_claim_id")=1)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."quality_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."quality_seals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_seals_resource_id_unique" UNIQUE("resource_id"),
	CONSTRAINT "quality_seal_hashes" CHECK ("erp_private"."quality_seals"."hash" ~ '^[a-f0-9]{64}$' and "erp_private"."quality_seals"."source_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."quality_seals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."quality_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quality_withdrawal_reason" CHECK (length(btrim("erp_private"."quality_withdrawals"."reason"))>=5 and length("erp_private"."quality_withdrawals"."reason")<=500)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."quality_withdrawals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "quality_resource_id" uuid;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_resources" ADD CONSTRAINT "quality_resources_stock_control_id_stock_controls_id_fk" FOREIGN KEY ("stock_control_id") REFERENCES "erp_private"."stock_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_resources" ADD CONSTRAINT "quality_resources_customer_return_id_customer_returns_id_fk" FOREIGN KEY ("customer_return_id") REFERENCES "erp_private"."customer_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_resources" ADD CONSTRAINT "quality_resources_supplier_claim_id_supplier_claims_id_fk" FOREIGN KEY ("supplier_claim_id") REFERENCES "erp_private"."supplier_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_seals" ADD CONSTRAINT "quality_seals_resource_id_quality_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "erp_private"."quality_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_seals" ADD CONSTRAINT "quality_seals_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_withdrawals" ADD CONSTRAINT "quality_withdrawals_resource_id_quality_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "erp_private"."quality_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_withdrawals" ADD CONSTRAINT "quality_withdrawals_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "erp_private"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quality_withdrawals" ADD CONSTRAINT "quality_withdrawals_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quality_withdrawal_unique" ON "erp_private"."quality_withdrawals" USING btree ("resource_id","document_id");--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_quality_resource_id_quality_resources_id_fk" FOREIGN KEY ("quality_resource_id") REFERENCES "erp_private"."quality_resources"("id") ON DELETE no action ON UPDATE no action;