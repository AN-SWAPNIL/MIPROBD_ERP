CREATE FUNCTION erp_private.verify_invoice_refusal_dates() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_id text;
BEGIN
  v_id:=CASE WHEN TG_TABLE_NAME='sales_invoices' THEN NEW.id ELSE NEW.invoice_id END;
  IF EXISTS(SELECT 1 FROM erp_private.invoice_lines il JOIN erp_private.sales_invoices i ON i.id=il.invoice_id JOIN erp_private.customer_return_lines rl ON il.refusal_line_ids ? rl.id JOIN erp_private.customer_returns r ON r.id=rl.return_id WHERE il.invoice_id=v_id AND r.posted_date>i.date) THEN RAISE EXCEPTION 'Accepted-only invoice cannot predate its refused-stock source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_refusal_dates AFTER INSERT OR UPDATE ON erp_private.sales_invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_invoice_refusal_dates();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER invoice_line_refusal_dates AFTER INSERT ON erp_private.invoice_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_invoice_refusal_dates();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_return_invoice_date() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.kind='Invoiced Return' AND EXISTS(SELECT 1 FROM erp_private.sales_invoices WHERE id=NEW.invoice_id AND date>NEW.received_date) THEN RAISE EXCEPTION 'Invoiced return receipt cannot predate the original invoice' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER return_original_invoice_date BEFORE INSERT OR UPDATE ON erp_private.customer_returns FOR EACH ROW EXECUTE FUNCTION erp_private.guard_return_invoice_date();
