CREATE OR REPLACE FUNCTION erp_private.guard_quality_document() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_source jsonb;
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.purpose='quality-evidence' THEN RAISE EXCEPTION 'Inspection originals are retained, not deleted' USING ERRCODE='23514'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN IF (OLD.purpose='quality-evidence' OR NEW.purpose='quality-evidence') AND OLD.purpose<>NEW.purpose THEN RAISE EXCEPTION 'Evidence purpose cannot be changed' USING ERRCODE='23514'; END IF; END IF;
 IF NEW.purpose<>'quality-evidence' THEN IF NEW.quality_resource_id IS NOT NULL THEN RAISE EXCEPTION 'Only inspection evidence has a quality parent' USING ERRCODE='23514'; END IF; RETURN NEW; END IF;
 v_source:=erp_private.quality_source(NEW.quality_resource_id);
 IF v_source IS NULL OR NEW.import_id IS NOT NULL OR NEW.expense_id IS NOT NULL OR NEW.activity_id IS NOT NULL OR NEW.visit_attempt_id IS NOT NULL OR NEW.visit_id IS NOT NULL OR NEW.employee_id<>NEW.uploaded_by OR NEW.bucket<>'erp-documents' OR NEW.size_bytes>5242880 OR NEW.mime_type NOT IN('image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain') OR NOT(v_source->'preparerIds' ? NEW.uploaded_by) THEN RAISE EXCEPTION 'Inspection evidence requires its actual source preparer and private bounded file' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF v_source->>'state'<>'Draft' OR NEW.status<>'Pending' OR NEW.sha256 IS NOT NULL OR NEW.attached_at IS NOT NULL OR NEW.object_path<>'quality/'||NEW.quality_resource_id::text||'/'||NEW.id::text THEN RAISE EXCEPTION 'Inspection upload starts as a pending draft authorization' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status<>'Pending' OR (to_jsonb(NEW)-ARRAY['status','sha256','image_info','attached_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','sha256','image_info','attached_at']) OR NEW.status NOT IN ('Attached','Expired') OR (NEW.status='Attached' AND (v_source->>'state'<>'Draft' OR OLD.expires_at<now() OR NEW.sha256 IS NULL OR NEW.sha256 !~ '^[a-f0-9]{64}$' OR NEW.attached_at IS NULL)) OR (NEW.status='Expired' AND (NEW.sha256 IS NOT NULL OR NEW.attached_at IS NOT NULL)) THEN RAISE EXCEPTION 'Inspection file metadata is immutable and freezes before review' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
