ALTER TABLE "erp_private"."return_settlements" DROP CONSTRAINT "return_settlement_values";--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD COLUMN "receivable_entry_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlements_receivable_entry_id_customer_entries_id_fk" FOREIGN KEY ("receivable_entry_id") REFERENCES "erp_private"."customer_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_settlement_opening_idx" ON "erp_private"."return_settlements" USING btree ("receivable_entry_id","state");--> statement-breakpoint
ALTER TABLE "erp_private"."return_settlements" ADD CONSTRAINT "return_settlement_values" CHECK ("erp_private"."return_settlements"."amount_bdt">0 and "erp_private"."return_settlements"."kind" in ('Refund','Apply Credit') and (("erp_private"."return_settlements"."kind"='Refund' and "erp_private"."return_settlements"."account_id" is not null and "erp_private"."return_settlements"."invoice_id" is null and "erp_private"."return_settlements"."receivable_entry_id" is null) or ("erp_private"."return_settlements"."kind"='Apply Credit' and (("erp_private"."return_settlements"."invoice_id" is not null and "erp_private"."return_settlements"."receivable_entry_id" is null) or ("erp_private"."return_settlements"."invoice_id" is null and "erp_private"."return_settlements"."receivable_entry_id" is not null)) and "erp_private"."return_settlements"."account_id" is null and "erp_private"."return_settlements"."transaction_id" is null)) and "erp_private"."return_settlements"."state" in ('Submitted','Posted') and ("erp_private"."return_settlements"."state"<>'Posted' or ("erp_private"."return_settlements"."date" is not null and "erp_private"."return_settlements"."posted_by" is not null)));

--> statement-breakpoint
CREATE FUNCTION erp_private.opening_receivable_due(eid text,excluded_settlement text DEFAULT NULL,through_date date DEFAULT '9999-12-31') RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT e.debit-coalesce((SELECT sum(a.amount) FROM erp_private.collection_allocations a JOIN erp_private.collections c ON c.id=a.collection_id WHERE a.receivable_entry_id=e.id AND c.date<=through_date AND (c.status='Posted' OR (c.status='Reversed' AND (c.reversed_at AT TIME ZONE 'Asia/Dhaka')::date>through_date))),0)
 -coalesce((SELECT sum(s.amount_bdt) FROM erp_private.return_settlements s WHERE s.receivable_entry_id=e.id AND s.state='Posted' AND s.id IS DISTINCT FROM excluded_settlement AND s.date<=through_date),0)
 FROM erp_private.customer_entries e JOIN erp_private.opening_positions p ON p.id=e.opening_position_id JOIN erp_private.opening_drafts d ON d.id=p.draft_id
 WHERE e.id=eid AND e.type='Opening Due' AND e.customer_id=p.entity_id AND p.kind='Customer Due' AND d.state IN ('Posted','Reconciled') AND e.date<=through_date
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_return_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_r erp_private.customer_returns%ROWTYPE; v_a erp_private.approval_requests%ROWTYPE; v_used numeric; v_due numeric; v_target erp_private.sales_invoices%ROWTYPE; v_opening erp_private.customer_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM erp_private.customer_returns WHERE id=NEW.return_id FOR UPDATE;
  SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF v_r.id IS NULL OR v_r.state<>'Posted' OR v_r.invoice_id IS NULL OR v_a.id IS NULL OR v_a.domain<>'Returns' OR v_a.resource_type<>'Return Settlement' OR v_a.resource_id<>NEW.id OR v_a.payload_hash<>NEW.payload_hash OR v_a.amount_bdt<>NEW.amount_bdt OR v_a.context->>'returnId' IS DISTINCT FROM NEW.return_id OR NEW.payload_hash !~ '^[a-f0-9]{64}$' OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Settlement requires a posted return and exact approved source' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.date IS NOT NULL OR NEW.transaction_id IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Settlement starts submitted, not posted' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','date','posted_by','transaction_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','date','posted_by','transaction_id']) OR v_a.state<>'Posted' OR v_a.approved_by=NEW.created_by OR v_a.verified_by=NEW.created_by THEN RAISE EXCEPTION 'Settlement is immutable and independently approved' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM id FROM erp_private.customers WHERE id=v_r.customer_id FOR UPDATE;
  SELECT coalesce(sum(amount_bdt),0) INTO v_used FROM erp_private.return_settlements WHERE return_id=NEW.return_id AND state='Posted';
  IF NEW.amount_bdt>v_r.credit_bdt-v_r.applied_bdt-v_used THEN RAISE EXCEPTION 'Return credit cannot be spent twice' USING ERRCODE='23514'; END IF;
  IF NEW.kind='Refund' THEN
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE customer_id=v_r.customer_id AND NOT(source_id=NEW.id AND type='Return Refund');
    IF NEW.amount_bdt>greatest(-v_due,0) OR NOT EXISTS(SELECT 1 FROM erp_private.cash_accounts WHERE id=NEW.account_id AND active) THEN RAISE EXCEPTION 'Refund requires net customer credit and an active payment account' USING ERRCODE='23514'; END IF;
  ELSIF NEW.receivable_entry_id IS NOT NULL THEN
    SELECT * INTO v_opening FROM erp_private.customer_entries WHERE id=NEW.receivable_entry_id FOR UPDATE;
    v_due:=erp_private.opening_receivable_due(NEW.receivable_entry_id,NEW.id);
    IF v_opening.id IS NULL OR v_opening.customer_id<>v_r.customer_id OR v_opening.type<>'Opening Due' OR v_opening.opening_position_id IS NULL OR v_opening.date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR v_due IS NULL OR NEW.amount_bdt>v_due THEN
      RAISE EXCEPTION 'Credit application requires outstanding approved opening due of the same customer' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO v_target FROM erp_private.sales_invoices WHERE id=NEW.invoice_id FOR UPDATE;
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE invoice_id=NEW.invoice_id AND NOT(source_id=NEW.id AND type='Credit Transfer In');
    IF v_target.id IS NULL OR v_target.id=v_r.invoice_id OR v_target.customer_id<>v_r.customer_id OR v_target.status<>'Approved' OR NEW.amount_bdt>v_due THEN RAISE EXCEPTION 'Credit application needs a different outstanding invoice of the same customer' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.state='Posted' AND NEW.date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Settlement posts on current business date' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_return_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_id text; v_s erp_private.return_settlements%ROWTYPE; v_r erp_private.customer_returns%ROWTYPE; v_target erp_private.sales_invoices%ROWTYPE; v_n integer;
BEGIN
  IF TG_TABLE_NAME='return_settlements' THEN v_id:=NEW.id;
  ELSIF TG_TABLE_NAME='account_transactions' THEN IF NEW.source_type<>'Return Refund' THEN RETURN NULL; END IF; v_id:=NEW.source_id;
  ELSE IF NEW.type NOT IN ('Return Refund','Credit Transfer In','Credit Transfer Out') THEN RETURN NULL; END IF; v_id:=NEW.source_id; END IF;
  SELECT * INTO v_s FROM erp_private.return_settlements WHERE id=v_id;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'Return settlement journal needs its source' USING ERRCODE='23514'; END IF;
  IF v_s.state<>'Posted' THEN
    IF EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE source_id=v_id AND type IN ('Return Refund','Credit Transfer In','Credit Transfer Out')) OR EXISTS(SELECT 1 FROM erp_private.account_transactions WHERE source_type='Return Refund' AND source_id=v_id) THEN RAISE EXCEPTION 'Pending settlement cannot move customer credit or cash' USING ERRCODE='23514'; END IF; RETURN NULL;
  END IF;
  SELECT * INTO v_r FROM erp_private.customer_returns WHERE id=v_s.return_id;
  IF NOT EXISTS(SELECT 1 FROM erp_private.approval_requests WHERE id=v_s.approval_id AND state='Posted' AND resource_type='Return Settlement' AND resource_id=v_id AND payload_hash=v_s.payload_hash AND amount_bdt=v_s.amount_bdt) THEN RAISE EXCEPTION 'Settlement requires consumed exact approval' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO v_n FROM erp_private.customer_entries WHERE source_id=v_id AND type IN ('Return Refund','Credit Transfer In','Credit Transfer Out');
  IF v_s.kind='Refund' THEN
    IF v_n<>1 OR NOT EXISTS(SELECT 1 FROM erp_private.account_transactions WHERE id=v_s.transaction_id AND source_type='Return Refund' AND source_id=v_id AND amount=v_s.amount_bdt AND direction='Out' AND account_id=v_s.account_id AND date=v_s.date AND reversal_of_id IS NULL AND collection_id IS NULL) OR NOT EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE source_id=v_id AND type='Return Refund' AND customer_id=v_r.customer_id AND invoice_id=v_r.invoice_id AND order_id=v_r.order_id AND date=v_s.date AND debit=v_s.amount_bdt AND credit=0 AND collection_id IS NULL) THEN RAISE EXCEPTION 'Refund must match actual outflow and consume the customer credit once' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT * INTO v_target FROM erp_private.sales_invoices WHERE id=v_s.invoice_id;
    IF v_n<>2 OR v_s.transaction_id IS NOT NULL OR EXISTS(SELECT 1 FROM erp_private.account_transactions WHERE source_type='Return Refund' AND source_id=v_id) OR NOT EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE source_id=v_id AND type='Credit Transfer Out' AND customer_id=v_r.customer_id AND invoice_id=v_r.invoice_id AND order_id=v_r.order_id AND debit=v_s.amount_bdt AND credit=0 AND date=v_s.date AND collection_id IS NULL) OR NOT EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE source_id=v_id AND type='Credit Transfer In' AND customer_id=v_r.customer_id AND invoice_id IS NOT DISTINCT FROM v_s.invoice_id AND order_id IS NOT DISTINCT FROM v_target.order_id AND credit=v_s.amount_bdt AND debit=0 AND date=v_s.date AND collection_id IS NULL) THEN RAISE EXCEPTION 'Credit application transfers the same credit between invoices without moving cash' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_opening_credit_balance() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_entry record;v_due numeric;
BEGIN
 IF TG_TABLE_NAME='return_settlements' THEN
  IF NEW.receivable_entry_id IS NULL THEN RETURN NULL;END IF;
  FOR v_entry IN SELECT e.id,e.customer_id FROM erp_private.customer_entries e WHERE e.id=NEW.receivable_entry_id LOOP
   PERFORM id FROM erp_private.customers WHERE id=v_entry.customer_id FOR UPDATE;
   v_due:=erp_private.opening_receivable_due(v_entry.id);
   IF v_due IS NULL OR v_due<0 THEN RAISE EXCEPTION 'Opening receivable cannot be consumed by both credit and collection' USING ERRCODE='23514';END IF;
  END LOOP;
 ELSIF TG_TABLE_NAME='collection_allocations' THEN
  FOR v_entry IN SELECT e.id,e.customer_id FROM erp_private.customer_entries e WHERE e.id=NEW.receivable_entry_id AND e.type='Opening Due' AND e.opening_position_id IS NOT NULL LOOP
   PERFORM id FROM erp_private.customers WHERE id=v_entry.customer_id FOR UPDATE;
   v_due:=erp_private.opening_receivable_due(v_entry.id);
   IF v_due IS NULL OR v_due<0 THEN RAISE EXCEPTION 'Opening collection exceeds remaining source due' USING ERRCODE='23514';END IF;
  END LOOP;
 ELSE
  FOR v_entry IN SELECT DISTINCT e.id,e.customer_id FROM erp_private.collection_allocations a JOIN erp_private.customer_entries e ON e.id=a.receivable_entry_id WHERE a.collection_id=NEW.id AND e.type='Opening Due' AND e.opening_position_id IS NOT NULL ORDER BY e.id LOOP
   PERFORM id FROM erp_private.customers WHERE id=v_entry.customer_id FOR UPDATE;
   v_due:=erp_private.opening_receivable_due(v_entry.id);
   IF v_due IS NULL OR v_due<0 THEN RAISE EXCEPTION 'Opening collection exceeds remaining source due' USING ERRCODE='23514';END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER return_opening_credit_balance AFTER INSERT OR UPDATE ON erp_private.return_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_credit_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER allocation_opening_credit_balance AFTER INSERT ON erp_private.collection_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_credit_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER receipt_opening_credit_balance AFTER UPDATE ON erp_private.collections DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_opening_credit_balance();

