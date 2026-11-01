CREATE OR REPLACE FUNCTION erp_private.verify_ledger_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_e erp_private.ledger_source_events%ROWTYPE; v_j erp_private.ledger_journals%ROWTYPE; v_id text; v_kind text; v_amount numeric; v_type text; v_direction text; v_cash text; v_original text; v_debit text; v_credit text; v_da text; v_ca text; v_config jsonb; v_n integer;
BEGIN
  IF (NEW.source_key LIKE 'payroll:%' OR (NEW.source_key LIKE 'account:%' AND EXISTS(SELECT 1 FROM erp_private.account_transactions a WHERE a.id=substr(NEW.source_key,9) AND a.source_type IN ('Payroll Payment','Payroll Advance','Payroll Loan')))) THEN
    PERFORM erp_private.verify_payroll_ledger(NEW.id); RETURN NULL;
  END IF;
  SELECT * INTO v_e FROM erp_private.ledger_source_events WHERE id=NEW.id;
  IF v_e.state<>'Posted' THEN RETURN NULL; END IF;
  SELECT * INTO v_j FROM erp_private.ledger_journals WHERE id=v_e.journal_id;
  IF v_j.id IS NULL OR v_j.state<>'Posted' OR v_j.source_key<>v_e.source_key OR v_j.configuration_id<>v_e.configuration_id OR v_j.date<>v_e.date OR v_j.confidential<>v_e.confidential THEN RAISE EXCEPTION 'Posted ledger source and journal must reconcile' USING ERRCODE='23514'; END IF;
  v_kind:=split_part(v_e.source_key,':',1); v_id:=substr(v_e.source_key,length(v_kind)+2);
  CASE v_kind
    WHEN 'account' THEN
      SELECT a.amount,a.source_type,a.direction,a.account_id,(SELECT o.id FROM erp_private.ledger_journals o WHERE o.source_key='account:'||a.reversal_of_id) INTO v_amount,v_type,v_direction,v_cash,v_original FROM erp_private.account_transactions a WHERE a.id=v_id AND a.date=v_e.date;
      v_type:=CASE v_type WHEN 'Collection' THEN 'Receivables' WHEN 'Return Refund' THEN 'Receivables' WHEN 'Expense' THEN 'Operating Expense' WHEN 'Supplier Payment' THEN 'Payables' WHEN 'Import Cost' THEN 'Inventory Clearing' WHEN 'Company Loan' THEN 'Company Loans' ELSE NULL END;
      v_debit:=CASE WHEN v_direction='In' THEN 'Cash' ELSE v_type END; v_credit:=CASE WHEN v_direction='In' THEN v_type ELSE 'Cash' END;
    WHEN 'stock' THEN
      SELECT s.value_bdt,s.type,CASE WHEN s.adjustment_sign=1 THEN 'In' ELSE 'Out' END INTO v_amount,v_type,v_direction FROM erp_private.stock_movements s WHERE s.id=v_id AND s.date=v_e.date AND s.type<>'Opening';
      v_debit:=CASE v_type WHEN 'Receive' THEN 'Inventory' WHEN 'Dispatch' THEN 'COGS' WHEN 'Return' THEN 'Inventory' WHEN 'Adjustment' THEN CASE WHEN v_direction='In' THEN 'Inventory' ELSE 'Stock Loss' END END;
      v_credit:=CASE v_type WHEN 'Receive' THEN 'Inventory Clearing' WHEN 'Dispatch' THEN 'Inventory' WHEN 'Return' THEN 'COGS' WHEN 'Adjustment' THEN CASE WHEN v_direction='In' THEN 'Stock Gain' ELSE 'Inventory' END END;
    WHEN 'invoice' THEN
      SELECT i.total INTO v_amount FROM erp_private.sales_invoices i WHERE i.id=v_id AND i.status IN ('Approved','Cancelled') AND i.date=v_e.date; v_debit:='Receivables'; v_credit:='Sales';
    WHEN 'invoice-reversal' THEN
      SELECT i.total,(SELECT o.id FROM erp_private.ledger_journals o WHERE o.source_key='invoice:'||i.id) INTO v_amount,v_original FROM erp_private.sales_invoices i WHERE i.id=v_id AND i.status='Cancelled'; v_debit:='Sales Returns'; v_credit:='Receivables';
    WHEN 'return' THEN
      SELECT r.credit_bdt INTO v_amount FROM erp_private.customer_returns r WHERE r.id=v_id AND r.state='Posted' AND r.kind='Invoiced Return' AND r.posted_date=v_e.date; v_debit:='Sales Returns'; v_credit:='Receivables';
    WHEN 'obligation' THEN
      SELECT s.amount INTO v_amount FROM erp_private.supplier_settlements s WHERE s.id=v_id AND s.entry_type='Obligation' AND s.date=v_e.date AND s.opening_position_id IS NULL; v_debit:='Inventory Clearing'; v_credit:='Payables';
    WHEN 'obligation-reversal' THEN
      SELECT s.amount INTO v_amount FROM erp_private.supplier_settlements s WHERE s.id=v_id AND s.entry_type='Obligation' AND s.status='Reversed' AND s.reversal_date=v_e.date AND s.opening_position_id IS NULL; v_debit:='Payables'; v_credit:='Inventory Clearing';
    ELSE RAISE EXCEPTION 'Unrecognized accounting source' USING ERRCODE='23514';
  END CASE;
  IF v_amount IS NULL OR v_amount<>v_j.total_bdt THEN RAISE EXCEPTION 'Automatic journal must match saved operational amount' USING ERRCODE='23514'; END IF;
  IF v_j.reversal_of_id IS NOT NULL THEN
    IF v_j.reversal_of_id IS DISTINCT FROM v_original OR jsonb_array_length(v_e.plan)<>0 THEN RAISE EXCEPTION 'Compensation must identify original source journal' USING ERRCODE='23514'; END IF; RETURN NULL;
  END IF;
  IF v_original IS NOT NULL OR v_debit IS NULL OR v_credit IS NULL THEN RAISE EXCEPTION 'Unsupported/reversed sources cannot infer new accounts' USING ERRCODE='23514'; END IF;
  SELECT c.data INTO v_config FROM erp_private.ledger_configurations c WHERE c.id=v_e.configuration_id;
  SELECT m->>'accountId' INTO v_da FROM jsonb_array_elements(CASE WHEN v_debit='Cash' THEN v_config->'cashMappings' ELSE v_config->'mappings' END) m WHERE CASE WHEN v_debit='Cash' THEN m->>'cashAccountId'=v_cash ELSE m->>'role'=v_debit END;
  SELECT m->>'accountId' INTO v_ca FROM jsonb_array_elements(CASE WHEN v_credit='Cash' THEN v_config->'cashMappings' ELSE v_config->'mappings' END) m WHERE CASE WHEN v_credit='Cash' THEN m->>'cashAccountId'=v_cash ELSE m->>'role'=v_credit END;
  IF v_da IS NULL OR v_ca IS NULL OR v_da=v_ca OR (SELECT count(*) FROM erp_private.ledger_lines WHERE journal_id=v_j.id)<>2 OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines WHERE journal_id=v_j.id AND account_id=v_da AND debit=v_amount AND credit=0) OR NOT EXISTS(SELECT 1 FROM erp_private.ledger_lines WHERE journal_id=v_j.id AND account_id=v_ca AND credit=v_amount AND debit=0) THEN RAISE EXCEPTION 'Automatic accounts must match approved source-specific mapping' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v_e.plan) p WHERE ((p->>'role'=v_debit AND (p->>'debit')::numeric=v_amount AND (p->>'credit')::numeric=0) OR (p->>'role'=v_credit AND (p->>'credit')::numeric=v_amount AND (p->>'debit')::numeric=0)) AND (p->>'role'<>'Cash' OR p->>'cashAccountId'=v_cash);
  IF jsonb_array_length(v_e.plan)<>2 OR v_n<>2 THEN RAISE EXCEPTION 'Saved source plan must describe exact posting roles' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
