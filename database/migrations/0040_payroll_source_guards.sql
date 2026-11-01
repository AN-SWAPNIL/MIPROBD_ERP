REVOKE ALL ON erp_private.payroll_policies,erp_private.payroll_runs,erp_private.payroll_lines,erp_private.payroll_loans,erp_private.payroll_recoveries,erp_private.payroll_payments FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_lines','payroll_recoveries'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',t||'_append_only',t); END LOOP;
  FOREACH t IN ARRAY ARRAY['payroll_policies','payroll_runs','payroll_loans','payroll_payments'] LOOP EXECUTE format('CREATE TRIGGER %I BEFORE DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',t||'_retained',t); END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.payroll_basis(eid text,basis text,from_date date,to_date date) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 WITH invoice_facts AS (
 SELECT i.date,i.total amount FROM erp_private.sales_invoices i WHERE i.owner_id=eid AND i.approved_at IS NOT NULL
 UNION ALL SELECT (i.cancelled_at AT TIME ZONE 'Asia/Dhaka')::date,-i.total FROM erp_private.sales_invoices i WHERE i.owner_id=eid AND i.cancelled_at IS NOT NULL
 UNION ALL SELECT r.posted_date,-r.credit_bdt FROM erp_private.customer_returns r WHERE r.owner_id=eid AND r.state='Posted' AND r.invoice_id IS NOT NULL
 ),cash_facts AS (
 SELECT j.date,j.credit-j.debit amount FROM erp_private.customer_entries j JOIN erp_private.collections c ON c.id=j.collection_id LEFT JOIN erp_private.sales_invoices i ON i.id=j.invoice_id WHERE coalesce(i.owner_id,c.owner_id)=eid
 UNION ALL SELECT j.date,-j.debit FROM erp_private.customer_entries j JOIN erp_private.sales_invoices i ON i.id=j.invoice_id WHERE j.type='Return Refund' AND i.owner_id=eid
 ) SELECT coalesce(sum(amount),0) FROM (SELECT * FROM invoice_facts WHERE basis='Net Invoiced Sales' UNION ALL SELECT * FROM cash_facts WHERE basis='Net Collections') f WHERE date BETWEEN from_date AND to_date
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.payroll_fingerprint(eid text,month text) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH policies AS (SELECT p.*,lead(effective_from) OVER(ORDER BY effective_from,id)-1 through FROM erp_private.payroll_policies p WHERE p.employee_id=eid AND p.kind='Commission' AND p.state='Active' AND p.effective_from<(month||'-01')::date+interval '1 month'), loans AS(SELECT l.id,l.version,l.amount-coalesce((SELECT sum(r.amount) FROM erp_private.payroll_recoveries r WHERE r.loan_id=l.id),0) remaining FROM erp_private.payroll_loans l WHERE l.employee_id=eid AND l.state='Posted')
 SELECT md5(concat_ws('|',e.id,e.name,e.employee_code,e.title,e.status,
 (SELECT string_agg(concat_ws(':',p.id,p.data::text),',' ORDER BY p.effective_from,p.id) FROM erp_private.payroll_policies p WHERE p.employee_id=eid AND p.state='Active' AND p.effective_from<(month||'-01')::date+interval '1 month'),
 (SELECT string_agg(concat_ws(':',p.id,erp_private.payroll_basis(eid,p.data->'data'->>'basis',p.effective_from,coalesce(p.through,((month||'-01')::date+interval '1 month -1 day')::date))),',' ORDER BY p.effective_from,p.id) FROM policies p),
 (SELECT string_agg(concat_ws(':',l.id,l.commission),',' ORDER BY l.id) FROM erp_private.payroll_lines l JOIN erp_private.payroll_runs r ON r.id=l.run_id WHERE l.employee_id=eid AND r.state='Accrued'),
 (SELECT string_agg(concat_ws(':',l.id,l.version,l.remaining),',' ORDER BY l.id) FROM loans l))) FROM erp_private.employees e WHERE e.id=eid
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.require_payroll_approval(aid text,resource text,rid text,hash text,amount numeric) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; BEGIN
 PERFORM id FROM erp_private.employees WHERE id=NEW.employee_id FOR UPDATE;
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=aid;
 IF a.id IS NULL OR a.state<>'Posted' OR a.resource_type<>resource OR a.resource_id<>rid OR a.payload_hash<>hash OR a.amount_bdt<>amount OR a.domain NOT IN ('Payroll','Payroll Policy') OR a.context->'excludedActorIds' ? a.approved_by OR a.context->'excludedActorIds' ? a.verified_by THEN RAISE EXCEPTION 'Payroll needs unchanged independent approval' USING ERRCODE='23514'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_payroll_policy() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; BEGIN
 SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
 IF a.id IS NULL OR a.domain<>'Payroll Policy' OR a.resource_type<>'Payroll Policy' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR NOT(a.context->'excludedActorIds' ? NEW.created_by) OR NOT(a.context->'excludedActorIds' ? NEW.employee_id) OR NEW.data->>'employeeId' IS DISTINCT FROM NEW.employee_id OR NEW.data->>'kind' IS DISTINCT FROM NEW.kind OR NEW.data->>'effectiveFrom' IS DISTINCT FROM NEW.effective_from::text THEN RAISE EXCEPTION 'Payroll policy requires canonical employee, dates and source approval' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'Submitted' OR NEW.version<>1 THEN RAISE EXCEPTION 'Payroll policies start submitted' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'Submitted' OR NEW.state<>'Active' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version']) THEN RAISE EXCEPTION 'Payroll policies are immutable; create a future reviewed version' USING ERRCODE='23514'; END IF;
  PERFORM erp_private.require_payroll_approval(NEW.approval_id,'Payroll Policy',NEW.id,NEW.payload_hash,a.amount_bdt);
  IF EXISTS(SELECT 1 FROM erp_private.payroll_runs r JOIN erp_private.payroll_lines l ON l.run_id=r.id WHERE l.employee_id=NEW.employee_id AND r.state='Accrued' AND NEW.effective_from<((r.period||'-01')::date+interval '1 month')) THEN RAISE EXCEPTION 'Policy cannot rewrite accrued pay periods' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_policy_source BEFORE INSERT OR UPDATE ON erp_private.payroll_policies FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_policy();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_payroll_run() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l erp_private.payroll_lines%ROWTYPE; a erp_private.approval_requests%ROWTYPE; BEGIN
 IF NEW.payload_hash!~'^[a-f0-9]{64}$' OR NOT(NEW.preparer_ids ? NEW.created_by) THEN RAISE EXCEPTION 'Payroll needs retained payload/preparers' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL OR NEW.posted_date IS NOT NULL THEN RAISE EXCEPTION 'Payroll starts as unposted draft' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state IN ('Accrued','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_at','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_at','posted_by']) OR NOT((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Accrued','Superseded'))) THEN RAISE EXCEPTION 'Payroll source is immutable; use reviewed revision/correction' USING ERRCODE='23514'; END IF;
  IF OLD.approval_id IS NOT NULL AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Payroll approval identity is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.state='Superseded' AND OLD.approval_id IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.approval_requests a JOIN erp_private.approval_policies p ON p.id=a.policy_id WHERE a.id=OLD.approval_id AND a.state<>'Rejected' AND p.state='Approved') THEN RAISE EXCEPTION 'Reject active payroll approval before revising' USING ERRCODE='23514'; END IF;
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
--> statement-breakpoint
CREATE TRIGGER payroll_run_source BEFORE INSERT OR UPDATE ON erp_private.payroll_runs FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_run();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_payroll_line() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r erp_private.payroll_runs%ROWTYPE; p erp_private.payroll_policies%ROWTYPE; m jsonb; inp jsonb; k text; fixed numeric:=0; ot numeric; deductions numeric; prior numeric; entitlement numeric:=0; part jsonb; expected numeric; raw_delta numeric; applied numeric; before_commission numeric; c erp_private.payroll_policies%ROWTYPE; through_date date; recover_negative boolean:=false; n integer; adv numeric; ln numeric; BEGIN
 SELECT * INTO r FROM erp_private.payroll_runs WHERE id=NEW.run_id; m:=NEW.snapshot->'math'; inp:=NEW.snapshot->'input';
 SELECT * INTO p FROM erp_private.payroll_policies WHERE id=NEW.snapshot->>'profileId';
 IF r.id IS NULL OR r.state<>'Draft' OR p.id IS NULL OR p.state<>'Active' OR p.kind<>'Compensation' OR p.employee_id<>NEW.employee_id OR NEW.snapshot->'profile' IS DISTINCT FROM p.data OR inp->>'employeeId' IS DISTINCT FROM NEW.employee_id OR p.effective_from>(r.period||'-01')::date OR NEW.fingerprint IS DISTINCT FROM erp_private.payroll_fingerprint(NEW.employee_id,r.period) OR NEW.snapshot->>'fingerprint' IS DISTINCT FROM NEW.fingerprint THEN RAISE EXCEPTION 'Payroll line must retain actual employee/profile/fresh source' USING ERRCODE='23514'; END IF;
 IF (inp->>'salaryFactor')::numeric NOT BETWEEN 0 AND 1 OR (inp->>'overtimeHours')::numeric<0 OR (inp->>'bonus')::numeric<0 OR (inp->>'otherDeduction')::numeric<0 OR length(btrim(inp->>'earningsProof'))<3 OR ((inp->>'otherDeduction')::numeric>0 AND length(btrim(inp->>'deductionReason'))<5) THEN RAISE EXCEPTION 'Payroll earnings/deductions require bounded explicit input and evidence' USING ERRCODE='23514'; END IF;
 IF NOT(NEW.snapshot->'preparerIds' ? p.created_by) THEN RAISE EXCEPTION 'Compensation preparer must remain excluded from salary approval' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM erp_private.payroll_policies c WHERE c.employee_id=NEW.employee_id AND c.kind='Commission' AND c.state='Active' AND c.effective_from<((r.period||'-01')::date+interval '1 month');
 IF ((p.data->'data'->>'commissionEligible')::boolean AND n=0) OR jsonb_array_length(NEW.snapshot->'commissionParts')<>(CASE WHEN (p.data->'data'->>'commissionEligible')::boolean THEN n ELSE 0 END) OR (SELECT count(DISTINCT x->>'policyId') FROM jsonb_array_elements(NEW.snapshot->'commissionParts') x)<>jsonb_array_length(NEW.snapshot->'commissionParts') THEN RAISE EXCEPTION 'Commission eligibility requires complete, distinct approved policies' USING ERRCODE='23514'; END IF;
 FOREACH k IN ARRAY ARRAY['basic','houseRent','medical','transport','otherAllowance'] LOOP expected:=round((p.data->'data'->>k)::numeric*(inp->>'salaryFactor')::numeric,2); IF (m->'components'->>k)::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Fixed wage component calculation mismatch' USING ERRCODE='23514'; END IF; fixed:=fixed+expected; END LOOP;
 ot:=round((p.data->'data'->>'overtimeRate')::numeric*(inp->>'overtimeHours')::numeric,2);
 FOR part IN SELECT * FROM jsonb_array_elements(NEW.snapshot->'commissionParts') LOOP
  IF NOT EXISTS(SELECT 1 FROM erp_private.payroll_policies c WHERE c.id=part->>'policyId' AND c.employee_id=NEW.employee_id AND c.kind='Commission' AND c.state='Active' AND c.data->'data'->>'basis'=part->>'basis' AND c.data->'data'->>'ratePercent'=part->>'ratePercent' AND c.effective_from=(part->>'effectiveFrom')::date) THEN RAISE EXCEPTION 'Commission requires actual approved employee policy' USING ERRCODE='23514'; END IF;
  SELECT * INTO c FROM erp_private.payroll_policies WHERE id=part->>'policyId';
  SELECT least(coalesce(min(effective_from)-1,((r.period||'-01')::date+interval '1 month -1 day')::date),((r.period||'-01')::date+interval '1 month -1 day')::date) INTO through_date FROM erp_private.payroll_policies x WHERE x.employee_id=NEW.employee_id AND x.kind='Commission' AND x.state='Active' AND x.effective_from>c.effective_from;
  IF (part->>'through')::date IS DISTINCT FROM through_date OR NOT(NEW.snapshot->'preparerIds' ? c.created_by) THEN RAISE EXCEPTION 'Commission date range/preparer must match actual effective policy' USING ERRCODE='23514'; END IF;
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
--> statement-breakpoint
CREATE TRIGGER payroll_line_source BEFORE INSERT ON erp_private.payroll_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_line();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_payroll_money() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE aid text; resource text; line erp_private.payroll_lines%ROWTYPE; used numeric; employee_id text; BEGIN
 IF TG_TABLE_NAME='payroll_loans' THEN employee_id:=NEW.employee_id;resource:='Payroll Loan'; ELSE SELECT * INTO line FROM erp_private.payroll_lines WHERE id=NEW.line_id;employee_id:=line.employee_id;resource:='Payroll Payment';IF line.id IS NULL OR line.run_id<>NEW.run_id OR NOT EXISTS(SELECT 1 FROM erp_private.payroll_runs WHERE id=line.run_id AND state='Accrued') THEN RAISE EXCEPTION 'Salary payment requires actual accrued employee line' USING ERRCODE='23514'; END IF; END IF;
 PERFORM id FROM erp_private.employees WHERE id=employee_id FOR UPDATE;
 IF TG_OP='INSERT' THEN IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.date IS NOT NULL OR NEW.transaction_id IS NOT NULL OR NEW.posted_by IS NOT NULL THEN RAISE EXCEPTION 'Payroll disbursement starts submitted' USING ERRCODE='23514'; END IF;
 ELSE IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','date','transaction_id','posted_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','date','transaction_id','posted_by']) THEN RAISE EXCEPTION 'Payroll disbursements are immutable' USING ERRCODE='23514'; END IF; END IF;
 IF NOT EXISTS(SELECT 1 FROM erp_private.approval_requests a WHERE a.id=NEW.approval_id AND a.domain='Payroll' AND a.resource_type=resource AND a.resource_id=NEW.id AND a.payload_hash=NEW.payload_hash AND a.amount_bdt=NEW.amount AND a.context->'excludedActorIds' ? NEW.created_by) THEN RAISE EXCEPTION 'Payroll disbursement and approval must match' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='payroll_payments' THEN
  SELECT coalesce(sum(amount),0) INTO used FROM erp_private.payroll_payments WHERE line_id=NEW.line_id AND state='Posted';
  IF NEW.amount>line.net-used OR NOT EXISTS(SELECT 1 FROM erp_private.cash_accounts a WHERE a.id=NEW.account_id AND a.active AND a.type=line.snapshot->'profile'->'data'->>'paymentChannel') THEN RAISE EXCEPTION 'Payroll payment cannot exceed unpaid net or change approved payee channel' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state='Posted' THEN IF NEW.date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Payroll disbursement uses current date' USING ERRCODE='23514'; END IF;PERFORM erp_private.require_payroll_approval(NEW.approval_id,resource,NEW.id,NEW.payload_hash,NEW.amount); END IF; RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_loan_source BEFORE INSERT OR UPDATE ON erp_private.payroll_loans FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_money();
--> statement-breakpoint
CREATE TRIGGER payroll_payment_source BEFORE INSERT OR UPDATE ON erp_private.payroll_payments FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_money();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_payroll_recovery() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE l erp_private.payroll_loans%ROWTYPE; line erp_private.payroll_lines%ROWTYPE; r erp_private.payroll_runs%ROWTYPE; used numeric; BEGIN
 SELECT * INTO l FROM erp_private.payroll_loans WHERE id=NEW.loan_id FOR UPDATE; SELECT * INTO line FROM erp_private.payroll_lines WHERE id=NEW.line_id; SELECT * INTO r FROM erp_private.payroll_runs WHERE id=line.run_id;
 SELECT coalesce(sum(amount),0) INTO used FROM erp_private.payroll_recoveries WHERE loan_id=NEW.loan_id;
 IF l.id IS NULL OR l.state<>'Posted' OR l.employee_id<>line.employee_id OR r.state<>'Accrued' OR NEW.date<>r.posted_date OR NEW.amount>l.amount-used OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(line.snapshot->'input'->'recoveries') p WHERE p->>'loanId'=l.id AND (p->>'amount')::numeric=NEW.amount) THEN RAISE EXCEPTION 'Recovery must match original employee loan and approved payroll deduction' USING ERRCODE='23514'; END IF;RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_recovery_source BEFORE INSERT ON erp_private.payroll_recoveries FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_recovery();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_payroll_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rid text; r erp_private.payroll_runs%ROWTYPE; l erp_private.payroll_lines%ROWTYPE; loan erp_private.payroll_loans%ROWTYPE; p erp_private.payroll_payments%ROWTYPE; n integer; gross numeric; net numeric; advance numeric; credit_loan numeric; expected_source text; expected_id text; transaction_id text; source_amount numeric; account_id text; source_date date; BEGIN
 IF TG_TABLE_NAME='payroll_runs' THEN rid:=NEW.id;
 ELSIF TG_TABLE_NAME='payroll_lines' THEN rid:=NEW.run_id;
 ELSIF TG_TABLE_NAME='payroll_recoveries' THEN SELECT run_id INTO rid FROM erp_private.payroll_lines WHERE id=NEW.line_id;
 ELSIF TG_TABLE_NAME='payroll_loans' THEN expected_source:=CASE NEW.kind WHEN 'Advance' THEN 'Payroll Advance' ELSE 'Payroll Loan' END;expected_id:=NEW.id;
 ELSIF TG_TABLE_NAME='payroll_payments' THEN expected_source:='Payroll Payment';expected_id:=NEW.id;
 ELSE IF NEW.source_type NOT IN ('Payroll Payment','Payroll Advance','Payroll Loan') THEN RETURN NULL; END IF;expected_source:=NEW.source_type;expected_id:=NEW.source_id; END IF;
 IF expected_source IS NOT NULL THEN
  IF expected_source='Payroll Payment' THEN SELECT * INTO p FROM erp_private.payroll_payments WHERE id=expected_id;IF p.id IS NULL OR p.state<>'Posted' THEN IF TG_TABLE_NAME='payroll_payments' AND p.state='Submitted' THEN RETURN NULL; END IF;RAISE EXCEPTION 'Cash salary source must be an approved posted payment' USING ERRCODE='23514'; END IF;transaction_id:=p.transaction_id;source_amount:=p.amount;account_id:=p.account_id;source_date:=p.date;PERFORM erp_private.require_payroll_approval(p.approval_id,'Payroll Payment',p.id,p.payload_hash,p.amount);
  ELSE SELECT * INTO loan FROM erp_private.payroll_loans WHERE id=expected_id;IF loan.id IS NULL OR loan.state<>'Posted' OR expected_source<>(CASE loan.kind WHEN 'Advance' THEN 'Payroll Advance' ELSE 'Payroll Loan' END) THEN IF TG_TABLE_NAME='payroll_loans' AND loan.state='Submitted' THEN RETURN NULL; END IF;RAISE EXCEPTION 'Cash financing source must be an approved posted employee loan' USING ERRCODE='23514'; END IF;transaction_id:=loan.transaction_id;source_amount:=loan.amount;account_id:=loan.account_id;source_date:=loan.date;PERFORM erp_private.require_payroll_approval(loan.approval_id,'Payroll Loan',loan.id,loan.payload_hash,loan.amount); END IF;
  IF NOT EXISTS(SELECT 1 FROM erp_private.account_transactions a WHERE a.id=transaction_id AND a.source_id=expected_id AND a.source_type=expected_source AND a.amount=source_amount AND a.account_id=account_id AND a.date=source_date AND a.direction='Out' AND a.reversal_of_id IS NULL) OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events e WHERE e.source_key='account:'||transaction_id AND e.state='Posted' AND e.confidential) THEN RAISE EXCEPTION 'Payroll disbursement/cash/confidential ledger must reconcile' USING ERRCODE='23514'; END IF;RETURN NULL;
 END IF;
 SELECT * INTO r FROM erp_private.payroll_runs WHERE id=rid;
 SELECT count(*),coalesce(sum(x.gross),0),coalesce(sum(x.net),0) INTO n,gross,net FROM erp_private.payroll_lines x WHERE x.run_id=rid;
 IF r.id IS NULL OR n<1 OR n>50 OR r.gross<>gross OR r.net<>net THEN RAISE EXCEPTION 'Payroll run must reconcile its employee lines' USING ERRCODE='23514'; END IF;
 IF r.state<>'Accrued' THEN IF EXISTS(SELECT 1 FROM erp_private.payroll_recoveries x JOIN erp_private.payroll_lines y ON y.id=x.line_id WHERE y.run_id=rid) OR EXISTS(SELECT 1 FROM erp_private.ledger_source_events WHERE source_key='payroll:'||rid) THEN RAISE EXCEPTION 'Unaccrued payroll creates no recovery or ledger' USING ERRCODE='23514'; END IF;RETURN NULL; END IF;
 PERFORM erp_private.require_payroll_approval(r.approval_id,'Payroll Run',r.id,r.payload_hash,r.gross);
 FOR l IN SELECT * FROM erp_private.payroll_lines WHERE run_id=rid LOOP
  IF NOT(r.preparer_ids @> (l.snapshot->'preparerIds')) THEN RAISE EXCEPTION 'Every source preparer must be excluded from payroll approval' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(x.amount) FILTER(WHERE f.kind='Advance'),0),coalesce(sum(x.amount) FILTER(WHERE f.kind='Loan'),0),count(*) INTO advance,credit_loan,n FROM erp_private.payroll_recoveries x JOIN erp_private.payroll_loans f ON f.id=x.loan_id WHERE x.line_id=l.id;
  IF advance<>(l.snapshot->'math'->>'advanceRecovery')::numeric OR credit_loan<>(l.snapshot->'math'->>'loanRecovery')::numeric OR n<>jsonb_array_length(l.snapshot->'input'->'recoveries') THEN RAISE EXCEPTION 'Payroll recovery must match every approved deduction' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events e WHERE e.source_key='payroll:'||rid AND e.state='Posted' AND e.confidential) THEN RAISE EXCEPTION 'Accrued payroll requires real confidential balanced GL' USING ERRCODE='23514'; END IF;RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['payroll_runs','payroll_lines','payroll_recoveries','payroll_loans','payroll_payments','account_transactions'] LOOP EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON erp_private.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_payroll_source()',t||'_payroll_source',t); END LOOP;END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_payroll_ledger(event_id text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e erp_private.ledger_source_events%ROWTYPE;j erp_private.ledger_journals%ROWTYPE;r erp_private.payroll_runs%ROWTYPE;cfg jsonb;expected jsonb;cash text;counterpart text;amount numeric;sid text;role text;entry jsonb;account text;positive integer:=0;BEGIN
 SELECT * INTO e FROM erp_private.ledger_source_events WHERE id=event_id;SELECT * INTO j FROM erp_private.ledger_journals WHERE id=e.journal_id;
 IF e.state<>'Posted' OR NOT e.confidential OR j.id IS NULL OR NOT j.confidential OR j.state<>'Posted' OR j.source_key<>e.source_key OR j.configuration_id<>e.configuration_id OR j.date<>e.date THEN RAISE EXCEPTION 'Payroll requires exact confidential source journal' USING ERRCODE='23514'; END IF;
 IF split_part(e.source_key,':',1)='payroll' THEN
  SELECT * INTO r FROM erp_private.payroll_runs WHERE id=substr(e.source_key,9);IF r.id IS NULL OR r.state<>'Accrued' OR r.posted_date<>e.date THEN RAISE EXCEPTION 'Payroll ledger requires accrued original run' USING ERRCODE='23514'; END IF;
  amount:=r.gross;SELECT jsonb_build_object('Payroll Expense',r.gross,'Payroll Payable',-r.net,'Employee Advances',-coalesce(sum((l.snapshot->'math'->>'advanceRecovery')::numeric),0),'Employee Loans',-coalesce(sum((l.snapshot->'math'->>'loanRecovery')::numeric),0),'Payroll Deductions',-coalesce(sum((l.snapshot->'math'->>'otherDeduction')::numeric),0)) INTO expected FROM erp_private.payroll_lines l WHERE l.run_id=r.id;
 ELSE
  SELECT a.amount,a.account_id,a.source_type,a.source_id INTO amount,cash,counterpart,sid FROM erp_private.account_transactions a WHERE a.id=substr(e.source_key,9) AND a.date=e.date AND a.direction='Out' AND a.reversal_of_id IS NULL;
  IF counterpart='Payroll Payment' THEN IF NOT EXISTS(SELECT 1 FROM erp_private.payroll_payments p WHERE p.id=sid AND p.state='Posted' AND p.amount=amount AND p.account_id=cash) THEN RAISE EXCEPTION 'Salary ledger requires actual approved payment' USING ERRCODE='23514'; END IF;counterpart:='Payroll Payable';
  ELSIF counterpart IN ('Payroll Advance','Payroll Loan') THEN IF NOT EXISTS(SELECT 1 FROM erp_private.payroll_loans l WHERE l.id=sid AND l.state='Posted' AND l.amount=amount AND l.account_id=cash) THEN RAISE EXCEPTION 'Employee financing ledger requires actual approved source' USING ERRCODE='23514'; END IF;counterpart:=CASE counterpart WHEN 'Payroll Advance' THEN 'Employee Advances' ELSE 'Employee Loans' END;
  ELSE RAISE EXCEPTION 'Unsupported confidential payroll source' USING ERRCODE='23514'; END IF;
  expected:=jsonb_build_object(counterpart,amount,'Cash',-amount);
 END IF;
 IF amount IS NULL OR amount<>j.total_bdt OR j.reversal_of_id IS NOT NULL THEN RAISE EXCEPTION 'Payroll ledger must equal saved gross/disbursement' USING ERRCODE='23514'; END IF;
 SELECT data INTO cfg FROM erp_private.ledger_configurations WHERE id=e.configuration_id;
 FOR role,entry IN SELECT key,value FROM jsonb_each(expected) LOOP
  IF entry::text::numeric=0 THEN CONTINUE;END IF;positive:=positive+1;
  SELECT m->>'accountId' INTO account FROM jsonb_array_elements(CASE WHEN role='Cash' THEN cfg->'cashMappings' ELSE cfg->'mappings' END) m WHERE CASE WHEN role='Cash' THEN m->>'cashAccountId'=cash ELSE m->>'role'=role END;
  IF account IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines l WHERE l.journal_id=j.id AND l.account_id=account AND l.debit=greatest(entry::text::numeric,0) AND l.credit=greatest(-entry::text::numeric,0)) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.plan) p WHERE p->>'role'=role AND (p->>'debit')::numeric=greatest(entry::text::numeric,0) AND (p->>'credit')::numeric=greatest(-entry::text::numeric,0) AND (role<>'Cash' OR p->>'cashAccountId'=cash)) THEN RAISE EXCEPTION 'Payroll accounts must match approved source-specific roles' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM erp_private.ledger_lines WHERE journal_id=j.id)<>positive OR jsonb_array_length(e.plan)<>positive THEN RAISE EXCEPTION 'Payroll journal has extra/missing lines' USING ERRCODE='23514'; END IF;
END $$;
