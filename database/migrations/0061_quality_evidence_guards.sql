REVOKE ALL ON erp_private.quality_resources,erp_private.quality_seals,erp_private.quality_withdrawals FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION erp_private.quality_source(rid uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('kind',CASE WHEN r.stock_control_id IS NOT NULL THEN 'Stock Control' WHEN r.customer_return_id IS NOT NULL THEN 'Customer Return' ELSE 'Supplier Claim' END,'sourceId',coalesce(r.stock_control_id,r.customer_return_id,r.supplier_claim_id),'state',coalesce(s.state,c.state,p.state),'sourceHash',coalesce(s.payload_hash,c.payload_hash,p.payload_hash),'preparerIds',coalesce(s.preparer_ids,c.preparer_ids,p.preparer_ids)) FROM erp_private.quality_resources r LEFT JOIN erp_private.stock_controls s ON s.id=r.stock_control_id LEFT JOIN erp_private.customer_returns c ON c.id=r.customer_return_id LEFT JOIN erp_private.supplier_claims p ON p.id=r.supplier_claim_id WHERE r.id=rid
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.quality_lineage(rid uuid) RETURNS TABLE(resource_id uuid) LANGUAGE sql STABLE SET search_path='' AS $$
 WITH RECURSIVE headers AS (SELECT 'Stock Control'::text kind,id,revision_of_id parent FROM erp_private.stock_controls UNION ALL SELECT 'Customer Return',id,revision_of_id FROM erp_private.customer_returns UNION ALL SELECT 'Supplier Claim',id,revision_of_id FROM erp_private.supplier_claims),chain AS (
 SELECT h.*,1 depth FROM headers h WHERE h.id=erp_private.quality_source(rid)->>'sourceId' AND h.kind=erp_private.quality_source(rid)->>'kind'
 UNION ALL SELECT h.*,c.depth+1 FROM chain c JOIN headers h ON h.id=c.parent AND h.kind=c.kind WHERE c.depth<100
 ) SELECT r.id FROM chain c JOIN erp_private.quality_resources r ON (c.kind='Stock Control' AND r.stock_control_id=c.id) OR (c.kind='Customer Return' AND r.customer_return_id=c.id) OR (c.kind='Supplier Claim' AND r.supplier_claim_id=c.id)
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.quality_manifest(rid uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('kind',erp_private.quality_source(rid)->>'kind','sourceId',erp_private.quality_source(rid)->>'sourceId','sourceHash',erp_private.quality_source(rid)->>'sourceHash',
 'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'origin',d.quality_resource_id,'fileName',d.file_name,'mimeType',d.mime_type,'sizeBytes',d.size_bytes,'sha256',d.sha256,'sensitive',d.sensitive,'uploadedBy',d.uploaded_by,'attachedAt',to_char(d.attached_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY d.id) FROM erp_private.documents d WHERE d.quality_resource_id IN(SELECT resource_id FROM erp_private.quality_lineage(rid)) AND d.status='Attached' AND NOT EXISTS(SELECT 1 FROM erp_private.quality_withdrawals w WHERE w.document_id=d.id AND w.resource_id IN(SELECT resource_id FROM erp_private.quality_lineage(rid)))),'[]'::jsonb),
 'withdrawals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'documentId',w.document_id,'origin',w.resource_id,'reason',w.reason,'createdBy',w.created_by) ORDER BY w.id) FROM erp_private.quality_withdrawals w WHERE w.resource_id IN(SELECT resource_id FROM erp_private.quality_lineage(rid))),'[]'::jsonb))
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_quality_resource() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_state text;
BEGIN
 IF NEW.stock_control_id IS NOT NULL THEN SELECT state INTO v_state FROM erp_private.stock_controls WHERE id=NEW.stock_control_id FOR UPDATE;
 ELSIF NEW.customer_return_id IS NOT NULL THEN SELECT state INTO v_state FROM erp_private.customer_returns WHERE id=NEW.customer_return_id FOR UPDATE;
 ELSE SELECT state INTO v_state FROM erp_private.supplier_claims WHERE id=NEW.supplier_claim_id FOR UPDATE; END IF;
 IF v_state IS DISTINCT FROM 'Draft' THEN RAISE EXCEPTION 'Quality resource starts on a real unposted draft' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quality_resource_source BEFORE INSERT ON erp_private.quality_resources FOR EACH ROW EXECUTE FUNCTION erp_private.guard_quality_resource();
--> statement-breakpoint
DO $$ DECLARE v_t text; BEGIN FOREACH v_t IN ARRAY ARRAY['quality_resources','quality_withdrawals','quality_seals'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',v_t||'_append_only',v_t); END LOOP; END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_quality_document() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_source jsonb;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.purpose='quality-evidence' THEN RAISE EXCEPTION 'Inspection originals are retained, not deleted' USING ERRCODE='23514'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN IF (OLD.purpose='quality-evidence' OR NEW.purpose='quality-evidence') AND OLD.purpose<>NEW.purpose THEN RAISE EXCEPTION 'Evidence purpose cannot be changed' USING ERRCODE='23514'; END IF; END IF;
 IF NEW.purpose<>'quality-evidence' THEN IF NEW.quality_resource_id IS NOT NULL THEN RAISE EXCEPTION 'Only inspection evidence has a quality parent' USING ERRCODE='23514'; END IF; RETURN NEW; END IF;
 v_source:=erp_private.quality_source(NEW.quality_resource_id);
 IF v_source IS NULL OR NEW.import_id IS NOT NULL OR NEW.expense_id IS NOT NULL OR NEW.activity_id IS NOT NULL OR NEW.visit_attempt_id IS NOT NULL OR NEW.visit_id IS NOT NULL OR NEW.employee_id<>NEW.uploaded_by OR NEW.bucket<>'erp-documents' OR NEW.size_bytes>5242880 OR NEW.mime_type NOT IN('image/jpeg','image/png','image/webp','application/pdf') OR NOT(v_source->'preparerIds' ? NEW.uploaded_by) THEN RAISE EXCEPTION 'Inspection evidence requires its actual source preparer and private bounded file' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF v_source->>'state'<>'Draft' OR NEW.status<>'Pending' OR NEW.sha256 IS NOT NULL OR NEW.attached_at IS NOT NULL OR NEW.object_path<>'quality/'||NEW.quality_resource_id::text||'/'||NEW.id::text THEN RAISE EXCEPTION 'Inspection upload starts as a pending draft authorization' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status<>'Pending' OR (to_jsonb(NEW)-ARRAY['status','sha256','image_info','attached_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','sha256','image_info','attached_at']) OR NEW.status NOT IN ('Attached','Expired') OR (NEW.status='Attached' AND (v_source->>'state'<>'Draft' OR OLD.expires_at<now() OR NEW.sha256 IS NULL OR NEW.sha256 !~ '^[a-f0-9]{64}$' OR NEW.attached_at IS NULL)) OR (NEW.status='Expired' AND (NEW.sha256 IS NOT NULL OR NEW.attached_at IS NOT NULL)) THEN RAISE EXCEPTION 'Inspection file metadata is immutable and freezes before review' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quality_document_source BEFORE INSERT OR UPDATE OR DELETE ON erp_private.documents FOR EACH ROW EXECUTE FUNCTION erp_private.guard_quality_document();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_quality_withdrawal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_source jsonb;
BEGIN
 v_source:=erp_private.quality_source(NEW.resource_id);
 IF v_source->>'state' IS DISTINCT FROM 'Draft' OR NOT(v_source->'preparerIds' ? NEW.created_by) OR NOT EXISTS(SELECT 1 FROM erp_private.documents d WHERE d.id=NEW.document_id AND d.status='Attached' AND d.quality_resource_id IN(SELECT resource_id FROM erp_private.quality_lineage(NEW.resource_id))) THEN RAISE EXCEPTION 'Withdrawal needs the actual draft lineage and preparer; original evidence is retained' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quality_withdrawal_source BEFORE INSERT ON erp_private.quality_withdrawals FOR EACH ROW EXECUTE FUNCTION erp_private.guard_quality_withdrawal();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_quality_seal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_source jsonb; v_snapshot jsonb;
BEGIN
 v_source:=erp_private.quality_source(NEW.resource_id);v_snapshot:=erp_private.quality_manifest(NEW.resource_id);
 IF v_source->>'state' IS DISTINCT FROM 'Draft' OR NEW.source_hash IS DISTINCT FROM v_source->>'sourceHash' OR NEW.snapshot IS DISTINCT FROM v_snapshot OR NEW.hash<>encode(sha256(convert_to(v_snapshot::text,'UTF8')),'hex') OR jsonb_array_length(v_snapshot->'files')>20 OR jsonb_array_length(v_snapshot->'withdrawals')>200 OR EXISTS(SELECT 1 FROM erp_private.documents d WHERE d.quality_resource_id=NEW.resource_id AND d.status='Pending' AND d.expires_at>now()) THEN RAISE EXCEPTION 'Review seal must freeze the complete current evidence snapshot' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quality_seal_source BEFORE INSERT ON erp_private.quality_seals FOR EACH ROW EXECUTE FUNCTION erp_private.guard_quality_seal();
--> statement-breakpoint
CREATE FUNCTION erp_private.require_quality_seal() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_resource uuid;v_seal erp_private.quality_seals%ROWTYPE;v_a erp_private.approval_requests%ROWTYPE;
BEGIN
 IF NEW.state NOT IN('Submitted','Posted') THEN RETURN NEW; END IF;
 SELECT id INTO v_resource FROM erp_private.quality_resources WHERE CASE TG_TABLE_NAME WHEN 'stock_controls' THEN stock_control_id=NEW.id WHEN 'customer_returns' THEN customer_return_id=NEW.id ELSE supplier_claim_id=NEW.id END;
 IF OLD.state='Draft' OR v_resource IS NOT NULL THEN
  SELECT * INTO v_seal FROM erp_private.quality_seals WHERE resource_id=v_resource;SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF v_seal.id IS NULL OR v_seal.source_hash<>NEW.payload_hash OR v_a.context->>'qualitySealId' IS DISTINCT FROM v_seal.id::text OR v_a.context->>'qualityEvidenceHash' IS DISTINCT FROM v_seal.hash OR v_seal.snapshot IS DISTINCT FROM erp_private.quality_manifest(v_resource) THEN RAISE EXCEPTION 'Independent approval must identify the frozen inspection evidence' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE v_t text; BEGIN FOREACH v_t IN ARRAY ARRAY['stock_controls','customer_returns','supplier_claims'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON erp_private.%I FOR EACH ROW EXECUTE FUNCTION erp_private.require_quality_seal()',v_t||'_quality_seal',v_t); END LOOP; END $$;
