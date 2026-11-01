CREATE TABLE "erp_private"."customer_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"source_id" text NOT NULL,
	"reference" text NOT NULL,
	"debit" numeric(24, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(24, 2) DEFAULT '0' NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_entry_amount" CHECK (("erp_private"."customer_entries"."debit" > 0 and "erp_private"."customer_entries"."credit" = 0) or ("erp_private"."customer_entries"."credit" > 0 and "erp_private"."customer_entries"."debit" = 0))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"contact_person" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"territory" text DEFAULT '' NOT NULL,
	"assigned_sales_user_id" text,
	"payment_terms" text DEFAULT '' NOT NULL,
	"credit_limit" numeric(24, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_credit_limit" CHECK ("erp_private"."customers"."credit_limit" >= 0),
	CONSTRAINT "customer_type" CHECK ("erp_private"."customers"."type" in ('Hospital','Clinic','Dealer','Pharmacy','Other'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"product_id" text NOT NULL,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount" numeric(24, 2) NOT NULL,
	"line_total" numeric(24, 2) NOT NULL,
	"order_id" text NOT NULL,
	CONSTRAINT "order_line_integrity" CHECK ("erp_private"."order_lines"."quantity" > 0 and "erp_private"."order_lines"."unit_price" >= 0 and "erp_private"."order_lines"."discount" >= 0 and "erp_private"."order_lines"."line_total" = round("erp_private"."order_lines"."quantity" * "erp_private"."order_lines"."unit_price", 2) - "erp_private"."order_lines"."discount" and "erp_private"."order_lines"."line_total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."quotation_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"product_id" text NOT NULL,
	"product_code" text NOT NULL,
	"product_name" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount" numeric(24, 2) NOT NULL,
	"line_total" numeric(24, 2) NOT NULL,
	"quotation_id" text NOT NULL,
	CONSTRAINT "quotation_line_integrity" CHECK ("erp_private"."quotation_lines"."quantity" > 0 and "erp_private"."quotation_lines"."unit_price" >= 0 and "erp_private"."quotation_lines"."discount" >= 0 and "erp_private"."quotation_lines"."line_total" = round("erp_private"."quotation_lines"."quantity" * "erp_private"."quotation_lines"."unit_price", 2) - "erp_private"."quotation_lines"."discount" and "erp_private"."quotation_lines"."line_total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."quotation_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"quotation_number" text NOT NULL,
	"date" date NOT NULL,
	"customer_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"validity_days" integer NOT NULL,
	"payment_terms" text NOT NULL,
	"remarks" text DEFAULT '' NOT NULL,
	"subtotal" numeric(24, 2) NOT NULL,
	"discount_total" numeric(24, 2) NOT NULL,
	"total" numeric(24, 2) NOT NULL,
	"created_by_user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quotation_number_unique" UNIQUE("quotation_number"),
	CONSTRAINT "quotation_status" CHECK ("erp_private"."quotations"."status" in ('Draft','Sent','Accepted','Rejected','Converted')),
	CONSTRAINT "quotation_totals" CHECK ("erp_private"."quotations"."subtotal" >= 0 and "erp_private"."quotations"."discount_total" >= 0 and "erp_private"."quotations"."total" = "erp_private"."quotations"."subtotal" - "erp_private"."quotations"."discount_total" and "erp_private"."quotations"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."quotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."sales_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"quotation_id" text,
	"date" date NOT NULL,
	"customer_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"instructions" jsonb NOT NULL,
	"status" text DEFAULT 'Placed' NOT NULL,
	"total" numeric(24, 2) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "sales_orders_quotation_id_unique" UNIQUE("quotation_id"),
	CONSTRAINT "order_status" CHECK ("erp_private"."sales_orders"."status" in ('Placed','Ready','Partially Delivered','Delivered','Cancelled')),
	CONSTRAINT "order_total" CHECK ("erp_private"."sales_orders"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."sales_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "erp_private"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_entries" ADD CONSTRAINT "customer_entries_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customers" ADD CONSTRAINT "customers_assigned_sales_user_id_employees_id_fk" FOREIGN KEY ("assigned_sales_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customers" ADD CONSTRAINT "customers_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."order_lines" ADD CONSTRAINT "order_lines_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "erp_private"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quotation_lines" ADD CONSTRAINT "quotation_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "erp_private"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "erp_private"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quotations" ADD CONSTRAINT "quotations_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."quotations" ADD CONSTRAINT "quotations_created_by_user_id_employees_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "erp_private"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_orders" ADD CONSTRAINT "sales_orders_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sales_orders" ADD CONSTRAINT "sales_orders_created_by_user_id_employees_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_ledger_date_idx" ON "erp_private"."customer_entries" USING btree ("customer_id","date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_entry_source_unique" ON "erp_private"."customer_entries" USING btree ("type","source_id");--> statement-breakpoint
CREATE INDEX "customer_owner_idx" ON "erp_private"."customers" USING btree ("assigned_sales_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_product_unique" ON "erp_private"."order_lines" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_product_unique" ON "erp_private"."quotation_lines" USING btree ("quotation_id","product_id");--> statement-breakpoint
CREATE INDEX "quotation_owner_date_idx" ON "erp_private"."quotations" USING btree ("owner_id","date");--> statement-breakpoint
CREATE INDEX "order_owner_date_idx" ON "erp_private"."sales_orders" USING btree ("owner_id","date");