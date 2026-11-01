REVOKE ALL ON SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA erp_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA erp_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER TABLE erp_private.employees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE erp_private.sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE erp_private.documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE erp_private.audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE erp_private.rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION erp_private.reject_audit_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Audit history is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON erp_private.audit_events FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_audit_change();
