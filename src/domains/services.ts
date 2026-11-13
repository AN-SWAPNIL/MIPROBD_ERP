import { z } from "zod";
import type { ApiResponse, User } from "../types";
import { authHeaders, readSession } from "../lib/auth/transport";
import { foundationMode } from "../lib/runtime";
import { apiRequest, ApiRequestError } from "../lib/api/client";
import { responseIssues } from "../lib/api/validation";
import { safeApiMessage } from "../lib/api/safeErrors";
import { documentUploadBlob } from "../lib/files/uploadBytes";
import { paymentPayload } from "./imports/paymentPayload";
import { PersistentReportSchema, ReportCatalogueEntrySchema, type PersistentReportQuery } from "./reports/persistentContracts";
import type {
  AccountTransaction,
  AuditEvent,
  BusinessDecision,
  AIChatResponse,
  AIContext,
  AIDocumentExtraction,
  AIInsight,
  AIRecommendation,
  CashBankAccount,
  Collection,
  CostPreset,
  CurrentEmployeeLocation,
  Customer,
  CustomerLedger,
  CustomerOpeningBalance,
  DailyMarketingPlan,
  DashboardData,
  Delivery,
  DocumentRecord,
  DocumentUpload,
  Expense,
  EmployeeDirectoryEntry,
  EmployeeMarketingSnapshot,
  EmployeeMarketingTarget,
  FieldEmployee,
  FieldTeamCurrentData,
  FieldTeamHistoryData,
  FieldVisit,
  ImportCase,
  ImportCostLine,
  ImportDocument,
  ImportItem,
  LandedCostPreview,
  MarketingActivity,
  MarketingDashboardData,
  MarketingFollowUp,
  MarketingLead,
  MarketingPerformanceRow,
  MarketingReportData,
  MarketingScoreRule,
  MonthlyMarketingPlan,
  LocationUpdateInput,
  ProductAlias,
  ProfitPreview,
  PrintConfiguration,
  TransactionPrintPayload,
  Product,
  Quotation,
  ReportData,
  SalesInvoice,
  SalespersonPerformanceData,
  SalesOrder,
  SalesOrderWorkspace,
  StockBatch,
  StockMovement,
  Supplier,
  SupplierSettlement,
  FinancialPositionEntry,
  WarehouseConfig,
  WarehouseReceipt
} from "./erp.types";
import {
  AccountSchema,
  AccountTransactionSchema,
  SupplierSettlementSchema,
  FinancialPositionEntrySchema,
  AuditEventSchema,
  BusinessDecisionSchema,
  AIChatResponseSchema,
  AIDocumentExtractionSchema,
  AIInsightSchema,
  AIRecommendationSchema,
  CollectionSchema,
  CostPresetSchema,
  CurrentEmployeeLocationSchema,
  CustomerSchema,
  CustomerLedgerSchema,
  CustomerOpeningBalanceSchema,
  DashboardSchema,
  DeliverySchema,
  DispatchPreviewSchema,
  ExpenseCategorySchema,
  ExpenseSchema,
  EmployeeDirectoryEntrySchema,
  EmployeeMarketingSnapshotSchema,
  EmployeeMarketingTargetSchema,
  FieldEmployeeSchema,
  FieldTeamCurrentSchema,
  FieldTeamHistorySchema,
  FieldVisitSchema,
  ImportCaseSchema,
  ImportDocumentSchema,
  LandedCostPreviewSchema,
  MarketingActivitySchema,
  MarketingDashboardSchema,
  MarketingFollowUpSchema,
  MarketingLeadSchema,
  MarketingPerformanceRowSchema,
  MarketingReportSchema,
  MarketingScoreRuleSchema,
  MonthlyMarketingPlanSchema,
  DailyMarketingPlanSchema,
  PrintConfigurationSchema,
  TransactionPrintPayloadSchema,
  ProductAliasSchema,
  ProfitPreviewSchema,
  ProductSchema,
  QuotationSchema,
  ReportSchema,
  SalesInvoiceSchema,
  SalespersonPerformanceSchema,
  SalesOrderSchema,
  SalesOrderWorkspaceSchema,
  StockBatchSchema,
  StockMovementSchema,
  StockSummarySchema,
  SupplierSchema,
  UserSchema,
  WarehouseConfigSchema,
  WarehouseReceiptSchema
} from "./schemas";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export { request as domainRequest };
const IdResponseSchema = z.object({ id: z.string() });

export type StockSummary = z.infer<typeof StockSummarySchema>;
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

async function headers() {
  const result = new Headers({ "Content-Type": "application/json" });
  Object.entries(await authHeaders()).forEach(([key, value]) => result.set(key, value));
  return result;
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const requestHeaders = await headers();
  new Headers(init?.headers).forEach((value, key) => requestHeaders.set(key, value));
  let pendingKey: string | undefined;
  if (foundationMode && init?.method === "POST" && (path.startsWith("/api/workforce/") || path === "/api/settings/cost-presets" || /^\/api\/imports(?:$|\/[^/]+\/(finalize|receive)$)/.test(path) || /^\/api\/(customers|quotations|deliveries|invoices|collections|account-transactions|expenses|expense-categories|supplier-settlements|financial-position|settings\/accounts|settings\/expense-categories)$/.test(path) || /^\/api\/quotations\/[^/]+\/convert$/.test(path) || /^\/api\/invoices\/[^/]+\/(approve|cancel)$/.test(path) || /^\/api\/(collections|expenses|supplier-settlements|financial-position|account-transactions)\/[^/]+\/reverse$/.test(path)) && !requestHeaders.has("Idempotency-Key")) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${readSession()?.user.id}:${path}:${init.body}`));
    pendingKey = "mipro-pending-post:" + Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
    const key = sessionStorage.getItem(pendingKey) ?? crypto.randomUUID();
    sessionStorage.setItem(pendingKey, key);
    requestHeaders.set("Idempotency-Key", key);
  }
  const response = await fetch(API_BASE_URL + path, { ...init, headers: requestHeaders }).catch((error: unknown) => { if (init?.signal?.aborted) throw error; throw new ApiRequestError("Could not connect to the service. Check your connection and try again.", 0); });
  const body = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
  if (!response.ok || !body?.success) {
    if (pendingKey && response.status >= 400 && response.status < 500 && response.status !== 408) sessionStorage.removeItem(pendingKey);
    throw new ApiRequestError(safeApiMessage(response.status, body?.message, response.headers.get("X-Request-Id")), response.status, response.status < 500 ? responseIssues((body as { errors?: unknown } | null)?.errors) : []);
  }
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) throw new ApiRequestError("The service returned unexpected data. Reload and try again; contact your administrator if it continues.", 502);
  if (pendingKey) sessionStorage.removeItem(pendingKey);
  return parsed.data;
}

const get = <T>(path: string, schema: z.ZodType<T>) => request(path, schema);
const post = <T>(path: string, payload: unknown, schema: z.ZodType<T>) => request(path, schema, { method: "POST", body: JSON.stringify(payload) });
const patch = <T>(path: string, payload: unknown, schema: z.ZodType<T>) => request(path, schema, { method: "PATCH", body: JSON.stringify(payload) });
const remove = (path: string) => request(path, IdResponseSchema, { method: "DELETE" });

export const dashboardService = {
  get: () => get<DashboardData>("/api/dashboard", DashboardSchema)
};

export const importService = {
  list: () => get<ImportCase[]>("/api/imports", z.array(ImportCaseSchema)),
  get: (id: string) => get<ImportCase>("/api/imports/" + id, ImportCaseSchema),
  create: (payload: Partial<ImportCase>) => post<ImportCase>("/api/imports", { ...paymentPayload(payload), guidedWorkflow: true }, ImportCaseSchema),
  confirmStep: (id: string, step: number) => post<ImportCase>(`/api/imports/${id}/confirm-step`, { step }, ImportCaseSchema),
  receivingReadiness: (id: string) => get(`/api/imports/${id}/receiving-readiness`, z.object({ ready: z.boolean(), canConfigure: z.boolean(), message: z.string() })),
  update: (id: string, payload: Partial<ImportCase>) => patch<ImportCase>("/api/imports/" + id, paymentPayload(payload), ImportCaseSchema),
  transition: (id: string, status: string) => post<ImportCase>("/api/imports/" + id + "/transition", { status }, ImportCaseSchema),
  remove: (id: string) => remove("/api/imports/" + id),
  addItem: (id: string, payload: Omit<ImportItem, "id">) => post<ImportCase>("/api/imports/" + id + "/items", payload, ImportCaseSchema),
  updateItem: (id: string, itemId: string, payload: Partial<ImportItem>) => patch<ImportCase>("/api/imports/" + id + "/items/" + itemId, payload, ImportCaseSchema),
  removeItem: (id: string, itemId: string) => request("/api/imports/" + id + "/items/" + itemId, ImportCaseSchema, { method: "DELETE" }),
  addCost: (id: string, payload: Omit<ImportCostLine, "id" | "enteredBy" | "createdAt"> & { attachmentUpload?: DocumentUpload }) => post<ImportCase>("/api/imports/" + id + "/costs", payload, ImportCaseSchema),
  updateCost: (id: string, costId: string, payload: Partial<ImportCostLine> & { attachmentUpload?: DocumentUpload }) => patch<ImportCase>("/api/imports/" + id + "/costs/" + costId, payload, ImportCaseSchema),
  removeCost: (id: string, costId: string) => request("/api/imports/" + id + "/costs/" + costId, ImportCaseSchema, { method: "DELETE" }),
  async addDocument(id: string, payload: Pick<ImportDocument, "type" | "name"> & { upload: DocumentUpload; sensitive?: boolean }) {
    if (!foundationMode) return post<ImportDocument>("/api/imports/" + id + "/documents", payload, ImportDocumentSchema);
    const bytes = documentUploadBlob(payload.upload);
    const upload = await apiRequest<{ id: string; signedUrl: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ purpose: "import-document", importId: id, documentType: payload.type, sensitive: payload.sensitive, fileName: payload.upload.fileName, mimeType: payload.upload.mimeType, sizeBytes: payload.upload.sizeBytes }) });
    const stored = await fetch(upload.data.signedUrl, { method: "PUT", headers: { "Content-Type": payload.upload.mimeType }, body: bytes });
    if (!stored.ok) throw new Error("Document upload failed.");
    await apiRequest(`/api/uploads/${upload.data.id}/complete`, { method: "POST", body: "{}" });
    return { id: upload.data.id };
  },
  receipts: (id: string) => get<WarehouseReceipt[]>("/api/imports/" + id + "/receipts", z.array(WarehouseReceiptSchema)),
  preview: (id: string) => post<LandedCostPreview>("/api/imports/" + id + "/cost-preview", {}, LandedCostPreviewSchema),
  finalize: (id: string) => post<ImportCase>("/api/imports/" + id + "/finalize", {}, ImportCaseSchema),
  reopen: (id: string, reason: string) => post<ImportCase>("/api/imports/" + id + "/reopen", { reason }, ImportCaseSchema),
  receive: (id: string, payload: Omit<WarehouseReceipt, "id" | "importId" | "reference" | "status" | "receivedBy">) => post<WarehouseReceipt>("/api/imports/" + id + "/receive", payload, WarehouseReceiptSchema)
};

export const inventoryService = {
  stock: () => get<StockSummary[]>("/api/inventory/stock", z.array(StockSummarySchema)),
  batches: () => get<StockBatch[]>("/api/inventory/batches", z.array(StockBatchSchema)),
  movements: () => get<StockMovement[]>("/api/inventory/movements", z.array(StockMovementSchema)),
  dispatchPreview: (payload: { productId: string; batchId?: string; quantity: string; date?: string }) => post("/api/inventory/dispatch-preview", payload, DispatchPreviewSchema)
};

export const salesService = {
  referenceOrder: (type: string, id: string) => get(`/api/sales/references/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, IdResponseSchema.nullable()),
  orderWorkspace: (id: string) => get<SalesOrderWorkspace>(`/api/orders/${encodeURIComponent(id)}/workspace`, SalesOrderWorkspaceSchema),
  customers: () => get<Customer[]>("/api/customers", z.array(CustomerSchema)),
  customerLedger: (id: string) => get<CustomerLedger>("/api/customers/" + id + "/ledger", CustomerLedgerSchema),
  createCustomer: (payload: Partial<Customer>) => post<Customer>("/api/customers", payload, CustomerSchema),
  updateCustomer: (id: string, payload: Partial<Customer>) => patch<Customer>("/api/customers/" + id, payload, CustomerSchema),
  removeCustomer: (id: string) => remove("/api/customers/" + id),
  quotations: () => get<Quotation[]>("/api/quotations", z.array(QuotationSchema)),
  createQuotation: (payload: Partial<Quotation>) => post<Quotation>("/api/quotations", payload, QuotationSchema),
  updateQuotation: (id: string, payload: Partial<Quotation>) => patch<Quotation>("/api/quotations/" + id, payload, QuotationSchema),
  removeQuotation: (id: string) => remove("/api/quotations/" + id),
  convertQuotation: (id: string, deliveryInstruction: string, version?: number) => post<SalesOrder>("/api/quotations/" + id + "/convert", { deliveryInstruction, version }, SalesOrderSchema),
  orders: () => get<SalesOrder[]>("/api/orders", z.array(SalesOrderSchema)),
  updateOrder: (id: string, payload: Partial<SalesOrder>) => patch<SalesOrder>("/api/orders/" + id, payload, SalesOrderSchema),
  deliveries: () => get<Delivery[]>("/api/deliveries", z.array(DeliverySchema)),
  createDelivery: (payload: Partial<Delivery>) => post<Delivery>("/api/deliveries", payload, DeliverySchema),
  invoices: () => get<SalesInvoice[]>("/api/invoices", z.array(SalesInvoiceSchema)),
  createInvoice: (payload: { orderId?: string; deliveryIds: string[]; date: string; remarks?: string }) => post<SalesInvoice>("/api/invoices", payload, SalesInvoiceSchema),
  updateInvoice: (id: string, payload: Partial<SalesInvoice>) => patch<SalesInvoice>("/api/invoices/" + id, payload, SalesInvoiceSchema),
  approveInvoice: (id: string) => post<SalesInvoice>("/api/invoices/" + id + "/approve", {}, SalesInvoiceSchema),
  cancelInvoice: (id: string, reason: string) => post<SalesInvoice>("/api/invoices/" + id + "/cancel", { reason }, SalesInvoiceSchema),
  collections: () => get<Collection[]>("/api/collections", z.array(CollectionSchema)),
  createCollection: (payload: Partial<Collection>) => post<Collection>("/api/collections", payload, CollectionSchema),
  reverseCollection: (id: string, reason: string) => post<Collection>(`/api/collections/${encodeURIComponent(id)}/reverse`, { reason }, CollectionSchema),
  profitPreview: (lines: Quotation["lines"]) => post<ProfitPreview>("/api/sales/profit-preview", { lines }, ProfitPreviewSchema),
  paymentAccounts: () => get<CashBankAccount[]>("/api/payment-accounts", z.array(AccountSchema))
};

export const employeeService = {
  directory: (scope: "all" | "marketing" = "all") => get<EmployeeDirectoryEntry[]>(`/api/employees/directory?scope=${scope}`, z.array(EmployeeDirectoryEntrySchema)),
  managedUsers: () => get<User[]>("/api/settings/users", z.array(UserSchema)),
  createUser: (payload: Partial<User> & { password?: string }) => post<User>("/api/settings/users", payload, UserSchema),
  updateUser: (id: string, payload: Partial<User> & { password?: string }) => patch<User>("/api/settings/users/" + id, payload, UserSchema)
};

export const marketingService = {
  dashboard: () => get<MarketingDashboardData>("/api/marketing/dashboard", MarketingDashboardSchema),
  subjects: () => get<Array<{ value: string; label: string; type: "Lead" | "Customer" }>>("/api/marketing/subjects", z.array(z.object({ value: z.string(), label: z.string(), type: z.enum(["Lead", "Customer"]) }))),
  activities: (filters: { from?: string; to?: string; employeeId?: string; activityType?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    return get<MarketingActivity[]>(`/api/marketing/activities${params.size ? `?${params}` : ""}`, z.array(MarketingActivitySchema));
  },
  createActivity: (payload: Partial<MarketingActivity> & { attachmentUpload?: DocumentUpload }) => post<MarketingActivity>("/api/marketing/activities", payload, MarketingActivitySchema),
  leads: () => get<MarketingLead[]>("/api/marketing/leads", z.array(MarketingLeadSchema)),
  createLead: (payload: Partial<MarketingLead>) => post<MarketingLead>("/api/marketing/leads", payload, MarketingLeadSchema),
  updateLead: (id: string, payload: Partial<MarketingLead>) => patch<MarketingLead>(`/api/marketing/leads/${id}`, payload, MarketingLeadSchema),
  convertLead: (id: string, payload: { paymentTerms: string; creditLimit: string }) => post<Customer>(`/api/marketing/leads/${id}/convert`, payload, CustomerSchema),
  followUps: (status = "") => get<MarketingFollowUp[]>(`/api/marketing/follow-ups${status ? `?status=${encodeURIComponent(status)}` : ""}`, z.array(MarketingFollowUpSchema)),
  createFollowUp: (payload: Partial<MarketingFollowUp>) => post<MarketingFollowUp>("/api/marketing/follow-ups", payload, MarketingFollowUpSchema),
  updateFollowUp: (id: string, payload: Partial<MarketingFollowUp>) => patch<MarketingFollowUp>(`/api/marketing/follow-ups/${id}`, payload, MarketingFollowUpSchema),
  dailyPlans: (date: string, employeeId = "all") => get<DailyMarketingPlan[]>(`/api/marketing/plans/daily?date=${encodeURIComponent(date)}&employeeId=${encodeURIComponent(employeeId)}`, z.array(DailyMarketingPlanSchema)),
  saveDailyPlan: (payload: Partial<DailyMarketingPlan>) => post<DailyMarketingPlan>("/api/marketing/plans/daily", payload, DailyMarketingPlanSchema),
  monthlyPlans: (month: string) => get<MonthlyMarketingPlan[]>(`/api/marketing/plans/monthly?month=${encodeURIComponent(month)}`, z.array(MonthlyMarketingPlanSchema)),
  saveMonthlyPlan: (payload: Partial<MonthlyMarketingPlan>) => post<MonthlyMarketingPlan>("/api/marketing/plans/monthly", payload, MonthlyMarketingPlanSchema),
  targets: (month: string) => get<EmployeeMarketingTarget[]>(`/api/marketing/targets?month=${encodeURIComponent(month)}`, z.array(EmployeeMarketingTargetSchema)),
  saveTarget: (payload: Partial<EmployeeMarketingTarget>) => post<EmployeeMarketingTarget>("/api/marketing/targets", payload, EmployeeMarketingTargetSchema),
  updateTarget: (id: string, payload: Partial<EmployeeMarketingTarget>) => patch<EmployeeMarketingTarget>(`/api/marketing/targets/${id}`, payload, EmployeeMarketingTargetSchema),
  performance: (from: string, to: string, employeeId = "all") => get<MarketingPerformanceRow[]>(`/api/marketing/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&employeeId=${encodeURIComponent(employeeId)}`, z.array(MarketingPerformanceRowSchema)),
  employeeSnapshot: (employeeId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return get<EmployeeMarketingSnapshot>(`/api/marketing/employees/${encodeURIComponent(employeeId)}/snapshot${params.size ? `?${params}` : ""}`, EmployeeMarketingSnapshotSchema);
  },
  scoreRules: () => get<MarketingScoreRule[]>("/api/marketing/score-rules", z.array(MarketingScoreRuleSchema)),
  updateScoreRule: (id: string, payload: Partial<MarketingScoreRule>) => patch<MarketingScoreRule>(`/api/marketing/score-rules/${id}`, payload, MarketingScoreRuleSchema)
};

export const accountsService = {
  expenses: () => get<Expense[]>("/api/expenses", z.array(ExpenseSchema)),
  createExpense: (payload: Partial<Expense> & { attachmentUpload?: DocumentUpload; attachmentDocumentId?: string }) => post<Expense>("/api/expenses", payload, ExpenseSchema),
  reverseExpense: (id: string, reason: string) => post<Expense>("/api/expenses/" + id + "/reverse", { reason }, ExpenseSchema),
  categories: () => get<ExpenseCategory[]>("/api/expense-categories", z.array(ExpenseCategorySchema)),
  createCategory: (name: string) => post<ExpenseCategory>("/api/expense-categories", { name }, ExpenseCategorySchema),
  updateCategory: (id: string, payload: Partial<ExpenseCategory>) => patch<ExpenseCategory>(`/api/expense-categories/${id}`, payload, ExpenseCategorySchema),
  accounts: () => get<CashBankAccount[]>("/api/accounts", z.array(AccountSchema)),
  expenseEmployees: () => get<EmployeeDirectoryEntry[]>("/api/employees/directory?status=Active", z.array(EmployeeDirectoryEntrySchema)),
  suppliers: () => get<Supplier[]>("/api/accounts/suppliers", z.array(SupplierSchema)),
  transactions: () => get<AccountTransaction[]>("/api/account-transactions", z.array(AccountTransactionSchema)),
  createTransaction: (payload: Partial<AccountTransaction>) => post<AccountTransaction>("/api/account-transactions", payload, AccountTransactionSchema),
  reverseTransaction: (id: string, reason: string) => post<AccountTransaction>(`/api/account-transactions/${id}/reverse`, { reason }, AccountTransactionSchema),
  importReferences: () => get<{ id: string; supplierId: string; reference: string }[]>("/api/accounts/import-references", z.array(z.object({ id: z.string(), supplierId: z.string(), reference: z.string() }))),
  supplierSettlements: () => get<SupplierSettlement[]>("/api/supplier-settlements", z.array(SupplierSettlementSchema)),
  createSupplierSettlement: (payload: Partial<SupplierSettlement>) => post<SupplierSettlement>("/api/supplier-settlements", payload, SupplierSettlementSchema),
  reverseSupplierSettlement: (id: string, reason: string) => post<SupplierSettlement>(`/api/supplier-settlements/${id}/reverse`, { reason }, SupplierSettlementSchema),
  financialPosition: () => get<FinancialPositionEntry[]>("/api/financial-position", z.array(FinancialPositionEntrySchema)),
  createFinancialPosition: (payload: Partial<FinancialPositionEntry>) => post<FinancialPositionEntry>("/api/financial-position", payload, FinancialPositionEntrySchema),
  reverseFinancialPosition: (id: string, reason: string) => post<FinancialPositionEntry>(`/api/financial-position/${id}/reverse`, { reason }, FinancialPositionEntrySchema)
};

export const reportService = {
  catalogue: () => get("/api/reports/catalogue", ReportCatalogueEntrySchema.array()),
  run: (id: string, query: PersistentReportQuery) => get(`/api/reports/${encodeURIComponent(id)}?${reportParams(query)}`, PersistentReportSchema),
  print: (id: string, query: PersistentReportQuery) => get(`/api/reports/${encodeURIComponent(id)}/print?${reportParams(query)}`, PersistentReportSchema),
  csv: async (id: string, query: PersistentReportQuery) => {
    const response = await fetch(`${API_BASE_URL}/api/reports/${encodeURIComponent(id)}/export?${reportParams(query)}`, { headers: await headers() });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? "Report export could not be prepared.");
    }
    return response.blob();
  },
  get: (from: string, to: string, employeeId = "all") => get<ReportData>(`/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&employeeId=${encodeURIComponent(employeeId)}`, ReportSchema),
  salespeople: (from: string, to: string, employeeId = "all") => get<SalespersonPerformanceData>(`/api/reports/salespeople?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&employeeId=${encodeURIComponent(employeeId)}`, SalespersonPerformanceSchema),
  marketing: (filters: { from: string; to: string; employeeId?: string; territory?: string; activityType?: string; subjectId?: string; verification?: string; status?: string; groupBy?: string; mode?: "Summary" | "Detail" }) => {
    const params = new URLSearchParams(filters as Record<string, string>);
    return get<MarketingReportData>(`/api/reports/marketing?${params}`, MarketingReportSchema);
  },
  authorizeExport: () => get<{ authorized: true }>("/api/reports/export-authorization", z.object({ authorized: z.literal(true) })),
  authorizeMarketingExport: () => get<{ authorized: true }>("/api/reports/marketing/export-authorization", z.object({ authorized: z.literal(true) }))
};

function reportParams(query: PersistentReportQuery) {
  return new URLSearchParams(Object.entries(query).filter(([,value]) => value !== undefined && value !== "").map(([key,value]) => [key,String(value)]));
}

export const fieldTeamService = {
  current: () => get<FieldTeamCurrentData>("/api/field-team/current", FieldTeamCurrentSchema),
  employees: (search = "", territory = "", status = "") => {
    const params = new URLSearchParams({ search, territory, status });
    return get<FieldEmployee[]>(`/api/field-team/employees?${params}`, z.array(FieldEmployeeSchema));
  },
  history: (userId: string, date: string) => get<FieldTeamHistoryData>(`/api/field-team/${encodeURIComponent(userId)}/history?date=${encodeURIComponent(date)}`, FieldTeamHistorySchema),
  visits: (userId: string, from: string, to: string) => get<FieldVisit[]>(`/api/field-team/${encodeURIComponent(userId)}/visits?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, z.array(FieldVisitSchema)),
  startTracking: () => post("/api/field-team/tracking/start", {}, z.object({ id: z.string(), userId: z.string(), startedAt: z.string(), endedAt: z.string().optional(), source: z.enum(["MOBILE_APP", "WEB_FOREGROUND", "MANUAL", "DEMO"]), status: z.enum(["Active", "Completed"]) })),
  sendLocation: (payload: LocationUpdateInput) => post<CurrentEmployeeLocation>("/api/field-team/tracking/location", payload, CurrentEmployeeLocationSchema),
  stopTracking: () => post("/api/field-team/tracking/stop", {}, z.object({ id: z.string(), userId: z.string(), startedAt: z.string(), endedAt: z.string().optional(), source: z.enum(["MOBILE_APP", "WEB_FOREGROUND", "MANUAL", "DEMO"]), status: z.enum(["Active", "Completed"]) })),
  checkInVisit: (visitId: string, payload: { latitude: number; longitude: number; accuracyMeters: number }) => post<FieldVisit>(`/api/field-team/visits/${visitId}/check-in`, payload, FieldVisitSchema),
  checkOutVisit: (visitId: string, payload: Partial<FieldVisit> & { attachmentUpload?: DocumentUpload }) => post<FieldVisit>(`/api/field-team/visits/${visitId}/check-out`, payload, FieldVisitSchema)
};

export const printService = {
  configuration: () => get<PrintConfiguration>("/api/print/config", PrintConfigurationSchema),
  record: (type: string, id: string) => get<TransactionPrintPayload>(`/api/print/records/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, TransactionPrintPayloadSchema)
};

export const settingsService = {
  users: () => get<User[]>("/api/settings/users", z.array(UserSchema)),
  createUser: (payload: Partial<User> & { password?: string }) => post<User>("/api/settings/users", payload, UserSchema),
  updateUser: (id: string, payload: Partial<User>) => patch<User>("/api/settings/users/" + id, payload, UserSchema),
  decisions: () => get<BusinessDecision[]>("/api/settings/decisions", z.array(BusinessDecisionSchema)),
  updateDecision: (id: string, payload: Partial<BusinessDecision>) => patch<BusinessDecision>("/api/settings/decisions/" + id, payload, BusinessDecisionSchema),
  audit: () => get<AuditEvent[]>("/api/audit", z.array(AuditEventSchema)),
  products: () => get<Product[]>("/api/products", z.array(ProductSchema)),
  createProduct: (payload: Partial<Product>) => post<Product>("/api/products", payload, ProductSchema),
  updateProduct: (id: string, payload: Partial<Product>) => patch<Product>("/api/products/" + id, payload, ProductSchema),
  removeProduct: (id: string) => remove("/api/products/" + id),
  suppliers: () => get<Supplier[]>("/api/suppliers", z.array(SupplierSchema)),
  createSupplier: (payload: Partial<Supplier>) => post<Supplier>("/api/suppliers", payload, SupplierSchema),
  updateSupplier: (id: string, payload: Partial<Supplier>) => patch<Supplier>("/api/suppliers/" + id, payload, SupplierSchema),
  removeSupplier: (id: string) => remove("/api/suppliers/" + id),
  accounts: () => get<CashBankAccount[]>("/api/settings/accounts", z.array(AccountSchema)),
  createAccount: (payload: Partial<CashBankAccount>) => post<CashBankAccount>("/api/settings/accounts", payload, AccountSchema),
  updateAccount: (id: string, payload: Partial<CashBankAccount>) => patch<CashBankAccount>("/api/settings/accounts/" + id, payload, AccountSchema),
  removeAccount: (id: string) => remove("/api/settings/accounts/" + id),
  warehouse: () => get<WarehouseConfig>("/api/settings/warehouse", WarehouseConfigSchema),
  updateWarehouse: (payload: Partial<WarehouseConfig>) => patch<WarehouseConfig>("/api/settings/warehouse", payload, WarehouseConfigSchema),
  createOpeningStock: (payload: Record<string, unknown>) => post<StockBatch>("/api/settings/opening-stock", payload, StockBatchSchema),
  customerOpeningBalances: () => get<CustomerOpeningBalance[]>("/api/settings/customer-opening-balances", z.array(CustomerOpeningBalanceSchema)),
  createCustomerOpeningBalance: (payload: Partial<CustomerOpeningBalance>) => post<CustomerOpeningBalance>("/api/settings/customer-opening-balances", payload, CustomerOpeningBalanceSchema),
  productAliases: () => get<ProductAlias[]>("/api/settings/product-aliases", z.array(ProductAliasSchema)),
  createProductAlias: (payload: Partial<ProductAlias>) => post<ProductAlias>("/api/settings/product-aliases", payload, ProductAliasSchema),
  removeProductAlias: (id: string) => remove("/api/settings/product-aliases/" + id),
  costPresets: () => get<CostPreset[]>("/api/settings/cost-presets", z.array(CostPresetSchema)),
  createCostPreset: (payload: Partial<CostPreset>) => post<CostPreset>("/api/settings/cost-presets", payload, CostPresetSchema),
  updateCostPreset: (id: string, payload: Partial<CostPreset>) => patch<CostPreset>("/api/settings/cost-presets/" + id, payload, CostPresetSchema),
  removeCostPreset: (id: string) => remove("/api/settings/cost-presets/" + id),
  printConfiguration: () => get<PrintConfiguration>("/api/settings/print", PrintConfigurationSchema),
  updatePrintConfiguration: (payload: Partial<PrintConfiguration>) => patch<PrintConfiguration>("/api/settings/print", payload, PrintConfigurationSchema)
};

export const fileService = {
  attachImportDocument: importService.addDocument,
  async prepareExpenseReceipt(file: DocumentUpload) {
    const bytes = documentUploadBlob(file);
    const upload = await apiRequest<{ id: string; signedUrl: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ purpose: "expense-receipt", fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes }) });
    const stored = await fetch(upload.data.signedUrl, { method: "PUT", headers: { "Content-Type": file.mimeType }, body: bytes });
    if (!stored.ok) throw new Error("Receipt upload failed. The expense has not been posted.");
    await apiRequest(`/api/uploads/${upload.data.id}/complete`, { method: "POST", body: "{}" });
    return upload.data.id;
  },
  async open(document: DocumentRecord) {
    if (foundationMode) {
      const result = await apiRequest<{ url: string; sha256?:string|null;sizeBytes?:number }>(`/api/documents/${encodeURIComponent(document.id)}`);
      const file = await fetch(result.data.url);
      if (!file.ok) throw new Error("Document read failed.");
      const blob = await file.blob();
      const expectedHash=document.sha256??result.data.sha256,expectedSize=document.sizeBytes??result.data.sizeBytes;
      if (expectedHash) {
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
        if (hash !== expectedHash || expectedSize !== undefined && blob.size !== expectedSize) throw new Error("This file no longer matches the saved document. Contact an administrator.");
      }
      return blob;
    }
    const response = await fetch(API_BASE_URL + `/api/documents/${encodeURIComponent(document.id)}/content`, { headers: await headers() });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      throw new Error(body?.message || `Document could not be opened (${response.status})`);
    }
    return response.blob();
  }
};

function contextParams(context: AIContext) {
  const params = new URLSearchParams();
  Object.entries(context).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export const aiService = {
  chat: (message: string, context: AIContext) => post<AIChatResponse>("/api/ai/chat", { message, context }, AIChatResponseSchema),
  insights: (context: AIContext) => get<AIInsight[]>(`/api/ai/insights?${contextParams(context)}`, z.array(AIInsightSchema)),
  recommendations: (context: AIContext) => get<AIRecommendation[]>(`/api/ai/recommendations?${contextParams(context)}`, z.array(AIRecommendationSchema)),
  extractDocument: (importId: string, documentId: string) => post<AIDocumentExtraction>("/api/ai/document-extract", { importId, documentId }, AIDocumentExtractionSchema)
};
