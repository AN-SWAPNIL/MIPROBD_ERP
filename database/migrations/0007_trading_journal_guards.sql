REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER customer_entry_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.customer_entries FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER order_line_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.order_lines FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
