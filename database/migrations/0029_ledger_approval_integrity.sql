ALTER TABLE "erp_private"."approval_policies" DROP CONSTRAINT "approval_policy_state";--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" DROP CONSTRAINT "approval_request_state";--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" DROP CONSTRAINT "ledger_journal_state";--> statement-breakpoint
ALTER TABLE "erp_private"."approval_events" ADD COLUMN "version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD COLUMN "context" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD COLUMN "revision_of_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_periods" ADD COLUMN "approval_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journals_revision_of_id_ledger_journals_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "erp_private"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_periods" ADD CONSTRAINT "ledger_periods_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_event_version_unique" ON "erp_private"."approval_events" USING btree ("approval_id","version");--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_periods" ADD CONSTRAINT "ledger_periods_approval_id_unique" UNIQUE("approval_id");--> statement-breakpoint
ALTER TABLE "erp_private"."approval_policies" ADD CONSTRAINT "approval_policy_state" CHECK ("erp_private"."approval_policies"."state" in ('Draft','Approved','Retired') and "erp_private"."approval_policies"."domain"="erp_private"."approval_policies"."data"->>'domain' and ("erp_private"."approval_policies"."state"<>'Approved' or "erp_private"."approval_policies"."approved_by" is not null) and ("erp_private"."approval_policies"."approved_by" is null or "erp_private"."approval_policies"."approved_by"<>"erp_private"."approval_policies"."created_by"));--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD CONSTRAINT "approval_request_state" CHECK ("erp_private"."approval_requests"."state" in ('Submitted','Verified','Approved','Rejected','Posted') and "erp_private"."approval_requests"."amount_bdt">=0 and ("erp_private"."approval_requests"."state" not in ('Verified','Approved','Posted') or "erp_private"."approval_requests"."verified_by" is not null) and ("erp_private"."approval_requests"."state" not in ('Approved','Posted') or "erp_private"."approval_requests"."approved_by" is not null) and ("erp_private"."approval_requests"."verified_by" is null or "erp_private"."approval_requests"."verified_by"<>"erp_private"."approval_requests"."requested_by") and ("erp_private"."approval_requests"."approved_by" is null or ("erp_private"."approval_requests"."approved_by"<>"erp_private"."approval_requests"."requested_by" and ("erp_private"."approval_requests"."policy"->>'independentVerifier'<>'true' or "erp_private"."approval_requests"."approved_by"<>"erp_private"."approval_requests"."verified_by"))));--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journal_state" CHECK ("erp_private"."ledger_journals"."state" in ('Draft','Submitted','Posted','Rejected','Superseded') and "erp_private"."ledger_journals"."total_bdt">0 and ("erp_private"."ledger_journals"."state"<>'Posted' or ("erp_private"."ledger_journals"."posted_by" is not null and "erp_private"."ledger_journals"."posted_at" is not null)));
--> statement-breakpoint
REVOKE ALL ON erp_private.approval_policies,erp_private.approval_requests,erp_private.approval_events,erp_private.ledger_accounts,erp_private.ledger_configurations,erp_private.ledger_journals,erp_private.ledger_lines,erp_private.ledger_periods,erp_private.ledger_source_events FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['approval_events','ledger_lines','ledger_periods'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',t||'_append_only',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['approval_policies','approval_requests','ledger_accounts','ledger_configurations','ledger_journals','ledger_source_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',t||'_retained',t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_authority_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'Authority configuration starts as an unapproved draft' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.version<>OLD.version+1 OR NOT ((OLD.state='Draft' AND NEW.state='Approved') OR (OLD.state='Approved' AND NEW.state='Retired')) OR
      (to_jsonb(NEW)-ARRAY['state','version','approved_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approved_by']) OR
      (OLD.state='Approved' AND NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN RAISE EXCEPTION 'Approved configuration data is immutable; use a new version' USING ERRCODE='23514'; END IF;
    IF NEW.state='Approved' AND (NEW.approved_by IS NULL OR NEW.approved_by=NEW.created_by) THEN RAISE EXCEPTION 'Independent configuration approval is required' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER approval_policy_transition BEFORE INSERT OR UPDATE ON erp_private.approval_policies FOR EACH ROW EXECUTE FUNCTION erp_private.guard_authority_configuration();
--> statement-breakpoint
CREATE TRIGGER ledger_configuration_transition BEFORE INSERT OR UPDATE ON erp_private.ledger_configurations FOR EACH ROW EXECUTE FUNCTION erp_private.guard_authority_configuration();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_control_approval() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p erp_private.approval_policies%ROWTYPE;
BEGIN
  SELECT * INTO p FROM erp_private.approval_policies WHERE id=NEW.policy_id;
  IF p.state<>'Approved' OR p.version<>NEW.policy_version OR p.data<>NEW.policy OR p.domain<>NEW.domain OR NEW.amount_bdt>(p.data->>'maximumAmountBdt')::numeric OR NEW.payload_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Approval must use a current approved policy and threshold' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.verified_by IS NOT NULL OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'Requests start with immutable submitted evidence' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.version<>OLD.version+1 OR
      (to_jsonb(NEW)-ARRAY['state','version','reason','verified_by','approved_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','reason','verified_by','approved_by','updated_at']) OR
      NOT ((OLD.state='Submitted' AND NEW.state IN ('Verified','Rejected')) OR (OLD.state='Verified' AND NEW.state IN ('Approved','Rejected')) OR (OLD.state='Approved' AND NEW.state IN ('Posted','Rejected'))) THEN RAISE EXCEPTION 'Approval transitions cannot skip review or alter source evidence' USING ERRCODE='23514'; END IF;
    IF NEW.state='Verified' AND (NOT (NEW.policy->'verifierIds' ? NEW.verified_by) OR NOT EXISTS(SELECT 1 FROM erp_private.employees WHERE id=NEW.verified_by AND status='Active') OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN RAISE EXCEPTION 'Named active independent verification is required' USING ERRCODE='23514'; END IF;
    IF NEW.state='Approved' AND (NOT (NEW.policy->'approverIds' ? NEW.approved_by) OR NOT EXISTS(SELECT 1 FROM erp_private.employees WHERE id=NEW.approved_by AND status='Active') OR NEW.verified_by IS DISTINCT FROM OLD.verified_by) THEN RAISE EXCEPTION 'Named active final approval is required' USING ERRCODE='23514'; END IF;
    IF NEW.state IN ('Posted','Rejected') AND ROW(NEW.verified_by,NEW.approved_by) IS DISTINCT FROM ROW(OLD.verified_by,OLD.approved_by) THEN RAISE EXCEPTION 'Decision identities cannot be rewritten' USING ERRCODE='23514'; END IF;
    IF length(btrim(NEW.reason))<5 THEN RAISE EXCEPTION 'A decision reason is required' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER control_approval_transition BEFORE INSERT OR UPDATE ON erp_private.approval_requests FOR EACH ROW EXECUTE FUNCTION erp_private.guard_control_approval();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_control_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r erp_private.approval_requests%ROWTYPE; eid text; expected_actor text;
BEGIN
  IF TG_TABLE_NAME='approval_requests' THEN r:=NEW;
  ELSE
    SELECT * INTO r FROM erp_private.approval_requests WHERE id=NEW.approval_id;
    IF NEW.version>r.version OR NEW.version<1 THEN RAISE EXCEPTION 'History cannot invent future approval versions' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  expected_actor:=CASE r.state WHEN 'Submitted' THEN r.requested_by WHEN 'Verified' THEN r.verified_by WHEN 'Approved' THEN r.approved_by ELSE NULL END;
  SELECT id INTO eid FROM erp_private.approval_events WHERE approval_id=r.id AND version=r.version AND action=r.state AND (expected_actor IS NULL OR actor_id=expected_actor);
  IF eid IS NULL THEN RAISE EXCEPTION 'Every decision needs matching immutable history' USING ERRCODE='23514'; END IF;
  IF r.state='Posted' AND r.resource_type='Ledger Journal' AND NOT EXISTS(SELECT 1 FROM erp_private.ledger_journals WHERE id=r.resource_id AND approval_id=r.id AND state='Posted') THEN RAISE EXCEPTION 'Approval posting must commit with its source journal' USING ERRCODE='23514'; END IF;
  IF r.state='Posted' AND r.resource_type='Ledger Period' AND NOT EXISTS(SELECT 1 FROM erp_private.ledger_periods WHERE approval_id=r.id) THEN RAISE EXCEPTION 'Closing approval must commit with its period' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER control_history_required AFTER INSERT OR UPDATE ON erp_private.approval_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_control_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER control_history_version AFTER INSERT ON erp_private.approval_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_control_history();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_ledger_header() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; policy_state text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.version<>1 OR (NEW.state='Draft' AND (NEW.source_key IS NOT NULL OR NEW.configuration_id IS NOT NULL OR NEW.approval_id IS NOT NULL OR NEW.posted_by IS NOT NULL)) OR
      (NEW.state='Posted' AND (NEW.source_key IS NULL OR NEW.configuration_id IS NULL OR NEW.type NOT IN ('Automatic','Automatic Reversal'))) OR NEW.state NOT IN ('Draft','Posted') THEN RAISE EXCEPTION 'Journals start as manual drafts or verified automatic sources' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.version<>OLD.version+1 OR OLD.state IN ('Posted','Superseded') OR
      (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_by','posted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_by','posted_at']) THEN RAISE EXCEPTION 'Journal content is immutable; draft edits require linked revisions' USING ERRCODE='23514'; END IF;
    IF OLD.state='Draft' AND NEW.state NOT IN ('Submitted','Superseded') OR OLD.state='Rejected' AND NEW.state<>'Superseded' OR OLD.state='Submitted' AND NEW.state NOT IN ('Posted','Rejected','Superseded') THEN RAISE EXCEPTION 'Journal stages cannot be skipped' USING ERRCODE='23514'; END IF;
    IF OLD.state<>'Draft' AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Submitted approval identity is immutable' USING ERRCODE='23514'; END IF;
    IF OLD.state='Submitted' AND NEW.state IN ('Rejected','Superseded') THEN
      SELECT * INTO a FROM erp_private.approval_requests WHERE id=OLD.approval_id;
      SELECT state INTO policy_state FROM erp_private.approval_policies WHERE id=a.policy_id;
      IF a.state<>'Rejected' AND policy_state='Approved' THEN RAISE EXCEPTION 'An active approved/submitted source cannot be silently superseded' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_header_immutable BEFORE INSERT OR UPDATE ON erp_private.ledger_journals FOR EACH ROW EXECUTE FUNCTION erp_private.guard_ledger_header();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_balanced_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE jid text; j erp_private.ledger_journals%ROWTYPE; d numeric; c numeric; n integer; a erp_private.approval_requests%ROWTYPE; conf erp_private.ledger_configurations%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='ledger_lines' THEN jid:=NEW.journal_id; ELSE jid:=NEW.id; END IF;
  SELECT * INTO j FROM erp_private.ledger_journals WHERE id=jid;
  SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO n,d,c FROM erp_private.ledger_lines WHERE journal_id=jid;
  IF n<2 OR d<>c OR d<>j.total_bdt THEN RAISE EXCEPTION 'Every saved journal must balance exactly to its declared total' USING ERRCODE='23514'; END IF;
  IF j.state='Submitted' OR j.state='Posted' AND j.source_key IS NULL THEN
    SELECT * INTO a FROM erp_private.approval_requests WHERE id=j.approval_id;
    IF a.id IS NULL OR a.domain<>'Ledger' OR a.resource_type<>'Ledger Journal' OR a.resource_id<>j.id OR a.amount_bdt<>j.total_bdt OR (j.state='Posted' AND a.state<>'Posted') THEN RAISE EXCEPTION 'Manual posting requires matching independent approval evidence' USING ERRCODE='23514'; END IF;
  END IF;
  IF j.state='Posted' THEN
    PERFORM pg_advisory_xact_lock(77612023);
    IF j.date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR EXISTS(SELECT 1 FROM erp_private.ledger_periods WHERE through_date>=j.date) THEN RAISE EXCEPTION 'Future or closed-period posting is prohibited' USING ERRCODE='23514'; END IF;
    IF j.source_key IS NOT NULL THEN
      SELECT * INTO conf FROM erp_private.ledger_configurations WHERE id=j.configuration_id;
      IF conf.id IS NULL OR conf.approved_by IS NULL OR (conf.state<>'Approved' AND j.reversal_of_id IS NULL) OR j.date<(conf.data->>'effectiveFrom')::date OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events e WHERE e.source_key=j.source_key AND e.journal_id=j.id AND e.state='Posted') THEN RAISE EXCEPTION 'Automatic postings require an approved configuration and saved source event' USING ERRCODE='23514'; END IF;
    END IF;
    IF j.reversal_of_id IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM erp_private.ledger_journals WHERE id=j.reversal_of_id AND state='Posted' AND reversal_of_id IS NULL AND date<=j.date) OR EXISTS(
        WITH original AS (SELECT account_id,sum(debit) d,sum(credit) c FROM erp_private.ledger_lines WHERE journal_id=j.reversal_of_id GROUP BY account_id), reversed AS(SELECT account_id,sum(debit) d,sum(credit) c FROM erp_private.ledger_lines WHERE journal_id=j.id GROUP BY account_id)
        SELECT 1 FROM original o FULL JOIN reversed r USING(account_id) WHERE coalesce(o.d,0)<>coalesce(r.c,0) OR coalesce(o.c,0)<>coalesce(r.d,0)
      ) THEN RAISE EXCEPTION 'Reversals must exactly compensate the original accounts' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_header_balance AFTER INSERT OR UPDATE ON erp_private.ledger_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_balanced_ledger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_lines_balance AFTER INSERT ON erp_private.ledger_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_balanced_ledger();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_ledger_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.state<>'Deferred' OR NEW.state NOT IN ('Posted','Excluded') OR
    (to_jsonb(NEW)-ARRAY['state','reason','journal_id','configuration_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','reason','journal_id','configuration_id'])) THEN RAISE EXCEPTION 'Saved ledger source plans are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_source_state BEFORE UPDATE ON erp_private.ledger_source_events FOR EACH ROW EXECUTE FUNCTION erp_private.guard_ledger_source();
--> statement-breakpoint
CREATE FUNCTION erp_private.protect_chart_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') THEN RAISE EXCEPTION 'Chart identities are immutable; archive and create a reviewed replacement' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_chart_identity BEFORE UPDATE ON erp_private.ledger_accounts FOR EACH ROW EXECUTE FUNCTION erp_private.protect_chart_identity();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_ledger_close() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(77612023);
  SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF a.id IS NULL OR a.state<>'Posted' OR a.domain<>'Ledger' OR a.resource_type<>'Ledger Period' OR a.context->>'throughDate'<>NEW.through_date::text OR NEW.through_date>=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Period close needs independently approved exact dates' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_close_authority AFTER INSERT ON erp_private.ledger_periods DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_ledger_close();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_ledger_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e erp_private.ledger_source_events%ROWTYPE; j erp_private.ledger_journals%ROWTYPE; source_id text; source_kind text; amount numeric;
BEGIN
  SELECT * INTO e FROM erp_private.ledger_source_events WHERE id=NEW.id;
  IF e.state<>'Posted' THEN RETURN NULL; END IF;
  SELECT * INTO j FROM erp_private.ledger_journals WHERE id=e.journal_id;
  IF j.id IS NULL OR j.state<>'Posted' OR j.source_key<>e.source_key OR j.configuration_id<>e.configuration_id OR j.date<>e.date OR j.confidential<>e.confidential THEN RAISE EXCEPTION 'Posted ledger source and journal must reconcile' USING ERRCODE='23514'; END IF;
  source_kind:=split_part(e.source_key,':',1); source_id:=substr(e.source_key,length(source_kind)+2);
  CASE source_kind
    WHEN 'account' THEN SELECT a.amount INTO amount FROM erp_private.account_transactions a WHERE a.id=source_id AND a.date=e.date;
    WHEN 'stock' THEN SELECT s.value_bdt INTO amount FROM erp_private.stock_movements s WHERE s.id=source_id AND s.date=e.date AND s.type<>'Opening';
    WHEN 'invoice' THEN SELECT i.total INTO amount FROM erp_private.sales_invoices i WHERE i.id=source_id AND i.status IN ('Approved','Cancelled') AND i.date=e.date;
    WHEN 'invoice-reversal' THEN SELECT i.total INTO amount FROM erp_private.sales_invoices i WHERE i.id=source_id AND i.status='Cancelled';
    WHEN 'obligation' THEN SELECT s.amount INTO amount FROM erp_private.supplier_settlements s WHERE s.id=source_id AND s.entry_type='Obligation' AND s.date=e.date AND s.opening_position_id IS NULL;
    WHEN 'obligation-reversal' THEN SELECT s.amount INTO amount FROM erp_private.supplier_settlements s WHERE s.id=source_id AND s.entry_type='Obligation' AND s.status='Reversed' AND s.reversal_date=e.date AND s.opening_position_id IS NULL;
    ELSE RAISE EXCEPTION 'Unrecognized accounting source' USING ERRCODE='23514';
  END CASE;
  IF amount IS NULL OR amount<>j.total_bdt THEN RAISE EXCEPTION 'Automatic journal must match the saved operational amount' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_source_reconciliation AFTER INSERT OR UPDATE ON erp_private.ledger_source_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_ledger_source();
