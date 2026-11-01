REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
INSERT INTO erp_private.expense_categories (id, name) VALUES
('cat-office-rent','Office Rent'), ('cat-salary','Salary'), ('cat-utilities','Utilities'),
('cat-office','Office Supplies'), ('cat-courier','Courier'), ('cat-maintenance','Maintenance'),
('cat-marketing','Marketing'), ('cat-transport','Local Transport'), ('cat-tada','TA/DA'),
('cat-regulatory','Regulatory Fees'), ('cat-printing','Printing & Stationery'), ('cat-other','Other');
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_operating_posting() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE source_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Posted operating history cannot be deleted' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'Posted' OR NEW.reversed_by IS NOT NULL OR NEW.reversed_at IS NOT NULL OR NEW.reversal_date IS NOT NULL OR NEW.reversal_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New entries must be unreversed postings' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  source_date := coalesce((to_jsonb(OLD)->>'date')::date, (to_jsonb(OLD)->>'as_of_date')::date);
  IF OLD.status <> 'Posted' OR NEW.status <> 'Reversed' OR NEW.reversed_by IS NULL OR NEW.reversed_at IS NULL OR NEW.reversal_date IS NULL OR
     length(btrim(coalesce(NEW.reversal_reason,''))) < 5 OR NEW.reversal_date < source_date OR
     NEW.reversal_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR
     (to_jsonb(NEW) - ARRAY['status','reversed_by','reversed_at','reversal_date','reversal_reason']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','reversed_by','reversed_at','reversal_date','reversal_reason']) THEN
    RAISE EXCEPTION 'Posted entries only permit an explained reversal; originals are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER expense_posting_guard BEFORE INSERT OR UPDATE OR DELETE ON erp_private.expenses FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operating_posting();
--> statement-breakpoint
CREATE TRIGGER settlement_posting_guard BEFORE INSERT OR UPDATE OR DELETE ON erp_private.supplier_settlements FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operating_posting();
--> statement-breakpoint
CREATE TRIGGER position_posting_guard BEFORE INSERT OR UPDATE OR DELETE ON erp_private.financial_position_entries FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operating_posting();
--> statement-breakpoint
CREATE TRIGGER expense_no_truncate BEFORE TRUNCATE ON erp_private.expenses FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER settlement_no_truncate BEFORE TRUNCATE ON erp_private.supplier_settlements FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER position_no_truncate BEFORE TRUNCATE ON erp_private.financial_position_entries FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_operating_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE source_type text; source_id text; doc jsonb; original erp_private.account_transactions%ROWTYPE; reversal erp_private.account_transactions%ROWTYPE; aid text; tid text; amount numeric; expected_count integer;
BEGIN
  IF TG_TABLE_NAME = 'account_transactions' THEN
    IF NEW.source_type NOT IN ('Expense','Supplier Payment') THEN RETURN NULL; END IF;
    source_type := NEW.source_type;
    IF NEW.reversal_of_id IS NOT NULL THEN
      SELECT a.source_id INTO source_id FROM erp_private.account_transactions a WHERE a.id = NEW.reversal_of_id;
    ELSE source_id := NEW.source_id; END IF;
  ELSE
    source_id := NEW.id; source_type := CASE WHEN TG_TABLE_NAME = 'expenses' THEN 'Expense' ELSE 'Supplier Payment' END;
  END IF;
  IF source_type = 'Expense' THEN SELECT to_jsonb(e) INTO doc FROM erp_private.expenses e WHERE e.id = source_id;
  ELSE SELECT to_jsonb(s) INTO doc FROM erp_private.supplier_settlements s WHERE s.id = source_id; END IF;
  IF doc IS NULL THEN RAISE EXCEPTION 'Operating journal requires a real source posting' USING ERRCODE = '23514'; END IF;
  IF source_type = 'Supplier Payment' AND doc->>'import_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM erp_private.import_cases i WHERE i.id = doc->>'import_id' AND i.supplier_id = doc->>'supplier_id'
  ) THEN RAISE EXCEPTION 'Settlement import and supplier must match' USING ERRCODE = '23514'; END IF;
  IF source_type = 'Supplier Payment' AND doc->>'entry_type' = 'Obligation' THEN
    IF EXISTS (SELECT 1 FROM erp_private.account_transactions a WHERE a.source_type = source_type AND a.source_id = source_id) THEN
      RAISE EXCEPTION 'An obligation does not move cash' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;
  tid := doc->>'transaction_id'; aid := coalesce(doc->>'paid_from_account_id',doc->>'account_id'); amount := (doc->>'amount')::numeric;
  SELECT * INTO original FROM erp_private.account_transactions a WHERE a.id = tid;
  IF original.id IS NULL OR original.source_type <> source_type OR original.source_id <> source_id OR original.account_id <> aid OR
     original.amount <> amount OR original.direction <> 'Out' OR original.date <> (doc->>'date')::date OR original.reversal_of_id IS NOT NULL OR original.collection_id IS NOT NULL THEN
    RAISE EXCEPTION 'Operating posting must reconcile to its original cash outflow' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO reversal FROM erp_private.account_transactions a WHERE a.reversal_of_id = tid;
  expected_count := CASE WHEN doc->>'status' = 'Reversed' THEN 1 ELSE 0 END;
  IF (reversal.id IS NOT NULL)::integer <> expected_count OR
     (reversal.id IS NOT NULL AND (reversal.direction <> 'In' OR reversal.amount <> amount OR reversal.account_id <> aid OR reversal.source_type <> source_type OR
       reversal.source_id <> 'reversal-' || source_id OR reversal.date <> (doc->>'reversal_date')::date)) THEN
    RAISE EXCEPTION 'Operating reversal must reconcile to one compensating inflow' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expense_journal_balance AFTER INSERT OR UPDATE ON erp_private.expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_operating_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER settlement_journal_balance AFTER INSERT OR UPDATE ON erp_private.supplier_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_operating_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER operating_account_journal_balance AFTER INSERT ON erp_private.account_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_operating_journal();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_account_reversal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE original erp_private.account_transactions%ROWTYPE;
BEGIN
  IF NEW.reversal_of_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO original FROM erp_private.account_transactions WHERE id = NEW.reversal_of_id;
  IF original.id IS NULL OR original.reversal_of_id IS NOT NULL OR original.account_id <> NEW.account_id OR original.amount <> NEW.amount OR
     original.direction = NEW.direction OR original.source_type <> NEW.source_type OR original.collection_id IS DISTINCT FROM NEW.collection_id OR NEW.date < original.date THEN
    RAISE EXCEPTION 'A reversal must exactly compensate the original account entry' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER account_reversal_integrity AFTER INSERT ON erp_private.account_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_account_reversal();
--> statement-breakpoint
ALTER TABLE erp_private.documents ADD CONSTRAINT document_expense_parent CHECK (expense_id IS NULL OR (purpose = 'expense-receipt' AND import_id IS NULL));
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_expense_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.purpose = 'expense-receipt' AND OLD.status = 'Attached' AND
     (NEW.id,NEW.purpose,NEW.uploaded_by,NEW.object_path,NEW.bucket,NEW.file_name,NEW.mime_type,NEW.size_bytes,NEW.status,NEW.employee_id,NEW.import_id)
     IS DISTINCT FROM (OLD.id,OLD.purpose,OLD.uploaded_by,OLD.object_path,OLD.bucket,OLD.file_name,OLD.mime_type,OLD.size_bytes,OLD.status,OLD.employee_id,OLD.import_id) THEN
    RAISE EXCEPTION 'Completed expense evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.expense_id IS DISTINCT FROM OLD.expense_id AND (OLD.expense_id IS NOT NULL OR OLD.purpose <> 'expense-receipt' OR OLD.status <> 'Attached' OR NOT EXISTS (
    SELECT 1 FROM erp_private.expenses e WHERE e.id = NEW.expense_id AND e.entered_by_user_id = OLD.uploaded_by
  )) THEN RAISE EXCEPTION 'Expense evidence cannot be moved or attached to another uploader posting' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER expense_evidence_guard BEFORE UPDATE ON erp_private.documents FOR EACH ROW EXECUTE FUNCTION erp_private.guard_expense_evidence();
