CREATE TABLE "erp_private"."activity_products" (
	"activity_id" text NOT NULL,
	"product_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."activity_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."lead_products" (
	"lead_id" text NOT NULL,
	"product_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."lead_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."marketing_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"employee_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"status" text DEFAULT 'Draft' NOT NULL,
	"lead_id" text,
	"customer_id" text,
	"subject" text DEFAULT '' NOT NULL,
	"purpose" text NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_activities_reference_unique" UNIQUE("reference"),
	CONSTRAINT "activity_status" CHECK ("erp_private"."marketing_activities"."status" in ('Draft','Submitted','Voided')),
	CONSTRAINT "activity_subject" CHECK (not ("erp_private"."marketing_activities"."customer_id" is not null and "erp_private"."marketing_activities"."lead_id" is not null)),
	CONSTRAINT "activity_submission" CHECK ("erp_private"."marketing_activities"."status" <> 'Submitted' or "erp_private"."marketing_activities"."submitted_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."marketing_follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"assigned_to" text NOT NULL,
	"lead_id" text,
	"customer_id" text,
	"subject" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"successor_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_follow_ups_successor_id_unique" UNIQUE("successor_id"),
	CONSTRAINT "follow_up_status" CHECK ("erp_private"."marketing_follow_ups"."status" in ('Pending','Completed','Cancelled')),
	CONSTRAINT "follow_up_subject" CHECK (("erp_private"."marketing_follow_ups"."customer_id" is not null)::integer + ("erp_private"."marketing_follow_ups"."lead_id" is not null)::integer = 1),
	CONSTRAINT "follow_up_completion" CHECK ("erp_private"."marketing_follow_ups"."status" <> 'Completed' or ("erp_private"."marketing_follow_ups"."completed_at" is not null and length(btrim("erp_private"."marketing_follow_ups"."outcome")) >= 3))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_follow_ups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."marketing_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"assigned_to" text NOT NULL,
	"organization" text NOT NULL,
	"organization_type" text NOT NULL,
	"contact" text NOT NULL,
	"phone" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"stage" text DEFAULT 'NEW' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"lost_reason" text DEFAULT '' NOT NULL,
	"next_follow_up_at" timestamp with time zone,
	"customer_id" text,
	"qualified_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_leads_reference_unique" UNIQUE("reference"),
	CONSTRAINT "marketing_leads_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "lead_stage" CHECK ("erp_private"."marketing_leads"."stage" in ('NEW','CONTACTED','INTERESTED','PRESENTATION','SAMPLE','NEGOTIATION','LOST')),
	CONSTRAINT "lead_conversion" CHECK (("erp_private"."marketing_leads"."customer_id" is null) = ("erp_private"."marketing_leads"."converted_at" is null)),
	CONSTRAINT "lead_lost_reason" CHECK ("erp_private"."marketing_leads"."stage" <> 'LOST' or length(btrim("erp_private"."marketing_leads"."lost_reason")) >= 5)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."marketing_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"kind" text NOT NULL,
	"period" date NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"data" jsonb NOT NULL,
	"reviewed_by" text,
	"review_reason" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_kind" CHECK ("erp_private"."marketing_plans"."kind" in ('Daily','Monthly')),
	CONSTRAINT "plan_status" CHECK ("erp_private"."marketing_plans"."status" in ('Draft','Submitted','Approved','Rejected')),
	CONSTRAINT "plan_month" CHECK ("erp_private"."marketing_plans"."kind" <> 'Monthly' or extract(day from "erp_private"."marketing_plans"."period") = 1)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."marketing_score_rules" (
	"event" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"points" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_points" CHECK ("erp_private"."marketing_score_rules"."points" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_score_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."marketing_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"month" date NOT NULL,
	"sales" numeric(24, 2) NOT NULL,
	"collections" numeric(24, 2) NOT NULL,
	"customers" integer NOT NULL,
	"activities" integer NOT NULL,
	"visits" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "target_values" CHECK ("erp_private"."marketing_targets"."sales" >= 0 and "erp_private"."marketing_targets"."collections" >= 0 and "erp_private"."marketing_targets"."customers" >= 0 and "erp_private"."marketing_targets"."activities" >= 0 and "erp_private"."marketing_targets"."visits" >= 0 and extract(day from "erp_private"."marketing_targets"."month") = 1)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."employees" ADD COLUMN "manager_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."activity_products" ADD CONSTRAINT "activity_products_activity_id_marketing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "erp_private"."marketing_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."activity_products" ADD CONSTRAINT "activity_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."lead_products" ADD CONSTRAINT "lead_products_lead_id_marketing_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "erp_private"."marketing_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."lead_products" ADD CONSTRAINT "lead_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_activities" ADD CONSTRAINT "marketing_activities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_activities" ADD CONSTRAINT "marketing_activities_lead_id_marketing_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "erp_private"."marketing_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_activities" ADD CONSTRAINT "marketing_activities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_activities" ADD CONSTRAINT "marketing_activities_voided_by_employees_id_fk" FOREIGN KEY ("voided_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_follow_ups" ADD CONSTRAINT "marketing_follow_ups_assigned_to_employees_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_follow_ups" ADD CONSTRAINT "marketing_follow_ups_lead_id_marketing_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "erp_private"."marketing_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_follow_ups" ADD CONSTRAINT "marketing_follow_ups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_follow_ups" ADD CONSTRAINT "marketing_follow_ups_successor_id_marketing_follow_ups_id_fk" FOREIGN KEY ("successor_id") REFERENCES "erp_private"."marketing_follow_ups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_follow_ups" ADD CONSTRAINT "marketing_follow_ups_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_leads" ADD CONSTRAINT "marketing_leads_assigned_to_employees_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_leads" ADD CONSTRAINT "marketing_leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_leads" ADD CONSTRAINT "marketing_leads_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_plans" ADD CONSTRAINT "marketing_plans_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_plans" ADD CONSTRAINT "marketing_plans_reviewed_by_employees_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_score_rules" ADD CONSTRAINT "marketing_score_rules_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_targets" ADD CONSTRAINT "marketing_targets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."marketing_targets" ADD CONSTRAINT "marketing_targets_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_product_unique" ON "erp_private"."activity_products" USING btree ("activity_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_product_unique" ON "erp_private"."lead_products" USING btree ("lead_id","product_id");--> statement-breakpoint
CREATE INDEX "activity_employee_date_idx" ON "erp_private"."marketing_activities" USING btree ("employee_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "activity_date_idx" ON "erp_private"."marketing_activities" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE INDEX "follow_up_owner_due_idx" ON "erp_private"."marketing_follow_ups" USING btree ("assigned_to","due_at","id");--> statement-breakpoint
CREATE INDEX "lead_owner_created_idx" ON "erp_private"."marketing_leads" USING btree ("assigned_to","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_owner_period_unique" ON "erp_private"."marketing_plans" USING btree ("employee_id","kind","period");--> statement-breakpoint
CREATE UNIQUE INDEX "target_owner_month_unique" ON "erp_private"."marketing_targets" USING btree ("employee_id","month");--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_activity_id_marketing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "erp_private"."marketing_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_manager_idx" ON "erp_private"."employees" USING btree ("manager_id","id");