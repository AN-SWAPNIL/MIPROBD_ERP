CREATE OR REPLACE FUNCTION erp_private.verify_invoice_refusal_dates() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_id text;
BEGIN
  IF TG_TABLE_NAME='sales_invoices' THEN v_id:=NEW.id; ELSE v_id:=NEW.invoice_id; END IF;
  IF EXISTS(SELECT 1 FROM erp_private.invoice_lines il JOIN erp_private.sales_invoices i ON i.id=il.invoice_id JOIN erp_private.customer_return_lines rl ON il.refusal_line_ids ? rl.id JOIN erp_private.customer_returns r ON r.id=rl.return_id WHERE il.invoice_id=v_id AND r.posted_date>i.date) THEN RAISE EXCEPTION 'Accepted-only invoice cannot predate its refused-stock source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
