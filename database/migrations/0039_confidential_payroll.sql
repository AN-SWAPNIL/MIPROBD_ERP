CREATE TABLE "erp_private"."payroll_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"position" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"gross" numeric(24, 2) NOT NULL,
	"net" numeric(24, 2) NOT NULL,
	"commission" numeric(24, 2) NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "payroll_line_values" CHECK ("erp_private"."payroll_lines"."gross">=0 and "erp_private"."payroll_lines"."net">=0 and "erp_private"."payroll_lines"."net"<="erp_private"."payroll_lines"."gross")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."payroll_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"employee_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"installment" numeric(24, 2) NOT NULL,
	"account_id" text NOT NULL,
	"reason" text NOT NULL,
	"proof_reference" text NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload_hash" text NOT NULL,
	"approval_id" text NOT NULL,
	"transaction_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date,
	"posted_by" text,
	CONSTRAINT "payroll_loans_number_unique" UNIQUE("number"),
	CONSTRAINT "payroll_loans_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "payroll_loans_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "payroll_loan_values" CHECK ("erp_private"."payroll_loans"."amount">0 and "erp_private"."payroll_loans"."installment">=0 and "erp_private"."payroll_loans"."installment"<="erp_private"."payroll_loans"."amount" and "erp_private"."payroll_loans"."kind" in ('Advance','Loan') and "erp_private"."payroll_loans"."state" in ('Submitted','Posted') and ("erp_private"."payroll_loans"."state"<>'Posted' or ("erp_private"."payroll_loans"."date" is not null and "erp_private"."payroll_loans"."transaction_id" is not null and "erp_private"."payroll_loans"."posted_by" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."payroll_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"run_id" text NOT NULL,
	"line_id" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"account_id" text NOT NULL,
	"reason" text NOT NULL,
	"proof_reference" text NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload_hash" text NOT NULL,
	"approval_id" text NOT NULL,
	"transaction_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"date" date,
	"posted_by" text,
	CONSTRAINT "payroll_payments_number_unique" UNIQUE("number"),
	CONSTRAINT "payroll_payments_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "payroll_payments_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "payroll_payment_values" CHECK ("erp_private"."payroll_payments"."amount">0 and "erp_private"."payroll_payments"."state" in ('Submitted','Posted') and ("erp_private"."payroll_payments"."state"<>'Posted' or ("erp_private"."payroll_payments"."date" is not null and "erp_private"."payroll_payments"."transaction_id" is not null and "erp_private"."payroll_payments"."posted_by" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."payroll_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"kind" text NOT NULL,
	"effective_from" date NOT NULL,
	"data" jsonb NOT NULL,
	"state" text DEFAULT 'Submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload_hash" text NOT NULL,
	"approval_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_policies_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "payroll_policy_values" CHECK ("erp_private"."payroll_policies"."kind" in ('Compensation','Commission') and "erp_private"."payroll_policies"."state" in ('Submitted','Active') and "erp_private"."payroll_policies"."version">0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."payroll_recoveries" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"loan_id" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "payroll_recovery_amount" CHECK ("erp_private"."payroll_recoveries"."amount">0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_recoveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"period" text NOT NULL,
	"reason" text NOT NULL,
	"proof_reference" text NOT NULL,
	"gross" numeric(24, 2) NOT NULL,
	"net" numeric(24, 2) NOT NULL,
	"state" text DEFAULT 'Draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload_hash" text NOT NULL,
	"preparer_ids" jsonb NOT NULL,
	"approval_id" text,
	"revision_of_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_by" text,
	"posted_date" date,
	"posted_at" timestamp with time zone,
	CONSTRAINT "payroll_runs_number_unique" UNIQUE("number"),
	CONSTRAINT "payroll_runs_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "payroll_runs_revision_of_id_unique" UNIQUE("revision_of_id"),
	CONSTRAINT "payroll_run_values" CHECK ("erp_private"."payroll_runs"."period"~'^20[0-9]{2}-(0[1-9]|1[0-2])$' and "erp_private"."payroll_runs"."gross">0 and "erp_private"."payroll_runs"."net">=0 and "erp_private"."payroll_runs"."net"<="erp_private"."payroll_runs"."gross" and "erp_private"."payroll_runs"."state" in ('Draft','Submitted','Accrued','Superseded') and "erp_private"."payroll_runs"."version">0 and ("erp_private"."payroll_runs"."state"<>'Accrued' or ("erp_private"."payroll_runs"."posted_date" is not null and "erp_private"."payroll_runs"."posted_by" is not null and "erp_private"."payroll_runs"."posted_at" is not null)))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "erp_private"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ADD CONSTRAINT "payroll_loans_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ADD CONSTRAINT "payroll_loans_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ADD CONSTRAINT "payroll_loans_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ADD CONSTRAINT "payroll_loans_transaction_id_account_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "erp_private"."account_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ADD CONSTRAINT "payroll_loans_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_loans" ADD CONSTRAINT "payroll_loans_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "erp_private"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_line_id_payroll_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "erp_private"."payroll_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_transaction_id_account_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "erp_private"."account_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_payments" ADD CONSTRAINT "payroll_payments_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_policies" ADD CONSTRAINT "payroll_policies_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_policies" ADD CONSTRAINT "payroll_policies_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_policies" ADD CONSTRAINT "payroll_policies_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_recoveries" ADD CONSTRAINT "payroll_recoveries_line_id_payroll_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "erp_private"."payroll_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_recoveries" ADD CONSTRAINT "payroll_recoveries_loan_id_payroll_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "erp_private"."payroll_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_runs" ADD CONSTRAINT "payroll_runs_approval_id_approval_requests_id_fk" FOREIGN KEY ("approval_id") REFERENCES "erp_private"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_runs" ADD CONSTRAINT "payroll_runs_revision_of_id_payroll_runs_id_fk" FOREIGN KEY ("revision_of_id") REFERENCES "erp_private"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."payroll_runs" ADD CONSTRAINT "payroll_runs_posted_by_employees_id_fk" FOREIGN KEY ("posted_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_line_employee_unique" ON "erp_private"."payroll_lines" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_line_position_unique" ON "erp_private"."payroll_lines" USING btree ("run_id","position");--> statement-breakpoint
CREATE INDEX "payroll_loan_employee_idx" ON "erp_private"."payroll_loans" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "payroll_payment_line_idx" ON "erp_private"."payroll_payments" USING btree ("line_id","state");--> statement-breakpoint
CREATE INDEX "payroll_policy_employee_idx" ON "erp_private"."payroll_policies" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_policy_effective_unique" ON "erp_private"."payroll_policies" USING btree ("employee_id","kind","effective_from") WHERE "erp_private"."payroll_policies"."state"='Active';--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_recovery_source_unique" ON "erp_private"."payroll_recoveries" USING btree ("line_id","loan_id");--> statement-breakpoint
CREATE INDEX "payroll_recovery_loan_idx" ON "erp_private"."payroll_recoveries" USING btree ("loan_id","date");--> statement-breakpoint
CREATE INDEX "payroll_run_period_idx" ON "erp_private"."payroll_runs" USING btree ("period","state");