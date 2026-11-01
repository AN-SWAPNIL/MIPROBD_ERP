CREATE FUNCTION erp_private.payroll_compensation_periods(eid text,month text)
RETURNS TABLE(profile_id text,starts date,ends date) LANGUAGE sql STABLE SET search_path='' AS $$
 WITH policies AS (
  SELECT p.*,lead(p.effective_from) OVER(ORDER BY p.effective_from,p.id) next_date
  FROM erp_private.payroll_policies p WHERE p.employee_id=eid AND p.kind='Compensation' AND p.state='Active' AND p.effective_from<((month||'-01')::date+interval '1 month')
 ), latest AS(SELECT * FROM policies ORDER BY effective_from DESC,id DESC LIMIT 1), periods AS(
  SELECT p.id,greatest((month||'-01')::date,p.effective_from,(l.data->'data'->>'joiningDate')::date) starts,
   least(((month||'-01')::date+interval '1 month -1 day')::date,coalesce(p.next_date-1,'infinity'::date),coalesce((l.data->'data'->>'employmentEndDate')::date,'infinity'::date)) ends
  FROM policies p CROSS JOIN latest l
 ) SELECT id,starts,ends FROM periods WHERE starts<=ends ORDER BY starts,id
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.payroll_earned_snapshot(eid text,month text,inp jsonb,parts jsonb,preparers jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_profile erp_private.payroll_policies%ROWTYPE;v_p erp_private.payroll_policies%ROWTYPE;v_period record;v_part jsonb;v_segment jsonb;v_components jsonb:='{}'::jsonb;v_key text;v_amount numeric;v_total numeric;v_ot numeric:=0;v_factor numeric:=0;v_hours numeric:=0;v_n integer;
BEGIN
 SELECT * INTO v_profile FROM erp_private.payroll_policies p WHERE p.employee_id=eid AND p.kind='Compensation' AND p.state='Active' AND p.effective_from<((month||'-01')::date+interval '1 month') ORDER BY p.effective_from DESC,p.id DESC LIMIT 1;
 IF v_profile.id IS NULL THEN RAISE EXCEPTION 'Approved compensation profile is required' USING ERRCODE='23514';END IF;
 IF NOT(inp ? 'compensationSegments') THEN
  IF parts IS NOT NULL OR v_profile.effective_from>(month||'-01')::date THEN RAISE EXCEPTION 'Mid-month compensation requires an explicit reviewed allocation' USING ERRCODE='23514';END IF;
  FOREACH v_key IN ARRAY ARRAY['basic','houseRent','medical','transport','otherAllowance'] LOOP
   v_components:=v_components||jsonb_build_object(v_key,round((v_profile.data->'data'->>v_key)::numeric*(inp->>'salaryFactor')::numeric,2)::text);
  END LOOP;
  RETURN jsonb_build_object('components',v_components,'overtime',round((v_profile.data->'data'->>'overtimeRate')::numeric*(inp->>'overtimeHours')::numeric,2)::text);
 END IF;
 SELECT count(*) INTO v_n FROM erp_private.payroll_compensation_periods(eid,month);
 IF v_n<1 OR v_n>31 OR jsonb_typeof(parts) IS DISTINCT FROM 'array' OR jsonb_typeof(inp->'compensationSegments') IS DISTINCT FROM 'array' OR jsonb_array_length(parts)<>v_n OR jsonb_array_length(inp->'compensationSegments')<>v_n OR (SELECT count(DISTINCT x->>'profileId') FROM jsonb_array_elements(parts) x)<>v_n OR (SELECT count(DISTINCT x->>'profileId') FROM jsonb_array_elements(inp->'compensationSegments') x)<>v_n THEN RAISE EXCEPTION 'Include every effective compensation period once' USING ERRCODE='23514';END IF;
 FOREACH v_key IN ARRAY ARRAY['basic','houseRent','medical','transport','otherAllowance'] LOOP v_components:=v_components||jsonb_build_object(v_key,'0.00');END LOOP;
 FOR v_period IN SELECT * FROM erp_private.payroll_compensation_periods(eid,month) LOOP
  SELECT * INTO v_p FROM erp_private.payroll_policies WHERE id=v_period.profile_id;
  SELECT x INTO v_part FROM jsonb_array_elements(parts) x WHERE x->>'profileId'=v_p.id;
  SELECT x INTO v_segment FROM jsonb_array_elements(inp->'compensationSegments') x WHERE x->>'profileId'=v_p.id;
  IF v_part IS NULL OR v_segment IS NULL OR (v_part->>'from')::date IS DISTINCT FROM v_period.starts OR (v_part->>'to')::date IS DISTINCT FROM v_period.ends OR v_part->'data' IS DISTINCT FROM v_p.data->'data' OR v_part->>'proofReference' IS DISTINCT FROM v_p.data->>'proofReference' OR v_part->>'salaryFactor' IS DISTINCT FROM v_segment->>'salaryFactor' OR v_part->>'overtimeHours' IS DISTINCT FROM v_segment->>'overtimeHours' OR v_part->>'earningsProof' IS DISTINCT FROM v_segment->>'earningsProof' OR coalesce(length(btrim(v_segment->>'earningsProof')),0)<3 OR (v_segment->>'salaryFactor')::numeric NOT BETWEEN 0 AND 1 OR (v_segment->>'overtimeHours')::numeric NOT BETWEEN 0 AND 99999999.9999 OR NOT(preparers ? v_p.created_by) OR v_p.data->'data'->>'joiningDate' IS DISTINCT FROM v_profile.data->'data'->>'joiningDate' THEN RAISE EXCEPTION 'Compensation segment must retain actual policy, dates, earnings authority and preparer' USING ERRCODE='23514';END IF;
  v_factor:=v_factor+(v_segment->>'salaryFactor')::numeric;v_hours:=v_hours+(v_segment->>'overtimeHours')::numeric;
  FOREACH v_key IN ARRAY ARRAY['basic','houseRent','medical','transport','otherAllowance'] LOOP
   v_amount:=round((v_p.data->'data'->>v_key)::numeric*(v_segment->>'salaryFactor')::numeric,2);
   IF (v_part->'components'->>v_key)::numeric IS DISTINCT FROM v_amount THEN RAISE EXCEPTION 'Compensation segment component amount mismatch' USING ERRCODE='23514';END IF;
   v_total:=(v_components->>v_key)::numeric+v_amount;v_components:=v_components||jsonb_build_object(v_key,v_total::text);
  END LOOP;
  v_amount:=round((v_p.data->'data'->>'overtimeRate')::numeric*(v_segment->>'overtimeHours')::numeric,2);
  IF (v_part->>'overtime')::numeric IS DISTINCT FROM v_amount THEN RAISE EXCEPTION 'Compensation segment overtime mismatch' USING ERRCODE='23514';END IF;v_ot:=v_ot+v_amount;
 END LOOP;
 IF v_factor>1 OR v_factor IS DISTINCT FROM (inp->>'salaryFactor')::numeric OR v_hours IS DISTINCT FROM (inp->>'overtimeHours')::numeric THEN RAISE EXCEPTION 'Compensation segment factors and overtime must reconcile with employee totals' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('components',v_components,'overtime',v_ot::text);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_payroll_line() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_earned jsonb; r erp_private.payroll_runs%ROWTYPE; p erp_private.payroll_policies%ROWTYPE; m jsonb; inp jsonb; k text; fixed numeric:=0; ot numeric; deductions numeric; prior numeric; entitlement numeric:=0; part jsonb; expected numeric; raw_delta numeric; applied numeric; before_commission numeric; policy_row erp_private.payroll_policies%ROWTYPE; through_date date; recover_negative boolean:=false; n integer; adv numeric; ln numeric; BEGIN
 SELECT * INTO r FROM erp_private.payroll_runs WHERE id=NEW.run_id; m:=NEW.snapshot->'math'; inp:=NEW.snapshot->'input';
 SELECT * INTO p FROM erp_private.payroll_policies WHERE id=NEW.snapshot->>'profileId';
 IF r.id IS NULL OR r.state<>'Draft' OR p.id IS NULL OR p.state<>'Active' OR p.kind<>'Compensation' OR p.employee_id<>NEW.employee_id OR NEW.snapshot->'profile' IS DISTINCT FROM p.data OR inp->>'employeeId' IS DISTINCT FROM NEW.employee_id OR p.id IS DISTINCT FROM (SELECT x.id FROM erp_private.payroll_policies x WHERE x.employee_id=NEW.employee_id AND x.kind='Compensation' AND x.state='Active' AND x.effective_from<((r.period||'-01')::date+interval '1 month') ORDER BY x.effective_from DESC,x.id DESC LIMIT 1) OR NEW.fingerprint IS DISTINCT FROM erp_private.payroll_fingerprint(NEW.employee_id,r.period) OR NEW.snapshot->>'fingerprint' IS DISTINCT FROM NEW.fingerprint THEN RAISE EXCEPTION 'Payroll line must retain actual employee/profile/fresh source' USING ERRCODE='23514'; END IF;
 IF (inp->>'salaryFactor')::numeric NOT BETWEEN 0 AND 1 OR (inp->>'overtimeHours')::numeric<0 OR (inp->>'bonus')::numeric<0 OR (inp->>'otherDeduction')::numeric<0 OR length(btrim(inp->>'earningsProof'))<3 OR ((inp->>'otherDeduction')::numeric>0 AND length(btrim(inp->>'deductionReason'))<5) THEN RAISE EXCEPTION 'Payroll earnings/deductions require bounded explicit input and evidence' USING ERRCODE='23514'; END IF;
 IF NOT(NEW.snapshot->'preparerIds' ? p.created_by) THEN RAISE EXCEPTION 'Compensation preparer must remain excluded from salary approval' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM erp_private.payroll_policies c WHERE c.employee_id=NEW.employee_id AND c.kind='Commission' AND c.state='Active' AND c.effective_from<((r.period||'-01')::date+interval '1 month');
 IF ((p.data->'data'->>'commissionEligible')::boolean AND n=0) OR jsonb_array_length(NEW.snapshot->'commissionParts')<>(CASE WHEN (p.data->'data'->>'commissionEligible')::boolean THEN n ELSE 0 END) OR (SELECT count(DISTINCT x->>'policyId') FROM jsonb_array_elements(NEW.snapshot->'commissionParts') x)<>jsonb_array_length(NEW.snapshot->'commissionParts') THEN RAISE EXCEPTION 'Commission eligibility requires complete, distinct approved policies' USING ERRCODE='23514'; END IF;
 v_earned:=erp_private.payroll_earned_snapshot(NEW.employee_id,r.period,inp,NEW.snapshot->'compensationParts',NEW.snapshot->'preparerIds');
 FOREACH k IN ARRAY ARRAY['basic','houseRent','medical','transport','otherAllowance'] LOOP expected:=(v_earned->'components'->>k)::numeric; IF (m->'components'->>k)::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Fixed wage component calculation mismatch' USING ERRCODE='23514'; END IF; fixed:=fixed+expected; END LOOP;
 ot:=(v_earned->>'overtime')::numeric;
 FOR part IN SELECT * FROM jsonb_array_elements(NEW.snapshot->'commissionParts') LOOP
  IF NOT EXISTS(SELECT 1 FROM erp_private.payroll_policies c WHERE c.id=part->>'policyId' AND c.employee_id=NEW.employee_id AND c.kind='Commission' AND c.state='Active' AND c.data->'data'->>'basis'=part->>'basis' AND c.data->'data'->>'ratePercent'=part->>'ratePercent' AND c.effective_from=(part->>'effectiveFrom')::date) THEN RAISE EXCEPTION 'Commission requires actual approved employee policy' USING ERRCODE='23514'; END IF;
  SELECT * INTO policy_row FROM erp_private.payroll_policies WHERE id=part->>'policyId';
  SELECT least(coalesce(min(effective_from)-1,((r.period||'-01')::date+interval '1 month -1 day')::date),((r.period||'-01')::date+interval '1 month -1 day')::date) INTO through_date FROM erp_private.payroll_policies x WHERE x.employee_id=NEW.employee_id AND x.kind='Commission' AND x.state='Active' AND x.effective_from>policy_row.effective_from;
  IF (part->>'through')::date IS DISTINCT FROM through_date OR NOT(NEW.snapshot->'preparerIds' ? policy_row.created_by) THEN RAISE EXCEPTION 'Commission date range/preparer must match actual effective policy' USING ERRCODE='23514'; END IF;
  expected:=erp_private.payroll_basis(NEW.employee_id,part->>'basis',(part->>'effectiveFrom')::date,(part->>'through')::date);
  IF (part->>'basisBdt')::numeric<>expected OR (part->>'earnedBdt')::numeric<>round(expected*(part->>'ratePercent')::numeric/100,2) THEN RAISE EXCEPTION 'Commission must use saved dated business facts' USING ERRCODE='23514'; END IF; entitlement:=entitlement+(part->>'earnedBdt')::numeric;
 END LOOP;
 IF (p.data->'data'->>'commissionEligible')::boolean THEN SELECT (x.data->'data'->>'recoverNegative')::boolean INTO recover_negative FROM erp_private.payroll_policies x WHERE x.employee_id=NEW.employee_id AND x.kind='Commission' AND x.state='Active' AND x.effective_from<((r.period||'-01')::date+interval '1 month') ORDER BY x.effective_from DESC,x.id DESC LIMIT 1; END IF;
 IF (NEW.snapshot->>'recoverNegative')::boolean IS DISTINCT FROM recover_negative THEN RAISE EXCEPTION 'Commission clawback authority must be explicitly approved' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum((x->>'amount')::numeric) FILTER(WHERE f.kind='Advance'),0),coalesce(sum((x->>'amount')::numeric) FILTER(WHERE f.kind='Loan'),0),count(DISTINCT f.id) INTO adv,ln,n FROM jsonb_array_elements(inp->'recoveries') x JOIN erp_private.payroll_loans f ON f.id=x->>'loanId' WHERE f.employee_id=NEW.employee_id AND f.state='Posted' AND (x->>'amount')::numeric>0 AND (x->>'amount')::numeric<=f.amount-coalesce((SELECT sum(y.amount) FROM erp_private.payroll_recoveries y WHERE y.loan_id=f.id),0) AND NEW.snapshot->'preparerIds' ? f.created_by;
 IF n<>jsonb_array_length(inp->'recoveries') OR adv IS DISTINCT FROM (m->>'advanceRecovery')::numeric OR ln IS DISTINCT FROM (m->>'loanRecovery')::numeric THEN RAISE EXCEPTION 'Salary deductions require actual employee financing and remaining balance' USING ERRCODE='23514'; END IF;
 SELECT coalesce(sum(l.commission),0) INTO prior FROM erp_private.payroll_lines l JOIN erp_private.payroll_runs x ON x.id=l.run_id WHERE l.employee_id=NEW.employee_id AND x.state='Accrued';
 deductions:=(m->>'advanceRecovery')::numeric+(m->>'loanRecovery')::numeric+(inp->>'otherDeduction')::numeric; raw_delta:=entitlement-prior; before_commission:=fixed+ot+(inp->>'bonus')::numeric-deductions;
 applied:=CASE WHEN raw_delta>=0 THEN raw_delta WHEN (NEW.snapshot->>'recoverNegative')::boolean THEN greatest(raw_delta,least(0,-before_commission)) ELSE 0 END;
 IF (m->>'fixedGross')::numeric IS DISTINCT FROM fixed OR (m->>'overtime')::numeric IS DISTINCT FROM ot OR (m->>'bonus')::numeric IS DISTINCT FROM (inp->>'bonus')::numeric OR (m->>'otherDeduction')::numeric IS DISTINCT FROM (inp->>'otherDeduction')::numeric OR (m->>'commissionEntitlement')::numeric IS DISTINCT FROM entitlement OR (m->>'commissionPreviouslyApplied')::numeric IS DISTINCT FROM prior OR (m->>'commissionDelta')::numeric IS DISTINCT FROM raw_delta OR NEW.commission IS DISTINCT FROM applied OR (m->>'commissionApplied')::numeric IS DISTINCT FROM applied OR (m->>'commissionCarry')::numeric IS DISTINCT FROM raw_delta-applied OR (m->>'totalDeduction')::numeric IS DISTINCT FROM deductions OR NEW.gross IS DISTINCT FROM fixed+ot+(inp->>'bonus')::numeric+applied OR NEW.net IS DISTINCT FROM NEW.gross-deductions OR (m->>'gross')::numeric IS DISTINCT FROM NEW.gross OR (m->>'net')::numeric IS DISTINCT FROM NEW.net THEN RAISE EXCEPTION 'Payroll calculation must reconcile exact saved earnings/recovery/commission' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
