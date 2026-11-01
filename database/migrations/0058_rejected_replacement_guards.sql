CREATE OR REPLACE FUNCTION erp_private.verify_supplier_claim() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
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
   ELSE SELECT rr.claim_id INTO cid FROM erp_private.stock_batches sb JOIN erp_private.supplier_replacement_receipts rr ON rr.id=sb.replacement_receipt_id WHERE sb.id=NEW.batch_id; IF cid IS NULL THEN RETURN NULL; END IF; END IF;
  ELSE IF NEW.resource_type NOT IN ('Supplier Claim','Supplier Replacement Receipt') THEN RETURN NULL; END IF; IF NEW.resource_type='Supplier Claim' THEN cid:=NEW.resource_id; ELSE SELECT claim_id INTO cid FROM erp_private.supplier_replacement_receipts WHERE id=NEW.resource_id; END IF;
 END CASE;
 SELECT * INTO c FROM erp_private.supplier_claims WHERE id=cid;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Supplier posting needs a retained claim source' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='approval_requests' THEN IF NEW.state='Posted' AND NOT EXISTS(SELECT 1 FROM erp_private.supplier_claims WHERE approval_id=NEW.id AND state='Posted' UNION ALL SELECT 1 FROM erp_private.supplier_replacement_receipts WHERE approval_id=NEW.id AND state='Posted') THEN RAISE EXCEPTION 'Approval is consumed only with its source' USING ERRCODE='23514'; END IF; END IF;
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
  IF r.quantity=0 THEN IF r.value_bdt<>0 OR b.id IS NOT NULL THEN RAISE EXCEPTION 'Fully rejected replacement creates no stock or value' USING ERRCODE='23514'; END IF; CONTINUE; END IF;
  SELECT * INTO m FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Receive';
  IF b.id IS NULL OR (b.product_id,b.quantity_received,b.received_value_bdt,b.landed_cost_per_unit,b.condition,b.lot_number,b.batch_number,b.manufacturing_date,b.expiry_date,b.received_date,b.location,b.source_reference) IS DISTINCT FROM (c.product_id,r.quantity,r.value_bdt,round(r.value_bdt/r.quantity,10),'Saleable',r.lot_number,r.batch_number,r.manufacturing_date,r.expiry_date,r.received_date,r.location,r.number) OR m.id IS NULL OR (m.quantity,m.value_bdt,m.date,m.reference) IS DISTINCT FROM (r.quantity,r.value_bdt,r.posted_date,r.number) OR (SELECT count(*) FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Receive')<>1 THEN RAISE EXCEPTION 'Replacement stock retains its own approved receipt, LOT and exact claim value' USING ERRCODE='23514'; END IF;
  IF r.value_bdt>0 AND NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events WHERE source_key='supplier-replacement:'||r.id AND state='Posted') THEN RAISE EXCEPTION 'Replacement requires atomic source ledger' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (c.cost_bdt>0 OR coalesce(c.credit_bdt,0)>0) AND NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events WHERE source_key='supplier-claim:'||c.id AND state='Posted') THEN RAISE EXCEPTION 'Supplier claim requires atomic source ledger' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;


--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_supplier_replacement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.supplier_claims%ROWTYPE; a erp_private.approval_requests%ROWTYPE; q numeric; v numeric; fingerprint text;
BEGIN
 SELECT * INTO c FROM erp_private.supplier_claims WHERE id=NEW.claim_id FOR UPDATE;
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
 SELECT coalesce(sum(quantity),0),coalesce(sum(value_bdt),0) INTO q,v FROM erp_private.supplier_replacement_receipts WHERE claim_id=NEW.claim_id AND state='Posted';
 fingerprint:=md5(c.id||':'||q::text||':'||v::text);
 IF c.id IS NULL OR c.state<>'Posted' OR c.resolution<>'Replacement' OR a.id IS NULL OR a.domain<>'Rejections' OR a.resource_type<>'Supplier Replacement Receipt' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt<>NEW.value_bdt OR a.context->>'claimId' IS DISTINCT FROM c.id OR a.context->'excludedActorIds' IS DISTINCT FROM (c.preparer_ids||to_jsonb(NEW.created_by)) OR NEW.fingerprint<>fingerprint OR NEW.quantity+NEW.rejected_quantity+q>c.quantity OR NEW.value_bdt<>round(c.cost_bdt*(q+NEW.quantity)/c.quantity,2)-v OR NEW.received_date> (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.received_date<c.posted_date OR (NEW.quantity>0 AND NEW.expiry_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date) OR length(btrim(NEW.location))=0 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Replacement must match approved outstanding supplier promise and saved value' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Replacement starts submitted, not posted' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','posted_date','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','posted_date','posted_by']) OR a.state<>'Posted' OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.verified_by OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.approved_by OR NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Replacement is immutable and independently approved' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
