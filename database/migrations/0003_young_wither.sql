ALTER TABLE "erp_private"."documents" ADD COLUMN "import_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "document_type" text DEFAULT 'Other' NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "sensitive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_receipts" ADD COLUMN "snapshot_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_receipts" ADD CONSTRAINT "warehouse_receipts_snapshot_id_landed_cost_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "erp_private"."landed_cost_snapshots"("id") ON DELETE no action ON UPDATE no action;