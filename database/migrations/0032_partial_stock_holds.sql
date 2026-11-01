CREATE TABLE "erp_private"."stock_hold_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"hold_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"value_bdt" numeric(24, 2) NOT NULL,
	"reason" text NOT NULL,
	"proof_reference" text NOT NULL,
	"payload_hash" text NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approval_id" text NOT NULL,
	"date" date,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_hold_releases_number_unique" UNIQUE("number"),
	CONSTRAINT "stock_hold_releases_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "stock_release_values" CHECK ("erp_private"."stock_hold_releases"."quantity">0 and "erp_private"."stock_hold_releases"."value_bdt">=0 and "erp_private"."stock_hold_releases"."version">0 and "erp_private"."stock_hold_releases"."state" in ('Submitted','Posted') and ("erp_private"."stock_hold_releases"."state"<>'Posted' or ("erp_private"."stock_hold_releases"."date" is not null and "erp_private"."stock_hold_releases"."posted_by" is not null and "erp_private"."stock_hold_releases"."posted_at" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"batch_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"value_bdt" numeric(24, 2) NOT NULL,
	"condition" text NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"proof_reference" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_holds_number_unique" UNIQUE("number"),
	CONSTRAINT "stock_hold_values" CHECK ("erp_private"."stock_holds"."quantity">0 and "erp_private"."stock_holds"."value_bdt">=0 and "erp_private"."stock_holds"."condition" in ('Quarantine','Damaged') and length(btrim("erp_private"."stock_holds"."reason"))>=5 and length(btrim("erp_private"."stock_holds"."proof_reference"))>=3)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_holds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_releases" ADD CONSTRAINT "stock_hold_releases_hold_id_stock_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "erp_private"."stock_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_releases" ADD CONSTRAINT "stock_hold_releases_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_releases" ADD CONSTRAINT "stock_hold_releases_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_releases" ADD CONSTRAINT "stock_hold_releases_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_holds" ADD CONSTRAINT "stock_holds_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_holds" ADD CONSTRAINT "stock_holds_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_release_hold_idx" ON "erp_private"."stock_hold_releases" USING btree ("hold_id","date");--> statement-breakpoint
CREATE INDEX "stock_hold_batch_idx" ON "erp_private"."stock_holds" USING btree ("batch_id","date");
--> statement-breakpoint
REVOKE ALL ON erp_private.stock_holds,erp_private.stock_hold_releases FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE TRIGGER stock_holds_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.stock_holds FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER stock_releases_retained BEFORE DELETE OR TRUNCATE ON erp_private.stock_hold_releases FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_stock_hold() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b erp_private.stock_batches%ROWTYPE; h numeric;
BEGIN
  SELECT * INTO b FROM erp_private.stock_batches WHERE id=NEW.batch_id FOR UPDATE;
  SELECT coalesce(sum(x.quantity-coalesce((SELECT sum(r.quantity) FROM erp_private.stock_hold_releases r WHERE r.hold_id=x.id AND r.state='Posted'),0)),0) INTO h FROM erp_private.stock_holds x WHERE x.batch_id=b.id;
  IF b.id IS NULL OR b.condition<>'Saleable' OR NEW.quantity>b.quantity_available-h OR NEW.date<>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR
    b.received_date>NEW.date OR EXISTS(SELECT 1 FROM erp_private.opening_positions p WHERE p.id=b.opening_position_id AND p.as_of_date>NEW.date) OR
    NEW.value_bdt<>round(b.available_value_bdt*NEW.quantity/nullif(b.quantity_available,0),2) THEN
    RAISE EXCEPTION 'Hold requires current recognized physical stock and exact saved review value' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_hold_source BEFORE INSERT ON erp_private.stock_holds FOR EACH ROW EXECUTE FUNCTION erp_private.guard_stock_hold();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_stock_release() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE h erp_private.stock_holds%ROWTYPE; a erp_private.approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO h FROM erp_private.stock_holds WHERE id=NEW.hold_id;
  SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
  IF h.id IS NULL OR a.id IS NULL OR a.domain<>'Stock' OR a.resource_type<>'Stock Hold Release' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR
    a.amount_bdt<>NEW.value_bdt OR a.requested_by<>NEW.created_by OR NEW.quantity>h.quantity OR NEW.value_bdt<>round(h.value_bdt*NEW.quantity/h.quantity,2) OR
    length(btrim(NEW.reason))<5 OR length(btrim(NEW.proof_reference))<3 THEN
    RAISE EXCEPTION 'Release requires matching source, quantity and independent approval evidence' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Submitted' OR NEW.version<>1 OR NEW.date IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL OR a.state<>'Submitted' THEN RAISE EXCEPTION 'Releases start as immutable submitted sources' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state<>'Submitted' OR NEW.state<>'Posted' OR NEW.version<>OLD.version+1 OR
      (to_jsonb(NEW)-ARRAY['state','version','date','posted_by','posted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','date','posted_by','posted_at']) OR
      NEW.date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR a.state<>'Posted' THEN RAISE EXCEPTION 'Only independently approved unchanged releases can post today' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_release_source BEFORE INSERT OR UPDATE ON erp_private.stock_hold_releases FOR EACH ROW EXECUTE FUNCTION erp_private.guard_stock_release();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_stock_hold_balance() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bid text; q numeric; held numeric;
BEGIN
  IF TG_TABLE_NAME='stock_batches' THEN bid:=NEW.id;
  ELSIF TG_TABLE_NAME='stock_holds' THEN bid:=NEW.batch_id;
  ELSE SELECT batch_id INTO bid FROM erp_private.stock_holds WHERE id=NEW.hold_id; END IF;
  SELECT quantity_available INTO q FROM erp_private.stock_batches WHERE id=bid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM erp_private.stock_holds h WHERE h.batch_id=bid AND h.quantity<(SELECT coalesce(sum(r.quantity),0) FROM erp_private.stock_hold_releases r WHERE r.hold_id=h.id AND r.state='Posted')) THEN RAISE EXCEPTION 'Release exceeds its held quantity' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(h.quantity-coalesce((SELECT sum(r.quantity) FROM erp_private.stock_hold_releases r WHERE r.hold_id=h.id AND r.state='Posted'),0)),0) INTO held FROM erp_private.stock_holds h WHERE h.batch_id=bid;
  IF held<0 OR held>q THEN RAISE EXCEPTION 'Held stock is not dispatchable and cannot exceed physical units' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_batch_hold_balance AFTER UPDATE ON erp_private.stock_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_hold_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_hold_balance AFTER INSERT ON erp_private.stock_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_hold_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_release_balance AFTER INSERT OR UPDATE ON erp_private.stock_hold_releases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_hold_balance();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_stock_release_approval() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.state='Posted' AND NEW.resource_type='Stock Hold Release' AND NOT EXISTS(SELECT 1 FROM erp_private.stock_hold_releases WHERE id=NEW.resource_id AND approval_id=NEW.id AND state='Posted' AND payload_hash=NEW.payload_hash AND value_bdt=NEW.amount_bdt) THEN RAISE EXCEPTION 'Release approval must commit with its unchanged stock source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_release_approval_posted AFTER INSERT OR UPDATE ON erp_private.approval_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_release_approval();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_stock_control_date() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE latest date;
BEGIN
  IF NEW.type<>'Dispatch' THEN RETURN NEW; END IF;
  SELECT max(d) INTO latest FROM (SELECT h.date d FROM erp_private.stock_holds h WHERE h.batch_id=NEW.batch_id UNION ALL SELECT r.date d FROM erp_private.stock_hold_releases r JOIN erp_private.stock_holds h ON h.id=r.hold_id WHERE h.batch_id=NEW.batch_id AND r.state='Posted') control_dates;
  IF NEW.date<latest THEN RAISE EXCEPTION 'Dispatch cannot be backdated before the latest stock hold or release' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_control_chronology BEFORE INSERT ON erp_private.stock_movements FOR EACH ROW EXECUTE FUNCTION erp_private.guard_stock_control_date();
