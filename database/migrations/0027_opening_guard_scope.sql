-- Verify each affected line at commit; only a draft transition scans the whole schedule.
CREATE OR REPLACE FUNCTION erp_private.verify_opening_posting() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE did uuid; pid text; d erp_private.opening_drafts%ROWTYPE; p erp_private.opening_positions%ROWTYPE; b erp_private.stock_batches%ROWTYPE; expected numeric; n integer;
BEGIN
  IF TG_TABLE_NAME='opening_drafts' THEN
    IF NEW.state NOT IN ('Posted','Reconciled') THEN RETURN NULL; END IF; did:=NEW.id;
  ELSIF TG_TABLE_NAME='opening_positions' THEN did:=NEW.draft_id; pid:=NEW.id;
  ELSE
    IF TG_TABLE_NAME='stock_movements' THEN
      SELECT opening_position_id INTO pid FROM erp_private.stock_batches WHERE id=NEW.batch_id;
      IF NEW.type='Opening' AND pid IS NULL THEN RAISE EXCEPTION 'Opening movement needs a real opening source' USING ERRCODE='23514'; END IF;
      IF pid IS NOT NULL AND NEW.type='Receive' THEN RAISE EXCEPTION 'Opening stock is not an import receipt' USING ERRCODE='23514'; END IF;
      IF NEW.type<>'Opening' THEN RETURN NULL; END IF;
    ELSE pid:=NEW.opening_position_id; END IF;
    IF pid IS NULL THEN RETURN NULL; END IF;
    SELECT draft_id INTO did FROM erp_private.opening_positions WHERE id=pid;
  END IF;
  SELECT * INTO d FROM erp_private.opening_drafts WHERE id=did;
  IF d.id IS NULL OR d.state NOT IN ('Posted','Reconciled') OR d.approved_by IS NULL OR d.preview->>'canApprove'<>'true' THEN RAISE EXCEPTION 'Opening posting needs an approved source schedule' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM erp_private.opening_positions WHERE draft_id=did)<>jsonb_array_length(d.data->'lines') THEN RAISE EXCEPTION 'Opening schedule must post all lines atomically' USING ERRCODE='23514'; END IF;
  FOR p IN SELECT * FROM erp_private.opening_positions WHERE draft_id=did AND (pid IS NULL OR id=pid) LOOP
    IF p.source_id<>d.source_id OR p.as_of_date<>(d.data->>'asOfDate')::date OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.data->'lines') x WHERE x->>'id'=p.line_id AND x=p.snapshot) OR
      p.kind<>p.snapshot->>'kind' OR p.entity_id<>p.snapshot->>'entityId' OR p.source_sheet<>p.snapshot->>'sourceSheet' OR p.source_cell<>p.snapshot->>'sourceCell' OR p.source_reference<>btrim(p.snapshot->>'sourceReference') THEN RAISE EXCEPTION 'Opening line differs from approved evidence' USING ERRCODE='23514'; END IF;
    expected:=CASE WHEN p.kind='Stock' THEN round((p.snapshot->>'quantity')::numeric*(p.snapshot->>'unitCostBdt')::numeric,2) ELSE (p.snapshot->>'amountBdt')::numeric END;
    IF p.amount_bdt IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Opening amount differs from approved calculation' USING ERRCODE='23514'; END IF;
    SELECT (SELECT count(*) FROM erp_private.stock_batches WHERE opening_position_id=p.id)+(SELECT count(*) FROM erp_private.customer_entries WHERE opening_position_id=p.id)+(SELECT count(*) FROM erp_private.account_transactions WHERE opening_position_id=p.id)+(SELECT count(*) FROM erp_private.supplier_settlements WHERE opening_position_id=p.id) INTO n;
    IF n<>1 THEN RAISE EXCEPTION 'Opening line needs exactly one matching subledger source' USING ERRCODE='23514'; END IF;
    IF p.kind='Stock' THEN
      SELECT * INTO b FROM erp_private.stock_batches WHERE opening_position_id=p.id;
      IF b.id IS NULL OR b.product_id<>p.entity_id OR b.quantity_received<>(p.snapshot->>'quantity')::numeric OR b.received_value_bdt<>expected OR b.landed_cost_per_unit<>(p.snapshot->>'unitCostBdt')::numeric OR b.condition<>p.snapshot->>'condition' OR b.batch_number<>btrim(p.snapshot->>'batch') OR b.lot_number<>btrim(p.snapshot->>'lot') OR b.location<>btrim(p.snapshot->>'location') OR b.manufacturing_date<>(p.snapshot->>'manufacturingDate')::date OR b.expiry_date<>(p.snapshot->>'expiryDate')::date OR b.received_date<>coalesce(nullif(p.snapshot->>'receivedDate','')::date,p.as_of_date) THEN RAISE EXCEPTION 'Opening batch differs from approved stock' USING ERRCODE='23514'; END IF;
      IF (SELECT count(*) FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Opening')<>1 OR NOT EXISTS (SELECT 1 FROM erp_private.stock_movements WHERE batch_id=b.id AND type='Opening' AND quantity_delta=b.quantity_received AND value_delta_bdt=expected AND date=p.as_of_date) THEN RAISE EXCEPTION 'Opening stock needs its exact signed movement' USING ERRCODE='23514'; END IF;
    ELSIF p.kind='Customer Due' THEN
      IF NOT EXISTS (SELECT 1 FROM erp_private.customer_entries WHERE opening_position_id=p.id AND customer_id=p.entity_id AND type='Opening Due' AND debit=expected AND credit=0 AND date=p.as_of_date AND reference=p.source_reference AND source_id=p.id AND invoice_id IS NULL AND order_id IS NULL AND collection_id IS NULL) THEN RAISE EXCEPTION 'Opening receivable must not create sales revenue' USING ERRCODE='23514'; END IF;
    ELSIF p.kind='Cash Bank' THEN
      IF NOT EXISTS (SELECT 1 FROM erp_private.account_transactions WHERE opening_position_id=p.id AND account_id=p.entity_id AND amount=expected AND direction='In' AND source_type='Opening Balance' AND source_id=p.id AND date=p.as_of_date AND reversal_of_id IS NULL AND collection_id IS NULL) OR EXISTS (SELECT 1 FROM erp_private.account_transactions WHERE account_id=p.entity_id AND source_type='Opening Balance' AND opening_position_id IS DISTINCT FROM p.id) THEN RAISE EXCEPTION 'Cash opening must reconcile and must not be duplicated' USING ERRCODE='23514'; END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM erp_private.supplier_settlements WHERE opening_position_id=p.id AND supplier_id=p.entity_id AND amount=expected AND date=p.as_of_date AND reference=p.source_reference AND entry_type=CASE WHEN p.kind='Supplier Due' THEN 'Obligation' ELSE 'Opening Advance' END AND import_id IS NULL AND transaction_id IS NULL AND account_id IS NULL AND status='Posted') THEN RAISE EXCEPTION 'Supplier opening must not move cash or fabricate an import' USING ERRCODE='23514'; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
