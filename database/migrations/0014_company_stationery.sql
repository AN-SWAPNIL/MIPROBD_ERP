CREATE TABLE "erp_private"."print_configurations" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_configuration_singleton" CHECK ("erp_private"."print_configurations"."id" = 'company'),
	CONSTRAINT "print_configuration_version" CHECK ("erp_private"."print_configurations"."version" > 0),
	CONSTRAINT "print_configuration_object" CHECK (jsonb_typeof("erp_private"."print_configurations"."data") = 'object')
);
--> statement-breakpoint
ALTER TABLE "erp_private"."print_configurations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "erp_private"."print_configurations" ADD CONSTRAINT "print_configurations_updated_by_employees_id_fk" FOREIGN KEY ("updated_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;