CREATE OR REPLACE FUNCTION erp_private.verify_ledger_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_e erp_private.ledger_source_events%ROWTYPE; v_j erp_private.ledger_journals%ROWTYPE; v_id text; v_kind text; v_amount numeric; v_type text; v_direction text; v_cash text; v_original text; v_debit text; v_credit text; v_da text; v_ca text; v_config jsonb; v_n integer;
BEGIN
  IF NEW.state='Posted' AND (NEW.source_key LIKE 'supplier-claim:%' OR NEW.source_key LIKE 'supplier-replacement:%') THEN PERFORM erp_private.verify_supplier_claim_ledger(NEW.id); RETURN NULL; END IF;
  IF NEW.state='Posted' AND (NEW.source_key LIKE 'payroll:%' OR (NEW.source_key LIKE 'account:%' AND EXISTS(SELECT 1 FROM erp_private.account_transactions a WHERE a.id=substr(NEW.source_key,9) AND a.source_type IN ('Payroll Payment','Payroll Advance','Payroll Loan')))) THEN
    PERFORM erp_private.verify_payroll_ledger(NEW.id); RETURN NULL;
  END IF;
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
--> statement-breakpoint
REVOKE ALL ON erp_private.supplier_claims,erp_private.supplier_claim_postings,erp_private.supplier_replacement_receipts FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION erp_private.supplier_claim_source(kind text,sid text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE l erp_private.receipt_lines%ROWTYPE; b erp_private.stock_batches%ROWTYPE; i erp_private.import_items%ROWTYPE; c erp_private.import_cases%ROWTYPE; h erp_private.stock_holds%ROWTYPE; q numeric; v numeric; pq numeric; pv numeric; available numeric; result jsonb;
BEGIN
 IF kind='Held Stock' THEN
  SELECT * INTO h FROM erp_private.stock_holds WHERE id=sid; SELECT * INTO b FROM erp_private.stock_batches WHERE id=h.batch_id;
  SELECT * INTO l FROM erp_private.receipt_lines WHERE id=b.receipt_line_id;
  IF h.id IS NULL OR l.id IS NULL THEN RAISE EXCEPTION 'Supplier claim requires an original import receipt hold' USING ERRCODE='23514'; END IF;
  q:=b.quantity_received; v:=b.received_value_bdt; pq:=b.quantity_received-b.quantity_available; pv:=b.received_value_bdt-b.available_value_bdt;
  available:=erp_private.stock_hold_outstanding(h.id,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date);
 ELSIF kind='Receipt Rejection' THEN
  SELECT * INTO l FROM erp_private.receipt_lines WHERE id=sid;
  IF l.id IS NULL OR l.quantity_rejected<=0 THEN RAISE EXCEPTION 'Source must contain rejected receipt units' USING ERRCODE='23514'; END IF;
  SELECT sum(quantity_received+quantity_rejected) INTO q FROM erp_private.receipt_lines WHERE import_item_id=l.import_item_id;
  IF q IS DISTINCT FROM (SELECT quantity FROM erp_private.import_items WHERE id=l.import_item_id) THEN RAISE EXCEPTION 'Complete inspection of the original import item before allocating rejection cost' USING ERRCODE='23514'; END IF;
  WITH pool AS (
   SELECT (p->>'finalTotalBdt')::numeric-coalesce((SELECT sum(inventory_value_bdt) FROM erp_private.receipt_lines WHERE import_item_id=l.import_item_id),0) value,
    (SELECT sum(quantity_rejected) FROM erp_private.receipt_lines WHERE import_item_id=l.import_item_id) qty
   FROM erp_private.warehouse_receipts r JOIN erp_private.landed_cost_snapshots s ON s.id=r.snapshot_id CROSS JOIN LATERAL jsonb_array_elements(s.data->'products') p
   WHERE r.id=l.receipt_id AND p->>'importItemId'=l.import_item_id
  ), raw AS (
   SELECT x.id,pool.value*100*x.quantity_rejected/pool.qty exact_poisha,floor(pool.value*100*x.quantity_rejected/pool.qty) base_poisha,pool.value*100 total_poisha
   FROM erp_private.receipt_lines x CROSS JOIN pool WHERE x.import_item_id=l.import_item_id AND x.quantity_rejected>0
  ), ranked AS (SELECT *,row_number() OVER(ORDER BY exact_poisha-base_poisha DESC,id) rn,total_poisha-sum(base_poisha) OVER() residual FROM raw)
  SELECT (base_poisha+CASE WHEN rn<=residual THEN 1 ELSE 0 END)/100 INTO v FROM ranked WHERE id=l.id;
  q:=l.quantity_rejected;
  SELECT coalesce(sum(quantity),0),coalesce(sum(cost_bdt),0) INTO pq,pv FROM erp_private.supplier_claims WHERE source_kind=kind AND source_id=sid AND state='Posted';
  available:=q-pq;
 ELSE RAISE EXCEPTION 'Unknown supplier claim source' USING ERRCODE='23514'; END IF;
 SELECT * INTO i FROM erp_private.import_items WHERE id=l.import_item_id; SELECT * INTO c FROM erp_private.import_cases WHERE id=i.import_id;
 IF v IS NULL OR v<0 OR available IS NULL OR available<0 THEN RAISE EXCEPTION 'Rejection source requires cost reconciliation' USING ERRCODE='23514'; END IF;
 result:=jsonb_build_object('sourceKind',kind,'sourceId',sid,'receiptLineId',l.id,'importId',i.import_id,'importItemId',i.id,'supplierId',c.supplier_id,'supplierName',c.supplier_name,'productId',i.product_id,'productCode',i.product_code,'productName',i.product_name,'unit',i.unit,
 'reference',coalesce(nullif(c.commercial->>'lcNumber',''),nullif(c.commercial->>'ttReference',''),c.draft_reference),'batchNumber',l.batch_number,'lotNumber',l.lot_number,'availableQuantity',available::text,'quantityPool',q::text,'valuePool',v::text,'priorQuantity',pq::text,'priorValue',pv::text,'batchId',b.id,'holdId',h.id);
 RETURN result||jsonb_build_object('fingerprint',md5(result::text||coalesce((SELECT string_agg(id,',' ORDER BY id) FROM erp_private.supplier_claims WHERE source_kind=kind AND source_id=sid AND state='Posted'),'')));
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.stock_hold_outstanding(hid text,through_date date) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT h.quantity-coalesce((SELECT sum(r.quantity) FROM erp_private.stock_hold_releases r WHERE r.hold_id=h.id AND r.state='Posted' AND r.date<=through_date),0)-coalesce((SELECT sum(w.quantity) FROM erp_private.stock_hold_writeoffs w WHERE w.hold_id=h.id AND w.date<=through_date),0)-coalesce((SELECT sum(p.quantity) FROM erp_private.supplier_claim_postings p WHERE p.hold_id=h.id AND p.date<=through_date),0) FROM erp_private.stock_holds h WHERE h.id=hid AND h.date<=through_date
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.stock_last_control_date(bid text) RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT max(d) FROM (SELECT h.date d FROM erp_private.stock_holds h WHERE h.batch_id=bid UNION ALL SELECT r.date FROM erp_private.stock_hold_releases r JOIN erp_private.stock_holds h ON h.id=r.hold_id WHERE h.batch_id=bid AND r.state='Posted' UNION ALL SELECT p.date FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE l.batch_id=bid OR p.batch_id=bid UNION ALL SELECT date FROM erp_private.supplier_claim_postings WHERE batch_id=bid) controls
$$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['supplier_claims','supplier_replacement_receipts'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',t||'_retained',t); END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER supplier_claim_postings_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.supplier_claim_postings FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_supplier_claim() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s jsonb; a erp_private.approval_requests%ROWTYPE;
BEGIN
 IF length(btrim(NEW.reason))<5 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 OR NEW.payload_hash !~ '^[a-f0-9]{64}$' OR NOT(NEW.preparer_ids ? NEW.created_by) THEN RAISE EXCEPTION 'Claim needs inspection, evidence and every preparer' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL THEN RAISE EXCEPTION 'Claims start as unposted drafts' USING ERRCODE='23514'; END IF;
  IF NEW.revision_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.supplier_claims p WHERE p.id=NEW.revision_of_id AND p.state='Superseded' AND p.source_kind=NEW.source_kind AND p.source_id=NEW.source_id AND NEW.preparer_ids @> p.preparer_ids) THEN RAISE EXCEPTION 'Revision must retain source and preparers' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state IN ('Posted','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_by']) OR NOT((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Posted','Superseded'))) THEN RAISE EXCEPTION 'Claim is immutable; prepare a linked revision' USING ERRCODE='23514'; END IF;
  IF OLD.state='Submitted' AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Approval identity is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state<>'Superseded' THEN
  IF NEW.batch_id IS NOT NULL THEN PERFORM 1 FROM erp_private.stock_batches WHERE id=NEW.batch_id FOR UPDATE; END IF;
  PERFORM 1 FROM erp_private.import_cases WHERE id=NEW.import_id FOR UPDATE;
  s:=erp_private.supplier_claim_source(NEW.source_kind,NEW.source_id);
  IF NEW.snapshot IS DISTINCT FROM s OR NEW.fingerprint IS DISTINCT FROM s->>'fingerprint' OR (NEW.receipt_line_id,NEW.supplier_id,NEW.import_id,NEW.product_id) IS DISTINCT FROM (s->>'receiptLineId',s->>'supplierId',s->>'importId',s->>'productId') OR NEW.hold_id IS DISTINCT FROM s->>'holdId' OR NEW.batch_id IS DISTINCT FROM s->>'batchId' OR NEW.quantity>(s->>'availableQuantity')::numeric OR NEW.cost_bdt<>round((s->>'valuePool')::numeric*((s->>'priorQuantity')::numeric+NEW.quantity)/(s->>'quantityPool')::numeric,2)-(s->>'priorValue')::numeric THEN RAISE EXCEPTION 'Claim must retain the exact remaining source quantity/cost snapshot' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.approval_id IS NOT NULL THEN
  SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF a.id IS NULL OR a.domain<>'Rejections' OR a.resource_type<>'Supplier Claim' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt<>NEW.exposure_bdt OR a.context->'excludedActorIds' IS DISTINCT FROM NEW.preparer_ids THEN RAISE EXCEPTION 'Claim approval must match immutable source' USING ERRCODE='23514'; END IF;
  IF NEW.state='Posted' AND (a.state<>'Posted' OR NEW.preparer_ids ? a.verified_by OR NEW.preparer_ids ? a.approved_by) THEN RAISE EXCEPTION 'Every preparer is excluded from independent approval' USING ERRCODE='23514'; END IF;
  IF NEW.state='Superseded' AND a.state<>'Rejected' AND EXISTS(SELECT 1 FROM erp_private.approval_policies WHERE id=a.policy_id AND state='Approved') THEN RAISE EXCEPTION 'Reject active approval before revision' USING ERRCODE='23514'; END IF;
 ELSIF NEW.state IN ('Submitted','Posted') THEN RAISE EXCEPTION 'Claim needs independent approval' USING ERRCODE='23514'; END IF;
 IF NEW.state='Posted' THEN
  IF NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Claim uses actual posting date and actor' USING ERRCODE='23514'; END IF;
 ELSIF NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Unposted claim has no posting identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER supplier_claim_source_guard BEFORE INSERT OR UPDATE ON erp_private.supplier_claims FOR EACH ROW EXECUTE FUNCTION erp_private.guard_supplier_claim();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_supplier_replacement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.supplier_claims%ROWTYPE; a erp_private.approval_requests%ROWTYPE; q numeric; v numeric; fingerprint text;
BEGIN
 SELECT * INTO c FROM erp_private.supplier_claims WHERE id=NEW.claim_id FOR UPDATE;
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
 SELECT coalesce(sum(quantity),0),coalesce(sum(value_bdt),0) INTO q,v FROM erp_private.supplier_replacement_receipts WHERE claim_id=NEW.claim_id AND state='Posted';
 fingerprint:=md5(c.id||':'||q::text||':'||v::text);
 IF c.id IS NULL OR c.state<>'Posted' OR c.resolution<>'Replacement' OR a.id IS NULL OR a.domain<>'Rejections' OR a.resource_type<>'Supplier Replacement Receipt' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt<>NEW.value_bdt OR a.context->>'claimId' IS DISTINCT FROM c.id OR a.context->'excludedActorIds' IS DISTINCT FROM (c.preparer_ids||to_jsonb(NEW.created_by)) OR NEW.fingerprint<>fingerprint OR NEW.quantity+NEW.rejected_quantity+q>c.quantity OR NEW.value_bdt<>round(c.cost_bdt*(q+NEW.quantity)/c.quantity,2)-v OR NEW.received_date> (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.received_date<c.posted_date OR NEW.expiry_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR length(btrim(NEW.location))=0 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Replacement must match approved outstanding supplier promise and saved value' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Replacement starts submitted, not posted' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','posted_date','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','posted_date','posted_by']) OR a.state<>'Posted' OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.verified_by OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.approved_by OR NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Replacement is immutable and independently approved' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER supplier_replacement_guard BEFORE INSERT OR UPDATE ON erp_private.supplier_replacement_receipts FOR EACH ROW EXECUTE FUNCTION erp_private.guard_supplier_replacement();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_supplier_claim() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cid text; c erp_private.supplier_claims%ROWTYPE; p erp_private.supplier_claim_postings%ROWTYPE; m erp_private.stock_movements%ROWTYPE; r erp_private.supplier_replacement_receipts%ROWTYPE; b erp_private.stock_batches%ROWTYPE;
BEGIN
 CASE TG_TABLE_NAME
  WHEN 'supplier_claims' THEN cid:=NEW.id;
  WHEN 'supplier_claim_postings' THEN cid:=NEW.claim_id;
  WHEN 'supplier_replacement_receipts' THEN cid:=NEW.claim_id;
  WHEN 'supplier_settlements' THEN IF NEW.supplier_claim_id IS NULL THEN RETURN NULL; END IF; cid:=NEW.supplier_claim_id;
  WHEN 'stock_batches' THEN IF NEW.replacement_receipt_id IS NULL THEN RETURN NULL; END IF; SELECT claim_id INTO cid FROM erp_private.supplier_replacement_receipts WHERE id=NEW.replacement_receipt_id;
  WHEN 'stock_movements' THEN
   IF NEW.type='Supplier Return' THEN SELECT claim_id INTO cid FROM erp_private.supplier_claim_postings WHERE movement_id=NEW.id;
   ELSE SELECT r.claim_id INTO cid FROM erp_private.stock_batches b JOIN erp_private.supplier_replacement_receipts r ON r.id=b.replacement_receipt_id WHERE b.id=NEW.batch_id; IF cid IS NULL THEN RETURN NULL; END IF; END IF;
  ELSE IF NEW.resource_type NOT IN ('Supplier Claim','Supplier Replacement Receipt') THEN RETURN NULL; END IF; IF NEW.resource_type='Supplier Claim' THEN cid:=NEW.resource_id; ELSE SELECT claim_id INTO cid FROM erp_private.supplier_replacement_receipts WHERE id=NEW.resource_id; END IF;
 END CASE;
 SELECT * INTO c FROM erp_private.supplier_claims WHERE id=cid;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Supplier posting needs a retained claim source' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='approval_requests' AND NEW.state='Posted' AND NOT EXISTS(SELECT 1 FROM erp_private.supplier_claims WHERE approval_id=NEW.id AND state='Posted' UNION ALL SELECT 1 FROM erp_private.supplier_replacement_receipts WHERE approval_id=NEW.id AND state='Posted') THEN RAISE EXCEPTION 'Approval is consumed only with its source' USING ERRCODE='23514'; END IF;
 IF c.state<>'Posted' THEN
  IF EXISTS(SELECT 1 FROM erp_private.supplier_claim_postings WHERE claim_id=cid) OR EXISTS(SELECT 1 FROM erp_private.supplier_settlements WHERE supplier_claim_id=cid) OR EXISTS(SELECT 1 FROM erp_private.supplier_replacement_receipts WHERE claim_id=cid) THEN RAISE EXCEPTION 'Unposted claims have no stock or finance effect' USING ERRCODE='23514'; END IF; RETURN NULL;
 END IF;
 IF c.source_kind='Held Stock' THEN
  SELECT * INTO p FROM erp_private.supplier_claim_postings WHERE claim_id=cid; SELECT * INTO m FROM erp_private.stock_movements WHERE id=p.movement_id;
  IF p.id IS NULL OR (p.hold_id,p.batch_id,p.quantity,p.value_bdt,p.date) IS DISTINCT FROM (c.hold_id,c.batch_id,c.quantity,c.cost_bdt,c.posted_date) OR m.id IS NULL OR (m.type,m.adjustment_sign,m.batch_id,m.quantity,m.value_bdt,m.date,m.reference) IS DISTINCT FROM ('Supplier Return',-1,c.batch_id,c.quantity,c.cost_bdt,c.posted_date,c.number) OR erp_private.stock_hold_outstanding(p.hold_id,c.posted_date)<0 THEN RAISE EXCEPTION 'Supplier return consumes exactly its held stock/cost source' USING ERRCODE='23514'; END IF;
 ELSIF EXISTS(SELECT 1 FROM erp_private.supplier_claim_postings WHERE claim_id=cid) THEN RAISE EXCEPTION 'Receipt rejects were never warehouse stock' USING ERRCODE='23514'; END IF;
 IF (SELECT count(*) FROM erp_private.supplier_settlements WHERE supplier_claim_id=cid)<>(CASE WHEN c.resolution='Credit' THEN 1 ELSE 0 END) OR (c.resolution='Credit' AND NOT EXISTS(SELECT 1 FROM erp_private.supplier_settlements WHERE supplier_claim_id=cid AND entry_type='Credit' AND supplier_id=c.supplier_id AND import_id=c.import_id AND reference=c.number AND amount=c.credit_bdt AND date=c.posted_date AND status='Posted')) THEN RAISE EXCEPTION 'Supplier credit must reconcile without cash payment' USING ERRCODE='23514'; END IF;
 FOR r IN SELECT * FROM erp_private.supplier_replacement_receipts WHERE claim_id=cid LOOP
  SELECT * INTO b FROM erp_private.stock_batches WHERE replacement_receipt_id=r.id;
  IF r.state<>'Posted' THEN IF b.id IS NOT NULL THEN RAISE EXCEPTION 'Unposted replacement creates no stock' USING ERRCODE='23514'; END IF; CONTINUE; END IF;
  SELECT * INTO m FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Receive';
  IF b.id IS NULL OR (b.product_id,b.quantity_received,b.received_value_bdt,b.landed_cost_per_unit,b.condition,b.lot_number,b.batch_number,b.manufacturing_date,b.expiry_date,b.received_date,b.location,b.source_reference) IS DISTINCT FROM (c.product_id,r.quantity,r.value_bdt,round(r.value_bdt/r.quantity,10),'Saleable',r.lot_number,r.batch_number,r.manufacturing_date,r.expiry_date,r.received_date,r.location,r.number) OR m.id IS NULL OR (m.quantity,m.value_bdt,m.date,m.reference) IS DISTINCT FROM (r.quantity,r.value_bdt,r.posted_date,r.number) OR (SELECT count(*) FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Receive')<>1 THEN RAISE EXCEPTION 'Replacement stock retains its own approved receipt, LOT and exact claim value' USING ERRCODE='23514'; END IF;
  IF r.value_bdt>0 AND NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events WHERE source_key='supplier-replacement:'||r.id AND state='Posted') THEN RAISE EXCEPTION 'Replacement requires atomic source ledger' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (c.cost_bdt>0 OR coalesce(c.credit_bdt,0)>0) AND NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events WHERE source_key='supplier-claim:'||c.id AND state='Posted') THEN RAISE EXCEPTION 'Supplier claim requires atomic source ledger' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['supplier_claims','supplier_claim_postings','supplier_replacement_receipts','supplier_settlements','stock_batches','stock_movements','approval_requests'] LOOP EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON erp_private.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_supplier_claim()',t||'_supplier_claim_source',t); END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_supplier_claim_ledger(eid text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e erp_private.ledger_source_events%ROWTYPE; j erp_private.ledger_journals%ROWTYPE; c erp_private.supplier_claims%ROWTYPE; r erp_private.supplier_replacement_receipts%ROWTYPE; expected jsonb; origin text; line jsonb; account text; cfg jsonb; n integer; amount numeric;
BEGIN
 SELECT * INTO e FROM erp_private.ledger_source_events WHERE id=eid; IF e.state<>'Posted' THEN RETURN; END IF;
 SELECT * INTO j FROM erp_private.ledger_journals WHERE id=e.journal_id;
 IF e.source_key LIKE 'supplier-claim:%' THEN
  SELECT * INTO c FROM erp_private.supplier_claims WHERE id=substr(e.source_key,16) AND state='Posted';
  IF c.id IS NULL OR e.date<>c.posted_date THEN RAISE EXCEPTION 'Claim ledger needs actual posted source' USING ERRCODE='23514'; END IF;
  origin:=CASE WHEN c.source_kind='Held Stock' THEN 'Inventory' ELSE 'Inventory Clearing' END;
  expected:=jsonb_build_array(jsonb_build_object('role',origin,'debit',0,'credit',c.cost_bdt));
  IF c.resolution='Credit' THEN
   expected:=expected||jsonb_build_array(jsonb_build_object('role','Payables','debit',c.credit_bdt,'credit',0));
   IF c.cost_bdt>c.credit_bdt THEN expected:=expected||jsonb_build_array(jsonb_build_object('role','Stock Loss','debit',c.cost_bdt-c.credit_bdt,'credit',0));
   ELSIF c.cost_bdt<c.credit_bdt THEN expected:=expected||jsonb_build_array(jsonb_build_object('role','Stock Gain','debit',0,'credit',c.credit_bdt-c.cost_bdt)); END IF;
  ELSE expected:=expected||jsonb_build_array(jsonb_build_object('role',CASE c.resolution WHEN 'Replacement' THEN 'Supplier Claims' ELSE 'Stock Loss' END,'debit',c.cost_bdt,'credit',0)); END IF;
 ELSE
  SELECT * INTO r FROM erp_private.supplier_replacement_receipts WHERE id=substr(e.source_key,22) AND state='Posted';
  IF r.id IS NULL OR e.date<>r.posted_date THEN RAISE EXCEPTION 'Replacement ledger needs actual posted source' USING ERRCODE='23514'; END IF;
  expected:=jsonb_build_array(jsonb_build_object('role','Inventory','debit',r.value_bdt,'credit',0),jsonb_build_object('role','Supplier Claims','debit',0,'credit',r.value_bdt));
 END IF;
 SELECT jsonb_agg(x ORDER BY x->>'role'),sum((x->>'debit')::numeric) INTO expected,amount FROM jsonb_array_elements(expected) x WHERE (x->>'debit')::numeric<>0 OR (x->>'credit')::numeric<>0;
 IF j.id IS NULL OR j.state<>'Posted' OR j.source_key<>e.source_key OR j.date<>e.date OR j.configuration_id IS DISTINCT FROM e.configuration_id OR j.confidential OR e.confidential OR j.reversal_of_id IS NOT NULL OR j.total_bdt<>amount OR expected IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('role',x->>'role','debit',(x->>'debit')::numeric,'credit',(x->>'credit')::numeric) ORDER BY x->>'role') FROM jsonb_array_elements(e.plan) x) THEN RAISE EXCEPTION 'Supplier source ledger must match exact approved roles/amounts' USING ERRCODE='23514'; END IF;
 SELECT data INTO cfg FROM erp_private.ledger_configurations WHERE id=e.configuration_id;
 IF (SELECT count(*) FROM erp_private.ledger_lines WHERE journal_id=j.id)<>jsonb_array_length(expected) THEN RAISE EXCEPTION 'Supplier ledger line count mismatch' USING ERRCODE='23514'; END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(expected) LOOP
  SELECT x->>'accountId' INTO account FROM jsonb_array_elements(cfg->'mappings') x WHERE x->>'role'=line->>'role';
  IF account IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines WHERE journal_id=j.id AND account_id=account AND debit=(line->>'debit')::numeric AND credit=(line->>'credit')::numeric) THEN RAISE EXCEPTION 'Supplier ledger accounts must match approved mappings' USING ERRCODE='23514'; END IF;
 END LOOP;
END $$;
