REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_reporting_hierarchy() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('employee-hierarchy',0));
  IF EXISTS (WITH RECURSIVE ancestors AS (SELECT id,manager_id FROM erp_private.employees WHERE id=NEW.manager_id UNION ALL SELECT e.id,e.manager_id FROM erp_private.employees e JOIN ancestors a ON e.id=a.manager_id) SELECT 1 FROM ancestors WHERE id=NEW.id) THEN
    RAISE EXCEPTION 'Reporting hierarchy cannot contain a cycle' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER reporting_hierarchy_guard BEFORE UPDATE ON erp_private.employees FOR EACH ROW EXECUTE FUNCTION erp_private.guard_reporting_hierarchy();
--> statement-breakpoint
ALTER TABLE erp_private.marketing_activities ADD CONSTRAINT activity_manual_type CHECK (type IN ('CUSTOMER_CONTACT','CUSTOMER_VISIT','DOCTOR_MEETING','PROCUREMENT_MEETING','DEALER_VISIT','PRODUCT_PRESENTATION','PRODUCT_DEMONSTRATION','SAMPLE_DELIVERED','NEGOTIATION_UPDATE','TENDER_FOLLOW_UP','COLLECTION_VISIT','TRAINING_SESSION','SERVICE_FOLLOW_UP','MARKET_SURVEY','OFFICE_COORDINATION','GENERAL_NOTE'));
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_activity_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status='Voided' OR ROW(NEW.id,NEW.reference,NEW.employee_id,NEW.snapshot,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.reference,OLD.employee_id,OLD.snapshot,OLD.created_at) THEN RAISE EXCEPTION 'Activity identity/history is immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status='Submitted' AND (NEW.status<>'Voided' OR ROW(NEW.type,NEW.occurred_at,NEW.submitted_at,NEW.lead_id,NEW.customer_id,NEW.subject,NEW.purpose,NEW.remarks,NEW.next_follow_up_at) IS DISTINCT FROM ROW(OLD.type,OLD.occurred_at,OLD.submitted_at,OLD.lead_id,OLD.customer_id,OLD.subject,OLD.purpose,OLD.remarks,OLD.next_follow_up_at)) THEN RAISE EXCEPTION 'Submitted activity content is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.status='Voided' AND (NEW.voided_at IS NULL OR NEW.voided_by IS NULL OR length(btrim(coalesce(NEW.void_reason,'')))<5) THEN RAISE EXCEPTION 'Voiding requires an actor, time and reason' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER activity_change_guard BEFORE UPDATE ON erp_private.marketing_activities FOR EACH ROW EXECUTE FUNCTION erp_private.guard_activity_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_activity_products() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE aid text; state text; created timestamptz;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace only draft product references' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN aid:=OLD.activity_id; ELSE aid:=NEW.activity_id; END IF;
  SELECT status,created_at INTO state,created FROM erp_private.marketing_activities WHERE id=aid;
  IF state<>'Draft' AND NOT (TG_OP='INSERT' AND created=transaction_timestamp()) THEN RAISE EXCEPTION 'Submitted activity product references are immutable' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
--> statement-breakpoint
CREATE TRIGGER activity_product_guard BEFORE INSERT OR UPDATE OR DELETE ON erp_private.activity_products FOR EACH ROW EXECUTE FUNCTION erp_private.guard_activity_products();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_lead_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF ROW(NEW.id,NEW.reference,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.reference,OLD.created_by,OLD.created_at) OR (OLD.customer_id IS NOT NULL AND ROW(NEW.customer_id,NEW.converted_at,NEW.assigned_to) IS DISTINCT FROM ROW(OLD.customer_id,OLD.converted_at,OLD.assigned_to)) OR (OLD.qualified_at IS NOT NULL AND NEW.qualified_at IS DISTINCT FROM OLD.qualified_at) THEN RAISE EXCEPTION 'Lead identity/conversion history is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER lead_change_guard BEFORE UPDATE ON erp_private.marketing_leads FOR EACH ROW EXECUTE FUNCTION erp_private.guard_lead_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_follow_up_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status<>'Pending' OR ROW(NEW.id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Completed/cancelled follow-up history is immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER follow_up_change_guard BEFORE UPDATE ON erp_private.marketing_follow_ups FOR EACH ROW EXECUTE FUNCTION erp_private.guard_follow_up_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_plan_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status='Approved' OR ROW(NEW.id,NEW.employee_id,NEW.kind,NEW.period) IS DISTINCT FROM ROW(OLD.id,OLD.employee_id,OLD.kind,OLD.period) THEN RAISE EXCEPTION 'Approved plan/identity is immutable' USING ERRCODE='55000'; END IF;
  IF OLD.status='Submitted' AND (NEW.status NOT IN ('Approved','Rejected') OR NEW.data IS DISTINCT FROM OLD.data OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.employee_id OR length(btrim(NEW.review_reason))<5) THEN RAISE EXCEPTION 'Submitted plans require independent review without content changes' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER plan_change_guard BEFORE UPDATE ON erp_private.marketing_plans FOR EACH ROW EXECUTE FUNCTION erp_private.guard_plan_change();
--> statement-breakpoint
ALTER TABLE erp_private.documents ADD CONSTRAINT document_activity_parent CHECK (activity_id IS NULL OR (purpose='marketing-evidence' AND import_id IS NULL AND expense_id IS NULL));
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_marketing_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.purpose='marketing-evidence' AND OLD.status='Attached' AND ROW(NEW.id,NEW.purpose,NEW.uploaded_by,NEW.object_path,NEW.bucket,NEW.file_name,NEW.mime_type,NEW.size_bytes,NEW.status,NEW.employee_id,NEW.import_id,NEW.expense_id) IS DISTINCT FROM ROW(OLD.id,OLD.purpose,OLD.uploaded_by,OLD.object_path,OLD.bucket,OLD.file_name,OLD.mime_type,OLD.size_bytes,OLD.status,OLD.employee_id,OLD.import_id,OLD.expense_id) THEN RAISE EXCEPTION 'Marketing evidence metadata is immutable' USING ERRCODE='55000'; END IF;
  IF NEW.activity_id IS DISTINCT FROM OLD.activity_id AND (OLD.activity_id IS NOT NULL OR OLD.purpose<>'marketing-evidence' OR OLD.status<>'Attached' OR NOT EXISTS (SELECT 1 FROM erp_private.marketing_activities a WHERE a.id=NEW.activity_id AND a.employee_id=OLD.employee_id AND a.employee_id=OLD.uploaded_by)) THEN RAISE EXCEPTION 'Marketing evidence can link once to its author activity' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER marketing_evidence_guard BEFORE UPDATE ON erp_private.documents FOR EACH ROW EXECUTE FUNCTION erp_private.guard_marketing_evidence();
--> statement-breakpoint
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['marketing_activities','marketing_leads','marketing_follow_ups','marketing_plans','marketing_targets','marketing_score_rules'] LOOP
    EXECUTE format('CREATE TRIGGER retained_business_history BEFORE DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',name);
  END LOOP;
END; $$;
--> statement-breakpoint
INSERT INTO erp_private.marketing_score_rules(event,label,points) VALUES
('NEW_QUALIFIED_CUSTOMER','Lead converted to qualified customer',5),
('VERIFIED_CUSTOMER_VISIT','Verified customer visit',10),
('QUALIFIED_LEAD','Qualified lead',10),
('QUOTATION_SUBMITTED','Submitted quotation',15),
('ORDER_RECEIVED','Order received',30),
('PAYMENT_COLLECTED','Net receipt credit',20),
('FOLLOW_UP_COMPLETED','Follow-up completed',5)
ON CONFLICT(event) DO NOTHING;
