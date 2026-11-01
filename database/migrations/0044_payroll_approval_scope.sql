CREATE OR REPLACE FUNCTION erp_private.require_payroll_approval(aid text,resource text,rid text,hash text,amount numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; BEGIN
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=aid;
 IF a.id IS NULL OR a.state<>'Posted' OR a.resource_type<>resource OR a.resource_id<>rid OR a.payload_hash<>hash OR a.amount_bdt<>amount OR a.domain NOT IN ('Payroll','Payroll Policy') OR a.context->'excludedActorIds' ? a.approved_by OR a.context->'excludedActorIds' ? a.verified_by THEN RAISE EXCEPTION 'Payroll needs unchanged independent approval' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_payroll_policy() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; BEGIN
 PERFORM id FROM erp_private.employees WHERE id=NEW.employee_id FOR UPDATE;
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
 IF a.id IS NULL OR a.domain<>'Payroll Policy' OR a.resource_type<>'Payroll Policy' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR NOT(a.context->'excludedActorIds' ? NEW.created_by) OR NOT(a.context->'excludedActorIds' ? NEW.employee_id) OR NEW.data->>'employeeId' IS DISTINCT FROM NEW.employee_id OR NEW.data->>'kind' IS DISTINCT FROM NEW.kind OR NEW.data->>'effectiveFrom' IS DISTINCT FROM NEW.effective_from::text THEN RAISE EXCEPTION 'Payroll policy requires canonical employee, dates and source approval' USING ERRCODE='23514'; END IF;
 IF a.amount_bdt IS DISTINCT FROM (CASE WHEN NEW.kind='Compensation' THEN (NEW.data->'data'->>'basic')::numeric+(NEW.data->'data'->>'houseRent')::numeric+(NEW.data->'data'->>'medical')::numeric+(NEW.data->'data'->>'transport')::numeric+(NEW.data->'data'->>'otherAllowance')::numeric ELSE 0 END) THEN RAISE EXCEPTION 'Compensation approval must cover fixed gross exactly once' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'Submitted' OR NEW.version<>1 THEN RAISE EXCEPTION 'Payroll policies start submitted' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'Submitted' OR NEW.state<>'Active' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) THEN RAISE EXCEPTION 'Payroll policies are immutable; create a future reviewed version' USING ERRCODE='23514'; END IF;
  PERFORM erp_private.require_payroll_approval(NEW.approval_id,'Payroll Policy',NEW.id,NEW.payload_hash,a.amount_bdt);
  IF EXISTS(SELECT 1 FROM erp_private.payroll_runs r JOIN erp_private.payroll_lines l ON l.run_id=r.id WHERE l.employee_id=NEW.employee_id AND r.state='Accrued' AND NEW.effective_from<((r.period||'-01')::date+interval '1 month')) THEN RAISE EXCEPTION 'Policy cannot rewrite accrued pay periods' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
