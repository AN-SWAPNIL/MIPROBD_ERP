CREATE OR REPLACE FUNCTION erp_private.verify_ledger_source() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e erp_private.ledger_source_events%ROWTYPE; j erp_private.ledger_journals%ROWTYPE; v_source_id text; v_source_kind text; v_amount numeric;
BEGIN
  SELECT * INTO e FROM erp_private.ledger_source_events WHERE id=NEW.id;
  IF e.state<>'Posted' THEN RETURN NULL; END IF;
  SELECT * INTO j FROM erp_private.ledger_journals WHERE id=e.journal_id;
  IF j.id IS NULL OR j.state<>'Posted' OR j.source_key<>e.source_key OR j.configuration_id<>e.configuration_id OR j.date<>e.date OR j.confidential<>e.confidential THEN RAISE EXCEPTION 'Posted ledger source and journal must reconcile' USING ERRCODE='23514'; END IF;
  v_source_kind:=split_part(e.source_key,':',1); v_source_id:=substr(e.source_key,length(v_source_kind)+2);
  CASE v_source_kind
    WHEN 'account' THEN SELECT a.amount INTO v_amount FROM erp_private.account_transactions a WHERE a.id=v_source_id AND a.date=e.date;
    WHEN 'stock' THEN SELECT s.value_bdt INTO v_amount FROM erp_private.stock_movements s WHERE s.id=v_source_id AND s.date=e.date AND s.type<>'Opening';
    WHEN 'invoice' THEN SELECT i.total INTO v_amount FROM erp_private.sales_invoices i WHERE i.id=v_source_id AND i.status IN ('Approved','Cancelled') AND i.date=e.date;
    WHEN 'invoice-reversal' THEN SELECT i.total INTO v_amount FROM erp_private.sales_invoices i WHERE i.id=v_source_id AND i.status='Cancelled';
    WHEN 'obligation' THEN SELECT s.amount INTO v_amount FROM erp_private.supplier_settlements s WHERE s.id=v_source_id AND s.entry_type='Obligation' AND s.date=e.date AND s.opening_position_id IS NULL;
    WHEN 'obligation-reversal' THEN SELECT s.amount INTO v_amount FROM erp_private.supplier_settlements s WHERE s.id=v_source_id AND s.entry_type='Obligation' AND s.status='Reversed' AND s.reversal_date=e.date AND s.opening_position_id IS NULL;
    ELSE RAISE EXCEPTION 'Unrecognized accounting source' USING ERRCODE='23514';
  END CASE;
  IF v_amount IS NULL OR v_amount<>j.total_bdt THEN RAISE EXCEPTION 'Automatic journal must match the saved operational amount' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
