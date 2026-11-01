CREATE TABLE "erp_private"."invitation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"state" text DEFAULT 'Queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"last_code" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_jobs_employee_id_unique" UNIQUE("employee_id"),
	CONSTRAINT "invitation_state" CHECK ("erp_private"."invitation_jobs"."state" in ('Queued','Processing','Sent','Review','Cancelled')),
	CONSTRAINT "invitation_attempts" CHECK ("erp_private"."invitation_jobs"."attempts" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."invitation_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."invitation_jobs" ADD CONSTRAINT "invitation_jobs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."invitation_jobs" ADD CONSTRAINT "invitation_jobs_requested_by_employees_id_fk" FOREIGN KEY ("requested_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_due_idx" ON "erp_private"."invitation_jobs" USING btree ("state","next_attempt_at");
--> statement-breakpoint
REVOKE ALL ON erp_private.invitation_jobs FROM anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER invitation_history_retained BEFORE DELETE OR TRUNCATE ON erp_private.invitation_jobs
FOR EACH STATEMENT EXECUTE FUNCTION erp_private.reject_posted_change();
