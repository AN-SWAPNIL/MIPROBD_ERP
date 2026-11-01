CREATE OR REPLACE FUNCTION erp_private.verify_operating_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_source_type text; v_source_id text; doc jsonb; original erp_private.account_transactions%ROWTYPE; reversal erp_private.account_transactions%ROWTYPE; aid text; tid text; amount numeric; expected_count integer;
BEGIN
  IF TG_TABLE_NAME = 'account_transactions' THEN
    IF NEW.source_type NOT IN ('Expense','Supplier Payment') THEN RETURN NULL; END IF;
    v_source_type := NEW.source_type;
    IF NEW.reversal_of_id IS NOT NULL THEN
      SELECT a.source_id INTO v_source_id FROM erp_private.account_transactions a WHERE a.id = NEW.reversal_of_id;
    ELSE v_source_id := NEW.source_id; END IF;
  ELSE
    v_source_id := NEW.id; v_source_type := CASE WHEN TG_TABLE_NAME = 'expenses' THEN 'Expense' ELSE 'Supplier Payment' END;
  END IF;
  IF v_source_type = 'Expense' THEN SELECT to_jsonb(e) INTO doc FROM erp_private.expenses e WHERE e.id = v_source_id;
  ELSE SELECT to_jsonb(s) INTO doc FROM erp_private.supplier_settlements s WHERE s.id = v_source_id; END IF;
  IF doc IS NULL THEN RAISE EXCEPTION 'Operating journal requires a real source posting' USING ERRCODE = '23514'; END IF;
  IF v_source_type = 'Supplier Payment' AND doc->>'import_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM erp_private.import_cases i WHERE i.id = doc->>'import_id' AND i.supplier_id = doc->>'supplier_id'
  ) THEN RAISE EXCEPTION 'Settlement import and supplier must match' USING ERRCODE = '23514'; END IF;
  IF v_source_type = 'Supplier Payment' AND doc->>'entry_type' = 'Obligation' THEN
    IF EXISTS (SELECT 1 FROM erp_private.account_transactions a WHERE a.source_type = v_source_type AND a.source_id = v_source_id) THEN
      RAISE EXCEPTION 'An obligation does not move cash' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;
  tid := doc->>'transaction_id'; aid := coalesce(doc->>'paid_from_account_id',doc->>'account_id'); amount := (doc->>'amount')::numeric;
  SELECT * INTO original FROM erp_private.account_transactions a WHERE a.id = tid;
  IF original.id IS NULL OR original.source_type <> v_source_type OR original.source_id <> v_source_id OR original.account_id <> aid OR
     original.amount <> amount OR original.direction <> 'Out' OR original.date <> (doc->>'date')::date OR original.reversal_of_id IS NOT NULL OR original.collection_id IS NOT NULL THEN
    RAISE EXCEPTION 'Operating posting must reconcile to its original cash outflow' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO reversal FROM erp_private.account_transactions a WHERE a.reversal_of_id = tid;
  expected_count := CASE WHEN doc->>'status' = 'Reversed' THEN 1 ELSE 0 END;
  IF (reversal.id IS NOT NULL)::integer <> expected_count OR
     (reversal.id IS NOT NULL AND (reversal.direction <> 'In' OR reversal.amount <> amount OR reversal.account_id <> aid OR reversal.source_type <> v_source_type OR
       reversal.source_id <> 'reversal-' || v_source_id OR reversal.date <> (doc->>'reversal_date')::date)) THEN
    RAISE EXCEPTION 'Operating reversal must reconcile to one compensating inflow' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
