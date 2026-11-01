CREATE TABLE "erp_private"."opening_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"line_id" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"source_reference" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_cell" text NOT NULL,
	"as_of_date" date NOT NULL,
	"amount_bdt" numeric(24, 2) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"posted_by" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_position_kind" CHECK ("erp_private"."opening_positions"."kind" in ('Stock','Customer Due','Supplier Due','Supplier Advance','Cash Bank')),
	CONSTRAINT "opening_position_amount" CHECK ("erp_private"."opening_positions"."amount_bdt">=0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."opening_positions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" DROP CONSTRAINT "supplier_settlement_values";--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ALTER COLUMN "receipt_line_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ALTER COLUMN "source_import_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD COLUMN "opening_position_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD COLUMN "opening_position_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD COLUMN "opening_position_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD COLUMN "condition" text DEFAULT 'Saleable' NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD COLUMN "adjustment_sign" integer;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD COLUMN "quantity_delta" numeric(18, 4) GENERATED ALWAYS AS (case when type in ('Receive','Opening','Return') then quantity when type='Dispatch' then -quantity else quantity*adjustment_sign end) STORED;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD COLUMN "value_delta_bdt" numeric(24, 2) GENERATED ALWAYS AS (case when type in ('Receive','Opening','Return') then value_bdt when type='Dispatch' then -value_bdt else value_bdt*adjustment_sign end) STORED;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD COLUMN "opening_position_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_positions" ADD CONSTRAINT "opening_positions_draft_id_opening_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "erp_private"."opening_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_positions" ADD CONSTRAINT "opening_positions_source_id_opening_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "erp_private"."opening_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_positions" ADD CONSTRAINT "opening_positions_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opening_position_draft_line_unique" ON "erp_private"."opening_positions" USING btree ("draft_id","line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opening_position_source_unique" ON "erp_private"."opening_positions" USING btree ("source_id","kind","entity_id","source_sheet","source_cell",lower(btrim("source_reference")));--> statement-breakpoint
CREATE UNIQUE INDEX "opening_financial_reference_unique" ON "erp_private"."opening_positions" USING btree ("kind","entity_id",lower(btrim("source_reference"))) WHERE "erp_private"."opening_positions"."kind"<>'Stock';--> statement-breakpoint
CREATE UNIQUE INDEX "opening_cash_once" ON "erp_private"."opening_positions" USING btree ("entity_id") WHERE "erp_private"."opening_positions"."kind"='Cash Bank';--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD CONSTRAINT "account_transactions_opening_position_id_opening_positions_id_fk" FOREIGN KEY ("opening_position_id") REFERENCES "erp_private"."opening_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_opening_position_id_opening_positions_id_fk" FOREIGN KEY ("opening_position_id") REFERENCES "erp_private"."opening_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_opening_position_id_opening_positions_id_fk" FOREIGN KEY ("opening_position_id") REFERENCES "erp_private"."opening_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_opening_position_id_opening_positions_id_fk" FOREIGN KEY ("opening_position_id") REFERENCES "erp_private"."opening_positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."account_transactions" ADD CONSTRAINT "account_transactions_opening_position_id_unique" UNIQUE("opening_position_id");--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_opening_position_id_unique" UNIQUE("opening_position_id");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_opening_position_id_unique" UNIQUE("opening_position_id");--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_opening_position_id_unique" UNIQUE("opening_position_id");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "batch_source" CHECK (("erp_private"."stock_batches"."opening_position_id" is not null and "erp_private"."stock_batches"."receipt_line_id" is null and "erp_private"."stock_batches"."source_import_id" is null) or ("erp_private"."stock_batches"."opening_position_id" is null and "erp_private"."stock_batches"."receipt_line_id" is not null and "erp_private"."stock_batches"."source_import_id" is not null));--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "batch_condition" CHECK ("erp_private"."stock_batches"."condition" in ('Saleable','Quarantine','Damaged','Expired'));--> statement-breakpoint
ALTER TABLE "erp_private"."stock_movements" ADD CONSTRAINT "movement_direction" CHECK ("erp_private"."stock_movements"."value_bdt">=0 and (("erp_private"."stock_movements"."type"='Adjustment' and "erp_private"."stock_movements"."adjustment_sign" is not null and "erp_private"."stock_movements"."adjustment_sign" in (-1,1)) or ("erp_private"."stock_movements"."type" in ('Receive','Opening','Dispatch','Return') and "erp_private"."stock_movements"."adjustment_sign" is null)));--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlement_values" CHECK ("erp_private"."supplier_settlements"."amount" > 0 and (("erp_private"."supplier_settlements"."entry_type" = 'Payment' and "erp_private"."supplier_settlements"."account_id" is not null and "erp_private"."supplier_settlements"."transaction_id" is not null) or ("erp_private"."supplier_settlements"."entry_type" in ('Obligation','Opening Advance') and "erp_private"."supplier_settlements"."account_id" is null and "erp_private"."supplier_settlements"."transaction_id" is null and ("erp_private"."supplier_settlements"."entry_type"<>'Opening Advance' or "erp_private"."supplier_settlements"."opening_position_id" is not null))));
--> statement-breakpoint
REVOKE ALL ON erp_private.opening_positions FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER opening_positions_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.opening_positions FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.protect_opening_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Opening evidence is retained' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='opening_sources' THEN
    IF TG_OP='UPDATE' AND OLD.state='Ready' THEN RAISE EXCEPTION 'Profiled sources are immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state='Ready' AND (NEW.sha256 !~ '^[a-f0-9]{64}$' OR NEW.profile->>'sha256' IS DISTINCT FROM NEW.sha256) THEN RAISE EXCEPTION 'Source profile hash mismatch' USING ERRCODE='23514'; END IF;
  ELSE
    IF TG_OP='INSERT' AND NEW.state<>'Draft' THEN RAISE EXCEPTION 'Openings start as drafts' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' THEN
      IF NEW.source_id<>OLD.source_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Opening identity/version is immutable' USING ERRCODE='23514'; END IF;
      IF OLD.state IN ('Approved','Posted','Reconciled') THEN
        IF NOT ((OLD.state='Approved' AND NEW.state='Posted') OR (OLD.state='Posted' AND NEW.state='Reconciled')) OR
          (to_jsonb(NEW)-ARRAY['state','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','updated_at']) THEN RAISE EXCEPTION 'Approved opening evidence is immutable' USING ERRCODE='23514'; END IF;
      ELSE
        IF NEW.state IN ('Posted','Reconciled') OR (NEW.state='Previewed' AND OLD.state<>'Validated') OR (NEW.state='Approved' AND OLD.state<>'Previewed') THEN RAISE EXCEPTION 'Opening review stages cannot be skipped' USING ERRCODE='23514'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_stock_journal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bid text; b erp_private.stock_batches%ROWTYPE; q numeric; v numeric;
BEGIN
  IF TG_TABLE_NAME='stock_batches' THEN bid:=NEW.id; ELSE bid:=NEW.batch_id; END IF;
  SELECT * INTO b FROM erp_private.stock_batches WHERE id=bid FOR UPDATE;
  SELECT coalesce(sum(quantity_delta),0),coalesce(sum(value_delta_bdt),0) INTO q,v FROM erp_private.stock_movements WHERE batch_id=bid;
  IF b.quantity_available<>q OR b.available_value_bdt<>v OR q<0 OR v<0 OR (q=0 AND v<>0) THEN RAISE EXCEPTION 'Stock must reconcile to signed immutable movements' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.protect_stock_origin() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['quantity_available','available_value_bdt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quantity_available','available_value_bdt']) THEN RAISE EXCEPTION 'Batch origin and condition require a source-aware disposition workflow' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_origin_immutable BEFORE UPDATE ON erp_private.stock_batches FOR EACH ROW EXECUTE FUNCTION erp_private.protect_stock_origin();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_opening_posting() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE did uuid; pid text; d erp_private.opening_drafts%ROWTYPE; p erp_private.opening_positions%ROWTYPE; b erp_private.stock_batches%ROWTYPE; expected numeric; n integer;
BEGIN
  IF TG_TABLE_NAME='opening_drafts' THEN
    IF NEW.state NOT IN ('Posted','Reconciled') THEN RETURN NULL; END IF; did:=NEW.id;
  ELSIF TG_TABLE_NAME='opening_positions' THEN did:=NEW.draft_id;
  ELSE
    IF TG_TABLE_NAME='stock_movements' THEN
      SELECT opening_position_id INTO pid FROM erp_private.stock_batches WHERE id=NEW.batch_id;
      IF NEW.type='Opening' AND pid IS NULL THEN RAISE EXCEPTION 'Opening movement needs a real opening source' USING ERRCODE='23514'; END IF;
      IF pid IS NOT NULL AND NEW.type='Receive' THEN RAISE EXCEPTION 'Opening stock is not an import receipt' USING ERRCODE='23514'; END IF;
      IF NEW.type<>'Opening' THEN RETURN NULL; END IF;
    ELSE pid:=NEW.opening_position_id; END IF;
    IF pid IS NULL THEN RETURN NULL; END IF;
    SELECT draft_id INTO did FROM erp_private.opening_positions WHERE id=pid;
  END IF;
  SELECT * INTO d FROM erp_private.opening_drafts WHERE id=did;
  IF d.id IS NULL OR d.state NOT IN ('Posted','Reconciled') OR d.approved_by IS NULL OR d.preview->>'canApprove'<>'true' THEN RAISE EXCEPTION 'Opening posting needs an approved source schedule' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM erp_private.opening_positions WHERE draft_id=did)<>jsonb_array_length(d.data->'lines') THEN RAISE EXCEPTION 'Opening schedule must post all lines atomically' USING ERRCODE='23514'; END IF;
  FOR p IN SELECT * FROM erp_private.opening_positions WHERE draft_id=did LOOP
    IF p.source_id<>d.source_id OR p.as_of_date<>(d.data->>'asOfDate')::date OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.data->'lines') x WHERE x->>'id'=p.line_id AND x=p.snapshot) OR
      p.kind<>p.snapshot->>'kind' OR p.entity_id<>p.snapshot->>'entityId' OR p.source_sheet<>p.snapshot->>'sourceSheet' OR p.source_cell<>p.snapshot->>'sourceCell' OR p.source_reference<>btrim(p.snapshot->>'sourceReference') THEN RAISE EXCEPTION 'Opening line differs from approved evidence' USING ERRCODE='23514'; END IF;
    expected:=CASE WHEN p.kind='Stock' THEN round((p.snapshot->>'quantity')::numeric*(p.snapshot->>'unitCostBdt')::numeric,2) ELSE (p.snapshot->>'amountBdt')::numeric END;
    IF p.amount_bdt IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Opening amount differs from approved calculation' USING ERRCODE='23514'; END IF;
    SELECT (SELECT count(*) FROM erp_private.stock_batches WHERE opening_position_id=p.id)+(SELECT count(*) FROM erp_private.customer_entries WHERE opening_position_id=p.id)+(SELECT count(*) FROM erp_private.account_transactions WHERE opening_position_id=p.id)+(SELECT count(*) FROM erp_private.supplier_settlements WHERE opening_position_id=p.id) INTO n;
    IF n<>1 THEN RAISE EXCEPTION 'Opening line needs exactly one matching subledger source' USING ERRCODE='23514'; END IF;
    IF p.kind='Stock' THEN
      SELECT * INTO b FROM erp_private.stock_batches WHERE opening_position_id=p.id;
      IF b.id IS NULL OR b.product_id<>p.entity_id OR b.quantity_received<>(p.snapshot->>'quantity')::numeric OR b.received_value_bdt<>expected OR b.landed_cost_per_unit<>(p.snapshot->>'unitCostBdt')::numeric OR b.condition<>p.snapshot->>'condition' OR b.batch_number<>btrim(p.snapshot->>'batch') OR b.lot_number<>btrim(p.snapshot->>'lot') OR b.location<>btrim(p.snapshot->>'location') OR b.manufacturing_date<>(p.snapshot->>'manufacturingDate')::date OR b.expiry_date<>(p.snapshot->>'expiryDate')::date OR b.received_date<>coalesce(nullif(p.snapshot->>'receivedDate','')::date,p.as_of_date) THEN RAISE EXCEPTION 'Opening batch differs from approved stock' USING ERRCODE='23514'; END IF;
      IF (SELECT count(*) FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Opening')<>1 OR NOT EXISTS (SELECT 1 FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Opening' AND quantity_delta=b.quantity_received AND value_delta_bdt=expected AND date=p.as_of_date) THEN RAISE EXCEPTION 'Opening stock needs its exact signed movement' USING ERRCODE='23514'; END IF;
    ELSIF p.kind='Customer Due' THEN
      IF NOT EXISTS (SELECT 1 FROM erp_private.customer_entries WHERE opening_position_id=p.id AND customer_id=p.entity_id AND type='Opening Due' AND debit=expected AND credit=0 AND date=p.as_of_date AND reference=p.source_reference AND source_id=p.id AND invoice_id IS NULL AND order_id IS NULL AND collection_id IS NULL) THEN RAISE EXCEPTION 'Opening receivable must not create sales revenue' USING ERRCODE='23514'; END IF;
    ELSIF p.kind='Cash Bank' THEN
      IF NOT EXISTS (SELECT 1 FROM erp_private.account_transactions WHERE opening_position_id=p.id AND account_id=p.entity_id AND amount=expected AND direction='In' AND source_type='Opening Balance' AND source_id=p.id AND date=p.as_of_date AND reversal_of_id IS NULL AND collection_id IS NULL) OR EXISTS (SELECT 1 FROM erp_private.account_transactions WHERE account_id=p.entity_id AND source_type='Opening Balance' AND opening_position_id IS DISTINCT FROM p.id) THEN RAISE EXCEPTION 'Cash opening must reconcile and must not be duplicated' USING ERRCODE='23514'; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM erp_private.supplier_settlements WHERE opening_position_id=p.id AND supplier_id=p.entity_id AND amount=expected AND date=p.as_of_date AND reference=p.source_reference AND entry_type=CASE WHEN p.kind='Supplier Due' THEN 'Obligation' ELSE 'Opening Advance' END AND import_id IS NULL AND transaction_id IS NULL AND account_id IS NULL AND status='Posted') THEN RAISE EXCEPTION 'Supplier opening must not move cash or fabricate an import' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_draft_posted_guard AFTER UPDATE ON erp_private.opening_drafts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_position_posted_guard AFTER INSERT ON erp_private.opening_positions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_batch_posted_guard AFTER INSERT ON erp_private.stock_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_movement_posted_guard AFTER INSERT ON erp_private.stock_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_customer_posted_guard AFTER INSERT ON erp_private.customer_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_cash_posted_guard AFTER INSERT ON erp_private.account_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER opening_supplier_posted_guard AFTER INSERT OR UPDATE ON erp_private.supplier_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_posting();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_operating_journal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_source_type text; v_source_id text; doc jsonb; original erp_private.account_transactions%ROWTYPE; reversal erp_private.account_transactions%ROWTYPE; aid text; tid text; amount numeric; expected_count integer;
BEGIN
  IF TG_TABLE_NAME='account_transactions' THEN
    IF NEW.source_type NOT IN ('Expense','Supplier Payment') THEN RETURN NULL; END IF;
    v_source_type:=NEW.source_type;
    IF NEW.reversal_of_id IS NOT NULL THEN SELECT a.source_id INTO v_source_id FROM erp_private.account_transactions a WHERE a.id=NEW.reversal_of_id; ELSE v_source_id:=NEW.source_id; END IF;
  ELSE v_source_id:=NEW.id; v_source_type:=CASE WHEN TG_TABLE_NAME='expenses' THEN 'Expense' ELSE 'Supplier Payment' END; END IF;
  IF v_source_type='Expense' THEN SELECT to_jsonb(e) INTO doc FROM erp_private.expenses e WHERE e.id=v_source_id; ELSE SELECT to_jsonb(s) INTO doc FROM erp_private.supplier_settlements s WHERE s.id=v_source_id; END IF;
  IF doc IS NULL THEN RAISE EXCEPTION 'Operating journal needs a real source' USING ERRCODE='23514'; END IF;
  IF v_source_type='Supplier Payment' AND doc->>'import_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM erp_private.import_cases i WHERE i.id=doc->>'import_id' AND i.supplier_id=doc->>'supplier_id') THEN RAISE EXCEPTION 'Settlement supplier/import mismatch' USING ERRCODE='23514'; END IF;
  IF v_source_type='Supplier Payment' AND doc->>'entry_type' IN ('Obligation','Opening Advance') THEN
    IF EXISTS (SELECT 1 FROM erp_private.account_transactions a WHERE a.source_type=v_source_type AND a.source_id=v_source_id) THEN RAISE EXCEPTION 'Supplier position must not move cash' USING ERRCODE='23514'; END IF; RETURN NULL;
  END IF;
  tid:=doc->>'transaction_id'; aid:=coalesce(doc->>'paid_from_account_id',doc->>'account_id'); amount:=(doc->>'amount')::numeric;
  SELECT * INTO original FROM erp_private.account_transactions a WHERE a.id=tid;
  IF original.id IS NULL OR original.source_type<>v_source_type OR original.source_id<>v_source_id OR original.account_id<>aid OR original.amount<>amount OR original.direction<>'Out' OR original.date<>(doc->>'date')::date OR original.reversal_of_id IS NOT NULL OR original.collection_id IS NOT NULL THEN RAISE EXCEPTION 'Operating source must reconcile to original outflow' USING ERRCODE='23514'; END IF;
  SELECT * INTO reversal FROM erp_private.account_transactions a WHERE a.reversal_of_id=tid;
  expected_count:=CASE WHEN doc->>'status'='Reversed' THEN 1 ELSE 0 END;
  IF (reversal.id IS NOT NULL)::integer<>expected_count OR (reversal.id IS NOT NULL AND (reversal.direction<>'In' OR reversal.amount<>amount OR reversal.account_id<>aid OR reversal.source_type<>v_source_type OR reversal.source_id<>'reversal-'||v_source_id OR reversal.date<>(doc->>'reversal_date')::date)) THEN RAISE EXCEPTION 'Operating reversal must exactly compensate its outflow' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
