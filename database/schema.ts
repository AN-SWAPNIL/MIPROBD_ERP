import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, numeric, pgSchema, text, timestamp, uniqueIndex, uuid, boolean, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { Capability, Expense, FinancialPositionEntry, ImportCase, ImportCostLine, ImportStatus, LandedCostSnapshot, PrintConfiguration, Quotation, SalesOrder } from "../src/domains/erp.types.js";
import type { Role, UserPermissionOverride } from "../src/types/index.js";
import type { PlanData } from "../src/domains/marketing/persistentContracts.js";
import type { VisitPolicyData, VisitPosition } from "../src/domains/marketing/visitContracts.js";
import type { WarehouseData, PresetData, DecisionData } from "../src/domains/settings/operationalContracts.js";
import type { WorkbookProfile, OpeningData, OpeningPreview } from "../src/domains/opening/contracts.js";
import type { ApprovalPolicyData, ControlDomain } from "../src/domains/controls/contracts.js";
import type { LedgerConfigurationData, LedgerPostingPlan } from "../src/domains/ledger/contracts.js";
import type { StockControlSnapshot } from "../src/domains/inventory/controlContracts.js";
import type { ReturnLineSnapshot } from "../src/domains/sales/returnContracts.js";
import type { PayrollLineSnapshot,PayrollPolicyData } from "../src/domains/payroll/contracts.js";
import type { ClaimSource } from "../src/domains/claims/contracts.js";

export const erp = pgSchema("erp_private");
export const operationalChecks = erp.table("operational_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  operation: text("operation").$type<"Invitations" | "Queue Health" | "Source Reconciliation">().notNull(),
  status: text("status").$type<"Passed" | "Failed">().notNull(),
  summary: jsonb("summary").$type<Record<string, number | boolean>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("operational_check_latest_idx").on(t.operation, t.createdAt),
  check("operational_check_values", sql`${t.operation} in ('Invitations','Queue Health','Source Reconciliation') and ${t.status} in ('Passed','Failed') and jsonb_typeof(${t.summary})='object' and octet_length(${t.summary}::text)<=2048`)
]).enableRLS();
export const warehouseSettings = erp.table("warehouse_settings", {
  id: text("id").primaryKey(), data: jsonb("data").$type<WarehouseData>().notNull(),
  version: integer("version").notNull().default(1), updatedBy: text("updated_by").references(() => employees.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [check("warehouse_singleton", sql`${t.id}='main' and ${t.data}->>'id'='main' and ${t.data}->>'name'='Main Warehouse' and ${t.data}->>'active'='true'`)]).enableRLS();
export const costPresets = erp.table("cost_presets", {
  id: text("id").primaryKey(), data: jsonb("data").$type<PresetData>().notNull(),
  version: integer("version").notNull().default(1), updatedBy: text("updated_by").notNull().references(() => employees.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("cost_preset_name_unique").on(sql`lower(btrim(${t.data}->>'name'))`), check("preset_explicit_allocation", sql`${t.data}->>'requiresExplicitChoice'='true'`)]).enableRLS();
export const businessDecisions = erp.table("business_decisions", {
  id: text("id").primaryKey(), data: jsonb("data").$type<DecisionData>().notNull(),
  version: integer("version").notNull().default(1), updatedBy: text("updated_by").references(() => employees.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}).enableRLS();
export const employees = erp.table("employees", {
  id: text("id").primaryKey(),
  authUserId: uuid("auth_user_id").unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").$type<Role>().notNull(),
  status: text("status").$type<"Active" | "Pending" | "Inactive">().notNull().default("Pending"),
  title: text("title").notNull().default(""),
  department: text("department").notNull().default(""),
  phone: text("phone").notNull().default(""),
  territory: text("territory").notNull().default(""),
  employeeCode: text("employee_code").notNull().unique(),
  managerId: text("manager_id").references((): AnyPgColumn => employees.id),
  capabilities: jsonb("capabilities").$type<Capability[]>().notNull().default([]),
  permissionOverrides: jsonb("permission_overrides").$type<UserPermissionOverride[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  uniqueIndex("employee_email_lower_unique").on(sql`lower(${t.email})`),
  index("employee_manager_idx").on(t.managerId, t.id),
  check("employee_role", sql`${t.role} in ('Super Admin','Managing Director','Accounts','Import Officer','Warehouse Manager','Sales Manager','Sales Executive')`),
  check("employee_status", sql`${t.status} in ('Active','Pending','Inactive')`),
  check("employee_json_arrays", sql`jsonb_typeof(${t.capabilities}) = 'array' and jsonb_typeof(${t.permissionOverrides}) = 'array'`)
]);

export const auditEvents = erp.table("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => employees.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("audit_entity_created_idx").on(t.entityType, t.entityId, t.createdAt), index("audit_created_idx").on(t.createdAt, t.id)]);

export const invitationJobs = erp.table("invitation_jobs", {
  id: uuid("id").primaryKey().defaultRandom(), employeeId: text("employee_id").notNull().unique().references(() => employees.id),
  requestedBy: text("requested_by").notNull().references(() => employees.id),
  state: text("state").$type<"Queued" | "Processing" | "Sent" | "Review" | "Cancelled">().notNull().default("Queued"),
  attempts: integer("attempts").notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }), leaseToken: uuid("lease_token"),
  lastCode: text("last_code").notNull().default(""), sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("invitation_due_idx").on(t.state, t.nextAttemptAt),
  check("invitation_state", sql`${t.state} in ('Queued','Processing','Sent','Review','Cancelled')`),
  check("invitation_attempts", sql`${t.attempts} between 0 and 10`)]).enableRLS();

export const openingSources = erp.table("opening_sources", {
  id: uuid("id").primaryKey().defaultRandom(), fileName: text("file_name").notNull(), objectPath: text("object_path").notNull().unique(),
  sizeBytes: integer("size_bytes").notNull(), state: text("state").$type<"Pending" | "Ready">().notNull().default("Pending"),
  sha256: text("sha256").unique(), profile: jsonb("profile").$type<WorkbookProfile>(),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
}, (t) => [check("opening_source_state", sql`${t.state} in ('Pending','Ready') and (${t.state}='Pending' or (${t.sha256} is not null and ${t.profile} is not null))`), check("opening_source_size", sql`${t.sizeBytes} between 1 and 8388608`)]).enableRLS();

export const openingDrafts = erp.table("opening_drafts", {
  id: uuid("id").primaryKey().defaultRandom(), sourceId: uuid("source_id").notNull().references(() => openingSources.id), name: text("name").notNull(),
  state: text("state").$type<"Draft" | "Validated" | "Previewed" | "Approved" | "Posted" | "Reconciled">().notNull().default("Draft"),
  data: jsonb("data").$type<OpeningData>().notNull(), preview: jsonb("preview").$type<OpeningPreview>(),
  previewHash: text("preview_hash"), version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => employees.id), approvedBy: text("approved_by").references(() => employees.id),
  preparedBy: text("prepared_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("opening_draft_created_idx").on(t.createdAt, t.id), check("opening_draft_state", sql`${t.state} in ('Draft','Validated','Previewed','Approved','Posted','Reconciled')`),
  check("opening_approval_evidence", sql`${t.state} not in ('Approved','Posted','Reconciled') or (${t.approvedBy} is not null and ${t.previewHash} is not null)`)]).enableRLS();

export const openingPositions = erp.table("opening_positions", {
  id: text("id").primaryKey(), draftId: uuid("draft_id").notNull().references(() => openingDrafts.id),
  sourceId: uuid("source_id").notNull().references(() => openingSources.id), lineId: text("line_id").notNull(),
  kind: text("kind").$type<OpeningData["lines"][number]["kind"]>().notNull(), entityId: text("entity_id").notNull(),
  sourceReference: text("source_reference").notNull(), sourceSheet: text("source_sheet").notNull(), sourceCell: text("source_cell").notNull(),
  asOfDate: date("as_of_date").notNull(), amountBdt: numeric("amount_bdt", { precision: 24, scale: 2 }).notNull(),
  snapshot: jsonb("snapshot").$type<OpeningData["lines"][number]>().notNull(),
  postedBy: text("posted_by").notNull().references(() => employees.id), postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("opening_position_draft_line_unique").on(t.draftId, t.lineId),
  uniqueIndex("opening_position_source_unique").on(t.sourceId, t.kind, t.entityId, t.sourceSheet, t.sourceCell, sql`lower(btrim(${t.sourceReference}))`),
  uniqueIndex("opening_financial_reference_unique").on(t.kind, t.entityId, sql`lower(btrim(${t.sourceReference}))`).where(sql`${t.kind}<>'Stock'`),
  uniqueIndex("opening_cash_once").on(t.entityId).where(sql`${t.kind}='Cash Bank'`),
  check("opening_position_kind", sql`${t.kind} in ('Stock','Customer Due','Supplier Due','Supplier Advance','Cash Bank')`),
  check("opening_position_amount", sql`${t.amountBdt}>=0`)]).enableRLS();

export const sessions = erp.table("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").$type<"login" | "recovery">().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("session_employee_idx").on(t.employeeId)]);

export const documents = erp.table("documents", {
  qualityResourceId:uuid("quality_resource_id").references(():AnyPgColumn=>qualityResources.id),
  sha256:text("sha256"),
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  uploadedBy: text("uploaded_by").notNull().references(() => employees.id),
  purpose: text("purpose").$type<"employee-avatar" | "employee-evidence" | "import-document" | "expense-receipt" | "marketing-evidence" | "field-visit-evidence" | "quality-evidence" | "product-image">().notNull(),
  productId: text("product_id").references((): AnyPgColumn => products.id),
  importId: text("import_id").references(() => importCases.id),
  expenseId: text("expense_id").unique().references((): AnyPgColumn => expenses.id),
  activityId: text("activity_id").references((): AnyPgColumn => marketingActivities.id),
  visitAttemptId: text("visit_attempt_id").references((): AnyPgColumn=>fieldVisitAttempts.id),
  visitId: text("visit_id").unique().references((): AnyPgColumn=>fieldVisits.id),
  imageInfo: jsonb("image_info").$type<{sha256:string;width:number;height:number}>(),
  documentType: text("document_type").notNull().default("Other"),
  sensitive: boolean("sensitive").notNull().default(true),
  bucket: text("bucket").notNull().default("erp-documents"),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").$type<"Pending" | "Attached" | "Expired">().notNull().default("Pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attachedAt: timestamp("attached_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [check("document_size", sql`${t.sizeBytes} > 0 and ${t.sizeBytes} <= 10485760`)]);

export const rateLimits = erp.table("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});

export const masterOptions = erp.table("master_options", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), value: text("value").notNull(),
  createdBy: text("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("master_option_unique").on(t.kind, sql`lower(btrim(${t.value}))`),
  check("master_option_kind", sql`${t.kind} in ('unit','currency','product-family','country','container-type','document-type','import-cost-category')`),
  check("master_option_value", sql`length(btrim(${t.value})) between 1 and 80`)]).enableRLS();

export const printConfigurations = erp.table("print_configurations", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Omit<PrintConfiguration, "version">>().notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").references(() => employees.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [check("print_configuration_singleton", sql`${t.id} = 'company'`), check("print_configuration_version", sql`${t.version} > 0`), check("print_configuration_object", sql`jsonb_typeof(${t.data}) = 'object'`)]).enableRLS();

export const products = erp.table("products", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(),
  family: text("family").notNull(), variant: text("variant").notNull(), unit: text("unit").notNull(),
  hsCode: text("hs_code").notNull().default(""), imageUrl: text("image_url").notNull().default(""),
  standardSalePrice: numeric("standard_sale_price", { precision: 24, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true)
}, (t) => [uniqueIndex("product_code_lower_unique").on(sql`lower(${t.code})`), check("product_price_positive", sql`${t.standardSalePrice} >= 0`)]).enableRLS();

export const suppliers = erp.table("suppliers", {
  id: text("id").primaryKey(), name: text("name").notNull(), country: text("country").notNull(),
  contactPerson: text("contact_person").notNull().default(""), phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""), paymentTerms: text("payment_terms").notNull().default(""),
  active: boolean("active").notNull().default(true)
}).enableRLS();

export const documentNumbers = erp.table("document_numbers", {
  key: text("key").primaryKey(), value: integer("value").notNull()
}).enableRLS();

export type CommercialFields = Pick<ImportCase, "poNumber" | "poDate" | "piNumber" | "piDate" | "paymentMode" | "lcNumber" | "lcAmount" | "lcBankAmount" | "lcOtherAmount" | "lcOpenDate" | "lcExpiryDate" | "ttReference" | "ttAmount" | "ttDate" | "bank" | "currency" | "exchangeRate" | "rateDate" | "rateSource" | "expectedShipmentDate" | "commercialInvoiceNumber" | "commercialInvoiceDate" | "productionStatus" | "productionFollowUpNote" | "blNumber" | "containerNumber" | "containerType" | "vesselName" | "etd" | "eta" | "notes">;
export const importCases = erp.table("import_cases", {
  id: text("id").primaryKey(), draftReference: text("draft_reference").notNull().unique(),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id), supplierName: text("supplier_name").notNull(),
  commercial: jsonb("commercial").$type<CommercialFields>().notNull(),
  status: text("status").$type<ImportStatus>().notNull().default("Draft"),
  currentSnapshotVersion: integer("current_snapshot_version"),
  createdBy: text("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("import_supplier_created_idx").on(t.supplierId, t.createdAt), uniqueIndex("import_lc_lower_unique").on(sql`nullif(lower(btrim(${t.commercial}->>'lcNumber')), '')`), check("import_status", sql`${t.status} in ('Draft','PI Received','LC/TT Opened','In Production','Shipped','At Port','Costing','Cost Finalized','Partially Received','Received','Closed','Cancelled')`)]).enableRLS();

export const importItems = erp.table("import_items", {
  id: text("id").primaryKey(), importId: text("import_id").notNull().references(() => importCases.id),
  productId: text("product_id").notNull().references(() => products.id), productCode: text("product_code").notNull(), productName: text("product_name").notNull(), unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), currency: text("currency").notNull(),
  fobUnitForeign: numeric("fob_unit_foreign", { precision: 18, scale: 6 }).notNull(), exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  fobTotalBdt: numeric("fob_total_bdt", { precision: 24, scale: 2 }).notNull(),
  cbmPerCarton: numeric("cbm_per_carton", { precision: 18, scale: 8 }).notNull(), cartonCount: numeric("carton_count", { precision: 18, scale: 4 }).notNull(), totalCbm: numeric("total_cbm", { precision: 18, scale: 8 }).notNull(),
  cbmMode: text("cbm_mode").$type<"CALCULATED" | "MANUAL">().notNull(), hsCode: text("hs_code").notNull().default("")
}, (t) => [index("import_item_case_idx").on(t.importId), check("import_item_nonnegative", sql`${t.quantity} > 0 and ${t.fobUnitForeign} >= 0 and ${t.exchangeRate} >= 0 and ${t.fobTotalBdt} >= 0 and ${t.totalCbm} >= 0 and ${t.cartonCount} >= 0 and ${t.cbmPerCarton} >= 0`)]).enableRLS();

export const importCosts = erp.table("import_cost_lines", {
  id: text("id").primaryKey(), importId: text("import_id").notNull().references(() => importCases.id),
  amountForeign: numeric("amount_foreign", { precision: 24, scale: 6 }).notNull(), exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  amountBdt: numeric("amount_bdt", { precision: 24, scale: 2 }).notNull(),
  data: jsonb("data").$type<Omit<ImportCostLine, "amountForeign" | "exchangeRate" | "amountBdt">>().notNull()
}, (t) => [index("cost_import_idx").on(t.importId)]).enableRLS();

export const landedSnapshots = erp.table("landed_cost_snapshots", {
  id: text("id").primaryKey(), importId: text("import_id").notNull().references(() => importCases.id),
  version: integer("version").notNull(), data: jsonb("data").$type<LandedCostSnapshot>().notNull(),
  totalProductValueBdt: numeric("total_product_value_bdt", { precision: 24, scale: 2 }).notNull(),
  totalAdditionalCostBdt: numeric("total_additional_cost_bdt", { precision: 24, scale: 2 }).notNull(),
  totalShipmentCostBdt: numeric("total_shipment_cost_bdt", { precision: 24, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("snapshot_case_version_unique").on(t.importId, t.version)]).enableRLS();

export const warehouseReceipts = erp.table("warehouse_receipts", {
  id: text("id").primaryKey(), importId: text("import_id").notNull().references(() => importCases.id),
  snapshotId: text("snapshot_id").notNull().references(() => landedSnapshots.id),
  receiptNumber: text("receipt_number").notNull().unique(), receivedDate: date("received_date").notNull(),
  receivedBy: text("received_by").notNull().references(() => employees.id), receivedByName: text("received_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("receipt_import_idx").on(t.importId)]).enableRLS();

export const receiptLines = erp.table("receipt_lines", {
  id: text("id").primaryKey(), receiptId: text("receipt_id").notNull().references(() => warehouseReceipts.id),
  importItemId: text("import_item_id").notNull().references(() => importItems.id),
  quantityReceived: numeric("quantity_received", { precision: 18, scale: 4 }).notNull(), quantityRejected: numeric("quantity_rejected", { precision: 18, scale: 4 }).notNull(),
  lotNumber: text("lot_number").notNull(), batchNumber: text("batch_number").notNull(),
  manufacturingDate: date("manufacturing_date"), expiryDate: date("expiry_date"),
  warehouse: text("warehouse").notNull(), location: text("location").notNull(),
  landedCostPerUnit: numeric("landed_cost_per_unit", { precision: 28, scale: 10 }).notNull(),
  inventoryValueBdt: numeric("inventory_value_bdt", { precision: 24, scale: 2 }).notNull()
}, (t) => [index("receipt_line_item_idx").on(t.importItemId), check("receipt_quantity", sql`${t.quantityReceived} >= 0 and ${t.quantityRejected} >= 0 and ${t.quantityReceived} + ${t.quantityRejected} > 0`)]).enableRLS();

export const purchaseReceipts = erp.table("purchase_receipts", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), supplierId: text("supplier_id").notNull().references(() => suppliers.id), supplierName: text("supplier_name").notNull(),
  reference: text("reference").notNull(), receivedDate: date("received_date").notNull(), currency: text("currency").notNull(), exchangeRate: numeric("exchange_rate", { precision: 18, scale: 6 }).notNull(),
  totalBdt: numeric("total_bdt", { precision: 24, scale: 2 }).notNull(), notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull().references(() => employees.id), createdByName: text("created_by_name").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("purchase_supplier_reference_unique").on(t.supplierId, sql`lower(btrim(${t.reference}))`), check("purchase_header_values", sql`${t.totalBdt}>0 and ${t.exchangeRate}>0 and ${t.currency} ~ '^[A-Z]{3}$'`)]).enableRLS();
export const purchaseLines = erp.table("purchase_lines", {
  id: text("id").primaryKey(), receiptId: text("receipt_id").notNull().references(() => purchaseReceipts.id), productId: text("product_id").notNull().references(() => products.id),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), unitPrice: numeric("unit_price", { precision: 18, scale: 6 }).notNull(), valueBdt: numeric("value_bdt", { precision: 24, scale: 2 }).notNull()
}, (t) => [index("purchase_line_receipt_idx").on(t.receiptId), check("purchase_line_values", sql`${t.quantity}>0 and ${t.unitPrice}>0 and ${t.valueBdt}>0`)]).enableRLS();

export const stockBatches = erp.table("stock_batches", {
  purchaseLineId: text("purchase_line_id").unique().references(() => purchaseLines.id),
  replacementReceiptId: text("replacement_receipt_id").unique().references((): AnyPgColumn => supplierReplacementReceipts.id),
  returnLineId: text("return_line_id").unique().references((): AnyPgColumn => customerReturnLines.id),
  id: text("id").primaryKey(), productId: text("product_id").notNull().references(() => products.id), receiptLineId: text("receipt_line_id").unique().references(() => receiptLines.id),
  sourceImportId: text("source_import_id").references(() => importCases.id), sourceReference: text("source_reference").notNull(),
  openingPositionId: text("opening_position_id").unique().references(() => openingPositions.id),
  correctionLineId: text("correction_line_id").unique().references((): AnyPgColumn => stockControlLines.id),
  condition: text("condition").$type<"Saleable" | "Quarantine" | "Damaged" | "Expired">().notNull().default("Saleable"),
  lotNumber: text("lot_number").notNull(), batchNumber: text("batch_number").notNull(),
  manufacturingDate: date("manufacturing_date").notNull(), expiryDate: date("expiry_date").notNull(), receivedDate: date("received_date").notNull(),
  quantityReceived: numeric("quantity_received", { precision: 18, scale: 4 }).notNull(), quantityAvailable: numeric("quantity_available", { precision: 18, scale: 4 }).notNull(),
  landedCostPerUnit: numeric("landed_cost_per_unit", { precision: 28, scale: 10 }).notNull(),
  receivedValueBdt: numeric("received_value_bdt", { precision: 24, scale: 2 }).notNull(), availableValueBdt: numeric("available_value_bdt", { precision: 24, scale: 2 }).notNull(),
  warehouse: text("warehouse").notNull(), location: text("location").notNull()
}, (t) => [check("batch_source", sql`num_nonnulls(${t.openingPositionId},${t.receiptLineId},${t.correctionLineId},${t.returnLineId},${t.replacementReceiptId},${t.purchaseLineId})=1 and ((${t.receiptLineId} is not null and ${t.sourceImportId} is not null) or (${t.receiptLineId} is null and ${t.sourceImportId} is null))`),
  check("batch_condition", sql`${t.condition} in ('Saleable','Quarantine','Damaged','Expired')`),
  uniqueIndex("batch_number_lower_unique").on(sql`lower(${t.batchNumber})`), index("batch_fifo_idx").on(t.productId, t.receivedDate, t.id), check("batch_integrity", sql`${t.quantityReceived} > 0 and ${t.quantityAvailable} >= 0 and ${t.quantityAvailable} <= ${t.quantityReceived} and ${t.availableValueBdt} >= 0 and ${t.expiryDate} > ${t.manufacturingDate}`)]).enableRLS();

export const stockMovements = erp.table("stock_movements", {
  id: text("id").primaryKey(), batchId: text("batch_id").notNull().references(() => stockBatches.id),
  type: text("type").$type<"Receive" | "Opening" | "Dispatch" | "Return" | "Adjustment" | "Supplier Return">().notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), valueBdt: numeric("value_bdt", { precision: 24, scale: 2 }).notNull(),
  adjustmentSign: integer("adjustment_sign"),
  quantityDelta: numeric("quantity_delta", { precision: 18, scale: 4 }).generatedAlwaysAs(sql`case when type in ('Receive','Opening','Return') then quantity when type='Dispatch' then -quantity else quantity*adjustment_sign end`),
  valueDeltaBdt: numeric("value_delta_bdt", { precision: 24, scale: 2 }).generatedAlwaysAs(sql`case when type in ('Receive','Opening','Return') then value_bdt when type='Dispatch' then -value_bdt else value_bdt*adjustment_sign end`),
  date: date("date").notNull(), reference: text("reference").notNull(),
  createdBy: text("created_by").notNull().references(() => employees.id), createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("movement_batch_idx").on(t.batchId, t.date), index("movement_date_idx").on(t.date, t.id), check("movement_quantity", sql`${t.quantity} > 0`),
  check("movement_direction", sql`${t.valueBdt}>=0 and ((${t.type}='Adjustment' and ${t.adjustmentSign} is not null and ${t.adjustmentSign} in (-1,1)) or (${t.type}='Supplier Return' and ${t.adjustmentSign}=-1) or (${t.type} in ('Receive','Opening','Dispatch','Return') and ${t.adjustmentSign} is null))`)]).enableRLS();

export const postingKeys = erp.table("posting_keys", {
  id: text("id").primaryKey(), requestHash: text("request_hash").notNull(), resourceId: text("resource_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}).enableRLS();

export const customers = erp.table("customers", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  type: text("type").$type<"Hospital" | "Clinic" | "Dealer" | "Pharmacy" | "Other">().notNull(),
  contactPerson: text("contact_person").notNull().default(""), phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""), address: text("address").notNull().default(""), territory: text("territory").notNull().default(""),
  assignedSalesUserId: text("assigned_sales_user_id").references(() => employees.id),
  paymentTerms: text("payment_terms").notNull().default(""), creditLimit: numeric("credit_limit", { precision: 24, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("customer_owner_idx").on(t.assignedSalesUserId, t.id), check("customer_credit_limit", sql`${t.creditLimit} >= 0`), check("customer_type", sql`${t.type} in ('Hospital','Clinic','Dealer','Pharmacy','Other')`)]).enableRLS();

type CustomerSnapshot = Pick<Quotation, "customerName" | "customerAddressSnapshot" | "customerPhoneSnapshot" | "customerContactSnapshot">;
export const quotations = erp.table("quotations", {
  id: text("id").primaryKey(), quotationNumber: text("quotation_number").notNull().unique(), date: date("date").notNull(),
  customerId: text("customer_id").notNull().references(() => customers.id), ownerId: text("owner_id").notNull().references(() => employees.id),
  snapshot: jsonb("snapshot").$type<CustomerSnapshot>().notNull(),
  status: text("status").$type<Quotation["status"]>().notNull().default("Draft"), archived: boolean("archived").notNull().default(false),
  validityDays: integer("validity_days").notNull(), paymentTerms: text("payment_terms").notNull(), remarks: text("remarks").notNull().default(""),
  subtotal: numeric("subtotal", { precision: 24, scale: 2 }).notNull(), discountTotal: numeric("discount_total", { precision: 24, scale: 2 }).notNull(), total: numeric("total", { precision: 24, scale: 2 }).notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => employees.id), version: integer("version").notNull().default(1),
  submittedAt: timestamp("submitted_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("quotation_owner_date_idx").on(t.ownerId, t.date), check("quotation_status", sql`${t.status} in ('Draft','Sent','Accepted','Rejected','Converted')`), check("quotation_totals", sql`${t.subtotal} >= 0 and ${t.discountTotal} >= 0 and ${t.total} = ${t.subtotal} - ${t.discountTotal} and ${t.total} >= 0`)]).enableRLS();

function salesLineColumns() {
  return { id: text("id").primaryKey(), position: integer("position").notNull(), productId: text("product_id").notNull().references(() => products.id),
    productCode: text("product_code").notNull(), productName: text("product_name").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 24, scale: 2 }).notNull(), lineTotal: numeric("line_total", { precision: 24, scale: 2 }).notNull() };
}
export const quotationLines = erp.table("quotation_lines", {
  ...salesLineColumns(), quotationId: text("quotation_id").notNull().references(() => quotations.id)
}, (t) => [uniqueIndex("quotation_product_unique").on(t.quotationId, t.productId), check("quotation_line_integrity", sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.lineTotal} = round(${t.quantity} * ${t.unitPrice}, 2) - ${t.discount} and ${t.lineTotal} >= 0`)]).enableRLS();

export type OrderInstructions = Pick<SalesOrder, "paymentConditions" | "deliveryInstruction" | "paymentConfirmation" | "paymentReference" | "paymentDate" | "requestedDeliveryDate" | "orderReceivedByName" | "orderReceivedByDesignation" | "orderGivenBy" | "headOfSalesSignoff" | "coeSignoff" | "mdSignoff">;
export const salesOrders = erp.table("sales_orders", {
  id: text("id").primaryKey(), orderNumber: text("order_number").notNull().unique(), quotationId: text("quotation_id").unique().references(() => quotations.id),
  date: date("date").notNull(), customerId: text("customer_id").notNull().references(() => customers.id), ownerId: text("owner_id").notNull().references(() => employees.id),
  snapshot: jsonb("snapshot").$type<CustomerSnapshot>().notNull(), instructions: jsonb("instructions").$type<OrderInstructions>().notNull(),
  status: text("status").$type<SalesOrder["status"]>().notNull().default("Placed"), total: numeric("total", { precision: 24, scale: 2 }).notNull(),
  version: integer("version").notNull().default(1), createdByUserId: text("created_by_user_id").notNull().references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("order_owner_date_idx").on(t.ownerId, t.date), check("order_status", sql`${t.status} in ('Placed','Ready','Partially Delivered','Delivered','Cancelled')`), check("order_total", sql`${t.total} >= 0`)]).enableRLS();

export const orderLines = erp.table("order_lines", {
  ...salesLineColumns(), orderId: text("order_id").notNull().references(() => salesOrders.id)
}, (t) => [uniqueIndex("order_product_unique").on(t.orderId, t.productId), check("order_line_integrity", sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.lineTotal} = round(${t.quantity} * ${t.unitPrice}, 2) - ${t.discount} and ${t.lineTotal} >= 0`)]).enableRLS();

export const customerEntries = erp.table("customer_entries", {
  openingPositionId: text("opening_position_id").unique().references(() => openingPositions.id),
  id: text("id").primaryKey(), customerId: text("customer_id").notNull().references(() => customers.id), orderId: text("order_id").references(() => salesOrders.id),
  date: date("date").notNull(), type: text("type").$type<"Opening Due" | "Invoice" | "Collection" | "Reversal" | "Return Credit" | "Return Refund" | "Credit Transfer In" | "Credit Transfer Out">().notNull(),
  sourceId: text("source_id").notNull(), reference: text("reference").notNull(),
  invoiceId: text("invoice_id").references(() => salesInvoices.id), collectionId: text("collection_id").references(() => collections.id),
  debit: numeric("debit", { precision: 24, scale: 2 }).notNull().default("0"), credit: numeric("credit", { precision: 24, scale: 2 }).notNull().default("0"),
  remarks: text("remarks").notNull().default(""), createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("customer_ledger_date_idx").on(t.customerId, t.date, t.createdAt), index("customer_journal_date_idx").on(t.date, t.id), index("customer_journal_collection_idx").on(t.collectionId, t.date), uniqueIndex("customer_entry_source_unique").on(t.type, t.sourceId), check("customer_entry_amount", sql`(${t.debit} > 0 and ${t.credit} = 0) or (${t.credit} > 0 and ${t.debit} = 0)`)]).enableRLS();

export const deliveries = erp.table("deliveries", {
  id: text("id").primaryKey(), challanNumber: text("challan_number").notNull().unique(), orderId: text("order_id").notNull().references(() => salesOrders.id),
  customerId: text("customer_id").notNull().references(() => customers.id), customerName: text("customer_name").notNull(), ownerId: text("owner_id").notNull().references(() => employees.id),
  date: date("date").notNull(), remarks: text("remarks").notNull().default(""), receiverName: text("receiver_name").notNull().default(""), overrideReason: text("override_reason").notNull().default(""),
  dispatchedBy: text("dispatched_by").notNull().references(() => employees.id), postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("delivery_order_date_idx").on(t.orderId, t.date)]).enableRLS();

export const deliveryLines = erp.table("delivery_lines", {
  ...salesLineColumns(), deliveryId: text("delivery_id").notNull().references(() => deliveries.id),
  orderLineId: text("order_line_id").notNull().references(() => orderLines.id),
  batchId: text("batch_id").notNull().references(() => stockBatches.id), batchNumber: text("batch_number").notNull(),
  stockMovementId: text("stock_movement_id").notNull().unique().references(() => stockMovements.id),
  costBdt: numeric("cost_bdt", { precision: 24, scale: 2 }).notNull()
}, (t) => [index("delivery_line_order_idx").on(t.orderLineId), check("delivery_line_values", sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.lineTotal} >= 0 and ${t.costBdt} >= 0`)]).enableRLS();

export const salesInvoices = erp.table("sales_invoices", {
  id: text("id").primaryKey(), invoiceNumber: text("invoice_number").notNull().unique(), orderId: text("order_id").notNull().references(() => salesOrders.id),
  customerId: text("customer_id").notNull().references(() => customers.id), ownerId: text("owner_id").notNull().references(() => employees.id), snapshot: jsonb("snapshot").$type<CustomerSnapshot>().notNull(),
  date: date("date").notNull(), status: text("status").$type<"Draft" | "Approved" | "Cancelled">().notNull().default("Draft"), remarks: text("remarks").notNull().default(""),
  subtotal: numeric("subtotal", { precision: 24, scale: 2 }).notNull(), discountTotal: numeric("discount_total", { precision: 24, scale: 2 }).notNull(), total: numeric("total", { precision: 24, scale: 2 }).notNull(),
  version: integer("version").notNull().default(1), createdBy: text("created_by").notNull().references(() => employees.id),
  approvedBy: text("approved_by").references(() => employees.id), approvedAt: timestamp("approved_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by").references(() => employees.id), cancelledAt: timestamp("cancelled_at", { withTimezone: true }), cancellationReason: text("cancellation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("invoice_customer_date_idx").on(t.customerId, t.date), index("invoice_order_idx").on(t.orderId), index("invoice_owner_date_idx").on(t.ownerId, t.date), index("invoice_date_idx").on(t.date, t.id), check("invoice_status", sql`${t.status} in ('Draft','Approved','Cancelled')`), check("invoice_totals", sql`${t.subtotal} >= 0 and ${t.discountTotal} >= 0 and ${t.total} = ${t.subtotal} - ${t.discountTotal} and ${t.total} >= 0`)]).enableRLS();

export const invoiceDeliveries = erp.table("invoice_deliveries", {
  invoiceId: text("invoice_id").notNull().references(() => salesInvoices.id), deliveryId: text("delivery_id").notNull().references(() => deliveries.id),
  active: boolean("active").notNull().default(true)
}, (t) => [uniqueIndex("invoice_delivery_pair_unique").on(t.invoiceId, t.deliveryId), uniqueIndex("delivery_active_invoice_unique").on(t.deliveryId).where(sql`${t.active}`)]).enableRLS();

export const invoiceLines = erp.table("invoice_lines", {
  costBdt: numeric("cost_bdt", { precision: 24, scale: 2 }),
  refusalLineIds: jsonb("refusal_line_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ...salesLineColumns(), invoiceId: text("invoice_id").notNull().references(() => salesInvoices.id), deliveryLineId: text("delivery_line_id").notNull().references(() => deliveryLines.id)
}, (t) => [index("invoice_lines_parent_idx").on(t.invoiceId), uniqueIndex("invoice_delivery_line_unique").on(t.invoiceId, t.deliveryLineId), check("invoice_line_values", sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discount} >= 0 and ${t.lineTotal} >= 0`)]).enableRLS();

export const cashAccounts = erp.table("cash_accounts", {
  id: text("id").primaryKey(), name: text("name").notNull(), type: text("type").$type<"Cash" | "Bank" | "Mobile Banking">().notNull(), accountNumber: text("account_number").notNull().default(""),
  active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1), createdBy: text("created_by").notNull().references(() => employees.id)
}, (t) => [uniqueIndex("cash_account_name_unique").on(sql`lower(${t.name})`), check("cash_account_type", sql`${t.type} in ('Cash','Bank','Mobile Banking')`)]).enableRLS();

export const collections = erp.table("collections", {
  id: text("id").primaryKey(), receiptNumber: text("receipt_number").notNull().unique(), customerId: text("customer_id").notNull().references(() => customers.id), customerName: text("customer_name").notNull(),
  orderId: text("order_id").references(() => salesOrders.id), invoiceId: text("invoice_id").references(() => salesInvoices.id), ownerId: text("owner_id").notNull().references(() => employees.id),
  date: date("date").notNull(), amount: numeric("amount", { precision: 24, scale: 2 }).notNull(), paymentMode: text("payment_mode").$type<"Cash" | "bKash" | "Bank Transfer" | "Cheque">().notNull(),
  accountId: text("account_id").notNull().references(() => cashAccounts.id), referenceNumber: text("reference_number").notNull().default(""), remarks: text("remarks").notNull().default(""),
  status: text("status").$type<"Posted" | "Reversed">().notNull().default("Posted"), postedBy: text("posted_by").notNull().references(() => employees.id), postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  reversedBy: text("reversed_by").references(() => employees.id), reversedAt: timestamp("reversed_at", { withTimezone: true }), reversalReason: text("reversal_reason")
}, (t) => [index("collection_customer_date_idx").on(t.customerId, t.date), check("collection_amount", sql`${t.amount} > 0`), check("collection_status", sql`${t.status} in ('Posted','Reversed')`), check("collection_payment_mode", sql`${t.paymentMode} in ('Cash','bKash','Bank Transfer','Cheque')`)]).enableRLS();

export const collectionAllocations = erp.table("collection_allocations", {
  id: text("id").primaryKey(), collectionId: text("collection_id").notNull().references(() => collections.id), receivableEntryId: text("receivable_entry_id").notNull().references(() => customerEntries.id),
  amount: numeric("amount", { precision: 24, scale: 2 }).notNull()
}, (t) => [uniqueIndex("collection_entry_unique").on(t.collectionId, t.receivableEntryId), index("allocation_receivable_idx").on(t.receivableEntryId), check("allocation_positive", sql`${t.amount} > 0`)]).enableRLS();

export const accountTransactions = erp.table("account_transactions", {
  openingPositionId: text("opening_position_id").unique().references(() => openingPositions.id),
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => cashAccounts.id), accountName: text("account_name").notNull(), date: date("date").notNull(),
  direction: text("direction").$type<"In" | "Out">().notNull(), amount: numeric("amount", { precision: 24, scale: 2 }).notNull(),
  sourceType: text("source_type").$type<"Collection" | "Expense" | "Supplier Payment" | "Import Cost" | "Opening Balance" | "Advance" | "Company Loan" | "Manual Authorized" | "Return Refund" | "Payroll Payment" | "Payroll Advance" | "Payroll Loan">().notNull(), sourceId: text("source_id").notNull(),
  collectionId: text("collection_id").references(() => collections.id), reversalOfId: text("reversal_of_id").unique().references((): AnyPgColumn => accountTransactions.id),
  description: text("description").notNull(), partyId: text("party_id"), partyName: text("party_name"), reference: text("reference"), remarks: text("remarks"), voucherNumber: text("voucher_number").notNull().unique(),
  createdByUserId: text("created_by_user_id").notNull().references(() => employees.id), createdByName: text("created_by_name").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("account_transaction_date_idx").on(t.accountId, t.date, t.createdAt), index("account_journal_date_idx").on(t.date, t.id), uniqueIndex("account_source_unique").on(t.sourceType, t.sourceId), check("account_transaction_values", sql`${t.amount} > 0 and ${t.direction} in ('In','Out')`)]).enableRLS();

export const expenseCategories = erp.table("expense_categories", {
  id: text("id").primaryKey(), name: text("name").notNull(), active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1)
}, (t) => [uniqueIndex("expense_category_name_unique").on(sql`lower(btrim(${t.name}))`)]).enableRLS();

function reversalColumns() {
  return { status: text("status").$type<"Posted" | "Reversed">().notNull().default("Posted"), reversedBy: text("reversed_by").references(() => employees.id), reversedAt: timestamp("reversed_at", { withTimezone: true }), reversalDate: date("reversal_date"), reversalReason: text("reversal_reason") };
}
export type ExpenseAttribution = Pick<Expense, "expenseForId" | "expenseForName" | "employee" | "employeeCode" | "designation" | "department">;
export const expenses = erp.table("expenses", {
  id: text("id").primaryKey(), date: date("date").notNull(), categoryId: text("category_id").notNull().references(() => expenseCategories.id), categoryName: text("category_name").notNull(),
  subtype: text("subtype").$type<"General" | "TA/DA">().notNull(), amount: numeric("amount", { precision: 24, scale: 2 }).notNull(),
  paidFromAccountId: text("paid_from_account_id").notNull().references(() => cashAccounts.id), transactionId: text("transaction_id").notNull().unique().references(() => accountTransactions.id),
  expenseFor: text("expense_for").$type<Expense["expenseFor"]>().notNull(), employeeId: text("employee_id").references(() => employees.id), attribution: jsonb("attribution").$type<ExpenseAttribution>().notNull(),
  taAmount: numeric("ta_amount", { precision: 24, scale: 2 }), daAmount: numeric("da_amount", { precision: 24, scale: 2 }), remarks: text("remarks").notNull(),
  enteredByUserId: text("entered_by_user_id").notNull().references(() => employees.id), enteredByName: text("entered_by_name").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), ...reversalColumns()
}, (t) => [index("expense_date_idx").on(t.date, t.id), check("expense_amount", sql`${t.amount} > 0 and ((${t.subtype} = 'General' and ${t.taAmount} is null and ${t.daAmount} is null) or (${t.subtype} = 'TA/DA' and ${t.expenseFor} = 'Employee' and ${t.taAmount} is not null and ${t.daAmount} is not null and ${t.taAmount} >= 0 and ${t.daAmount} >= 0 and ${t.amount} = ${t.taAmount} + ${t.daAmount}))`), check("expense_employee", sql`(${t.expenseFor} = 'Employee' and ${t.employeeId} is not null) or (${t.expenseFor} in ('Office','Warehouse','Company / General') and ${t.employeeId} is null)`), check("expense_status", sql`${t.status} in ('Posted','Reversed')`)]).enableRLS();

export const supplierSettlements = erp.table("supplier_settlements", {
  purchaseReceiptId: text("purchase_receipt_id").unique().references(() => purchaseReceipts.id),
  supplierClaimId:text("supplier_claim_id").unique().references(():AnyPgColumn=>supplierClaims.id),
  openingPositionId: text("opening_position_id").unique().references(() => openingPositions.id),
  id: text("id").primaryKey(), date: date("date").notNull(), supplierId: text("supplier_id").notNull().references(() => suppliers.id), supplierName: text("supplier_name").notNull(),
  importId: text("import_id").references(() => importCases.id), reference: text("reference").notNull(), entryType: text("entry_type").$type<"Obligation" | "Payment" | "Opening Advance" | "Credit">().notNull(), amount: numeric("amount", { precision: 24, scale: 2 }).notNull(),
  accountId: text("account_id").references(() => cashAccounts.id), accountName: text("account_name"), transactionId: text("transaction_id").unique().references(() => accountTransactions.id),
  paymentReference: text("payment_reference").notNull().default(""), notes: text("notes").notNull().default(""),
  createdByUserId: text("created_by_user_id").notNull().references(() => employees.id), createdByName: text("created_by_name").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), ...reversalColumns()
}, (t) => [index("supplier_settlement_date_idx").on(t.supplierId, t.date, t.id), index("supplier_journal_date_idx").on(t.date, t.id), check("supplier_settlement_values", sql`${t.amount} > 0 and ((${t.entryType} = 'Payment' and ${t.accountId} is not null and ${t.transactionId} is not null) or (${t.entryType} in ('Obligation','Opening Advance','Credit') and ${t.accountId} is null and ${t.transactionId} is null and (${t.entryType}<>'Opening Advance' or ${t.openingPositionId} is not null))) and ((${t.entryType}='Credit')=(${t.supplierClaimId} is not null))`), check("supplier_settlement_status", sql`${t.status} in ('Posted','Reversed')`)]).enableRLS();

export const financialPositionEntries = erp.table("financial_position_entries", {
  id: text("id").primaryKey(), asOfDate: date("as_of_date").notNull(), category: text("category").$type<FinancialPositionEntry["category"]>().notNull(), label: text("label").notNull(), amount: numeric("amount", { precision: 24, scale: 2 }).notNull(), reference: text("reference").notNull(), notes: text("notes").notNull().default(""),
  createdByUserId: text("created_by_user_id").notNull().references(() => employees.id), createdByName: text("created_by_name").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), ...reversalColumns()
}, (t) => [index("position_as_of_idx").on(t.asOfDate, t.id), check("position_amount", sql`${t.amount} > 0`), check("position_category", sql`${t.category} in ('Owner Capital','Fixed Assets','Accumulated Depreciation','Statutory Payables','Other Receivables','Other Payables','Opening Retained Earnings')`), check("position_status", sql`${t.status} in ('Posted','Reversed')`)]).enableRLS();

export const marketingLeads = erp.table("marketing_leads", {
  id: text("id").primaryKey(), reference: text("reference").notNull().unique(), assignedTo: text("assigned_to").notNull().references(() => employees.id),
  organization: text("organization").notNull(), organizationType: text("organization_type").notNull(), contact: text("contact").notNull(), phone: text("phone").notNull(), email: text("email").notNull().default(""), address: text("address").notNull().default(""), source: text("source").notNull(),
  stage: text("stage").notNull().default("NEW"), notes: text("notes").notNull().default(""), lostReason: text("lost_reason").notNull().default(""), nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  customerId: text("customer_id").unique().references(() => customers.id), qualifiedAt: timestamp("qualified_at", { withTimezone: true }), convertedAt: timestamp("converted_at", { withTimezone: true }),
  version: integer("version").notNull().default(1), createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("lead_owner_created_idx").on(t.assignedTo, t.createdAt), check("lead_stage", sql`${t.stage} in ('NEW','CONTACTED','INTERESTED','PRESENTATION','SAMPLE','NEGOTIATION','LOST')`), check("lead_conversion", sql`(${t.customerId} is null) = (${t.convertedAt} is null)`), check("lead_lost_reason", sql`${t.stage} <> 'LOST' or length(btrim(${t.lostReason})) >= 5`)]).enableRLS();

export const leadProducts = erp.table("lead_products", { leadId: text("lead_id").notNull().references(() => marketingLeads.id), productId: text("product_id").notNull().references(() => products.id) }, (t) => [uniqueIndex("lead_product_unique").on(t.leadId,t.productId)]).enableRLS();

export type EmployeeActivitySnapshot = { name: string; employeeCode: string; title: string; department: string; territory: string };
export const marketingActivities = erp.table("marketing_activities", {
  id: text("id").primaryKey(), reference: text("reference").notNull().unique(), employeeId: text("employee_id").notNull().references(() => employees.id), snapshot: jsonb("snapshot").$type<EmployeeActivitySnapshot>().notNull(),
  type: text("type").notNull(), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), submittedAt: timestamp("submitted_at", { withTimezone: true }),
  status: text("status").$type<"Draft"|"Submitted"|"Voided">().notNull().default("Draft"), leadId: text("lead_id").references(() => marketingLeads.id), customerId: text("customer_id").references(() => customers.id), subject: text("subject").notNull().default(""),
  purpose: text("purpose").notNull(), remarks: text("remarks").notNull().default(""), nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }), voidedBy: text("voided_by").references(() => employees.id), voidReason: text("void_reason"), version: integer("version").notNull().default(1), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("activity_employee_date_idx").on(t.employeeId,t.occurredAt,t.id), index("activity_date_idx").on(t.occurredAt,t.id), check("activity_status", sql`${t.status} in ('Draft','Submitted','Voided')`), check("activity_subject", sql`not (${t.customerId} is not null and ${t.leadId} is not null)`), check("activity_submission", sql`${t.status} <> 'Submitted' or ${t.submittedAt} is not null`)]).enableRLS();

export const activityProducts = erp.table("activity_products", { activityId: text("activity_id").notNull().references(() => marketingActivities.id), productId: text("product_id").notNull().references(() => products.id) }, (t) => [uniqueIndex("activity_product_unique").on(t.activityId,t.productId)]).enableRLS();

export const marketingFollowUps = erp.table("marketing_follow_ups", {
  id: text("id").primaryKey(), assignedTo: text("assigned_to").notNull().references(() => employees.id), leadId: text("lead_id").references(() => marketingLeads.id), customerId: text("customer_id").references(() => customers.id), subject: text("subject").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(), purpose: text("purpose").notNull(), status: text("status").$type<"Pending"|"Completed"|"Cancelled">().notNull().default("Pending"), outcome: text("outcome").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }), successorId: text("successor_id").unique().references((): AnyPgColumn => marketingFollowUps.id), version: integer("version").notNull().default(1), createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("follow_up_owner_due_idx").on(t.assignedTo,t.dueAt,t.id), check("follow_up_status", sql`${t.status} in ('Pending','Completed','Cancelled')`), check("follow_up_subject", sql`(${t.customerId} is not null)::integer + (${t.leadId} is not null)::integer = 1`), check("follow_up_completion", sql`${t.status} <> 'Completed' or (${t.completedAt} is not null and length(btrim(${t.outcome})) >= 3)`)]).enableRLS();

export const marketingPlans = erp.table("marketing_plans", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id), kind: text("kind").$type<"Daily"|"Monthly">().notNull(), period: date("period").notNull(),
  status: text("status").$type<"Draft"|"Submitted"|"Approved"|"Rejected">().notNull().default("Draft"), data: jsonb("data").$type<PlanData>().notNull(), reviewedBy: text("reviewed_by").references(() => employees.id), reviewReason: text("review_reason").notNull().default(""), version: integer("version").notNull().default(1), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("plan_owner_period_unique").on(t.employeeId,t.kind,t.period), check("plan_kind", sql`${t.kind} in ('Daily','Monthly')`), check("plan_status", sql`${t.status} in ('Draft','Submitted','Approved','Rejected')`), check("plan_month", sql`${t.kind} <> 'Monthly' or extract(day from ${t.period}) = 1`)]).enableRLS();

export const marketingTargets = erp.table("marketing_targets", {
  id: text("id").primaryKey(), employeeId: text("employee_id").notNull().references(() => employees.id), month: date("month").notNull(), sales: numeric("sales", { precision:24,scale:2 }).notNull(), collections: numeric("collections", { precision:24,scale:2 }).notNull(), customers: integer("customers").notNull(), activities: integer("activities").notNull(), visits: integer("visits").notNull(), version: integer("version").notNull().default(1), updatedBy: text("updated_by").notNull().references(() => employees.id), updatedAt: timestamp("updated_at", { withTimezone:true }).notNull().defaultNow()
}, (t) => [uniqueIndex("target_owner_month_unique").on(t.employeeId,t.month), check("target_values", sql`${t.sales} >= 0 and ${t.collections} >= 0 and ${t.customers} >= 0 and ${t.activities} >= 0 and ${t.visits} >= 0 and extract(day from ${t.month}) = 1`)]).enableRLS();

export const marketingScoreRules = erp.table("marketing_score_rules", {
  event: text("event").primaryKey(), label: text("label").notNull(), points: integer("points").notNull(), active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1), updatedBy: text("updated_by").references(() => employees.id), updatedAt: timestamp("updated_at", {withTimezone:true}).notNull().defaultNow()
}, (t) => [check("score_points", sql`${t.points} between 0 and 1000`)]).enableRLS();

export const fieldVisitPolicies=erp.table("field_visit_policies",{
  id:text("id").primaryKey(),data:jsonb("data").$type<VisitPolicyData>().notNull(),version:integer("version").notNull().default(1),updatedBy:text("updated_by").references(()=>employees.id),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow()
},t=>[check("visit_policy_singleton",sql`${t.id}='company'`)]).enableRLS();
export const customerLocations=erp.table("customer_locations",{
  id:text("id").primaryKey(),customerId:text("customer_id").notNull().references(()=>customers.id),latitude:numeric("latitude",{precision:10,scale:7}).notNull(),longitude:numeric("longitude",{precision:10,scale:7}).notNull(),source:text("source").notNull(),version:integer("version").notNull(),confirmedBy:text("confirmed_by").notNull().references(()=>employees.id),confirmedAt:timestamp("confirmed_at",{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex("customer_location_version").on(t.customerId,t.version),check("site_coordinates",sql`${t.latitude} between -90 and 90 and ${t.longitude} between -180 and 180`)]).enableRLS();
export const fieldVisitAttempts=erp.table("field_visit_attempts",{
  id:text("id").primaryKey(),employeeId:text("employee_id").notNull().references(()=>employees.id),customerId:text("customer_id").references(()=>customers.id),leadId:text("lead_id").references(()=>marketingLeads.id),subject:text("subject").notNull(),purpose:text("purpose").notNull(),policy:jsonb("policy").$type<{version:number;data:VisitPolicyData}>().notNull(),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),consumedAt:timestamp("consumed_at",{withTimezone:true})
},t=>[index("visit_attempt_expiry").on(t.expiresAt),check("attempt_subject",sql`(${t.customerId} is not null)::integer+(${t.leadId} is not null)::integer=1`)]).enableRLS();
export const fieldVisits=erp.table("field_visits",{
  id:text("id").primaryKey(),reference:text("reference").notNull().unique(),attemptId:text("attempt_id").notNull().unique().references(()=>fieldVisitAttempts.id),employeeId:text("employee_id").notNull().references(()=>employees.id),snapshot:jsonb("snapshot").$type<EmployeeActivitySnapshot>().notNull(),customerId:text("customer_id").references(()=>customers.id),leadId:text("lead_id").references(()=>marketingLeads.id),subject:text("subject").notNull(),purpose:text("purpose").notNull(),receivedAt:timestamp("received_at",{withTimezone:true}).notNull().defaultNow(),completedAt:timestamp("completed_at",{withTimezone:true}),status:text("status").$type<"CheckedIn"|"Completed"|"Voided">().notNull().default("CheckedIn"),quality:text("quality").$type<"LOCATION_CAPTURED"|"POOR_ACCURACY"|"STALE"|"NO_LOCATION">().notNull(),match:text("match").$type<"NO_REFERENCE"|"APPROX_MATCH"|"OUTSIDE"|"UNCERTAIN"|"NO_LOCATION">().notNull(),review:text("review").$type<"Pending"|"Accepted"|"Rejected">().notNull().default("Pending"),position:jsonb("position").$type<VisitPosition|null>(),distanceMeters:numeric("distance_meters",{precision:14,scale:2}),siteId:text("site_id").references(()=>customerLocations.id),policy:jsonb("policy").$type<{version:number;data:VisitPolicyData}>().notNull(),photoId:uuid("photo_id").unique().references(()=>documents.id),photoMethod:text("photo_method").$type<"IN_APP_CAMERA"|"FILE_SELECTED"|"NONE">().notNull(),locationReason:text("location_reason").notNull().default(""),photoReason:text("photo_reason").notNull().default(""),outcome:text("outcome").notNull().default(""),activityId:text("activity_id").unique().references(()=>marketingActivities.id),version:integer("version").notNull().default(1)
},t=>[uniqueIndex("visit_one_active_owner").on(t.employeeId).where(sql`${t.status}='CheckedIn'`),index("visit_owner_date").on(t.employeeId,t.receivedAt,t.id),index("visit_customer_date").on(t.customerId,t.receivedAt),index("visit_review_date").on(t.review,t.receivedAt),check("visit_subject",sql`(${t.customerId} is not null)::integer+(${t.leadId} is not null)::integer=1`),check("visit_state",sql`${t.status} in ('CheckedIn','Completed','Voided') and ${t.review} in ('Pending','Accepted','Rejected')`)]).enableRLS();
export const fieldVisitEvents=erp.table("field_visit_events",{
  id:text("id").primaryKey(),visitId:text("visit_id").notNull().references(()=>fieldVisits.id),actorId:text("actor_id").notNull().references(()=>employees.id),type:text("type").notNull(),details:jsonb("details").$type<Record<string,unknown>>().notNull(),recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow()
},t=>[index("visit_event_timeline").on(t.visitId,t.recordedAt,t.id)]).enableRLS();

export const approvalPolicies = erp.table("approval_policies", {
  id: text("id").primaryKey(), domain: text("domain").$type<ControlDomain>().notNull(), data: jsonb("data").$type<ApprovalPolicyData>().notNull(),
  state: text("state").$type<"Draft" | "Approved" | "Retired">().notNull().default("Draft"), version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => employees.id), approvedBy: text("approved_by").references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("approval_one_policy_per_domain").on(t.domain).where(sql`${t.state}='Approved'`), check("approval_policy_state", sql`${t.state} in ('Draft','Approved','Retired') and ${t.domain}=${t.data}->>'domain' and (${t.state}<>'Approved' or ${t.approvedBy} is not null)`)]).enableRLS();

export const approvalRequests = erp.table("approval_requests", {
  id: text("id").primaryKey(), domain: text("domain").$type<ControlDomain>().notNull(), resourceType: text("resource_type").notNull(), resourceId: text("resource_id").notNull(), reference: text("reference").notNull(),
  payloadHash: text("payload_hash").notNull(), amountBdt: numeric("amount_bdt", { precision: 24, scale: 2 }).notNull(), policyId: text("policy_id").notNull().references(() => approvalPolicies.id),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  policyVersion: integer("policy_version").notNull(), policy: jsonb("policy").$type<ApprovalPolicyData>().notNull(),
  state: text("state").$type<"Submitted" | "Verified" | "Approved" | "Rejected" | "Posted">().notNull().default("Submitted"), version: integer("version").notNull().default(1),
  requestedBy: text("requested_by").notNull().references(() => employees.id), verifiedBy: text("verified_by").references(() => employees.id), approvedBy: text("approved_by").references(() => employees.id),
  verifiedAsSuperAdmin: boolean("verified_as_super_admin").notNull().default(false), approvedAsSuperAdmin: boolean("approved_as_super_admin").notNull().default(false),
  reason: text("reason").notNull().default(""), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("approval_resource_once").on(t.resourceType, t.resourceId), index("approval_pending_idx").on(t.domain, t.state, t.createdAt),
  check("approval_request_state", sql`${t.state} in ('Submitted','Verified','Approved','Rejected','Posted') and ${t.amountBdt}>=0 and (${t.state} not in ('Verified','Approved','Posted') or ${t.verifiedBy} is not null) and (${t.state} not in ('Approved','Posted') or ${t.approvedBy} is not null) and (not ${t.verifiedAsSuperAdmin} or ${t.verifiedBy} is not null) and (not ${t.approvedAsSuperAdmin} or ${t.approvedBy} is not null) and (${t.verifiedBy} is null or ${t.verifiedAsSuperAdmin} or ${t.verifiedBy}<>${t.requestedBy}) and (${t.approvedBy} is null or ((${t.approvedAsSuperAdmin} or ${t.approvedBy}<>${t.requestedBy}) and (${t.approvedAsSuperAdmin} or ${t.policy}->>'independentVerifier'<>'true' or ${t.approvedBy}<>${t.verifiedBy})))`)]).enableRLS();

export const approvalEvents = erp.table("approval_events", {
  id: text("id").primaryKey(), approvalId: text("approval_id").notNull().references(() => approvalRequests.id), actorId: text("actor_id").notNull().references(() => employees.id),
  version: integer("version").notNull(), action: text("action").notNull(), reason: text("reason").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("approval_events_idx").on(t.approvalId, t.createdAt, t.id), uniqueIndex("approval_event_version_unique").on(t.approvalId, t.version)]).enableRLS();

export const ledgerAccounts = erp.table("ledger_accounts", {
  id: text("id").primaryKey(), code: text("code").notNull(), name: text("name").notNull(), kind: text("kind").$type<"Asset" | "Liability" | "Equity" | "Income" | "Expense">().notNull(),
  active: boolean("active").notNull().default(true), createdBy: text("created_by").notNull().references(() => employees.id)
}, (t) => [uniqueIndex("ledger_account_code_unique").on(sql`lower(${t.code})`), check("ledger_account_kind", sql`${t.kind} in ('Asset','Liability','Equity','Income','Expense')`)]).enableRLS();

export const ledgerConfigurations = erp.table("ledger_configurations", {
  id: text("id").primaryKey(), data: jsonb("data").$type<LedgerConfigurationData>().notNull(), state: text("state").$type<"Draft" | "Approved" | "Retired">().notNull().default("Draft"),
  version: integer("version").notNull().default(1), createdBy: text("created_by").notNull().references(() => employees.id), approvedBy: text("approved_by").references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("ledger_one_configuration").on(t.state).where(sql`${t.state}='Approved'`), check("ledger_configuration_state", sql`${t.state} in ('Draft','Approved','Retired') and (${t.state}<>'Approved' or ${t.approvedBy} is not null)`)]).enableRLS();

export const ledgerJournals = erp.table("ledger_journals", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), date: date("date").notNull(), reference: text("reference").notNull(), description: text("description").notNull(),
  type: text("type").notNull(), state: text("state").$type<"Draft" | "Submitted" | "Posted" | "Rejected" | "Superseded">().notNull().default("Draft"), totalBdt: numeric("total_bdt", { precision: 24, scale: 2 }).notNull(),
  proofReference: text("proof_reference").notNull(), confidential: boolean("confidential").notNull().default(false), approvalId: text("approval_id").unique().references(() => approvalRequests.id),
  sourceKey: text("source_key").unique(), configurationId: text("configuration_id").references(() => ledgerConfigurations.id), reversalOfId: text("reversal_of_id").unique().references((): AnyPgColumn => ledgerJournals.id),
  revisionOfId: text("revision_of_id").references((): AnyPgColumn => ledgerJournals.id),
  version: integer("version").notNull().default(1), createdBy: text("created_by").notNull().references(() => employees.id), postedBy: text("posted_by").references(() => employees.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), postedAt: timestamp("posted_at", { withTimezone: true })
}, (t) => [index("ledger_posted_date_idx").on(t.state, t.date, t.id), check("ledger_journal_state", sql`${t.state} in ('Draft','Submitted','Posted','Rejected','Superseded') and ${t.totalBdt}>0 and (${t.state}<>'Posted' or (${t.postedBy} is not null and ${t.postedAt} is not null))`)]).enableRLS();

export const ledgerLines = erp.table("ledger_lines", {
  id: text("id").primaryKey(), journalId: text("journal_id").notNull().references(() => ledgerJournals.id), accountId: text("account_id").notNull().references(() => ledgerAccounts.id), position: integer("position").notNull(),
  debit: numeric("debit", { precision: 24, scale: 2 }).notNull(), credit: numeric("credit", { precision: 24, scale: 2 }).notNull(), note: text("note").notNull().default("")
}, (t) => [index("ledger_line_account_idx").on(t.accountId, t.journalId), uniqueIndex("ledger_line_position_unique").on(t.journalId, t.position), check("ledger_line_one_side", sql`(${t.debit}>0 and ${t.credit}=0) or (${t.credit}>0 and ${t.debit}=0)`)]).enableRLS();

export const ledgerPeriods = erp.table("ledger_periods", {
  id: text("id").primaryKey(), approvalId: text("approval_id").notNull().unique().references(() => approvalRequests.id), throughDate: date("through_date").notNull(), reason: text("reason").notNull(), createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("ledger_closed_through_idx").on(t.throughDate)]).enableRLS();

export const ledgerSourceEvents = erp.table("ledger_source_events", {
  id: text("id").primaryKey(), sourceKey: text("source_key").notNull().unique(), date: date("date").notNull(), reference: text("reference").notNull(), description: text("description").notNull(),
  plan: jsonb("plan").$type<LedgerPostingPlan>().notNull(), confidential: boolean("confidential").notNull().default(false),
  state: text("state").$type<"Deferred" | "Posted" | "Excluded">().notNull().default("Deferred"), reason: text("reason").notNull().default(""),
  journalId: text("journal_id").unique().references(() => ledgerJournals.id), configurationId: text("configuration_id").references(() => ledgerConfigurations.id),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("ledger_event_pending_idx").on(t.state, t.date, t.id), check("ledger_event_state", sql`${t.state} in ('Deferred','Posted','Excluded') and (${t.state}<>'Posted' or (${t.journalId} is not null and ${t.configurationId} is not null))`)]).enableRLS();

export const stockHolds = erp.table("stock_holds", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), batchId: text("batch_id").notNull().references(() => stockBatches.id),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), valueBdt: numeric("value_bdt", { precision: 24, scale: 2 }).notNull(),
  condition: text("condition").$type<"Quarantine" | "Damaged">().notNull(), date: date("date").notNull(),
  reason: text("reason").notNull(), proofReference: text("proof_reference").notNull(),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("stock_hold_batch_idx").on(t.batchId, t.date), check("stock_hold_values", sql`${t.quantity}>0 and ${t.valueBdt}>=0 and ${t.condition} in ('Quarantine','Damaged') and length(btrim(${t.reason}))>=5 and length(btrim(${t.proofReference}))>=3`)]).enableRLS();

export const stockHoldReleases = erp.table("stock_hold_releases", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), holdId: text("hold_id").notNull().references(() => stockHolds.id),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), valueBdt: numeric("value_bdt", { precision: 24, scale: 2 }).notNull(),
  reason: text("reason").notNull(), proofReference: text("proof_reference").notNull(), payloadHash: text("payload_hash").notNull(),
  state: text("state").$type<"Submitted" | "Posted">().notNull().default("Submitted"), version: integer("version").notNull().default(1),
  approvalId: text("approval_id").notNull().unique().references(() => approvalRequests.id),
  date: date("date"), postedBy: text("posted_by").references(() => employees.id), postedAt: timestamp("posted_at", { withTimezone: true }),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("stock_release_hold_idx").on(t.holdId, t.date), check("stock_release_values", sql`${t.quantity}>0 and ${t.valueBdt}>=0 and ${t.version}>0 and ${t.state} in ('Submitted','Posted') and (${t.state}<>'Posted' or (${t.date} is not null and ${t.postedBy} is not null and ${t.postedAt} is not null))`)]).enableRLS();

export const stockControls = erp.table("stock_controls", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), kind: text("kind").$type<"Physical Count" | "Write-off" | "Condition Release">().notNull(), countDate: date("count_date").notNull(),
  reason: text("reason").notNull(), inspection: text("inspection").notNull(), proofReference: text("proof_reference").notNull(),
  state: text("state").$type<"Draft" | "Submitted" | "Posted" | "Superseded">().notNull().default("Draft"), version: integer("version").notNull().default(1),
  totalBdt: numeric("total_bdt", { precision: 24, scale: 2 }), payloadHash: text("payload_hash").notNull(), preparerIds: jsonb("preparer_ids").$type<string[]>().notNull(),
  revisionOfId: text("revision_of_id").unique().references((): AnyPgColumn => stockControls.id), approvalId: text("approval_id").unique().references(() => approvalRequests.id),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  postedDate: date("posted_date"), postedBy: text("posted_by").references(() => employees.id), postedAt: timestamp("posted_at", { withTimezone: true })
}, (t) => [index("stock_control_state_idx").on(t.state, t.countDate, t.id), check("stock_control_state", sql`${t.kind} in ('Physical Count','Write-off','Condition Release') and ${t.state} in ('Draft','Submitted','Posted','Superseded') and ${t.version}>0 and (${t.totalBdt} is null or ${t.totalBdt}>=0) and (${t.state}<>'Posted' or (${t.postedDate} is not null and ${t.postedBy} is not null and ${t.postedAt} is not null))`)]).enableRLS();
export const stockControlLines = erp.table("stock_control_lines", {
  id: text("id").primaryKey(), controlId: text("control_id").notNull().references(() => stockControls.id), position: integer("position").notNull(), batchId: text("batch_id").notNull().references((): AnyPgColumn => stockBatches.id),
  holdId: text("hold_id").references(() => stockHolds.id), bookQuantity: numeric("book_quantity", { precision: 18, scale: 4 }).notNull(), countedQuantity: numeric("counted_quantity", { precision: 18, scale: 4 }).notNull(),
  deltaQuantity: numeric("delta_quantity", { precision: 18, scale: 4 }).notNull(), bookValueBdt: numeric("book_value_bdt", { precision: 24, scale: 2 }).notNull(), valueBdt: numeric("value_bdt", { precision: 24, scale: 2 }),
  heldQuantity: numeric("held_quantity", { precision: 18, scale: 4 }).notNull(), unitCostBdt: numeric("unit_cost_bdt", { precision: 28, scale: 10 }), surplusCondition: text("surplus_condition").$type<"Saleable" | "Quarantine" | "Damaged" | "Expired">(),
  fingerprint: text("fingerprint").notNull(), snapshot: jsonb("snapshot").$type<StockControlSnapshot>().notNull()
}, (t) => [uniqueIndex("stock_control_batch_unique").on(t.controlId, t.batchId), uniqueIndex("stock_control_line_position_unique").on(t.controlId, t.position), check("stock_control_line_values", sql`${t.bookQuantity}>=0 and ${t.countedQuantity}>=0 and ${t.bookValueBdt}>=0 and (${t.valueBdt} is null or ${t.valueBdt}>=0) and ${t.deltaQuantity}=${t.countedQuantity}-${t.bookQuantity} and ${t.heldQuantity}>=0`)]).enableRLS();
export const stockControlPostings = erp.table("stock_control_postings", {
  id: text("id").primaryKey(), lineId: text("line_id").notNull().unique().references(() => stockControlLines.id), batchId: text("batch_id").notNull().references((): AnyPgColumn => stockBatches.id),
  movementId: text("movement_id").unique().references(() => stockMovements.id), date: date("date").notNull(), createdBy: text("created_by").notNull().references(() => employees.id)
}).enableRLS();
export const stockHoldWriteoffs = erp.table("stock_hold_writeoffs", {
  id: text("id").primaryKey(), holdId: text("hold_id").notNull().references(() => stockHolds.id), lineId: text("line_id").notNull().unique().references(() => stockControlLines.id),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), date: date("date").notNull()
}, (t) => [index("stock_writeoff_hold_idx").on(t.holdId, t.date), check("stock_writeoff_positive", sql`${t.quantity}>0`)]).enableRLS();
export const stockConditionEvents = erp.table("stock_condition_events", {
  id: text("id").primaryKey(), lineId: text("line_id").notNull().unique().references(() => stockControlLines.id), batchId: text("batch_id").notNull().references((): AnyPgColumn => stockBatches.id),
  condition: text("condition").notNull().default("Saleable"), date: date("date").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("stock_condition_batch_idx").on(t.batchId, t.date), check("stock_condition_release", sql`${t.condition}='Saleable'`)]).enableRLS();

export const customerReturns = erp.table("customer_returns", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), kind: text("kind").$type<"Invoiced Return" | "Uninvoiced Refusal">().notNull(),
  deliveryId: text("delivery_id").notNull().references(() => deliveries.id), invoiceId: text("invoice_id").references(() => salesInvoices.id), customerId: text("customer_id").notNull().references(() => customers.id), orderId: text("order_id").notNull().references(() => salesOrders.id), ownerId: text("owner_id").notNull().references(() => employees.id),
  receivedDate: date("received_date").notNull(), reason: text("reason").notNull(), inspection: text("inspection").notNull(), proofReference: text("proof_reference").notNull(),
  creditBdt: numeric("credit_bdt", { precision: 24, scale: 2 }).notNull(), costBdt: numeric("cost_bdt", { precision: 24, scale: 2 }).notNull(), exposureBdt: numeric("exposure_bdt", { precision: 24, scale: 2 }).notNull(), appliedBdt: numeric("applied_bdt", { precision: 24, scale: 2 }),
  state: text("state").$type<"Draft" | "Submitted" | "Posted" | "Superseded">().notNull().default("Draft"), version: integer("version").notNull().default(1), payloadHash: text("payload_hash").notNull(), preparerIds: jsonb("preparer_ids").$type<string[]>().notNull(),
  revisionOfId: text("revision_of_id").unique().references((): AnyPgColumn => customerReturns.id), approvalId: text("approval_id").unique().references(() => approvalRequests.id),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), postedDate: date("posted_date"), postedBy: text("posted_by").references(() => employees.id), postedAt: timestamp("posted_at", { withTimezone: true })
}, (t) => [index("return_order_idx").on(t.orderId, t.receivedDate), index("return_customer_idx").on(t.customerId, t.postedDate), check("return_values", sql`${t.creditBdt}>=0 and ${t.costBdt}>=0 and ${t.exposureBdt}=${t.creditBdt}+${t.costBdt} and (${t.appliedBdt} is null or ${t.appliedBdt} between 0 and ${t.creditBdt}) and ${t.kind} in ('Invoiced Return','Uninvoiced Refusal') and (${t.kind}='Invoiced Return')=(${t.invoiceId} is not null) and ${t.state} in ('Draft','Submitted','Posted','Superseded') and ${t.version}>0 and (${t.state}<>'Posted' or (${t.postedDate} is not null and ${t.postedBy} is not null and ${t.postedAt} is not null and ${t.appliedBdt} is not null))`)]).enableRLS();
export const customerReturnLines = erp.table("customer_return_lines", {
  id: text("id").primaryKey(), returnId: text("return_id").notNull().references(() => customerReturns.id), position: integer("position").notNull(), deliveryLineId: text("delivery_line_id").notNull().references(() => deliveryLines.id),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(), condition: text("condition").$type<"Saleable" | "Quarantine" | "Damaged" | "Expired">().notNull(), location: text("location").notNull(),
  costBdt: numeric("cost_bdt", { precision: 24, scale: 2 }).notNull(), creditBdt: numeric("credit_bdt", { precision: 24, scale: 2 }).notNull(), discountBdt: numeric("discount_bdt", { precision: 24, scale: 2 }).notNull(), fingerprint: text("fingerprint").notNull(), snapshot: jsonb("snapshot").$type<ReturnLineSnapshot>().notNull()
  ,deliveryValueBdt: numeric("delivery_value_bdt", { precision: 24, scale: 2 }).notNull(), deliveryDiscountBdt: numeric("delivery_discount_bdt", { precision: 24, scale: 2 }).notNull()
}, (t) => [uniqueIndex("return_line_unique").on(t.returnId,t.deliveryLineId), index("return_original_line_idx").on(t.deliveryLineId), check("return_line_values", sql`${t.quantity}>0 and ${t.costBdt}>=0 and ${t.creditBdt}>=0 and ${t.discountBdt}>=0 and ${t.condition} in ('Saleable','Quarantine','Damaged','Expired')`)]).enableRLS();
export const customerReturnPostings = erp.table("customer_return_postings", {
  id: text("id").primaryKey(), lineId: text("line_id").notNull().unique().references(() => customerReturnLines.id), batchId: text("batch_id").notNull().unique().references(() => stockBatches.id), movementId: text("movement_id").notNull().unique().references(() => stockMovements.id)
}).enableRLS();
export const returnSettlements = erp.table("return_settlements", {
  id: text("id").primaryKey(), number: text("number").notNull().unique(), returnId: text("return_id").notNull().references(() => customerReturns.id), kind: text("kind").$type<"Refund" | "Apply Credit">().notNull(),
  amountBdt: numeric("amount_bdt", { precision: 24, scale: 2 }).notNull(), accountId: text("account_id").references(() => cashAccounts.id), invoiceId: text("invoice_id").references(() => salesInvoices.id), transactionId: text("transaction_id").unique().references(() => accountTransactions.id),
  receivableEntryId: text("receivable_entry_id").references(() => customerEntries.id),
  reason: text("reason").notNull(), proofReference: text("proof_reference").notNull(), payloadHash: text("payload_hash").notNull(), approvalId: text("approval_id").notNull().unique().references(() => approvalRequests.id), state: text("state").$type<"Submitted" | "Posted">().notNull().default("Submitted"), version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull().references(() => employees.id), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), date: date("date"), postedBy: text("posted_by").references(() => employees.id)
}, (t) => [index("return_settlement_idx").on(t.returnId,t.state),index("return_settlement_opening_idx").on(t.receivableEntryId,t.state), check("return_settlement_values", sql`${t.amountBdt}>0 and ${t.kind} in ('Refund','Apply Credit') and ((${t.kind}='Refund' and ${t.accountId} is not null and ${t.invoiceId} is null and ${t.receivableEntryId} is null) or (${t.kind}='Apply Credit' and ((${t.invoiceId} is not null and ${t.receivableEntryId} is null) or (${t.invoiceId} is null and ${t.receivableEntryId} is not null)) and ${t.accountId} is null and ${t.transactionId} is null)) and ${t.state} in ('Submitted','Posted') and (${t.state}<>'Posted' or (${t.date} is not null and ${t.postedBy} is not null))`)]).enableRLS();

export const payrollPolicies=erp.table("payroll_policies",{
  id:text("id").primaryKey(),employeeId:text("employee_id").notNull().references(()=>employees.id),kind:text("kind").$type<"Compensation"|"Commission">().notNull(),effectiveFrom:date("effective_from").notNull(),data:jsonb("data").$type<PayrollPolicyData>().notNull(),
  state:text("state").$type<"Submitted"|"Active">().notNull().default("Submitted"),version:integer("version").notNull().default(1),payloadHash:text("payload_hash").notNull(),approvalId:text("approval_id").notNull().unique().references(()=>approvalRequests.id),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>[index("payroll_policy_employee_idx").on(t.employeeId,t.effectiveFrom),uniqueIndex("payroll_policy_effective_unique").on(t.employeeId,t.kind,t.effectiveFrom).where(sql`${t.state}='Active'`),check("payroll_policy_values",sql`${t.kind} in ('Compensation','Commission') and ${t.state} in ('Submitted','Active') and ${t.version}>0`)]).enableRLS();
export const payrollRuns=erp.table("payroll_runs",{
  id:text("id").primaryKey(),number:text("number").notNull().unique(),period:text("period").notNull(),reason:text("reason").notNull(),proofReference:text("proof_reference").notNull(),gross:numeric("gross",{precision:24,scale:2}).notNull(),net:numeric("net",{precision:24,scale:2}).notNull(),
  state:text("state").$type<"Draft"|"Submitted"|"Accrued"|"Superseded">().notNull().default("Draft"),version:integer("version").notNull().default(1),payloadHash:text("payload_hash").notNull(),preparerIds:jsonb("preparer_ids").$type<string[]>().notNull(),approvalId:text("approval_id").unique().references(()=>approvalRequests.id),revisionOfId:text("revision_of_id").unique().references(():AnyPgColumn=>payrollRuns.id),
  createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),postedBy:text("posted_by").references(()=>employees.id),postedDate:date("posted_date"),postedAt:timestamp("posted_at",{withTimezone:true})
},t=>[index("payroll_run_period_idx").on(t.period,t.state),check("payroll_run_values",sql`${t.period}~'^20[0-9]{2}-(0[1-9]|1[0-2])$' and ${t.gross}>0 and ${t.net}>=0 and ${t.net}<=${t.gross} and ${t.state} in ('Draft','Submitted','Accrued','Superseded') and ${t.version}>0 and (${t.state}<>'Accrued' or (${t.postedDate} is not null and ${t.postedBy} is not null and ${t.postedAt} is not null))`)]).enableRLS();
export const payrollLines=erp.table("payroll_lines",{
  id:text("id").primaryKey(),runId:text("run_id").notNull().references(()=>payrollRuns.id),employeeId:text("employee_id").notNull().references(()=>employees.id),position:integer("position").notNull(),snapshot:jsonb("snapshot").$type<PayrollLineSnapshot>().notNull(),gross:numeric("gross",{precision:24,scale:2}).notNull(),net:numeric("net",{precision:24,scale:2}).notNull(),commission:numeric("commission",{precision:24,scale:2}).notNull(),fingerprint:text("fingerprint").notNull()
},t=>[uniqueIndex("payroll_line_employee_unique").on(t.runId,t.employeeId),uniqueIndex("payroll_line_position_unique").on(t.runId,t.position),check("payroll_line_values",sql`${t.gross}>=0 and ${t.net}>=0 and ${t.net}<=${t.gross}`)]).enableRLS();
export const payrollLoans=erp.table("payroll_loans",{
  id:text("id").primaryKey(),number:text("number").notNull().unique(),employeeId:text("employee_id").notNull().references(()=>employees.id),kind:text("kind").$type<"Advance"|"Loan">().notNull(),amount:numeric("amount",{precision:24,scale:2}).notNull(),installment:numeric("installment",{precision:24,scale:2}).notNull(),accountId:text("account_id").notNull().references(()=>cashAccounts.id),reason:text("reason").notNull(),proofReference:text("proof_reference").notNull(),
  state:text("state").$type<"Submitted"|"Posted">().notNull().default("Submitted"),version:integer("version").notNull().default(1),payloadHash:text("payload_hash").notNull(),approvalId:text("approval_id").notNull().unique().references(()=>approvalRequests.id),transactionId:text("transaction_id").unique().references(()=>accountTransactions.id),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),date:date("date"),postedBy:text("posted_by").references(()=>employees.id)
},t=>[index("payroll_loan_employee_idx").on(t.employeeId,t.date),check("payroll_loan_values",sql`${t.amount}>0 and ${t.installment}>=0 and ${t.installment}<=${t.amount} and ${t.kind} in ('Advance','Loan') and ${t.state} in ('Submitted','Posted') and (${t.state}<>'Posted' or (${t.date} is not null and ${t.transactionId} is not null and ${t.postedBy} is not null))`)]).enableRLS();
export const payrollRecoveries=erp.table("payroll_recoveries",{
  id:text("id").primaryKey(),lineId:text("line_id").notNull().references(()=>payrollLines.id),loanId:text("loan_id").notNull().references(()=>payrollLoans.id),amount:numeric("amount",{precision:24,scale:2}).notNull(),date:date("date").notNull()
},t=>[uniqueIndex("payroll_recovery_source_unique").on(t.lineId,t.loanId),index("payroll_recovery_loan_idx").on(t.loanId,t.date),check("payroll_recovery_amount",sql`${t.amount}>0`)]).enableRLS();
export const payrollPayments=erp.table("payroll_payments",{
  id:text("id").primaryKey(),number:text("number").notNull().unique(),runId:text("run_id").notNull().references(()=>payrollRuns.id),lineId:text("line_id").notNull().references(()=>payrollLines.id),amount:numeric("amount",{precision:24,scale:2}).notNull(),accountId:text("account_id").notNull().references(()=>cashAccounts.id),reason:text("reason").notNull(),proofReference:text("proof_reference").notNull(),
  state:text("state").$type<"Submitted"|"Posted">().notNull().default("Submitted"),version:integer("version").notNull().default(1),payloadHash:text("payload_hash").notNull(),approvalId:text("approval_id").notNull().unique().references(()=>approvalRequests.id),transactionId:text("transaction_id").unique().references(()=>accountTransactions.id),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),date:date("date"),postedBy:text("posted_by").references(()=>employees.id)
},t=>[index("payroll_payment_line_idx").on(t.lineId,t.state),check("payroll_payment_values",sql`${t.amount}>0 and ${t.state} in ('Submitted','Posted') and (${t.state}<>'Posted' or (${t.date} is not null and ${t.transactionId} is not null and ${t.postedBy} is not null))`)]).enableRLS();

export const supplierClaims=erp.table("supplier_claims",{
 id:text("id").primaryKey(),number:text("number").notNull().unique(),sourceKind:text("source_kind").$type<"Receipt Rejection"|"Held Stock">().notNull(),sourceId:text("source_id").notNull(),receiptLineId:text("receipt_line_id").notNull().references(()=>receiptLines.id),holdId:text("hold_id").references(()=>stockHolds.id),batchId:text("batch_id").references(()=>stockBatches.id),supplierId:text("supplier_id").notNull().references(()=>suppliers.id),importId:text("import_id").notNull().references(()=>importCases.id),productId:text("product_id").notNull().references(()=>products.id),quantity:numeric("quantity",{precision:18,scale:4}).notNull(),costBdt:numeric("cost_bdt",{precision:24,scale:2}).notNull(),creditBdt:numeric("credit_bdt",{precision:24,scale:2}),resolution:text("resolution").$type<"Credit"|"Replacement"|"Write-off">().notNull(),reason:text("reason").notNull(),inspection:text("inspection").notNull(),proofReference:text("proof_reference").notNull(),snapshot:jsonb("snapshot").$type<ClaimSource>().notNull(),fingerprint:text("fingerprint").notNull(),exposureBdt:numeric("exposure_bdt",{precision:24,scale:2}).notNull(),payloadHash:text("payload_hash").notNull(),preparerIds:jsonb("preparer_ids").$type<string[]>().notNull(),
 state:text("state").$type<"Draft"|"Submitted"|"Posted"|"Superseded">().notNull().default("Draft"),version:integer("version").notNull().default(1),approvalId:text("approval_id").unique().references(()=>approvalRequests.id),revisionOfId:text("revision_of_id").unique().references(():AnyPgColumn=>supplierClaims.id),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),postedDate:date("posted_date"),postedBy:text("posted_by").references(()=>employees.id)
},t=>[index("supplier_claim_source_idx").on(t.sourceKind,t.sourceId,t.state),index("supplier_claim_supplier_idx").on(t.supplierId,t.createdAt),check("supplier_claim_values",sql`${t.quantity}>0 and ${t.costBdt}>=0 and (${t.creditBdt} is null or ${t.creditBdt}>=0) and ${t.exposureBdt}=${t.costBdt}+coalesce(${t.creditBdt},0) and ${t.sourceKind} in ('Receipt Rejection','Held Stock') and ((${t.sourceKind}='Held Stock')=(${t.holdId} is not null and ${t.batchId} is not null)) and ${t.resolution} in ('Credit','Replacement','Write-off') and (${t.resolution}='Credit' or ${t.creditBdt} is null) and ${t.state} in ('Draft','Submitted','Posted','Superseded') and ${t.version}>0 and (${t.state}<>'Posted' or (${t.postedDate} is not null and ${t.postedBy} is not null and (${t.resolution}<>'Credit' or ${t.creditBdt}>0)))`)]).enableRLS();
export const supplierClaimPostings=erp.table("supplier_claim_postings",{
 id:text("id").primaryKey(),claimId:text("claim_id").notNull().unique().references(()=>supplierClaims.id),holdId:text("hold_id").notNull().references(()=>stockHolds.id),batchId:text("batch_id").notNull().references(()=>stockBatches.id),movementId:text("movement_id").notNull().unique().references(()=>stockMovements.id),quantity:numeric("quantity",{precision:18,scale:4}).notNull(),valueBdt:numeric("value_bdt",{precision:24,scale:2}).notNull(),date:date("date").notNull()
},t=>[check("supplier_claim_posting_values",sql`${t.quantity}>0 and ${t.valueBdt}>=0`),index("supplier_claim_hold_idx").on(t.holdId,t.date)]).enableRLS();

export const qualityResources=erp.table("quality_resources",{
 id:uuid("id").primaryKey().defaultRandom(),stockControlId:text("stock_control_id").unique().references(()=>stockControls.id),customerReturnId:text("customer_return_id").unique().references(()=>customerReturns.id),supplierClaimId:text("supplier_claim_id").unique().references(()=>supplierClaims.id),replacementReceiptId:text("replacement_receipt_id").unique().references(():AnyPgColumn=>supplierReplacementReceipts.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>[check("quality_resource_parent",sql`num_nonnulls(${t.stockControlId},${t.customerReturnId},${t.supplierClaimId},${t.replacementReceiptId})=1`)]).enableRLS();
export const qualityWithdrawals=erp.table("quality_withdrawals",{
 id:uuid("id").primaryKey().defaultRandom(),resourceId:uuid("resource_id").notNull().references(()=>qualityResources.id),documentId:uuid("document_id").notNull().references(()=>documents.id),reason:text("reason").notNull(),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>[uniqueIndex("quality_withdrawal_unique").on(t.resourceId,t.documentId),check("quality_withdrawal_reason",sql`length(btrim(${t.reason}))>=5 and length(${t.reason})<=500`)]).enableRLS();
export const qualitySeals=erp.table("quality_seals",{
 id:uuid("id").primaryKey().defaultRandom(),resourceId:uuid("resource_id").notNull().unique().references(()=>qualityResources.id),sourceHash:text("source_hash").notNull(),hash:text("hash").notNull(),snapshot:jsonb("snapshot").$type<{files:Record<string,unknown>[];withdrawals:Record<string,unknown>[]}>().notNull(),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow()
},t=>[check("quality_seal_hashes",sql`${t.hash} ~ '^[a-f0-9]{64}$' and ${t.sourceHash} ~ '^[a-f0-9]{64}$'`)]).enableRLS();
export const supplierReplacementReceipts=erp.table("supplier_replacement_receipts",{
 additionalCostsConfirmedZero:boolean("additional_costs_confirmed_zero").notNull(),
 id:text("id").primaryKey(),number:text("number").notNull().unique(),claimId:text("claim_id").notNull().references(()=>supplierClaims.id),quantity:numeric("quantity",{precision:18,scale:4}).notNull(),rejectedQuantity:numeric("rejected_quantity",{precision:18,scale:4}).notNull(),valueBdt:numeric("value_bdt",{precision:24,scale:2}).notNull(),lotNumber:text("lot_number").notNull(),batchNumber:text("batch_number").notNull(),manufacturingDate:date("manufacturing_date").notNull(),expiryDate:date("expiry_date").notNull(),receivedDate:date("received_date").notNull(),location:text("location").notNull(),inspection:text("inspection").notNull(),proofReference:text("proof_reference").notNull(),payloadHash:text("payload_hash").notNull(),fingerprint:text("fingerprint").notNull(),approvalId:text("approval_id").unique().references(()=>approvalRequests.id),state:text("state").$type<"Draft"|"Submitted"|"Posted">().notNull().default("Submitted"),version:integer("version").notNull().default(1),createdBy:text("created_by").notNull().references(()=>employees.id),createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),postedDate:date("posted_date"),postedBy:text("posted_by").references(()=>employees.id)
},t=>[index("supplier_replacement_claim_idx").on(t.claimId,t.state),check("supplier_replacement_values",sql`${t.additionalCostsConfirmedZero}=true and ${t.quantity}>=0 and ${t.rejectedQuantity}>=0 and ${t.quantity}+${t.rejectedQuantity}>0 and ${t.valueBdt}>=0 and ${t.expiryDate}>${t.manufacturingDate} and ${t.manufacturingDate}<=${t.receivedDate} and ${t.state} in ('Draft','Submitted','Posted') and (${t.state}='Draft')=(${t.approvalId} is null) and ${t.version}>0 and (${t.state}<>'Posted' or (${t.postedDate} is not null and ${t.postedBy} is not null))`)]).enableRLS();
