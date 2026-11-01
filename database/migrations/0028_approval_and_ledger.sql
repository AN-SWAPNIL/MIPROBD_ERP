CREATE TABLE "erp_private"."approval_events" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."approval_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."approval_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"data" jsonb NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_policy_state" CHECK ("erp_private"."approval_policies"."state" in ('Draft','Approved','Retired') and ("erp_private"."approval_policies"."approved_by" is null or "erp_private"."approval_policies"."approved_by"<>"erp_private"."approval_policies"."created_by"))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."approval_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"reference" text NOT NULL,
	"payload_hash" text NOT NULL,
	"amount_bdt" numeric(24, 2) NOT NULL,
	"policy_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"policy" jsonb NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"requested_by" text NOT NULL,
	"verified_by" text,
	"approved_by" text,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_request_state" CHECK ("erp_private"."approval_requests"."state" in ('Submitted','Verified','Approved','Rejected','Posted') and "erp_private"."approval_requests"."amount_bdt">=0 and ("erp_private"."approval_requests"."approved_by" is null or ("erp_private"."approval_requests"."approved_by"<>"erp_private"."approval_requests"."requested_by" and ("erp_private"."approval_requests"."policy"->>'independentVerifier'<>'true' or "erp_private"."approval_requests"."approved_by"<>"erp_private"."approval_requests"."verified_by"))))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "ledger_account_kind" CHECK ("erp_private"."ledger_accounts"."kind" in ('Asset','Liability','Equity','Income','Expense'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."ledger_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_configuration_state" CHECK ("erp_private"."ledger_configurations"."state" in ('Draft','Approved','Retired') and ("erp_private"."ledger_configurations"."approved_by" is null or "erp_private"."ledger_configurations"."approved_by"<>"erp_private"."ledger_configurations"."created_by"))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_configurations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."ledger_journals" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"reference" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"total_bdt" numeric(24, 2) NOT NULL,
	"proof_reference" text NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"approval_id" text,
	"source_key" text,
	"configuration_id" text,
	"reversal_of_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"posted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "ledger_journals_number_unique" UNIQUE("number"),
	CONSTRAINT "ledger_journals_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "ledger_journals_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "ledger_journals_reversal_of_id_unique" UNIQUE("reversal_of_id"),
	CONSTRAINT "ledger_journal_state" CHECK ("erp_private"."ledger_journals"."state" in ('Draft','Submitted','Posted','Rejected') and "erp_private"."ledger_journals"."total_bdt">0 and ("erp_private"."ledger_journals"."state"<>'Posted' or ("erp_private"."ledger_journals"."posted_by" is not null and "erp_private"."ledger_journals"."posted_at" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."ledger_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_id" text NOT NULL,
	"account_id" text NOT NULL,
	"position" integer NOT NULL,
	"debit" numeric(24, 2) NOT NULL,
	"credit" numeric(24, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "ledger_line_one_side" CHECK (("erp_private"."ledger_lines"."debit">0 and "erp_private"."ledger_lines"."credit"=0) or ("erp_private"."ledger_lines"."credit">0 and "erp_private"."ledger_lines"."debit"=0))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."ledger_periods" (
	"id" text PRIMARY KEY NOT NULL,
	"through_date" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."ledger_source_events" (
	"id" text PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"date" date NOT NULL,
	"reference" text NOT NULL,
	"description" text NOT NULL,
	"plan" jsonb NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'Deferred' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"journal_id" text,
	"configuration_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_source_events_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "ledger_source_events_journal_id_unique" UNIQUE("journal_id"),
	CONSTRAINT "ledger_event_state" CHECK ("erp_private"."ledger_source_events"."state" in ('Deferred','Posted','Excluded') and ("erp_private"."ledger_source_events"."state"<>'Posted' or ("erp_private"."ledger_source_events"."journal_id" is not null and "erp_private"."ledger_source_events"."configuration_id" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_source_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_events" ADD CONSTRAINT "approval_events_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_events" ADD CONSTRAINT "approval_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_policies" ADD CONSTRAINT "approval_policies_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_policies" ADD CONSTRAINT "approval_policies_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD CONSTRAINT "approval_requests_policy_id_approval_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "erp_private"."approval_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD CONSTRAINT "approval_requests_requested_by_employees_id_fk" FOREIGN KEY ("requested_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD CONSTRAINT "approval_requests_verified_by_employees_id_fk" FOREIGN KEY ("verified_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."approval_requests" ADD CONSTRAINT "approval_requests_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_accounts" ADD CONSTRAINT "ledger_accounts_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_configurations" ADD CONSTRAINT "ledger_configurations_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_configurations" ADD CONSTRAINT "ledger_configurations_approved_by_employees_id_fk" FOREIGN KEY ("approved_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journals_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journals_configuration_id_ledger_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "erp_private"."ledger_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journals_reversal_of_id_ledger_journals_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "erp_private"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journals_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_journals" ADD CONSTRAINT "ledger_journals_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_lines" ADD CONSTRAINT "ledger_lines_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "erp_private"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_lines" ADD CONSTRAINT "ledger_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_periods" ADD CONSTRAINT "ledger_periods_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_source_events" ADD CONSTRAINT "ledger_source_events_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "erp_private"."ledger_journals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_source_events" ADD CONSTRAINT "ledger_source_events_configuration_id_ledger_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "erp_private"."ledger_configurations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."ledger_source_events" ADD CONSTRAINT "ledger_source_events_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_events_idx" ON "erp_private"."approval_events" USING btree ("approval_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_one_policy_per_domain" ON "erp_private"."approval_policies" USING btree ("domain") WHERE "erp_private"."approval_policies"."state"='Approved';--> statement-breakpoint
CREATE UNIQUE INDEX "approval_resource_once" ON "erp_private"."approval_requests" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "approval_pending_idx" ON "erp_private"."approval_requests" USING btree ("domain","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_account_code_unique" ON "erp_private"."ledger_accounts" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_configuration" ON "erp_private"."ledger_configurations" USING btree ("state") WHERE "erp_private"."ledger_configurations"."state"='Approved';--> statement-breakpoint
CREATE INDEX "ledger_posted_date_idx" ON "erp_private"."ledger_journals" USING btree ("state","date","id");--> statement-breakpoint
CREATE INDEX "ledger_line_account_idx" ON "erp_private"."ledger_lines" USING btree ("account_id","journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_line_position_unique" ON "erp_private"."ledger_lines" USING btree ("journal_id","position");--> statement-breakpoint
CREATE INDEX "ledger_closed_through_idx" ON "erp_private"."ledger_periods" USING btree ("through_date");--> statement-breakpoint
CREATE INDEX "ledger_event_pending_idx" ON "erp_private"."ledger_source_events" USING btree ("state","date","id");