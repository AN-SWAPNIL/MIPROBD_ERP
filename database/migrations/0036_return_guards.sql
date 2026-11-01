REVOKE ALL ON erp_private.customer_returns,erp_private.customer_return_lines,erp_private.customer_return_postings,erp_private.return_settlements FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
DO $$ DECLARE v_t text; BEGIN
  FOREACH v_t IN ARRAY ARRAY['customer_return_lines','customer_return_postings'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',v_t||'_append_only',v_t);
  END LOOP;
  FOREACH v_t IN ARRAY ARRAY['customer_returns','return_settlements'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',v_t||'_retained',v_t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.return_line_fingerprint(lid text) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT md5(concat_ws('|',d.id,(SELECT string_agg(concat_ws(':',i.id,i.status,i.version),',' ORDER BY i.id) FROM erp_private.invoice_deliveries x JOIN erp_private.sales_invoices i ON i.id=x.invoice_id WHERE x.delivery_id=d.delivery_id AND x.active),
    (SELECT string_agg(l.id,',' ORDER BY l.id) FROM erp_private.customer_return_lines l JOIN erp_private.customer_returns r ON r.id=l.return_id WHERE l.delivery_line_id=d.id AND r.state='Posted'))) FROM erp_private.delivery_lines d WHERE d.id=lid
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_customer_return() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_d erp_private.deliveries%ROWTYPE; v_a erp_private.approval_requests%ROWTYPE; v_l erp_private.customer_return_lines%ROWTYPE; v_due numeric; v_policy text;
BEGIN
  SELECT * INTO v_d FROM erp_private.deliveries WHERE id=NEW.delivery_id;
  IF v_d.id IS NULL OR (NEW.customer_id,NEW.order_id,NEW.owner_id) IS DISTINCT FROM (v_d.customer_id,v_d.order_id,v_d.owner_id) OR NEW.received_date<v_d.date OR NEW.received_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.payload_hash !~ '^[a-f0-9]{64}$' OR NOT(NEW.preparer_ids ? NEW.created_by) OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Return requires original customer, order, inspection and source evidence' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL OR NEW.posted_date IS NOT NULL OR NEW.applied_bdt IS NOT NULL THEN RAISE EXCEPTION 'Returns start as unposted drafts' USING ERRCODE='23514'; END IF;
    IF NEW.revision_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.customer_returns r WHERE r.id=NEW.revision_of_id AND r.state='Superseded' AND r.delivery_id=NEW.delivery_id AND r.kind=NEW.kind AND NEW.preparer_ids @> r.preparer_ids) THEN RAISE EXCEPTION 'Return revisions retain original source and every preparer' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state IN ('Posted','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at','applied_bdt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at','applied_bdt']) OR NOT((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Posted','Superseded'))) THEN RAISE EXCEPTION 'Return inspection is immutable; use a linked reviewed revision' USING ERRCODE='23514'; END IF;
    IF OLD.state='Submitted' AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Return approval identity is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.state IN ('Draft','Submitted','Posted') THEN
    IF NEW.kind='Invoiced Return' THEN
      IF NOT EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x JOIN erp_private.sales_invoices i ON i.id=x.invoice_id WHERE x.delivery_id=NEW.delivery_id AND x.active AND i.id=NEW.invoice_id AND i.status='Approved') THEN RAISE EXCEPTION 'An invoiced return needs the actual approved invoice' USING ERRCODE='23514'; END IF;
    ELSIF EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x WHERE x.delivery_id=NEW.delivery_id AND x.active) THEN RAISE EXCEPTION 'An uninvoiced refusal cannot issue invoice credit' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.approval_id IS NOT NULL THEN
    SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
    IF v_a.id IS NULL OR v_a.domain<>'Returns' OR v_a.resource_type<>'Customer Return' OR v_a.resource_id<>NEW.id OR v_a.payload_hash<>NEW.payload_hash OR v_a.amount_bdt<>NEW.exposure_bdt OR v_a.context->'excludedActorIds' IS DISTINCT FROM NEW.preparer_ids THEN RAISE EXCEPTION 'Return and independent approval must match' USING ERRCODE='23514'; END IF;
    IF NEW.state='Posted' AND (v_a.state<>'Posted' OR NEW.preparer_ids ? v_a.verified_by OR NEW.preparer_ids ? v_a.approved_by) THEN RAISE EXCEPTION 'Every return preparer is excluded from independent decisions' USING ERRCODE='23514'; END IF;
    IF NEW.state='Superseded' THEN SELECT state INTO v_policy FROM erp_private.approval_policies WHERE id=v_a.policy_id; IF v_a.state<>'Rejected' AND v_policy='Approved' THEN RAISE EXCEPTION 'Reject an active request before revising' USING ERRCODE='23514'; END IF; END IF;
  ELSIF NEW.state IN ('Submitted','Posted') THEN RAISE EXCEPTION 'Return needs approval identity' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.state IN ('Submitted','Posted') THEN
    FOR v_l IN SELECT * FROM erp_private.customer_return_lines WHERE return_id=NEW.id LOOP
      IF v_l.fingerprint IS DISTINCT FROM erp_private.return_line_fingerprint(v_l.delivery_line_id) THEN RAISE EXCEPTION 'Return quantity/invoice snapshot is stale' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  IF NEW.state='Posted' THEN
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE invoice_id=NEW.invoice_id;
    IF NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.applied_bdt IS DISTINCT FROM least(NEW.credit_bdt,greatest(v_due,0)) THEN RAISE EXCEPTION 'Return credit application must use current original due and posting date' USING ERRCODE='23514'; END IF;
  ELSIF NEW.applied_bdt IS NOT NULL OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Unposted returns cannot alter stock or financial results' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_return_header BEFORE INSERT OR UPDATE ON erp_private.customer_returns FOR EACH ROW EXECUTE FUNCTION erp_private.guard_customer_return();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_return_line() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_r erp_private.customer_returns%ROWTYPE; v_d erp_private.delivery_lines%ROWTYPE; v_b erp_private.stock_batches%ROWTYPE; v_i erp_private.invoice_lines%ROWTYPE; v_q numeric; v_cost numeric; v_iq numeric; v_credit numeric; v_discount numeric; v_value numeric; v_dd numeric;
BEGIN
  SELECT * INTO v_r FROM erp_private.customer_returns WHERE id=NEW.return_id;
  SELECT * INTO v_d FROM erp_private.delivery_lines WHERE id=NEW.delivery_line_id;
  SELECT * INTO v_b FROM erp_private.stock_batches WHERE id=v_d.batch_id;
  SELECT * INTO v_i FROM erp_private.invoice_lines WHERE invoice_id=v_r.invoice_id AND delivery_line_id=v_d.id;
  SELECT coalesce(sum(l.quantity),0),coalesce(sum(l.cost_bdt),0),coalesce(sum(l.quantity) FILTER(WHERE r.invoice_id=v_r.invoice_id),0),coalesce(sum(l.credit_bdt) FILTER(WHERE r.invoice_id=v_r.invoice_id),0),coalesce(sum(l.discount_bdt) FILTER(WHERE r.invoice_id=v_r.invoice_id),0),coalesce(sum(l.delivery_value_bdt),0),coalesce(sum(l.delivery_discount_bdt),0) INTO v_q,v_cost,v_iq,v_credit,v_discount,v_value,v_dd FROM erp_private.customer_return_lines l JOIN erp_private.customer_returns r ON r.id=l.return_id WHERE l.delivery_line_id=NEW.delivery_line_id AND r.state='Posted';
  IF v_r.id IS NULL OR v_r.state<>'Draft' OR v_d.id IS NULL OR v_d.delivery_id<>v_r.delivery_id OR NEW.quantity+v_q>v_d.quantity OR NEW.fingerprint IS DISTINCT FROM erp_private.return_line_fingerprint(v_d.id) OR NEW.snapshot->>'productId' IS DISTINCT FROM v_d.product_id OR NEW.snapshot->>'batchNumber' IS DISTINCT FROM v_b.batch_number OR NEW.snapshot->>'lotNumber' IS DISTINCT FROM v_b.lot_number OR NEW.snapshot->>'manufacturingDate' IS DISTINCT FROM v_b.manufacturing_date::text OR NEW.snapshot->>'expiryDate' IS DISTINCT FROM v_b.expiry_date::text OR NEW.snapshot->>'warehouse' IS DISTINCT FROM v_b.warehouse OR length(btrim(NEW.location))=0 OR (NEW.condition='Saleable' AND v_b.expiry_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date) THEN RAISE EXCEPTION 'Return line must match actual delivered batch and remaining quantity' USING ERRCODE='23514'; END IF;
  IF NEW.cost_bdt<>round(v_d.cost_bdt*(v_q+NEW.quantity)/v_d.quantity,2)-v_cost OR NEW.delivery_value_bdt<>round(v_d.line_total*(v_q+NEW.quantity)/v_d.quantity,2)-v_value OR NEW.delivery_discount_bdt<>round(v_d.discount*(v_q+NEW.quantity)/v_d.quantity,2)-v_dd THEN RAISE EXCEPTION 'Returned cost/delivery value must use exact cumulative original totals' USING ERRCODE='23514'; END IF;
  IF v_r.kind='Invoiced Return' THEN
    IF v_i.id IS NULL OR v_iq+NEW.quantity>v_i.quantity OR NEW.credit_bdt<>round(v_i.line_total*(v_iq+NEW.quantity)/v_i.quantity,2)-v_credit OR NEW.discount_bdt<>round(v_i.discount*(v_iq+NEW.quantity)/v_i.quantity,2)-v_discount THEN RAISE EXCEPTION 'Return credit/discount must use actual saved invoice totals' USING ERRCODE='23514'; END IF;
  ELSIF NEW.credit_bdt<>0 OR NEW.discount_bdt<>0 THEN RAISE EXCEPTION 'Uninvoiced refusal creates no financial credit/discount' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customer_return_line_source BEFORE INSERT ON erp_private.customer_return_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_return_line();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_customer_return() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_id text; v_r erp_private.customer_returns%ROWTYPE; v_l erp_private.customer_return_lines%ROWTYPE; v_p erp_private.customer_return_postings%ROWTYPE; v_b erp_private.stock_batches%ROWTYPE; v_m erp_private.stock_movements%ROWTYPE; v_n integer; v_credit numeric; v_cost numeric;
BEGIN
  IF TG_TABLE_NAME='customer_returns' THEN v_id:=NEW.id;
  ELSIF TG_TABLE_NAME='customer_return_lines' THEN v_id:=NEW.return_id;
  ELSIF TG_TABLE_NAME='customer_return_postings' THEN SELECT return_id INTO v_id FROM erp_private.customer_return_lines WHERE id=NEW.line_id;
  ELSIF TG_TABLE_NAME='stock_batches' THEN IF NEW.return_line_id IS NULL THEN RETURN NULL; END IF; SELECT return_id INTO v_id FROM erp_private.customer_return_lines WHERE id=NEW.return_line_id;
  ELSIF TG_TABLE_NAME='stock_movements' THEN IF NEW.type<>'Return' THEN RETURN NULL; END IF; SELECT l.return_id INTO v_id FROM erp_private.customer_return_postings p JOIN erp_private.customer_return_lines l ON l.id=p.line_id WHERE p.movement_id=NEW.id;
  ELSE IF NEW.type<>'Return Credit' THEN RETURN NULL; END IF; v_id:=NEW.source_id; END IF;
  SELECT * INTO v_r FROM erp_private.customer_returns WHERE id=v_id;
  SELECT count(*),coalesce(sum(credit_bdt),0),coalesce(sum(cost_bdt),0) INTO v_n,v_credit,v_cost FROM erp_private.customer_return_lines WHERE return_id=v_id;
  IF v_r.id IS NULL OR v_n<1 OR v_n>50 OR v_r.credit_bdt<>v_credit OR v_r.cost_bdt<>v_cost THEN RAISE EXCEPTION 'Return source and totals must reconcile' USING ERRCODE='23514'; END IF;
  IF v_r.state<>'Posted' THEN
    IF EXISTS(SELECT 1 FROM erp_private.customer_return_postings p JOIN erp_private.customer_return_lines l ON l.id=p.line_id WHERE l.return_id=v_id) OR EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE type='Return Credit' AND source_id=v_id) OR EXISTS(SELECT 1 FROM erp_private.stock_batches b JOIN erp_private.customer_return_lines l ON l.id=b.return_line_id WHERE l.return_id=v_id) THEN RAISE EXCEPTION 'Unposted returns create no stock or credit' USING ERRCODE='23514'; END IF; RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp_private.approval_requests a WHERE a.id=v_r.approval_id AND a.state='Posted' AND a.resource_type='Customer Return' AND a.resource_id=v_id AND a.payload_hash=v_r.payload_hash AND a.amount_bdt=v_r.exposure_bdt) THEN RAISE EXCEPTION 'Posted return requires exact independent approval' USING ERRCODE='23514'; END IF;
  FOR v_l IN SELECT * FROM erp_private.customer_return_lines WHERE return_id=v_id LOOP
    SELECT * INTO v_p FROM erp_private.customer_return_postings WHERE line_id=v_l.id;
    SELECT * INTO v_b FROM erp_private.stock_batches WHERE id=v_p.batch_id;
    SELECT * INTO v_m FROM erp_private.stock_movements WHERE id=v_p.movement_id;
    IF v_p.id IS NULL OR v_b.id IS NULL OR v_b.return_line_id IS DISTINCT FROM v_l.id OR v_b.quantity_received<>v_l.quantity OR v_b.received_value_bdt<>v_l.cost_bdt OR v_b.landed_cost_per_unit<>round(v_l.cost_bdt/v_l.quantity,10) OR v_b.product_id IS DISTINCT FROM v_l.snapshot->>'productId' OR v_b.condition<>v_l.condition OR v_b.lot_number IS DISTINCT FROM v_l.snapshot->>'lotNumber' OR v_b.manufacturing_date IS DISTINCT FROM (v_l.snapshot->>'manufacturingDate')::date OR v_b.expiry_date IS DISTINCT FROM (v_l.snapshot->>'expiryDate')::date OR v_b.received_date<>v_r.posted_date OR v_b.warehouse IS DISTINCT FROM v_l.snapshot->>'warehouse' OR v_b.location<>v_l.location OR v_b.source_reference<>v_r.number OR v_m.id IS NULL OR v_m.type<>'Return' OR v_m.batch_id<>v_b.id OR v_m.quantity<>v_l.quantity OR v_m.value_bdt<>v_l.cost_bdt OR v_m.date<>v_r.posted_date OR v_m.reference<>v_r.number THEN RAISE EXCEPTION 'Returned stock must retain original LOT/expiry/cost through a new return source' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM erp_private.customer_entries WHERE type='Return Credit' AND source_id=v_id)<>(CASE WHEN v_r.credit_bdt>0 THEN 1 ELSE 0 END) OR (v_r.credit_bdt>0 AND NOT EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE type='Return Credit' AND source_id=v_id AND customer_id=v_r.customer_id AND order_id=v_r.order_id AND invoice_id=v_r.invoice_id AND date=v_r.posted_date AND debit=0 AND credit=v_r.credit_bdt AND collection_id IS NULL)) THEN RAISE EXCEPTION 'Return credit journal must reconcile without fake collections' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE v_t text; BEGIN
  FOREACH v_t IN ARRAY ARRAY['customer_returns','customer_return_lines','customer_return_postings','stock_batches','stock_movements','customer_entries'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON erp_private.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_customer_return()',v_t||'_return_source',v_t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_return_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_r erp_private.customer_returns%ROWTYPE; v_a erp_private.approval_requests%ROWTYPE; v_used numeric; v_due numeric; v_target erp_private.sales_invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM erp_private.customer_returns WHERE id=NEW.return_id FOR UPDATE;
  SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF v_r.id IS NULL OR v_r.state<>'Posted' OR v_r.invoice_id IS NULL OR v_a.id IS NULL OR v_a.domain<>'Returns' OR v_a.resource_type<>'Return Settlement' OR v_a.resource_id<>NEW.id OR v_a.payload_hash<>NEW.payload_hash OR v_a.amount_bdt<>NEW.amount_bdt OR v_a.context->>'returnId' IS DISTINCT FROM NEW.return_id OR NEW.payload_hash !~ '^[a-f0-9]{64}$' OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Settlement requires a posted return and exact approved source' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.date IS NOT NULL OR NEW.transaction_id IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Settlement starts submitted, not posted' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','date','posted_by','transaction_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','date','posted_by','transaction_id']) OR v_a.state<>'Posted' OR v_a.approved_by=NEW.created_by OR v_a.verified_by=NEW.created_by THEN RAISE EXCEPTION 'Settlement is immutable and independently approved' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT coalesce(sum(amount_bdt),0) INTO v_used FROM erp_private.return_settlements WHERE return_id=NEW.return_id AND state='Posted';
  IF NEW.amount_bdt>v_r.credit_bdt-v_r.applied_bdt-v_used THEN RAISE EXCEPTION 'Return credit cannot be spent twice' USING ERRCODE='23514'; END IF;
  IF NEW.kind='Refund' THEN
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE customer_id=v_r.customer_id AND NOT(source_id=NEW.id AND type='Return Refund');
    IF NEW.amount_bdt>greatest(-v_due,0) OR NOT EXISTS(SELECT 1 FROM erp_private.cash_accounts WHERE id=NEW.account_id AND active) THEN RAISE EXCEPTION 'Refund requires net customer credit and an active payment account' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT * INTO v_target FROM erp_private.sales_invoices WHERE id=NEW.invoice_id FOR UPDATE;
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE invoice_id=NEW.invoice_id AND NOT(source_id=NEW.id AND type='Credit Transfer In');
    IF v_target.id IS NULL OR v_target.id=v_r.invoice_id OR v_target.customer_id<>v_r.customer_id OR v_target.status<>'Approved' OR NEW.amount_bdt>v_due THEN RAISE EXCEPTION 'Credit application needs a different outstanding invoice of the same customer' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.state='Posted' AND NEW.date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Settlement posts on current business date' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER return_settlement_guard BEFORE INSERT OR UPDATE ON erp_private.return_settlements FOR EACH ROW EXECUTE FUNCTION erp_private.guard_return_settlement();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_return_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
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
    IF v_n<>2 OR v_s.transaction_id IS NOT NULL OR EXISTS(SELECT 1 FROM erp_private.account_transactions WHERE source_type='Return Refund' AND source_id=v_id) OR NOT EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE source_id=v_id AND type='Credit Transfer Out' AND customer_id=v_r.customer_id AND invoice_id=v_r.invoice_id AND order_id=v_r.order_id AND debit=v_s.amount_bdt AND credit=0 AND date=v_s.date AND collection_id IS NULL) OR NOT EXISTS(SELECT 1 FROM erp_private.customer_entries WHERE source_id=v_id AND type='Credit Transfer In' AND customer_id=v_r.customer_id AND invoice_id=v_s.invoice_id AND order_id=v_target.order_id AND credit=v_s.amount_bdt AND debit=0 AND date=v_s.date AND collection_id IS NULL) THEN RAISE EXCEPTION 'Credit application transfers the same credit between invoices without moving cash' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE v_t text; BEGIN
  FOREACH v_t IN ARRAY ARRAY['return_settlements','customer_entries','account_transactions'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON erp_private.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_return_settlement()',v_t||'_return_settlement',v_t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_return_invoice_cancel() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status='Cancelled' AND (EXISTS(SELECT 1 FROM erp_private.customer_returns WHERE invoice_id=NEW.id AND state='Posted') OR EXISTS(SELECT 1 FROM erp_private.return_settlements WHERE invoice_id=NEW.id AND state='Posted')) THEN RAISE EXCEPTION 'An invoice with posted return/credit allocation needs its source correction workflow, not full cancellation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_return_history BEFORE UPDATE ON erp_private.sales_invoices FOR EACH ROW EXECUTE FUNCTION erp_private.guard_return_invoice_cancel();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_return_approval() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.state='Posted' AND NEW.resource_type='Customer Return' AND NOT EXISTS(SELECT 1 FROM erp_private.customer_returns WHERE id=NEW.resource_id AND approval_id=NEW.id AND state='Posted' AND payload_hash=NEW.payload_hash AND exposure_bdt=NEW.amount_bdt) THEN RAISE EXCEPTION 'Return approval must post with exact source' USING ERRCODE='23514'; END IF;
  IF NEW.state='Posted' AND NEW.resource_type='Return Settlement' AND NOT EXISTS(SELECT 1 FROM erp_private.return_settlements WHERE id=NEW.resource_id AND approval_id=NEW.id AND state='Posted' AND payload_hash=NEW.payload_hash AND amount_bdt=NEW.amount_bdt) THEN RAISE EXCEPTION 'Settlement approval must post with exact source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER return_approval_source AFTER INSERT OR UPDATE ON erp_private.approval_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_return_approval();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_invoice_refusal_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_d erp_private.delivery_lines%ROWTYPE; v_ids jsonb; v_q numeric; v_value numeric; v_discount numeric; v_cost numeric;
BEGIN
  SELECT * INTO v_d FROM erp_private.delivery_lines WHERE id=NEW.delivery_line_id;
  SELECT coalesce(jsonb_agg(l.id ORDER BY l.id),'[]'::jsonb),coalesce(sum(l.quantity),0),coalesce(sum(l.delivery_value_bdt),0),coalesce(sum(l.delivery_discount_bdt),0),coalesce(sum(l.cost_bdt),0) INTO v_ids,v_q,v_value,v_discount,v_cost FROM erp_private.customer_return_lines l JOIN erp_private.customer_returns r ON r.id=l.return_id WHERE l.delivery_line_id=NEW.delivery_line_id AND r.state='Posted' AND r.kind='Uninvoiced Refusal';
  IF NEW.refusal_line_ids IS DISTINCT FROM v_ids OR NEW.cost_bdt IS DISTINCT FROM v_d.cost_bdt-v_cost OR NEW.quantity<>v_d.quantity-v_q OR NEW.line_total<>v_d.line_total-v_value OR NEW.discount<>v_d.discount-v_discount THEN RAISE EXCEPTION 'Invoice must snapshot all previously refused units and their exact saved values' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_refusal_snapshot BEFORE INSERT ON erp_private.invoice_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_invoice_refusal_snapshot();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_invoice_journal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_id text; v_i erp_private.sales_invoices%ROWTYPE; v_net numeric; v_discount numeric; v_debit numeric; v_reversal numeric;
BEGIN
  IF TG_TABLE_NAME='sales_invoices' THEN v_id:=NEW.id; ELSE v_id:=NEW.invoice_id; END IF;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_i FROM erp_private.sales_invoices WHERE id=v_id;
  SELECT coalesce(sum(line_total),0),coalesce(sum(discount),0) INTO v_net,v_discount FROM erp_private.invoice_lines WHERE invoice_id=v_id;
  IF v_i.total<>v_net OR v_i.discount_total<>v_discount OR v_i.subtotal<>v_net+v_discount OR NOT EXISTS(SELECT 1 FROM erp_private.invoice_lines WHERE invoice_id=v_id) OR NOT EXISTS(SELECT 1 FROM erp_private.invoice_deliveries WHERE invoice_id=v_id) OR
    EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x JOIN erp_private.deliveries d ON d.id=x.delivery_id WHERE x.invoice_id=v_id AND (d.order_id<>v_i.order_id OR d.customer_id<>v_i.customer_id OR x.active<>(v_i.status<>'Cancelled'))) OR
    EXISTS(SELECT 1 FROM erp_private.invoice_lines l JOIN erp_private.delivery_lines d ON d.id=l.delivery_line_id CROSS JOIN LATERAL(SELECT coalesce(sum(r.quantity),0) q,coalesce(sum(r.delivery_value_bdt),0) value,coalesce(sum(r.delivery_discount_bdt),0) discount FROM erp_private.customer_return_lines r WHERE l.refusal_line_ids ? r.id) refused
      WHERE l.invoice_id=v_id AND (l.product_id<>d.product_id OR l.unit_price<>d.unit_price OR l.quantity<>d.quantity-refused.q OR l.line_total<>d.line_total-refused.value OR l.discount<>d.discount-refused.discount OR NOT EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x WHERE x.invoice_id=v_id AND x.delivery_id=d.delivery_id))) OR
    EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x JOIN erp_private.delivery_lines d ON d.delivery_id=x.delivery_id WHERE x.invoice_id=v_id AND NOT EXISTS(SELECT 1 FROM erp_private.invoice_lines l WHERE l.invoice_id=v_id AND l.delivery_line_id=d.id) AND d.quantity>coalesce((SELECT sum(l.quantity) FROM erp_private.customer_return_lines l JOIN erp_private.customer_returns r ON r.id=l.return_id WHERE l.delivery_line_id=d.id AND r.state='Posted' AND r.kind='Uninvoiced Refusal'),0)) THEN RAISE EXCEPTION 'Invoice must reconcile to saved accepted delivery quantities' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(debit),0) INTO v_debit FROM erp_private.customer_entries WHERE invoice_id=v_id AND type='Invoice';
  SELECT coalesce(sum(credit),0) INTO v_reversal FROM erp_private.customer_entries WHERE invoice_id=v_id AND type='Reversal' AND collection_id IS NULL;
  IF v_debit<>(CASE WHEN v_i.approved_at IS NOT NULL THEN v_i.total ELSE 0 END) OR v_reversal<>(CASE WHEN v_i.approved_at IS NOT NULL AND v_i.status='Cancelled' THEN v_i.total ELSE 0 END) THEN RAISE EXCEPTION 'Invoice receivable/reversal must reconcile to approval status' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_ledger_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_e erp_private.ledger_source_events%ROWTYPE; v_j erp_private.ledger_journals%ROWTYPE; v_id text; v_kind text; v_amount numeric; v_type text; v_direction text; v_cash text; v_original text; v_debit text; v_credit text; v_da text; v_ca text; v_config jsonb; v_n integer;
BEGIN
  SELECT * INTO v_e FROM erp_private.ledger_source_events WHERE id=NEW.id;
  IF v_e.state<>'Posted' THEN RETURN NULL; END IF;
  SELECT * INTO v_j FROM erp_private.ledger_journals WHERE id=v_e.journal_id;
  IF v_j.id IS NULL OR v_j.state<>'Posted' OR v_j.source_key<>v_e.source_key OR v_j.configuration_id<>v_e.configuration_id OR v_j.date<>v_e.date OR v_j.confidential<>v_e.confidential THEN RAISE EXCEPTION 'Posted ledger source and journal must reconcile' USING ERRCODE='23514'; END IF;
  v_kind:=split_part(v_e.source_key,':',1); v_id:=substr(v_e.source_key,length(v_kind)+2);
  CASE v_kind
    WHEN 'account' THEN
      SELECT a.amount,a.source_type,a.direction,a.account_id,(SELECT o.id FROM erp_private.ledger_journals o WHERE o.source_key='account:'||a.reversal_of_id) INTO v_amount,v_type,v_direction,v_cash,v_original FROM erp_private.account_transactions a WHERE a.id=v_id AND a.date=v_e.date;
      v_type:=CASE v_type WHEN 'Collection' THEN 'Receivables' WHEN 'Return Refund' THEN 'Receivables' WHEN 'Expense' THEN 'Operating Expense' WHEN 'Supplier Payment' THEN 'Payables' WHEN 'Import Cost' THEN 'Inventory Clearing' WHEN 'Company Loan' THEN 'Company Loans' ELSE NULL END;
      v_debit:=CASE WHEN v_direction='In' THEN 'Cash' ELSE v_type END; v_credit:=CASE WHEN v_direction='In' THEN v_type ELSE 'Cash' END;
    WHEN 'stock' THEN
      SELECT s.value_bdt,s.type,CASE WHEN s.adjustment_sign=1 THEN 'In' ELSE 'Out' END INTO v_amount,v_type,v_direction FROM erp_private.stock_movements s WHERE s.id=v_id AND s.date=v_e.date AND s.type<>'Opening';
      v_debit:=CASE v_type WHEN 'Receive' THEN 'Inventory' WHEN 'Dispatch' THEN 'COGS' WHEN 'Return' THEN 'Inventory' WHEN 'Adjustment' THEN CASE WHEN v_direction='In' THEN 'Inventory' ELSE 'Stock Loss' END END;
      v_credit:=CASE v_type WHEN 'Receive' THEN 'Inventory Clearing' WHEN 'Dispatch' THEN 'Inventory' WHEN 'Return' THEN 'COGS' WHEN 'Adjustment' THEN CASE WHEN v_direction='In' THEN 'Stock Gain' ELSE 'Inventory' END END;
    WHEN 'invoice' THEN
      SELECT i.total INTO v_amount FROM erp_private.sales_invoices i WHERE i.id=v_id AND i.status IN ('Approved','Cancelled') AND i.date=v_e.date; v_debit:='Receivables'; v_credit:='Sales';
    WHEN 'invoice-reversal' THEN
      SELECT i.total,(SELECT o.id FROM erp_private.ledger_journals o WHERE o.source_key='invoice:'||i.id) INTO v_amount,v_original FROM erp_private.sales_invoices i WHERE i.id=v_id AND i.status='Cancelled'; v_debit:='Sales Returns'; v_credit:='Receivables';
    WHEN 'return' THEN
      SELECT r.credit_bdt INTO v_amount FROM erp_private.customer_returns r WHERE r.id=v_id AND r.state='Posted' AND r.kind='Invoiced Return' AND r.posted_date=v_e.date; v_debit:='Sales Returns'; v_credit:='Receivables';
    WHEN 'obligation' THEN
      SELECT s.amount INTO v_amount FROM erp_private.supplier_settlements s WHERE s.id=v_id AND s.entry_type='Obligation' AND s.date=v_e.date AND s.opening_position_id IS NULL; v_debit:='Inventory Clearing'; v_credit:='Payables';
    WHEN 'obligation-reversal' THEN
      SELECT s.amount INTO v_amount FROM erp_private.supplier_settlements s WHERE s.id=v_id AND s.entry_type='Obligation' AND s.status='Reversed' AND s.reversal_date=v_e.date AND s.opening_position_id IS NULL; v_debit:='Payables'; v_credit:='Inventory Clearing';
    ELSE RAISE EXCEPTION 'Unrecognized accounting source' USING ERRCODE='23514';
  END CASE;
  IF v_amount IS NULL OR v_amount<>v_j.total_bdt THEN RAISE EXCEPTION 'Automatic journal must match saved operational amount' USING ERRCODE='23514'; END IF;
  IF v_j.reversal_of_id IS NOT NULL THEN
    IF v_j.reversal_of_id IS DISTINCT FROM v_original OR jsonb_array_length(v_e.plan)<>0 THEN RAISE EXCEPTION 'Compensation must identify original source journal' USING ERRCODE='23514'; END IF; RETURN NULL;
  END IF;
  IF v_original IS NOT NULL OR v_debit IS NULL OR v_credit IS NULL THEN RAISE EXCEPTION 'Unsupported/reversed sources cannot infer new accounts' USING ERRCODE='23514'; END IF;
  SELECT c.data INTO v_config FROM erp_private.ledger_configurations c WHERE c.id=v_e.configuration_id;
  SELECT m->>'accountId' INTO v_da FROM jsonb_array_elements(CASE WHEN v_debit='Cash' THEN v_config->'cashMappings' ELSE v_config->'mappings' END) m WHERE CASE WHEN v_debit='Cash' THEN m->>'cashAccountId'=v_cash ELSE m->>'role'=v_debit END;
  SELECT m->>'accountId' INTO v_ca FROM jsonb_array_elements(CASE WHEN v_credit='Cash' THEN v_config->'cashMappings' ELSE v_config->'mappings' END) m WHERE CASE WHEN v_credit='Cash' THEN m->>'cashAccountId'=v_cash ELSE m->>'role'=v_credit END;
  IF v_da IS NULL OR v_ca IS NULL OR v_da=v_ca OR (SELECT count(*) FROM erp_private.ledger_lines WHERE journal_id=v_j.id)<>2 OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines WHERE journal_id=v_j.id AND account_id=v_da AND debit=v_amount AND credit=0) OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines WHERE journal_id=v_j.id AND account_id=v_ca AND credit=v_amount AND debit=0) THEN RAISE EXCEPTION 'Automatic accounts must match approved source-specific mapping' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_e.plan) p WHERE ((p->>'role'=v_debit AND (p->>'debit')::numeric=v_amount AND (p->>'credit')::numeric=0) OR (p->>'role'=v_credit AND (p->>'credit')::numeric=v_amount AND (p->>'debit')::numeric=0)) AND (p->>'role'<>'Cash' OR p->>'cashAccountId'=v_cash);
  IF jsonb_array_length(v_e.plan)<>2 OR v_n<>2 THEN RAISE EXCEPTION 'Saved source plan must describe exact posting roles' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
