CREATE TABLE "erp_private"."business_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."business_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."cost_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preset_explicit_allocation" CHECK ("erp_private"."cost_presets"."data"->>'requiresExplicitChoice'='true')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."cost_presets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."warehouse_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_singleton" CHECK ("erp_private"."warehouse_settings"."id"='main' and "erp_private"."warehouse_settings"."data"->>'id'='main' and "erp_private"."warehouse_settings"."data"->>'name'='Main Warehouse' and "erp_private"."warehouse_settings"."data"->>'active'='true')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."business_decisions" ADD CONSTRAINT "business_decisions_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."cost_presets" ADD CONSTRAINT "cost_presets_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."warehouse_settings" ADD CONSTRAINT "warehouse_settings_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_preset_name_unique" ON "erp_private"."cost_presets" USING btree (lower(btrim("data"->>'name')));
--> statement-breakpoint
REVOKE ALL ON erp_private.warehouse_settings, erp_private.cost_presets, erp_private.business_decisions FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
INSERT INTO erp_private.warehouse_settings(id,data) VALUES ('main','{"id":"main","name":"Main Warehouse","address":"","contactPerson":"","phone":"","locations":[],"active":true}');
--> statement-breakpoint
INSERT INTO erp_private.business_decisions(id,data)
SELECT id,jsonb_build_object('title',title,'question',question,'currentBehavior',behavior,'blocks',blocks,'sourceReference','Production backend roadmap / simplified plan','status','Pending Client Confirmation','resolutionValue','','resolutionNotes','','confirmedBy',null,'confirmedAt',null)
FROM (VALUES
 ('opening-reconciliation','Opening balances and cutover','Who signs off opening stock, receivables, supplier balances and cash/bank?','No opening values are invented. Balance Sheet remains unavailable.',jsonb_build_array('Opening-data import','Balance Sheet','Production cutover')),
 ('rejected-goods','Rejected goods and returns','How are rejected goods, supplier claims, returns and stock corrections approved?','Rejected quantities are recorded separately; no automatic claim, loss or return posting.',jsonb_build_array('Returns','Stock adjustments','Rejected-goods valuation')),
 ('cost-allocation','Common import cost allocation','Which allocation basis should be suggested for each common cost?','Every cost row requires an explicit choice. Presets never silently allocate.',jsonb_build_array('Approved preset suggestions')),
 ('cost-authority','Landed-cost authority','Who may finalize or reopen landed cost?','Super Admin remains the temporary sole finalizer/reopener.',jsonb_build_array('Delegated landed-cost approval')),
 ('finance-dates','Backdated financial postings','What financial periods and backdating policy should be enforced?','Existing chronological cash controls and immutable dated reversals remain in force.',jsonb_build_array('Historical finance migration','Closed-period controls'))
) AS reference(id,title,question,behavior,blocks);
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_operational_setting() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Settings history cannot be deleted' USING ERRCODE='55000'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.version<>OLD.version+1 OR NEW.updated_by IS NULL THEN
  RAISE EXCEPTION 'Setting updates require a stable identity, actor and next version' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER warehouse_setting_guard BEFORE UPDATE OR DELETE ON erp_private.warehouse_settings FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operational_setting();
--> statement-breakpoint
CREATE TRIGGER cost_preset_guard BEFORE UPDATE OR DELETE ON erp_private.cost_presets FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operational_setting();
--> statement-breakpoint
CREATE TRIGGER business_decision_guard BEFORE UPDATE OR DELETE ON erp_private.business_decisions FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operational_setting();
