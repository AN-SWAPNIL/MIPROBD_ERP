CREATE TABLE "erp_private"."expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."expense_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"category_id" text NOT NULL,
	"category_name" text NOT NULL,
	"subtype" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"paid_from_account_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"expense_for" text NOT NULL,
	"employee_id" text,
	"attribution" jsonb NOT NULL,
	"ta_amount" numeric(24, 2),
	"da_amount" numeric(24, 2),
	"remarks" text NOT NULL,
	"entered_by_user_id" text NOT NULL,
	"entered_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'Posted' NOT NULL,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reversal_date" date,
	"reversal_reason" text,
	CONSTRAINT "expenses_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "expense_amount" CHECK ("erp_private"."expenses"."amount" > 0 and (("erp_private"."expenses"."subtype" = 'General' and "erp_private"."expenses"."ta_amount" is null and "erp_private"."expenses"."da_amount" is null) or ("erp_private"."expenses"."subtype" = 'TA/DA' and "erp_private"."expenses"."expense_for" = 'Employee' and "erp_private"."expenses"."ta_amount" is not null and "erp_private"."expenses"."da_amount" is not null and "erp_private"."expenses"."ta_amount" >= 0 and "erp_private"."expenses"."da_amount" >= 0 and "erp_private"."expenses"."amount" = "erp_private"."expenses"."ta_amount" + "erp_private"."expenses"."da_amount"))),
	CONSTRAINT "expense_employee" CHECK (("erp_private"."expenses"."expense_for" = 'Employee' and "erp_private"."expenses"."employee_id" is not null) or ("erp_private"."expenses"."expense_for" in ('Office','Warehouse','Company / General') and "erp_private"."expenses"."employee_id" is null)),
	CONSTRAINT "expense_status" CHECK ("erp_private"."expenses"."status" in ('Posted','Reversed'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."financial_position_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"as_of_date" date NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"reference" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'Posted' NOT NULL,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reversal_date" date,
	"reversal_reason" text,
	CONSTRAINT "position_amount" CHECK ("erp_private"."financial_position_entries"."amount" > 0),
	CONSTRAINT "position_category" CHECK ("erp_private"."financial_position_entries"."category" in ('Owner Capital','Fixed Assets','Accumulated Depreciation','Statutory Payables','Other Receivables','Other Payables','Opening Retained Earnings')),
	CONSTRAINT "position_status" CHECK ("erp_private"."financial_position_entries"."status" in ('Posted','Reversed'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."financial_position_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."supplier_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"import_id" text,
	"reference" text NOT NULL,
	"entry_type" text NOT NULL,
	"amount" numeric(24, 2) NOT NULL,
	"account_id" text,
	"account_name" text,
	"transaction_id" text,
	"payment_reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'Posted' NOT NULL,
	"reversed_by" text,
	"reversed_at" timestamp with time zone,
	"reversal_date" date,
	"reversal_reason" text,
	CONSTRAINT "supplier_settlements_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "supplier_settlement_values" CHECK ("erp_private"."supplier_settlements"."amount" > 0 and (("erp_private"."supplier_settlements"."entry_type" = 'Payment' and "erp_private"."supplier_settlements"."account_id" is not null and "erp_private"."supplier_settlements"."transaction_id" is not null) or ("erp_private"."supplier_settlements"."entry_type" = 'Obligation' and "erp_private"."supplier_settlements"."account_id" is null and "erp_private"."supplier_settlements"."transaction_id" is null))),
	CONSTRAINT "supplier_settlement_status" CHECK ("erp_private"."supplier_settlements"."status" in ('Posted','Reversed'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "expense_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "erp_private"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ADD CONSTRAINT "expenses_paid_from_account_id_cash_accounts_id_fk" FOREIGN KEY ("paid_from_account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ADD CONSTRAINT "expenses_transaction_id_account_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "erp_private"."account_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ADD CONSTRAINT "expenses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ADD CONSTRAINT "expenses_entered_by_user_id_employees_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."expenses" ADD CONSTRAINT "expenses_reversed_by_employees_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."financial_position_entries" ADD CONSTRAINT "financial_position_entries_created_by_user_id_employees_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."financial_position_entries" ADD CONSTRAINT "financial_position_entries_reversed_by_employees_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "erp_private"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_import_id_import_cases_id_fk" FOREIGN KEY ("import_id") REFERENCES "erp_private"."import_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_account_id_cash_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "erp_private"."cash_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_transaction_id_account_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "erp_private"."account_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_created_by_user_id_employees_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."supplier_settlements" ADD CONSTRAINT "supplier_settlements_reversed_by_employees_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_category_name_unique" ON "erp_private"."expense_categories" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "expense_date_idx" ON "erp_private"."expenses" USING btree ("date","id");--> statement-breakpoint
CREATE INDEX "position_as_of_idx" ON "erp_private"."financial_position_entries" USING btree ("as_of_date","id");--> statement-breakpoint
CREATE INDEX "supplier_settlement_date_idx" ON "erp_private"."supplier_settlements" USING btree ("supplier_id","date","id");--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "erp_private"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_expense_id_unique" UNIQUE("expense_id");
