CREATE FUNCTION erp_private.guard_payroll_employment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_profile erp_private.payroll_policies%ROWTYPE;v_run erp_private.payroll_runs%ROWTYPE;v_employee erp_private.employees%ROWTYPE;v_join date;v_end date;BEGIN
 IF TG_TABLE_NAME='payroll_policies' THEN
  IF NEW.kind='Compensation' THEN
   IF NEW.data->'data'->>'joiningDate' IS NULL THEN RAISE EXCEPTION 'Compensation requires verified joining date' USING ERRCODE='23514';END IF;
   v_join:=(NEW.data->'data'->>'joiningDate')::date;v_end:=(NEW.data->'data'->>'employmentEndDate')::date;
   IF v_end IS NOT NULL AND v_end<v_join THEN RAISE EXCEPTION 'Employment end cannot precede joining' USING ERRCODE='23514';END IF;
   IF NOT(NEW.data->'data'->>'commissionEligible')::boolean AND EXISTS(SELECT 1 FROM erp_private.payroll_policies p WHERE p.employee_id=NEW.employee_id AND p.kind='Commission' AND p.state='Active' AND p.effective_from<=NEW.effective_from) THEN RAISE EXCEPTION 'Preserve commission history; stop future commission using an approved zero rate' USING ERRCODE='23514';END IF;
  ELSIF NEW.state='Active' THEN
   SELECT * INTO v_profile FROM erp_private.payroll_policies WHERE employee_id=NEW.employee_id AND kind='Compensation' AND state='Active' AND effective_from<=NEW.effective_from ORDER BY effective_from DESC,id DESC LIMIT 1;
   IF v_profile.id IS NULL OR NOT(v_profile.data->'data'->>'commissionEligible')::boolean THEN RAISE EXCEPTION 'Commission requires an eligible independently approved compensation profile' USING ERRCODE='23514';END IF;
  END IF;RETURN NEW;
 END IF;
 SELECT * INTO v_profile FROM erp_private.payroll_policies WHERE id=NEW.snapshot->>'profileId';SELECT * INTO v_run FROM erp_private.payroll_runs WHERE id=NEW.run_id;SELECT * INTO v_employee FROM erp_private.employees WHERE id=NEW.employee_id;
 v_join:=(v_profile.data->'data'->>'joiningDate')::date;v_end:=(v_profile.data->'data'->>'employmentEndDate')::date;
 IF v_join IS NULL OR v_join>=((v_run.period||'-01')::date+interval '1 month') OR ((v_employee.status<>'Active' OR v_end<(v_run.period||'-01')::date) AND NOT(NEW.snapshot->'input'->>'finalSettlement')::boolean) THEN RAISE EXCEPTION 'Payroll must respect employment dates or documented final settlement' USING ERRCODE='23514';END IF;
 IF NEW.snapshot->>'employeeName' IS DISTINCT FROM v_employee.name OR NEW.snapshot->>'employeeCode' IS DISTINCT FROM v_employee.employee_code OR NEW.snapshot->>'designation' IS DISTINCT FROM coalesce(nullif(v_employee.title,''),v_employee.role) THEN RAISE EXCEPTION 'Payroll identity must link the canonical employee' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_policy_employment BEFORE INSERT OR UPDATE ON erp_private.payroll_policies FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_employment();
--> statement-breakpoint
CREATE TRIGGER payroll_line_employment BEFORE INSERT ON erp_private.payroll_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_employment();
