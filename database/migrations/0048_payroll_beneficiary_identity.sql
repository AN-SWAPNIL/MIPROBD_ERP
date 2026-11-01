CREATE OR REPLACE FUNCTION erp_private.payroll_fingerprint(eid text,month text) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH policies AS (SELECT p.*,lead(effective_from) OVER(ORDER BY effective_from,id)-1 through FROM erp_private.payroll_policies p WHERE p.employee_id=eid AND p.kind='Commission' AND p.state='Active' AND p.effective_from<(month||'-01')::date+interval '1 month'), loans AS(SELECT l.id,l.version,l.amount-coalesce((SELECT sum(r.amount) FROM erp_private.payroll_recoveries r WHERE r.loan_id=l.id),0) remaining FROM erp_private.payroll_loans l WHERE l.employee_id=eid AND l.state='Posted')
 SELECT md5(concat_ws('|',e.id,e.name,e.employee_code,e.title,e.department,e.status,
 (SELECT string_agg(concat_ws(':',p.id,p.data::text),',' ORDER BY p.effective_from,p.id) FROM erp_private.payroll_policies p WHERE p.employee_id=eid AND p.state='Active' AND p.effective_from<(month||'-01')::date+interval '1 month'),
 (SELECT string_agg(concat_ws(':',p.id,erp_private.payroll_basis(eid,p.data->'data'->>'basis',p.effective_from,coalesce(p.through,((month||'-01')::date+interval '1 month -1 day')::date))),',' ORDER BY p.effective_from,p.id) FROM policies p),
 (SELECT string_agg(concat_ws(':',l.id,l.commission),',' ORDER BY l.id) FROM erp_private.payroll_lines l JOIN erp_private.payroll_runs r ON r.id=l.run_id WHERE l.employee_id=eid AND r.state='Accrued'),
 (SELECT string_agg(concat_ws(':',l.id,l.version,l.remaining),',' ORDER BY l.id) FROM loans l))) FROM erp_private.employees e WHERE e.id=eid
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_payroll_beneficiary() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_employee erp_private.employees%ROWTYPE;v_run erp_private.payroll_runs%ROWTYPE;v_approval erp_private.approval_requests%ROWTYPE;v_employee_id text;
BEGIN
 IF TG_TABLE_NAME='payroll_lines' THEN
  SELECT * INTO v_employee FROM erp_private.employees WHERE id=NEW.employee_id;
  SELECT * INTO v_run FROM erp_private.payroll_runs WHERE id=NEW.run_id;
  IF NEW.snapshot->>'department' IS DISTINCT FROM v_employee.department OR NEW.snapshot->>'employmentStatus' IS DISTINCT FROM v_employee.status OR NOT(v_run.preparer_ids ? NEW.employee_id) THEN
   RAISE EXCEPTION 'Payroll must retain canonical department/status and exclude beneficiaries from approval' USING ERRCODE='23514';
  END IF;
 ELSE
  IF TG_TABLE_NAME='payroll_loans' THEN v_employee_id:=NEW.employee_id;
  ELSE SELECT employee_id INTO v_employee_id FROM erp_private.payroll_lines WHERE id=NEW.line_id;
  END IF;
  SELECT * INTO v_approval FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF v_employee_id IS NULL OR NOT(coalesce(v_approval.context->'excludedActorIds','[]'::jsonb) ? v_employee_id) THEN
   RAISE EXCEPTION 'Employee financing/payment beneficiary cannot verify or approve their own source' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_line_beneficiary BEFORE INSERT ON erp_private.payroll_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_beneficiary();
--> statement-breakpoint
CREATE TRIGGER payroll_loan_beneficiary BEFORE INSERT OR UPDATE ON erp_private.payroll_loans FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_beneficiary();
--> statement-breakpoint
CREATE TRIGGER payroll_payment_beneficiary BEFORE INSERT OR UPDATE ON erp_private.payroll_payments FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_beneficiary();

