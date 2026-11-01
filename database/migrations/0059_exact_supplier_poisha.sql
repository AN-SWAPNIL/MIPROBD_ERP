CREATE FUNCTION erp_private.supplier_claim_share(q numeric,v numeric,pq numeric,pv numeric,nq numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (div(v*100*((pq+nq)*10000),q*10000)+CASE WHEN mod(v*100*((pq+nq)*10000),q*10000)*2>=q*10000 THEN 1 ELSE 0 END)*0.01-pv
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.supplier_claim_source(kind text,sid text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
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
   SELECT x.id,mod(pool.value*100*(x.quantity_rejected*10000),pool.qty*10000) remainder_numerator,div(pool.value*100*(x.quantity_rejected*10000),pool.qty*10000) base_poisha,pool.value*100 total_poisha
   FROM erp_private.receipt_lines x CROSS JOIN pool WHERE x.import_item_id=l.import_item_id AND x.quantity_rejected>0
  ), ranked AS (SELECT *,row_number() OVER(ORDER BY remainder_numerator DESC,id) rn,total_poisha-sum(base_poisha) OVER() residual FROM raw)
  SELECT (base_poisha+CASE WHEN rn<=residual THEN 1 ELSE 0 END)*0.01 INTO v FROM ranked WHERE id=l.id;
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
CREATE OR REPLACE FUNCTION erp_private.guard_supplier_claim() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
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
  IF NEW.snapshot IS DISTINCT FROM s OR NEW.fingerprint IS DISTINCT FROM s->>'fingerprint' OR (NEW.receipt_line_id,NEW.supplier_id,NEW.import_id,NEW.product_id) IS DISTINCT FROM (s->>'receiptLineId',s->>'supplierId',s->>'importId',s->>'productId') OR NEW.hold_id IS DISTINCT FROM s->>'holdId' OR NEW.batch_id IS DISTINCT FROM s->>'batchId' OR NEW.quantity>(s->>'availableQuantity')::numeric OR NEW.cost_bdt<>erp_private.supplier_claim_share((s->>'quantityPool')::numeric,(s->>'valuePool')::numeric,(s->>'priorQuantity')::numeric,(s->>'priorValue')::numeric,NEW.quantity) THEN RAISE EXCEPTION 'Claim must retain the exact remaining source quantity/cost snapshot' USING ERRCODE='23514'; END IF;
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
CREATE OR REPLACE FUNCTION erp_private.guard_supplier_replacement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.supplier_claims%ROWTYPE; a erp_private.approval_requests%ROWTYPE; q numeric; v numeric; fingerprint text;
BEGIN
 SELECT * INTO c FROM erp_private.supplier_claims WHERE id=NEW.claim_id FOR UPDATE;
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
 SELECT coalesce(sum(quantity),0),coalesce(sum(value_bdt),0) INTO q,v FROM erp_private.supplier_replacement_receipts WHERE claim_id=NEW.claim_id AND state='Posted';
 fingerprint:=md5(c.id||':'||q::text||':'||v::text);
 IF c.id IS NULL OR c.state<>'Posted' OR c.resolution<>'Replacement' OR a.id IS NULL OR a.domain<>'Rejections' OR a.resource_type<>'Supplier Replacement Receipt' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt<>NEW.value_bdt OR a.context->>'claimId' IS DISTINCT FROM c.id OR a.context->'excludedActorIds' IS DISTINCT FROM (c.preparer_ids||to_jsonb(NEW.created_by)) OR NEW.fingerprint<>fingerprint OR NEW.quantity+NEW.rejected_quantity+q>c.quantity OR NEW.value_bdt<>erp_private.supplier_claim_share(c.quantity,c.cost_bdt,q,v,NEW.quantity) OR NEW.received_date> (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.received_date<c.posted_date OR (NEW.quantity>0 AND NEW.expiry_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date) OR length(btrim(NEW.location))=0 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Replacement must match approved outstanding supplier promise and saved value' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Replacement starts submitted, not posted' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','posted_date','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','posted_date','posted_by']) OR a.state<>'Posted' OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.verified_by OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.approved_by OR NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Replacement is immutable and independently approved' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
