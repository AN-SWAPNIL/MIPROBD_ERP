CREATE SCHEMA "erp_private";
--> statement-breakpoint
CREATE TABLE "erp_private"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_private"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"purpose" text NOT NULL,
	"bucket" text DEFAULT 'erp-documents' NOT NULL,
	"object_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_object_path_unique" UNIQUE("object_path"),
	CONSTRAINT "document_size" CHECK ("erp_private"."documents"."size_bytes" > 0 and "erp_private"."documents"."size_bytes" <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "erp_private"."employees" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"territory" text DEFAULT '' NOT NULL,
	"employee_code" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permission_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "employees_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "employee_role" CHECK ("erp_private"."employees"."role" in ('Super Admin','Managing Director','Accounts','Import Officer','Warehouse Manager','Sales Manager','Sales Executive')),
	CONSTRAINT "employee_status" CHECK ("erp_private"."employees"."status" in ('Active','Pending','Inactive')),
	CONSTRAINT "employee_json_arrays" CHECK (jsonb_typeof("erp_private"."employees"."capabilities") = 'array' and jsonb_typeof("erp_private"."employees"."permission_overrides") = 'array')
);
--> statement-breakpoint
CREATE TABLE "erp_private"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erp_private"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "erp_private"."audit_events" ADD CONSTRAINT "audit_events_actor_id_employees_id_fk" FOREIGN KEY ("actor_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."documents" ADD CONSTRAINT "documents_uploaded_by_employees_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "erp_private"."sessions" ADD CONSTRAINT "sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "erp_private"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_created_idx" ON "erp_private"."audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_email_lower_unique" ON "erp_private"."employees" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "session_employee_idx" ON "erp_private"."sessions" USING btree ("employee_id");