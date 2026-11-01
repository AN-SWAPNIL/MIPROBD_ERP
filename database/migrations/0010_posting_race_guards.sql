CREATE OR REPLACE FUNCTION erp_private.verify_account_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialize the journal check even when a privileged maintenance tool bypasses the API.
  PERFORM 1 FROM erp_private.cash_accounts WHERE id = NEW.account_id FOR UPDATE;
  IF (SELECT coalesce(sum(CASE WHEN direction = 'In' THEN amount ELSE -amount END),0)
      FROM erp_private.account_transactions WHERE account_id = NEW.account_id) < 0 THEN
    RAISE EXCEPTION 'Account balance cannot be negative' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_stock_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE bid text; b erp_private.stock_batches%ROWTYPE; q numeric; v numeric;
BEGIN
  IF TG_TABLE_NAME = 'stock_batches' THEN bid := NEW.id; ELSE bid := NEW.batch_id; END IF;
  SELECT * INTO b FROM erp_private.stock_batches WHERE id = bid FOR UPDATE;
  SELECT coalesce(sum(CASE WHEN type IN ('Receive','Return') THEN quantity WHEN type = 'Dispatch' THEN -quantity ELSE 0 END),0),
         coalesce(sum(CASE WHEN type IN ('Receive','Return') THEN value_bdt WHEN type = 'Dispatch' THEN -value_bdt ELSE 0 END),0)
  INTO q, v FROM erp_private.stock_movements WHERE batch_id = bid;
  IF b.quantity_available <> q OR b.available_value_bdt <> v OR q < 0 OR v < 0 OR (q = 0 AND v <> 0) THEN
    RAISE EXCEPTION 'Stock quantity/value must reconcile to its immutable movements' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_cancelled_invoice_allocations() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'Cancelled' AND EXISTS (
    SELECT 1 FROM erp_private.collection_allocations a
    JOIN erp_private.customer_entries e ON e.id = a.receivable_entry_id
    JOIN erp_private.collections c ON c.id = a.collection_id
    WHERE e.invoice_id = NEW.id AND c.status = 'Posted'
  ) THEN
    RAISE EXCEPTION 'Reverse posted receipts before cancelling the invoice' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER cancelled_invoice_receipt_guard AFTER UPDATE ON erp_private.sales_invoices
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_cancelled_invoice_allocations();
