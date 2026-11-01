CREATE TABLE "erp_private"."stock_condition_events" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"condition" text DEFAULT 'Saleable' NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_condition_events_line_id_unique" UNIQUE("line_id"),
	CONSTRAINT "stock_condition_release" CHECK ("erp_private"."stock_condition_events"."condition"='Saleable')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_condition_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_control_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"control_id" text NOT NULL,
	"position" integer NOT NULL,
	"batch_id" text NOT NULL,
	"hold_id" text,
	"book_quantity" numeric(18, 4) NOT NULL,
	"counted_quantity" numeric(18, 4) NOT NULL,
	"delta_quantity" numeric(18, 4) NOT NULL,
	"book_value_bdt" numeric(24, 2) NOT NULL,
	"value_bdt" numeric(24, 2),
	"held_quantity" numeric(18, 4) NOT NULL,
	"unit_cost_bdt" numeric(28, 10),
	"surplus_condition" text,
	"fingerprint" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "stock_control_line_values" CHECK ("erp_private"."stock_control_lines"."book_quantity">=0 and "erp_private"."stock_control_lines"."counted_quantity">=0 and "erp_private"."stock_control_lines"."book_value_bdt">=0 and ("erp_private"."stock_control_lines"."value_bdt" is null or "erp_private"."stock_control_lines"."value_bdt">=0) and "erp_private"."stock_control_lines"."delta_quantity"="erp_private"."stock_control_lines"."counted_quantity"-"erp_private"."stock_control_lines"."book_quantity" and "erp_private"."stock_control_lines"."held_quantity">=0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_control_postings" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"movement_id" text,
	"date" date NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "stock_control_postings_line_id_unique" UNIQUE("line_id"),
	CONSTRAINT "stock_control_postings_movement_id_unique" UNIQUE("movement_id")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_postings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_controls" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"count_date" date NOT NULL,
	"reason" text NOT NULL,
	"inspection" text NOT NULL,
	"proof_reference" text NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"total_bdt" numeric(24, 2),
	"payload_hash" text NOT NULL,
	"preparer_ids" jsonb NOT NULL,
	"revision_of_id" text,
	"approval_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_date" date,
	"posted_by" text,
	"posted_at" timestamp with time zone,
	CONSTRAINT "stock_controls_number_unique" UNIQUE("number"),
	CONSTRAINT "stock_controls_revision_of_id_unique" UNIQUE("revision_of_id"),
	CONSTRAINT "stock_controls_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "stock_control_state" CHECK ("erp_private"."stock_controls"."kind" in ('Physical Count','Write-off','Condition Release') and "erp_private"."stock_controls"."state" in ('Draft','Submitted','Posted','Superseded') and "erp_private"."stock_controls"."version">0 and ("erp_private"."stock_controls"."total_bdt" is null or "erp_private"."stock_controls"."total_bdt">=0) and ("erp_private"."stock_controls"."state"<>'Posted' or ("erp_private"."stock_controls"."posted_date" is not null and "erp_private"."stock_controls"."posted_by" is not null and "erp_private"."stock_controls"."posted_at" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."stock_hold_writeoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"hold_id" text NOT NULL,
	"line_id" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "stock_hold_writeoffs_line_id_unique" UNIQUE("line_id"),
	CONSTRAINT "stock_writeoff_positive" CHECK ("erp_private"."stock_hold_writeoffs"."quantity">0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_writeoffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" DROP CONSTRAINT "batch_source";--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD COLUMN "correction_line_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_condition_events" ADD CONSTRAINT "stock_condition_events_line_id_stock_control_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "erp_private"."stock_control_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_condition_events" ADD CONSTRAINT "stock_condition_events_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_lines" ADD CONSTRAINT "stock_control_lines_control_id_stock_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "erp_private"."stock_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_lines" ADD CONSTRAINT "stock_control_lines_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_lines" ADD CONSTRAINT "stock_control_lines_hold_id_stock_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "erp_private"."stock_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_postings" ADD CONSTRAINT "stock_control_postings_line_id_stock_control_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "erp_private"."stock_control_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_postings" ADD CONSTRAINT "stock_control_postings_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "erp_private"."stock_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_postings" ADD CONSTRAINT "stock_control_postings_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "erp_private"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_control_postings" ADD CONSTRAINT "stock_control_postings_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_controls" ADD CONSTRAINT "stock_controls_revision_of_id_stock_controls_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "erp_private"."stock_controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_controls" ADD CONSTRAINT "stock_controls_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_controls" ADD CONSTRAINT "stock_controls_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_controls" ADD CONSTRAINT "stock_controls_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_writeoffs" ADD CONSTRAINT "stock_hold_writeoffs_hold_id_stock_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "erp_private"."stock_holds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_hold_writeoffs" ADD CONSTRAINT "stock_hold_writeoffs_line_id_stock_control_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "erp_private"."stock_control_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_condition_batch_idx" ON "erp_private"."stock_condition_events" USING btree ("batch_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_control_batch_unique" ON "erp_private"."stock_control_lines" USING btree ("control_id","batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_control_line_position_unique" ON "erp_private"."stock_control_lines" USING btree ("control_id","position");--> statement-breakpoint
CREATE INDEX "stock_control_state_idx" ON "erp_private"."stock_controls" USING btree ("state","count_date","id");--> statement-breakpoint
CREATE INDEX "stock_writeoff_hold_idx" ON "erp_private"."stock_hold_writeoffs" USING btree ("hold_id","date");
--> statement-breakpoint
REVOKE ALL ON erp_private.stock_controls,erp_private.stock_control_lines,erp_private.stock_control_postings,erp_private.stock_hold_writeoffs,erp_private.stock_condition_events FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['stock_control_lines','stock_control_postings','stock_hold_writeoffs','stock_condition_events'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON erp_private.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change()',t||'_append_only',t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_controls_retained BEFORE DELETE OR TRUNCATE ON erp_private.stock_controls FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE FUNCTION erp_private.stock_effective_condition(bid text,through_date date) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce((SELECT e.condition FROM erp_private.stock_condition_events e WHERE e.batch_id=b.id AND e.date<=through_date ORDER BY e.date DESC,e.created_at DESC,e.id DESC LIMIT 1),b.condition) FROM erp_private.stock_batches b WHERE b.id=bid
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.stock_hold_outstanding(hid text,through_date date) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT h.quantity-coalesce((SELECT sum(r.quantity) FROM erp_private.stock_hold_releases r WHERE r.hold_id=h.id AND r.state='Posted' AND r.date<=through_date),0)-coalesce((SELECT sum(w.quantity) FROM erp_private.stock_hold_writeoffs w WHERE w.hold_id=h.id AND w.date<=through_date),0) FROM erp_private.stock_holds h WHERE h.id=hid AND h.date<=through_date
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.stock_held_quantity(bid text,through_date date) RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce(sum(erp_private.stock_hold_outstanding(h.id,through_date)),0) FROM erp_private.stock_holds h WHERE h.batch_id=bid AND h.date<=through_date
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.stock_last_control_date(bid text) RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT max(d) FROM (SELECT h.date d FROM erp_private.stock_holds h WHERE h.batch_id=bid UNION ALL SELECT r.date FROM erp_private.stock_hold_releases r JOIN erp_private.stock_holds h ON h.id=r.hold_id WHERE h.batch_id=bid AND r.state='Posted' UNION ALL SELECT p.date FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE l.batch_id=bid OR p.batch_id=bid) controls
$$;
--> statement-breakpoint
CREATE FUNCTION erp_private.stock_control_fingerprint(bid text) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT md5(concat_ws('|',b.id,b.quantity_available::text,b.available_value_bdt::text,erp_private.stock_effective_condition(b.id,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date),
    (SELECT string_agg(m.id,',' ORDER BY m.id) FROM erp_private.stock_movements m WHERE m.batch_id=b.id),
    (SELECT string_agg(h.id,',' ORDER BY h.id) FROM erp_private.stock_holds h WHERE h.batch_id=b.id),
    (SELECT string_agg(r.id,',' ORDER BY r.id) FROM erp_private.stock_hold_releases r JOIN erp_private.stock_holds h ON h.id=r.hold_id WHERE h.batch_id=b.id AND r.state='Posted'),
    (SELECT string_agg(p.id,',' ORDER BY p.id) FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE l.batch_id=b.id OR p.batch_id=b.id))) FROM erp_private.stock_batches b WHERE b.id=bid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_stock_hold() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b erp_private.stock_batches%ROWTYPE; d date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  SELECT * INTO b FROM erp_private.stock_batches WHERE id=NEW.batch_id FOR UPDATE;
  IF b.id IS NULL OR erp_private.stock_effective_condition(b.id,d)<>'Saleable' OR NEW.quantity>b.quantity_available-erp_private.stock_held_quantity(b.id,d) OR NEW.date<>d OR b.received_date>NEW.date OR
    EXISTS(SELECT 1 FROM erp_private.opening_positions p WHERE p.id=b.opening_position_id AND p.as_of_date>NEW.date) OR NEW.value_bdt<>round(b.available_value_bdt*NEW.quantity/nullif(b.quantity_available,0),2) THEN RAISE EXCEPTION 'Hold requires current recognized physical stock and exact saved review value' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.verify_stock_hold_balance() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bid text; q numeric; held numeric; d date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  IF TG_TABLE_NAME='stock_batches' THEN bid:=NEW.id; ELSIF TG_TABLE_NAME='stock_holds' THEN bid:=NEW.batch_id; ELSE SELECT batch_id INTO bid FROM erp_private.stock_holds WHERE id=NEW.hold_id; END IF;
  SELECT quantity_available INTO q FROM erp_private.stock_batches WHERE id=bid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM erp_private.stock_holds h WHERE h.batch_id=bid AND erp_private.stock_hold_outstanding(h.id,d)<0) THEN RAISE EXCEPTION 'Release or write-off exceeds its held quantity' USING ERRCODE='23514'; END IF;
  held:=erp_private.stock_held_quantity(bid,d);
  IF held<0 OR held>q THEN RAISE EXCEPTION 'Held stock is not dispatchable and cannot exceed physical units' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_writeoff_hold_balance AFTER INSERT ON erp_private.stock_hold_writeoffs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_hold_balance();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp_private.guard_stock_control_date() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.type='Dispatch' AND NEW.date<erp_private.stock_last_control_date(NEW.batch_id) THEN RAISE EXCEPTION 'Dispatch cannot be backdated before the latest stock condition/count control' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_stock_control_header() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.approval_requests%ROWTYPE; p_state text; l erp_private.stock_control_lines%ROWTYPE;
BEGIN
  IF NEW.payload_hash !~ '^[a-f0-9]{64}$' OR NOT (NEW.preparer_ids ? NEW.created_by) OR NEW.count_date>(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date OR length(btrim(NEW.reason))<5 OR length(btrim(NEW.inspection))<5 OR length(btrim(NEW.proof_reference))<3 THEN RAISE EXCEPTION 'Stock controls require explicit inspection, source and preparer evidence' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' OR NEW.version<>1 OR NEW.approval_id IS NOT NULL OR NEW.posted_date IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'Stock controls start as unposted drafts' USING ERRCODE='23514'; END IF;
    IF NEW.revision_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.stock_controls o WHERE o.id=NEW.revision_of_id AND o.state='Superseded' AND o.kind=NEW.kind AND NEW.preparer_ids @> o.preparer_ids) THEN RAISE EXCEPTION 'A linked revision retains all earlier preparers' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.state IN ('Posted','Superseded') OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','approval_id','posted_date','posted_by','posted_at']) OR NOT ((OLD.state='Draft' AND NEW.state IN ('Submitted','Superseded')) OR (OLD.state='Submitted' AND NEW.state IN ('Posted','Superseded'))) THEN RAISE EXCEPTION 'Stock source content is immutable; use a linked reviewed revision' USING ERRCODE='23514'; END IF;
    IF OLD.state='Submitted' AND NEW.approval_id IS DISTINCT FROM OLD.approval_id THEN RAISE EXCEPTION 'Submitted approval identity is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state IN ('Submitted','Posted') AND NEW.approval_id IS NULL THEN RAISE EXCEPTION 'Submitted sources require approval identity' USING ERRCODE='23514'; END IF;
    IF NEW.approval_id IS NOT NULL THEN
      SELECT * INTO a FROM erp_private.approval_requests WHERE id=NEW.approval_id;
      IF a.id IS NULL OR a.domain<>'Stock' OR a.resource_type<>'Stock Control' OR a.resource_id<>NEW.id OR a.payload_hash<>NEW.payload_hash OR a.amount_bdt IS DISTINCT FROM NEW.total_bdt OR a.context->'excludedActorIds' IS DISTINCT FROM NEW.preparer_ids THEN RAISE EXCEPTION 'Stock source and approval snapshot must agree' USING ERRCODE='23514'; END IF;
      IF NEW.state='Posted' AND (a.state<>'Posted' OR NEW.preparer_ids ? a.verified_by OR NEW.preparer_ids ? a.approved_by) THEN RAISE EXCEPTION 'All source preparers are excluded from independent decisions' USING ERRCODE='23514'; END IF;
      IF NEW.state='Superseded' THEN SELECT state INTO p_state FROM erp_private.approval_policies WHERE id=a.policy_id; IF a.state<>'Rejected' AND p_state='Approved' THEN RAISE EXCEPTION 'Reject an active request before revising' USING ERRCODE='23514'; END IF; END IF;
    END IF;
    IF NEW.state IN ('Submitted','Posted') THEN
      IF NEW.total_bdt IS NULL THEN RAISE EXCEPTION 'Unknown surplus costs block submission' USING ERRCODE='23514'; END IF;
      FOR l IN SELECT * FROM erp_private.stock_control_lines WHERE control_id=NEW.id LOOP
        PERFORM 1 FROM erp_private.stock_batches WHERE id=l.batch_id FOR UPDATE;
        IF erp_private.stock_control_fingerprint(l.batch_id) IS DISTINCT FROM l.fingerprint OR l.value_bdt IS NULL OR (l.delta_quantity>0 AND l.surplus_condition IS NULL) OR (NEW.kind='Physical Count' AND l.counted_quantity<l.held_quantity) THEN RAISE EXCEPTION 'Stale or incomplete physical snapshots require a new reviewed revision' USING ERRCODE='23514'; END IF;
      END LOOP;
    END IF;
    IF NEW.state='Posted' AND NEW.posted_date IS DISTINCT FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date THEN RAISE EXCEPTION 'Stock corrections post on the current business date' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_control_header BEFORE INSERT OR UPDATE ON erp_private.stock_controls FOR EACH ROW EXECUTE FUNCTION erp_private.guard_stock_control_header();
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_stock_control_line() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b erp_private.stock_batches%ROWTYPE; c erp_private.stock_controls%ROWTYPE; value numeric; d date:=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date;
BEGIN
  SELECT * INTO c FROM erp_private.stock_controls WHERE id=NEW.control_id;
  SELECT * INTO b FROM erp_private.stock_batches WHERE id=NEW.batch_id FOR UPDATE;
  IF c.id IS NULL OR c.state<>'Draft' OR b.id IS NULL OR NEW.book_quantity<>b.quantity_available OR NEW.book_value_bdt<>b.available_value_bdt OR NEW.fingerprint IS DISTINCT FROM erp_private.stock_control_fingerprint(b.id) OR NEW.held_quantity<>erp_private.stock_held_quantity(b.id,d) OR
    NEW.snapshot->>'productId' IS DISTINCT FROM b.product_id OR NEW.snapshot->>'batchNumber' IS DISTINCT FROM b.batch_number OR NEW.snapshot->>'lotNumber' IS DISTINCT FROM b.lot_number OR (NEW.snapshot->>'originalQuantity')::numeric IS DISTINCT FROM b.quantity_received OR (NEW.snapshot->>'originalValueBdt')::numeric IS DISTINCT FROM b.received_value_bdt OR NEW.snapshot->>'condition' IS DISTINCT FROM erp_private.stock_effective_condition(b.id,d) OR
    c.count_date<greatest(b.received_date,coalesce((SELECT max(date) FROM erp_private.stock_movements WHERE batch_id=b.id),b.received_date),coalesce(erp_private.stock_last_control_date(b.id),b.received_date)) THEN RAISE EXCEPTION 'Stock control lines must capture the actual current source snapshot' USING ERRCODE='23514'; END IF;
  value:=CASE WHEN NEW.delta_quantity<0 THEN round(b.received_value_bdt*(b.quantity_received-b.quantity_available-NEW.delta_quantity)/b.quantity_received,2)-(b.received_value_bdt-b.available_value_bdt) WHEN NEW.delta_quantity>0 THEN round(NEW.delta_quantity*NEW.unit_cost_bdt,2) ELSE 0 END;
  IF NEW.value_bdt IS DISTINCT FROM value OR (NEW.unit_cost_bdt IS NOT NULL AND NEW.unit_cost_bdt<0) OR (NEW.surplus_condition IS NOT NULL AND NEW.surplus_condition NOT IN ('Saleable','Quarantine','Damaged','Expired')) THEN RAISE EXCEPTION 'Variance value must use saved cumulative cost or explicit approved surplus cost' USING ERRCODE='23514'; END IF;
  IF c.kind='Physical Count' AND NEW.hold_id IS NOT NULL THEN RAISE EXCEPTION 'Counts do not silently dispose of held units' USING ERRCODE='23514'; END IF;
  IF c.kind='Write-off' AND (NEW.delta_quantity>=0 OR (NEW.hold_id IS NULL AND erp_private.stock_effective_condition(b.id,d)='Saleable') OR (NEW.hold_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.stock_holds h WHERE h.id=NEW.hold_id AND h.batch_id=b.id AND erp_private.stock_hold_outstanding(h.id,d)>=-NEW.delta_quantity))) THEN RAISE EXCEPTION 'Write-off requires currently quarantined/damaged stock or its explicit partial hold' USING ERRCODE='23514'; END IF;
  IF c.kind='Condition Release' AND (NEW.delta_quantity<>0 OR NEW.value_bdt<>0 OR NEW.hold_id IS NOT NULL OR b.quantity_available<=0 OR b.expiry_date<d OR erp_private.stock_effective_condition(b.id,d)='Saleable') THEN RAISE EXCEPTION 'Condition release cannot change quantity, cost or expiry' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_control_line_source BEFORE INSERT ON erp_private.stock_control_lines FOR EACH ROW EXECUTE FUNCTION erp_private.guard_stock_control_line();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_stock_control_posting() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cid text; c erp_private.stock_controls%ROWTYPE; l erp_private.stock_control_lines%ROWTYPE; p erp_private.stock_control_postings%ROWTYPE; b erp_private.stock_batches%ROWTYPE; m erp_private.stock_movements%ROWTYPE; amount numeric; n integer; expected numeric;
BEGIN
  IF TG_TABLE_NAME='stock_controls' THEN cid:=NEW.id;
  ELSIF TG_TABLE_NAME='stock_control_lines' THEN cid:=NEW.control_id;
  ELSIF TG_TABLE_NAME='stock_control_postings' OR TG_TABLE_NAME='stock_hold_writeoffs' OR TG_TABLE_NAME='stock_condition_events' THEN SELECT control_id INTO cid FROM erp_private.stock_control_lines WHERE id=NEW.line_id;
  ELSIF TG_TABLE_NAME='stock_batches' THEN IF NEW.correction_line_id IS NULL THEN RETURN NULL; END IF; SELECT control_id INTO cid FROM erp_private.stock_control_lines WHERE id=NEW.correction_line_id;
  ELSE IF NEW.type<>'Adjustment' THEN RETURN NULL; END IF; SELECT l.control_id INTO cid FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE p.movement_id=NEW.id; IF cid IS NULL THEN RAISE EXCEPTION 'Adjustment needs an independently approved physical source' USING ERRCODE='23514'; END IF; END IF;
  SELECT * INTO c FROM erp_private.stock_controls WHERE id=cid;
  SELECT count(*),CASE WHEN count(*) FILTER(WHERE value_bdt IS NULL)>0 THEN NULL ELSE sum(CASE WHEN c.kind='Condition Release' THEN book_value_bdt ELSE value_bdt END) END INTO n,amount FROM erp_private.stock_control_lines WHERE control_id=cid;
  IF c.id IS NULL OR n<1 OR n>50 OR amount IS DISTINCT FROM c.total_bdt THEN RAISE EXCEPTION 'Stock source lines and approval amount must reconcile' USING ERRCODE='23514'; END IF;
  IF c.state<>'Posted' THEN
    IF EXISTS(SELECT 1 FROM erp_private.stock_control_postings p JOIN erp_private.stock_control_lines l ON l.id=p.line_id WHERE l.control_id=cid) OR EXISTS(SELECT 1 FROM erp_private.stock_batches b JOIN erp_private.stock_control_lines l ON l.id=b.correction_line_id WHERE l.control_id=cid) THEN RAISE EXCEPTION 'Unposted drafts cannot change stock or condition' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM erp_private.approval_requests a WHERE a.id=c.approval_id AND a.state='Posted' AND a.resource_type='Stock Control' AND a.resource_id=c.id AND a.payload_hash=c.payload_hash AND a.amount_bdt=c.total_bdt AND NOT(c.preparer_ids ? a.verified_by) AND NOT(c.preparer_ids ? a.approved_by)) THEN RAISE EXCEPTION 'Posted stock sources require independent exact approval' USING ERRCODE='23514'; END IF;
  FOR l IN SELECT * FROM erp_private.stock_control_lines WHERE control_id=cid LOOP
    SELECT * INTO p FROM erp_private.stock_control_postings WHERE line_id=l.id;
    IF p.id IS NULL OR p.date<>c.posted_date OR p.created_by<>c.posted_by THEN RAISE EXCEPTION 'Every stock line needs a matching atomic posting' USING ERRCODE='23514'; END IF;
    SELECT * INTO b FROM erp_private.stock_batches WHERE id=p.batch_id;
    IF l.delta_quantity>0 THEN
      IF b.correction_line_id IS DISTINCT FROM l.id OR b.product_id<>l.snapshot->>'productId' OR b.quantity_received<>l.delta_quantity OR b.received_value_bdt<>l.value_bdt OR b.landed_cost_per_unit<>l.unit_cost_bdt OR b.condition<>l.surplus_condition OR b.lot_number<>l.snapshot->>'lotNumber' OR b.manufacturing_date<>(l.snapshot->>'manufacturingDate')::date OR b.expiry_date<>(l.snapshot->>'expiryDate')::date OR b.received_date<>c.count_date OR b.source_reference<>c.number OR b.warehouse<>l.snapshot->>'warehouse' OR b.location<>l.snapshot->>'location' THEN RAISE EXCEPTION 'Surplus batch must inherit its independently approved count/cost source' USING ERRCODE='23514'; END IF;
    ELSIF p.batch_id<>l.batch_id THEN RAISE EXCEPTION 'Loss/release must reference the original batch' USING ERRCODE='23514'; END IF;
    IF l.delta_quantity=0 THEN IF p.movement_id IS NOT NULL THEN RAISE EXCEPTION 'A zero variance does not create a quantity movement' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO m FROM erp_private.stock_movements WHERE id=p.movement_id;
      IF m.id IS NULL OR m.type<>'Adjustment' OR m.batch_id<>p.batch_id OR m.quantity_delta<>l.delta_quantity OR m.value_bdt<>l.value_bdt OR m.date<>p.date OR m.reference<>c.number OR m.created_by<>c.posted_by THEN RAISE EXCEPTION 'Stock correction journal differs from its approved source' USING ERRCODE='23514'; END IF;
    END IF;
    expected:=CASE WHEN c.kind='Write-off' AND l.hold_id IS NOT NULL THEN 1 ELSE 0 END;
    IF (SELECT count(*) FROM erp_private.stock_hold_writeoffs WHERE line_id=l.id)<>expected OR (expected=1 AND NOT EXISTS(SELECT 1 FROM erp_private.stock_hold_writeoffs w WHERE w.line_id=l.id AND w.hold_id=l.hold_id AND w.quantity=-l.delta_quantity AND w.date=c.posted_date)) THEN RAISE EXCEPTION 'Held write-off must dispose, not release, its exact units' USING ERRCODE='23514'; END IF;
    expected:=CASE WHEN c.kind='Condition Release' THEN 1 ELSE 0 END;
    IF (SELECT count(*) FROM erp_private.stock_condition_events WHERE line_id=l.id)<>expected OR (expected=1 AND NOT EXISTS(SELECT 1 FROM erp_private.stock_condition_events e WHERE e.line_id=l.id AND e.batch_id=l.batch_id AND e.date=c.posted_date AND e.condition='Saleable')) THEN RAISE EXCEPTION 'Condition release needs its exact dated immutable event' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_control_balance AFTER INSERT OR UPDATE ON erp_private.stock_controls DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_control_lines_balance AFTER INSERT ON erp_private.stock_control_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_control_journal_source AFTER INSERT ON erp_private.stock_control_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_control_surplus_source AFTER INSERT ON erp_private.stock_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_adjustment_source AFTER INSERT ON erp_private.stock_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_disposal_source AFTER INSERT ON erp_private.stock_hold_writeoffs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_condition_source AFTER INSERT ON erp_private.stock_condition_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_posting();
--> statement-breakpoint
CREATE FUNCTION erp_private.verify_stock_control_approval() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.state='Posted' AND NEW.resource_type='Stock Control' AND NOT EXISTS(SELECT 1 FROM erp_private.stock_controls c WHERE c.id=NEW.resource_id AND c.approval_id=NEW.id AND c.state='Posted' AND c.payload_hash=NEW.payload_hash AND c.total_bdt=NEW.amount_bdt) THEN RAISE EXCEPTION 'Stock approval must post atomically with its unchanged source' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_control_approval_source AFTER INSERT OR UPDATE ON erp_private.approval_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.verify_stock_control_approval();
--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_correction_line_id_stock_control_lines_id_fk" FOREIGN KEY ("correction_line_id") REFERENCES "erp_private"."stock_control_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "stock_batches_correction_line_id_unique" UNIQUE("correction_line_id");--> statement-breakpoint
ALTER TABLE "erp_private"."stock_batches" ADD CONSTRAINT "batch_source" CHECK (("erp_private"."stock_batches"."opening_position_id" is not null and "erp_private"."stock_batches"."receipt_line_id" is null and "erp_private"."stock_batches"."source_import_id" is null and "erp_private"."stock_batches"."correction_line_id" is null) or ("erp_private"."stock_batches"."opening_position_id" is null and "erp_private"."stock_batches"."receipt_line_id" is not null and "erp_private"."stock_batches"."source_import_id" is not null and "erp_private"."stock_batches"."correction_line_id" is null) or ("erp_private"."stock_batches"."correction_line_id" is not null and "erp_private"."stock_batches"."opening_position_id" is null and "erp_private"."stock_batches"."receipt_line_id" is null and "erp_private"."stock_batches"."source_import_id" is null));
