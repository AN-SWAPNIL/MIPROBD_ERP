ALTER TABLE "erp_private"."approval_policies" DROP CONSTRAINT "approval_policy_state";--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" DROP CONSTRAINT "approval_request_state";--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_configurations" DROP CONSTRAINT "ledger_configuration_state";--> statement-breakpoint
ALTER TABLE "erp_private"."opening_drafts" DROP CONSTRAINT "opening_separate_approver";--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD COLUMN "verified_as_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD COLUMN "approved_as_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_policies" ADD CONSTRAINT "approval_policy_state" CHECK ("erp_private"."approval_policies"."state" in ('Draft','Approved','Retired') and "erp_private"."approval_policies"."domain"="erp_private"."approval_policies"."data"->>'domain' and ("erp_private"."approval_policies"."state"<>'Approved' or "erp_private"."approval_policies"."approved_by" is not null));--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD CONSTRAINT "approval_request_state" CHECK ("erp_private"."approval_requests"."state" in ('Submitted','Verified','Approved','Rejected','Posted') and "erp_private"."approval_requests"."amount_bdt">=0 and ("erp_private"."approval_requests"."state" not in ('Verified','Approved','Posted') or "erp_private"."approval_requests"."verified_by" is not null) and ("erp_private"."approval_requests"."state" not in ('Approved','Posted') or "erp_private"."approval_requests"."approved_by" is not null) and (not "erp_private"."approval_requests"."verified_as_super_admin" or "erp_private"."approval_requests"."verified_by" is not null) and (not "erp_private"."approval_requests"."approved_as_super_admin" or "erp_private"."approval_requests"."approved_by" is not null) and ("erp_private"."approval_requests"."verified_by" is null or "erp_private"."approval_requests"."verified_as_super_admin" or "erp_private"."approval_requests"."verified_by"<>"erp_private"."approval_requests"."requested_by") and ("erp_private"."approval_requests"."approved_by" is null or (("erp_private"."approval_requests"."approved_as_super_admin" or "erp_private"."approval_requests"."approved_by"<>"erp_private"."approval_requests"."requested_by") and ("erp_private"."approval_requests"."approved_as_super_admin" or "erp_private"."approval_requests"."policy"->>'independentVerifier'<>'true' or "erp_private"."approval_requests"."approved_by"<>"erp_private"."approval_requests"."verified_by"))));--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_configurations" ADD CONSTRAINT "ledger_configuration_state" CHECK ("erp_private"."ledger_configurations"."state" in ('Draft','Approved','Retired') and ("erp_private"."ledger_configurations"."state"<>'Approved' or "erp_private"."ledger_configurations"."approved_by" is not null));
--> statement-breakpoint
CREATE FUNCTION erp_private.active_super_admin(eid text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.employees WHERE id=eid AND status='Active' AND role='Super Admin')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_authority_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'Authority configuration starts as an unapproved draft' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR NOT ((OLD.state='Draft' AND NEW.state='Approved') OR (OLD.state='Approved' AND NEW.state='Retired')) OR
   (to_jsonb(NEW)-ARRAY['state','version','approved_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approved_by']) OR
   (OLD.state='Approved' AND NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN RAISE EXCEPTION 'Approved configuration data is immutable; use a new version' USING ERRCODE='23514'; END IF;
  IF NEW.state='Approved' AND NOT erp_private.active_super_admin(NEW.approved_by) THEN RAISE EXCEPTION 'An active Super Admin must approve authority configuration' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_control_approval() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p erp_private.approval_policies%ROWTYPE;
BEGIN
 SELECT * INTO p FROM erp_private.approval_policies WHERE id=NEW.policy_id;
 IF p.state<>'Approved' OR p.version<>NEW.policy_version OR p.data<>NEW.policy OR p.domain<>NEW.domain OR NEW.amount_bdt>(p.data->>'maximumAmountBdt')::numeric OR NEW.payload_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Approval must use a current approved policy and threshold' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.verified_by IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.verified_as_super_admin OR NEW.approved_as_super_admin THEN RAISE EXCEPTION 'Requests start with immutable submitted evidence, not invented authority' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.version<>OLD.version+1 OR
   (to_jsonb(NEW)-ARRAY['state','version','reason','verified_by','approved_by','updated_at','verified_as_super_admin','approved_as_super_admin']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','reason','verified_by','approved_by','updated_at','verified_as_super_admin','approved_as_super_admin']) OR
   NOT ((OLD.state='Submitted' AND NEW.state IN ('Verified','Rejected')) OR (OLD.state='Verified' AND NEW.state IN ('Approved','Rejected')) OR (OLD.state='Approved' AND NEW.state IN ('Posted','Rejected'))) THEN RAISE EXCEPTION 'Approval transitions cannot skip history or alter source evidence' USING ERRCODE='23514'; END IF;
  IF NEW.state='Verified' THEN
   IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_as_super_admin IS DISTINCT FROM OLD.approved_as_super_admin OR
    NOT EXISTS(SELECT 1 FROM erp_private.employees WHERE id=NEW.verified_by AND status='Active') OR
    (NEW.verified_as_super_admin AND NOT erp_private.active_super_admin(NEW.verified_by)) OR
    (NOT NEW.verified_as_super_admin AND (NOT(NEW.policy->'verifierIds' ? NEW.verified_by) OR coalesce(NEW.context->'excludedActorIds','[]'::jsonb) ? NEW.verified_by)) THEN RAISE EXCEPTION 'Verification requires named delegated authority or active Super Admin authority' USING ERRCODE='23514'; END IF;
  ELSIF NEW.state='Approved' THEN
   IF NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verified_as_super_admin IS DISTINCT FROM OLD.verified_as_super_admin OR
    NOT EXISTS(SELECT 1 FROM erp_private.employees WHERE id=NEW.approved_by AND status='Active') OR
    (NEW.approved_as_super_admin AND NOT erp_private.active_super_admin(NEW.approved_by)) OR
    (NOT NEW.approved_as_super_admin AND (NOT(NEW.policy->'approverIds' ? NEW.approved_by) OR coalesce(NEW.context->'excludedActorIds','[]'::jsonb) ? NEW.approved_by)) THEN RAISE EXCEPTION 'Final approval requires named delegated authority or active Super Admin authority' USING ERRCODE='23514'; END IF;
  ELSIF ROW(NEW.verified_by,NEW.approved_by,NEW.verified_as_super_admin,NEW.approved_as_super_admin) IS DISTINCT FROM ROW(OLD.verified_by,OLD.approved_by,OLD.verified_as_super_admin,OLD.approved_as_super_admin) THEN RAISE EXCEPTION 'Recorded decision identities and authority cannot be rewritten' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Posted' AND ((NEW.verified_as_super_admin AND NOT erp_private.active_super_admin(NEW.verified_by)) OR (NEW.approved_as_super_admin AND NOT erp_private.active_super_admin(NEW.approved_by))) THEN RAISE EXCEPTION 'Super Admin authority was withdrawn before posting' USING ERRCODE='23514'; END IF;
  IF length(btrim(NEW.reason))<5 THEN RAISE EXCEPTION 'A decision reason is required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

--> statement-breakpoint
-- Source-specific Super Admin authority guards
CREATE OR REPLACE FUNCTION erp_private.guard_stock_control_header() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; p_state text; l erp_private.stock_control_lines%ROWTYPE;
BEGIN
  IF NEW.payload_hash !~ '^[a-f0-9]{64}$' OR NOT (NEW.preparer_ids ? NEW.created_by) OR NEW.count_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Stock controls require explicit inspection, source and preparer evidence' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Stock controls start as unposted drafts' USING ERRCODE='23514'; END IF;
    IF NEW.revision_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.stock_controls o WHERE o.id=NEW.revision_of_id AND o.state='Superseded' AND o.kind=NEW.kind AND NEW.preparer_ids @> o.preparer_ids) THEN RAISE EXCEPTION 'A linked revision retains all earlier preparers' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state IN ('Posted','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at']) OR NOT ((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Posted','Superseded'))) THEN RAISE EXCEPTION 'Stock source content is immutable; use a linked reviewed revision' USING ERRCODE='23514'; END IF;
    IF OLD.state='Submitted' AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Submitted approval identity is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state IN ('Submitted','Posted') AND NEW.approval_id IS NULL THEN RAISE EXCEPTION 'Submitted sources require approval identity' USING ERRCODE='23514'; END IF;
    IF NEW.approval_id IS NOT NULL THEN
      SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
      IF a.id IS NULL OR a.domain<>'Stock' OR a.resource_type<>'Stock Control' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt IS DISTINCT FROM NEW.total_bdt OR a.context->'excludedActorIds' IS DISTINCT FROM NEW.preparer_ids THEN RAISE EXCEPTION 'Stock source and approval snapshot must agree' USING ERRCODE='23514'; END IF;
      IF NEW.state='Posted' AND (a.state<>'Posted' OR (NEW.preparer_ids ? a.verified_by AND NOT a.verified_as_super_admin) OR (NEW.preparer_ids ? a.approved_by AND NOT a.approved_as_super_admin)) THEN RAISE EXCEPTION 'All source preparers are excluded from independent decisions' USING ERRCODE='23514'; END IF;
      IF NEW.state='Superseded' THEN SELECT state INTO p_state FROM erp_private.approval_policies WHERE id=a.policy_id; IF a.state<>'Rejected' AND p_state='Approved' THEN RAISE EXCEPTION 'Reject an active request before revising' USING ERRCODE='23514'; END IF; END IF;
    END IF;
    IF NEW.state IN ('Submitted','Posted') THEN
      IF NEW.total_bdt IS NULL THEN RAISE EXCEPTION 'Unknown surplus costs block submission' USING ERRCODE='23514'; END IF;
      FOR l IN SELECT * FROM erp_private.stock_control_lines WHERE control_id=NEW.id LOOP
        PERFORM 1 FROM erp_private.stock_batches WHERE id=l.batch_id FOR UPDATE;
        IF erp_private.stock_control_fingerprint(l.batch_id) IS DISTINCT FROM l.fingerprint OR l.value_bdt IS NULL OR (l.delta_quantity>0 AND l.surplus_condition IS NULL) OR (NEW.kind='Physical Count' AND l.counted_quantity<l.held_quantity) THEN RAISE EXCEPTION 'Stale or incomplete physical snapshots require a new reviewed revision' USING ERRCODE='23514'; END IF;
      END LOOP;
    END IF;
    IF NEW.state='Posted' AND NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Stock corrections post on the current business date' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_stock_control_posting() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_cid text; v_control erp_private.stock_controls%ROWTYPE; v_line erp_private.stock_control_lines%ROWTYPE; v_post erp_private.stock_control_postings%ROWTYPE; v_batch erp_private.stock_batches%ROWTYPE; v_move erp_private.stock_movements%ROWTYPE; v_amount numeric; v_count integer; v_expected integer;
BEGIN
  IF TG_TABLE_NAME='stock_controls' THEN v_cid:=NEW.id;
  ELSIF TG_TABLE_NAME='stock_control_lines' THEN v_cid:=NEW.control_id;
  ELSIF TG_TABLE_NAME IN ('stock_control_postings','stock_hold_writeoffs','stock_condition_events') THEN SELECT control_id INTO v_cid FROM erp_private.stock_control_lines WHERE id=NEW.line_id;
  ELSIF TG_TABLE_NAME='stock_batches' THEN IF NEW.correction_line_id IS NULL THEN RETURN NULL; END IF; SELECT control_id INTO v_cid FROM erp_private.stock_control_lines WHERE id=NEW.correction_line_id;
  ELSE
    IF NEW.type<>'Adjustment' THEN RETURN NULL; END IF;
    SELECT l.control_id INTO v_cid FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE p.movement_id=NEW.id;
    IF v_cid IS NULL THEN RAISE EXCEPTION 'Adjustment needs an independently approved physical source' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT * INTO v_control FROM erp_private.stock_controls WHERE id=v_cid;
  SELECT count(*),CASE WHEN count(*) FILTER(WHERE value_bdt IS NULL)>0 THEN NULL ELSE sum(CASE WHEN v_control.kind='Condition Release' THEN book_value_bdt ELSE value_bdt END) END INTO v_count,v_amount FROM erp_private.stock_control_lines WHERE control_id=v_cid;
  IF v_control.id IS NULL OR v_count<1 OR v_count>50 OR v_amount IS DISTINCT FROM v_control.total_bdt THEN RAISE EXCEPTION 'Stock source lines and approval amount must reconcile' USING ERRCODE='23514'; END IF;
  IF v_control.state<>'Posted' THEN
    IF EXISTS(SELECT 1 FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE l.control_id=v_cid) OR EXISTS(SELECT 1 FROM erp_private.stock_batches b JOIN erp_private.stock_control_lines l ON l.id=b.correction_line_id WHERE l.control_id=v_cid) THEN RAISE EXCEPTION 'Unposted drafts cannot change stock or condition' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp_private.approval_requests a WHERE a.id=v_control.approval_id AND a.state='Posted' AND a.resource_type='Stock Control' AND a.resource_id=v_control.id AND a.payload_hash=v_control.payload_hash AND a.amount_bdt=v_control.total_bdt AND NOT((v_control.preparer_ids ? a.verified_by AND NOT a.verified_as_super_admin)) AND NOT((v_control.preparer_ids ? a.approved_by AND NOT a.approved_as_super_admin))) THEN RAISE EXCEPTION 'Posted stock sources require independent exact approval' USING ERRCODE='23514'; END IF;
  FOR v_line IN SELECT * FROM erp_private.stock_control_lines WHERE control_id=v_cid LOOP
    SELECT * INTO v_post FROM erp_private.stock_control_postings WHERE line_id=v_line.id;
    IF v_post.id IS NULL OR v_post.date<>v_control.posted_date OR v_post.created_by<>v_control.posted_by THEN RAISE EXCEPTION 'Every stock line needs a matching atomic posting' USING ERRCODE='23514'; END IF;
    SELECT * INTO v_batch FROM erp_private.stock_batches WHERE id=v_post.batch_id;
    IF v_line.delta_quantity>0 THEN
      IF v_batch.correction_line_id IS DISTINCT FROM v_line.id OR v_batch.product_id IS DISTINCT FROM v_line.snapshot->>'productId' OR v_batch.quantity_received<>v_line.delta_quantity OR v_batch.received_value_bdt<>v_line.value_bdt OR v_batch.landed_cost_per_unit<>v_line.unit_cost_bdt OR v_batch.condition<>v_line.surplus_condition OR v_batch.lot_number IS DISTINCT FROM v_line.snapshot->>'lotNumber' OR v_batch.manufacturing_date IS DISTINCT FROM (v_line.snapshot->>'manufacturingDate')::date OR v_batch.expiry_date IS DISTINCT FROM (v_line.snapshot->>'expiryDate')::date OR v_batch.received_date<>v_control.count_date OR v_batch.source_reference<>v_control.number OR v_batch.warehouse IS DISTINCT FROM v_line.snapshot->>'warehouse' OR v_batch.location IS DISTINCT FROM v_line.snapshot->>'location' THEN RAISE EXCEPTION 'Surplus batch must inherit its independently approved count/cost source' USING ERRCODE='23514'; END IF;
    ELSIF v_post.batch_id<>v_line.batch_id THEN RAISE EXCEPTION 'Loss/release must reference the original batch' USING ERRCODE='23514'; END IF;
    IF v_line.delta_quantity=0 THEN
      IF v_post.movement_id IS NOT NULL THEN RAISE EXCEPTION 'A zero variance does not create a quantity movement' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO v_move FROM erp_private.stock_movements WHERE id=v_post.movement_id;
      IF v_move.id IS NULL OR v_move.type<>'Adjustment' OR v_move.batch_id<>v_post.batch_id OR v_move.quantity_delta<>v_line.delta_quantity OR v_move.value_bdt<>v_line.value_bdt OR v_move.date<>v_post.date OR v_move.reference<>v_control.number OR v_move.created_by<>v_control.posted_by THEN RAISE EXCEPTION 'Stock correction journal differs from its approved source' USING ERRCODE='23514'; END IF;
    END IF;
    v_expected:=CASE WHEN v_control.kind='Write-off' AND v_line.hold_id IS NOT NULL THEN 1 ELSE 0 END;
    IF (SELECT count(*) FROM erp_private.stock_hold_writeoffs WHERE line_id=v_line.id)<>v_expected OR (v_expected=1 AND NOT EXISTS(SELECT 1 FROM erp_private.stock_hold_writeoffs w WHERE w.line_id=v_line.id AND w.hold_id=v_line.hold_id AND w.quantity=-v_line.delta_quantity AND w.date=v_control.posted_date)) THEN RAISE EXCEPTION 'Held write-off must dispose, not release, its exact units' USING ERRCODE='23514'; END IF;
    v_expected:=CASE WHEN v_control.kind='Condition Release' THEN 1 ELSE 0 END;
    IF (SELECT count(*) FROM erp_private.stock_condition_events WHERE line_id=v_line.id)<>v_expected OR (v_expected=1 AND NOT EXISTS(SELECT 1 FROM erp_private.stock_condition_events e WHERE e.line_id=v_line.id AND e.batch_id=v_line.batch_id AND e.date=v_control.posted_date AND e.condition='Saleable')) THEN RAISE EXCEPTION 'Condition release needs its exact dated immutable event' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_customer_return() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_d erp_private.deliveries%ROWTYPE; v_a erp_private.approval_requests%ROWTYPE; v_l erp_private.customer_return_lines%ROWTYPE; v_due numeric; v_policy text;
BEGIN
  SELECT * INTO v_d FROM erp_private.deliveries WHERE id=NEW.delivery_id;
  IF v_d.id IS NULL OR (NEW.customer_id,NEW.order_id,NEW.owner_id) IS DISTINCT FROM (v_d.customer_id,v_d.order_id,v_d.owner_id) OR NEW.received_date<v_d.date OR NEW.received_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.payload_hash !~ '^[a-f0-9]{64}$' OR NOT(NEW.preparer_ids ? NEW.created_by) OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Return requires original customer, order, inspection and source evidence' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL OR NEW.posted_date IS NOT NULL OR NEW.applied_bdt IS NOT NULL THEN RAISE EXCEPTION 'Returns start as unposted drafts' USING ERRCODE='23514'; END IF;
    IF NEW.revision_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.customer_returns r WHERE r.id=NEW.revision_of_id AND r.state='Superseded' AND r.delivery_id=NEW.delivery_id AND r.kind=NEW.kind AND NEW.preparer_ids @> r.preparer_ids) THEN RAISE EXCEPTION 'Return revisions retain original source and every preparer' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state IN ('Posted','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at','applied_bdt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at','applied_bdt']) OR NOT((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Posted','Superseded'))) THEN RAISE EXCEPTION 'Return inspection is immutable; use a linked reviewed revision' USING ERRCODE='23514'; END IF;
    IF OLD.state='Submitted' AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Return approval identity is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.state IN ('Draft','Submitted','Posted') THEN
    IF NEW.kind='Invoiced Return' THEN
      IF NOT EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x JOIN erp_private.sales_invoices i ON i.id=x.invoice_id WHERE x.delivery_id=NEW.delivery_id AND x.active AND i.id=NEW.invoice_id AND i.status='Approved') THEN RAISE EXCEPTION 'An invoiced return needs the actual approved invoice' USING ERRCODE='23514'; END IF;
    ELSIF EXISTS(SELECT 1 FROM erp_private.invoice_deliveries x WHERE x.delivery_id=NEW.delivery_id AND x.active) THEN RAISE EXCEPTION 'An uninvoiced refusal cannot issue invoice credit' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.approval_id IS NOT NULL THEN
    SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
    IF v_a.id IS NULL OR v_a.domain<>'Returns' OR v_a.resource_type<>'Customer Return' OR v_a.resource_id<>NEW.id OR v_a.payload_hash<>NEW.payload_hash OR v_a.amount_bdt<>NEW.exposure_bdt OR v_a.context->'excludedActorIds' IS DISTINCT FROM NEW.preparer_ids THEN RAISE EXCEPTION 'Return and independent approval must match' USING ERRCODE='23514'; END IF;
    IF NEW.state='Posted' AND (v_a.state<>'Posted' OR (NEW.preparer_ids ? v_a.verified_by AND NOT v_a.verified_as_super_admin) OR (NEW.preparer_ids ? v_a.approved_by AND NOT v_a.approved_as_super_admin)) THEN RAISE EXCEPTION 'Every return preparer is excluded from independent decisions' USING ERRCODE='23514'; END IF;
    IF NEW.state='Superseded' THEN SELECT state INTO v_policy FROM erp_private.approval_policies WHERE id=v_a.policy_id; IF v_a.state<>'Rejected' AND v_policy='Approved' THEN RAISE EXCEPTION 'Reject an active request before revising' USING ERRCODE='23514'; END IF; END IF;
  ELSIF NEW.state IN ('Submitted','Posted') THEN RAISE EXCEPTION 'Return needs approval identity' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.state IN ('Submitted','Posted') THEN
    FOR v_l IN SELECT * FROM erp_private.customer_return_lines WHERE return_id=NEW.id LOOP
      IF v_l.fingerprint IS DISTINCT FROM erp_private.return_line_fingerprint(v_l.delivery_line_id) THEN RAISE EXCEPTION 'Return quantity/invoice snapshot is stale' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  IF NEW.state='Posted' THEN
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE invoice_id=NEW.invoice_id;
    IF NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.applied_bdt IS DISTINCT FROM least(NEW.credit_bdt,greatest(v_due,0)) THEN RAISE EXCEPTION 'Return credit application must use current original due and posting date' USING ERRCODE='23514'; END IF;
  ELSIF NEW.applied_bdt IS NOT NULL OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Unposted returns cannot alter stock or financial results' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_return_settlement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_r erp_private.customer_returns%ROWTYPE; v_a erp_private.approval_requests%ROWTYPE; v_used numeric; v_due numeric; v_target erp_private.sales_invoices%ROWTYPE; v_opening erp_private.customer_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM erp_private.customer_returns WHERE id=NEW.return_id FOR UPDATE;
  SELECT * INTO v_a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF v_r.id IS NULL OR v_r.state<>'Posted' OR v_r.invoice_id IS NULL OR v_a.id IS NULL OR v_a.domain<>'Returns' OR v_a.resource_type<>'Return Settlement' OR v_a.resource_id<>NEW.id OR v_a.payload_hash<>NEW.payload_hash OR v_a.amount_bdt<>NEW.amount_bdt OR v_a.context->>'returnId' IS DISTINCT FROM NEW.return_id OR NEW.payload_hash !~ '^[a-f0-9]{64}$' OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Settlement requires a posted return and exact approved source' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.date IS NOT NULL OR NEW.transaction_id IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Settlement starts submitted, not posted' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','date','posted_by','transaction_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','date','posted_by','transaction_id']) OR v_a.state<>'Posted' OR (v_a.approved_by=NEW.created_by AND NOT v_a.approved_as_super_admin) OR (v_a.verified_by=NEW.created_by AND NOT v_a.verified_as_super_admin) THEN RAISE EXCEPTION 'Settlement is immutable and independently approved' USING ERRCODE='23514'; END IF;
  END IF;
  PERFORM id FROM erp_private.customers WHERE id=v_r.customer_id FOR UPDATE;
  SELECT coalesce(sum(amount_bdt),0) INTO v_used FROM erp_private.return_settlements WHERE return_id=NEW.return_id AND state='Posted';
  IF NEW.amount_bdt>v_r.credit_bdt-v_r.applied_bdt-v_used THEN RAISE EXCEPTION 'Return credit cannot be spent twice' USING ERRCODE='23514'; END IF;
  IF NEW.kind='Refund' THEN
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE customer_id=v_r.customer_id AND NOT(source_id=NEW.id AND type='Return Refund');
    IF NEW.amount_bdt>greatest(-v_due,0) OR NOT EXISTS(SELECT 1 FROM erp_private.cash_accounts WHERE id=NEW.account_id AND active) THEN RAISE EXCEPTION 'Refund requires net customer credit and an active payment account' USING ERRCODE='23514'; END IF;
  ELSIF NEW.receivable_entry_id IS NOT NULL THEN
    SELECT * INTO v_opening FROM erp_private.customer_entries WHERE id=NEW.receivable_entry_id FOR UPDATE;
    v_due:=erp_private.opening_receivable_due(NEW.receivable_entry_id,NEW.id);
    IF v_opening.id IS NULL OR v_opening.customer_id<>v_r.customer_id OR v_opening.type<>'Opening Due' OR v_opening.opening_position_id IS NULL OR v_opening.date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR v_due IS NULL OR NEW.amount_bdt>v_due THEN
      RAISE EXCEPTION 'Credit application requires outstanding approved opening due of the same customer' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO v_target FROM erp_private.sales_invoices WHERE id=NEW.invoice_id FOR UPDATE;
    SELECT coalesce(sum(debit-credit),0) INTO v_due FROM erp_private.customer_entries WHERE invoice_id=NEW.invoice_id AND NOT(source_id=NEW.id AND type='Credit Transfer In');
    IF v_target.id IS NULL OR v_target.id=v_r.invoice_id OR v_target.customer_id<>v_r.customer_id OR v_target.status<>'Approved' OR NEW.amount_bdt>v_due THEN RAISE EXCEPTION 'Credit application needs a different outstanding invoice of the same customer' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.state='Posted' AND NEW.date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Settlement posts on current business date' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.require_payroll_approval(aid text,resource text,rid text,hash text,amount numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; BEGIN
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=aid;
 IF a.id IS NULL OR a.state<>'Posted' OR a.resource_type<>resource OR a.resource_id<>rid OR a.payload_hash<>hash OR a.amount_bdt<>amount OR a.domain NOT IN ('Payroll','Payroll Policy') OR (a.context->'excludedActorIds' ? a.approved_by AND NOT a.approved_as_super_admin) OR (a.context->'excludedActorIds' ? a.verified_by AND NOT a.verified_as_super_admin) THEN RAISE EXCEPTION 'Payroll needs unchanged independent approval' USING ERRCODE='23514'; END IF;
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
  IF NEW.state='Posted' AND (a.state<>'Posted' OR (NEW.preparer_ids ? a.verified_by AND NOT a.verified_as_super_admin) OR (NEW.preparer_ids ? a.approved_by AND NOT a.approved_as_super_admin)) THEN RAISE EXCEPTION 'Every preparer is excluded from independent approval' USING ERRCODE='23514'; END IF;
  IF NEW.state='Superseded' AND a.state<>'Rejected' AND EXISTS(SELECT 1 FROM erp_private.approval_policies WHERE id=a.policy_id AND state='Approved') THEN RAISE EXCEPTION 'Reject active approval before revision' USING ERRCODE='23514'; END IF;
 ELSIF NEW.state IN ('Submitted','Posted') THEN RAISE EXCEPTION 'Claim needs independent approval' USING ERRCODE='23514'; END IF;
 IF NEW.state='Posted' THEN
  IF NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR NEW.posted_by IS NULL THEN RAISE EXCEPTION 'Claim uses actual posting date and actor' USING ERRCODE='23514'; END IF;
 ELSIF NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Unposted claim has no posting identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
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
  IF a.id IS NULL OR a.domain<>'Rejections' OR a.resource_type<>'Supplier Replacement Receipt' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt<>NEW.value_bdt OR a.requested_by<>NEW.created_by OR a.context->>'claimId' IS DISTINCT FROM c.id OR a.context->'excludedActorIds' IS DISTINCT FROM (c.preparer_ids||to_jsonb(NEW.created_by)) OR (NEW.state='Submitted' AND a.state<>'Submitted') OR (NEW.state='Posted' AND (a.state<>'Posted' OR ((c.preparer_ids||to_jsonb(NEW.created_by)) ? a.verified_by AND NOT a.verified_as_super_admin) OR ((c.preparer_ids||to_jsonb(NEW.created_by)) ? a.approved_by AND NOT a.approved_as_super_admin))) THEN
   RAISE EXCEPTION 'Replacement requires its actual preparer and independent source-linked approval' USING ERRCODE='23514';
  END IF;
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.protect_opening_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Opening evidence is retained' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='opening_sources' THEN
    IF TG_OP='UPDATE' AND OLD.state='Ready' THEN RAISE EXCEPTION 'Profiled sources are immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state='Ready' AND (NEW.sha256 !~ '^[a-f0-9]{64}$' OR NEW.profile->>'sha256' IS DISTINCT FROM NEW.sha256) THEN RAISE EXCEPTION 'Source profile hash mismatch' USING ERRCODE='23514'; END IF;
  ELSE
    IF TG_OP='INSERT' AND NEW.state<>'Draft' THEN RAISE EXCEPTION 'Openings start as drafts' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' THEN
      IF NEW.state='Approved' AND OLD.state<>'Approved' AND NOT erp_private.active_super_admin(NEW.approved_by) THEN RAISE EXCEPTION 'Only an active Super Admin may approve reconciled opening data' USING ERRCODE='23514'; END IF;
      IF NEW.source_id<>OLD.source_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Opening identity/version is immutable' USING ERRCODE='23514'; END IF;
      IF OLD.state IN ('Approved','Posted','Reconciled') THEN
        IF NOT ((OLD.state='Approved' AND NEW.state='Posted') OR (OLD.state='Posted' AND NEW.state='Reconciled')) OR
          (to_jsonb(NEW)-ARRAY['state','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','updated_at']) THEN RAISE EXCEPTION 'Approved opening evidence is immutable' USING ERRCODE='23514'; END IF;
      ELSE
        IF NEW.state IN ('Posted','Reconciled') OR (NEW.state='Previewed' AND OLD.state<>'Validated') OR (NEW.state='Approved' AND OLD.state<>'Previewed') THEN RAISE EXCEPTION 'Opening review stages cannot be skipped' USING ERRCODE='23514'; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
