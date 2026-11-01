CREATE OR REPLACE FUNCTION erp_private.guard_plan_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status='Approved' OR ROW(NEW.id,NEW.employee_id,NEW.kind,NEW.period) IS DISTINCT FROM ROW(OLD.id,OLD.employee_id,OLD.kind,OLD.period) THEN RAISE EXCEPTION 'Approved plan/identity is immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status='Submitted' AND (NEW.status NOT IN ('Approved','Rejected') OR NEW.data IS DISTINCT FROM OLD.data OR NEW.reviewed_by IS NULL OR (NEW.reviewed_by=NEW.employee_id AND NOT erp_private.active_super_admin(NEW.reviewed_by)) OR length(btrim(NEW.review_reason))<5) THEN RAISE EXCEPTION 'Submitted plans require authorized review without content changes' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
