ALTER TABLE erp_private.field_visits ADD CONSTRAINT field_visit_position_bounds CHECK (
  position IS NULL OR (
    jsonb_typeof(position->'latitude')='number' AND jsonb_typeof(position->'longitude')='number'
    AND jsonb_typeof(position->'accuracy')='number' AND jsonb_typeof(position->'capturedAt')='string'
    AND (position->>'latitude')::numeric BETWEEN -90 AND 90
    AND (position->>'longitude')::numeric BETWEEN -180 AND 180
    AND (position->>'accuracy')::numeric>0 AND (position->>'accuracy')::numeric<=100000
  )
);
--> statement-breakpoint
ALTER TABLE erp_private.field_visits ADD CONSTRAINT field_visit_completion_consistency CHECK (
  (status='CheckedIn' AND completed_at IS NULL AND outcome='')
  OR (status='Completed' AND completed_at IS NOT NULL AND length(btrim(outcome))>=3)
  OR status='Voided'
);
--> statement-breakpoint
CREATE FUNCTION erp_private.check_visit_relationships() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM erp_private.field_visit_attempts a WHERE a.id=NEW.attempt_id AND a.employee_id=NEW.employee_id AND a.customer_id IS NOT DISTINCT FROM NEW.customer_id AND a.lead_id IS NOT DISTINCT FROM NEW.lead_id AND a.policy=NEW.policy AND a.consumed_at IS NOT NULL) THEN RAISE EXCEPTION 'Visit must consume its own matching attempt' USING ERRCODE='23514'; END IF;
 IF NEW.site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.customer_locations c WHERE c.id=NEW.site_id AND c.customer_id=NEW.customer_id) THEN RAISE EXCEPTION 'Approved site must belong to this customer' USING ERRCODE='23514'; END IF;
 IF NEW.photo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.documents d WHERE d.id=NEW.photo_id AND d.visit_id=NEW.id AND d.visit_attempt_id=NEW.attempt_id AND d.employee_id=NEW.employee_id AND d.uploaded_by=NEW.employee_id AND d.purpose='field-visit-evidence' AND d.status IN ('Attached','Expired') AND d.image_info IS NOT NULL) THEN RAISE EXCEPTION 'Visit evidence must be reciprocally linked to its owner and attempt' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER visit_relationships_required AFTER INSERT OR UPDATE ON erp_private.field_visits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.check_visit_relationships();
