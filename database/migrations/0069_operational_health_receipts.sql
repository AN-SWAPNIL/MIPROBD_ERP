CREATE TABLE "erp_private"."operational_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_check_values" CHECK ("erp_private"."operational_checks"."operation" in ('Invitations','Queue Health','Source Reconciliation') and "erp_private"."operational_checks"."status" in ('Passed','Failed') and jsonb_typeof("erp_private"."operational_checks"."summary")='object' and octet_length("erp_private"."operational_checks"."summary"::text)<=2048)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."operational_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "operational_check_latest_idx" ON "erp_private"."operational_checks" USING btree ("operation","created_at");
--> statement-breakpoint
REVOKE ALL ON erp_private.operational_checks FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION erp_private.guard_operational_check() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Operational check history is append-only' USING ERRCODE='55000'; END IF;
 IF NEW.summary-ARRAY['processed','providerAccepted','review','overdue','expiredLeases','stockMismatches','unbalancedJournals','invalidSourceLinks','approvalHistoryGaps','invalidHeldQuantities','negativeCashAccounts']<>'{}'::jsonb OR
  EXISTS(SELECT 1 FROM jsonb_each(NEW.summary) e WHERE (e.key='providerAccepted' AND jsonb_typeof(e.value)<>'boolean') OR (e.key<>'providerAccepted' AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$'))) THEN RAISE EXCEPTION 'Operational history accepts only sanitized counters, never identities or credentials' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER operational_check_history BEFORE INSERT OR UPDATE OR DELETE ON erp_private.operational_checks FOR EACH ROW EXECUTE FUNCTION erp_private.guard_operational_check();
