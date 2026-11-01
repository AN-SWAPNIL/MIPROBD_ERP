REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER TABLE erp_private.import_cases ADD CONSTRAINT current_snapshot_belongs_to_import
FOREIGN KEY (id, current_snapshot_version) REFERENCES erp_private.landed_cost_snapshots(import_id, version)
DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION erp_private.reject_posted_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Posted business history is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER snapshot_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.landed_cost_snapshots FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER receipt_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.warehouse_receipts FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER receipt_line_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.receipt_lines FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER movement_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.stock_movements FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER posting_key_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.posting_keys FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
