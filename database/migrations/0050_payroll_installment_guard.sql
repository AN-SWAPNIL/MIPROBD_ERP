CREATE FUNCTION erp_private.guard_payroll_installment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='payroll_lines' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'input'->'recoveries') x JOIN erp_private.payroll_loans l ON l.id=x->>'loanId' WHERE l.installment>0 AND (x->>'amount')::numeric>l.installment) THEN
   RAISE EXCEPTION 'Payroll recovery exceeds the agreed installment' USING ERRCODE='23514';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM erp_private.payroll_loans l WHERE l.id=NEW.loan_id AND l.installment>0 AND NEW.amount>l.installment) THEN
   RAISE EXCEPTION 'Payroll recovery exceeds the agreed installment' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payroll_installment_line BEFORE INSERT ON erp_private.payroll_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_installment();
--> statement-breakpoint
CREATE TRIGGER payroll_installment_recovery BEFORE INSERT ON erp_private.payroll_recoveries FOR EACH ROW EXECUTE FUNCTION erp_private.guard_payroll_installment();
