CREATE OR REPLACE FUNCTION erp_private.quality_source(rid uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'kind',CASE WHEN r.stock_control_id IS NOT NULL THEN 'Stock Control' WHEN r.customer_return_id IS NOT NULL THEN 'Customer Return' WHEN r.supplier_claim_id IS NOT NULL THEN 'Supplier Claim' ELSE 'Supplier Replacement Receipt' END,
  'sourceId',coalesce(r.stock_control_id,r.customer_return_id,r.supplier_claim_id,r.replacement_receipt_id),
  'state',coalesce(s.state,c.state,p.state,x.state),'sourceHash',coalesce(s.payload_hash,c.payload_hash,p.payload_hash,x.payload_hash),
  'preparerIds',coalesce(s.preparer_ids,c.preparer_ids,p.preparer_ids,to_jsonb(array[x.created_by])))
 FROM erp_private.quality_resources r
 LEFT JOIN erp_private.stock_controls s ON s.id=r.stock_control_id
 LEFT JOIN erp_private.customer_returns c ON c.id=r.customer_return_id
 LEFT JOIN erp_private.supplier_claims p ON p.id=r.supplier_claim_id
 LEFT JOIN erp_private.supplier_replacement_receipts x ON x.id=r.replacement_receipt_id WHERE r.id=rid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.quality_lineage(rid uuid) RETURNS TABLE(resource_id uuid) LANGUAGE sql STABLE SET search_path='' AS $$
 WITH RECURSIVE headers AS (
  SELECT 'Stock Control'::text kind,id,revision_of_id parent FROM erp_private.stock_controls
  UNION ALL SELECT 'Customer Return',id,revision_of_id FROM erp_private.customer_returns
  UNION ALL SELECT 'Supplier Claim',id,revision_of_id FROM erp_private.supplier_claims
  UNION ALL SELECT 'Supplier Replacement Receipt',id,null::text FROM erp_private.supplier_replacement_receipts
 ),chain AS (
  SELECT h.*,1 depth FROM headers h WHERE h.id=erp_private.quality_source(rid)->>'sourceId' AND h.kind=erp_private.quality_source(rid)->>'kind'
  UNION ALL SELECT h.*,c.depth+1 FROM chain c JOIN headers h ON h.id=c.parent AND h.kind=c.kind WHERE c.depth<100
 ) SELECT r.id FROM chain c JOIN erp_private.quality_resources r ON
  (c.kind='Stock Control' AND r.stock_control_id=c.id) OR (c.kind='Customer Return' AND r.customer_return_id=c.id) OR
  (c.kind='Supplier Claim' AND r.supplier_claim_id=c.id) OR (c.kind='Supplier Replacement Receipt' AND r.replacement_receipt_id=c.id)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_quality_resource() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_state text;
BEGIN
 IF NEW.stock_control_id IS NOT NULL THEN SELECT state INTO v_state FROM erp_private.stock_controls WHERE id=NEW.stock_control_id FOR UPDATE;
 ELSIF NEW.customer_return_id IS NOT NULL THEN SELECT state INTO v_state FROM erp_private.customer_returns WHERE id=NEW.customer_return_id FOR UPDATE;
 ELSIF NEW.supplier_claim_id IS NOT NULL THEN SELECT state INTO v_state FROM erp_private.supplier_claims WHERE id=NEW.supplier_claim_id FOR UPDATE;
 ELSE SELECT state INTO v_state FROM erp_private.supplier_replacement_receipts WHERE id=NEW.replacement_receipt_id FOR UPDATE; END IF;
 IF v_state IS DISTINCT FROM 'Draft' THEN RAISE EXCEPTION 'Quality resource starts on a real unposted draft' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.require_quality_seal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_resource uuid;v_seal erp_private.quality_seals%ROWTYPE;v_a erp_private.approval_requests%ROWTYPE;
BEGIN
 IF NEW.state NOT IN('Submitted','Posted') THEN RETURN NEW; END IF;
 SELECT id INTO v_resource FROM erp_private.quality_resources WHERE CASE TG_TABLE_NAME
  WHEN 'stock_controls' THEN stock_control_id=NEW.id WHEN 'customer_returns' THEN customer_return_id=NEW.id
  WHEN 'supplier_claims' THEN supplier_claim_id=NEW.id ELSE replacement_receipt_id=NEW.id END;
 IF OLD.state='Draft' OR v_resource IS NOT NULL THEN
  SELECT * INTO v_seal FROM erp_private.quality_seals WHERE resource_id=v_resource;
  SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF v_seal.id IS NULL OR v_seal.source_hash<>NEW.payload_hash OR v_a.context->>'qualitySealId' IS DISTINCT FROM v_seal.id::text OR v_a.context->>'qualityEvidenceHash' IS DISTINCT FROM v_seal.hash OR v_seal.snapshot IS DISTINCT FROM erp_private.quality_manifest(v_resource) THEN
   RAISE EXCEPTION 'Independent approval must identify the frozen inspection evidence' USING ERRCODE='23514';
  END IF;
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER supplier_replacement_quality_seal BEFORE UPDATE ON erp_private.supplier_replacement_receipts FOR EACH ROW EXECUTE FUNCTION erp_private.require_quality_seal();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_supplier_replacement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.supplier_claims%ROWTYPE;a erp_private.approval_requests%ROWTYPE;q numeric;v numeric;fingerprint text;
BEGIN
 SELECT * INTO c FROM erp_private.supplier_claims WHERE id=NEW.claim_id FOR UPDATE;
 SELECT coalesce(sum(quantity),0),coalesce(sum(value_bdt),0) INTO q,v FROM erp_private.supplier_replacement_receipts WHERE claim_id=NEW.claim_id AND state='Posted';
 fingerprint:=md5(c.id||':'||q::text||':'||v::text);
 IF c.id IS NULL OR c.state<>'Posted' OR c.resolution<>'Replacement' OR NEW.fingerprint<>fingerprint OR NEW.quantity+NEW.rejected_quantity+q>c.quantity OR NEW.value_bdt<>erp_private.supplier_claim_share(c.quantity,c.cost_bdt,q,v,NEW.quantity) OR NEW.received_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.received_date<c.posted_date OR (NEW.quantity>0 AND NEW.expiry_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date) OR length(btrim(NEW.location))=0 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN
  RAISE EXCEPTION 'Replacement must match approved outstanding supplier promise and saved value' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  -- Keep the already-deployed submit-on-create client compatible until its next release.
  -- That path still needs the actual independent source approval; it cannot add evidence.
  IF NEW.state NOT IN('Draft','Submitted') OR (NEW.state='Draft')<>(NEW.approval_id IS NULL) OR NEW.version<>1 OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Replacement starts unposted, with approval only on submission' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_by']) THEN RAISE EXCEPTION 'Replacement inspection content is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state='Draft' AND NEW.state='Submitted' THEN
   IF NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Submitting does not post stock' USING ERRCODE='23514'; END IF;
  ELSIF OLD.state='Submitted' AND NEW.state='Posted' THEN
   IF NEW.approval_id IS DISTINCT FROM OLD.approval_id OR NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Posting requires the unchanged approved source' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Only draft submission and approved posting are supported' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state IN('Submitted','Posted') THEN
  SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF a.id IS NULL OR a.domain<>'Rejections' OR a.resource_type<>'Supplier Replacement Receipt' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt<>NEW.value_bdt OR a.requested_by<>NEW.created_by OR a.context->>'claimId' IS DISTINCT FROM c.id OR a.context->'excludedActorIds' IS DISTINCT FROM (c.preparer_ids||to_jsonb(NEW.created_by)) OR (NEW.state='Submitted' AND a.state<>'Submitted') OR (NEW.state='Posted' AND (a.state<>'Posted' OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.verified_by OR (c.preparer_ids||to_jsonb(NEW.created_by)) ? a.approved_by)) THEN
   RAISE EXCEPTION 'Replacement requires its actual preparer and independent source-linked approval' USING ERRCODE='23514';
  END IF;
 END IF; RETURN NEW;
END $$;
