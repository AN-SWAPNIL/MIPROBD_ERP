CREATE OR REPLACE FUNCTION erp_private.guard_payroll_run() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l erp_private.payroll_lines%ROWTYPE; a erp_private.approval_requests%ROWTYPE; BEGIN
 IF NEW.payload_hash!~'^[a-f0-9]{64}$' OR NOT(NEW.preparer_ids ? NEW.created_by) THEN RAISE EXCEPTION 'Payroll needs retained payload/preparers' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL OR NEW.posted_date IS NOT NULL THEN RAISE EXCEPTION 'Payroll starts as unposted draft' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state IN ('Accrued','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_at','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_at','posted_by']) OR NOT((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Accrued','Superseded'))) THEN RAISE EXCEPTION 'Payroll source is immutable; use reviewed revision/correction' USING ERRCODE='23514'; END IF;
  IF OLD.approval_id IS NOT NULL AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Payroll approval identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.state='Superseded' AND OLD.approval_id IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.approval_requests ar JOIN erp_private.approval_policies p ON p.id=ar.policy_id WHERE ar.id=OLD.approval_id AND ar.state<>'Rejected' AND p.state='Approved') THEN RAISE EXCEPTION 'Reject active payroll approval before revising' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.approval_id IS NOT NULL THEN SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id; IF a.resource_type IS DISTINCT FROM 'Payroll Run' OR a.resource_id IS DISTINCT FROM NEW.id OR a.payload_hash IS DISTINCT FROM NEW.payload_hash OR a.amount_bdt IS DISTINCT FROM NEW.gross OR a.context->'excludedActorIds' IS DISTINCT FROM NEW.preparer_ids THEN RAISE EXCEPTION 'Payroll approval source/amount/preparers mismatch' USING ERRCODE='23514'; END IF; END IF;
 IF NEW.state IN ('Submitted','Accrued') THEN
  FOR l IN SELECT * FROM erp_private.payroll_lines WHERE run_id=NEW.id ORDER BY employee_id LOOP
   PERFORM id FROM erp_private.employees WHERE id=l.employee_id FOR UPDATE;
   IF l.fingerprint IS DISTINCT FROM erp_private.payroll_fingerprint(l.employee_id,NEW.period) THEN RAISE EXCEPTION 'Payroll inputs changed since preparation' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM erp_private.payroll_lines x JOIN erp_private.payroll_runs r ON r.id=x.run_id WHERE x.employee_id=l.employee_id AND r.state='Accrued' AND r.period>=NEW.period) THEN RAISE EXCEPTION 'Employee payroll periods cannot duplicate or go backwards' USING ERRCODE='23514'; END IF;
  END LOOP;
 END IF;
 IF NEW.state='Accrued' THEN
  IF NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR ((NEW.period||'-01')::date+interval '1 month -1 day')::date>NEW.posted_date THEN RAISE EXCEPTION 'Payroll accrues on current date after month end' USING ERRCODE='23514'; END IF;
  PERFORM erp_private.require_payroll_approval(NEW.approval_id,'Payroll Run',NEW.id,NEW.payload_hash,NEW.gross);
 ELSIF NEW.posted_date IS NOT NULL OR NEW.posted_at IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Unaccrued payroll creates no liability' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
