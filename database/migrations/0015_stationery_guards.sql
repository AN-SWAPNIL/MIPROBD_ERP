REVOKE ALL ON erp_private.print_configurations FROM anon, authenticated;
--> statement-breakpoint
-- Reference stationery only. No customers, transactions or opening balances are seeded.
INSERT INTO erp_private.print_configurations (id, data) VALUES ('company', '{
  "defaultIdentityId": "mipro", "defaultLetterheadMode": "Digital",
  "identities": [
    { "id": "mipro", "displayName": "MIPRO Healthcare", "companyName": "MIPRO HEALTHCARE CORPORATION", "address": "Flat-B2, House-26, Road-06, Sector-09, Uttara, Dhaka-1230", "phone": "+88 018 05 050780", "email": "ledtrackers@gmail.com", "website": "www.miprobd.com", "logoUrl": "/mipro-logo.png", "backgroundImageUrl": "/mipro-letterhead.jpg", "footerText": "PRECISION IN HEALTHCARE", "authorizedSignatory": "Authorized Signatory", "safeArea": { "topMm": 39, "rightMm": 19, "bottomMm": 24, "leftMm": 22.5 } },
    { "id": "led-trackers", "displayName": "LED Trackers", "companyName": "LED TRACKERS", "address": "Flat-B2, House-26, Road-06, Sector-09, Uttara, Dhaka-1230", "phone": "+88 018 05 050780", "email": "ledtrackers@gmail.com", "website": "www.miprobd.com", "logoUrl": "/mipro-logo.png", "backgroundImageUrl": "/led-letterhead.jpg", "footerText": "PRECISION IN HEALTHCARE", "authorizedSignatory": "Authorized Signatory", "safeArea": { "topMm": 39, "rightMm": 19, "bottomMm": 24, "leftMm": 22.5 } }
  ]
}'::jsonb);
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_print_configuration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Company stationery history cannot be deleted or truncated' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.version <> OLD.version + 1 OR NEW.updated_by IS NULL OR NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'Stationery changes require the next version and actor metadata' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER print_configuration_version BEFORE UPDATE OR DELETE ON erp_private.print_configurations FOR EACH ROW EXECUTE FUNCTION erp_private.guard_print_configuration();
--> statement-breakpoint
CREATE TRIGGER print_configuration_no_truncate BEFORE TRUNCATE ON erp_private.print_configurations FOR EACH STATEMENT EXECUTE FUNCTION erp_private.guard_print_configuration();
