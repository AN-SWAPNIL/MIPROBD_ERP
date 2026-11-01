-- Custom SQL migration file, put your code below! --
REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
INSERT INTO erp_private.field_visit_policies(id,data) VALUES('company','{"maxAgeSeconds":30,"accuracyMeters":100,"radiusMeters":150,"photoRetentionDays":30,"privacyApproved":false}'::jsonb) ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE erp_private.documents ADD CONSTRAINT field_document_parent CHECK ((purpose='field-visit-evidence' AND visit_attempt_id IS NOT NULL AND import_id IS NULL AND expense_id IS NULL AND activity_id IS NULL AND size_bytes<=307200) OR (purpose<>'field-visit-evidence' AND visit_attempt_id IS NULL AND visit_id IS NULL));
--> statement-breakpoint
ALTER TABLE erp_private.field_visits ADD CONSTRAINT field_visit_evidence CHECK (quality IN ('LOCATION_CAPTURED','POOR_ACCURACY','STALE','NO_LOCATION') AND match IN ('NO_REFERENCE','APPROX_MATCH','OUTSIDE','UNCERTAIN','NO_LOCATION') AND ((photo_id IS NOT NULL AND photo_method IN ('IN_APP_CAMERA','FILE_SELECTED')) OR (photo_id IS NULL AND photo_method='NONE' AND length(btrim(photo_reason))>=5)) AND (position IS NOT NULL OR (quality='NO_LOCATION' AND length(btrim(location_reason))>=5)));
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_field_visit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF OLD.status='Voided' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','review','completed_at','outcome','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','review','completed_at','outcome','version']) THEN RAISE EXCEPTION 'Original visit evidence is immutable' USING ERRCODE='55000'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='CheckedIn' AND NEW.status IN ('Completed','Voided')) OR (OLD.status='Completed' AND NEW.status='Voided')) THEN RAISE EXCEPTION 'Invalid visit transition' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.completed_at,NEW.outcome) IS DISTINCT FROM ROW(OLD.completed_at,OLD.outcome) AND NOT (OLD.status='CheckedIn' AND NEW.status='Completed' AND NEW.completed_at IS NOT NULL AND length(btrim(NEW.outcome))>=3) THEN RAISE EXCEPTION 'Completion requires immutable outcome' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER field_visit_guard BEFORE UPDATE ON erp_private.field_visits FOR EACH ROW EXECUTE FUNCTION erp_private.guard_field_visit();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_visit_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at') THEN RAISE EXCEPTION 'Visit attempts are single use' USING ERRCODE='55000'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER visit_attempt_guard BEFORE UPDATE ON erp_private.field_visit_attempts FOR EACH ROW EXECUTE FUNCTION erp_private.guard_visit_attempt();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_visit_document() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF OLD.purpose='field-visit-evidence' AND OLD.status IN ('Attached','Expired') THEN
   IF (to_jsonb(NEW)-ARRAY['visit_id','status']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['visit_id','status']) OR (OLD.visit_id IS NOT NULL AND NEW.visit_id IS DISTINCT FROM OLD.visit_id) OR (NEW.status<>OLD.status AND NOT (OLD.status='Attached' AND NEW.status='Expired')) THEN RAISE EXCEPTION 'Visit photo metadata is immutable' USING ERRCODE='55000'; END IF;
 END IF;
 IF NEW.visit_id IS DISTINCT FROM OLD.visit_id AND (OLD.visit_id IS NOT NULL OR OLD.status<>'Attached' OR NOT EXISTS(SELECT 1 FROM erp_private.field_visits v WHERE v.id=NEW.visit_id AND v.photo_id=OLD.id AND v.attempt_id=OLD.visit_attempt_id AND v.employee_id=OLD.uploaded_by AND v.employee_id=OLD.employee_id)) THEN RAISE EXCEPTION 'Photo must link once to its owner and attempt' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER visit_document_guard BEFORE UPDATE ON erp_private.documents FOR EACH ROW EXECUTE FUNCTION erp_private.guard_visit_document();
--> statement-breakpoint
CREATE FUNCTION erp_private.require_visit_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM erp_private.field_visit_events e WHERE e.visit_id=NEW.id AND (e.details->>'version')::int=NEW.version) THEN RAISE EXCEPTION 'Visit changes require a matching immutable event' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER visit_event_required AFTER INSERT OR UPDATE ON erp_private.field_visits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.require_visit_event();
--> statement-breakpoint
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['field_visit_events','customer_locations'] LOOP EXECUTE format('CREATE TRIGGER immutable_field_history BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',name); END LOOP;
 FOREACH name IN ARRAY ARRAY['field_visits','field_visit_attempts','field_visit_policies'] LOOP EXECUTE format('CREATE TRIGGER retain_field_history BEFORE DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',name); END LOOP;
END; $$;
