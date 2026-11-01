CREATE TABLE "erp_private"."customer_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"source" text NOT NULL,
	"version" integer NOT NULL,
	"confirmed_by" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_coordinates" CHECK ("erp_private"."customer_locations"."latitude" between -90 and 90 and "erp_private"."customer_locations"."longitude" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."customer_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."field_visit_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"customer_id" text,
	"lead_id" text,
	"subject" text NOT NULL,
	"purpose" text NOT NULL,
	"policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "attempt_subject" CHECK (("erp_private"."field_visit_attempts"."customer_id" is not null)::integer+("erp_private"."field_visit_attempts"."lead_id" is not null)::integer=1)
);
--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."field_visit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"visit_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"details" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."field_visit_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_policy_singleton" CHECK ("erp_private"."field_visit_policies"."id"='company')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "erp_private"."field_visits" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"attempt_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"customer_id" text,
	"lead_id" text,
	"subject" text NOT NULL,
	"purpose" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'CheckedIn' NOT NULL,
	"quality" text NOT NULL,
	"match" text NOT NULL,
	"review" text DEFAULT 'Pending' NOT NULL,
	"position" jsonb,
	"distance_meters" numeric(14, 2),
	"site_id" text,
	"policy" jsonb NOT NULL,
	"photo_id" uuid,
	"photo_method" text NOT NULL,
	"location_reason" text DEFAULT '' NOT NULL,
	"photo_reason" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"activity_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "field_visits_reference_unique" UNIQUE("reference"),
	CONSTRAINT "field_visits_attempt_id_unique" UNIQUE("attempt_id"),
	CONSTRAINT "field_visits_photo_id_unique" UNIQUE("photo_id"),
	CONSTRAINT "field_visits_activity_id_unique" UNIQUE("activity_id"),
	CONSTRAINT "visit_subject" CHECK (("erp_private"."field_visits"."customer_id" is not null)::integer+("erp_private"."field_visits"."lead_id" is not null)::integer=1),
	CONSTRAINT "visit_state" CHECK ("erp_private"."field_visits"."status" in ('CheckedIn','Completed','Voided') and "erp_private"."field_visits"."review" in ('Pending','Accepted','Rejected'))
);
--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "visit_attempt_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "visit_id" text;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD COLUMN "image_info" jsonb;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_locations" ADD CONSTRAINT "customer_locations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."customer_locations" ADD CONSTRAINT "customer_locations_confirmed_by_employees_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_attempts" ADD CONSTRAINT "field_visit_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_attempts" ADD CONSTRAINT "field_visit_attempts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_attempts" ADD CONSTRAINT "field_visit_attempts_lead_id_marketing_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "erp_private"."marketing_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_events" ADD CONSTRAINT "field_visit_events_visit_id_field_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "erp_private"."field_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_events" ADD CONSTRAINT "field_visit_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visit_policies" ADD CONSTRAINT "field_visit_policies_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_attempt_id_field_visit_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "erp_private"."field_visit_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "erp_private"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_lead_id_marketing_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "erp_private"."marketing_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_site_id_customer_locations_id_fk" FOREIGN KEY ("site_id") REFERENCES "erp_private"."customer_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_photo_id_documents_id_fk" FOREIGN KEY ("photo_id") REFERENCES "erp_private"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."field_visits" ADD CONSTRAINT "field_visits_activity_id_marketing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "erp_private"."marketing_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_location_version" ON "erp_private"."customer_locations" USING btree ("customer_id","version");--> statement-breakpoint
CREATE INDEX "visit_attempt_expiry" ON "erp_private"."field_visit_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "visit_event_timeline" ON "erp_private"."field_visit_events" USING btree ("visit_id","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_one_active_owner" ON "erp_private"."field_visits" USING btree ("employee_id") WHERE "erp_private"."field_visits"."status"='CheckedIn';--> statement-breakpoint
CREATE INDEX "visit_owner_date" ON "erp_private"."field_visits" USING btree ("employee_id","received_at","id");--> statement-breakpoint
CREATE INDEX "visit_customer_date" ON "erp_private"."field_visits" USING btree ("customer_id","received_at");--> statement-breakpoint
CREATE INDEX "visit_review_date" ON "erp_private"."field_visits" USING btree ("review","received_at");--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_visit_attempt_id_field_visit_attempts_id_fk" FOREIGN KEY ("visit_attempt_id") REFERENCES "erp_private"."field_visit_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_visit_id_field_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "erp_private"."field_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_visit_id_unique" UNIQUE("visit_id");