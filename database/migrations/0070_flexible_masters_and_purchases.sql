CREATE TABLE "erp_private"."master_options" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "master_option_kind" CHECK ("erp_private"."master_options"."kind" in ('unit','currency','product-family','country','container-type','document-type','import-cost-category')),
	CONSTRAINT "master_option_value" CHECK (length(btrim("erp_private"."master_options"."value")) between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."master_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."purchase_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 6) NOT NULL,
	"value_bdt" numeric(24, 2) NOT NULL,
	CONSTRAINT "purchase_line_values" CHECK ("erp_private"."purchase_lines"."quantity">0 and "erp_private"."purchase_lines"."unit_price">0 and "erp_private"."purchase_lines"."value_bdt">0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."purchase_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."purchase_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"reference" text NOT NULL,
	"received_date" date NOT NULL,
	"currency" text NOT NULL,
	"exchange_rate" numeric(18, 6) NOT NULL,
	"total_bdt" numeric(24, 2) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipts_number_unique" UNIQUE("number"),
	CONSTRAINT "purchase_header_values" CHECK ("erp_private"."purchase_receipts"."total_bdt">0 and "erp_private"."purchase_receipts"."exchange_rate">0 and "erp_private"."purchase_receipts"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."purchase_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" DROP CONSTRAINT "batch_source";--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD COLUMN "purchase_line_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD COLUMN "purchase_receipt_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."master_options" ADD CONSTRAINT "master_options_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."purchase_lines" ADD CONSTRAINT "purchase_lines_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "erp_private"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "erp_private"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "master_option_unique" ON "erp_private"."master_options" USING btree ("kind",lower(btrim("value")));--> statement-breakpoint
CREATE INDEX "purchase_line_receipt_idx" ON "erp_private"."purchase_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_supplier_reference_unique" ON "erp_private"."purchase_receipts" USING btree ("supplier_id",lower(btrim("reference")));--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "erp_private"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_purchase_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "erp_private"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_purchase_line_id_unique" UNIQUE("purchase_line_id");--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_purchase_receipt_id_unique" UNIQUE("purchase_receipt_id");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "batch_source" CHECK (num_nonnulls("erp_private"."stock_batches"."opening_position_id","erp_private"."stock_batches"."receipt_line_id","erp_private"."stock_batches"."correction_line_id","erp_private"."stock_batches"."return_line_id","erp_private"."stock_batches"."replacement_receipt_id","erp_private"."stock_batches"."purchase_line_id")=1 and (("erp_private"."stock_batches"."receipt_line_id" is not null and "erp_private"."stock_batches"."source_import_id" is not null) or ("erp_private"."stock_batches"."receipt_line_id" is null and "erp_private"."stock_batches"."source_import_id" is null)));
--> statement-breakpoint
REVOKE ALL ON erp_private.master_options, erp_private.purchase_receipts, erp_private.purchase_lines FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER TABLE erp_private.documents ADD CONSTRAINT product_image_parent CHECK ((purpose='product-image' AND import_id IS NULL AND expense_id IS NULL AND activity_id IS NULL AND visit_id IS NULL AND visit_attempt_id IS NULL AND quality_resource_id IS NULL AND employee_id=uploaded_by AND size_bytes<1000000 AND mime_type IN ('image/jpeg','image/png','image/webp')) OR (purpose<>'product-image' AND product_id IS NULL));
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_purchase_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Posted purchase source history is immutable' USING ERRCODE='55000';
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_receipt_immutable BEFORE UPDATE OR DELETE ON erp_private.purchase_receipts FOR EACH ROW EXECUTE FUNCTION erp_private.guard_purchase_history();
--> statement-breakpoint
CREATE TRIGGER purchase_line_immutable BEFORE UPDATE OR DELETE ON erp_private.purchase_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_purchase_history();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_purchase_batch() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.purchase_line_id IS NOT NULL AND (to_jsonb(NEW)-ARRAY['quantity_available','available_value_bdt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quantity_available','available_value_bdt']) THEN
   RAISE EXCEPTION 'Purchase batch traceability and original valuation are immutable' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_batch_immutable BEFORE UPDATE ON erp_private.stock_batches FOR EACH ROW EXECUTE FUNCTION erp_private.guard_purchase_batch();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_purchase_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r erp_private.purchase_receipts%ROWTYPE; v_total numeric;
BEGIN
 SELECT * INTO r FROM erp_private.purchase_receipts WHERE id=NEW.id;
 SELECT sum(l.value_bdt) INTO v_total FROM erp_private.purchase_lines l WHERE l.receipt_id=r.id;
 IF v_total IS NULL OR v_total<>r.total_bdt OR r.received_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR (r.currency='BDT' AND r.exchange_rate<>1) THEN
   RAISE EXCEPTION 'Purchase receipt total, exchange rate and date must reconcile' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM erp_private.purchase_lines l LEFT JOIN erp_private.stock_batches b ON b.purchase_line_id=l.id WHERE l.receipt_id=r.id AND
   (b.id IS NULL OR l.value_bdt<>round(l.quantity*l.unit_price*r.exchange_rate,2) OR b.product_id<>l.product_id OR b.quantity_received<>l.quantity OR b.quantity_available<>l.quantity OR b.received_value_bdt<>l.value_bdt OR b.available_value_bdt<>l.value_bdt OR b.received_date<>r.received_date OR b.manufacturing_date>r.received_date OR b.expiry_date<=r.received_date OR b.source_reference<>r.number OR b.warehouse<>'Main Warehouse' OR b.condition<>'Saleable' OR b.landed_cost_per_unit<>round(l.value_bdt/l.quantity,10) OR NOT EXISTS(SELECT 1 FROM erp_private.stock_movements m WHERE m.batch_id=b.id AND m.type='Receive' AND m.date=r.received_date AND m.quantity=l.quantity AND m.value_bdt=l.value_bdt AND m.reference=r.number))) THEN
   RAISE EXCEPTION 'Purchase batch and movement must inherit the saved source quantity, value and date' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM erp_private.supplier_settlements s WHERE s.purchase_receipt_id=r.id AND s.supplier_id=r.supplier_id AND s.entry_type='Obligation' AND s.status='Posted' AND s.amount=r.total_bdt AND s.date=r.received_date AND s.reference=r.number AND s.import_id IS NULL AND s.opening_position_id IS NULL) THEN
   RAISE EXCEPTION 'Purchase receipt must create its exact supplier obligation atomically' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER purchase_source_reconciliation AFTER INSERT ON erp_private.purchase_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_purchase_source();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_purchase_obligation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.purchase_receipt_id IS NOT NULL THEN RAISE EXCEPTION 'Purchase obligation cannot change independently of its stock source' USING ERRCODE='55000'; END IF;
 IF NEW.purchase_receipt_id IS NOT NULL AND (NEW.entry_type<>'Obligation' OR NEW.status<>'Posted' OR NEW.import_id IS NOT NULL OR NEW.opening_position_id IS NOT NULL) THEN RAISE EXCEPTION 'Purchase link requires its original obligation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_obligation_guard BEFORE INSERT OR UPDATE ON erp_private.supplier_settlements FOR EACH ROW EXECUTE FUNCTION erp_private.guard_purchase_obligation();
