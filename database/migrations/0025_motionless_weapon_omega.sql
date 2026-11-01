CREATE TABLE "erp_private"."opening_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"data" jsonb NOT NULL,
	"preview" jsonb,
	"preview_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"prepared_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opening_draft_state" CHECK ("erp_private"."opening_drafts"."state" in ('Draft','Validated','Previewed','Approved','Posted','Reconciled')),
	CONSTRAINT "opening_separate_approver" CHECK ("erp_private"."opening_drafts"."approved_by" is null or ("erp_private"."opening_drafts"."approved_by"<>"erp_private"."opening_drafts"."created_by" and "erp_private"."opening_drafts"."approved_by"<>"erp_private"."opening_drafts"."prepared_by")),
	CONSTRAINT "opening_approval_evidence" CHECK ("erp_private"."opening_drafts"."state" not in ('Approved','Posted','Reconciled') or ("erp_private"."opening_drafts"."approved_by" is not null and "erp_private"."opening_drafts"."preview_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."opening_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."opening_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"object_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"state" text DEFAULT 'Pending' NOT NULL,
	"sha256" text,
	"profile" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "opening_sources_object_path_unique" UNIQUE("object_path"),
	CONSTRAINT "opening_sources_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "opening_source_state" CHECK ("erp_private"."opening_sources"."state" in ('Pending','Ready') and ("erp_private"."opening_sources"."state"='Pending' or ("erp_private"."opening_sources"."sha256" is not null and "erp_private"."opening_sources"."profile" is not null))),
	CONSTRAINT "opening_source_size" CHECK ("erp_private"."opening_sources"."size_bytes" between 1 and 8388608)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."opening_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_drafts" ADD CONSTRAINT "opening_drafts_source_id_opening_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "erp_private"."opening_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_drafts" ADD CONSTRAINT "opening_drafts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_drafts" ADD CONSTRAINT "opening_drafts_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_drafts" ADD CONSTRAINT "opening_drafts_prepared_by_employees_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."opening_sources" ADD CONSTRAINT "opening_sources_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opening_draft_created_idx" ON "erp_private"."opening_drafts" USING btree ("created_at","id");
--> statement-breakpoint
REVOKE ALL ON erp_private.opening_sources, erp_private.opening_drafts FROM anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION erp_private.protect_opening_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Opening evidence is retained' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME = 'opening_sources' THEN
    IF TG_OP='UPDATE' AND OLD.state='Ready' THEN RAISE EXCEPTION 'Profiled sources are immutable' USING ERRCODE='23514'; END IF;
    IF NEW.state='Ready' AND (NEW.sha256 !~ '^[a-f0-9]{64}$' OR NEW.profile->>'sha256' IS DISTINCT FROM NEW.sha256) THEN
      RAISE EXCEPTION 'Source profile hash mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF TG_OP='INSERT' AND NEW.state<>'Draft' THEN RAISE EXCEPTION 'Openings start as drafts' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' THEN
      IF OLD.state IN ('Approved','Posted','Reconciled') THEN RAISE EXCEPTION 'Approved opening evidence is immutable' USING ERRCODE='23514'; END IF;
      IF NEW.source_id<>OLD.source_id OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 THEN
        RAISE EXCEPTION 'Opening identity or version changed illegally' USING ERRCODE='23514';
      END IF;
      IF NEW.state='Previewed' AND OLD.state<>'Validated' OR NEW.state='Approved' AND OLD.state<>'Previewed' THEN
        RAISE EXCEPTION 'Opening review stages cannot be skipped' USING ERRCODE='23514';
      END IF;
      IF NEW.state IN ('Posted','Reconciled') THEN RAISE EXCEPTION 'Opening posting is not enabled by this migration' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER opening_source_guard BEFORE INSERT OR UPDATE OR DELETE ON erp_private.opening_sources FOR EACH ROW EXECUTE FUNCTION erp_private.protect_opening_evidence();
--> statement-breakpoint
CREATE TRIGGER opening_draft_guard BEFORE INSERT OR UPDATE OR DELETE ON erp_private.opening_drafts FOR EACH ROW EXECUTE FUNCTION erp_private.protect_opening_evidence();
--> statement-breakpoint
CREATE TRIGGER opening_sources_retained BEFORE TRUNCATE ON erp_private.opening_sources FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
--> statement-breakpoint
CREATE TRIGGER opening_drafts_retained BEFORE TRUNCATE ON erp_private.opening_drafts FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
