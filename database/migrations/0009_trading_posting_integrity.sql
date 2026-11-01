REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER delivery_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.deliveries FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER delivery_line_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.delivery_lines FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER invoice_line_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.invoice_lines FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER allocation_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.collection_allocations FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER account_journal_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.account_transactions FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER invoice_delivery_no_delete BEFORE DELETE OR TRUNCATE
ON erp_private.invoice_deliveries FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_invoice_delivery_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(NEW.invoice_id,NEW.delivery_id) IS DISTINCT FROM ROW(OLD.invoice_id,OLD.delivery_id) OR NOT OLD.active OR NEW.active OR
     NOT EXISTS (SELECT 1 FROM erp_private.sales_invoices WHERE id = NEW.invoice_id AND status = 'Cancelled') THEN
    RAISE EXCEPTION 'Invoice delivery links can only be released by cancellation' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER invoice_delivery_change_guard BEFORE UPDATE ON erp_private.invoice_deliveries
FOR EACH ROW EXECUTE FUNCTION erp_private.guard_invoice_delivery_link();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_invoice_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status = 'Cancelled' OR
     ROW(NEW.id, NEW.invoice_number, NEW.order_id, NEW.customer_id, NEW.owner_id, NEW.snapshot, NEW.subtotal, NEW.discount_total, NEW.total, NEW.created_by, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.invoice_number, OLD.order_id, OLD.customer_id, OLD.owner_id, OLD.snapshot, OLD.subtotal, OLD.discount_total, OLD.total, OLD.created_by, OLD.created_at) OR
     (OLD.status <> 'Draft' AND ROW(NEW.date, NEW.remarks, NEW.approved_by, NEW.approved_at) IS DISTINCT FROM ROW(OLD.date, OLD.remarks, OLD.approved_by, OLD.approved_at)) OR
     (OLD.status = 'Approved' AND NEW.status <> 'Cancelled') THEN
    RAISE EXCEPTION 'Invoice history is immutable except controlled draft details and status transitions' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER invoice_change_guard BEFORE UPDATE OR DELETE ON erp_private.sales_invoices
FOR EACH ROW EXECUTE FUNCTION erp_private.guard_invoice_change();
--> statement-breakpoint
CREATE TRIGGER invoice_no_truncate BEFORE TRUNCATE ON erp_private.sales_invoices
FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_collection_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status <> 'Posted' OR NEW.status <> 'Reversed' OR
     ROW(NEW.id, NEW.receipt_number, NEW.customer_id, NEW.customer_name, NEW.order_id, NEW.invoice_id, NEW.owner_id, NEW.date, NEW.amount, NEW.payment_mode, NEW.account_id, NEW.reference_number, NEW.remarks, NEW.posted_by, NEW.posted_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.receipt_number, OLD.customer_id, OLD.customer_name, OLD.order_id, OLD.invoice_id, OLD.owner_id, OLD.date, OLD.amount, OLD.payment_mode, OLD.account_id, OLD.reference_number, OLD.remarks, OLD.posted_by, OLD.posted_at) THEN
    RAISE EXCEPTION 'Receipt history only permits an audited reversal' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER collection_change_guard BEFORE UPDATE OR DELETE ON erp_private.collections
FOR EACH ROW EXECUTE FUNCTION erp_private.guard_collection_change();
--> statement-breakpoint
CREATE TRIGGER collection_no_truncate BEFORE TRUNCATE ON erp_private.collections
FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_stock_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE bid text; b erp_private.stock_batches%ROWTYPE; q numeric; v numeric;
BEGIN
  IF TG_TABLE_NAME = 'stock_batches' THEN bid := NEW.id; ELSE bid := NEW.batch_id; END IF;
  SELECT * INTO b FROM erp_private.stock_batches WHERE id = bid;
  SELECT coalesce(sum(CASE WHEN type IN ('Receive','Return') THEN quantity WHEN type = 'Dispatch' THEN -quantity ELSE 0 END),0),
         coalesce(sum(CASE WHEN type IN ('Receive','Return') THEN value_bdt WHEN type = 'Dispatch' THEN -value_bdt ELSE 0 END),0)
  INTO q, v FROM erp_private.stock_movements WHERE batch_id = bid;
  IF b.quantity_available <> q OR b.available_value_bdt <> v OR q < 0 OR v < 0 OR (q = 0 AND v <> 0) THEN
    RAISE EXCEPTION 'Stock quantity/value must reconcile to its immutable movements' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_batch_journal_balance AFTER INSERT OR UPDATE ON erp_private.stock_batches
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_movement_journal_balance AFTER INSERT ON erp_private.stock_movements
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_journal();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_delivery_line() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM erp_private.stock_movements m
    JOIN erp_private.deliveries d ON d.id = NEW.delivery_id
    JOIN erp_private.order_lines o ON o.id = NEW.order_line_id
    WHERE m.id = NEW.stock_movement_id AND m.type = 'Dispatch' AND m.batch_id = NEW.batch_id
      AND m.quantity = NEW.quantity AND m.value_bdt = NEW.cost_bdt AND m.reference = d.challan_number
      AND o.order_id = d.order_id AND o.product_id = NEW.product_id
  ) THEN RAISE EXCEPTION 'Delivery line must match its order and posted stock movement' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER delivery_line_journal_link AFTER INSERT ON erp_private.delivery_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_delivery_line();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_invoice_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE iid text; inv erp_private.sales_invoices%ROWTYPE; net numeric; allocated_discount numeric; debit numeric; reversal numeric;
BEGIN
  IF TG_TABLE_NAME = 'sales_invoices' THEN iid := NEW.id; ELSE iid := NEW.invoice_id; END IF;
  IF iid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO inv FROM erp_private.sales_invoices WHERE id = iid;
  SELECT coalesce(sum(l.line_total),0), coalesce(sum(l.discount),0) INTO net, allocated_discount FROM erp_private.invoice_lines l WHERE l.invoice_id = iid;
  IF inv.total <> net OR inv.discount_total <> allocated_discount OR inv.subtotal <> net + allocated_discount OR
     NOT EXISTS (SELECT 1 FROM erp_private.invoice_lines WHERE invoice_id = iid) OR
     NOT EXISTS (SELECT 1 FROM erp_private.invoice_deliveries WHERE invoice_id = iid) OR
     EXISTS (SELECT 1 FROM erp_private.invoice_deliveries l JOIN erp_private.deliveries d ON d.id = l.delivery_id
       WHERE l.invoice_id = iid AND (d.order_id <> inv.order_id OR d.customer_id <> inv.customer_id OR l.active <> (inv.status <> 'Cancelled'))) OR
     EXISTS (SELECT 1 FROM erp_private.invoice_lines l JOIN erp_private.delivery_lines d ON d.id = l.delivery_line_id
       WHERE l.invoice_id = iid AND (ROW(l.product_id,l.quantity,l.unit_price,l.discount,l.line_total) IS DISTINCT FROM ROW(d.product_id,d.quantity,d.unit_price,d.discount,d.line_total)
         OR NOT EXISTS (SELECT 1 FROM erp_private.invoice_deliveries link WHERE link.invoice_id = iid AND link.delivery_id = d.delivery_id))) OR
     EXISTS (SELECT 1 FROM erp_private.invoice_deliveries link JOIN erp_private.delivery_lines d ON d.delivery_id = link.delivery_id
       WHERE link.invoice_id = iid AND NOT EXISTS (SELECT 1 FROM erp_private.invoice_lines l WHERE l.invoice_id = iid AND l.delivery_line_id = d.id)) THEN
    RAISE EXCEPTION 'Invoice must reconcile to complete saved delivery lines' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum(e.debit),0) INTO debit FROM erp_private.customer_entries e WHERE e.invoice_id = iid AND e.type = 'Invoice';
  SELECT coalesce(sum(e.credit),0) INTO reversal FROM erp_private.customer_entries e WHERE e.invoice_id = iid AND e.type = 'Reversal' AND e.collection_id IS NULL;
  IF debit <> (CASE WHEN inv.approved_at IS NOT NULL THEN inv.total ELSE 0 END) OR
     reversal <> (CASE WHEN inv.approved_at IS NOT NULL AND inv.status = 'Cancelled' THEN inv.total ELSE 0 END) THEN
    RAISE EXCEPTION 'Invoice receivable/reversal must reconcile to approval status' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_header_journal_balance AFTER INSERT OR UPDATE ON erp_private.sales_invoices
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_invoice_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_line_journal_balance AFTER INSERT ON erp_private.invoice_lines
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_invoice_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_delivery_journal_balance AFTER INSERT OR UPDATE OR DELETE ON erp_private.invoice_deliveries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_invoice_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_entry_journal_balance AFTER INSERT ON erp_private.customer_entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_invoice_journal();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_collection_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE cid text; receipt erp_private.collections%ROWTYPE; allocated numeric; credited numeric; reversed numeric; bank_in numeric; bank_out numeric;
BEGIN
  IF TG_TABLE_NAME = 'collections' THEN cid := NEW.id; ELSE cid := NEW.collection_id; END IF;
  IF cid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO receipt FROM erp_private.collections WHERE id = cid;
  SELECT coalesce(sum(amount),0) INTO allocated FROM erp_private.collection_allocations WHERE collection_id = cid;
  SELECT coalesce(sum(credit) FILTER (WHERE type = 'Collection'),0), coalesce(sum(debit) FILTER (WHERE type = 'Reversal'),0)
  INTO credited, reversed FROM erp_private.customer_entries WHERE collection_id = cid;
  SELECT coalesce(sum(amount) FILTER (WHERE direction = 'In'),0), coalesce(sum(amount) FILTER (WHERE direction = 'Out'),0)
  INTO bank_in, bank_out FROM erp_private.account_transactions WHERE collection_id = cid;
  IF allocated <> receipt.amount OR credited <> receipt.amount OR bank_in <> receipt.amount OR
     reversed <> (CASE WHEN receipt.status = 'Reversed' THEN receipt.amount ELSE 0 END) OR
     bank_out <> (CASE WHEN receipt.status = 'Reversed' THEN receipt.amount ELSE 0 END) OR
     EXISTS (SELECT 1 FROM erp_private.account_transactions WHERE collection_id = cid AND (account_id <> receipt.account_id OR source_type <> 'Collection')) OR
     EXISTS (SELECT 1 FROM erp_private.collection_allocations a JOIN erp_private.customer_entries e ON e.id = a.receivable_entry_id
       WHERE a.collection_id = cid AND (e.customer_id <> receipt.customer_id OR e.type NOT IN ('Invoice','Opening Due') OR e.debit <= 0 OR
         NOT EXISTS (SELECT 1 FROM erp_private.customer_entries credit WHERE credit.collection_id = cid AND credit.type = 'Collection' AND credit.source_id = a.id
           AND credit.customer_id = e.customer_id AND credit.invoice_id IS NOT DISTINCT FROM e.invoice_id AND credit.order_id IS NOT DISTINCT FROM e.order_id AND credit.credit = a.amount))) THEN
    RAISE EXCEPTION 'Receipt allocations, receivable and bank journals must balance' USING ERRCODE = '23514';
  END IF;
  IF receipt.status = 'Posted' AND EXISTS (
    SELECT 1 FROM erp_private.collection_allocations a JOIN erp_private.customer_entries e ON e.id = a.receivable_entry_id
    LEFT JOIN erp_private.sales_invoices i ON i.id = e.invoice_id
    WHERE a.collection_id = cid AND (i.status IS NOT NULL AND i.status <> 'Approved' OR
      e.debit < (SELECT coalesce(sum(other.amount),0) FROM erp_private.collection_allocations other JOIN erp_private.collections c ON c.id = other.collection_id WHERE other.receivable_entry_id = e.id AND c.status = 'Posted'))
  ) THEN RAISE EXCEPTION 'Receipt over-allocates an outstanding receivable' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_header_journal_balance AFTER INSERT OR UPDATE ON erp_private.collections
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_collection_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_allocation_journal_balance AFTER INSERT ON erp_private.collection_allocations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_collection_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_receivable_journal_balance AFTER INSERT ON erp_private.customer_entries
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_collection_journal();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER collection_account_journal_balance AFTER INSERT ON erp_private.account_transactions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_collection_journal();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_account_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (SELECT coalesce(sum(CASE WHEN direction = 'In' THEN amount ELSE -amount END),0) FROM erp_private.account_transactions WHERE account_id = NEW.account_id) < 0 THEN
    RAISE EXCEPTION 'Account balance cannot be negative' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER account_nonnegative_balance AFTER INSERT ON erp_private.account_transactions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_account_balance();
