CREATE OR REPLACE FUNCTION erp_private.verify_payroll_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rid text; r erp_private.payroll_runs%ROWTYPE; l erp_private.payroll_lines%ROWTYPE; loan erp_private.payroll_loans%ROWTYPE; p erp_private.payroll_payments%ROWTYPE; n integer; gross numeric; net numeric; advance numeric; credit_loan numeric; expected_source text; expected_id text; transaction_id text; source_amount numeric; v_account_id text; source_date date; BEGIN
 IF TG_TABLE_NAME='payroll_runs' THEN rid:=NEW.id;
 ELSIF TG_TABLE_NAME='payroll_lines' THEN rid:=NEW.run_id;
 ELSIF TG_TABLE_NAME='payroll_recoveries' THEN SELECT run_id INTO rid FROM erp_private.payroll_lines WHERE id=NEW.line_id;
 ELSIF TG_TABLE_NAME='payroll_loans' THEN expected_source:=CASE NEW.kind WHEN 'Advance' THEN 'Payroll Advance' ELSE 'Payroll Loan' END;expected_id:=NEW.id;
 ELSIF TG_TABLE_NAME='payroll_payments' THEN expected_source:='Payroll Payment';expected_id:=NEW.id;
 ELSE IF NEW.source_type NOT IN ('Payroll Payment','Payroll Advance','Payroll Loan') THEN RETURN NULL; END IF;expected_source:=NEW.source_type;expected_id:=NEW.source_id; END IF;
 IF expected_source IS NOT NULL THEN
  IF expected_source='Payroll Payment' THEN SELECT * INTO p FROM erp_private.payroll_payments WHERE id=expected_id;IF p.id IS NULL OR p.state<>'Posted' THEN IF TG_TABLE_NAME='payroll_payments' AND p.state='Submitted' THEN RETURN NULL; END IF;RAISE EXCEPTION 'Cash salary source must be an approved posted payment' USING ERRCODE='23514'; END IF;transaction_id:=p.transaction_id;source_amount:=p.amount;v_account_id:=p.account_id;source_date:=p.date;PERFORM erp_private.require_payroll_approval(p.approval_id,'Payroll Payment',p.id,p.payload_hash,p.amount);
  ELSE SELECT * INTO loan FROM erp_private.payroll_loans WHERE id=expected_id;IF loan.id IS NULL OR loan.state<>'Posted' OR expected_source<>(CASE loan.kind WHEN 'Advance' THEN 'Payroll Advance' ELSE 'Payroll Loan' END) THEN IF TG_TABLE_NAME='payroll_loans' AND loan.state='Submitted' THEN RETURN NULL; END IF;RAISE EXCEPTION 'Cash financing source must be an approved posted employee loan' USING ERRCODE='23514'; END IF;transaction_id:=loan.transaction_id;source_amount:=loan.amount;v_account_id:=loan.account_id;source_date:=loan.date;PERFORM erp_private.require_payroll_approval(loan.approval_id,'Payroll Loan',loan.id,loan.payload_hash,loan.amount); END IF;
  IF NOT EXISTS(SELECT 1 FROM erp_private.account_transactions a WHERE a.id=transaction_id AND a.source_id=expected_id AND a.source_type=expected_source AND a.amount=source_amount AND a.account_id=v_account_id AND a.date=source_date AND a.direction='Out' AND a.reversal_of_id IS NULL) OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_source_events e WHERE e.source_key='account:'||transaction_id AND e.state='Posted' AND e.confidential) THEN RAISE EXCEPTION 'Payroll disbursement/cash/confidential ledger must reconcile' USING ERRCODE='23514'; END IF;RETURN NULL;
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
CREATE OR REPLACE FUNCTION erp_private.verify_payroll_ledger(event_id text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e erp_private.ledger_source_events%ROWTYPE;j erp_private.ledger_journals%ROWTYPE;r erp_private.payroll_runs%ROWTYPE;cfg jsonb;expected jsonb;cash text;counterpart text;v_amount numeric;sid text;role text;entry jsonb;account text;positive integer:=0;BEGIN
 SELECT * INTO e FROM erp_private.ledger_source_events WHERE id=event_id;SELECT * INTO j FROM erp_private.ledger_journals WHERE id=e.journal_id;
 IF e.state<>'Posted' OR NOT e.confidential OR j.id IS NULL OR NOT j.confidential OR j.state<>'Posted' OR j.source_key<>e.source_key OR j.configuration_id<>e.configuration_id OR j.date<>e.date THEN RAISE EXCEPTION 'Payroll requires exact confidential source journal' USING ERRCODE='23514'; END IF;
 IF split_part(e.source_key,':',1)='payroll' THEN
  SELECT * INTO r FROM erp_private.payroll_runs WHERE id=substr(e.source_key,9);IF r.id IS NULL OR r.state<>'Accrued' OR r.posted_date<>e.date THEN RAISE EXCEPTION 'Payroll ledger requires accrued original run' USING ERRCODE='23514'; END IF;
  v_amount:=r.gross;SELECT jsonb_build_object('Payroll Expense',r.gross,'Payroll Payable',-r.net,'Employee Advances',-coalesce(sum((l.snapshot->'math'->>'advanceRecovery')::numeric),0),'Employee Loans',-coalesce(sum((l.snapshot->'math'->>'loanRecovery')::numeric),0),'Payroll Deductions',-coalesce(sum((l.snapshot->'math'->>'otherDeduction')::numeric),0)) INTO expected FROM erp_private.payroll_lines l WHERE l.run_id=r.id;
 ELSE
  SELECT a.amount,a.account_id,a.source_type,a.source_id INTO v_amount,cash,counterpart,sid FROM erp_private.account_transactions a WHERE a.id=substr(e.source_key,9) AND a.date=e.date AND a.direction='Out' AND a.reversal_of_id IS NULL;
  IF counterpart='Payroll Payment' THEN IF NOT EXISTS(SELECT 1 FROM erp_private.payroll_payments p WHERE p.id=sid AND p.state='Posted' AND p.amount=v_amount AND p.account_id=cash) THEN RAISE EXCEPTION 'Salary ledger requires actual approved payment' USING ERRCODE='23514'; END IF;counterpart:='Payroll Payable';
  ELSIF counterpart IN ('Payroll Advance','Payroll Loan') THEN IF NOT EXISTS(SELECT 1 FROM erp_private.payroll_loans l WHERE l.id=sid AND l.state='Posted' AND l.amount=v_amount AND l.account_id=cash) THEN RAISE EXCEPTION 'Employee financing ledger requires actual approved source' USING ERRCODE='23514'; END IF;counterpart:=CASE counterpart WHEN 'Payroll Advance' THEN 'Employee Advances' ELSE 'Employee Loans' END;
  ELSE RAISE EXCEPTION 'Unsupported confidential payroll source' USING ERRCODE='23514'; END IF;
  expected:=jsonb_build_object(counterpart,v_amount,'Cash',-v_amount);
 END IF;
 IF v_amount IS NULL OR v_amount<>j.total_bdt OR j.reversal_of_id IS NOT NULL THEN RAISE EXCEPTION 'Payroll ledger must equal saved gross/disbursement' USING ERRCODE='23514'; END IF;
 SELECT data INTO cfg FROM erp_private.ledger_configurations WHERE id=e.configuration_id;
 FOR role,entry IN SELECT key,value FROM jsonb_each(expected) LOOP
  IF entry::text::numeric=0 THEN CONTINUE;END IF;positive:=positive+1;
  SELECT m->>'accountId' INTO account FROM jsonb_array_elements(CASE WHEN role='Cash' THEN cfg->'cashMappings' ELSE cfg->'mappings' END) m WHERE CASE WHEN role='Cash' THEN m->>'cashAccountId'=cash ELSE m->>'role'=role END;
  IF account IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines l WHERE l.journal_id=j.id AND l.account_id=account AND l.debit=greatest(entry::text::numeric,0) AND l.credit=greatest(-entry::text::numeric,0)) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.plan) p WHERE p->>'role'=role AND (p->>'debit')::numeric=greatest(entry::text::numeric,0) AND (p->>'credit')::numeric=greatest(-entry::text::numeric,0) AND (role<>'Cash' OR p->>'cashAccountId'=cash)) THEN RAISE EXCEPTION 'Payroll accounts must match approved source-specific roles' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM erp_private.ledger_lines WHERE journal_id=j.id)<>positive OR jsonb_array_length(e.plan)<>positive THEN RAISE EXCEPTION 'Payroll journal has extra/missing lines' USING ERRCODE='23514'; END IF;
END $$;
