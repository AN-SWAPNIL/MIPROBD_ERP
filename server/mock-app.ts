import cors from "cors";
import { Decimal } from "decimal.js";
import express, { type Request, type Response } from "express";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isFoundationMode } from "./config.js";
import { attachmentMimes, attachmentMetadataMatches } from "../src/lib/files/attachments.js";
import { inspectBusinessFile } from "./foundation/attachment-files.js";
import { normalizeApiPath } from "./api-path.js";
import { jsonBodyError } from "./http-security.js";
import { buildSalesOrderWorkspace, restrictWorkspaceFinancials } from "./salesWorkspace.js";
import { calculateLandedCost, importDisplayReference } from "../src/domains/imports/costing.js";
import {
  PublicCertificateSchema,
  PublicHeroSlideSchema,
  PublicProductCategoryRecordSchema,
  PublicProductSchema,
  PublicResourceSchema,
  PublicSiteSettingsSchema
} from "../src/features/public/public.schemas.js";
import type {
  PublicCertificate,
  PublicHeroSlide,
  PublicInquiryReceipt,
  PublicInquiryRecord,
  PublicProduct,
  PublicProductCategoryRecord,
  PublicResource,
  PublicSiteSettings
} from "../src/features/public/public.types.js";
import {
  publicCertificates as seedPublicCertificates,
  publicHeroSlides as seedPublicHeroSlides,
  publicProductCategories as seedPublicProductCategories,
  publicProducts as seedPublicProducts,
  publicResources as seedPublicResources,
  publicSiteSettings as seedPublicSiteSettings
} from "../src/features/public/public.content.js";
import type {
  AccountTransaction,
  AIContext,
  AIInsight,
  AIRecommendation,
  Capability,
  Collection,
  Customer,
  CustomerOpeningBalance,
  CustomerLedger,
  DailyMarketingPlan,
  DispatchAllocation,
  Delivery,
  DocumentRecord,
  DocumentUpload,
  Expense,
  EmployeeDirectoryEntry,
  EmployeeMarketingSnapshot,
  EmployeeMarketingTarget,
  CurrentEmployeeLocation,
  FieldEmployee,
  FieldTeamHistoryData,
  FieldVisit,
  ImportCase,
  ImportCostLine,
  ImportDocument,
  ImportItem,
  ImportStatus,
  MarketingActivity,
  MarketingActivityType,
  MarketingDashboardData,
  MarketingFollowUp,
  MarketingLead,
  MarketingLeadStage,
  MarketingPerformanceRow,
  MarketingReportData,
  MarketingScoreRule,
  MonthlyMarketingPlan,
  ProductAlias,
  ProfitPreview,
  Quotation,
  SalesInvoice,
  SalesOrder,
  SalespersonEmployee,
  SalespersonPerformanceDetail,
  SalespersonPerformanceSummary,
  StockBatch,
  SupplierSettlement,
  FinancialPositionEntry,
  LocationHistoryPoint,
  LocationUpdateInput,
  TrackingSession,
  WarehouseReceipt
} from "../src/domains/erp.types.js";
import type { ApiResponse, PermissionAction, PermissionKey, Role, Session, User, UserPermissionOverride } from "../src/types/index.js";
import {
  canAssignRole,
  canGrantCapability,
  canGrantPermission,
  canManageEmployees,
  canManageTargetUser,
  hasCapability as userHasCapability,
  hasEffectivePermission,
  normalizePermissionOverrides
} from "../src/lib/permissions/effectiveAccess.js";
import { permissionActions, permissionKeys } from "../src/lib/permissions/definitions.js";
import {
  accountTransactions as seedAccountTransactions,
  accounts as seedAccounts,
  auditEvents as seedAuditEvents,
  collections as seedCollections,
  customerOpeningBalances as seedCustomerOpeningBalances,
  customers as seedCustomers,
  decisions,
  deliveries as seedDeliveries,
  demoUsers,
  expenseCategories as seedExpenseCategories,
  expenses as seedExpenses,
  currentEmployeeLocations as seedCurrentEmployeeLocations,
  fieldVisits as seedFieldVisits,
  dailyMarketingPlans as seedDailyMarketingPlans,
  imports as seedImports,
  invoices as seedInvoices,
  locationHistory as seedLocationHistory,
  marketingActivities as seedMarketingActivities,
  marketingFollowUps as seedMarketingFollowUps,
  marketingLeads as seedMarketingLeads,
  marketingScoreRules as seedMarketingScoreRules,
  marketingTargets as seedMarketingTargets,
  monthlyMarketingPlans as seedMonthlyMarketingPlans,
  orders as seedOrders,
  passwordByEmail,
  printConfiguration as seedPrintConfiguration,
  productAliases as seedProductAliases,
  products as seedProducts,
  quotations as seedQuotations,
  receipts as seedReceipts,
  costPresets as seedCostPresets,
  stockBatches as seedStockBatches,
  stockMovements as seedStockMovements,
  suppliers as seedSuppliers,
  supplierSettlements as seedSupplierSettlements,
  financialPositionEntries as seedFinancialPositionEntries,
  trackingSessions as seedTrackingSessions,
  warehouseConfig as seedWarehouseConfig
} from "./data.js";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const app = express();
if (isFoundationMode()) throw new Error("The prototype API cannot run in foundation mode.");
const serverDemoMode = process.env.VITE_DEMO_MODE === "true" || process.env.DEMO_MODE === "true";

// The frontend approval build intentionally keeps transactional state in process memory.
const products = structuredClone(seedProducts);
const suppliers = structuredClone(seedSuppliers);
const imports = structuredClone(seedImports);
const stockBatches = structuredClone(seedStockBatches);
const stockMovements = structuredClone(seedStockMovements);
const receipts = structuredClone(seedReceipts);
const customers = structuredClone(seedCustomers);
const quotations = structuredClone(seedQuotations);
const orders = structuredClone(seedOrders);
const deliveries = structuredClone(seedDeliveries);
const invoices = structuredClone(seedInvoices);
const collections = structuredClone(seedCollections);
const expenses = structuredClone(seedExpenses);
const accounts = structuredClone(seedAccounts);
const accountTransactions = structuredClone(seedAccountTransactions);
const supplierSettlements: SupplierSettlement[] = structuredClone(seedSupplierSettlements);
const financialPositionEntries: FinancialPositionEntry[] = structuredClone(seedFinancialPositionEntries);
const expenseCategories = structuredClone(seedExpenseCategories);
const currentEmployeeLocations: CurrentEmployeeLocation[] = structuredClone(seedCurrentEmployeeLocations);
const fieldVisits: FieldVisit[] = structuredClone(seedFieldVisits);
const marketingActivities: MarketingActivity[] = structuredClone(seedMarketingActivities);
const marketingLeads: MarketingLead[] = structuredClone(seedMarketingLeads);
const marketingFollowUps: MarketingFollowUp[] = structuredClone(seedMarketingFollowUps);
const dailyMarketingPlans: DailyMarketingPlan[] = structuredClone(seedDailyMarketingPlans);
const monthlyMarketingPlans: MonthlyMarketingPlan[] = structuredClone(seedMonthlyMarketingPlans);
const marketingTargets: EmployeeMarketingTarget[] = structuredClone(seedMarketingTargets);
const marketingScoreRules: MarketingScoreRule[] = structuredClone(seedMarketingScoreRules);
const locationHistory: LocationHistoryPoint[] = structuredClone(seedLocationHistory);
const trackingSessions: TrackingSession[] = structuredClone(seedTrackingSessions);
const auditEvents = structuredClone(seedAuditEvents);
const costPresets = structuredClone(seedCostPresets);
const warehouseConfig = structuredClone(seedWarehouseConfig);
const printConfiguration = structuredClone(seedPrintConfiguration);
const productAliases: ProductAlias[] = structuredClone(seedProductAliases);
const customerOpeningBalances: CustomerOpeningBalance[] = structuredClone(seedCustomerOpeningBalances);
let publicSiteSettings: PublicSiteSettings = structuredClone(seedPublicSiteSettings);
const publicHeroSlides: PublicHeroSlide[] = structuredClone(seedPublicHeroSlides);
const publicProductCategories: PublicProductCategoryRecord[] = structuredClone(seedPublicProductCategories);
const publicProducts: PublicProduct[] = structuredClone(seedPublicProducts);
const publicCertificates: PublicCertificate[] = structuredClone(seedPublicCertificates);
const publicResources: PublicResource[] = structuredClone(seedPublicResources);
const publicInquiries: PublicInquiryRecord[] = [
  { inquiryId: "INQ-2026-003", receivedAt: "2026-08-24T09:35:00.000Z", status: "Received", name: "Dr. Afsana Kabir", organization: "North Point Dialysis Centre", phone: "+880 1712 450910", email: "procurement@northpoint.example", subject: "Dialyzer and blood tubing supply", productInterest: "Hollow Fiber Hemodialyzer", message: "Please share available dialyzer variants, compatible blood tubing options and manufacturer documentation for institutional review." },
  { inquiryId: "INQ-2026-002", receivedAt: "2026-08-23T12:20:00.000Z", status: "Contacted", name: "Mohammad Tariqul Islam", organization: "Careline Medical Services", phone: "+880 1818 620044", email: "tariqul@careline.example", subject: "A.V. fistula needle quotation", productInterest: "Disposable A.V. Fistula Needle", message: "We need pricing and lead time for 16G and 17G fistula needles for our next procurement cycle.", internalNotes: "Sales team called; customer requested a formal quotation after confirming monthly volume." },
  { inquiryId: "INQ-2026-001", receivedAt: "2026-08-22T07:45:00.000Z", status: "Qualified", name: "Sabina Yasmin", organization: "Metro Clinical Hospital", phone: "+880 1911 335508", email: "supply@metroclinical.example", subject: "IV catheter product information", productInterest: "IV Catheter, Pen Type", message: "Please send the available gauge list, packaging details and relevant conformity documents.", internalNotes: "Qualified institutional requirement; assigned to sales manager for product confirmation." }
];
const publicInquiryRate = new Map<string, { count: number; expiresAt: number }>();
const documentContents = new Map<string, string>();
const seededPdfPath = fileURLToPath(new URL("./assets/mipro-source-document.pdf", import.meta.url));
const seededExpenseImagePath = fileURLToPath(new URL("./assets/office-utility-receipt.png", import.meta.url));

for (const record of imports) {
  for (const document of record.documents) documentContents.set(document.id, seededPdfPath);
  for (const cost of record.costs) if (cost.attachment) documentContents.set(cost.attachment.id, seededPdfPath);
}
for (const expense of expenses) if (expense.attachment) documentContents.set(expense.attachment.id, expense.attachment.mimeType.startsWith("image/") ? seededExpenseImagePath : seededPdfPath);

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(jsonBodyError);
app.use((req, _res, next) => {
  req.url = normalizeApiPath(req.url);
  next();
});

function ok<T>(data: T, message = "OK", meta?: ApiResponse<T>["meta"]): ApiResponse<T> {
  return { success: true, message, data, meta };
}

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ success: false, message, data: null });
}

function userFor(req: Request): User | null {
  const id = String(req.headers["x-user-id"] ?? "");
  return demoUsers.find((user) => user.id === id) ?? null;
}

function hasCapability(req: Request, capability: Capability) {
  return userHasCapability(userFor(req), capability);
}

function requireUser(req: Request, res: Response) {
  const user = userFor(req);
  if (!user) fail(res, 401, "A valid ERP session is required.");
  return user;
}

const areaPermissions = {
  dashboard: "dashboard",
  imports: "import",
  inventory: "inventory",
  sales: "sales",
  marketing: "marketing",
  accounts: "accounts",
  reports: "reports",
  settings: "settings"
} as const satisfies Record<string, PermissionKey>;

type Area = keyof typeof areaPermissions;

function requestAction(req: Request): PermissionAction {
  if (req.method === "POST") return "create";
  if (req.method === "PATCH" || req.method === "PUT") return "edit";
  if (req.method === "DELETE") return "delete";
  return "view";
}

function requirePermission(req: Request, res: Response, permission: PermissionKey, action: PermissionAction = requestAction(req)) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!hasEffectivePermission(user, permission, action)) {
    fail(res, 403, `${user.role} cannot ${action} ${permission}.`);
    return null;
  }
  return user;
}

function requireArea(req: Request, res: Response, area: Area, action?: PermissionAction) {
  return requirePermission(req, res, areaPermissions[area], action);
}

function canAccessArea(user: User, area: Area, action: PermissionAction = "view") {
  return hasEffectivePermission(user, areaPermissions[area], action);
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function decimal(value: string | number | undefined) {
  return new Decimal(value || 0);
}

function money(value: Decimal | string | number) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function precise(value: Decimal | string | number, places = 4) {
  return new Decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

function uploadedDocument(
  req: Request,
  input: DocumentUpload,
  entityType: DocumentRecord["entityType"],
  entityId: string,
  documentType: string,
  sensitive: boolean
) {
  if (!input?.fileName || !input?.mimeType || !input?.fileDataUrl) throw new Error("Select a business document to attach.");
  const allowedMimeTypes = new Set<string>([...attachmentMimes,"image/gif"]);
  if (!allowedMimeTypes.has(input.mimeType)||input.mimeType!=="image/gif"&&!attachmentMetadataMatches(input.fileName,input.mimeType)) throw new Error("Select a supported document with its matching extension.");
  const match = input.fileDataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[1] !== input.mimeType || match[2].length % 4 !== 0) throw new Error("Attachment content or MIME type is invalid.");
  const actualSize = Buffer.from(match[2], "base64").byteLength;
  if (!actualSize || actualSize > 5_000_000) throw new Error("Attachment must be a non-empty file no larger than 5 MB.");
  if(input.mimeType!=="image/gif")inspectBusinessFile(Buffer.from(match[2],"base64"),input.mimeType);
  const user = userFor(req)!;
  const documentId = id("doc");
  const document: DocumentRecord = {
    id: documentId,
    entityType,
    entityId,
    documentType,
    source: "UPLOADED",
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: actualSize,
    previewUrl: `/api/documents/${documentId}/content`,
    sensitive,
    createdByUserId: user.id,
    createdByName: user.name,
    createdAt: new Date().toISOString()
  };
  documentContents.set(document.id, input.fileDataUrl);
  return document;
}

function businessDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function requiredDecimal(value: unknown, label: string, options: { allowZero?: boolean } = {}) {
  let parsed: Decimal;
  try {
    parsed = new Decimal(String(value ?? ""));
  } catch {
    throw new Error(`${label} must be a valid number.`);
  }
  if (!parsed.isFinite() || (options.allowZero ? parsed.lt(0) : parsed.lte(0))) {
    throw new Error(`${label} must be ${options.allowZero ? "zero or greater" : "greater than zero"}.`);
  }
  return parsed;
}

function normalizeImportItem(payload: Partial<ImportItem>, existing?: ImportItem): ImportItem {
  const product = products.find((entry) => entry.id === (payload.productId ?? existing?.productId));
  if (!product) throw new Error("Select a valid canonical product.");
  const quantity = requiredDecimal(payload.quantity ?? existing?.quantity, `${product.name} quantity`);
  const fobUnit = requiredDecimal(payload.fobUnitForeign ?? existing?.fobUnitForeign ?? "0", `${product.name} FOB per unit`, { allowZero: true });
  const rate = requiredDecimal(payload.exchangeRate ?? existing?.exchangeRate ?? "0", `${product.name} exchange rate`, { allowZero: fobUnit.eq(0) });
  const cartons = requiredDecimal(payload.cartonCount ?? existing?.cartonCount ?? "0", `${product.name} carton count`, { allowZero: true });
  const cbmPerCarton = requiredDecimal(payload.cbmPerCarton ?? existing?.cbmPerCarton ?? "0", `${product.name} CBM per carton`, { allowZero: true });
  const cbmMode = payload.cbmMode ?? existing?.cbmMode ?? "CALCULATED";
  const totalCbm = cbmMode === "MANUAL"
    ? requiredDecimal(payload.totalCbm ?? existing?.totalCbm ?? "0", `${product.name} manual total CBM`, { allowZero: true })
    : cartons.mul(cbmPerCarton);
  return {
    ...existing,
    ...payload,
    id: existing?.id ?? String(payload.id || id("item")),
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    quantity: precise(quantity, 4),
    unit: product.unit,
    currency: String(payload.currency ?? existing?.currency ?? "USD"),
    fobUnitForeign: precise(fobUnit, 4),
    exchangeRate: precise(rate, 4),
    fobTotalBdt: money(quantity.mul(fobUnit).mul(rate)),
    cbmPerCarton: precise(cbmPerCarton, 4),
    cartonCount: precise(cartons, 4),
    totalCbm: precise(totalCbm, 4),
    cbmMode,
    hsCode: product.hsCode
  };
}

const protectedImportFields = new Set(["id", "draftReference", "primaryReference", "status", "milestone", "costingStatus", "warehouseStatus", "items", "costs", "documents", "snapshot", "snapshotHistory", "createdAt", "updatedAt"]);

function deriveImportStatus(record: ImportCase) {
  const received = receipts.filter((entry) => entry.importId === record.id);
  if (received.length) {
    const processed = new Map<string, Decimal>();
    for (const receipt of received) for (const line of receipt.lines) processed.set(line.importItemId, (processed.get(line.importItemId) ?? new Decimal(0)).plus(line.quantityReceived).plus(line.quantityRejected));
    const complete = record.items.every((item) => (processed.get(item.id) ?? new Decimal(0)).gte(item.quantity));
    record.status = complete ? "Received" : "Partially Received";
    record.warehouseStatus = complete ? "Received" : "Partially Received";
    record.costingStatus = "Finalized";
  } else if (record.snapshot) {
    record.status = "Cost Finalized";
    record.costingStatus = "Finalized";
    record.warehouseStatus = "Ready";
  } else if (record.costs.length) {
    record.status = "Costing";
    record.costingStatus = "In Progress";
    record.warehouseStatus = "Not Ready";
  } else if (!["In Production", "Shipped", "At Port", "Cancelled", "Closed"].includes(record.status)) {
    if ((record.paymentMode === "LC" && record.lcNumber?.trim()) || (record.paymentMode === "TT" && record.ttReference?.trim())) record.status = "LC/TT Opened";
    else if (record.piNumber?.trim()) record.status = "PI Received";
    else record.status = "Draft";
    record.costingStatus = "Not Started";
    record.warehouseStatus = "Not Ready";
  }
  record.milestone = record.status;
  record.primaryReference = importDisplayReference(record);
  record.updatedAt = new Date().toISOString();
}

function terminalImportLocked(record: ImportCase, res: Response) {
  if (!["Closed", "Cancelled"].includes(record.status)) return false;
  fail(res, 423, record.status + " import cases are read-only.");
  return true;
}

function expiryStatus(expiryDate: string, today = new Date()) {
  const expiry = new Date(`${expiryDate}T23:59:59`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "Expired" as const;
  if (days <= 31) return "1 Month Alert" as const;
  if (days <= 92) return "3 Month Alert" as const;
  if (days <= 183) return "6 Month Alert" as const;
  return "Normal" as const;
}

function visibleBatch(batch: StockBatch, req: Request): StockBatch {
  return batchForRole({ ...batch, expiryStatus: expiryStatus(batch.expiryDate) }, req);
}

function fifoAllocation(productId: string, quantityValue: string, dispatchDate: string, preferredBatchId?: string) {
  const quantity = requiredDecimal(quantityValue, "Dispatch quantity");
  const candidates = stockBatches
    .filter((batch) => batch.productId === productId && decimal(batch.quantityAvailable).gt(0) && new Date(`${batch.expiryDate}T23:59:59`) >= new Date(`${dispatchDate}T00:00:00`))
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.id.localeCompare(b.id));
  const available = candidates.reduce((sum, batch) => sum.plus(batch.quantityAvailable), new Decimal(0));
  if (available.lt(quantity)) throw new Error(`Only ${available.toFixed(0)} non-expired units are available for FIFO dispatch.`);
  const selected = preferredBatchId && preferredBatchId !== "AUTO" ? candidates.find((batch) => batch.id === preferredBatchId) : undefined;
  if (preferredBatchId && preferredBatchId !== "AUTO" && !selected) throw new Error("Selected batch is unavailable or expired.");
  const ordered = selected ? [selected, ...candidates.filter((batch) => batch.id !== selected.id)] : candidates;
  let remaining = quantity;
  const allocations: DispatchAllocation[] = [];
  for (const batch of ordered) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, batch.quantityAvailable);
    if (take.lte(0)) continue;
    allocations.push({ batchId: batch.id, batchNumber: batch.batchNumber, lotNumber: batch.lotNumber, quantity: precise(take, 4), receivedDate: batch.receivedDate, expiryDate: batch.expiryDate });
    remaining = remaining.minus(take);
  }
  const requiresOverride = Boolean(selected && candidates[0] && selected.id !== candidates[0].id);
  return {
    productId,
    requestedQuantity: precise(quantity, 4),
    availableQuantity: precise(available, 4),
    allocations,
    requiresOverride,
    warning: requiresOverride ? `Older matching lot ${candidates[0].lotNumber} still has ${candidates[0].quantityAvailable} units. Authorized override and reason are required.` : undefined
  };
}

function ownsCustomer(req: Request, customerId: string) {
  const user = userFor(req);
  const customer = customers.find((entry) => entry.id === customerId);
  return Boolean(customer && (user?.role !== "Sales Executive" || customer.assignedSalesUserId === user.id));
}

function inPeriod(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function normalizeSalesLines(payload: unknown) {
  if (!Array.isArray(payload) || !payload.length) throw new Error("Add at least one sales line.");
  return payload.map((raw: Record<string, unknown>) => {
    const product = products.find((entry) => entry.id === raw.productId);
    if (!product) throw new Error("A sales line references an unknown product.");
    const quantity = requiredDecimal(raw.quantity, `${product.name} quantity`);
    const unitPrice = requiredDecimal(raw.unitPrice, `${product.name} unit price`);
    const discount = requiredDecimal(raw.discount ?? "0", `${product.name} discount`, { allowZero: true });
    const gross = quantity.mul(unitPrice);
    if (discount.gt(gross)) throw new Error(`${product.name} discount cannot exceed the gross line value.`);
    return {
      id: String(raw.id || id("sales-line")),
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity: precise(quantity, 4),
      unitPrice: money(unitPrice),
      discount: money(discount),
      lineTotal: money(gross.minus(discount))
    };
  });
}

function customerLedger(customerId: string): CustomerLedger | null {
  const customer = customers.find((entry) => entry.id === customerId);
  if (!customer) return null;
  const customerDeliveries = deliveries.filter((entry) => entry.customerId === customer.id);
  const customerInvoices = invoices.filter((entry) => entry.customerId === customer.id);
  const customerCollections = collections.filter((entry) => entry.customerId === customer.id && entry.status === "Posted");
  const transactions = [
    ...customerInvoices.filter((invoice) => invoice.approvedAt).flatMap((invoice) => [
      { id: invoice.id, date: invoice.date, type: "Invoice" as const, reference: invoice.invoiceNumber, debit: decimal(invoice.total), credit: new Decimal(0), remarks: invoice.remarks || "Approved sales invoice" },
      ...(invoice.status === "Cancelled" ? [{ id: `${invoice.id}-reversal`, date: invoice.approvedAt!.slice(0, 10), type: "Reversal" as const, reference: invoice.invoiceNumber, debit: new Decimal(0), credit: decimal(invoice.total), remarks: `Invoice cancelled: ${invoice.cancellationReason ?? "Recorded reversal"}` }] : [])
    ]),
    ...customerCollections.map((collection) => ({ id: collection.id, date: collection.date, type: "Collection" as const, reference: collection.receiptNumber, debit: new Decimal(0), credit: decimal(collection.amount), remarks: `${collection.paymentMode}${collection.referenceNumber ? ` · ${collection.referenceNumber}` : ""}${collection.remarks ? ` · ${collection.remarks}` : ""}` }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const transactionDebit = transactions.reduce((sum, entry) => sum.plus(entry.debit), new Decimal(0));
  const transactionCredit = transactions.reduce((sum, entry) => sum.plus(entry.credit), new Decimal(0));
  const configuredOpening = customerOpeningBalances.find((entry) => entry.customerId === customer.id);
  const openingDue = configuredOpening ? decimal(configuredOpening.openingDue) : Decimal.max(0, decimal(customer.currentDue).minus(transactionDebit).plus(transactionCredit));
  let running = openingDue;
  const entries = [];
  if (openingDue.gt(0)) entries.push({ id: configuredOpening?.id ?? `opening-${customer.id}`, date: configuredOpening?.date ?? transactions[0]?.date ?? "2026-01-01", type: "Opening Due" as const, reference: configuredOpening?.reference ?? "MIGRATED", debit: money(openingDue), credit: "0.00", runningDue: money(openingDue), remarks: configuredOpening?.remarks ?? "Opening customer due imported from the legacy sales ledger." });
  for (const entry of transactions) {
    running = running.plus(entry.debit).minus(entry.credit);
    entries.push({ id: entry.id, date: entry.date, type: entry.type, reference: entry.reference, debit: money(entry.debit), credit: money(entry.credit), runningDue: money(running), remarks: entry.remarks });
  }
  const invoicedSales = customerInvoices.filter((invoice) => invoice.status === "Approved").reduce((sum, invoice) => sum.plus(invoice.total), new Decimal(0));
  return { customer, deliveredSales: customer.totalSales, invoicedSales: money(invoicedSales), collected: customer.totalCollected, currentDue: customer.currentDue, entries, deliveries: customerDeliveries, invoices: customerInvoices, collections: customerCollections };
}

function audit(req: Request, action: string, entityType: string, entityId: string, summary: string, reason?: string) {
  const user = userFor(req);
  if (!user) return;
  auditEvents.unshift({ id: id("audit"), timestamp: new Date().toISOString(), userId: user.id, userName: user.name, role: user.role, action, entityType, entityId, summary, reason });
}

function importForRole(record: ImportCase, req: Request): ImportCase {
  const copy = structuredClone(record);
  if (!hasCapability(req, "view_sensitive_cost")) {
    copy.costs = [];
    copy.documents = copy.documents.filter((document) => !document.sensitive);
    delete copy.snapshot;
    copy.items = copy.items.map((item) => ({ ...item, fobUnitForeign: "0.00", fobTotalBdt: "0.00", exchangeRate: "0.00" }));
  }
  return copy;
}

function batchForRole(batch: StockBatch, req: Request): StockBatch {
  return hasCapability(req, "view_sensitive_cost") ? batch : { ...batch, landedCostPerUnit: "0.00" };
}

function salesScoped<T extends { ownerId?: string }>(rows: T[], req: Request) {
  const user = userFor(req);
  return user?.role === "Sales Executive" ? rows.filter((row) => row.ownerId === user.id) : rows;
}

function customerScoped(req: Request) {
  const user = userFor(req);
  return user?.role === "Sales Executive" ? customers.filter((customer) => customer.assignedSalesUserId === user.id) : customers;
}

function nextReference(prefix: string, count: number) {
  return `${prefix}-2026-${String(count + 1).padStart(3, "0")}`;
}

function salesOwnerForDelivery(delivery: Delivery) {
  return delivery.salesOwnerId
    ?? orders.find((order) => order.id === delivery.orderId)?.ownerId
    ?? customers.find((customer) => customer.id === delivery.customerId)?.assignedSalesUserId;
}

function reportPeriod(req: Request) {
  const today = businessDate();
  const from = String(req.query.from ?? `${today.slice(0, 7)}-01`);
  const to = String(req.query.to ?? today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new Error("Enter a valid report date range.");
  return { from, to };
}

function salesEmployeesFor(req: Request): SalespersonEmployee[] {
  const user = userFor(req)!;
  return demoUsers
    .filter((entry) => entry.role === "Sales Executive" && entry.status === "Active" && (user.role !== "Sales Executive" || entry.id === user.id))
    .map((entry) => ({ id: entry.id, name: entry.name, title: entry.title, territory: entry.territory, employeeCode: entry.employeeCode }));
}

function requireFieldTeam(req: Request, res: Response) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (marketingScope(user) === "NONE") {
    fail(res, 403, `${user.role} cannot access field-team location data.`);
    return null;
  }
  return user;
}

function fieldEmployee(user: User): FieldEmployee {
  return {
    id: user.id,
    name: user.name,
    title: user.title,
    territory: user.territory,
    employeeCode: user.employeeCode ?? user.id.toUpperCase(),
    phone: user.phone,
    avatarUrl: user.avatarUrl
  };
}

function visibleFieldEmployees(user: User) {
  const scope = marketingScope(user);
  return demoUsers
    .filter((entry) => entry.role === "Sales Executive" && entry.status === "Active" && (["ALL", "TEAM"].includes(scope) || (scope === "SELF" && entry.id === user.id)))
    .map(fieldEmployee);
}

function canAccessFieldEmployee(user: User, userId: string) {
  const scope = marketingScope(user);
  return ["ALL", "TEAM"].includes(scope) || (scope === "SELF" && user.id === userId);
}

const marketingManagementRoles: Role[] = ["Super Admin", "Managing Director", "Sales Manager"];
const manualMarketingActivityTypes: MarketingActivityType[] = [
  "CUSTOMER_CONTACT",
  "CUSTOMER_VISIT",
  "DOCTOR_MEETING",
  "PROCUREMENT_MEETING",
  "DEALER_VISIT",
  "PRODUCT_PRESENTATION",
  "PRODUCT_DEMONSTRATION",
  "SAMPLE_DELIVERED",
  "NEGOTIATION_UPDATE",
  "TENDER_FOLLOW_UP",
  "COLLECTION_VISIT",
  "TRAINING_SESSION",
  "SERVICE_FOLLOW_UP",
  "MARKET_SURVEY",
  "OFFICE_COORDINATION",
  "GENERAL_NOTE"
];

const generalMarketingActivityTypes: MarketingActivityType[] = ["MARKET_SURVEY", "OFFICE_COORDINATION", "GENERAL_NOTE"];
const marketingStages: MarketingLeadStage[] = ["NEW", "CONTACTED", "INTERESTED", "PRESENTATION", "SAMPLE", "QUOTATION", "NEGOTIATION", "ORDER", "DELIVERED", "PAYMENT"];

function directoryEntry(user: User): EmployeeDirectoryEntry {
  return {
    id: user.id,
    name: user.name,
    title: user.title,
    territory: user.territory,
    employeeCode: user.employeeCode ?? user.id.toUpperCase(),
    department: user.department,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status
  };
}

function marketingEmployeeIds(user: User) {
  const scope = marketingScope(user);
  if (scope === "ALL" || scope === "TEAM") {
    return new Set(demoUsers.filter((entry) => entry.role === "Sales Executive" && entry.status === "Active").map((entry) => entry.id));
  }
  return new Set(scope === "SELF" ? [user.id] : []);
}

function marketingScope(user: User): MarketingDashboardData["scope"] {
  if (!hasEffectivePermission(user, "marketing", "view")) return "NONE";
  if (["Super Admin", "Managing Director"].includes(user.role)) return "ALL";
  if (user.role === "Sales Manager") return "TEAM";
  return "SELF";
}

function canAccessMarketingEmployee(user: User, employeeId: string) {
  return marketingEmployeeIds(user).has(employeeId);
}

function canAccessEmployeeWorkspace(user: User) {
  const scope = marketingScope(user);
  return hasEffectivePermission(user, "users", "view") || canManageUserAccess(user) || scope === "TEAM" || scope === "ALL";
}

function canViewEmployeeActivity(user: User) {
  const scope = marketingScope(user);
  return scope === "TEAM" || scope === "ALL";
}

function inTimestampPeriod(value: string | undefined, from: string, to: string) {
  if (!value) return false;
  const date = businessDate(new Date(value));
  return date >= from && date <= to;
}

function followUpForResponse(followUp: MarketingFollowUp): MarketingFollowUp {
  const status = followUp.status === "PENDING" && new Date(followUp.dueAt).getTime() < Date.now() ? "OVERDUE" : followUp.status;
  return { ...followUp, status };
}

function stageRank(stage: MarketingLeadStage) {
  return stage === "LOST" ? Number.MAX_SAFE_INTEGER : marketingStages.indexOf(stage);
}

function advanceLead(leadId: string | undefined, stage: MarketingLeadStage, occurredAt = new Date().toISOString()) {
  if (!leadId) return;
  const lead = marketingLeads.find((entry) => entry.id === leadId);
  if (!lead || lead.stage === "LOST" || stage === "LOST" || stageRank(stage) <= stageRank(lead.stage)) return;
  lead.stage = stage;
  lead.lastContactAt = occurredAt;
  lead.updatedAt = occurredAt;
}

function leadIdForOrder(order: SalesOrder | undefined) {
  if (!order?.quotationId) return undefined;
  return quotations.find((quote) => quote.id === order.quotationId)?.leadId;
}

function employeeActivity(
  userId: string,
  activityType: MarketingActivityType,
  source: MarketingActivity["source"],
  occurredAt: string,
  values: Partial<MarketingActivity>
): MarketingActivity | null {
  const employee = demoUsers.find((entry) => entry.id === userId);
  if (!employee) return null;
  return {
    id: values.id ?? `${source.toLowerCase()}-${values.referenceId ?? activityType.toLowerCase()}-${occurredAt}`,
    userId,
    employeeCode: employee.employeeCode ?? employee.id.toUpperCase(),
    employeeName: employee.name,
    territory: employee.territory,
    activityType,
    source,
    occurredAt,
    submittedAt: values.submittedAt ?? occurredAt,
    verification: values.verification ?? "SYSTEM_VERIFIED",
    createdByUserId: values.createdByUserId ?? userId,
    ...values
  };
}

function unifiedMarketingActivities(req: Request, from?: string, to?: string) {
  const user = userFor(req)!;
  const allowed = marketingEmployeeIds(user);
  const derived: MarketingActivity[] = [];

  for (const visit of fieldVisits) {
    if (visit.checkInAt) {
      const activity = employeeActivity(visit.userId, "CHECK_IN", "FIELD_VISIT", visit.checkInAt, { id: `visit-in-${visit.id}`, customerId: visit.customerId, leadId: visit.leadId, subjectName: visit.customerName, productIds: visit.productIds, purpose: visit.purpose, remarks: visit.remarks, latitude: visit.checkInLatitude, longitude: visit.checkInLongitude, accuracyMeters: visit.checkInAccuracyMeters, verification: visit.verification ?? "GPS_VERIFIED", referenceType: "FieldVisit", referenceId: visit.id, referenceNumber: visit.id });
      if (activity) derived.push(activity);
    }
    if (visit.checkOutAt) {
      const activity = employeeActivity(visit.userId, "CHECK_OUT", "FIELD_VISIT", visit.checkOutAt, { id: `visit-out-${visit.id}`, customerId: visit.customerId, leadId: visit.leadId, subjectName: visit.customerName, productIds: visit.productIds, purpose: visit.purpose, remarks: visit.outcome ?? visit.remarks, nextFollowUpAt: visit.nextFollowUpAt, verification: visit.verification ?? "GPS_VERIFIED", referenceType: "FieldVisit", referenceId: visit.id, referenceNumber: visit.id });
      if (activity) derived.push(activity);
    }
  }
  for (const followUp of marketingFollowUps.filter((entry) => entry.status === "COMPLETED" && entry.completedAt)) {
    const activity = employeeActivity(followUp.assignedUserId, "FOLLOW_UP_COMPLETED", "LEAD", followUp.completedAt!, { id: `followup-${followUp.id}`, leadId: followUp.leadId, customerId: followUp.customerId, subjectName: followUp.subjectName, purpose: followUp.purpose, remarks: followUp.outcome, nextFollowUpAt: followUp.nextFollowUpAt, referenceType: "FollowUp", referenceId: followUp.id, referenceNumber: followUp.id });
    if (activity) derived.push(activity);
  }
  for (const quote of quotations) {
    if (quote.status === "Draft") continue;
    const occurredAt = quote.submittedAt ?? quote.createdAt ?? quote.date;
    const activity = employeeActivity(quote.ownerId, "QUOTATION_SUBMITTED", "QUOTATION", occurredAt, { id: `quote-${quote.id}`, leadId: quote.leadId, customerId: quote.customerId, subjectName: quote.customerName, productIds: quote.lines.map((line) => line.productId), referenceType: "Quotation", referenceId: quote.id, referenceNumber: quote.quotationNumber, amountBdt: quote.total });
    if (activity) derived.push(activity);
  }
  for (const order of orders) {
    const activity = employeeActivity(order.ownerId, "ORDER_RECEIVED", "ORDER", order.createdAt ?? order.date, { id: `order-${order.id}`, leadId: leadIdForOrder(order), customerId: order.customerId, subjectName: order.customerName, productIds: order.lines.map((line) => line.productId), referenceType: "SalesOrder", referenceId: order.id, referenceNumber: order.orderNumber, amountBdt: order.total });
    if (activity) derived.push(activity);
  }
  for (const delivery of deliveries) {
    const order = orders.find((entry) => entry.id === delivery.orderId);
    const activity = employeeActivity(salesOwnerForDelivery(delivery) ?? "", "DELIVERY_POSTED", "DELIVERY", delivery.postedAt ?? delivery.date, { id: `delivery-${delivery.id}`, leadId: leadIdForOrder(order), customerId: delivery.customerId, subjectName: delivery.customerName, productIds: delivery.lines.map((line) => line.productId), referenceType: "Delivery", referenceId: delivery.id, referenceNumber: delivery.challanNumber, amountBdt: money(delivery.lines.reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0))) });
    if (activity) derived.push(activity);
  }
  for (const invoice of invoices.filter((entry) => entry.status === "Approved" && entry.approvedAt)) {
    const order = invoice.orderId ? orders.find((entry) => entry.id === invoice.orderId) : undefined;
    const activity = employeeActivity(invoice.ownerId, "INVOICE_APPROVED", "INVOICE", invoice.approvedAt!, { id: `invoice-${invoice.id}`, leadId: leadIdForOrder(order), customerId: invoice.customerId, subjectName: invoice.customerName, productIds: invoice.lines.map((line) => line.productId), referenceType: "SalesInvoice", referenceId: invoice.id, referenceNumber: invoice.invoiceNumber, amountBdt: invoice.total });
    if (activity) derived.push(activity);
  }
  for (const collection of collections.filter((entry) => entry.status === "Posted")) {
    const order = collection.orderId ? orders.find((entry) => entry.id === collection.orderId) : undefined;
    const activity = employeeActivity(collection.ownerId, "PAYMENT_COLLECTED", "COLLECTION", collection.postedAt ?? collection.date, { id: `collection-${collection.id}`, leadId: leadIdForOrder(order), customerId: collection.customerId, subjectName: collection.customerName, referenceType: "Collection", referenceId: collection.id, referenceNumber: collection.receiptNumber, amountBdt: collection.amount });
    if (activity) derived.push(activity);
  }

  return [...marketingActivities, ...derived]
    .filter((activity) => allowed.has(activity.userId))
    .filter((activity) => !from || !to || inTimestampPeriod(activity.occurredAt, from, to))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
}

function visibleMarketingLeads(req: Request) {
  const allowed = marketingEmployeeIds(userFor(req)!);
  return marketingLeads.filter((lead) => allowed.has(lead.assignedUserId));
}

function visibleMarketingFollowUps(req: Request) {
  const allowed = marketingEmployeeIds(userFor(req)!);
  return marketingFollowUps.filter((followUp) => allowed.has(followUp.assignedUserId)).map(followUpForResponse);
}

function scoreWeight(event: MarketingScoreRule["event"]) {
  return marketingScoreRules.find((rule) => rule.event === event && rule.active)?.points ?? 0;
}

function percent(actual: Decimal | number | string, target: Decimal | number | string) {
  const targetValue = new Decimal(target);
  return precise(targetValue.lte(0) ? 0 : new Decimal(actual).div(targetValue).mul(100), 2);
}

function distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(latitudeB - latitudeA);
  const dLng = radians(longitudeB - longitudeA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function marketingPerformance(employee: EmployeeDirectoryEntry, from: string, to: string): MarketingPerformanceRow {
  const requestLike = { headers: { "x-user-id": "u-super" } } as unknown as Request;
  const activities = unifiedMarketingActivities(requestLike, from, to).filter((activity) => activity.userId === employee.id);
  const employeeVisits = fieldVisits.filter((visit) => visit.userId === employee.id && inTimestampPeriod(visit.plannedAt, from, to));
  const employeeLeads = marketingLeads.filter((lead) => lead.assignedUserId === employee.id && inTimestampPeriod(lead.createdAt, from, to));
  const employeeFollowUps = marketingFollowUps.filter((followUp) => followUp.assignedUserId === employee.id && inTimestampPeriod(followUp.dueAt, from, to));
  const employeeQuotes = quotations.filter((quote) => quote.ownerId === employee.id && inPeriod(quote.date, from, to));
  const employeeOrders = orders.filter((order) => order.ownerId === employee.id && inPeriod(order.date, from, to));
  const employeeDeliveries = deliveries.filter((delivery) => salesOwnerForDelivery(delivery) === employee.id && inPeriod(delivery.date, from, to));
  const employeeCollections = collections.filter((collection) => collection.ownerId === employee.id && collection.status === "Posted" && inPeriod(collection.date, from, to));
  const completedVisits = employeeVisits.filter((visit) => visit.status === "Completed").length;
  const verifiedVisits = employeeVisits.filter((visit) => visit.status === "Completed" && ["GPS_VERIFIED", "SYSTEM_VERIFIED"].includes(visit.verification ?? "UNVERIFIED")).length;
  const qualifiedLeads = employeeLeads.filter((lead) => !["NEW", "CONTACTED", "LOST"].includes(lead.stage)).length;
  const convertedCustomers = employeeLeads.filter((lead) => Boolean(lead.customerId)).length;
  const followUpsCompleted = employeeFollowUps.filter((followUp) => followUp.status === "COMPLETED").length;
  const overdueFollowUps = employeeFollowUps.map(followUpForResponse).filter((followUp) => followUp.status === "OVERDUE").length;
  const deliveredSales = employeeDeliveries.flatMap((delivery) => delivery.lines).reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));
  const collected = employeeCollections.reduce((sum, collection) => sum.plus(collection.amount), new Decimal(0));
  const targetMonth = to.slice(0, 7);
  const target = marketingTargets.find((entry) => entry.userId === employee.id && entry.month === targetMonth) ?? { id: `target-empty-${employee.id}`, userId: employee.id, month: targetMonth, salesTargetBdt: "0.00", newCustomerTarget: 0, visitTarget: 0, collectionTargetBdt: "0.00", createdByUserId: "system", createdAt: new Date().toISOString() };
  const progress = {
    sales: percent(deliveredSales, target.salesTargetBdt),
    visits: percent(verifiedVisits, target.visitTarget),
    customers: percent(convertedCustomers, target.newCustomerTarget),
    collections: percent(collected, target.collectionTargetBdt),
    overall: "0.00"
  };
  progress.overall = precise([progress.sales, progress.visits, progress.customers, progress.collections].reduce((sum, value) => sum.plus(value), new Decimal(0)).div(4), 2);
  const activityScore = convertedCustomers * scoreWeight("NEW_QUALIFIED_CUSTOMER") + verifiedVisits * scoreWeight("VERIFIED_CUSTOMER_VISIT") + qualifiedLeads * scoreWeight("QUALIFIED_LEAD") + employeeQuotes.length * scoreWeight("QUOTATION_SUBMITTED") + employeeOrders.length * scoreWeight("ORDER_RECEIVED") + employeeCollections.length * scoreWeight("PAYMENT_COLLECTED") + followUpsCompleted * scoreWeight("FOLLOW_UP_COMPLETED");
  return {
    employee,
    activityCount: activities.length,
    checkIns: activities.filter((activity) => activity.activityType === "CHECK_IN").length,
    completedVisits,
    verifiedVisits,
    newLeads: employeeLeads.length,
    qualifiedLeads,
    followUpsCompleted,
    overdueFollowUps,
    presentations: activities.filter((activity) => activity.activityType === "PRODUCT_PRESENTATION").length,
    samples: activities.filter((activity) => activity.activityType === "SAMPLE_DELIVERED").length,
    quotations: employeeQuotes.length,
    orders: employeeOrders.length,
    deliveredSalesBdt: money(deliveredSales),
    collectionsBdt: money(collected),
    convertedCustomers,
    activityScore,
    targets: target,
    progress
  };
}

function performanceRowsFor(req: Request, from: string, to: string) {
  const allowed = marketingEmployeeIds(userFor(req)!);
  return demoUsers.filter((entry) => allowed.has(entry.id)).map((entry) => marketingPerformance(directoryEntry(entry), from, to));
}

function derivedTrackingStatus(location: CurrentEmployeeLocation, now = Date.now()): CurrentEmployeeLocation["status"] {
  const ageMinutes = Math.max(0, (now - new Date(location.recordedAt).getTime()) / 60_000);
  const activeSession = Boolean(location.sessionId && trackingSessions.some((session) => session.id === location.sessionId && session.status === "Active"));
  if (activeSession && ageMinutes <= 1) return "LIVE";
  if (activeSession && ageMinutes <= 10) return "RECENT";
  if (activeSession) return "STALE";
  if (ageMinutes <= 180) return "OFFLINE";
  return "NOT_TRACKING";
}

let demoLocationPoll = 0;
function currentFieldLocations(user: User) {
  const allowed = new Set(visibleFieldEmployees(user).map((employee) => employee.id));
  const demoPath = [[23.87575, 90.37938], [23.87582, 90.37945], [23.8759, 90.37952], [23.87584, 90.37943]];
  demoLocationPoll += 1;
  return currentEmployeeLocations
    .filter((location) => allowed.has(location.userId))
    .map((location) => {
      const next = structuredClone(location);
      if (next.userId === "sales1" && next.source === "DEMO") {
        const coordinate = demoPath[demoLocationPoll % demoPath.length];
        next.latitude = coordinate[0];
        next.longitude = coordinate[1];
        next.recordedAt = new Date().toISOString();
      }
      next.status = derivedTrackingStatus(next);
      return next;
    });
}

function withRequestedDate(timestamp: string, date: string) {
  return `${date}T${timestamp.slice(11)}`;
}

function salespersonPerformance(employee: SalespersonEmployee, from: string, to: string): SalespersonPerformanceDetail {
  const employeeQuotes = quotations.filter((quote) => quote.ownerId === employee.id && inPeriod(quote.date, from, to));
  const employeeOrders = orders.filter((order) => order.ownerId === employee.id && inPeriod(order.date, from, to));
  const employeeDeliveries = deliveries.filter((delivery) => salesOwnerForDelivery(delivery) === employee.id && inPeriod(delivery.date, from, to));
  const employeeCollections = collections.filter((collection) => collection.ownerId === employee.id && collection.status === "Posted" && inPeriod(collection.date, from, to));
  const deliveredOrderIds = new Set(employeeDeliveries.map((delivery) => delivery.orderId));
  const handledCustomerIds = new Set([
    ...employeeQuotes.map((quote) => quote.customerId),
    ...employeeOrders.map((order) => order.customerId),
    ...employeeDeliveries.map((delivery) => delivery.customerId),
    ...employeeCollections.map((collection) => collection.customerId)
  ]);
  const assignedCustomers = customers.filter((customer) => customer.assignedSalesUserId === employee.id);
  const deliveredSales = employeeDeliveries.flatMap((delivery) => delivery.lines).reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));
  const deliveredUnits = employeeDeliveries.flatMap((delivery) => delivery.lines).reduce((sum, line) => sum.plus(line.quantity), new Decimal(0));
  const collectionValue = employeeCollections.reduce((sum, collection) => sum.plus(collection.amount), new Decimal(0));
  const quotationValue = employeeQuotes.reduce((sum, quote) => sum.plus(quote.total), new Decimal(0));
  const convertedCount = employeeQuotes.filter((quote) => quote.status === "Converted" || orders.some((order) => order.quotationId === quote.id)).length;
  const pendingQuotationValue = employeeQuotes.filter((quote) => ["Draft", "Sent", "Accepted"].includes(quote.status) && !orders.some((order) => order.quotationId === quote.id)).reduce((sum, quote) => sum.plus(quote.total), new Decimal(0));
  const totalDiscount = employeeQuotes.reduce((sum, quote) => sum.plus(quote.discountTotal), new Decimal(0));
  const orderValue = employeeOrders.reduce((sum, order) => sum.plus(order.total), new Decimal(0));
  const employeeUser = demoUsers.find((entry) => entry.id === employee.id)!;
  const marketing = marketingPerformance(directoryEntry(employeeUser), from, to);
  const requestLike = { headers: { "x-user-id": "u-super" } } as unknown as Request;
  const marketingRows = unifiedMarketingActivities(requestLike, from, to).filter((activity) => activity.userId === employee.id);
  const employeeFollowUps = marketingFollowUps.filter((followUp) => followUp.assignedUserId === employee.id && inTimestampPeriod(followUp.dueAt, from, to)).map(followUpForResponse);
  const summary: SalespersonPerformanceSummary = {
    quotationsCreated: employeeQuotes.length,
    quotationValue: money(quotationValue),
    sentQuotations: employeeQuotes.filter((quote) => quote.status === "Sent").length,
    acceptedQuotations: employeeQuotes.filter((quote) => quote.status === "Accepted").length,
    convertedQuotations: convertedCount,
    rejectedQuotations: employeeQuotes.filter((quote) => quote.status === "Rejected").length,
    pendingQuotationValue: money(pendingQuotationValue),
    ordersCreated: employeeOrders.length,
    ordersDelivered: deliveredOrderIds.size,
    deliveredSalesValue: money(deliveredSales),
    unitsDelivered: precise(deliveredUnits, 4),
    collectionsReceived: money(collectionValue),
    customersHandled: handledCustomerIds.size,
    assignedCustomerDue: money(assignedCustomers.reduce((sum, customer) => sum.plus(customer.currentDue), new Decimal(0))),
    averageOrderValue: money(employeeOrders.length ? orderValue.div(employeeOrders.length) : 0),
    conversionRate: precise(employeeQuotes.length ? new Decimal(convertedCount).div(employeeQuotes.length).mul(100) : 0, 2),
    totalDiscount: money(totalDiscount),
    averageDiscount: money(employeeQuotes.length ? totalDiscount.div(employeeQuotes.length) : 0),
    checkIns: marketing.checkIns,
    completedVisits: marketing.completedVisits,
    verifiedVisits: marketing.verifiedVisits,
    newLeads: marketing.newLeads,
    qualifiedLeads: marketing.qualifiedLeads,
    followUpsCompleted: marketing.followUpsCompleted,
    overdueFollowUps: marketing.overdueFollowUps,
    presentations: marketing.presentations,
    samples: marketing.samples,
    activityScore: marketing.activityScore,
    targetProgress: marketing.progress.overall
  };
  const productTotals = new Map<string, { product: string; units: Decimal; value: Decimal }>();
  for (const line of employeeDeliveries.flatMap((delivery) => delivery.lines)) {
    const row = productTotals.get(line.productId) ?? { product: line.productName, units: new Decimal(0), value: new Decimal(0) };
    row.units = row.units.plus(line.quantity);
    row.value = row.value.plus(line.lineTotal);
    productTotals.set(line.productId, row);
  }
  const visibleCustomers = customers.filter((customer) => handledCustomerIds.has(customer.id) || customer.assignedSalesUserId === employee.id);
  return {
    employee,
    summary,
    tables: {
      quotations: { id: "employee-quotations", title: "Quotation Details", columns: [{ key: "date", label: "Date" }, { key: "reference", label: "Quotation" }, { key: "customer", label: "Customer" }, { key: "status", label: "Status" }, { key: "discount", label: "Discount", align: "right" }, { key: "value", label: "Value", align: "right" }], rows: employeeQuotes.map((quote) => ({ date: quote.date, reference: quote.quotationNumber, customer: quote.customerName, status: quote.status, discount: quote.discountTotal, value: quote.total })) },
      orders: { id: "employee-orders", title: "Order Details", columns: [{ key: "date", label: "Date" }, { key: "reference", label: "Order" }, { key: "customer", label: "Customer" }, { key: "status", label: "Status" }, { key: "value", label: "Value", align: "right" }], rows: employeeOrders.map((order) => ({ date: order.date, reference: order.orderNumber, customer: order.customerName, status: order.status, value: order.total })) },
      deliveries: { id: "employee-deliveries", title: "Delivery / Challan Details", columns: [{ key: "date", label: "Date" }, { key: "reference", label: "Challan" }, { key: "customer", label: "Customer" }, { key: "units", label: "Units", align: "right" }, { key: "value", label: "Delivered Value", align: "right" }], rows: employeeDeliveries.map((delivery) => ({ date: delivery.date, reference: delivery.challanNumber, customer: delivery.customerName, units: precise(delivery.lines.reduce((sum, line) => sum.plus(line.quantity), new Decimal(0)), 4), value: money(delivery.lines.reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0))) })) },
      collections: { id: "employee-collections", title: "Collection Details", columns: [{ key: "date", label: "Date" }, { key: "reference", label: "Receipt" }, { key: "customer", label: "Customer" }, { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", align: "right" }], rows: employeeCollections.map((collection) => ({ date: collection.date, reference: collection.receiptNumber, customer: collection.customerName, mode: collection.paymentMode, amount: collection.amount })) },
      customers: { id: "employee-customers", title: "Customer Summary", columns: [{ key: "customer", label: "Customer" }, { key: "territory", label: "Territory" }, { key: "terms", label: "Terms" }, { key: "sales", label: "Total Sales", align: "right" }, { key: "collected", label: "Collected", align: "right" }, { key: "due", label: "Current Due", align: "right" }], rows: visibleCustomers.map((customer) => ({ customer: customer.name, territory: customer.territory, terms: customer.paymentTerms, sales: customer.totalSales, collected: customer.totalCollected, due: customer.currentDue })) },
      products: { id: "employee-products", title: "Top Products", columns: [{ key: "product", label: "Product" }, { key: "units", label: "Units", align: "right" }, { key: "value", label: "Delivered Value", align: "right" }], rows: [...productTotals.values()].sort((a, b) => b.value.comparedTo(a.value)).map((row) => ({ product: row.product, units: precise(row.units, 4), value: money(row.value) })) },
      marketingActivities: { id: "employee-marketing", title: "Marketing Activity", columns: [{ key: "date", label: "Date / Time" }, { key: "activity", label: "Activity" }, { key: "subject", label: "Customer / Lead" }, { key: "verification", label: "Verification" }, { key: "reference", label: "ERP Reference" }], rows: marketingRows.map((activity) => ({ date: activity.occurredAt, activity: activity.activityType.replaceAll("_", " "), subject: activity.subjectName ?? "-", verification: activity.verification.replaceAll("_", " "), reference: activity.referenceNumber ?? "Manual" })) },
      followUps: { id: "employee-followups", title: "Follow-up Status", columns: [{ key: "due", label: "Due" }, { key: "subject", label: "Customer / Lead" }, { key: "purpose", label: "Purpose" }, { key: "status", label: "Status" }, { key: "outcome", label: "Outcome" }], rows: employeeFollowUps.map((followUp) => ({ due: followUp.dueAt, subject: followUp.subjectName, purpose: followUp.purpose, status: followUp.status, outcome: followUp.outcome ?? "-" })) }
    }
  };
}

function documentById(documentId: string) {
  for (const record of imports) {
    const importDocument = record.documents.find((document) => document.id === documentId);
    if (importDocument) return { document: importDocument as DocumentRecord, area: "imports" as const };
    const costDocument = record.costs.find((cost) => cost.attachment?.id === documentId)?.attachment;
    if (costDocument) return { document: costDocument, area: "imports" as const };
  }
  const expenseDocument = expenses.find((expense) => expense.attachment?.id === documentId)?.attachment;
  if (expenseDocument) return { document: expenseDocument, area: "accounts" as const };
  const activityDocument = marketingActivities.flatMap((activity) => activity.attachments ?? []).find((document) => document.id === documentId);
  if (activityDocument) return { document: activityDocument, area: "marketing" as const };
  const visitDocument = fieldVisits.flatMap((visit) => visit.attachments ?? []).find((document) => document.id === documentId);
  if (visitDocument) return { document: visitDocument, area: "marketing" as const };
  return null;
}

function aiContextFromRequest(req: Request): AIContext {
  const source = req.method === "POST" ? (req.body?.context ?? {}) : req.query;
  return {
    route: String(source.route ?? "/app/dashboard"),
    entityType: source.entityType ? String(source.entityType) as AIContext["entityType"] : undefined,
    entityId: source.entityId ? String(source.entityId) : undefined,
    employeeId: source.employeeId ? String(source.employeeId) : undefined,
    reportFrom: source.reportFrom ? String(source.reportFrom) : undefined,
    reportTo: source.reportTo ? String(source.reportTo) : undefined
  };
}

function aiSuggestionsFor(user: User, context: AIContext) {
  if (context.entityType === "import" && canAccessArea(user, "imports")) return ["Explain the current shipment stage", "Which documents are missing?", "What needs attention next?"];
  if (context.entityType === "inventory" && canAccessArea(user, "inventory")) return ["Which batches need attention?", "Which lot should be issued first?", "Explain the FIFO rule"];
  if (context.entityType === "sales" && canAccessArea(user, "sales")) return ["Which customers need follow-up?", "Which quotations are still pending?", "Summarize collections and dues"];
  if (context.entityType === "employees" && canAccessEmployeeWorkspace(user)) return canViewEmployeeActivity(user)
    ? ["Summarize this employee's activity", "Who has overdue follow-ups?", "Who is below target this month?"]
    : ["Summarize the employee directory", "Explain this employee's access", "Which employee records are inactive?"];
  if (context.entityType === "marketing" && hasEffectivePermission(user, "marketing", "view")) return user.role === "Sales Executive"
    ? ["Summarize my activity today", "Which follow-ups are overdue?", "How am I progressing against target?"]
    : ["Who has overdue follow-ups?", "Which leads need attention?", "Who is below visit target?"];
  if (context.entityType === "field-team" && marketingScope(user) !== "NONE") return ["Who is active in the field?", "Summarize today's visits", "Which location updates are stale?"];
  if (context.entityType === "insights") return ["What needs attention first?", "Summarize my operational alerts", "Open the highest priority source"];
  if (context.entityType === "reports" && canAccessArea(user, "reports")) return ["Summarize this report period", "Compare salesperson performance", "Which customer owes the most?"];
  return ["What needs attention today?", "Summarize my current workspace", "Which action should I review next?"];
}

function aiRecommendationsFor(req: Request, context: AIContext): AIRecommendation[] {
  const user = userFor(req)!;
  const result: AIRecommendation[] = [];
  const canSeeImports = canAccessArea(user, "imports");
  const canSeeInventory = canAccessArea(user, "inventory");
  const canSeeSales = canAccessArea(user, "sales");
  const canSeeMarketing = hasEffectivePermission(user, "marketing", "view");
  const include = (entities: AIContext["entityType"][]) => !context.entityType || context.entityType === "dashboard" || context.entityType === "insights" || entities.includes(context.entityType);

  if (canSeeImports && include(["import"])) {
    const record = imports.find((entry) => entry.id === context.entityId) ?? imports.find((entry) => !["Closed", "Cancelled", "Received"].includes(entry.status));
    if (record) {
      const expected = ["PI", record.paymentMode === "TT" ? "Swift Copy" : "LC", "Commercial Invoice", "Packing List", "Bill of Lading"];
      const existing = new Set(record.documents.map((document) => document.type.toLowerCase()));
      const missing = expected.filter((type) => !existing.has(type.toLowerCase()));
      if (missing.length) result.push({ id: `import-docs-${record.id}`, title: `${record.primaryReference} is missing ${missing.length} core document${missing.length === 1 ? "" : "s"}`, summary: missing.join(", "), severity: "Attention", sourceLabel: record.primaryReference, sourcePath: `/app/imports/${record.id}`, reason: "The shipment file is incomplete for its current stage.", recommendedAction: "Open Documents and attach or verify the missing files." });
      if (record.status === "Costing" && hasCapability(req, "view_sensitive_cost")) result.push({ id: `import-cost-${record.id}`, title: "Landed-cost review is still open", summary: `${record.costs.length} cost rows are recorded and await validation/finalization.`, severity: "Attention", sourceLabel: record.primaryReference, sourcePath: `/app/imports/${record.id}`, reason: "Warehouse receiving stays locked until the deterministic cost snapshot is finalized.", recommendedAction: "Preview allocations, reconcile every row, then use the authorized finalize action." });
    }
  }

  if (canSeeInventory && include(["inventory"])) {
    const attention = stockBatches.filter((batch) => decimal(batch.quantityAvailable).gt(0) && expiryStatus(batch.expiryDate) !== "Normal").sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    if (attention.length) {
      const batch = attention[0];
      result.push({ id: `expiry-${batch.id}`, title: `${attention.length} batch${attention.length === 1 ? " needs" : "es need"} expiry attention`, summary: `${batch.productName}, lot ${batch.lotNumber}, expires ${batch.expiryDate}.`, severity: batch.expiryStatus === "Expired" ? "Critical" : "Attention", sourceLabel: "Inventory batches", sourcePath: "/app/inventory", reason: "Expiry remains visible alongside FIFO so unusable or urgent stock is not selected blindly.", recommendedAction: "Review the batch register and plan issue or quarantine according to policy." });
    }
    const grouped = new Map<string, StockBatch[]>();
    for (const batch of stockBatches.filter((entry) => decimal(entry.quantityAvailable).gt(0) && expiryStatus(entry.expiryDate) !== "Expired")) grouped.set(batch.productId, [...(grouped.get(batch.productId) ?? []), batch]);
    const multi = [...grouped.values()].map((rows) => rows.sort((a, b) => a.receivedDate.localeCompare(b.receivedDate) || a.id.localeCompare(b.id))).find((rows) => rows.length > 1);
    if (multi) result.push({ id: `fifo-${multi[0].productId}`, title: "Older stock remains available", summary: `${multi[0].productName}: lot ${multi[0].lotNumber} has ${multi[0].quantityAvailable} units and is the authoritative FIFO recommendation.`, severity: "Info", sourceLabel: `Lot ${multi[0].lotNumber}`, sourcePath: "/app/inventory", reason: `A newer lot (${multi[1].lotNumber}) also exists, but the earlier eligible receipt must be issued first.`, recommendedAction: "Use automatic FIFO in Delivery; any newer-lot override still needs capability and a reason." });
  }

  if (canSeeSales && include(["sales", "reports"])) {
    const scopedCustomers = customerScoped(req).filter((customer) => decimal(customer.currentDue).gt(0)).sort((a, b) => decimal(b.currentDue).comparedTo(a.currentDue));
    if (scopedCustomers[0]) {
      const customer = scopedCustomers[0];
      const lastCollection = collections.filter((entry) => entry.customerId === customer.id && entry.status === "Posted").sort((a, b) => b.date.localeCompare(a.date))[0];
      const lastDelivery = deliveries.filter((entry) => entry.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date))[0];
      result.push({ id: `due-${customer.id}`, title: decimal(customer.currentDue).gt(decimal(customer.creditLimit).mul(0.25)) ? "High follow-up priority" : "Collection follow-up suggested", summary: `${customer.name} has an outstanding due of Tk ${money(customer.currentDue)}.${lastCollection ? ` Last collection: ${lastCollection.date}.` : " No posted collection is recorded."}`, severity: decimal(customer.currentDue).gt(decimal(customer.creditLimit).mul(0.5)) ? "Critical" : "Attention", sourceLabel: customer.name, sourcePath: "/app/sales?view=collections", reason: `${lastDelivery ? `Last delivery was ${lastDelivery.date}. ` : ""}The due uses ${money(decimal(customer.currentDue).div(customer.creditLimit || 1).mul(100))}% of the current credit limit.`, recommendedAction: "Review the customer ledger, payment terms and last verified collection before the next delivery." });
    }
    const scopedQuotes = salesScoped(quotations, req);
    const pendingQuote = scopedQuotes.find((quote) => ["Sent", "Accepted"].includes(quote.status) && !orders.some((order) => order.quotationId === quote.id));
    if (pendingQuote) result.push({ id: `quote-${pendingQuote.id}`, title: "Quotation needs conversion follow-up", summary: `${pendingQuote.quotationNumber} for ${pendingQuote.customerName} is ${pendingQuote.status.toLowerCase()} and has no linked order.`, severity: "Info", sourceLabel: pendingQuote.quotationNumber, sourcePath: "/app/sales?view=orders", reason: "The commercial flow has not yet moved to an order.", recommendedAction: "Confirm the customer decision, then use the existing conversion action when approved." });
  }

  if (["Super Admin", "Managing Director"].includes(user.role) && include(["dashboard", "reports"])) {
    const month = businessDate().slice(0, 7);
    const sales = deliveries.filter((delivery) => delivery.date.startsWith(month)).flatMap((delivery) => delivery.lines).reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));
    const collected = collections.filter((collection) => collection.status === "Posted" && collection.date.startsWith(month)).reduce((sum, collection) => sum.plus(collection.amount), new Decimal(0));
    result.unshift({ id: "management-cash-gap", title: collected.lt(sales) ? "Collections trail delivered sales" : "Collections cover delivered sales", summary: `This month: delivered sales Tk ${money(sales)}; collections Tk ${money(collected)}.`, severity: collected.lt(sales) ? "Attention" : "Info", sourceLabel: "Management reports", sourcePath: "/app/reports", reason: "This compares posted delivery value with posted collections without inventing profit or accounting entries.", recommendedAction: collected.lt(sales) ? "Review customer dues and salesperson follow-up priorities." : "Continue monitoring receivables and upcoming deliveries." });
  }

  if (canSeeMarketing && include(["marketing", "employees"])) {
    const today = businessDate();
    const followUps = visibleMarketingFollowUps(req);
    const overdue = followUps.filter((followUp) => followUp.status === "OVERDUE");
    if (overdue.length) result.push({ id: "marketing-overdue-followups", title: `${overdue.length} marketing follow-up${overdue.length === 1 ? " is" : "s are"} overdue`, summary: `${overdue[0].subjectName}: ${overdue[0].purpose}, due ${overdue[0].dueAt}.`, severity: "Attention", sourceLabel: "Marketing follow-ups", sourcePath: "/app/sales?view=marketing", reason: "Overdue status is calculated from the saved due time in Asia/Dhaka and an incomplete status.", recommendedAction: "Open the follow-up queue, record the outcome, and schedule the next valid action." });
    const visibleLeads = visibleMarketingLeads(req);
    const untouchedThreshold = Date.now() - 14 * 86_400_000;
    const untouched = visibleLeads.filter((lead) => lead.stage !== "LOST" && new Date(lead.lastContactAt ?? lead.createdAt).getTime() < untouchedThreshold);
    if (untouched.length) result.push({ id: "marketing-untouched-leads", title: `${untouched.length} lead${untouched.length === 1 ? " has" : "s have"} no contact for 14+ days`, summary: `${untouched[0].leadNumber} ${untouched[0].organizationName} is currently at ${untouched[0].stage}.`, severity: "Attention", sourceLabel: "Marketing lead funnel", sourcePath: "/app/sales?view=marketing", reason: "The latest stored contact timestamp is older than the deterministic 14-day review threshold.", recommendedAction: "Assign a follow-up or record a verified outcome; do not advance the funnel without evidence." });
    const negotiation = visibleLeads.filter((lead) => lead.stage === "NEGOTIATION");
    if (negotiation.length) result.push({ id: "marketing-negotiation", title: `${negotiation.length} lead${negotiation.length === 1 ? " is" : "s are"} in negotiation`, summary: negotiation.slice(0, 3).map((lead) => lead.organizationName).join(", "), severity: "Info", sourceLabel: "Marketing funnel", sourcePath: "/app/sales?view=marketing", reason: "These stages come from recorded negotiation activity and have not yet advanced through an ERP order.", recommendedAction: "Review the last contact, quotation status and next follow-up before deciding the next step." });
    const unverifiedVisits = fieldVisits.filter((visit) => marketingEmployeeIds(user).has(visit.userId) && inTimestampPeriod(visit.plannedAt, `${today.slice(0, 7)}-01`, today) && ["MANUAL", "UNVERIFIED"].includes(visit.verification ?? "UNVERIFIED"));
    if (unverifiedVisits.length) result.push({ id: "marketing-unverified-visits", title: `${unverifiedVisits.length} visit${unverifiedVisits.length === 1 ? " lacks" : "s lack"} GPS verification`, summary: `${unverifiedVisits[0].customerName}: ${unverifiedVisits[0].verification ?? "UNVERIFIED"}.`, severity: "Info", sourceLabel: "Visit verification", sourcePath: "/app/reports?view=marketing&preset=verification", reason: "A visit is never silently marked GPS verified when coordinates are missing.", recommendedAction: "Review the visit evidence and location timestamp before relying on it for field verification." });
  }

  if (marketingScope(user) !== "NONE" && include(["field-team", "marketing", "employees"])) {
    const locations = currentFieldLocations(user);
    const stale = locations.filter((location) => ["STALE", "OFFLINE", "NOT_TRACKING"].includes(location.status));
    const activeVisits = locations.filter((location) => location.currentVisit?.status === "Checked In");
    result.push({ id: "field-team-status", title: stale.length ? `${stale.length} field update${stale.length === 1 ? " needs" : "s need"} attention` : "Field team feed is current", summary: `${locations.filter((location) => location.status === "LIVE").length} live, ${locations.filter((location) => location.status === "RECENT").length} recent and ${activeVisits.length} currently checked in.`, severity: stale.some((location) => location.status === "STALE") ? "Attention" : "Info", sourceLabel: marketingScope(user) === "SELF" ? "My field activity" : "Field Team", sourcePath: marketingScope(user) === "SELF" ? "/app/sales?view=marketing&marketing=field-team" : "/app/employees?view=field-team", reason: stale.length ? `Latest affected employee: ${stale[0].employee.name} (${stale[0].status.toLowerCase()}); last update ${stale[0].recordedAt}.` : "Every visible active session has a recent coordinate.", recommendedAction: stale.length ? "Open the map and verify the timestamp before contacting the employee; old coordinates are never labelled live." : "Continue monitoring visits and planned follow-ups." });
  }
  const categoryFor = (recommendation: AIRecommendation): NonNullable<AIRecommendation["category"]> => recommendation.id.startsWith("import-") ? "Imports" : recommendation.id.startsWith("expiry-") || recommendation.id.startsWith("fifo-") ? "Inventory" : recommendation.id.startsWith("due-") ? "Collections" : recommendation.id.startsWith("marketing-") ? "Marketing" : recommendation.id.startsWith("field-") ? "Field Team" : recommendation.id.startsWith("management-") ? "Finance" : "Sales";
  return result.slice(0, context.entityType === "insights" ? 20 : 6).map((recommendation) => ({ ...recommendation, category: categoryFor(recommendation), detectedAt: new Date().toISOString() }));
}

app.get("/api/health", (_req, res) => res.json(ok({ service: "mipro-simplified-erp-api", ok: true })));

const safePublicText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum).refine((value) => !/[<>]/.test(value), "HTML is not accepted.");

const publicInquirySchema = z.object({
  name: safePublicText(2, 100),
  organization: safePublicText(2, 140).optional().or(z.literal("")),
  phone: safePublicText(7, 30),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  subject: safePublicText(2, 140).optional().or(z.literal("")),
  productInterest: safePublicText(2, 140).optional().or(z.literal("")),
  message: safePublicText(10, 2000)
});

const sortPublicContent = <T extends { sortOrder?: number }>(rows: T[]) => [...rows].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

app.get("/api/public/site", (_req, res) => res.json(ok(publicSiteSettings, "Public site settings loaded")));
app.get("/api/public/hero-slides", (_req, res) => res.json(ok(sortPublicContent(publicHeroSlides.filter((slide) => slide.published)), "Published hero slides loaded")));
app.get("/api/public/categories", (_req, res) => res.json(ok(sortPublicContent(publicProductCategories.filter((category) => category.published)), "Published product categories loaded")));
app.get("/api/public/products", (req, res) => {
  const category = String(req.query.category ?? "").trim();
  const search = String(req.query.search ?? "").trim().toLowerCase();
  const featured = req.query.featured === undefined ? undefined : String(req.query.featured) === "true";
  const rows = sortPublicContent(publicProducts.filter((product) => {
    if (!product.published) return false;
    if (category && product.category !== category) return false;
    if (featured !== undefined && product.featured !== featured) return false;
    if (search && !`${product.name} ${product.category} ${product.shortDescription} ${product.brand}`.toLowerCase().includes(search)) return false;
    return true;
  }));
  res.json(ok(rows, "Published products loaded", { total: rows.length }));
});
app.get("/api/public/legacy-products/:legacySlug", (req, res) => {
  const product = publicProducts.find((entry) => entry.published && entry.legacySlug === req.params.legacySlug) ?? null;
  res.json(ok(product, product ? "Legacy product route resolved" : "Product not found"));
});
app.get("/api/public/products/:slug", (req, res) => {
  const product = publicProducts.find((entry) => entry.published && entry.slug === req.params.slug) ?? null;
  res.json(ok(product, product ? "Published product loaded" : "Product not found"));
});
app.get("/api/public/certificates", (_req, res) => res.json(ok(sortPublicContent(publicCertificates.filter((certificate) => certificate.published !== false)), "Published certificates loaded")));
app.get("/api/public/resources", (_req, res) => res.json(ok(sortPublicContent(publicResources.filter((resource) => resource.published !== false)), "Published resources loaded")));
app.get("/api/public/resources/:slug", (req, res) => {
  const resource = publicResources.find((entry) => entry.published !== false && entry.slug === req.params.slug) ?? null;
  res.json(ok(resource, resource ? "Published resource loaded" : "Resource not found"));
});

app.post("/api/public/contact", (req, res) => {
  const forwarded = String(req.headers["x-forwarded-for"] ?? req.ip ?? "unknown").split(",")[0].trim();
  const now = Date.now();
  const rate = publicInquiryRate.get(forwarded);
  if (rate && rate.expiresAt > now && rate.count >= 5) return fail(res, 429, "Too many inquiries. Please try again later.");
  publicInquiryRate.set(forwarded, rate && rate.expiresAt > now ? { ...rate, count: rate.count + 1 } : { count: 1, expiresAt: now + 10 * 60 * 1000 });

  const parsed = publicInquirySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? "Invalid inquiry details.");

  const receipt: PublicInquiryReceipt = { inquiryId: id("INQ"), receivedAt: new Date().toISOString(), status: "Received" };
  publicInquiries.unshift({ ...parsed.data, ...receipt });
  res.status(201).json(ok(receipt, "Business inquiry received"));
});

app.get("/api/auth/demo-users", (_req, res) => {
  if (!serverDemoMode) return fail(res, 404, "Demo accounts are not enabled.");
  res.json(ok(demoUsers.map(({ email, name, role, title }) => ({ email, name, role, title })), "Demo users loaded"));
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "");
  const user = demoUsers.find((entry) => entry.email === email);
  if (!user || user.status !== "Active" || passwordByEmail.get(email) !== req.body?.password) return fail(res, 401, "Invalid email, password or inactive account");
  const session: Session = { token: `mock-token-${user.id}`, user };
  res.json(ok(session, "Login successful"));
});

app.post("/api/auth/forgot-password", (req, res) => res.json(ok({ email: req.body?.email ?? "" }, "Reset request accepted")));
app.post("/api/auth/reset-password", (req, res) => {
  const email = String(req.body?.email ?? "");
  const password = String(req.body?.password ?? "");
  if (!passwordByEmail.has(email)) return fail(res, 404, "Account not found.");
  if (password.length < 6) return fail(res, 400, "Password must contain at least 6 characters.");
  passwordByEmail.set(email, password);
  res.json(ok({ email }, "Password updated for this running demo session"));
});
app.get("/api/me", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.status !== "Active") return fail(res, 401, "This ERP account is no longer active.");
  res.json(ok({ token: `mock-token-${user.id}`, user }, "Current access profile refreshed"));
});

app.get("/api/employees/directory", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const canUseDirectory = hasEffectivePermission(user, "users", "view") || hasEffectivePermission(user, "accounts", "view") || hasEffectivePermission(user, "marketing", "view");
  if (!canUseDirectory) return fail(res, 403, `${user.role} cannot access the employee directory.`);
  const marketingOnly = req.query.scope === "marketing";
  const ids = !marketingOnly && (hasEffectivePermission(user, "users", "view") || hasEffectivePermission(user, "accounts", "view"))
    ? new Set(demoUsers.filter((entry) => entry.status === "Active").map((entry) => entry.id))
    : marketingEmployeeIds(user);
  const rows = demoUsers.filter((entry) => ids.has(entry.id)).map(directoryEntry);
  res.json(ok(rows, "Safe employee directory loaded", { total: rows.length, role: user.role, scoped: marketingOnly || !(hasEffectivePermission(user, "users", "view") || hasEffectivePermission(user, "accounts", "view")) }));
});

app.get("/api/marketing/dashboard", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const today = businessDate();
  const monthFrom = `${today.slice(0, 7)}-01`;
  const activities = unifiedMarketingActivities(req);
  const todayActivities = activities.filter((activity) => inTimestampPeriod(activity.occurredAt, today, today));
  const leads = visibleMarketingLeads(req);
  const followUps = visibleMarketingFollowUps(req);
  const allowedEmployeeIds = marketingEmployeeIds(user);
  const locations = currentFieldLocations(user).filter((location) => allowedEmployeeIds.has(location.userId));
  const statusCount = (statuses: CurrentEmployeeLocation["status"][]) => locations.filter((location) => statuses.includes(location.status)).length;
  const fieldTeam = {
    activeNow: statusCount(["LIVE"]),
    recent: statusCount(["RECENT", "STALE"]),
    offline: statusCount(["OFFLINE"]),
    notTracking: statusCount(["NOT_TRACKING"]),
    visitsToday: fieldVisits.filter((visit) => marketingEmployeeIds(user).has(visit.userId) && inTimestampPeriod(visit.plannedAt, today, today)).length
  };
  const performance = performanceRowsFor(req, monthFrom, today);
  const collectionToday = todayActivities.filter((activity) => activity.activityType === "PAYMENT_COLLECTED").reduce((sum, activity) => sum.plus(activity.amountBdt ?? 0), new Decimal(0));
  const followUpToday = followUps.filter((followUp) => businessDate(new Date(followUp.dueAt)) === today && followUp.status === "PENDING").length;
  const overdue = followUps.filter((followUp) => followUp.status === "OVERDUE").length;
  const ownPerformance = performance.find((row) => row.employee.id === user.id);
  const ownPlan = dailyMarketingPlans.find((plan) => plan.userId === user.id && plan.date === today);
  const remainingPlan = ownPlan?.plannedVisits.filter((visit) => !visit.completed).length ?? 0;
  const metrics = user.role === "Sales Executive"
    ? [
        { id: "plan", label: "Plan Remaining", value: String(remainingPlan), unit: "visits" },
        { id: "activity", label: "Activities Today", value: String(todayActivities.length), unit: "updates" },
        { id: "overdue", label: "Overdue Follow-ups", value: String(overdue), unit: "items" },
        { id: "visits", label: "Verified Visits", value: String(ownPerformance?.verifiedVisits ?? 0), unit: "month" },
        { id: "target", label: "Target Progress", value: ownPerformance?.progress.overall ?? "0.00", unit: "%" },
        { id: "leads", label: "New Leads", value: String(ownPerformance?.newLeads ?? 0), unit: "month" },
        { id: "quotes", label: "Quotations", value: String(ownPerformance?.quotations ?? 0), unit: "month" },
        { id: "collection", label: "Collections", value: ownPerformance?.collectionsBdt ?? "0.00", unit: "BDT" }
      ]
    : [
        { id: "active", label: "Active Employees", value: String(statusCount(["LIVE", "RECENT"])), unit: "people" },
        { id: "visits", label: "Visits Today", value: String(fieldTeam.visitsToday), unit: "visits" },
        { id: "leads", label: "New Leads", value: String(leads.filter((lead) => inTimestampPeriod(lead.createdAt, today, today)).length), unit: "today" },
        { id: "followups", label: "Follow-ups Today", value: String(followUpToday), unit: "items" },
        { id: "overdue", label: "Overdue", value: String(overdue), unit: "items" },
        { id: "quotes", label: "Quotations", value: String(todayActivities.filter((activity) => activity.activityType === "QUOTATION_SUBMITTED").length), unit: "today" },
        { id: "orders", label: "Orders", value: String(todayActivities.filter((activity) => activity.activityType === "ORDER_RECEIVED").length), unit: "today" },
        { id: "collection", label: "Collection", value: money(collectionToday), unit: "BDT" }
      ];
  const data: MarketingDashboardData = {
    scope: marketingScope(user),
    businessDate: today,
    metrics,
    activities: activities.slice(0, 40),
    followUps,
    leads,
    funnel: [...marketingStages, "LOST" as const].map((stage) => ({ stage, count: leads.filter((lead) => lead.stage === stage).length })),
    fieldTeam,
    performance,
    dailyPlan: ownPlan,
    monthlyPlan: monthlyMarketingPlans.find((plan) => plan.userId === user.id && plan.month === today.slice(0, 7))
  };
  res.json(ok(data, user.role === "Sales Executive" ? "My marketing day loaded" : "Role-scoped marketing hub loaded", { role: user.role, scoped: data.scope !== "ALL" }));
});

app.get("/api/marketing/subjects", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const visibleLeads = visibleMarketingLeads(req);
  const leads = visibleLeads.map((lead) => ({ value: `lead:${lead.id}`, label: `${lead.leadNumber} - ${lead.organizationName}`, type: "Lead" as const }));
  const scopedCustomers = customerScoped(req).map((customer) => ({ value: `customer:${customer.id}`, label: customer.name, type: "Customer" as const }));
  res.json(ok([...leads, ...scopedCustomers], "Role-scoped marketing subjects loaded"));
});

app.get("/api/marketing/activities", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if ((from || to) && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)) return fail(res, 422, "Enter a valid activity date range.");
  const employeeId = String(req.query.employeeId ?? "all");
  if (employeeId !== "all" && !canAccessMarketingEmployee(user, employeeId)) return fail(res, 403, "The selected employee is outside your marketing scope.");
  const activityType = String(req.query.activityType ?? "");
  const rows = unifiedMarketingActivities(req, from || undefined, to || undefined).filter((activity) => (employeeId === "all" || activity.userId === employeeId) && (!activityType || activity.activityType === activityType));
  res.json(ok(rows, "Unified marketing activity loaded", { total: rows.length, role: user.role, scoped: marketingScope(user) !== "ALL" }));
});

app.post("/api/marketing/activities", (req, res) => {
  const user = requirePermission(req, res, "marketing", "create");
  if (!user) return;
  if (user.role !== "Sales Executive") return fail(res, 403, "Daily field activity must be submitted from the assigned Sales Executive account. Managers can create leads, follow-ups and targets.");
  const activityType = String(req.body?.activityType ?? "") as MarketingActivityType;
  if (!manualMarketingActivityTypes.includes(activityType)) return fail(res, 422, "Select a supported manual marketing activity. Transaction events are generated by the ERP.");
  const lead = req.body.leadId ? marketingLeads.find((entry) => entry.id === req.body.leadId) : undefined;
  const customer = req.body.customerId ? customers.find((entry) => entry.id === req.body.customerId) : undefined;
  if (!lead && !customer && !generalMarketingActivityTypes.includes(activityType)) return fail(res, 422, "Select a lead or customer for this activity.");
  if (lead && !canAccessMarketingEmployee(user, lead.assignedUserId)) return fail(res, 403, "This lead is outside your marketing scope.");
  if (customer && user.role === "Sales Executive" && customer.assignedSalesUserId !== user.id) return fail(res, 403, "This customer is outside your assigned records.");
  const occurredAt = String(req.body.occurredAt ?? new Date().toISOString());
  if (!Number.isFinite(new Date(occurredAt).getTime())) return fail(res, 422, "Enter a valid activity date and time.");
  const productIds: string[] = Array.isArray(req.body.productIds) ? Array.from(new Set<string>((req.body.productIds as unknown[]).map((value) => String(value)))) : [];
  if (productIds.some((productId) => !products.some((product) => product.id === productId && product.active))) return fail(res, 422, "One or more selected products are invalid.");
  const activity: MarketingActivity = {
    id: id("activity"),
    userId: user.id,
    employeeCode: user.employeeCode ?? user.id.toUpperCase(),
    employeeName: user.name,
    territory: user.territory,
    activityType,
    source: "MANUAL",
    occurredAt,
    submittedAt: new Date().toISOString(),
    leadId: lead?.id,
    customerId: customer?.id,
    subjectName: lead?.organizationName ?? customer?.name ?? String(req.body.subjectName ?? "General marketing"),
    productIds,
    purpose: String(req.body.purpose ?? "").trim() || undefined,
    remarks: String(req.body.remarks ?? "").trim() || undefined,
    nextFollowUpAt: String(req.body.nextFollowUpAt ?? "").trim() || undefined,
    latitude: Number.isFinite(Number(req.body.latitude)) ? Number(req.body.latitude) : undefined,
    longitude: Number.isFinite(Number(req.body.longitude)) ? Number(req.body.longitude) : undefined,
    accuracyMeters: Number.isFinite(Number(req.body.accuracyMeters)) ? Number(req.body.accuracyMeters) : undefined,
    verification: Number.isFinite(Number(req.body.latitude)) && Number.isFinite(Number(req.body.longitude)) ? "GPS_VERIFIED" : "MANUAL",
    attachments: [],
    createdByUserId: user.id
  };
  if (req.body.attachmentUpload) {
    try {
      activity.attachments = [uploadedDocument(req, req.body.attachmentUpload as DocumentUpload, "marketing-activity", activity.id, "Marketing Evidence", false)];
    } catch (error) {
      return fail(res, 422, error instanceof Error ? error.message : "Marketing evidence is invalid.");
    }
  }
  marketingActivities.unshift(activity);
  if (lead) {
    const nextStage: Partial<Record<MarketingActivityType, MarketingLeadStage>> = {
      CUSTOMER_CONTACT: "CONTACTED",
      CUSTOMER_VISIT: "CONTACTED",
      DOCTOR_MEETING: "CONTACTED",
      PROCUREMENT_MEETING: "CONTACTED",
      DEALER_VISIT: "CONTACTED",
      PRODUCT_PRESENTATION: "PRESENTATION",
      PRODUCT_DEMONSTRATION: "PRESENTATION",
      SAMPLE_DELIVERED: "SAMPLE",
      NEGOTIATION_UPDATE: "NEGOTIATION",
      TENDER_FOLLOW_UP: "NEGOTIATION"
    };
    if (nextStage[activityType]) advanceLead(lead.id, nextStage[activityType]!, occurredAt);
  }
  if (activity.nextFollowUpAt) {
    marketingFollowUps.unshift({ id: id("follow"), assignedUserId: user.id, leadId: lead?.id, customerId: customer?.id, subjectName: activity.subjectName ?? "Marketing follow-up", dueAt: activity.nextFollowUpAt, purpose: activity.purpose ?? "Marketing follow-up", status: "PENDING", createdAt: activity.submittedAt });
  }
  audit(req, "Marketing activity reported", "MarketingActivity", activity.id, `${user.name}: ${activityType.replaceAll("_", " ")} for ${activity.subjectName}.`);
  res.status(201).json(ok(activity, "Marketing activity reported"));
});

app.get("/api/marketing/leads", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  res.json(ok(visibleMarketingLeads(req), "Role-scoped leads loaded", { role: user.role, scoped: marketingScope(user) !== "ALL" }));
});

app.post("/api/marketing/leads", (req, res) => {
  const user = requirePermission(req, res, "marketing", "create");
  if (!user) return;
  const assignedUserId = user.role === "Sales Executive" ? user.id : String(req.body.assignedUserId ?? "");
  if (!canAccessMarketingEmployee(user, assignedUserId)) return fail(res, 403, "Select an employee inside your marketing scope.");
  const organizationName = String(req.body.organizationName ?? "").trim();
  const mobile = String(req.body.mobile ?? "").trim();
  if (organizationName.length < 2 || mobile.length < 7) return fail(res, 422, "Organization and valid mobile number are required.");
  const organizationTypes: MarketingLead["organizationType"][] = ["Hospital", "Clinic", "Dealer", "Pharmacy", "Other"];
  if (!organizationTypes.includes(req.body.organizationType)) return fail(res, 422, "Select a valid organization type.");
  const now = new Date().toISOString();
  const lead: MarketingLead = {
    id: id("lead"),
    leadNumber: nextReference("LEAD", marketingLeads.length),
    organizationName,
    organizationType: req.body.organizationType,
    contactPerson: String(req.body.contactPerson ?? "").trim() || undefined,
    contactRole: req.body.contactRole || undefined,
    mobile,
    email: String(req.body.email ?? "").trim() || undefined,
    address: String(req.body.address ?? "").trim() || undefined,
    latitude: Number.isFinite(Number(req.body.latitude)) ? Number(req.body.latitude) : undefined,
    longitude: Number.isFinite(Number(req.body.longitude)) ? Number(req.body.longitude) : undefined,
    interestedProductIds: Array.isArray(req.body.interestedProductIds) ? Array.from(new Set<string>((req.body.interestedProductIds as unknown[]).map((value) => String(value)))) : [],
    leadSource: String(req.body.leadSource ?? "Field Prospecting").trim(),
    assignedUserId,
    stage: "NEW",
    nextFollowUpAt: String(req.body.nextFollowUpAt ?? "").trim() || undefined,
    notes: String(req.body.notes ?? "").trim() || undefined,
    createdAt: now,
    updatedAt: now
  };
  marketingLeads.unshift(lead);
  const employee = demoUsers.find((entry) => entry.id === assignedUserId)!;
  marketingActivities.unshift({ id: id("activity"), userId: assignedUserId, employeeCode: employee.employeeCode ?? employee.id.toUpperCase(), employeeName: employee.name, territory: employee.territory, activityType: "LEAD_CREATED", source: "LEAD", occurredAt: now, submittedAt: now, leadId: lead.id, subjectName: lead.organizationName, productIds: lead.interestedProductIds, purpose: "New lead", referenceType: "Lead", referenceId: lead.id, referenceNumber: lead.leadNumber, verification: "SYSTEM_VERIFIED", createdByUserId: user.id });
  if (lead.nextFollowUpAt) marketingFollowUps.unshift({ id: id("follow"), assignedUserId, leadId: lead.id, subjectName: lead.organizationName, dueAt: lead.nextFollowUpAt, purpose: "Initial lead follow-up", status: "PENDING", createdAt: now });
  audit(req, "Lead created", "MarketingLead", lead.id, `${lead.leadNumber}: ${lead.organizationName} assigned to ${employee.name}.`);
  res.status(201).json(ok(lead, "Marketing lead created"));
});

app.patch("/api/marketing/leads/:leadId", (req, res) => {
  const user = requirePermission(req, res, "marketing", "edit");
  if (!user) return;
  const lead = marketingLeads.find((entry) => entry.id === req.params.leadId);
  if (!lead) return fail(res, 404, "Marketing lead not found.");
  if (!canAccessMarketingEmployee(user, lead.assignedUserId)) return fail(res, 403, "This lead is outside your marketing scope.");
  if (req.body.assignedUserId && req.body.assignedUserId !== lead.assignedUserId) {
    if (user.role === "Sales Executive" || !canAccessMarketingEmployee(user, String(req.body.assignedUserId))) return fail(res, 403, "You cannot reassign this lead to that employee.");
    lead.assignedUserId = String(req.body.assignedUserId);
  }
  const editable = ["organizationName", "organizationType", "contactPerson", "contactRole", "mobile", "email", "address", "latitude", "longitude", "interestedProductIds", "leadSource", "nextFollowUpAt", "notes"] as const;
  for (const key of editable) if (req.body[key] !== undefined) (lead as Record<string, unknown>)[key] = req.body[key];
  if (req.body.stage === "LOST") {
    const reason = String(req.body.lostReason ?? "").trim();
    if (reason.length < 5) return fail(res, 422, "Enter a clear reason before marking a lead lost.");
    lead.stage = "LOST";
    lead.lostReason = reason;
  } else if (req.body.stage && req.body.stage !== lead.stage) {
    return fail(res, 422, "Funnel stages progress from recorded activity and ERP transactions. Only Lost may be selected manually.");
  }
  lead.updatedAt = new Date().toISOString();
  audit(req, "Lead updated", "MarketingLead", lead.id, `${lead.leadNumber}: ${lead.organizationName} updated.`);
  res.json(ok(lead, "Marketing lead updated"));
});

app.post("/api/marketing/leads/:leadId/convert", (req, res) => {
  const user = requirePermission(req, res, "marketing", "create");
  if (!user) return;
  if (!hasEffectivePermission(user, "customers", "create")) return fail(res, 403, "Customer creation access is required to convert a lead.");
  const lead = marketingLeads.find((entry) => entry.id === req.params.leadId);
  if (!lead) return fail(res, 404, "Marketing lead not found.");
  if (!canAccessMarketingEmployee(user, lead.assignedUserId)) return fail(res, 403, "This lead is outside your marketing scope.");
  if (lead.customerId) return res.json(ok(customers.find((customer) => customer.id === lead.customerId)!, "Lead is already linked to a customer"));
  const customer: Customer = {
    id: id("customer"), name: lead.organizationName, type: lead.organizationType, contactPerson: lead.contactPerson ?? lead.contactRole ?? "Procurement", phone: lead.mobile, email: lead.email, address: lead.address ?? "Address pending", latitude: lead.latitude, longitude: lead.longitude, territory: demoUsers.find((entry) => entry.id === lead.assignedUserId)?.territory ?? "Unassigned", assignedSalesUserId: lead.assignedUserId, paymentTerms: String(req.body.paymentTerms ?? "30 days"), creditLimit: money(req.body.creditLimit ?? "0"), currentDue: "0.00", totalSales: "0.00", totalCollected: "0.00", active: true
  };
  customers.unshift(customer);
  lead.customerId = customer.id;
  lead.updatedAt = new Date().toISOString();
  const employee = demoUsers.find((entry) => entry.id === lead.assignedUserId)!;
  marketingActivities.unshift({ id: id("activity"), userId: lead.assignedUserId, employeeCode: employee.employeeCode ?? employee.id.toUpperCase(), employeeName: employee.name, territory: employee.territory, activityType: "LEAD_CONVERTED", source: "LEAD", occurredAt: lead.updatedAt, submittedAt: lead.updatedAt, leadId: lead.id, customerId: customer.id, subjectName: customer.name, productIds: lead.interestedProductIds, purpose: "Lead converted to customer", referenceType: "Customer", referenceId: customer.id, referenceNumber: customer.id, verification: "SYSTEM_VERIFIED", createdByUserId: user.id });
  audit(req, "Lead converted", "Customer", customer.id, `${lead.leadNumber} converted to ${customer.name}.`);
  res.status(201).json(ok(customer, "Lead converted to customer"));
});

app.get("/api/marketing/follow-ups", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const status = String(req.query.status ?? "");
  const rows = visibleMarketingFollowUps(req).filter((followUp) => !status || followUp.status === status);
  res.json(ok(rows, "Role-scoped follow-ups loaded", { total: rows.length, role: user.role, scoped: marketingScope(user) !== "ALL" }));
});

app.post("/api/marketing/follow-ups", (req, res) => {
  const user = requirePermission(req, res, "marketing", "create");
  if (!user) return;
  const assignedUserId = user.role === "Sales Executive" ? user.id : String(req.body.assignedUserId ?? "");
  if (!canAccessMarketingEmployee(user, assignedUserId)) return fail(res, 403, "Select an employee inside your marketing scope.");
  const lead = req.body.leadId ? marketingLeads.find((entry) => entry.id === req.body.leadId) : undefined;
  const customer = req.body.customerId ? customers.find((entry) => entry.id === req.body.customerId) : undefined;
  if (!lead && !customer) return fail(res, 422, "Select a lead or customer for this follow-up.");
  const dueAt = String(req.body.dueAt ?? "");
  if (!Number.isFinite(new Date(dueAt).getTime())) return fail(res, 422, "Enter a valid follow-up date and time.");
  const followUp: MarketingFollowUp = { id: id("follow"), assignedUserId, leadId: lead?.id, customerId: customer?.id, subjectName: lead?.organizationName ?? customer!.name, dueAt, purpose: String(req.body.purpose ?? "").trim(), status: "PENDING", createdAt: new Date().toISOString() };
  if (followUp.purpose.length < 3) return fail(res, 422, "Enter a follow-up purpose.");
  marketingFollowUps.unshift(followUp);
  audit(req, "Follow-up scheduled", "MarketingFollowUp", followUp.id, `${followUp.subjectName}: ${followUp.purpose}.`);
  res.status(201).json(ok(followUpForResponse(followUp), "Marketing follow-up scheduled"));
});

app.patch("/api/marketing/follow-ups/:followUpId", (req, res) => {
  const user = requirePermission(req, res, "marketing", "edit");
  if (!user) return;
  const followUp = marketingFollowUps.find((entry) => entry.id === req.params.followUpId);
  if (!followUp) return fail(res, 404, "Follow-up not found.");
  if (!canAccessMarketingEmployee(user, followUp.assignedUserId)) return fail(res, 403, "This follow-up is outside your marketing scope.");
  if (req.body.status === "COMPLETED") {
    followUp.status = "COMPLETED";
    followUp.completedAt = new Date().toISOString();
    followUp.outcome = String(req.body.outcome ?? "Completed").trim();
    followUp.nextFollowUpAt = String(req.body.nextFollowUpAt ?? "").trim() || undefined;
    if (followUp.nextFollowUpAt) marketingFollowUps.unshift({ id: id("follow"), assignedUserId: followUp.assignedUserId, leadId: followUp.leadId, customerId: followUp.customerId, subjectName: followUp.subjectName, dueAt: followUp.nextFollowUpAt, purpose: followUp.outcome || followUp.purpose, status: "PENDING", createdAt: followUp.completedAt });
  } else if (req.body.status === "CANCELLED") {
    followUp.status = "CANCELLED";
  } else {
    if (req.body.dueAt) {
      const dueAt = String(req.body.dueAt);
      if (!Number.isFinite(new Date(dueAt).getTime())) return fail(res, 422, "Enter a valid follow-up date and time.");
      followUp.dueAt = dueAt;
      followUp.status = "PENDING";
    }
    if (req.body.purpose) followUp.purpose = String(req.body.purpose);
  }
  audit(req, "Follow-up updated", "MarketingFollowUp", followUp.id, `${followUp.subjectName}: ${followUp.status}.`);
  res.json(ok(followUpForResponse(followUp), "Marketing follow-up updated"));
});

app.get("/api/marketing/plans/daily", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const employeeId = String(req.query.employeeId ?? (user.role === "Sales Executive" ? user.id : "all"));
  if (employeeId !== "all" && !canAccessMarketingEmployee(user, employeeId)) return fail(res, 403, "The selected employee is outside your scope.");
  const date = String(req.query.date ?? businessDate());
  const rows = dailyMarketingPlans.filter((plan) => (employeeId === "all" || plan.userId === employeeId) && plan.date === date);
  res.json(ok(rows, "Daily marketing plans loaded"));
});

app.post("/api/marketing/plans/daily", (req, res) => {
  const user = requirePermission(req, res, "marketing", "create");
  if (!user) return;
  const userId = user.role === "Sales Executive" ? user.id : String(req.body.userId ?? "");
  if (!canAccessMarketingEmployee(user, userId)) return fail(res, 403, "Select an employee inside your marketing scope.");
  const date = String(req.body.date ?? businessDate());
  const existing = dailyMarketingPlans.find((plan) => plan.userId === userId && plan.date === date);
  const rawVisits: Record<string, unknown>[] = Array.isArray(req.body.plannedVisits) ? req.body.plannedVisits : [];
  if (!rawVisits.length) return fail(res, 422, "Add at least one planned visit.");
  const permittedLeadIds = new Set(visibleMarketingLeads(req).map((lead) => lead.id));
  const permittedCustomerIds = new Set(customerScoped(req).map((customer) => customer.id));
  for (const visit of rawVisits) {
    const leadId = visit.leadId ? String(visit.leadId) : undefined;
    const customerId = visit.customerId ? String(visit.customerId) : undefined;
    if (leadId && customerId) return fail(res, 422, "A planned visit must reference either a lead or a customer, not both.");
    if (leadId && !permittedLeadIds.has(leadId)) return fail(res, 403, "A planned lead is outside your marketing scope.");
    if (customerId && !permittedCustomerIds.has(customerId)) return fail(res, 403, "A planned customer is outside your marketing scope.");
    if (!leadId && !customerId && String(visit.subjectName ?? "").trim().length < 2) return fail(res, 422, "Select a customer or lead for every planned visit.");
  }
  const plannedVisits: DailyMarketingPlan["plannedVisits"] = rawVisits.map((visit) => {
    const visitId = String(visit.id || id("plan-item"));
    const previous = existing?.plannedVisits.find((entry) => entry.id === visitId);
    if (previous?.completed) return previous;
    const customerId = visit.customerId ? String(visit.customerId) : undefined;
    const leadId = visit.leadId ? String(visit.leadId) : undefined;
    const customer = customerId ? customers.find((entry) => entry.id === customerId) : undefined;
    const lead = leadId ? marketingLeads.find((entry) => entry.id === leadId) : undefined;
    return { id: visitId, customerId, leadId, subjectName: lead?.organizationName ?? customer?.name ?? String(visit.subjectName).trim(), plannedTime: visit.plannedTime ? String(visit.plannedTime) : undefined, purpose: String(visit.purpose ?? "Customer visit").trim() || "Customer visit", completed: false };
  });
  for (const previous of existing?.plannedVisits ?? []) if (previous.completed && !plannedVisits.some((visit) => visit.id === previous.id)) plannedVisits.push(previous);
  const plan: DailyMarketingPlan = { id: existing?.id ?? id("daily-plan"), userId, date, plannedVisits, notes: String(req.body.notes ?? "").trim() || undefined, status: plannedVisits.every((visit) => visit.completed) ? "COMPLETED" : "SUBMITTED" };
  if (existing) Object.assign(existing, plan); else dailyMarketingPlans.unshift(plan);
  audit(req, existing ? "Daily plan updated" : "Daily plan submitted", "DailyMarketingPlan", plan.id, `${date}: ${plannedVisits.length} planned visits.`);
  res.status(existing ? 200 : 201).json(ok(plan, existing ? "Daily marketing plan updated" : "Daily marketing plan submitted"));
});

app.get("/api/marketing/plans/monthly", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const month = String(req.query.month ?? businessDate().slice(0, 7));
  const ids = marketingEmployeeIds(user);
  res.json(ok(monthlyMarketingPlans.filter((plan) => ids.has(plan.userId) && plan.month === month), "Monthly marketing plans loaded"));
});

app.post("/api/marketing/plans/monthly", (req, res) => {
  const user = requirePermission(req, res, "marketing", "create");
  if (!user) return;
  const userId = user.role === "Sales Executive" ? user.id : String(req.body.userId ?? "");
  if (!canAccessMarketingEmployee(user, userId)) return fail(res, 403, "Select an employee inside your marketing scope.");
  const month = String(req.body.month ?? businessDate().slice(0, 7));
  const employee = demoUsers.find((entry) => entry.id === userId)!;
  const existing = monthlyMarketingPlans.find((plan) => plan.userId === userId && plan.month === month);
  const plan: MonthlyMarketingPlan = { id: existing?.id ?? id("monthly-plan"), userId, month, territory: String(req.body.territory ?? employee.territory ?? "Unassigned"), prioritySubjects: Array.isArray(req.body.prioritySubjects) ? req.body.prioritySubjects.map(String) : [], productIds: Array.isArray(req.body.productIds) ? req.body.productIds.map(String) : [], plannedActivities: Math.max(0, Number(req.body.plannedActivities ?? 0)), notes: String(req.body.notes ?? "").trim() || undefined, status: marketingManagementRoles.includes(user.role) && req.body.status === "APPROVED" ? "APPROVED" : "SUBMITTED" };
  if (existing) Object.assign(existing, plan); else monthlyMarketingPlans.unshift(plan);
  res.status(existing ? 200 : 201).json(ok(plan, existing ? "Monthly plan updated" : "Monthly plan submitted"));
});

app.get("/api/marketing/targets", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  const month = String(req.query.month ?? businessDate().slice(0, 7));
  const ids = marketingEmployeeIds(user);
  res.json(ok(marketingTargets.filter((target) => ids.has(target.userId) && target.month === month), "Marketing targets loaded"));
});

app.post("/api/marketing/targets", (req, res) => {
  const user = requirePermission(req, res, "marketing", "approve");
  if (!user) return;
  const userId = String(req.body.userId ?? "");
  if (!canAccessMarketingEmployee(user, userId)) return fail(res, 403, "Select an employee inside your marketing scope.");
  const month = String(req.body.month ?? businessDate().slice(0, 7));
  const values = { salesTargetBdt: money(requiredDecimal(req.body.salesTargetBdt ?? "0", "Sales target", { allowZero: true })), newCustomerTarget: Math.max(0, Number(req.body.newCustomerTarget ?? 0)), visitTarget: Math.max(0, Number(req.body.visitTarget ?? 0)), collectionTargetBdt: money(requiredDecimal(req.body.collectionTargetBdt ?? "0", "Collection target", { allowZero: true })) };
  const existing = marketingTargets.find((target) => target.userId === userId && target.month === month);
  const target: EmployeeMarketingTarget = { id: existing?.id ?? id("target"), userId, month, ...values, createdByUserId: user.id, createdAt: existing?.createdAt ?? new Date().toISOString() };
  if (existing) Object.assign(existing, target); else marketingTargets.unshift(target);
  audit(req, existing ? "Marketing target updated" : "Marketing target assigned", "EmployeeMarketingTarget", target.id, `${userId}: ${month} target saved.`);
  res.status(existing ? 200 : 201).json(ok(target, existing ? "Marketing target updated" : "Marketing target assigned"));
});

app.patch("/api/marketing/targets/:targetId", (req, res) => {
  const user = requirePermission(req, res, "marketing", "approve");
  if (!user) return;
  const target = marketingTargets.find((entry) => entry.id === req.params.targetId);
  if (!target) return fail(res, 404, "Marketing target not found.");
  if (!canAccessMarketingEmployee(user, target.userId)) return fail(res, 403, "This target is outside your scope.");
  for (const key of ["salesTargetBdt", "collectionTargetBdt"] as const) if (req.body[key] !== undefined) target[key] = money(requiredDecimal(req.body[key], key, { allowZero: true }));
  for (const key of ["newCustomerTarget", "visitTarget"] as const) if (req.body[key] !== undefined) target[key] = Math.max(0, Number(req.body[key]));
  audit(req, "Marketing target updated", "EmployeeMarketingTarget", target.id, `${target.userId}: ${target.month} target updated.`);
  res.json(ok(target, "Marketing target updated"));
});

app.get("/api/marketing/performance", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  let period;
  try { period = reportPeriod(req); } catch (error) { return fail(res, 422, error instanceof Error ? error.message : "Report period is invalid."); }
  const employeeId = String(req.query.employeeId ?? "all");
  if (employeeId !== "all" && !canAccessMarketingEmployee(user, employeeId)) return fail(res, 403, "The selected employee is outside your scope.");
  const rows = performanceRowsFor(req, period.from, period.to).filter((row) => employeeId === "all" || row.employee.id === employeeId);
  res.json(ok(rows, "Marketing performance loaded", { total: rows.length, role: user.role, scoped: marketingScope(user) !== "ALL" }));
});

app.get("/api/marketing/employees/:employeeId/snapshot", (req, res) => {
  const user = requirePermission(req, res, "marketing", "view");
  if (!user) return;
  if (!canAccessMarketingEmployee(user, req.params.employeeId)) return fail(res, 403, "The selected employee is outside your marketing scope.");
  const employeeUser = demoUsers.find((entry) => entry.id === req.params.employeeId);
  if (!employeeUser) return fail(res, 404, "Employee not found.");
  let period;
  try { period = reportPeriod(req); } catch (error) { return fail(res, 422, error instanceof Error ? error.message : "Activity period is invalid."); }
  const today = businessDate();
  const employee = directoryEntry(employeeUser);
  const requestLike = { headers: { "x-user-id": user.id } } as unknown as Request;
  const snapshot: EmployeeMarketingSnapshot = {
    period,
    employee,
    performance: marketingPerformance(employee, period.from, period.to),
    recentActivities: unifiedMarketingActivities(requestLike, period.from, period.to).filter((activity) => activity.userId === employee.id),
    followUps: marketingFollowUps.filter((followUp) => followUp.assignedUserId === employee.id && inTimestampPeriod(followUp.dueAt, period.from, period.to)).map(followUpForResponse),
    leads: marketingLeads.filter((lead) => lead.assignedUserId === employee.id && inTimestampPeriod(lead.createdAt, period.from, period.to)),
    dailyPlan: period.from <= today && period.to >= today ? dailyMarketingPlans.find((plan) => plan.userId === employee.id && plan.date === today) : undefined,
    dailyPlans: dailyMarketingPlans.filter((plan) => plan.userId === employee.id && plan.date >= period.from && plan.date <= period.to),
    monthlyPlans: monthlyMarketingPlans.filter((plan) => plan.userId === employee.id && `${plan.month}-01` <= period.to && plan.month >= period.from.slice(0, 7))
  };
  res.json(ok(snapshot, `${employee.name} marketing snapshot loaded`));
});

app.get("/api/marketing/score-rules", (req, res) => {
  if (!requirePermission(req, res, "marketing", "view")) return;
  res.json(ok(marketingScoreRules, "Marketing score rules loaded"));
});

app.patch("/api/marketing/score-rules/:ruleId", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  if (user.role !== "Super Admin") return fail(res, 403, "Only Super Admin can change official marketing score weights.");
  const rule = marketingScoreRules.find((entry) => entry.id === req.params.ruleId);
  if (!rule) return fail(res, 404, "Marketing score rule not found.");
  if (req.body.points !== undefined) {
    const points = Number(req.body.points);
    if (!Number.isInteger(points) || points < 0 || points > 100) return fail(res, 422, "Score points must be a whole number from 0 to 100.");
    rule.points = points;
  }
  if (req.body.active !== undefined) rule.active = Boolean(req.body.active);
  audit(req, "Marketing score rule updated", "MarketingScoreRule", rule.id, `${rule.label}: ${rule.points} points.`);
  res.json(ok(rule, "Marketing score rule updated"));
});

app.get("/api/reports/marketing", (req, res) => {
  const user = requirePermission(req, res, "reports", "view");
  if (!user) return;
  if (!hasEffectivePermission(user, "marketing", "view")) return fail(res, 403, "Marketing report access is required.");
  let period;
  try { period = reportPeriod(req); } catch (error) { return fail(res, 422, error instanceof Error ? error.message : "Report period is invalid."); }
  const employeeId = String(req.query.employeeId ?? "all");
  const territory = String(req.query.territory ?? "");
  const activityType = String(req.query.activityType ?? "");
  const subjectId = String(req.query.subjectId ?? "");
  const verification = String(req.query.verification ?? "");
  const status = String(req.query.status ?? "");
  const groupBy = String(req.query.groupBy ?? "Date");
  const mode = req.query.mode === "Detail" ? "Detail" as const : "Summary" as const;
  if (employeeId !== "all" && !canAccessMarketingEmployee(user, employeeId)) return fail(res, 403, "The selected employee is outside your report scope.");
  const subjectLeadId = subjectId.startsWith("lead:") ? subjectId.slice(5) : "";
  const subjectCustomerId = subjectId.startsWith("customer:") ? subjectId.slice(9) : "";
  if (subjectId && !subjectLeadId && !subjectCustomerId) return fail(res, 422, "Select a valid customer or lead report subject.");
  if (subjectLeadId && !visibleMarketingLeads(req).some((lead) => lead.id === subjectLeadId)) return fail(res, 403, "The selected lead is outside your report scope.");
  if (subjectCustomerId && !customerScoped(req).some((customer) => customer.id === subjectCustomerId)) return fail(res, 403, "The selected customer is outside your report scope.");
  const matchesSubject = (leadId?: string, customerId?: string) => !subjectId || (subjectLeadId ? leadId === subjectLeadId : customerId === subjectCustomerId);
  const matchesEmployeeScope = (userId: string) => (employeeId === "all" || userId === employeeId) && (!territory || demoUsers.find((entry) => entry.id === userId)?.territory === territory);
  const activities = unifiedMarketingActivities(req, period.from, period.to).filter((activity) => (employeeId === "all" || activity.userId === employeeId) && (!territory || activity.territory === territory) && (!activityType || activity.activityType === activityType) && matchesSubject(activity.leadId, activity.customerId) && (!verification || activity.verification === verification));
  const leads = visibleMarketingLeads(req).filter((lead) => matchesEmployeeScope(lead.assignedUserId) && inTimestampPeriod(lead.createdAt, period.from, period.to) && matchesSubject(lead.id, lead.customerId) && (!status || lead.stage === status));
  const followUps = visibleMarketingFollowUps(req).filter((followUp) => matchesEmployeeScope(followUp.assignedUserId) && inTimestampPeriod(followUp.dueAt, period.from, period.to) && matchesSubject(followUp.leadId, followUp.customerId) && (!status || followUp.status === status));
  const visits = fieldVisits.filter((visit) => marketingEmployeeIds(user).has(visit.userId) && matchesEmployeeScope(visit.userId) && inTimestampPeriod(visit.plannedAt, period.from, period.to) && matchesSubject(visit.leadId, visit.customerId) && (!verification || visit.verification === verification) && (!status || visit.status.toUpperCase().replace(" ", "_") === status));
  const performance = performanceRowsFor(req, period.from, period.to).filter((row) => (employeeId === "all" || row.employee.id === employeeId) && (!territory || row.employee.territory === territory));
  const conciseList = (values: Array<string | undefined>, limit = 3) => {
    const unique = [...new Set(values.filter((value): value is string => Boolean(value && value !== "-")))].sort();
    return unique.length > limit ? `${unique.slice(0, limit).join(", ")} +${unique.length - limit}` : unique.join(", ") || "-";
  };
  const readableActivity = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const groupKey = (activity: MarketingActivity) => groupBy === "Employee" ? activity.employeeName : groupBy === "Territory" ? activity.territory ?? "Unassigned" : groupBy === "Customer" ? activity.subjectName ?? "Unassigned" : groupBy === "Activity Type" ? readableActivity(activity.activityType) : businessDate(new Date(activity.occurredAt));
  const activityGroups = new Map<string, MarketingActivity[]>();
  for (const activity of activities) activityGroups.set(groupKey(activity), [...(activityGroups.get(groupKey(activity)) ?? []), activity]);
  const fieldWorkTypes = new Set(["CHECK_IN", "CHECK_OUT", "CUSTOMER_VISIT", "DOCTOR_MEETING", "PROCUREMENT_MEETING", "DEALER_VISIT", "PRODUCT_PRESENTATION", "PRODUCT_DEMONSTRATION", "SAMPLE_DELIVERED", "COLLECTION_VISIT", "TRAINING_SESSION", "SERVICE_FOLLOW_UP", "MARKET_SURVEY"]);
  const followUpTypes = new Set(["FOLLOW_UP_COMPLETED", "TENDER_FOLLOW_UP", "SERVICE_FOLLOW_UP"]);
  const groupedActivityRows = [...activityGroups].sort(([left], [right]) => groupBy === "Date" ? right.localeCompare(left) : left.localeCompare(right)).map(([group, rows]) => {
    const categoryCounts = new Map<string, number>();
    for (const activity of rows) categoryCounts.set(readableActivity(activity.activityType), (categoryCounts.get(readableActivity(activity.activityType)) ?? 0) + 1);
    const activityMix = [...categoryCounts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 3).map(([label, count]) => `${label} ${count}`).join("; ");
    const collection = rows.filter((activity) => activity.activityType === "PAYMENT_COLLECTED").reduce((sum, activity) => sum.plus(activity.amountBdt ?? 0), new Decimal(0));
    return {
      group,
      employees: conciseList(rows.map((activity) => activity.employeeName)),
      subjects: conciseList(rows.map((activity) => activity.subjectName)),
      mix: activityMix || "-",
      fieldWork: String(rows.filter((activity) => fieldWorkTypes.has(activity.activityType)).length),
      followUps: String(rows.filter((activity) => followUpTypes.has(activity.activityType)).length),
      business: `Quotations ${rows.filter((activity) => activity.activityType === "QUOTATION_SUBMITTED").length} | Orders ${rows.filter((activity) => activity.activityType === "ORDER_RECEIVED").length}`,
      collections: money(collection),
      verified: String(rows.filter((activity) => ["GPS_VERIFIED", "SYSTEM_VERIFIED"].includes(activity.verification)).length),
      count: String(rows.length)
    };
  });
  const leadStageGroups = new Map<string, typeof leads>();
  for (const lead of leads) leadStageGroups.set(lead.stage, [...(leadStageGroups.get(lead.stage) ?? []), lead]);
  const groupedLeadRows = [...leadStageGroups].sort(([left], [right]) => left.localeCompare(right)).map(([group, rows]) => ({
    group,
    employees: conciseList(rows.map((lead) => demoUsers.find((entry) => entry.id === lead.assignedUserId)?.name ?? lead.assignedUserId)),
    subjects: conciseList(rows.map((lead) => lead.organizationName)),
    next: rows.map((lead) => lead.nextFollowUpAt).filter((value): value is string => Boolean(value)).sort()[0] ?? "Not scheduled",
    count: String(rows.length)
  }));
  const groupedTable = groupBy === "Lead Stage"
    ? { id: "marketing-grouped", title: "Lead Pipeline by Stage", columns: [{ key: "group", label: "Lead Stage" }, { key: "employees", label: "Assigned Employees" }, { key: "subjects", label: "Organizations" }, { key: "next", label: "Earliest Next Follow-up" }, { key: "count", label: "Leads", align: "right" as const }], rows: groupedLeadRows }
    : { id: "marketing-grouped", title: `Activity by ${groupBy}`, columns: [{ key: "group", label: groupBy }, { key: "employees", label: "Employees" }, { key: "subjects", label: "Customers / Leads" }, { key: "mix", label: "Activity Mix" }, { key: "fieldWork", label: "Field Work", align: "right" as const }, { key: "followUps", label: "Follow-ups", align: "right" as const }, { key: "business", label: "Quotes / Orders" }, { key: "collections", label: "Collections", align: "right" as const }, { key: "verified", label: "Verified", align: "right" as const }, { key: "count", label: "Total", align: "right" as const }], rows: groupedActivityRows };
  const data: MarketingReportData = {
    period,
    filters: { employeeId, territory, activityType, subjectId, verification, status, groupBy, mode },
    summary: [{ label: "Activities", value: String(activities.length) }, { label: "New Leads", value: String(leads.length) }, { label: "Follow-ups", value: String(followUps.length) }, { label: "Verified Visits", value: String(visits.filter((visit) => visit.status === "Completed" && ["GPS_VERIFIED", "SYSTEM_VERIFIED"].includes(visit.verification ?? "UNVERIFIED")).length) }, { label: "Activity Score", value: String(performance.reduce((sum, row) => sum + row.activityScore, 0)) }],
    tables: [
      { id: "marketing-activity", title: "Daily Marketing Activity", columns: [{ key: "date", label: "Date / Time" }, { key: "employee", label: "Employee" }, { key: "territory", label: "Territory" }, { key: "activity", label: "Activity" }, { key: "subject", label: "Customer / Lead" }, { key: "outcome", label: "Purpose / Outcome" }, { key: "verification", label: "Verification" }, { key: "reference", label: "ERP Reference" }, { key: "amount", label: "Linked Value", align: "right" as const }, { key: "next", label: "Next Follow-up" }], rows: activities.map((activity) => ({ date: activity.occurredAt, employee: activity.employeeName, territory: activity.territory ?? "-", activity: readableActivity(activity.activityType), subject: activity.subjectName ?? "-", outcome: [activity.purpose, activity.remarks].filter(Boolean).join(" | ") || "No outcome recorded", verification: activity.verification.replaceAll("_", " "), reference: activity.referenceNumber ?? "Manual", amount: activity.amountBdt ?? "-", next: activity.nextFollowUpAt ?? "-" })) },
      groupedTable,
      { id: "lead-funnel", title: "Lead Funnel", columns: [{ key: "lead", label: "Lead" }, { key: "organization", label: "Organization" }, { key: "employee", label: "Assigned Employee" }, { key: "stage", label: "Stage" }, { key: "next", label: "Next Follow-up" }], rows: leads.map((lead) => ({ lead: lead.leadNumber, organization: lead.organizationName, employee: demoUsers.find((entry) => entry.id === lead.assignedUserId)?.name ?? lead.assignedUserId, stage: lead.stage, next: lead.nextFollowUpAt ?? "-" })) },
      { id: "follow-up-status", title: "Follow-up Status", columns: [{ key: "due", label: "Due" }, { key: "employee", label: "Employee" }, { key: "subject", label: "Customer / Lead" }, { key: "purpose", label: "Purpose" }, { key: "status", label: "Status" }], rows: followUps.map((followUp) => ({ due: followUp.dueAt, employee: demoUsers.find((entry) => entry.id === followUp.assignedUserId)?.name ?? followUp.assignedUserId, subject: followUp.subjectName, purpose: followUp.purpose, status: followUp.status })) },
      { id: "target-actual", title: "Target vs Actual", columns: [{ key: "employee", label: "Employee" }, { key: "sales", label: "Delivered Sales" }, { key: "collection", label: "Collections" }, { key: "visits", label: "Verified Visits" }, { key: "customers", label: "New Customers" }, { key: "progress", label: "Overall", align: "right" as const }], rows: performance.map((row) => ({ employee: row.employee.name, sales: `${row.deliveredSalesBdt} / ${row.targets.salesTargetBdt}`, collection: `${row.collectionsBdt} / ${row.targets.collectionTargetBdt}`, visits: `${row.verifiedVisits} / ${row.targets.visitTarget}`, customers: `${row.convertedCustomers} / ${row.targets.newCustomerTarget}`, progress: `${row.progress.overall}%` })) },
      { id: "activity-score", title: "Activity Score", columns: [{ key: "employee", label: "Employee" }, { key: "verified", label: "Verified Visits", align: "right" as const }, { key: "leads", label: "Qualified Leads", align: "right" as const }, { key: "quotes", label: "Quotes", align: "right" as const }, { key: "orders", label: "Orders", align: "right" as const }, { key: "followups", label: "Follow-ups", align: "right" as const }, { key: "score", label: "Score", align: "right" as const }], rows: performance.map((row) => ({ employee: row.employee.name, verified: String(row.verifiedVisits), leads: String(row.qualifiedLeads), quotes: String(row.quotations), orders: String(row.orders), followups: String(row.followUpsCompleted), score: String(row.activityScore) })) },
      { id: "visit-verification", title: "Visit Verification", columns: [{ key: "date", label: "Planned" }, { key: "employee", label: "Employee" }, { key: "customer", label: "Customer / Lead" }, { key: "status", label: "Visit Status" }, { key: "verification", label: "Verification" }, { key: "distance", label: "Distance" }, { key: "submitted", label: "Submitted" }], rows: visits.map((visit) => ({ date: visit.plannedAt, employee: demoUsers.find((entry) => entry.id === visit.userId)?.name ?? visit.userId, customer: visit.customerName, status: visit.status, verification: visit.verification ?? "UNVERIFIED", distance: visit.checkInDistanceMeters === undefined ? "-" : `${visit.checkInDistanceMeters} m${visit.distanceWarning ? " WARNING" : ""}`, submitted: visit.submittedAt ?? "-" })) }
    ],
    performance
  };
  res.json(ok(data, `Marketing reports loaded for ${period.from} to ${period.to}`));
});

app.get("/api/reports/marketing/export-authorization", (req, res) => {
  const user = requirePermission(req, res, "marketing", "export");
  if (!user) return;
  res.json(ok({ authorized: true as const }, "Marketing report export authorized"));
});

app.get("/api/field-team/current", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  const employees = visibleFieldEmployees(user);
  const locations = currentFieldLocations(user);
  const statusCount = (status: CurrentEmployeeLocation["status"]) => locations.filter((location) => location.status === status).length;
  const visibleIds = new Set(employees.map((employee) => employee.id));
  const today = businessDate();
  res.json(ok({
    feedLabel: "Demo location feed" as const,
    generatedAt: new Date().toISOString(),
    employees,
    locations,
    summary: {
      activeNow: statusCount("LIVE"),
      recent: statusCount("RECENT") + statusCount("STALE"),
      offline: statusCount("OFFLINE"),
      notTracking: statusCount("NOT_TRACKING"),
      visitsToday: fieldVisits.filter((visit) => visibleIds.has(visit.userId) && businessDate(new Date(visit.plannedAt)) === today).length
    }
  }, "Role-scoped demo field-team feed loaded", { role: user.role, scoped: user.role === "Sales Executive" }));
});

app.get("/api/field-team/employees", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  const term = String(req.query.search ?? "").trim().toLowerCase();
  const territory = String(req.query.territory ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const locationByUser = new Map(currentFieldLocations(user).map((location) => [location.userId, location]));
  const employees = visibleFieldEmployees(user).filter((employee) => {
    const matchesSearch = !term || [employee.name, employee.employeeCode, employee.territory ?? ""].some((value) => value.toLowerCase().includes(term));
    const matchesTerritory = !territory || employee.territory === territory;
    const matchesStatus = !status || locationByUser.get(employee.id)?.status === status;
    return matchesSearch && matchesTerritory && matchesStatus;
  });
  res.json(ok(employees, "Field employees loaded", { total: employees.length, role: user.role, scoped: user.role === "Sales Executive" }));
});

app.get("/api/field-team/:userId/history", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  if (!canAccessFieldEmployee(user, req.params.userId)) return fail(res, 403, "You cannot view another employee's route history.");
  const employeeUser = demoUsers.find((entry) => entry.id === req.params.userId && entry.role === "Sales Executive");
  if (!employeeUser) return fail(res, 404, "Field employee not found.");
  const date = String(req.query.date ?? businessDate());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 422, "Enter a valid history date.");
  const current = currentEmployeeLocations.find((location) => location.userId === employeeUser.id);
  let points = locationHistory.filter((point) => point.userId === employeeUser.id).map((point) => ({ ...point, recordedAt: withRequestedDate(point.recordedAt, date) }));
  if (!points.length && current) {
    points = [
      { id: `fallback-start-${employeeUser.id}`, userId: employeeUser.id, latitude: current.latitude - 0.006, longitude: current.longitude - 0.004, accuracyMeters: current.accuracyMeters, recordedAt: `${date}T09:10:00.000Z`, source: "DEMO", event: "TRACKING_STARTED" },
      { id: `fallback-last-${employeeUser.id}`, userId: employeeUser.id, latitude: current.latitude, longitude: current.longitude, accuracyMeters: current.accuracyMeters, recordedAt: `${date}T11:35:00.000Z`, source: "DEMO", event: "LOCATION" }
    ];
  }
  const session = trackingSessions.find((entry) => entry.userId === employeeUser.id);
  const history: FieldTeamHistoryData = {
    feedLabel: "Demo location feed",
    employee: fieldEmployee(employeeUser),
    date,
    session: session ? { ...session, startedAt: withRequestedDate(session.startedAt, date), endedAt: session.endedAt ? withRequestedDate(session.endedAt, date) : undefined } : undefined,
    points,
    visits: fieldVisits.filter((visit) => visit.userId === employeeUser.id).map((visit) => ({ ...visit, plannedAt: withRequestedDate(visit.plannedAt, date), checkInAt: visit.checkInAt ? withRequestedDate(visit.checkInAt, date) : undefined, checkOutAt: visit.checkOutAt ? withRequestedDate(visit.checkOutAt, date) : undefined }))
  };
  res.json(ok(history, "Role-scoped route and visit history loaded", { role: user.role, scoped: user.role === "Sales Executive" }));
});

app.get("/api/field-team/:userId/visits", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  if (!canAccessFieldEmployee(user, req.params.userId)) return fail(res, 403, "You cannot view another employee's visits.");
  const from = String(req.query.from ?? businessDate());
  const to = String(req.query.to ?? from);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return fail(res, 422, "Enter a valid visit date range.");
  res.json(ok(fieldVisits.filter((visit) => { const date = businessDate(new Date(visit.plannedAt)); return visit.userId === req.params.userId && date >= from && date <= to; }), "Field visits loaded"));
});

app.post("/api/field-team/tracking/start", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  if (user.role !== "Sales Executive") return fail(res, 403, "Only a salesperson can start their own tracking session.");
  const existing = trackingSessions.find((session) => session.userId === user.id && session.status === "Active");
  if (existing) return res.json(ok(existing, "Tracking session is already active"));
  const session: TrackingSession = { id: id("track"), userId: user.id, startedAt: new Date().toISOString(), source: "WEB_FOREGROUND", status: "Active" };
  trackingSessions.unshift(session);
  const current = currentEmployeeLocations.find((location) => location.userId === user.id);
  if (current) {
    current.sessionId = session.id;
    current.sessionStartedAt = session.startedAt;
    current.recordedAt = session.startedAt;
    current.status = "LIVE";
    current.source = "WEB_FOREGROUND";
    locationHistory.push({ id: id("loc"), userId: user.id, latitude: current.latitude, longitude: current.longitude, accuracyMeters: current.accuracyMeters, recordedAt: session.startedAt, source: "WEB_FOREGROUND", event: "TRACKING_STARTED" });
  }
  audit(req, "Tracking Started", "TrackingSession", session.id, `${user.name} started foreground web tracking.`);
  res.status(201).json(ok(session, "Foreground tracking started"));
});

app.post("/api/field-team/tracking/location", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  if (user.role !== "Sales Executive") return fail(res, 403, "Only a salesperson can submit their own location.");
  const input = req.body as LocationUpdateInput;
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90 || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180 || !Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0 || !input.recordedAt || !["MOBILE_APP", "WEB_FOREGROUND", "MANUAL"].includes(input.source)) return fail(res, 422, "Location coordinates, accuracy, timestamp and source are required.");
  const session = trackingSessions.find((entry) => entry.userId === user.id && entry.status === "Active");
  if (!session) return fail(res, 409, "Start a tracking session before sending location.");
  const point: LocationHistoryPoint = { id: id("loc"), userId: user.id, latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters, recordedAt: input.recordedAt, source: input.source, event: "LOCATION" };
  locationHistory.push(point);
  const existing = currentEmployeeLocations.find((location) => location.userId === user.id);
  const currentVisit = fieldVisits.find((visit) => visit.userId === user.id && visit.status === "Checked In");
  const next: CurrentEmployeeLocation = { userId: user.id, employee: fieldEmployee(user), latitude: input.latitude, longitude: input.longitude, accuracyMeters: input.accuracyMeters, recordedAt: input.recordedAt, status: "LIVE", source: input.source, sessionId: session.id, sessionStartedAt: session.startedAt, currentVisit };
  if (existing) Object.assign(existing, next); else currentEmployeeLocations.push(next);
  res.status(201).json(ok(next, "Current location updated"));
});

app.post("/api/field-team/tracking/stop", (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  if (user.role !== "Sales Executive") return fail(res, 403, "Only a salesperson can stop their own tracking session.");
  const session = trackingSessions.find((entry) => entry.userId === user.id && entry.status === "Active");
  if (!session) return fail(res, 409, "No active tracking session exists.");
  session.status = "Completed";
  session.endedAt = new Date().toISOString();
  const current = currentEmployeeLocations.find((location) => location.userId === user.id);
  if (current) {
    current.status = "OFFLINE";
    current.recordedAt = session.endedAt;
    current.sessionId = undefined;
    current.sessionStartedAt = undefined;
    locationHistory.push({ id: id("loc"), userId: user.id, latitude: current.latitude, longitude: current.longitude, accuracyMeters: current.accuracyMeters, recordedAt: session.endedAt, source: "WEB_FOREGROUND", event: "TRACKING_ENDED" });
  }
  audit(req, "Tracking Ended", "TrackingSession", session.id, `${user.name} ended foreground web tracking.`);
  res.json(ok(session, "Tracking stopped"));
});

for (const action of ["check-in", "check-out"] as const) app.post(`/api/field-team/visits/:visitId/${action}`, (req, res) => {
  const user = requireFieldTeam(req, res);
  if (!user) return;
  const visit = fieldVisits.find((entry) => entry.id === req.params.visitId);
  if (!visit) return fail(res, 404, "Field visit not found.");
  if (user.role !== "Sales Executive" || visit.userId !== user.id) return fail(res, 403, "Only the assigned salesperson can verify this visit.");
  const now = new Date().toISOString();
  if (action === "check-in") {
    if (visit.status === "Completed" || visit.status === "Missed") return fail(res, 409, "Only a planned visit can be checked in.");
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracyMeters = Number(req.body?.accuracyMeters);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) return fail(res, 422, "Visit check-in requires valid coordinates and GPS accuracy.");
    if (visit.status === "Checked In") return res.json(ok(visit, "Visit is already checked in"));
    visit.status = "Checked In";
    visit.checkInAt = now;
    visit.checkInLatitude = latitude;
    visit.checkInLongitude = longitude;
    visit.checkInAccuracyMeters = accuracyMeters;
    visit.checkInDistanceMeters = distanceMeters(visit.customerLatitude, visit.customerLongitude, latitude, longitude);
    visit.distanceWarning = visit.checkInDistanceMeters > 250;
    visit.verification = "GPS_VERIFIED";
    visit.submittedAt = now;
    const current = currentEmployeeLocations.find((location) => location.userId === user.id);
    if (current) {
      current.latitude = latitude;
      current.longitude = longitude;
      current.accuracyMeters = accuracyMeters;
      current.recordedAt = now;
      current.currentVisit = visit;
      current.source = "WEB_FOREGROUND";
    }
    locationHistory.push({ id: id("loc"), userId: user.id, latitude, longitude, accuracyMeters, recordedAt: now, source: "WEB_FOREGROUND", event: "VISIT_CHECK_IN" });
    audit(req, "Visit Check-In", "FieldVisit", visit.id, `${user.name} checked in at ${visit.customerName}.`);
  } else {
    if (!visit.checkInAt) return fail(res, 409, "Check in before completing the visit.");
    if (visit.status === "Completed") return res.json(ok(visit, "Visit is already completed"));
    const outcome = String(req.body?.outcome ?? "").trim();
    if (!outcome) return fail(res, 422, "Visit outcome is required before check-out.");
    const latitude = Number(req.body?.checkOutLatitude);
    const longitude = Number(req.body?.checkOutLongitude);
    const accuracyMeters = Number(req.body?.checkOutAccuracyMeters);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) return fail(res, 422, "Visit check-out requires valid coordinates and GPS accuracy.");
    visit.status = "Completed";
    visit.checkOutAt = now;
    visit.outcome = outcome;
    visit.checkOutLatitude = latitude;
    visit.checkOutLongitude = longitude;
    visit.checkOutAccuracyMeters = accuracyMeters;
    visit.productIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : visit.productIds;
    visit.nextFollowUpAt = String(req.body?.nextFollowUpAt ?? "").trim() || visit.nextFollowUpAt;
    visit.remarks = String(req.body?.remarks ?? "").trim() || visit.remarks;
    visit.submittedAt = now;
    if (req.body?.attachmentUpload) {
      try {
        visit.attachments = [...(visit.attachments ?? []), uploadedDocument(req, req.body.attachmentUpload as DocumentUpload, "field-visit", visit.id, "Visit Evidence", false)];
      } catch (error) {
        return fail(res, 422, error instanceof Error ? error.message : "Visit evidence is invalid.");
      }
    }
    if (visit.nextFollowUpAt) marketingFollowUps.unshift({ id: id("follow"), assignedUserId: visit.userId, leadId: visit.leadId, customerId: visit.customerId, subjectName: visit.customerName, dueAt: visit.nextFollowUpAt, purpose: visit.outcome, status: "PENDING", createdAt: now });
    if (visit.leadId) advanceLead(visit.leadId, "CONTACTED", now);
    const current = currentEmployeeLocations.find((location) => location.userId === user.id);
    if (current) {
      current.latitude = latitude;
      current.longitude = longitude;
      current.accuracyMeters = accuracyMeters;
      current.recordedAt = now;
      current.currentVisit = undefined;
      current.source = "WEB_FOREGROUND";
      locationHistory.push({ id: id("loc"), userId: user.id, latitude, longitude, accuracyMeters, recordedAt: now, source: "WEB_FOREGROUND", event: "VISIT_CHECK_OUT" });
    }
    const plan = dailyMarketingPlans.find((entry) => entry.userId === user.id && entry.date === businessDate());
    const plannedVisit = plan?.plannedVisits.find((entry) => !entry.completed && (entry.customerId === visit.customerId || (visit.leadId && entry.leadId === visit.leadId) || entry.subjectName.toLowerCase() === visit.customerName.toLowerCase()));
    if (plannedVisit) plannedVisit.completed = true;
    if (plan?.plannedVisits.length && plan.plannedVisits.every((entry) => entry.completed)) plan.status = "COMPLETED";
    audit(req, "Visit Check-Out", "FieldVisit", visit.id, `${user.name} completed the visit at ${visit.customerName}.`);
  }
  res.json(ok(visit, action === "check-in" ? "Visit check-in recorded" : "Visit check-out recorded"));
});

app.get("/api/documents/:documentId/content", (req, res) => {
  const located = documentById(req.params.documentId);
  if (!located) return fail(res, 404, "Document file is unavailable.");
  const user = requireArea(req, res, located.area);
  if (!user) return;
  if ((located.document.sensitive || located.document.entityType === "import-cost") && !hasCapability(req, "view_sensitive_cost")) {
    return fail(res, 403, "This supporting document contains sensitive import-cost information.");
  }
  const content = documentContents.get(located.document.id);
  if (!content) return fail(res, 404, "The attachment metadata exists, but its demo file is missing.");
  const safeFileName = located.document.fileName.replace(/[\r\n"]/g, "");
  res.setHeader("Content-Type", located.document.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"`);
  if (!content.startsWith("data:")) {
    return res.sendFile(content, (error) => {
      if (!error) return;
      if (!res.headersSent) fail(res, 404, "The attachment metadata exists, but its demo file is missing.");
      else res.end();
    });
  }
  const match = content.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return fail(res, 422, "The stored attachment content is invalid.");
  res.send(Buffer.from(match[2], "base64"));
});

app.get("/api/ai/recommendations", (req, res) => {
  if (!requireUser(req, res)) return;
  res.json(ok(aiRecommendationsFor(req, aiContextFromRequest(req)), "Role-safe recommendations loaded"));
});

app.get("/api/ai/insights", (req, res) => {
  if (!requireUser(req, res)) return;
  const insights: AIInsight[] = aiRecommendationsFor(req, aiContextFromRequest(req)).map((recommendation) => ({
    id: recommendation.id,
    title: recommendation.title,
    summary: recommendation.summary,
    severity: recommendation.severity,
    sourceLabel: recommendation.sourceLabel,
    sourcePath: recommendation.sourcePath,
  }));
  res.json(ok(insights, "Role-safe operational insights loaded"));
});

app.post("/api/ai/chat", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const context = aiContextFromRequest(req);
  const question = String(req.body?.message ?? "").trim();
  if (!question) return fail(res, 422, "Ask a question about the current ERP workspace.");
  const asksForCost = /landed\s*cost|fob|supplier\s*price|import\s*cost/i.test(question);
  const asksForProfit = /gross\s*profit|profit\s*margin/i.test(question);
  const suggestions = aiSuggestionsFor(user, context);
  if ((asksForCost && !hasCapability(req, "view_sensitive_cost")) || (asksForProfit && !hasCapability(req, "view_profit"))) {
    return res.json(ok({ answer: `I cannot provide supplier pricing, landed cost or profit to the ${user.role} role. I can still help with allowed status, stock, customer, due and workflow information.`, contextLabel: `${user.role} · permission-safe response`, suggestions, sources: [], restricted: true }, "Sensitive request safely restricted"));
  }
  if ((context.entityType === "import" && !canAccessArea(user, "imports")) || (context.entityType === "inventory" && !canAccessArea(user, "inventory")) || (context.entityType === "reports" && !canAccessArea(user, "reports")) || (context.entityType === "marketing" && !hasEffectivePermission(user, "marketing", "view")) || (context.entityType === "employees" && !canAccessEmployeeWorkspace(user)) || (context.entityType === "field-team" && marketingScope(user) === "NONE")) {
    return res.json(ok({ answer: `The ${context.entityType} workspace is outside the ${user.role} role, so I cannot read or summarize its records.`, contextLabel: `${user.role} · access restricted`, suggestions: aiSuggestionsFor(user, { route: "/app/dashboard", entityType: "dashboard" }), sources: [], restricted: true }, "Context safely restricted"));
  }

  let answer = "I reviewed the records available to your role. ";
  let contextLabel = `${user.role} · ${context.entityType ?? "dashboard"}`;
  let sources: { label: string; path: string }[] = [];
  if (context.entityType === "import" && canAccessArea(user, "imports")) {
    const record = imports.find((entry) => entry.id === context.entityId);
    if (record) {
      contextLabel = `${record.primaryReference} · ${record.status}`;
      sources = [{ label: record.primaryReference, path: `/app/imports/${record.id}` }];
      const existing = new Set(record.documents.map((document) => document.type.toLowerCase()));
      const expected = ["PI", record.paymentMode === "TT" ? "Swift Copy" : "LC", "Commercial Invoice", "Packing List", "Bill of Lading"];
      const missing = expected.filter((type) => !existing.has(type.toLowerCase()));
      if (/missing|document/i.test(question)) answer = missing.length ? `${record.primaryReference} is missing: ${missing.join(", ")}. Attach or verify these in the Documents section; no data will be applied automatically.` : `${record.primaryReference} has all five core commercial and shipment document types in the current checklist.`;
      else if (/allocation|freight|cost/i.test(question) && hasCapability(req, "view_sensitive_cost")) answer = `${record.primaryReference} has ${record.costs.length} recorded import-cost rows. Each row uses its explicit deterministic basis, and the landed-cost preview must reconcile exactly before authorized finalization.`;
      else answer = `${record.primaryReference} is at ${record.status}. Its next valid action follows the controlled import milestones; warehouse receiving stays locked until the landed-cost snapshot is finalized.`;
    } else answer += "The requested import record is not available.";
  } else if (context.entityType === "inventory" && canAccessArea(user, "inventory")) {
    const recs = aiRecommendationsFor(req, context).filter((item) => item.id.startsWith("expiry-") || item.id.startsWith("fifo-"));
    answer = recs.length ? recs.map((item) => `${item.title}: ${item.summary}`).join(" ") : "No current non-expired batch requires special FIFO or expiry attention.";
    sources = [{ label: "Inventory batches", path: "/app/inventory" }];
  } else if (context.entityType === "sales" && canAccessArea(user, "sales")) {
    const visibleCustomers = customerScoped(req);
    const topDue = [...visibleCustomers].sort((a, b) => decimal(b.currentDue).comparedTo(a.currentDue))[0];
    const openQuotes = salesScoped(quotations, req).filter((quote) => ["Draft", "Sent", "Accepted"].includes(quote.status));
    answer = topDue ? `${topDue.name} has the largest visible due at Tk ${money(topDue.currentDue)}. ${openQuotes.length} quotation${openQuotes.length === 1 ? " is" : "s are"} still open in your permitted sales scope.` : "There are no visible customer dues in your current sales scope.";
    sources = [{ label: "Sales workspace", path: "/app/sales" }];
  } else if (context.entityType === "employees" && canAccessEmployeeWorkspace(user)) {
    const today = businessDate();
    const monthFrom = `${today.slice(0, 7)}-01`;
    const canReadActivity = canViewEmployeeActivity(user);
    const canReadAccess = canManageUserAccess(user);
    const directory = demoUsers.map(directoryEntry);
    const namedEmployee = directory.find((employee) => question.toLowerCase().includes(employee.name.split(" ")[0].toLowerCase()));
    const selectedEmployeeId = context.employeeId ?? namedEmployee?.id;
    const selectedProfile = selectedEmployeeId ? directory.find((employee) => employee.id === selectedEmployeeId) : undefined;
    const asksForAccess = /access|role|permission|capabilit|allow|deny/i.test(question);
    const asksForActivity = /activit|follow.?up|target|tracking|field|visit|order|collection|performance/i.test(question);

    if (context.employeeId && !selectedProfile) {
      return res.json(ok({ answer: "That employee record is outside the available directory.", contextLabel: `${user.role} | employee access restricted`, suggestions, sources: [], restricted: true }, "Employee scope safely restricted"));
    }
    if (asksForAccess) {
      if (!canReadAccess) return res.json(ok({ answer: "Your role may view permitted employee profiles, but it cannot inspect or change role overrides and sensitive capabilities.", contextLabel: `${user.role} | access restricted`, suggestions, sources: [], restricted: true }, "Employee access safely restricted"));
      if (selectedEmployeeId) {
        const selectedUser = demoUsers.find((employee) => employee.id === selectedEmployeeId)!;
        answer = `${selectedUser.name} uses the ${selectedUser.role} role with ${selectedUser.permissionOverrides?.length ?? 0} employee-specific access rule${(selectedUser.permissionOverrides?.length ?? 0) === 1 ? "" : "s"} and ${selectedUser.capabilities?.length ?? 0} sensitive capabilit${(selectedUser.capabilities?.length ?? 0) === 1 ? "y" : "ies"}. Review changes in the Access tab; the assistant cannot grant or revoke access.`;
        contextLabel = `${selectedUser.employeeCode ?? selectedUser.id} | Access explanation`;
        sources = [{ label: `${selectedUser.name} access`, path: `/app/employees?view=access&employee=${selectedUser.id}` }];
      } else {
        const customized = demoUsers.filter((employee) => (employee.permissionOverrides?.length ?? 0) > 0 || (employee.capabilities?.length ?? 0) > 0).length;
        answer = `${demoUsers.length} employee accounts are recorded; ${customized} have employee-specific access rules or sensitive capabilities. Use the Access tab for review and approval. The assistant remains read-only.`;
        sources = [{ label: "Employee access", path: "/app/employees?view=access" }];
      }
    } else if (asksForActivity && !canReadActivity) {
      return res.json(ok({ answer: "Your role can use the permitted employee directory, but team activity, targets, follow-ups and field tracking are outside its employee scope.", contextLabel: `${user.role} | activity restricted`, suggestions, sources: [], restricted: true }, "Employee activity safely restricted"));
    } else if (canReadActivity) {
      const allowed = marketingEmployeeIds(user);
      if (selectedEmployeeId && !allowed.has(selectedEmployeeId)) {
        answer = selectedProfile ? `${selectedProfile.name} is listed as ${selectedProfile.title} in ${selectedProfile.department}, but no field-sales performance record applies to this employee.` : "No employee is selected.";
        contextLabel = selectedProfile ? `${selectedProfile.employeeCode} | Employee profile` : `${user.role} | Employees`;
        sources = selectedProfile ? [{ label: selectedProfile.name, path: `/app/employees?employee=${selectedProfile.id}` }] : [{ label: "Employee directory", path: "/app/employees" }];
      } else {
        const performance = performanceRowsFor(req, monthFrom, today).filter((row) => !selectedEmployeeId || row.employee.id === selectedEmployeeId);
        const activities = unifiedMarketingActivities(req, today, today).filter((activity) => !selectedEmployeeId || activity.userId === selectedEmployeeId);
        const followUps = visibleMarketingFollowUps(req).filter((followUp) => !selectedEmployeeId || followUp.assignedUserId === selectedEmployeeId);
        const overdue = followUps.filter((followUp) => followUp.status === "OVERDUE").sort((left, right) => left.dueAt.localeCompare(right.dueAt));
        if (/not tracking|offline|stale|location/i.test(question)) {
          const locations = currentFieldLocations(user);
          const attention = locations.filter((location) => ["STALE", "OFFLINE", "NOT_TRACKING"].includes(location.status));
          answer = attention.length ? `${attention.length} visible field employee${attention.length === 1 ? " needs" : "s need"} tracking attention: ${attention.slice(0, 3).map((location) => `${location.employee.name} (${location.status.toLowerCase().replace("_", " ")})`).join(", ")}. Always verify the recorded time before acting.` : "Every visible field employee has a live or recent location update.";
          sources = [{ label: "Field Team", path: "/app/employees?view=field-team" }];
        } else if (/overdue|follow.?up/i.test(question)) {
          answer = overdue.length ? `${overdue.length} visible follow-up${overdue.length === 1 ? " is" : "s are"} overdue. ${overdue.slice(0, 3).map((followUp) => `${followUp.subjectName} (${followUp.dueAt})`).join("; ")}.` : "No visible employee follow-up is currently overdue.";
          sources = [{ label: "Employee activity", path: `/app/employees?view=activity${selectedEmployeeId ? `&employee=${selectedEmployeeId}` : ""}` }];
        } else if (/below|target|progress/i.test(question) && !selectedEmployeeId) {
          const belowTarget = performance.filter((row) => decimal(row.progress.overall).lt(100)).sort((left, right) => decimal(left.progress.overall).comparedTo(right.progress.overall));
          answer = belowTarget.length ? `${belowTarget.length} visible employee${belowTarget.length === 1 ? " is" : "s are"} below overall monthly target: ${belowTarget.slice(0, 4).map((row) => `${row.employee.name} (${row.progress.overall}%)`).join(", ")}.` : "Every visible employee has reached the current overall monthly target.";
          sources = [{ label: "Employee performance", path: `/app/employees?view=activity&from=${monthFrom}&to=${today}` }];
        } else {
          const focus = performance[0];
          answer = focus ? `${focus.employee.name} has ${activities.length} recorded activit${activities.length === 1 ? "y" : "ies"} today and ${overdue.length} overdue follow-up${overdue.length === 1 ? "" : "s"}. This month the employee is at ${focus.progress.overall}% overall target progress, with ${focus.verifiedVisits} verified visits, ${focus.orders} orders and Tk ${focus.collectionsBdt} in posted collections.` : `${activities.length} permitted employee activities are recorded today, with ${overdue.length} overdue follow-ups in the visible team scope.`;
          contextLabel = focus ? `${focus.employee.employeeCode} | Activity summary` : `${user.role} | Employee activity`;
          sources = [{ label: focus ? `${focus.employee.name} activity` : "Employee activity", path: `/app/employees?view=activity${focus ? `&employee=${focus.employee.id}` : ""}&from=${monthFrom}&to=${today}` }];
        }
      }
    } else {
      const active = directory.filter((employee) => employee.status === "Active").length;
      const pending = directory.filter((employee) => employee.status === "Pending").length;
      const inactive = directory.filter((employee) => employee.status === "Inactive").length;
      answer = selectedProfile ? `${selectedProfile.name} is ${selectedProfile.title} in ${selectedProfile.department}. Status: ${selectedProfile.status}.${selectedProfile.territory ? ` Territory: ${selectedProfile.territory}.` : ""}` : `${directory.length} employee records are visible: ${active} active, ${pending} pending and ${inactive} inactive.`;
      contextLabel = selectedProfile ? `${selectedProfile.employeeCode} | Employee profile` : `${user.role} | Employee directory`;
      sources = [{ label: selectedProfile?.name ?? "Employee directory", path: `/app/employees${selectedProfile ? `?employee=${selectedProfile.id}` : ""}` }];
    }
  } else if (context.entityType === "marketing" && hasEffectivePermission(user, "marketing", "view")) {
    const allowed = marketingEmployeeIds(user);
    const namedEmployee = demoUsers.find((employee) => allowed.has(employee.id) && question.toLowerCase().includes(employee.name.split(" ")[0].toLowerCase()));
    const selectedEmployeeId = context.employeeId ?? namedEmployee?.id;
    if (selectedEmployeeId && !canAccessMarketingEmployee(user, selectedEmployeeId)) return res.json(ok({ answer: "That employee is outside your permitted marketing scope, so I cannot expose their activity or targets.", contextLabel: `${user.role} · marketing access restricted`, suggestions, sources: [], restricted: true }, "Marketing scope safely restricted"));
    const activities = unifiedMarketingActivities(req, businessDate(), businessDate()).filter((activity) => !selectedEmployeeId || activity.userId === selectedEmployeeId);
    const followUps = visibleMarketingFollowUps(req).filter((followUp) => !selectedEmployeeId || followUp.assignedUserId === selectedEmployeeId);
    const overdue = followUps.filter((followUp) => followUp.status === "OVERDUE");
    const monthFrom = `${businessDate().slice(0, 7)}-01`;
    const performance = performanceRowsFor(req, monthFrom, businessDate()).filter((row) => !selectedEmployeeId || row.employee.id === selectedEmployeeId);
    const focus = performance[0];
    if (/overdue|follow.?up/i.test(question)) answer = overdue.length ? `${overdue.length} permitted follow-up${overdue.length === 1 ? " is" : "s are"} overdue. The oldest visible item is ${overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0].subjectName}, due ${overdue[0].dueAt}.` : "No permitted marketing follow-up is currently overdue.";
    else if (/target|below|progress/i.test(question)) answer = focus ? `${focus.employee.name} is at ${focus.progress.overall}% overall target progress this month, with ${focus.verifiedVisits} verified visits, ${focus.orders} orders and Tk ${focus.collectionsBdt} in posted collections.` : "No target performance row is available in your permitted marketing scope.";
    else if (/lead|negotiation|contact/i.test(question)) { const visibleLeads = visibleMarketingLeads(req).filter((lead) => !selectedEmployeeId || lead.assignedUserId === selectedEmployeeId); const negotiation = visibleLeads.filter((lead) => lead.stage === "NEGOTIATION"); answer = `${visibleLeads.length} lead${visibleLeads.length === 1 ? " is" : "s are"} visible in this scope; ${negotiation.length} ${negotiation.length === 1 ? "is" : "are"} in negotiation. Funnel stages advance only from saved activity and ERP transactions.`; }
    else answer = `${activities.length} marketing activit${activities.length === 1 ? "y is" : "ies are"} recorded today in this scope. ${overdue.length} follow-up${overdue.length === 1 ? " is" : "s are"} overdue.${focus ? ` ${focus.employee.name}'s current activity score is ${focus.activityScore}.` : ""}`;
    contextLabel = selectedEmployeeId ? `${demoUsers.find((employee) => employee.id === selectedEmployeeId)?.name ?? "Employee"} · Marketing` : `${user.role} · Marketing`;
    sources = [{ label: "Marketing activity hub", path: `/app/sales?view=marketing${selectedEmployeeId ? `&employee=${selectedEmployeeId}` : ""}` }, { label: "Marketing reports", path: `/app/reports?view=marketing${selectedEmployeeId ? `&employee=${selectedEmployeeId}` : ""}` }];
  } else if (context.entityType === "field-team" && marketingScope(user) !== "NONE") {
    const locations = currentFieldLocations(user);
    const selected = context.employeeId ? locations.find((location) => location.userId === context.employeeId) : undefined;
    if (context.employeeId && !selected) {
      answer = "That employee is outside your permitted field-team scope, so I cannot expose their location or activity.";
      return res.json(ok({ answer, contextLabel: `${user.role} · field-team access restricted`, suggestions, sources: [], restricted: true }, "Field-team scope safely restricted"));
    }
    const live = locations.filter((location) => location.status === "LIVE").length;
    const stale = locations.filter((location) => ["STALE", "OFFLINE", "NOT_TRACKING"].includes(location.status));
    answer = selected ? `${selected.employee.name} is ${selected.status.toLowerCase().replace("_", " ")}. The last coordinate was recorded at ${selected.recordedAt} with ${selected.accuracyMeters} m accuracy.${selected.currentVisit ? ` Current visit: ${selected.currentVisit.customerName}, checked in at ${selected.currentVisit.checkInAt}.` : " No active customer check-in is attached."}` : `${live} visible employee${live === 1 ? " is" : "s are"} live. ${stale.length} location feed${stale.length === 1 ? " needs" : "s need"} timestamp attention. This is a labelled demo feed, not production tracking.`;
    contextLabel = selected ? `${selected.employee.employeeCode} · ${selected.status}` : `${user.role} · Field Team`;
    const fieldPath = marketingScope(user) === "SELF" ? "/app/sales?view=marketing&marketing=field-team" : "/app/employees?view=field-team";
    sources = [{ label: selected ? `${selected.employee.name} field activity` : "Field Team", path: `${fieldPath}${selected ? `&employee=${selected.userId}` : ""}` }];
  } else if (context.entityType === "reports" && canAccessArea(user, "reports")) {
    const from = context.reportFrom && /^\d{4}-\d{2}-\d{2}$/.test(context.reportFrom) ? context.reportFrom : `${businessDate().slice(0, 7)}-01`;
    const to = context.reportTo && /^\d{4}-\d{2}-\d{2}$/.test(context.reportTo) ? context.reportTo : businessDate();
    const performance = salesEmployeesFor(req).map((employee) => salespersonPerformance(employee, from, to));
    const leader = [...performance].sort((a, b) => decimal(b.summary.deliveredSalesValue).comparedTo(a.summary.deliveredSalesValue))[0];
    const totalSales = performance.reduce((sum, row) => sum.plus(row.summary.deliveredSalesValue), new Decimal(0));
    const totalCollections = performance.reduce((sum, row) => sum.plus(row.summary.collectionsReceived), new Decimal(0));
    answer = `${from} to ${to}: permitted delivered sales are Tk ${money(totalSales)} and collections are Tk ${money(totalCollections)}.${leader ? ` ${leader.employee.name} leads visible delivered sales at Tk ${leader.summary.deliveredSalesValue}.` : ""}`;
    sources = [{ label: "Salesperson performance", path: "/app/reports" }];
  } else {
    const recommendation = aiRecommendationsFor(req, { ...context, entityType: "dashboard" })[0];
    answer = recommendation ? `${recommendation.title}. ${recommendation.summary} Recommended next step: ${recommendation.recommendedAction}` : `There are no urgent exceptions in the records currently visible to ${user.role}.`;
    sources = recommendation?.sourcePath ? [{ label: recommendation.sourceLabel, path: recommendation.sourcePath }] : [];
  }
  res.json(ok({ answer, contextLabel, suggestions, sources, restricted: false }, "Contextual answer generated from current mock ERP data"));
});

app.post("/api/ai/document-extract", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const record = imports.find((entry) => entry.id === req.body?.importId);
  const document = record?.documents.find((entry) => entry.id === req.body?.documentId);
  if (!record || !document) return fail(res, 404, "Import document not found.");
  if (document.sensitive && !hasCapability(req, "view_sensitive_cost")) return fail(res, 403, "This document is sensitive for your role.");
  const firstItem = record.items[0];
  const fields = [
    { key: "supplierName", label: "Supplier", value: record.supplierName, target: "import" as const, confidence: "0.99" },
    { key: "piNumber", label: "PI Number", value: record.piNumber ?? `PI-${record.poNumber.replace("PO-", "")}`, target: "import" as const, confidence: "0.96" },
    { key: "piDate", label: "PI Date", value: record.piDate ?? record.poDate, target: "import" as const, confidence: "0.94" },
    { key: "currency", label: "Currency", value: record.currency, target: "import" as const, confidence: "0.98" },
    ...(firstItem ? [
      { key: "quantity", label: `${firstItem.productName} Quantity`, value: firstItem.quantity, target: "item" as const, targetId: firstItem.id, confidence: "0.95" },
      { key: "cartonCount", label: `${firstItem.productName} Cartons`, value: firstItem.cartonCount, target: "item" as const, targetId: firstItem.id, confidence: "0.91" },
      { key: "cbmPerCarton", label: `${firstItem.productName} CBM / Carton`, value: firstItem.cbmPerCarton, target: "item" as const, targetId: firstItem.id, confidence: "0.89" },
      ...(hasCapability(req, "view_sensitive_cost") ? [{ key: "fobUnitForeign", label: `${firstItem.productName} FOB / Unit`, value: firstItem.fobUnitForeign, target: "item" as const, targetId: firstItem.id, confidence: "0.93" }] : [])
    ] : [])
  ];
  audit(req, "AI extraction prepared", "ImportDocument", document.id, `${fields.length} fields extracted for human review; no record was changed.`);
  res.json(ok({ importId: record.id, documentId: document.id, documentName: document.name, requiresReview: true as const, fields, warnings: ["Mock extraction uses current document-linked demo data.", "Review every selected field before applying normal import validation."] }, "Fields extracted for review"));
});

app.get(["/api/dashboard", "/api/dashboard/summary"], (req, res) => {
  const user = requireArea(req, res, "dashboard");
  if (!user) return;
  const visibleOrders = salesScoped(orders, req);
  const visibleOrderIds = new Set(visibleOrders.map((order) => order.id));
  const visibleDeliveries = user.role === "Sales Executive" ? deliveries.filter((delivery) => visibleOrderIds.has(delivery.orderId)) : deliveries;
  const visibleCollections = salesScoped(collections, req).filter((collection) => collection.status === "Posted");
  const visibleCustomers = customerScoped(req);
  const currentMonth = businessDate().slice(0, 7);
  const salesTotal = visibleDeliveries.filter((delivery) => delivery.date.startsWith(currentMonth)).flatMap((delivery) => delivery.lines).reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));
  const collectionTotal = visibleCollections.filter((collection) => collection.date.startsWith(currentMonth)).reduce((sum, collection) => sum.plus(collection.amount), new Decimal(0));
  const dueTotal = visibleCustomers.reduce((sum, customer) => sum.plus(customer.currentDue), new Decimal(0));
  const expenseTotal = expenses.filter((expense) => expense.status === "Posted" && expense.date.startsWith(currentMonth)).reduce((sum, expense) => sum.plus(expense.amount), new Decimal(0));
  const stockUnits = stockBatches.reduce((sum, batch) => sum.plus(batch.quantityAvailable), new Decimal(0));
  const stockValue = stockBatches.reduce((sum, batch) => sum.plus(decimal(batch.quantityAvailable).mul(batch.landedCostPerUnit)), new Decimal(0));
  const importsInProgress = imports.filter((item) => !["Received", "Closed", "Cancelled"].includes(item.status));
  const expiryAttention = stockBatches.filter((batch) => expiryStatus(batch.expiryDate) !== "Normal");
  const readyToReceive = imports.filter((item) => ["Cost Finalized", "Partially Received"].includes(item.status));
  const openOrders = visibleOrders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const openQuotes = salesScoped(quotations, req).filter((quote) => !["Converted", "Rejected"].includes(quote.status));
  const orderPipeline = openOrders.reduce((sum, order) => sum.plus(order.total), new Decimal(0));
  const accountBalance = accounts.filter((account) => account.active).reduce((sum, account) => sum.plus(account.balance), new Decimal(0));
  const dispatchCount = visibleDeliveries.filter((delivery) => delivery.date.startsWith(currentMonth)).length;
  const canSeeSales = canAccessArea(user, "sales");
  const canSeeCustomers = hasEffectivePermission(user, "customers", "view");
  const canSeeAccounts = canAccessArea(user, "accounts");
  const canSeeInventory = canAccessArea(user, "inventory");
  const canSeeImports = canAccessArea(user, "imports");
  const metricsByRole: Record<Role, { id: string; label: string; value: string; unit: string; sensitive?: boolean }[]> = {
    "Super Admin": [
      { id: "sales", label: "Delivered Sales This Month", value: money(salesTotal), unit: "BDT" },
      { id: "collection", label: "Collections This Month", value: money(collectionTotal), unit: "BDT" },
      { id: "due", label: "Outstanding Receivable", value: money(dueTotal), unit: "BDT" },
      { id: "expense", label: "Operating Expense This Month", value: money(expenseTotal), unit: "BDT" },
      hasCapability(req, "view_sensitive_cost") ? { id: "stock", label: "Inventory Value", value: money(stockValue), unit: "BDT", sensitive: true } : { id: "stock", label: "Available Stock", value: stockUnits.toFixed(0), unit: "units" },
      { id: "imports", label: "Imports In Progress", value: String(importsInProgress.length), unit: "cases" }
    ],
    "Managing Director": [
      { id: "sales", label: "Delivered Sales This Month", value: money(salesTotal), unit: "BDT" },
      { id: "collection", label: "Collections This Month", value: money(collectionTotal), unit: "BDT" },
      { id: "due", label: "Outstanding Receivable", value: money(dueTotal), unit: "BDT" },
      { id: "expense", label: "Operating Expense This Month", value: money(expenseTotal), unit: "BDT" },
      { id: "stock", label: "Available Stock", value: stockUnits.toFixed(0), unit: "units" },
      { id: "imports", label: "Imports In Progress", value: String(importsInProgress.length), unit: "cases" }
    ],
    Accounts: [
      { id: "sales", label: "Delivered Sales This Month", value: money(salesTotal), unit: "BDT" },
      { id: "collection", label: "Collections This Month", value: money(collectionTotal), unit: "BDT" },
      { id: "due", label: "Outstanding Receivable", value: money(dueTotal), unit: "BDT" },
      { id: "expense", label: "Operating Expense This Month", value: money(expenseTotal), unit: "BDT" },
      { id: "accounts", label: "Cash / Bank Position", value: money(accountBalance), unit: "BDT" }
    ],
    "Import Officer": [
      { id: "imports", label: "Imports In Progress", value: String(importsInProgress.length), unit: "cases" },
      { id: "pi", label: "Awaiting PI", value: String(imports.filter((item) => item.status === "Draft").length), unit: "cases" },
      { id: "shipment", label: "Shipped / At Port", value: String(imports.filter((item) => ["Shipped", "At Port"].includes(item.status)).length), unit: "cases" },
      { id: "costing", label: "Awaiting Cost Finalization", value: String(imports.filter((item) => item.status === "Costing").length), unit: "cases" },
      { id: "receiving", label: "Ready for Warehouse", value: String(readyToReceive.length), unit: "cases" }
    ],
    "Warehouse Manager": [
      { id: "stock", label: "Available Stock", value: stockUnits.toFixed(0), unit: "units" },
      { id: "batches", label: "Tracked Batches", value: String(stockBatches.length), unit: "batches" },
      { id: "expiry", label: "Expiry Attention", value: String(expiryAttention.length), unit: "batches" },
      { id: "receiving", label: "Imports Ready to Receive", value: String(readyToReceive.length), unit: "cases" },
      { id: "dispatch", label: "Dispatches This Month", value: String(dispatchCount), unit: "challans" }
    ],
    "Sales Manager": [
      { id: "sales", label: "Delivered Sales This Month", value: money(salesTotal), unit: "BDT" },
      { id: "collection", label: "Collections This Month", value: money(collectionTotal), unit: "BDT" },
      { id: "due", label: "Outstanding Receivable", value: money(dueTotal), unit: "BDT" },
      { id: "pipeline", label: "Open Order Pipeline", value: money(orderPipeline), unit: "BDT" },
      { id: "quotes", label: "Open Quotations", value: String(openQuotes.length), unit: "quotes" },
      { id: "stock", label: "Available Stock", value: stockUnits.toFixed(0), unit: "units" }
    ],
    "Sales Executive": [
      { id: "sales", label: "My Delivered Sales This Month", value: money(salesTotal), unit: "BDT" },
      { id: "collection", label: "My Collections This Month", value: money(collectionTotal), unit: "BDT" },
      { id: "due", label: "My Customer Receivable", value: money(dueTotal), unit: "BDT" },
      { id: "pipeline", label: "My Open Order Pipeline", value: money(orderPipeline), unit: "BDT" },
      { id: "quotes", label: "My Open Quotations", value: String(openQuotes.length), unit: "quotes" }
    ]
  };
  const metricArea: Record<string, boolean> = {
    sales: canSeeSales, collection: canSeeSales, pipeline: canSeeSales, quotes: canSeeSales,
    due: canSeeCustomers, expense: canSeeAccounts, accounts: canSeeAccounts,
    stock: canSeeInventory, batches: canSeeInventory, expiry: canSeeInventory, dispatch: canSeeInventory,
    imports: canSeeImports, pi: canSeeImports, shipment: canSeeImports, costing: canSeeImports,
    receiving: canSeeImports || canSeeInventory
  };
  const canSeeMarketing = hasEffectivePermission(user, "marketing", "view");
  const today = businessDate();
  const marketingToday = canSeeMarketing ? unifiedMarketingActivities(req, today, today) : [];
  const marketingFollowUpRows = canSeeMarketing ? visibleMarketingFollowUps(req) : [];
  const marketingDashboard = canSeeMarketing ? {
    title: user.role === "Sales Executive" ? "My Day" : "Today's Marketing",
    metrics: user.role === "Sales Executive"
      ? [
          { id: "activities", label: "Activities", value: String(marketingToday.length), unit: "today" },
          { id: "overdue", label: "Overdue Follow-ups", value: String(marketingFollowUpRows.filter((followUp) => followUp.status === "OVERDUE").length), unit: "items" },
          { id: "plan", label: "Plan Remaining", value: String(dailyMarketingPlans.find((plan) => plan.userId === user.id && plan.date === today)?.plannedVisits.filter((visit) => !visit.completed).length ?? 0), unit: "visits" }
        ]
      : [
          { id: "active", label: "Active Employees", value: String(currentFieldLocations(user).filter((location) => marketingEmployeeIds(user).has(location.userId) && ["LIVE", "RECENT"].includes(location.status)).length), unit: "people" },
          { id: "visits", label: "Visits", value: String(fieldVisits.filter((visit) => marketingEmployeeIds(user).has(visit.userId) && inTimestampPeriod(visit.plannedAt, today, today)).length), unit: "today" },
          { id: "leads", label: "New Leads", value: String(visibleMarketingLeads(req).filter((lead) => inTimestampPeriod(lead.createdAt, today, today)).length), unit: "today" },
          { id: "followups", label: "Follow-ups", value: String(marketingFollowUpRows.filter((followUp) => businessDate(new Date(followUp.dueAt)) === today).length), unit: "today" },
          { id: "quotes", label: "Quotations", value: String(marketingToday.filter((activity) => activity.activityType === "QUOTATION_SUBMITTED").length), unit: "today" },
          { id: "orders", label: "Orders", value: String(marketingToday.filter((activity) => activity.activityType === "ORDER_RECEIVED").length), unit: "today" }
        ],
    actionPath: "/app/sales?view=marketing"
  } : undefined;
  res.json(ok({
    role: user.role,
    metrics: metricsByRole[user.role].filter((metric) => metricArea[metric.id] ?? false),
    importAttention: canAccessArea(user, "imports") ? imports.filter((item) => ["Draft", "PI Received", "At Port", "Costing", "Cost Finalized", "Partially Received"].includes(item.status)).map((item) => importForRole(item, req)) : [],
    expiryAlerts: canSeeInventory ? expiryAttention.map((batch) => visibleBatch(batch, req)) : [],
    customerDues: canSeeCustomers ? visibleCustomers.filter((customer) => decimal(customer.currentDue).gt(0)).sort((a, b) => decimal(b.currentDue).comparedTo(a.currentDue)).slice(0, 5) : [],
    recentSales: canSeeSales ? visibleOrders.slice(0, 5) : [],
    recentCollections: canSeeSales ? visibleCollections.slice(0, 5) : [],
    recentExpenses: canSeeAccounts ? expenses.filter((expense) => expense.status === "Posted").slice(0, 5) : [],
    marketing: marketingDashboard
  }, "Dashboard loaded"));
});

app.get("/api/products", (req, res) => {
  if (!requireUser(req, res)) return;
  res.json(ok(products, "Products loaded", { total: products.length }));
});
app.post("/api/products", (req, res) => {
  const user = requirePermission(req, res, "products", "create");
  if (!user) return;
  const product = { ...req.body, id: id("prd") };
  products.unshift(product);
  audit(req, "Product created", "Product", product.id, `${product.name} added to canonical product master.`);
  res.status(201).json(ok(product, "Product created"));
});
app.patch("/api/products/:productId", (req, res) => {
  const user = requirePermission(req, res, "products", "edit");
  if (!user) return;
  const index = products.findIndex((product) => product.id === req.params.productId);
  if (index < 0) return fail(res, 404, "Product not found");
  products[index] = { ...products[index], ...req.body, id: products[index].id };
  audit(req, "Product updated", "Product", products[index].id, `${products[index].name} canonical data updated.`);
  res.json(ok(products[index], "Product updated"));
});
app.delete("/api/products/:productId", (req, res) => {
  const user = requirePermission(req, res, "products", "delete");
  if (!user) return;
  const index = products.findIndex((product) => product.id === req.params.productId);
  if (index < 0) return fail(res, 404, "Product not found");
  const product = products[index];
  const referenced = imports.some((record) => record.items.some((item) => item.productId === product.id)) || orders.some((order) => order.lines.some((line) => line.productId === product.id)) || stockBatches.some((batch) => batch.productId === product.id);
  if (referenced) return fail(res, 409, "Referenced products cannot be deleted; mark the product inactive.");
  products.splice(index, 1);
  audit(req, "Product deleted", "Product", product.id, `${product.name} removed before use.`);
  res.json(ok({ id: product.id }, "Product deleted"));
});

app.get("/api/suppliers", (req, res) => {
  if (!requirePermission(req, res, "suppliers", "view")) return;
  res.json(ok(suppliers, "Suppliers loaded", { total: suppliers.length }));
});
app.post("/api/suppliers", (req, res) => {
  const user = requirePermission(req, res, "suppliers", "create");
  if (!user) return;
  const supplier = { ...req.body, id: id("sup"), active: true };
  suppliers.unshift(supplier);
  audit(req, "Supplier created", "Supplier", supplier.id, `${supplier.name} added.`);
  res.status(201).json(ok(supplier, "Supplier created"));
});
app.patch("/api/suppliers/:supplierId", (req, res) => {
  const user = requirePermission(req, res, "suppliers", "edit");
  if (!user) return;
  const index = suppliers.findIndex((supplier) => supplier.id === req.params.supplierId);
  if (index < 0) return fail(res, 404, "Supplier not found");
  suppliers[index] = { ...suppliers[index], ...req.body, id: suppliers[index].id };
  audit(req, "Supplier updated", "Supplier", suppliers[index].id, `${suppliers[index].name} updated.`);
  res.json(ok(suppliers[index], "Supplier updated"));
});
app.delete("/api/suppliers/:supplierId", (req, res) => {
  const user = requirePermission(req, res, "suppliers", "delete");
  if (!user) return;
  const index = suppliers.findIndex((supplier) => supplier.id === req.params.supplierId);
  if (index < 0) return fail(res, 404, "Supplier not found");
  const supplier = suppliers[index];
  if (imports.some((record) => record.supplierId === supplier.id)) return fail(res, 409, "Referenced suppliers cannot be deleted; mark the supplier inactive.");
  suppliers.splice(index, 1);
  audit(req, "Supplier deleted", "Supplier", supplier.id, `${supplier.name} removed before use.`);
  res.json(ok({ id: supplier.id }, "Supplier deleted"));
});

app.get("/api/imports", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  res.json(ok(imports.map((record) => importForRole(record, req)), "Imports loaded", { total: imports.length }));
});
app.post("/api/imports", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const supplier = suppliers.find((entry) => entry.id === req.body.supplierId);
  if (!supplier || !String(req.body.poNumber ?? "").trim() || !req.body.poDate) return fail(res, 422, "Supplier, PO number and PO date are required.");
  if (!Array.isArray(req.body.items) || !req.body.items.length) return fail(res, 422, "Add at least one product line to the draft import.");
  let items: ImportItem[];
  try {
    items = req.body.items.map((item: Partial<ImportItem>) => normalizeImportItem(item));
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Import item values are invalid.");
  }
  const now = new Date().toISOString();
  const record: ImportCase = {
    ...req.body,
    id: id("imp"),
    draftReference: nextReference("IMP", imports.length),
    primaryReference: "",
    supplierId: supplier.id,
    supplierName: supplier.name,
    paymentMode: req.body.paymentMode ?? "Pending",
    piNumber: req.body.piNumber || undefined,
    piDate: req.body.piDate || undefined,
    currency: req.body.currency ?? "USD",
    exchangeRate: String(req.body.exchangeRate ?? "0"),
    rateDate: req.body.rateDate ?? "",
    rateSource: req.body.rateSource ?? "Pending",
    status: "Draft",
    milestone: "Draft",
    costingStatus: "Not Started",
    warehouseStatus: "Not Ready",
    items,
    costs: [],
    documents: [],
    createdAt: now,
    updatedAt: now
  };
  deriveImportStatus(record);
  imports.unshift(record);
  audit(req, "Import created", "Import", record.id, `${record.draftReference} created for ${record.supplierName}.`);
  res.status(201).json(ok(importForRole(record, req), "Import created"));
});
app.get("/api/imports/:importId", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  res.json(ok(importForRole(record, req), "Import loaded"));
});
app.delete("/api/imports/:importId", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const index = imports.findIndex((item) => item.id === req.params.importId);
  if (index < 0) return fail(res, 404, "Import not found");
  const record = imports[index];
  if (record.snapshot || receipts.some((receipt) => receipt.importId === record.id) || !["Draft", "PI Received", "Cancelled"].includes(record.status)) {
    return fail(res, 409, "Only unreceived draft, PI-received or cancelled imports can be deleted.");
  }
  imports.splice(index, 1);
  audit(req, "Import deleted", "Import", record.id, `${record.primaryReference} removed before financial or warehouse posting.`);
  res.json(ok({ id: record.id }, "Import deleted"));
});
app.patch("/api/imports/:importId", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const index = imports.findIndex((item) => item.id === req.params.importId);
  if (index < 0) return fail(res, 404, "Import not found");
  if (terminalImportLocked(imports[index], res)) return;
  if (imports[index].snapshot) return fail(res, 423, "Finalized cost records are locked. Reopen with a reason first.");
  if (req.body.status !== undefined || req.body.milestone !== undefined || req.body.costingStatus !== undefined || req.body.warehouseStatus !== undefined) {
    return fail(res, 422, "Workflow status is derived from recorded actions and cannot be patched directly.");
  }
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => !protectedImportFields.has(key)));
  const proposedLc = String(updates.lcNumber ?? imports[index].lcNumber ?? "").trim();
  if (proposedLc && imports.some((entry, entryIndex) => entryIndex !== index && entry.lcNumber?.trim().toLowerCase() === proposedLc.toLowerCase())) {
    return fail(res, 409, `LC number ${proposedLc} is already assigned to another import case.`);
  }
  imports[index] = { ...imports[index], ...updates, id: imports[index].id };
  deriveImportStatus(imports[index]);
  audit(req, "Import updated", "Import", imports[index].id, `${imports[index].primaryReference} commercial or shipment information updated.`);
  res.json(ok(importForRole(imports[index], req), "Import updated"));
});

app.post("/api/imports/:importId/transition", (req, res) => {
  const user = requireArea(req, res, "imports", "edit");
  if (!user) return;
  const record = imports.find((entry) => entry.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  const target = String(req.body?.status ?? "") as ImportStatus;
  if (target === "Closed") {
    if (record.status !== "Received") return fail(res, 409, "Only a fully received import case can be closed.");
    record.status = "Closed";
    record.milestone = "Closed";
    record.updatedAt = new Date().toISOString();
    audit(req, "Import case closed", "Import", record.id, `${record.primaryReference} closed after complete warehouse receiving.`);
    return res.json(ok(importForRole(record, req), "Import case closed"));
  }
  if (target === "Cancelled") {
    const cancellable: ImportStatus[] = ["Draft", "PI Received", "LC/TT Opened", "In Production", "Shipped", "At Port", "Costing"];
    if (record.snapshot || receipts.some((entry) => entry.importId === record.id)) return fail(res, 423, "Finalized or received imports cannot be cancelled.");
    if (!cancellable.includes(record.status)) return fail(res, 409, `Cannot cancel an import in ${record.status} status.`);
    record.status = "Cancelled";
    record.milestone = "Cancelled";
    record.updatedAt = new Date().toISOString();
    audit(req, "Import case cancelled", "Import", record.id, `${record.primaryReference} cancelled before financial or warehouse posting.`);
    return res.json(ok(importForRole(record, req), "Import case cancelled"));
  }
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot || receipts.some((entry) => entry.importId === record.id)) return fail(res, 423, "Finalized or received imports cannot use operational milestone transitions.");
  const allowed: Partial<Record<ImportStatus, ImportStatus[]>> = {
    "LC/TT Opened": ["In Production"],
    "In Production": ["Shipped"],
    Shipped: ["At Port"]
  };
  if (!(allowed[record.status] ?? []).includes(target)) return fail(res, 409, `Cannot move ${record.status} directly to ${target}. Complete the preceding business action first.`);
  record.status = target;
  record.milestone = target;
  record.updatedAt = new Date().toISOString();
  audit(req, "Import milestone advanced", "Import", record.id, `${record.primaryReference}: ${target}.`);
  res.json(ok(importForRole(record, req), `Import moved to ${target}`));
});

app.post("/api/imports/:importId/items", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot) return fail(res, 423, "Finalized imports are locked.");
  let item: ImportItem;
  try {
    item = normalizeImportItem(req.body);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Import item values are invalid.");
  }
  record.items.push(item);
  record.costingStatus = record.costs.length ? "In Progress" : "Not Started";
  record.updatedAt = new Date().toISOString();
  audit(req, "Import item added", "Import", record.id, `${item.productName} added to ${record.primaryReference}.`);
  res.status(201).json(ok(importForRole(record, req), "Import item added"));
});
app.patch("/api/imports/:importId/items/:itemId", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const record = imports.find((item) => item.id === req.params.importId);
  const index = record?.items.findIndex((item) => item.id === req.params.itemId) ?? -1;
  if (!record || index < 0) return fail(res, 404, "Import item not found");
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot) return fail(res, 423, "Finalized imports are locked.");
  try {
    record.items[index] = normalizeImportItem(req.body, record.items[index]);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Import item values are invalid.");
  }
  record.updatedAt = new Date().toISOString();
  audit(req, "Import item updated", "Import", record.id, `${record.items[index].productName} values updated.`);
  res.json(ok(importForRole(record, req), "Import item updated"));
});
app.delete("/api/imports/:importId/items/:itemId", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot) return fail(res, 423, "Finalized imports are locked.");
  const existing = record.items.find((item) => item.id === req.params.itemId);
  if (!existing) return fail(res, 404, "Import item not found");
  record.items = record.items.filter((item) => item.id !== req.params.itemId);
  record.costs = record.costs.filter((cost) => !cost.appliesToItemIds.includes(req.params.itemId));
  audit(req, "Import item removed", "Import", record.id, `${existing.productName} removed before finalization.`);
  res.json(ok(importForRole(record, req), "Import item removed"));
});

app.post("/api/imports/:importId/costs", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  if (!hasCapability(req, "edit_sensitive_cost")) return fail(res, 403, "Sensitive cost editing requires owner permission.");
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot) return fail(res, 423, "Finalized imports are locked.");
  const { attachmentUpload, ...costPayload } = req.body as Record<string, unknown> & { attachmentUpload?: DocumentUpload };
  const cost: ImportCostLine = { ...(costPayload as unknown as ImportCostLine), id: id("cost"), enteredBy: userFor(req)?.name ?? "Unknown", createdAt: new Date().toISOString() };
  if (!cost.allocationMethod) return fail(res, 422, "Select an allocation method explicitly.");
  try {
    const amount = requiredDecimal(cost.amountForeign, `${cost.name || "Cost"} amount`);
    const rate = cost.currency === "BDT" ? new Decimal(1) : requiredDecimal(cost.exchangeRate, `${cost.name || "Cost"} exchange rate`);
    cost.exchangeRate = precise(rate, 4);
    cost.amountBdt = money(amount.mul(rate));
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Cost values are invalid.");
  }
  if (attachmentUpload) {
    try {
      cost.attachment = uploadedDocument(req, attachmentUpload, "import-cost", cost.id, cost.category || cost.name, true);
      cost.attachmentName = cost.attachment.fileName;
    } catch (error) {
      return fail(res, 422, error instanceof Error ? error.message : "Cost attachment is invalid.");
    }
  }
  record.costs.push(cost);
  record.status = "Costing";
  record.milestone = "Costing";
  record.costingStatus = "In Progress";
  record.updatedAt = new Date().toISOString();
  audit(req, "Cost line added", "Import", record.id, `${cost.name} added using ${cost.allocationMethod}.`);
  res.status(201).json(ok(record, "Cost added"));
});
app.patch("/api/imports/:importId/costs/:costId", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  if (!hasCapability(req, "edit_sensitive_cost")) return fail(res, 403, "Sensitive cost editing requires owner permission.");
  const record = imports.find((item) => item.id === req.params.importId);
  const index = record?.costs.findIndex((cost) => cost.id === req.params.costId) ?? -1;
  if (!record || index < 0) return fail(res, 404, "Cost line not found");
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot) return fail(res, 423, "Finalized imports are locked.");
  const { attachmentUpload, ...costPayload } = req.body as Record<string, unknown> & { attachmentUpload?: DocumentUpload };
  const cost: ImportCostLine = { ...record.costs[index], ...(costPayload as Partial<ImportCostLine>), id: record.costs[index].id };
  try {
    const amount = requiredDecimal(cost.amountForeign, `${cost.name || "Cost"} amount`);
    const rate = cost.currency === "BDT" ? new Decimal(1) : requiredDecimal(cost.exchangeRate, `${cost.name || "Cost"} exchange rate`);
    cost.exchangeRate = precise(rate, 4);
    cost.amountBdt = money(amount.mul(rate));
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Cost values are invalid.");
  }
  if (attachmentUpload) {
    try {
      cost.attachment = uploadedDocument(req, attachmentUpload, "import-cost", cost.id, cost.category || cost.name, true);
      cost.attachmentName = cost.attachment.fileName;
    } catch (error) {
      return fail(res, 422, error instanceof Error ? error.message : "Cost attachment is invalid.");
    }
  }
  record.costs[index] = cost;
  audit(req, "Cost line changed", "Import", record.id, `${cost.name} amount or allocation basis changed.`);
  res.json(ok(record, "Cost updated"));
});
app.delete("/api/imports/:importId/costs/:costId", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  if (!hasCapability(req, "edit_sensitive_cost")) return fail(res, 403, "Sensitive cost editing requires owner permission.");
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  if (record.snapshot) return fail(res, 423, "Finalized imports are locked.");
  const cost = record.costs.find((item) => item.id === req.params.costId);
  if (!cost) return fail(res, 404, "Cost line not found");
  record.costs = record.costs.filter((item) => item.id !== cost.id);
  deriveImportStatus(record);
  audit(req, "Cost line removed", "Import", record.id, `${cost.name} removed before finalization.`);
  res.json(ok(record, "Cost removed"));
});
app.post("/api/imports/:importId/documents", (req, res) => {
  const user = requireArea(req, res, "imports");
  if (!user) return;
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  let common: DocumentRecord;
  try {
    common = uploadedDocument(req, req.body.upload, "import", record.id, String(req.body.type || "Other"), Boolean(req.body.sensitive));
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Document is invalid.");
  }
  const document: ImportDocument = { ...common, importId: record.id, type: common.documentType, name: common.fileName, uploadedAt: common.createdAt, uploadedBy: user.name, status: "Available" };
  record.documents.push(document);
  audit(req, "Document attached", "Import", record.id, `${document.type}: ${document.name}`);
  res.status(201).json(ok(document, "Document metadata saved"));
});
app.post("/api/imports/:importId/cost-preview", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  if (!hasCapability(req, "view_sensitive_cost")) return fail(res, 403, "Landed-cost preview requires owner permission.");
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  res.json(ok(calculateLandedCost(record.id, record.items, record.costs), "Landed cost preview calculated"));
});
app.post("/api/imports/:importId/finalize", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  if (!hasCapability(req, "finalize_landed_cost")) return fail(res, 403, "Only the authorized owner can finalize landed cost.");
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  if (!record.piNumber?.trim()) return fail(res, 422, "Add the supplier PI before finalizing landed cost.");
  if (record.paymentMode === "Pending" || (record.paymentMode === "LC" && !record.lcNumber?.trim()) || (record.paymentMode === "TT" && !record.ttReference?.trim())) return fail(res, 422, "Record the LC number or TT reference before finalizing landed cost.");
  for (const item of record.items) {
    if (decimal(item.fobUnitForeign).lte(0) || decimal(item.exchangeRate).lte(0) || decimal(item.fobTotalBdt).lte(0)) return fail(res, 422, `${item.productName}: enter positive FOB and exchange-rate values before finalization.`);
  }
  const preview = calculateLandedCost(record.id, record.items, record.costs);
  if (preview.validationErrors.length) return fail(res, 422, preview.validationErrors.join(" "));
  const previousVersion = record.snapshotHistory?.at(-1)?.version ?? 0;
  record.snapshot = { ...preview, id: id("snapshot"), version: previousVersion + 1, finalizedAt: new Date().toISOString(), finalizedBy: userFor(req)?.name ?? "Owner", immutable: true };
  record.snapshotHistory = [...(record.snapshotHistory ?? []), structuredClone(record.snapshot)];
  record.status = "Cost Finalized";
  record.milestone = "Cost Finalized";
  record.costingStatus = "Finalized";
  record.warehouseStatus = "Ready";
  record.updatedAt = new Date().toISOString();
  audit(req, "Landed cost finalized", "Import", record.id, `${record.primaryReference} snapshot v${record.snapshot.version} finalized.`);
  res.json(ok(record, "Landed cost finalized"));
});
app.post("/api/imports/:importId/reopen", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  if (!hasCapability(req, "reopen_landed_cost")) return fail(res, 403, "Only the authorized owner can reopen landed cost.");
  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return fail(res, 422, "A reopening reason is required.");
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (receipts.some((receipt) => receipt.importId === record.id) || stockBatches.some((batch) => batch.sourceImportId === record.id)) {
    return fail(res, 409, "Landed cost cannot be reopened after warehouse receipt. A future valuation-adjustment workflow is required to preserve stock history.");
  }
  delete record.snapshot;
  record.status = "Costing";
  record.milestone = "Costing";
  record.costingStatus = "In Progress";
  record.warehouseStatus = "Not Ready";
  audit(req, "Landed cost reopened", "Import", record.id, `${record.primaryReference} reopened for correction.`, reason);
  res.json(ok(record, "Landed cost reopened"));
});

app.post("/api/imports/:importId/receive", (req, res) => {
  const user = requireArea(req, res, "inventory", "post");
  if (!user) return;
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  if (terminalImportLocked(record, res)) return;
  if (!record.snapshot) return fail(res, 409, "Finalize landed cost before warehouse receiving.");
  if (!Array.isArray(req.body?.lines) || !req.body.lines.length) return fail(res, 422, "Add at least one product receipt line.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.receivedDate ?? ""))) return fail(res, 422, "Enter a valid warehouse received date.");
  const receipt = req.body as WarehouseReceipt;
  const payloadBatchNumbers = new Set<string>();
  for (const line of receipt.lines) {
    const source = record.items.find((item) => item.id === line.importItemId);
    if (!source) return fail(res, 422, `${line.productName}: import item not found.`);
    let receivedQuantity: Decimal;
    let rejectedQuantity: Decimal;
    try {
      receivedQuantity = requiredDecimal(line.quantityReceived ?? "0", `${source.productName} received quantity`, { allowZero: true });
      rejectedQuantity = requiredDecimal(line.quantityRejected ?? "0", `${source.productName} rejected quantity`, { allowZero: true });
    } catch (error) {
      return fail(res, 422, error instanceof Error ? error.message : `${source.productName}: receipt quantities are invalid.`);
    }
    if (receivedQuantity.plus(rejectedQuantity).lte(0)) {
      return fail(res, 422, `${line.productName}: enter a received or rejected quantity.`);
    }
    line.quantityReceived = precise(receivedQuantity, 4);
    line.quantityRejected = precise(rejectedQuantity, 4);
    const previouslyProcessed = receipts
      .filter((entry) => entry.importId === record.id)
      .flatMap((entry) => entry.lines)
      .filter((entry) => entry.importItemId === line.importItemId)
      .reduce((sum, entry) => sum.plus(entry.quantityReceived).plus(entry.quantityRejected), new Decimal(0));
    if (previouslyProcessed.plus(receivedQuantity).plus(rejectedQuantity).gt(source.quantity)) {
      return fail(res, 422, `${line.productName}: total receipts and rejections exceed the imported quantity.`);
    }
    if (receivedQuantity.gt(0)) {
      if (!line.lotNumber?.trim() || !line.batchNumber?.trim() || !line.manufacturingDate || !line.expiryDate || !line.warehouse?.trim()) return fail(res, 422, `${source.productName}: lot, batch, manufacturing, expiry and warehouse are required for received stock.`);
      if (new Date(line.expiryDate) <= new Date(line.manufacturingDate)) return fail(res, 422, `${source.productName}: expiry must be after manufacturing date.`);
      const batchKey = line.batchNumber.trim().toLowerCase();
      if (payloadBatchNumbers.has(batchKey) || stockBatches.some((batch) => batch.batchNumber.trim().toLowerCase() === batchKey)) return fail(res, 409, `${source.productName}: batch number ${line.batchNumber} already exists.`);
      payloadBatchNumbers.add(batchKey);
    }
  }
  const postedLines = receipt.lines.map((line) => {
    const source = record.items.find((item) => item.id === line.importItemId)!;
    const result = record.snapshot!.products.find((product) => product.importItemId === line.importItemId);
    return {
      ...line,
      productId: source.productId,
      productName: source.productName,
      landedCostPerUnit: result?.finalPerUnitBdt ?? "0.00"
    };
  });
  const posted: WarehouseReceipt = { ...receipt, lines: postedLines, id: id("grn"), importId: record.id, reference: record.primaryReference, status: "Posted", receivedBy: user.name };
  receipts.unshift(posted);
  for (const line of posted.lines) {
    if (decimal(line.quantityReceived).eq(0)) continue;
    const item = record.items.find((entry) => entry.id === line.importItemId)!;
    const batch: StockBatch = { id: id("batch"), productId: line.productId, productCode: item.productCode, productName: line.productName, sourceImportId: record.id, sourceReference: record.primaryReference, sourceType: "Import Receipt", lotNumber: line.lotNumber, batchNumber: line.batchNumber, manufacturingDate: line.manufacturingDate, expiryDate: line.expiryDate, receivedDate: posted.receivedDate, quantityReceived: line.quantityReceived, quantityAvailable: line.quantityReceived, warehouse: line.warehouse, location: line.location, landedCostPerUnit: line.landedCostPerUnit };
    stockBatches.unshift(batch);
    stockMovements.unshift({ id: id("mov"), date: posted.receivedDate, productId: batch.productId, productName: batch.productName, batchId: batch.id, batchNumber: batch.batchNumber, type: "Receive", quantity: batch.quantityReceived, reference: record.primaryReference, createdBy: user.name });
  }
  const processedByItem = new Map<string, Decimal>();
  for (const existingReceipt of receipts.filter((entry) => entry.importId === record.id)) {
    for (const line of existingReceipt.lines) {
      processedByItem.set(
        line.importItemId,
        (processedByItem.get(line.importItemId) ?? new Decimal(0)).plus(line.quantityReceived).plus(line.quantityRejected)
      );
    }
  }
  const complete = record.items.every((item) => (processedByItem.get(item.id) ?? new Decimal(0)).gte(item.quantity));
  record.status = complete ? "Received" : "Partially Received";
  record.milestone = record.status;
  record.warehouseStatus = complete ? "Received" : "Partially Received";
  audit(req, "Warehouse receipt posted", "Import", record.id, `${posted.id} received ${posted.lines.length} product batch(es).`);
  res.status(201).json(ok(posted, "Warehouse receipt posted"));
});

app.get("/api/imports/:importId/receipts", (req, res) => {
  if (!requireArea(req, res, "imports")) return;
  const record = imports.find((item) => item.id === req.params.importId);
  if (!record) return fail(res, 404, "Import not found");
  const visible = receipts.filter((receipt) => receipt.importId === record.id).map((receipt) => {
    if (hasCapability(req, "view_sensitive_cost")) return receipt;
    return { ...receipt, lines: receipt.lines.map((line) => ({ ...line, landedCostPerUnit: "0.00" })) };
  });
  res.json(ok(visible, "Warehouse receipts loaded"));
});

app.get("/api/inventory/stock", (req, res) => {
  if (!requireArea(req, res, "inventory")) return;
  const grouped = products.map((product) => {
    const batches = stockBatches.filter((batch) => batch.productId === product.id && decimal(batch.quantityAvailable).gt(0));
    const available = batches.reduce((sum, batch) => sum.plus(batch.quantityAvailable), new Decimal(0));
    const oldest = [...batches].sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))[0];
    const nearest = [...batches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
    const valuation = batches.reduce((sum, batch) => sum.plus(decimal(batch.quantityAvailable).mul(batch.landedCostPerUnit)), new Decimal(0));
    return { productId: product.id, productCode: product.code, productName: product.name, imageUrl: product.imageUrl, availableQuantity: available.toFixed(0), oldestLot: oldest?.lotNumber ?? "-", nearestExpiry: nearest?.expiryDate ?? "-", standardSalePrice: product.standardSalePrice, inventoryValue: hasCapability(req, "view_sensitive_cost") ? money(valuation) : undefined };
  }).filter((row) => decimal(row.availableQuantity).gt(0));
  res.json(ok(grouped, "Stock summary loaded", { total: grouped.length }));
});
app.get("/api/inventory/batches", (req, res) => {
  if (!requireArea(req, res, "inventory")) return;
  res.json(ok(stockBatches.map((batch) => visibleBatch(batch, req)), "Batches loaded", { total: stockBatches.length }));
});
app.get("/api/inventory/movements", (req, res) => {
  if (!requireArea(req, res, "inventory")) return;
  res.json(ok(stockMovements, "Movements loaded", { total: stockMovements.length }));
});
app.post("/api/inventory/dispatch-preview", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  try {
    const preview = fifoAllocation(req.body.productId, req.body.quantity, req.body.date ?? businessDate(), req.body.batchId);
    res.json(ok(preview, "FIFO dispatch plan loaded"));
  } catch (error) {
    fail(res, 422, error instanceof Error ? error.message : "Stock cannot fulfill this dispatch.");
  }
});

app.get("/api/customers", (req, res) => {
  if (!requirePermission(req, res, "customers", "view")) return;
  const rows = customerScoped(req);
  res.json(ok(rows, "Customers loaded", { total: rows.length, scoped: rows.length !== customers.length }));
});
app.get("/api/customers/:customerId/ledger", (req, res) => {
  if (!requirePermission(req, res, "customers", "view")) return;
  if (!ownsCustomer(req, req.params.customerId)) return fail(res, 403, "This customer ledger is outside your assigned records.");
  const ledger = customerLedger(req.params.customerId);
  if (!ledger) return fail(res, 404, "Customer not found");
  res.json(ok(ledger, "Customer transaction ledger loaded"));
});
app.post("/api/customers", (req, res) => {
  const user = requirePermission(req, res, "customers", "create");
  if (!user) return;
  const customer = { ...req.body, id: id("cus"), assignedSalesUserId: user.role === "Sales Executive" ? user.id : req.body.assignedSalesUserId, currentDue: "0.00", totalSales: "0.00", totalCollected: "0.00", active: true };
  customers.unshift(customer);
  audit(req, "Customer created", "Customer", customer.id, `${customer.name} added.`);
  res.status(201).json(ok(customer, "Customer created"));
});
app.patch("/api/customers/:customerId", (req, res) => {
  const user = requirePermission(req, res, "customers", "edit");
  if (!user) return;
  const index = customers.findIndex((customer) => customer.id === req.params.customerId);
  if (index < 0) return fail(res, 404, "Customer not found");
  if (user.role === "Sales Executive" && customers[index].assignedSalesUserId !== user.id) return fail(res, 403, "You can edit only your assigned customers.");
  customers[index] = { ...customers[index], ...req.body, id: customers[index].id, assignedSalesUserId: user.role === "Sales Executive" ? user.id : req.body.assignedSalesUserId ?? customers[index].assignedSalesUserId, currentDue: customers[index].currentDue, totalSales: customers[index].totalSales, totalCollected: customers[index].totalCollected };
  audit(req, "Customer updated", "Customer", customers[index].id, `${customers[index].name} details updated.`);
  res.json(ok(customers[index], "Customer updated"));
});
app.delete("/api/customers/:customerId", (req, res) => {
  const user = requirePermission(req, res, "customers", "delete");
  if (!user) return;
  const index = customers.findIndex((customer) => customer.id === req.params.customerId);
  if (index < 0) return fail(res, 404, "Customer not found");
  const customer = customers[index];
  if (decimal(customer.currentDue).gt(0) || orders.some((order) => order.customerId === customer.id)) return fail(res, 409, "Customers with dues or sales history cannot be deleted; mark them inactive instead.");
  customers.splice(index, 1);
  audit(req, "Customer deleted", "Customer", customer.id, `${customer.name} removed before transactions.`);
  res.json(ok({ id: customer.id }, "Customer deleted"));
});

app.get("/api/quotations", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  res.json(ok(salesScoped(quotations, req), "Quotations loaded"));
});
app.post("/api/quotations", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  if (!ownsCustomer(req, req.body.customerId)) return fail(res, 403, "You can create quotations only for customers assigned to you.");
  const customer = customers.find((entry) => entry.id === req.body.customerId)!;
  const linkedLead = req.body.leadId ? marketingLeads.find((entry) => entry.id === req.body.leadId) : undefined;
  if (req.body.leadId && (!linkedLead || linkedLead.customerId !== customer.id || !canAccessMarketingEmployee(user, linkedLead.assignedUserId))) return fail(res, 422, "The selected lead must first be converted to this customer and remain inside your marketing scope.");
  let lines;
  try {
    lines = normalizeSalesLines(req.body.lines);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Quotation lines are invalid.");
  }
  const subtotal = lines.reduce((sum, line) => sum.plus(decimal(line.quantity).mul(line.unitPrice)), new Decimal(0));
  const discount = lines.reduce((sum, line) => sum.plus(line.discount), new Decimal(0));
  const now = new Date().toISOString();
  const quote: Quotation = { ...req.body, id: id("quo"), quotationNumber: nextReference("QT", quotations.length), customerId: customer.id, customerName: customer.name, customerAddressSnapshot: customer.address, customerPhoneSnapshot: customer.phone, customerContactSnapshot: customer.contactPerson, ownerId: user.role === "Sales Executive" ? user.id : req.body.ownerId ?? customer.assignedSalesUserId ?? user.id, createdByUserId: user.id, createdAt: now, lines, subtotal: money(subtotal), discountTotal: money(discount), total: money(subtotal.minus(discount)), status: "Draft" };
  quotations.unshift(quote);
  advanceLead(quote.leadId, "QUOTATION", now);
  audit(req, "Quotation created", "Quotation", quote.id, `${quote.quotationNumber} created for ${quote.customerName}.`);
  res.status(201).json(ok(quote, "Quotation created"));
});
app.patch("/api/quotations/:quoteId", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  const index = quotations.findIndex((quote) => quote.id === req.params.quoteId);
  if (index < 0) return fail(res, 404, "Quotation not found");
  if (user.role === "Sales Executive" && quotations[index].ownerId !== user.id) return fail(res, 403, "You can edit only your own quotations.");
  const nextCustomerId = req.body.customerId ?? quotations[index].customerId;
  if (!ownsCustomer(req, nextCustomerId)) return fail(res, 403, "The selected customer is outside your assigned records.");
  if (["Converted", "Rejected"].includes(quotations[index].status)) return fail(res, 423, "Finalized quotation is locked.");
  const customer = customers.find((entry) => entry.id === nextCustomerId)!;
  let lines;
  try {
    lines = normalizeSalesLines(req.body.lines ?? quotations[index].lines);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Quotation lines are invalid.");
  }
  const previousStatus = quotations[index].status;
  quotations[index] = { ...quotations[index], ...req.body, id: quotations[index].id, quotationNumber: quotations[index].quotationNumber, ownerId: quotations[index].ownerId, customerId: customer.id, customerName: customer.name, customerAddressSnapshot: customer.address, customerPhoneSnapshot: customer.phone, customerContactSnapshot: customer.contactPerson, lines };
  if (previousStatus === "Draft" && quotations[index].status !== "Draft" && !quotations[index].submittedAt) quotations[index].submittedAt = new Date().toISOString();
  const subtotal = lines.reduce((sum, line) => sum.plus(decimal(line.quantity).mul(line.unitPrice)), new Decimal(0));
  const discount = lines.reduce((sum, line) => sum.plus(line.discount), new Decimal(0));
  quotations[index].subtotal = money(subtotal);
  quotations[index].discountTotal = money(discount);
  quotations[index].total = money(subtotal.minus(discount));
  audit(req, "Quotation updated", "Quotation", quotations[index].id, `${quotations[index].quotationNumber} updated.`);
  res.json(ok(quotations[index], "Quotation updated"));
});
app.delete("/api/quotations/:quoteId", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  const index = quotations.findIndex((quote) => quote.id === req.params.quoteId);
  if (index < 0) return fail(res, 404, "Quotation not found");
  const quote = quotations[index];
  if (user.role === "Sales Executive" && quote.ownerId !== user.id) return fail(res, 403, "You can delete only your own quotations.");
  if (!["Draft", "Rejected"].includes(quote.status)) return fail(res, 409, "Only draft or rejected quotations can be deleted.");
  quotations.splice(index, 1);
  audit(req, "Quotation deleted", "Quotation", quote.id, `${quote.quotationNumber} removed before conversion.`);
  res.json(ok({ id: quote.id }, "Quotation deleted"));
});
app.post("/api/quotations/:quoteId/convert", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  const quote = quotations.find((item) => item.id === req.params.quoteId);
  if (!quote) return fail(res, 404, "Quotation not found");
  if (user.role === "Sales Executive" && quote.ownerId !== user.id) return fail(res, 403, "You can convert only your own quotation.");
  if (!ownsCustomer(req, quote.customerId)) return fail(res, 403, "The quotation customer is outside your assigned records.");
  if (quote.status === "Converted") return fail(res, 409, "Quotation has already been converted.");
  const now = new Date().toISOString();
  if (!quote.submittedAt) quote.submittedAt = now;
  quote.status = "Converted";
  const order: SalesOrder = { id: id("order"), orderNumber: nextReference("SO", orders.length), quotationId: quote.id, date: businessDate(), customerId: quote.customerId, customerName: quote.customerName, customerAddressSnapshot: quote.customerAddressSnapshot, customerPhoneSnapshot: quote.customerPhoneSnapshot, customerContactSnapshot: quote.customerContactSnapshot, ownerId: quote.ownerId, createdByUserId: user.id, createdAt: now, paymentConditions: quote.paymentTerms, deliveryInstruction: req.body?.deliveryInstruction ?? "Confirm with customer before dispatch", requestedDeliveryDate: req.body?.requestedDeliveryDate, orderReceivedByName: req.body?.orderReceivedByName, orderReceivedByDesignation: req.body?.orderReceivedByDesignation, orderGivenBy: req.body?.orderGivenBy, paymentConfirmation: req.body?.paymentConfirmation, paymentReference: req.body?.paymentReference, paymentDate: req.body?.paymentDate, headOfSalesSignoff: req.body?.headOfSalesSignoff, coeSignoff: req.body?.coeSignoff, mdSignoff: req.body?.mdSignoff, amountReceived: "0.00", due: "0.00", status: "Placed", lines: structuredClone(quote.lines), total: quote.total };
  orders.unshift(order);
  advanceLead(quote.leadId, "ORDER", now);
  audit(req, "Quotation converted", "SalesOrder", order.id, `${quote.quotationNumber} converted to ${order.orderNumber}.`);
  res.status(201).json(ok(order, "Quotation converted to order"));
});

app.get("/api/orders", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  res.json(ok(salesScoped(orders, req), "Orders loaded"));
});
app.get("/api/orders/:orderId/workspace", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  const order = orders.find((entry) => entry.id === req.params.orderId);
  if (!order) return fail(res, 404, "Sales order not found");
  if (!salesScoped([order], req).length) return fail(res, 403, "This order is outside your sales scope.");
  const owner = demoUsers.find((entry) => entry.id === order.ownerId);
  const workspace = buildSalesOrderWorkspace({ order,
    quotation: quotations.find((entry) => entry.id === order.quotationId),
    customer: hasEffectivePermission(user, "customers", "view") ? customers.find((entry) => entry.id === order.customerId) : undefined,
    salesperson: owner ? { id: owner.id, name: owner.name, title: owner.title, employeeCode: owner.employeeCode, territory: owner.territory } : undefined,
    deliveries, invoices, collections, stockMovements: hasEffectivePermission(user, "inventory", "view") ? stockMovements : []
  });
  res.json(ok(user.role === "Warehouse Manager" ? restrictWorkspaceFinancials(workspace) : workspace, "Order lifecycle loaded"));
});
app.get("/api/sales/references/:entityType/:entityId", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  const { entityType, entityId } = req.params;
  const orderId = entityType === "SalesOrder" ? entityId
    : entityType === "Delivery" ? deliveries.find((entry) => entry.id === entityId)?.orderId
    : entityType === "Challan" ? deliveries.find((entry) => entry.challanNumber === entityId)?.orderId
    : entityType === "SalesInvoice" ? invoices.find((entry) => entry.id === entityId)?.orderId
    : entityType === "Collection" ? (() => { const collection = collections.find((entry) => entry.id === entityId); return collection?.orderId ?? invoices.find((entry) => entry.id === collection?.invoiceId)?.orderId; })()
    : undefined;
  const order = orders.find((entry) => entry.id === orderId);
  if (!order) return res.json(ok(null, "No linked order"));
  if (!salesScoped([order], req).length) return fail(res, 403, "This reference is outside your sales scope.");
  res.json(ok({ id: order.id }, "Linked sales order resolved"));
});
app.patch("/api/orders/:orderId", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  const order = orders.find((entry) => entry.id === req.params.orderId);
  if (!order) return fail(res, 404, "Sales order not found");
  if (user.role === "Sales Executive" && order.ownerId !== user.id) return fail(res, 403, "You can update only your own order details.");
  const allowed = ["deliveryInstruction", "paymentConditions", "paymentConfirmation", "paymentReference", "paymentDate", "requestedDeliveryDate", "orderReceivedByName", "orderReceivedByDesignation", "orderGivenBy", "headOfSalesSignoff", "coeSignoff", "mdSignoff"] as const;
  for (const key of allowed) if (req.body[key] !== undefined) order[key] = String(req.body[key]);
  audit(req, "Order receiving details updated", "SalesOrder", order.id, `${order.orderNumber} office and payment details updated.`);
  res.json(ok(order, "Order receiving details updated"));
});

app.post("/api/sales/profit-preview", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  if (!hasCapability(req, "view_profit")) return fail(res, 403, "Profit and landed-cost preview is restricted to authorized ownership roles.");
  let lines;
  try {
    lines = normalizeSalesLines(req.body.lines);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Sales lines are invalid.");
  }
  try {
    const previewLines = lines.map((line) => {
      const plan = fifoAllocation(line.productId, line.quantity, businessDate());
      const expectedCogs = plan.allocations.reduce((sum, allocation) => {
        const batch = stockBatches.find((entry) => entry.id === allocation.batchId)!;
        return sum.plus(decimal(allocation.quantity).mul(batch.landedCostPerUnit));
      }, new Decimal(0));
      const quantity = decimal(line.quantity);
      const revenue = decimal(line.lineTotal);
      const effectiveUnitPrice = revenue.div(quantity);
      const expectedCostPerUnit = expectedCogs.div(quantity);
      const profit = revenue.minus(expectedCogs);
      const profitPerUnit = profit.div(quantity);
      return { productId: line.productId, productCode: line.productCode, productName: line.productName, quantity: line.quantity, proposedUnitPrice: line.unitPrice, effectiveUnitPrice: money(effectiveUnitPrice), expectedCostPerUnit: money(expectedCostPerUnit), grossProfitPerUnit: money(profitPerUnit), grossProfitTotal: money(profit), marginPercent: precise(revenue.eq(0) ? 0 : profit.div(revenue).mul(100), 2), stockCoverage: line.quantity, isLoss: profit.lt(0) };
    });
    const revenue = previewLines.reduce((sum, line) => sum.plus(decimal(line.effectiveUnitPrice).mul(line.quantity)), new Decimal(0));
    const expectedCogs = previewLines.reduce((sum, line) => sum.plus(decimal(line.expectedCostPerUnit).mul(line.quantity)), new Decimal(0));
    const grossProfit = revenue.minus(expectedCogs);
    const result: ProfitPreview = { lines: previewLines, revenue: money(revenue), expectedCogs: money(expectedCogs), grossProfit: money(grossProfit), marginPercent: precise(revenue.eq(0) ? 0 : grossProfit.div(revenue).mul(100), 2) };
    res.json(ok(result, "Owner-only FIFO cost and profit preview calculated"));
  } catch (error) {
    fail(res, 422, error instanceof Error ? error.message : "Profit preview could not be calculated.");
  }
});
app.get("/api/deliveries", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  const visibleOrders = new Set(salesScoped(orders, req).map((order) => order.id));
  res.json(ok(userFor(req)?.role === "Sales Executive" ? deliveries.filter((delivery) => visibleOrders.has(delivery.orderId)) : deliveries, "Deliveries loaded"));
});
app.post("/api/deliveries", (req, res) => {
  const user = requireArea(req, res, "sales", "post");
  if (!user) return;
  const payload = req.body as Delivery;
  const order = orders.find((item) => item.id === payload.orderId);
  if (!order) return fail(res, 404, "Sales order not found");
  if (!salesScoped([order], req).length) return fail(res, 403, "You can dispatch only your own orders.");
  if (order.status === "Cancelled") return fail(res, 409, "A cancelled order cannot be dispatched.");
  const requestedProducts = (payload.lines ?? []).map((line) => line.productId);
  if (new Set(requestedProducts).size !== requestedProducts.length) return fail(res, 422, "Enter each product only once per delivery.");
  let usedOverride = false;
  const plannedLines: Delivery["lines"] = [];
  for (const requested of payload.lines ?? []) {
    if (decimal(requested.quantity).lte(0)) return fail(res, 422, `${requested.productName}: delivery quantity must be greater than zero.`);
    const ordered = order.lines.find((entry) => entry.productId === requested.productId);
    if (!ordered) return fail(res, 422, `${requested.productName}: product is not on the selected order.`);
    const alreadyDelivered = deliveries
      .filter((delivery) => delivery.orderId === order.id && delivery.status !== "Draft")
      .flatMap((delivery) => delivery.lines)
      .filter((entry) => entry.productId === requested.productId)
      .reduce((sum, entry) => sum.plus(entry.quantity), new Decimal(0));
    if (alreadyDelivered.plus(requested.quantity).gt(ordered.quantity)) return fail(res, 422, `${requested.productName}: delivery exceeds the remaining ordered quantity.`);
    let plan;
    try {
      plan = fifoAllocation(requested.productId, requested.quantity, payload.date, requested.batchId);
    } catch (error) {
      return fail(res, 422, error instanceof Error ? `${requested.productName}: ${error.message}` : `${requested.productName}: stock allocation failed.`);
    }
    if (plan.requiresOverride) {
      if (!hasCapability(req, "approve_stock_override") || !payload.overrideReason?.trim()) return fail(res, 409, plan.warning ?? "Authorized FIFO override and reason are required.");
      usedOverride = true;
    }
    const discountPerUnit = decimal(ordered.discount).div(ordered.quantity);
    for (const allocation of plan.allocations) {
      const allocatedDiscount = discountPerUnit.mul(allocation.quantity);
      plannedLines.push({ ...ordered, id: id("delivery-line"), quantity: allocation.quantity, discount: money(allocatedDiscount), lineTotal: money(decimal(allocation.quantity).mul(ordered.unitPrice).minus(allocatedDiscount)), batchId: allocation.batchId, batchNumber: allocation.batchNumber });
    }
  }
  if (!plannedLines.length) return fail(res, 422, "Enter at least one delivery quantity.");
  const postedAt = new Date().toISOString();
  const delivery: Delivery = { ...payload, lines: plannedLines, id: id("delivery"), challanNumber: nextReference("DC", deliveries.length), status: "Dispatched", customerId: order.customerId, customerName: order.customerName, salesOwnerId: order.ownerId, dispatchedByUserId: user.id, postedAt };
  deliveries.unshift(delivery);
  for (const line of delivery.lines) {
    const batch = stockBatches.find((entry) => entry.id === line.batchId)!;
    batch.quantityAvailable = money(decimal(batch.quantityAvailable).minus(line.quantity));
    stockMovements.unshift({ id: id("mov"), date: delivery.date, productId: line.productId, productName: line.productName, batchId: batch.id, batchNumber: batch.batchNumber, type: "Dispatch", quantity: line.quantity, reference: delivery.challanNumber, reason: usedOverride ? delivery.overrideReason : undefined, createdBy: user.name });
  }
  const deliveredByProduct = new Map<string, Decimal>();
  for (const postedDelivery of deliveries.filter((entry) => entry.orderId === order.id)) {
    for (const line of postedDelivery.lines) deliveredByProduct.set(line.productId, (deliveredByProduct.get(line.productId) ?? new Decimal(0)).plus(line.quantity));
  }
  order.status = order.lines.every((line) => (deliveredByProduct.get(line.productId) ?? new Decimal(0)).gte(line.quantity)) ? "Delivered" : "Partially Delivered";
  advanceLead(leadIdForOrder(order), "DELIVERED", postedAt);
  if (usedOverride) audit(req, "FIFO overridden", "Delivery", delivery.id, `${delivery.challanNumber} used a newer batch.`, delivery.overrideReason);
  audit(req, "Delivery dispatched", "Delivery", delivery.id, `${delivery.challanNumber} posted and stock reduced.`);
  res.status(201).json(ok(delivery, "Delivery dispatched"));
});

app.get("/api/invoices", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  res.json(ok(salesScoped(invoices, req), "Sales invoices loaded"));
});
app.post("/api/invoices", (req, res) => {
  const user = requireArea(req, res, "sales");
  if (!user) return;
  const deliveryIds: string[] = Array.isArray(req.body.deliveryIds)
    ? [...new Set((req.body.deliveryIds as unknown[]).map((value) => String(value)))]
    : [];
  if (!deliveryIds.length) return fail(res, 422, "Select at least one posted delivery challan.");
  const selectedDeliveries = deliveryIds.map((deliveryId) => deliveries.find((entry) => entry.id === deliveryId));
  if (selectedDeliveries.some((delivery) => !delivery)) return fail(res, 404, "One or more selected deliveries were not found.");
  const first = selectedDeliveries[0]!;
  if (selectedDeliveries.some((delivery) => delivery!.customerId !== first.customerId || delivery!.orderId !== first.orderId)) return fail(res, 422, "One invoice can include only deliveries from the same order and customer.");
  const order = orders.find((entry) => entry.id === first.orderId);
  if (!order) return fail(res, 404, "The selected delivery order was not found.");
  if (selectedDeliveries.some((delivery) => delivery!.status === "Draft")) return fail(res, 422, "Only posted delivery challans can be invoiced.");
  if (user.role === "Sales Executive" && order.ownerId !== user.id) return fail(res, 403, "You can invoice only your own deliveries.");
  const alreadyInvoiced = invoices.find((invoice) => invoice.status !== "Cancelled" && deliveryIds.some((deliveryId) => invoice.deliveryIds.includes(deliveryId)));
  if (alreadyInvoiced) return fail(res, 409, `${alreadyInvoiced.invoiceNumber} already includes one of the selected challans.`);
  const lines = selectedDeliveries.flatMap((delivery) => delivery!.lines.map((line) => ({ id: id("invoice-line"), productId: line.productId, productCode: line.productCode, productName: line.productName, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, lineTotal: line.lineTotal })));
  const subtotal = lines.reduce((sum, line) => sum.plus(decimal(line.quantity).mul(line.unitPrice)), new Decimal(0));
  const discountTotal = lines.reduce((sum, line) => sum.plus(line.discount), new Decimal(0));
  const customer = customers.find((entry) => entry.id === first.customerId)!;
  const invoice: SalesInvoice = {
    id: id("invoice"),
    invoiceNumber: `INV-2026-${String(invoices.length + 1).padStart(4, "0")}`,
    orderId: order.id,
    deliveryIds,
    customerId: customer.id,
    customerName: customer.name,
    customerAddressSnapshot: customer.address,
    customerPhoneSnapshot: customer.phone,
    customerContactSnapshot: customer.contactPerson,
    ownerId: order.ownerId,
    date: String(req.body.date || businessDate()),
    createdAt: new Date().toISOString(),
    lines,
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    total: money(subtotal.minus(discountTotal)),
    status: "Draft",
    remarks: String(req.body.remarks ?? "").trim() || undefined
  };
  invoices.unshift(invoice);
  audit(req, "Invoice created", "SalesInvoice", invoice.id, `${invoice.invoiceNumber} created from ${deliveryIds.length} delivery challan(s).`);
  res.status(201).json(ok(invoice, "Draft invoice created from delivered quantities"));
});
app.patch("/api/invoices/:invoiceId", (req, res) => {
  const user = requireArea(req, res, "sales", "edit");
  if (!user) return;
  const invoice = invoices.find((entry) => entry.id === req.params.invoiceId);
  if (!invoice) return fail(res, 404, "Sales invoice not found");
  if (invoice.status !== "Draft") return fail(res, 423, "Only a draft invoice can be edited.");
  if (user.role === "Sales Executive" && invoice.ownerId !== user.id) return fail(res, 403, "You can edit only your own draft invoice.");
  if (req.body.date) invoice.date = String(req.body.date);
  if (req.body.remarks !== undefined) invoice.remarks = String(req.body.remarks).trim() || undefined;
  audit(req, "Invoice updated", "SalesInvoice", invoice.id, `${invoice.invoiceNumber} draft details updated.`);
  res.json(ok(invoice, "Draft invoice updated"));
});
app.post("/api/invoices/:invoiceId/approve", (req, res) => {
  const user = requireArea(req, res, "sales", "approve");
  if (!user) return;
  const invoice = invoices.find((entry) => entry.id === req.params.invoiceId);
  if (!invoice) return fail(res, 404, "Sales invoice not found");
  if (invoice.status !== "Draft") return fail(res, 409, "Only a draft invoice can be approved.");
  if (!salesScoped([invoice], req).length) return fail(res, 403, "This invoice is outside your sales scope.");
  const customer = customers.find((entry) => entry.id === invoice.customerId);
  if (!customer) return fail(res, 404, "Invoice customer not found");
  invoice.status = "Approved";
  invoice.approvedAt = new Date().toISOString();
  invoice.approvedByUserId = user.id;
  customer.currentDue = money(decimal(customer.currentDue).plus(invoice.total));
  customer.totalSales = money(decimal(customer.totalSales).plus(invoice.total));
  const order = invoice.orderId ? orders.find((entry) => entry.id === invoice.orderId) : undefined;
  if (order) order.due = money(decimal(order.due).plus(invoice.total));
  audit(req, "Invoice approved", "SalesInvoice", invoice.id, `${invoice.invoiceNumber}: Tk ${invoice.total} posted to ${customer.name}.`);
  res.json(ok(invoice, "Invoice approved and customer receivable posted"));
});
app.post("/api/invoices/:invoiceId/cancel", (req, res) => {
  const user = requireArea(req, res, "sales", "approve");
  if (!user) return;
  const invoice = invoices.find((entry) => entry.id === req.params.invoiceId);
  if (!invoice) return fail(res, 404, "Sales invoice not found");
  if (invoice.status === "Cancelled") return fail(res, 409, "Invoice is already cancelled.");
  if (!salesScoped([invoice], req).length) return fail(res, 403, "This invoice is outside your sales scope.");
  const reason = String(req.body.reason ?? "").trim();
  if (reason.length < 5) return fail(res, 422, "Enter a clear cancellation reason.");
  if (collections.some((collection) => collection.invoiceId === invoice.id && collection.status === "Posted")) return fail(res, 409, "Reverse the linked collection before cancelling this invoice.");
  if (invoice.status === "Approved") {
    const customer = customers.find((entry) => entry.id === invoice.customerId);
    if (customer) {
      customer.currentDue = money(Decimal.max(0, decimal(customer.currentDue).minus(invoice.total)));
      customer.totalSales = money(Decimal.max(0, decimal(customer.totalSales).minus(invoice.total)));
    }
    const order = invoice.orderId ? orders.find((entry) => entry.id === invoice.orderId) : undefined;
    if (order) order.due = money(Decimal.max(0, decimal(order.due).minus(invoice.total)));
  }
  invoice.status = "Cancelled";
  invoice.cancellationReason = reason;
  audit(req, "Invoice cancelled", "SalesInvoice", invoice.id, `${invoice.invoiceNumber} reversed.`, reason);
  res.json(ok(invoice, "Invoice cancelled with receivable reversal"));
});

app.get("/api/collections", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  res.json(ok(salesScoped(collections, req), "Collections loaded"));
});
app.get("/api/payment-accounts", (req, res) => {
  if (!requireArea(req, res, "sales")) return;
  res.json(ok(accounts.filter((account) => account.active).map((account) => ({ ...account, balance: "Restricted" })), "Payment accounts loaded"));
});
app.post("/api/collections", (req, res) => {
  const user = requireArea(req, res, "sales", "post");
  if (!user) return;
  const customer = customers.find((entry) => entry.id === req.body.customerId);
  if (!customer) return fail(res, 404, "Customer not found");
  if (!ownsCustomer(req, customer.id)) return fail(res, 403, "You can post collections only for customers assigned to you.");
  const allowedModes: Collection["paymentMode"][] = ["Cash", "bKash", "Bank Transfer", "Cheque"];
  if (!allowedModes.includes(req.body.paymentMode)) return fail(res, 422, "Credit is an outstanding sales condition, not a payment collection. Select an actual received-payment mode.");
  const account = accounts.find((entry) => entry.id === req.body.accountId && entry.active);
  if (!account) return fail(res, 422, "Select a valid active cash, bank or mobile-banking destination account.");
  const linkedInvoice = req.body.invoiceId ? invoices.find((entry) => entry.id === req.body.invoiceId) : undefined;
  if (req.body.invoiceId && (!linkedInvoice || linkedInvoice.customerId !== customer.id || linkedInvoice.status !== "Approved")) return fail(res, 422, "Select an approved invoice belonging to this customer.");
  const resolvedOrderId = req.body.orderId || linkedInvoice?.orderId;
  const linkedOrder = resolvedOrderId ? orders.find((entry) => entry.id === resolvedOrderId) : undefined;
  if (resolvedOrderId && (!linkedOrder || linkedOrder.customerId !== customer.id)) return fail(res, 422, "The selected order does not belong to this customer.");
  if (linkedInvoice?.orderId && linkedOrder && linkedInvoice.orderId !== linkedOrder.id) return fail(res, 422, "The selected invoice and order do not match.");
  if (user.role === "Sales Executive" && linkedOrder && linkedOrder.ownerId !== user.id) return fail(res, 403, "You cannot collect against another sales executive's order.");
  if (user.role === "Sales Executive" && linkedInvoice && linkedInvoice.ownerId !== user.id) return fail(res, 403, "You cannot collect against another sales executive's invoice.");
  let amount: Decimal;
  try {
    amount = requiredDecimal(req.body.amount, "Collection amount");
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Collection amount is invalid.");
  }
  if (req.body.paymentMode !== "Cash" && !String(req.body.referenceNumber ?? "").trim()) return fail(res, 422, "Enter the bank, mobile-banking or cheque reference for this collection.");
  if (amount.gt(customer.currentDue)) return fail(res, 422, "Collection cannot exceed the customer's current due.");
  if (linkedInvoice) {
    const invoiceCollected = collections.filter((entry) => entry.invoiceId === linkedInvoice.id && entry.status === "Posted").reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    if (amount.gt(decimal(linkedInvoice.total).minus(invoiceCollected))) return fail(res, 422, "Collection cannot exceed the selected invoice's outstanding amount.");
  }
  if (linkedOrder && amount.gt(linkedOrder.due)) return fail(res, 422, "Collection cannot exceed the selected order's due amount.");
  const postedAt = new Date().toISOString();
  const collection: Collection = { ...req.body, amount: money(amount), customerName: customer.name, accountId: account.id, id: id("collection"), receiptNumber: nextReference("MR", collections.length), ownerId: user.role === "Sales Executive" ? user.id : linkedInvoice?.ownerId ?? linkedOrder?.ownerId ?? customer.assignedSalesUserId ?? req.body.ownerId ?? user.id, postedByUserId: user.id, postedAt, status: "Posted" };
  collections.unshift(collection);
  collection.orderId = linkedOrder?.id;
  customer.currentDue = money(decimal(customer.currentDue).minus(amount));
  customer.totalCollected = money(decimal(customer.totalCollected).plus(amount));
  account.balance = money(decimal(account.balance).plus(amount));
  accountTransactions.unshift({ id: id("trx"), date: collection.date, accountId: account.id, accountName: account.name, direction: "In", amount: collection.amount, sourceType: "Collection", sourceId: collection.id, description: `${customer.name} collection` });
  if (linkedOrder) {
    linkedOrder.amountReceived = money(decimal(linkedOrder.amountReceived).plus(amount));
    linkedOrder.due = money(Decimal.max(0, decimal(linkedOrder.due).minus(amount)));
    advanceLead(leadIdForOrder(linkedOrder), "PAYMENT", postedAt);
  }
  audit(req, "Collection posted", "Collection", collection.id, `${collection.receiptNumber}: Tk ${collection.amount} from ${customer.name}.`);
  res.status(201).json(ok(collection, "Collection posted and customer due updated"));
});

app.get("/api/expenses", (req, res) => {
  if (!requireArea(req, res, "accounts")) return;
  res.json(ok(expenses, "Expenses loaded"));
});
app.post("/api/expenses", (req, res) => {
  const user = requireArea(req, res, "accounts", "post");
  if (!user) return;
  let amount: Decimal;
  try {
    if (req.body.subtype === "TA/DA") {
      req.body.expenseFor = "Employee";
      const ta = requiredDecimal(req.body.taAmount ?? "0", "TA amount", { allowZero: true });
      const da = requiredDecimal(req.body.daAmount ?? "0", "DA amount", { allowZero: true });
      amount = ta.plus(da);
      if (amount.lte(0)) return fail(res, 422, "TA and DA cannot both be zero.");
      req.body.taAmount = money(ta);
      req.body.daAmount = money(da);
    } else {
      amount = requiredDecimal(req.body.amount, "Expense amount");
    }
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Expense amount is invalid.");
  }
  const category = expenseCategories.find((entry) => entry.id === req.body.categoryId);
  if (!category?.active) return fail(res, 422, "Select a valid active expense category.");
  const account = accounts.find((entry) => entry.id === req.body.paidFromAccountId && entry.active);
  if (!account || decimal(account.balance).lt(amount)) return fail(res, 422, "Selected account has insufficient balance.");
  const expenseFor = String(req.body.expenseFor ?? "Company / General") as Expense["expenseFor"];
  const validExpenseFor: Expense["expenseFor"][] = ["Employee", "Office", "Warehouse", "Company / General"];
  if (!validExpenseFor.includes(expenseFor)) return fail(res, 422, "Select who or which operating unit the expense is for.");
  const employee = expenseFor === "Employee" ? demoUsers.find((entry) => entry.id === req.body.employeeId && entry.status === "Active") : undefined;
  if (expenseFor === "Employee" && !employee) return fail(res, 422, "Select an active employee from the employee directory.");
  const attribution = expenseFor === "Employee"
    ? { expenseForId: employee!.id, expenseForName: employee!.name, employeeId: employee!.id, employee: employee!.name, employeeCode: employee!.employeeCode ?? employee!.id.toUpperCase(), designation: employee!.title, department: employee!.department }
    : expenseFor === "Office"
      ? { expenseForId: "head-office", expenseForName: "Head Office" }
      : expenseFor === "Warehouse"
        ? { expenseForId: warehouseConfig.id, expenseForName: warehouseConfig.name }
        : { expenseForId: "company", expenseForName: "MIPRO HealthCare Corporation" };
  const { attachmentUpload, ...expensePayload } = req.body as Record<string, unknown> & { attachmentUpload?: DocumentUpload };
  const expense: Expense = { ...(expensePayload as unknown as Expense), ...attribution, amount: money(amount), id: id("expense"), categoryName: category.name, expenseFor, enteredByUserId: user.id, enteredByName: user.name, status: "Posted" };
  if (attachmentUpload) {
    try {
      expense.attachment = uploadedDocument(req, attachmentUpload, "expense", expense.id, "Expense Receipt", false);
      expense.attachmentName = expense.attachment.fileName;
    } catch (error) {
      return fail(res, 422, error instanceof Error ? error.message : "Expense attachment is invalid.");
    }
  }
  expenses.unshift(expense);
  account.balance = money(decimal(account.balance).minus(amount));
  accountTransactions.unshift({ id: id("trx"), date: expense.date, accountId: account.id, accountName: account.name, direction: "Out", amount: expense.amount, sourceType: "Expense", sourceId: expense.id, description: expense.remarks });
  audit(req, "Expense posted", "Expense", expense.id, `${expense.categoryName}: Tk ${expense.amount}.`);
  res.status(201).json(ok(expense, "Expense posted; landed cost remains unchanged"));
});
app.post("/api/expenses/:expenseId/reverse", (req, res) => {
  const user = requireArea(req, res, "accounts", "post");
  if (!user) return;
  const expense = expenses.find((entry) => entry.id === req.params.expenseId);
  if (!expense) return fail(res, 404, "Expense not found");
  if (expense.status === "Reversed") return fail(res, 409, "Expense is already reversed.");
  const reason = String(req.body?.reason ?? "").trim();
  if (reason.length < 5) return fail(res, 422, "Enter a clear reversal reason.");
  const account = accounts.find((entry) => entry.id === expense.paidFromAccountId);
  if (account) {
    account.balance = money(decimal(account.balance).plus(expense.amount));
    accountTransactions.unshift({ id: id("trx"), date: businessDate(), accountId: account.id, accountName: account.name, direction: "In", amount: expense.amount, sourceType: "Expense", sourceId: expense.id, description: `Reversal: ${reason}` });
  }
  expense.status = "Reversed";
  audit(req, "Expense reversed", "Expense", expense.id, `${expense.categoryName}: Tk ${expense.amount} returned to ${account?.name ?? "source account"}.`, reason);
  res.json(ok(expense, "Expense reversed and account balance restored"));
});
app.get("/api/expense-categories", (req, res) => {
  if (!requireArea(req, res, "accounts")) return;
  res.json(ok(expenseCategories, "Expense categories loaded"));
});
app.post("/api/expense-categories", (req, res) => {
  if (!requirePermission(req, res, "settings", "create")) return;
  const category = { id: id("ec"), name: String(req.body.name), active: true };
  expenseCategories.push(category);
  res.status(201).json(ok(category, "Expense category created"));
});
app.get("/api/accounts", (req, res) => {
  if (!requireArea(req, res, "accounts")) return;
  res.json(ok(accounts, "Cash and bank accounts loaded"));
});
app.get("/api/account-transactions", (req, res) => {
  if (!requireArea(req, res, "accounts")) return;
  res.json(ok(accountTransactions, "Account transactions loaded"));
});
app.post("/api/account-transactions", (req, res) => {
  const user = requireArea(req, res, "accounts", "post");
  if (!user) return;
  const sourceType = String(req.body.sourceType) as AccountTransaction["sourceType"];
  if (!["Advance", "Company Loan", "Manual Authorized"].includes(sourceType)) return fail(res, 422, "Select Advance, Company Loan or Manual Authorized transaction.");
  const direction = String(req.body.direction) as AccountTransaction["direction"];
  if (!["In", "Out"].includes(direction)) return fail(res, 422, "Select cash/bank direction.");
  const account = accounts.find((entry) => entry.id === req.body.accountId && entry.active);
  if (!account) return fail(res, 422, "Select a valid active cash or bank account.");
  let amount: Decimal;
  try { amount = requiredDecimal(req.body.amount, "Transaction amount"); } catch (error) { return fail(res, 422, error instanceof Error ? error.message : "Transaction amount is invalid."); }
  if (direction === "Out" && decimal(account.balance).lt(amount)) return fail(res, 422, "Selected account has insufficient balance.");
  const partyName = String(req.body.partyName ?? "").trim();
  const description = String(req.body.description ?? "").trim();
  if (!partyName || !description) return fail(res, 422, "Party and purpose are required.");
  const voucherPrefix = direction === "Out" ? "DV" : "CV";
  const voucherCount = accountTransactions.filter((entry) => entry.direction === direction && entry.voucherNumber).length;
  const transaction: AccountTransaction = { id: id("trx"), date: String(req.body.date || businessDate()), accountId: account.id, accountName: account.name, direction, amount: money(amount), sourceType, sourceId: id(sourceType === "Advance" ? "advance" : sourceType === "Company Loan" ? "loan" : "manual"), description, partyId: req.body.partyId ? String(req.body.partyId) : undefined, partyName, reference: String(req.body.reference ?? "").trim() || undefined, remarks: String(req.body.remarks ?? "").trim() || undefined, voucherNumber: `${voucherPrefix}-2026-${String(voucherCount + 1).padStart(4, "0")}`, createdByUserId: user.id, createdByName: user.name };
  accountTransactions.unshift(transaction);
  account.balance = money(direction === "In" ? decimal(account.balance).plus(amount) : decimal(account.balance).minus(amount));
  audit(req, `${sourceType} posted`, "AccountTransaction", transaction.id, `${transaction.voucherNumber}: Tk ${transaction.amount} ${direction === "In" ? "received from" : "paid to"} ${partyName}.`);
  res.status(201).json(ok(transaction, `${sourceType} transaction posted`));
});

app.get("/api/supplier-settlements", (req, res) => {
  if (!requireArea(req, res, "accounts")) return;
  res.json(ok(supplierSettlements, "Supplier settlement ledger loaded"));
});
app.get("/api/accounts/suppliers", (req, res) => {
  if (!requireArea(req, res, "accounts")) return;
  res.json(ok(suppliers.filter((entry) => entry.active), "Active suppliers loaded for settlement posting"));
});

app.post("/api/supplier-settlements", (req, res) => {
  const user = requireArea(req, res, "accounts", "post");
  if (!user) return;
  const supplier = suppliers.find((entry) => entry.id === req.body.supplierId && entry.active);
  if (!supplier) return fail(res, 422, "Select an active supplier.");
  const entryType = String(req.body.entryType) as SupplierSettlement["entryType"];
  if (!['Obligation', 'Payment'].includes(entryType)) return fail(res, 422, "Select Obligation or Payment.");
  let amount: Decimal;
  try { amount = requiredDecimal(req.body.amount, "Settlement amount"); } catch (error) { return fail(res, 422, error instanceof Error ? error.message : "Settlement amount is invalid."); }
  const account = entryType === "Payment" ? accounts.find((entry) => entry.id === req.body.accountId && entry.active) : undefined;
  if (entryType === "Payment" && !account) return fail(res, 422, "Select the payment account.");
  if (account && decimal(account.balance).lt(amount)) return fail(res, 422, "Selected account has insufficient balance.");
  const settlement: SupplierSettlement = { id: id("sst"), date: String(req.body.date || businessDate()), supplierId: supplier.id, supplierName: supplier.name, importId: req.body.importId ? String(req.body.importId) : undefined, reference: String(req.body.reference ?? "").trim(), entryType, amount: money(amount), accountId: account?.id, accountName: account?.name, paymentReference: String(req.body.paymentReference ?? "").trim() || undefined, notes: String(req.body.notes ?? "").trim() || undefined, status: "Posted", createdByUserId: user.id, createdByName: user.name, createdAt: new Date().toISOString() };
  if (!settlement.reference) return fail(res, 422, "Import, PO or settlement reference is required.");
  supplierSettlements.unshift(settlement);
  if (account) {
    account.balance = money(decimal(account.balance).minus(amount));
    accountTransactions.unshift({ id: id("trx"), date: settlement.date, accountId: account.id, accountName: account.name, direction: "Out", amount: settlement.amount, sourceType: "Import Cost", sourceId: settlement.id, description: `Supplier payment: ${supplier.name}`, partyId: supplier.id, partyName: supplier.name, reference: settlement.paymentReference ?? settlement.reference, createdByUserId: user.id, createdByName: user.name });
  }
  audit(req, `Supplier ${entryType.toLowerCase()} posted`, "SupplierSettlement", settlement.id, `${supplier.name}: Tk ${settlement.amount} against ${settlement.reference}.`);
  res.status(201).json(ok(settlement, `Supplier ${entryType.toLowerCase()} posted`));
});

app.get("/api/financial-position", (req, res) => {
  const user = requireArea(req, res, "accounts");
  if (!user || !userHasCapability(user, "view_financial_position")) return user ? fail(res, 403, "Financial position access is required.") : undefined;
  res.json(ok(financialPositionEntries, "Controlled financial-position entries loaded"));
});

app.post("/api/financial-position", (req, res) => {
  const user = requireArea(req, res, "accounts", "post");
  if (!user || !userHasCapability(user, "view_financial_position")) return user ? fail(res, 403, "Financial position access is required.") : undefined;
  const categories: FinancialPositionEntry["category"][] = ["Owner Capital", "Fixed Assets", "Accumulated Depreciation", "Statutory Payables", "Other Receivables", "Other Payables", "Opening Retained Earnings"];
  const category = String(req.body.category) as FinancialPositionEntry["category"];
  if (!categories.includes(category)) return fail(res, 422, "Select a supported financial-position category.");
  let amount: Decimal;
  try { amount = requiredDecimal(req.body.amount, "Position amount"); } catch (error) { return fail(res, 422, error instanceof Error ? error.message : "Position amount is invalid."); }
  const entry: FinancialPositionEntry = { id: id("fpe"), asOfDate: String(req.body.asOfDate || businessDate()), category, label: String(req.body.label ?? "").trim(), amount: money(amount), reference: String(req.body.reference ?? "").trim(), notes: String(req.body.notes ?? "").trim() || undefined, status: "Posted", createdByUserId: user.id, createdByName: user.name, createdAt: new Date().toISOString() };
  if (!entry.label || !entry.reference) return fail(res, 422, "Label and source reference are required.");
  financialPositionEntries.unshift(entry);
  audit(req, "Financial position entry posted", "FinancialPosition", entry.id, `${entry.category}: ${entry.label}, Tk ${entry.amount}.`);
  res.status(201).json(ok(entry, "Financial-position entry posted"));
});

app.get("/api/reports/salespeople", (req, res) => {
  const user = requireArea(req, res, "reports");
  if (!user) return;
  let period: { from: string; to: string };
  try {
    period = reportPeriod(req);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Report period is invalid.");
  }
  const employees = salesEmployeesFor(req);
  const requested = String(req.query.employeeId ?? "all");
  if (user.role === "Sales Executive" && !["all", "self", user.id].includes(requested)) return fail(res, 403, "Sales Executives can open only their own performance report.");
  const selectedEmployeeId = user.role === "Sales Executive" ? user.id : requested;
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  if (selectedEmployeeId !== "all" && !selectedEmployee) return fail(res, 403, "The selected employee is outside your report scope.");
  const details = employees.map((employee) => salespersonPerformance(employee, period.from, period.to));
  res.json(ok({
    period,
    selectedEmployeeId,
    employees,
    comparison: details.map((detail) => ({ ...detail.employee, ...detail.summary })),
    selected: selectedEmployee ? details.find((detail) => detail.employee.id === selectedEmployee.id) : undefined
  }, selectedEmployee ? `${selectedEmployee.name} performance loaded` : "Sales team comparison loaded"));
});

app.get("/api/reports/export-authorization", (req, res) => {
  if (!requireArea(req, res, "reports", "export")) return;
  res.json(ok({ authorized: true as const }, "Report export authorized"));
});

app.get("/api/reports", (req, res) => {
  const user = requireArea(req, res, "reports");
  if (!user) return;
  let from: string;
  let to: string;
  try {
    ({ from, to } = reportPeriod(req));
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Report period is invalid.");
  }
  const requestedEmployeeId = String(req.query.employeeId ?? "all");
  const permittedSalesEmployees = salesEmployeesFor(req);
  if (user.role === "Sales Executive" && !["all", "self", user.id].includes(requestedEmployeeId)) return fail(res, 403, "Sales Executives can open only their own report scope.");
  const scopedSalesId = user.role === "Sales Executive" ? user.id : requestedEmployeeId !== "all" && requestedEmployeeId !== "self" ? requestedEmployeeId : undefined;
  if (scopedSalesId && !permittedSalesEmployees.some((employee) => employee.id === scopedSalesId)) return fail(res, 403, "The selected employee is outside your report scope.");
  const reportCustomers = scopedSalesId ? customers.filter((customer) => customer.assignedSalesUserId === scopedSalesId) : customers;
  const landed = imports.filter((record) => record.snapshot && inPeriod(record.snapshot.finalizedAt.slice(0, 10), from, to));
  const importCost = landed.reduce((sum, record) => sum.plus(record.snapshot?.totalShipmentCostBdt ?? 0), new Decimal(0));
  const inventoryUnits = stockBatches.reduce((sum, batch) => sum.plus(batch.quantityAvailable), new Decimal(0));
  const periodDeliveries = deliveries.filter((delivery) => inPeriod(delivery.date, from, to) && (!scopedSalesId || salesOwnerForDelivery(delivery) === scopedSalesId));
  const periodInvoices = invoices.filter((invoice) => invoice.status === "Approved" && inPeriod(invoice.date, from, to) && (!scopedSalesId || invoice.ownerId === scopedSalesId));
  const periodCollections = collections.filter((collection) => collection.status === "Posted" && inPeriod(collection.date, from, to) && (!scopedSalesId || collection.ownerId === scopedSalesId));
  const periodExpenses = expenses.filter((expense) => expense.status === "Posted" && inPeriod(expense.date, from, to));
  const periodAccountTransactions = accountTransactions.filter((transaction) => inPeriod(transaction.date, from, to));
  const salesTotal = periodInvoices.reduce((sum, invoice) => sum.plus(invoice.total), new Decimal(0));
  const collectionTotal = periodCollections.reduce((sum, collection) => sum.plus(collection.amount), new Decimal(0));
  const expenseTotal = periodExpenses.reduce((sum, expense) => sum.plus(expense.amount), new Decimal(0));
  const realized = periodDeliveries.flatMap((delivery) => delivery.lines).reduce((totals, line) => {
    const batch = stockBatches.find((entry) => entry.id === line.batchId);
    const revenue = decimal(line.lineTotal);
    const cogs = decimal(line.quantity).mul(batch?.landedCostPerUnit ?? 0);
    return { revenue: totals.revenue.plus(revenue), cogs: totals.cogs.plus(cogs) };
  }, { revenue: new Decimal(0), cogs: new Decimal(0) });
  const categoryTotals = new Map<string, Decimal>();
  for (const expense of periodExpenses) categoryTotals.set(expense.categoryName, (categoryTotals.get(expense.categoryName) ?? new Decimal(0)).plus(expense.amount));
  const expenseByPerson = new Map<string, Decimal>();
  const expenseByUnit = new Map<string, Decimal>();
  const expenseByMonth = new Map<string, Decimal>();
  for (const expense of periodExpenses) {
    if (expense.employeeId) expenseByPerson.set(expense.expenseForName, (expenseByPerson.get(expense.expenseForName) ?? new Decimal(0)).plus(expense.amount));
    else expenseByUnit.set(expense.expenseForName, (expenseByUnit.get(expense.expenseForName) ?? new Decimal(0)).plus(expense.amount));
    const month = expense.date.slice(0, 7);
    expenseByMonth.set(month, (expenseByMonth.get(month) ?? new Decimal(0)).plus(expense.amount));
  }
  const salesByCustomer = new Map<string, { customer: string; quantity: Decimal; value: Decimal }>();
  const salesByProduct = new Map<string, { product: string; quantity: Decimal; value: Decimal }>();
  const salesByMonth = new Map<string, { invoices: number; value: Decimal }>();
  const salesBySalesperson = new Map<string, { salesperson: string; invoiceValue: Decimal; collectionValue: Decimal; customers: Set<string> }>();
  for (const invoice of periodInvoices) {
    const customerRow = salesByCustomer.get(invoice.customerId) ?? { customer: invoice.customerName, quantity: new Decimal(0), value: new Decimal(0) };
    for (const line of invoice.lines) {
      customerRow.quantity = customerRow.quantity.plus(line.quantity);
      customerRow.value = customerRow.value.plus(line.lineTotal);
      const productRow = salesByProduct.get(line.productId) ?? { product: line.productName, quantity: new Decimal(0), value: new Decimal(0) };
      productRow.quantity = productRow.quantity.plus(line.quantity);
      productRow.value = productRow.value.plus(line.lineTotal);
      salesByProduct.set(line.productId, productRow);
    }
    salesByCustomer.set(invoice.customerId, customerRow);
    const month = invoice.date.slice(0, 7);
    const monthRow = salesByMonth.get(month) ?? { invoices: 0, value: new Decimal(0) };
    monthRow.invoices += 1;
    monthRow.value = monthRow.value.plus(invoice.total);
    salesByMonth.set(month, monthRow);
    const employee = demoUsers.find((entry) => entry.id === invoice.ownerId);
    const ownerRow = salesBySalesperson.get(invoice.ownerId) ?? { salesperson: employee?.name ?? invoice.ownerId, invoiceValue: new Decimal(0), collectionValue: new Decimal(0), customers: new Set<string>() };
    ownerRow.invoiceValue = ownerRow.invoiceValue.plus(invoice.total);
    ownerRow.customers.add(invoice.customerId);
    salesBySalesperson.set(invoice.ownerId, ownerRow);
  }
  for (const collection of periodCollections) {
    const employee = demoUsers.find((entry) => entry.id === collection.ownerId);
    const ownerRow = salesBySalesperson.get(collection.ownerId) ?? { salesperson: employee?.name ?? collection.ownerId, invoiceValue: new Decimal(0), collectionValue: new Decimal(0), customers: new Set<string>() };
    ownerRow.collectionValue = ownerRow.collectionValue.plus(collection.amount);
    ownerRow.customers.add(collection.customerId);
    salesBySalesperson.set(collection.ownerId, ownerRow);
  }
  const deliveryInvoiceExceptions = [
    ...periodDeliveries.filter((delivery) => !invoices.some((invoice) => invoice.status !== "Cancelled" && invoice.deliveryIds.includes(delivery.id))).map((delivery) => ({ date: delivery.date, type: "Delivered not invoiced", reference: delivery.challanNumber, customer: delivery.customerName, detail: "Posted delivery has no active invoice." })),
    ...invoices.filter((invoice) => invoice.status === "Cancelled" && inPeriod(invoice.date, from, to) && (!scopedSalesId || invoice.ownerId === scopedSalesId) && collections.some((collection) => collection.status === "Posted" && collection.invoiceId === invoice.id)).map((invoice) => ({ date: invoice.date, type: "Cancelled invoice with collection", reference: invoice.invoiceNumber, customer: invoice.customerName, detail: "A posted collection remains linked; management review is required." }))
  ];
  const periodOrders = orders.filter((order) => inPeriod(order.date, from, to) && (!scopedSalesId || order.ownerId === scopedSalesId));
  const productFamily = (productId: string) => products.find((product) => product.id === productId)?.family ?? "Uncategorized";
  const salesByFamily = new Map<string, { quantity: Decimal; value: Decimal }>();
  for (const invoice of periodInvoices) {
    for (const line of invoice.lines) {
      const family = productFamily(line.productId);
      const row = salesByFamily.get(family) ?? { quantity: new Decimal(0), value: new Decimal(0) };
      row.quantity = row.quantity.plus(line.quantity);
      row.value = row.value.plus(line.lineTotal);
      salesByFamily.set(family, row);
    }
  }
  const grossProfitByProduct = new Map<string, { product: string; revenue: Decimal; cogs: Decimal }>();
  for (const invoice of periodInvoices) {
    for (const line of invoice.lines) {
      const row = grossProfitByProduct.get(line.productId) ?? { product: line.productName, revenue: new Decimal(0), cogs: new Decimal(0) };
      row.revenue = row.revenue.plus(line.lineTotal);
      grossProfitByProduct.set(line.productId, row);
    }
    for (const line of deliveries.filter((delivery) => invoice.deliveryIds.includes(delivery.id)).flatMap((delivery) => delivery.lines)) {
      const batch = stockBatches.find((entry) => entry.id === line.batchId);
      const row = grossProfitByProduct.get(line.productId) ?? { product: line.productName, revenue: new Decimal(0), cogs: new Decimal(0) };
      row.cogs = row.cogs.plus(decimal(line.quantity).mul(batch?.landedCostPerUnit ?? 0));
      grossProfitByProduct.set(line.productId, row);
    }
  }
  const stockSummary = products.map((product) => {
    const batches = stockBatches.filter((batch) => batch.productId === product.id);
    const received = batches.reduce((sum, batch) => sum.plus(batch.quantityReceived), new Decimal(0));
    const available = batches.reduce((sum, batch) => sum.plus(batch.quantityAvailable), new Decimal(0));
    const eligibleExpiries = batches.filter((batch) => decimal(batch.quantityAvailable).gt(0)).map((batch) => batch.expiryDate).sort();
    return { product: product.name, code: product.code, family: product.family, received: precise(received, 4), available: precise(available, 4), batches: String(batches.length), earliestExpiry: eligibleExpiries[0] ?? "-", status: product.active ? "Active" : "Inactive", unit: product.unit, standardPrice: product.standardSalePrice };
  });
  const periodPoImports = imports.filter((record) => inPeriod(record.poDate, from, to));
  const importedProductSummary = new Map<string, { product: string; family: string; quantity: Decimal; fob: Decimal; additional: Decimal; landed: Decimal }>();
  for (const record of landed) {
    for (const result of record.snapshot!.products) {
      const item = record.items.find((entry) => entry.id === result.importItemId);
      const key = item?.productId ?? result.importItemId;
      const row = importedProductSummary.get(key) ?? { product: result.productName, family: productFamily(item?.productId ?? ""), quantity: new Decimal(0), fob: new Decimal(0), additional: new Decimal(0), landed: new Decimal(0) };
      row.quantity = row.quantity.plus(result.quantity);
      row.fob = row.fob.plus(result.fobTotalBdt);
      row.additional = row.additional.plus(result.additionalCostBdt);
      row.landed = row.landed.plus(result.finalTotalBdt);
      importedProductSummary.set(key, row);
    }
  }
  const supplierImportSummary = new Map<string, { supplier: string; imports: number; products: Set<string>; quantity: Decimal; fob: Decimal }>();
  for (const record of periodPoImports) {
    const row = supplierImportSummary.get(record.supplierId) ?? { supplier: record.supplierName, imports: 0, products: new Set<string>(), quantity: new Decimal(0), fob: new Decimal(0) };
    row.imports += 1;
    for (const item of record.items) {
      row.products.add(item.productId);
      row.quantity = row.quantity.plus(item.quantity);
      row.fob = row.fob.plus(item.fobTotalBdt);
    }
    supplierImportSummary.set(record.supplierId, row);
  }
  const importByFamily = new Map<string, { quantity: Decimal; fob: Decimal; landed: Decimal }>();
  for (const row of importedProductSummary.values()) {
    const familyRow = importByFamily.get(row.family) ?? { quantity: new Decimal(0), fob: new Decimal(0), landed: new Decimal(0) };
    familyRow.quantity = familyRow.quantity.plus(row.quantity);
    familyRow.fob = familyRow.fob.plus(row.fob);
    familyRow.landed = familyRow.landed.plus(row.landed);
    importByFamily.set(row.family, familyRow);
  }
  const accountMovementSummary = new Map<string, { account: string; type: string; inflow: Decimal; outflow: Decimal }>();
  for (const transaction of periodAccountTransactions) {
    const account = accounts.find((entry) => entry.id === transaction.accountId);
    const row = accountMovementSummary.get(transaction.accountId) ?? { account: transaction.accountName, type: account?.type ?? "Unknown", inflow: new Decimal(0), outflow: new Decimal(0) };
    if (transaction.direction === "In") row.inflow = row.inflow.plus(transaction.amount);
    else row.outflow = row.outflow.plus(transaction.amount);
    accountMovementSummary.set(transaction.accountId, row);
  }
  const supplierBalances = suppliers.map((supplier) => {
    const rows = supplierSettlements.filter((entry) => entry.supplierId === supplier.id && entry.status === "Posted" && entry.date <= to);
    const obligation = rows.filter((entry) => entry.entryType === "Obligation").reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    const paid = rows.filter((entry) => entry.entryType === "Payment").reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
    return { supplier, obligation, paid, balance: obligation.minus(paid) };
  });
  const positionAmount = (category: FinancialPositionEntry["category"]) => financialPositionEntries
    .filter((entry) => entry.status === "Posted" && entry.category === category && entry.asOfDate <= to)
    .reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
  const cashAndBank = accounts.filter((entry) => entry.active).reduce((sum, account) => {
    const future = accountTransactions.filter((entry) => entry.accountId === account.id && entry.date > to);
    const asOfBalance = future.reduce((balance, entry) => entry.direction === "In" ? balance.minus(entry.amount) : balance.plus(entry.amount), decimal(account.balance));
    return sum.plus(asOfBalance);
  }, new Decimal(0));
  const receivables = customers.reduce((sum, customer) => {
    const futureInvoices = invoices.filter((entry) => entry.customerId === customer.id && entry.status === "Approved" && entry.date > to).reduce((total, entry) => total.plus(entry.total), new Decimal(0));
    const futureCollections = collections.filter((entry) => entry.customerId === customer.id && entry.status === "Posted" && entry.date > to).reduce((total, entry) => total.plus(entry.amount), new Decimal(0));
    return sum.plus(decimal(customer.currentDue).minus(futureInvoices).plus(futureCollections));
  }, new Decimal(0));
  const inventoryValue = stockBatches.reduce((sum, batch) => {
    const asOfQuantity = stockMovements.filter((entry) => entry.batchId === batch.id && entry.date > to).reduce((quantity, entry) => entry.type === "Dispatch" ? quantity.plus(entry.quantity) : quantity.minus(entry.quantity), decimal(batch.quantityAvailable));
    return sum.plus(asOfQuantity.mul(batch.landedCostPerUnit));
  }, new Decimal(0));
  const recoverableAdvances = accountTransactions.filter((entry) => entry.date <= to && entry.sourceType === "Advance").reduce((sum, entry) => entry.direction === "Out" ? sum.plus(entry.amount) : sum.minus(entry.amount), new Decimal(0));
  const companyLoan = accountTransactions.filter((entry) => entry.date <= to && entry.sourceType === "Company Loan").reduce((sum, entry) => entry.direction === "In" ? sum.plus(entry.amount) : sum.minus(entry.amount), new Decimal(0));
  const fixedAssets = positionAmount("Fixed Assets");
  const depreciation = positionAmount("Accumulated Depreciation");
  const otherReceivables = positionAmount("Other Receivables");
  const supplierPayable = supplierBalances.reduce((sum, row) => sum.plus(row.balance), new Decimal(0));
  const statutoryPayables = positionAmount("Statutory Payables");
  const otherPayables = positionAmount("Other Payables");
  const ownerCapital = positionAmount("Owner Capital");
  const retainedEarnings = positionAmount("Opening Retained Earnings");
  const totalAssets = cashAndBank.plus(receivables).plus(inventoryValue).plus(recoverableAdvances).plus(otherReceivables).plus(fixedAssets).minus(depreciation);
  const totalLiabilities = supplierPayable.plus(statutoryPayables).plus(otherPayables).plus(companyLoan);
  const totalEquity = ownerCapital.plus(retainedEarnings);
  const reconciliationDifference = totalAssets.minus(totalLiabilities).minus(totalEquity);
  const sensitive = hasCapability(req, "view_sensitive_cost");
  const profitVisible = hasCapability(req, "view_profit");
  const financialPositionVisible = hasCapability(req, "view_financial_position");
  const report = {
    period: { from, to },
    importCosts: [{ label: "Imports created", value: String(imports.filter((record) => inPeriod(record.createdAt.slice(0, 10), from, to)).length) }, { label: "Finalized shipment value", value: sensitive ? money(importCost) : "Restricted" }, { label: "Pending finalization", value: String(imports.filter((item) => item.costingStatus === "In Progress").length) }],
    inventory: [{ label: "Available units", value: inventoryUnits.toFixed(0) }, { label: "Tracked batches", value: String(stockBatches.length) }, { label: "Expiry attention", value: String(stockBatches.filter((batch) => expiryStatus(batch.expiryDate) !== "Normal").length) }],
    sales: [{ label: scopedSalesId ? "Selected invoiced sales" : "Approved invoice sales", value: money(salesTotal) }, { label: scopedSalesId ? "Selected collections" : "Collections received", value: money(collectionTotal) }, { label: scopedSalesId ? "Selected customer dues" : "Customer dues", value: money(reportCustomers.reduce((sum, customer) => sum.plus(customer.currentDue), new Decimal(0))) }, ...(profitVisible ? [{ label: "Delivered gross profit", value: money(realized.revenue.minus(realized.cogs)) }] : [])],
    expenses: [{ label: "Operating expenses", value: money(expenseTotal) }, { label: "Posted entries", value: String(periodExpenses.length) }, { label: "Cash / bank accounts", value: String(accounts.filter((entry) => entry.active).length) }],
    tables: {
      imports: [
        { id: "supplier-list", title: "Supplier List", columns: [{ key: "supplier", label: "Supplier" }, { key: "country", label: "Country" }, { key: "contact", label: "Contact" }, { key: "phone", label: "Phone" }, { key: "terms", label: "Payment Terms" }, { key: "obligation", label: "Obligation", align: "right" as const }, { key: "paid", label: "Paid", align: "right" as const }, { key: "balance", label: "Payable", align: "right" as const }, { key: "status", label: "Status" }], rows: supplierBalances.map(({ supplier, obligation, paid, balance }) => ({ supplier: supplier.name, country: supplier.country, contact: supplier.contactPerson, phone: supplier.phone, terms: supplier.paymentTerms, obligation: sensitive ? money(obligation) : "Restricted", paid: sensitive ? money(paid) : "Restricted", balance: sensitive ? money(balance) : "Restricted", status: supplier.active ? "Active" : "Inactive" })) },
        { id: "supplier-statement", title: "Supplier Statement", columns: [{ key: "date", label: "Date" }, { key: "supplier", label: "Supplier" }, { key: "reference", label: "Import / PO / Ref" }, { key: "type", label: "Entry" }, { key: "account", label: "Payment Account" }, { key: "paymentRef", label: "Payment Ref" }, { key: "debit", label: "Obligation", align: "right" as const }, { key: "credit", label: "Payment", align: "right" as const }], rows: supplierSettlements.filter((entry) => entry.status === "Posted" && inPeriod(entry.date, from, to)).map((entry) => ({ date: entry.date, supplier: entry.supplierName, reference: entry.reference, type: entry.entryType, account: entry.accountName ?? "-", paymentRef: entry.paymentReference ?? "-", debit: sensitive && entry.entryType === "Obligation" ? entry.amount : entry.entryType === "Obligation" ? "Restricted" : "0.00", credit: sensitive && entry.entryType === "Payment" ? entry.amount : entry.entryType === "Payment" ? "Restricted" : "0.00" })) },
        { id: "import-register", title: "Import / Shipment Register", columns: [{ key: "date", label: "Created" }, { key: "reference", label: "Reference" }, { key: "supplier", label: "Supplier" }, { key: "po", label: "PO" }, { key: "products", label: "Products", align: "right" as const }, { key: "status", label: "Status" }], rows: imports.filter((record) => inPeriod(record.createdAt.slice(0, 10), from, to)).map((record) => ({ date: record.createdAt.slice(0, 10), reference: record.primaryReference, supplier: record.supplierName, po: record.poNumber, products: String(record.items.length), status: record.status })) },
        { id: "import-po-register", title: "Import Purchase Order Register", columns: [{ key: "date", label: "PO Date" }, { key: "po", label: "PO Number" }, { key: "supplier", label: "Supplier" }, { key: "reference", label: "Import Reference" }, { key: "status", label: "Status" }, { key: "products", label: "Products", align: "right" as const }, { key: "quantity", label: "Quantity", align: "right" as const }, { key: "fob", label: "FOB (BDT)", align: "right" as const }], rows: periodPoImports.map((record) => ({ date: record.poDate, po: record.poNumber, supplier: record.supplierName, reference: record.primaryReference, status: record.status, products: String(record.items.length), quantity: precise(record.items.reduce((sum, item) => sum.plus(item.quantity), new Decimal(0)), 4), fob: sensitive ? money(record.items.reduce((sum, item) => sum.plus(item.fobTotalBdt), new Decimal(0))) : "Restricted" })) },
        { id: "imported-product-summary", title: "Imported Product Summary", columns: [{ key: "product", label: "Product" }, { key: "family", label: "Family" }, { key: "quantity", label: "Imported Qty", align: "right" as const }, { key: "fob", label: "FOB Value", align: "right" as const }, { key: "additional", label: "Additional Cost", align: "right" as const }, { key: "landed", label: "Final Landed Value", align: "right" as const }], rows: [...importedProductSummary.values()].map((row) => ({ product: row.product, family: row.family, quantity: precise(row.quantity, 4), fob: sensitive ? money(row.fob) : "Restricted", additional: sensitive ? money(row.additional) : "Restricted", landed: sensitive ? money(row.landed) : "Restricted" })) },
        { id: "supplier-import-summary", title: "Supplier-wise Import Summary", columns: [{ key: "supplier", label: "Supplier" }, { key: "imports", label: "Import / PO Count", align: "right" as const }, { key: "products", label: "Products", align: "right" as const }, { key: "quantity", label: "Quantity", align: "right" as const }, { key: "fob", label: "FOB Value", align: "right" as const }], rows: [...supplierImportSummary.values()].map((row) => ({ supplier: row.supplier, imports: String(row.imports), products: String(row.products.size), quantity: precise(row.quantity, 4), fob: sensitive ? money(row.fob) : "Restricted" })) },
        { id: "import-by-family", title: "Import by Product Family", columns: [{ key: "family", label: "Product Family" }, { key: "quantity", label: "Imported Qty", align: "right" as const }, { key: "fob", label: "FOB Value", align: "right" as const }, { key: "landed", label: "Landed Value", align: "right" as const }], rows: [...importByFamily].map(([family, row]) => ({ family, quantity: precise(row.quantity, 4), fob: sensitive ? money(row.fob) : "Restricted", landed: sensitive ? money(row.landed) : "Restricted" })) },
        { id: "po-receipt-difference", title: "PO / Import vs Warehouse Receipt", columns: [{ key: "po", label: "PO" }, { key: "reference", label: "Import" }, { key: "supplier", label: "Supplier" }, { key: "product", label: "Product" }, { key: "expected", label: "Expected Qty", align: "right" as const }, { key: "received", label: "Received Qty", align: "right" as const }, { key: "rejected", label: "Rejected Qty", align: "right" as const }, { key: "outstanding", label: "Outstanding", align: "right" as const }, { key: "status", label: "Status" }], rows: periodPoImports.flatMap((record) => record.items.map((item) => { const receiptLines = receipts.filter((receipt) => receipt.importId === record.id).flatMap((receipt) => receipt.lines).filter((line) => line.importItemId === item.id); const received = receiptLines.reduce((sum, line) => sum.plus(line.quantityReceived), new Decimal(0)); const rejected = receiptLines.reduce((sum, line) => sum.plus(line.quantityRejected), new Decimal(0)); const outstanding = Decimal.max(0, decimal(item.quantity).minus(received).minus(rejected)); return { po: record.poNumber, reference: record.primaryReference, supplier: record.supplierName, product: item.productName, family: productFamily(item.productId), expected: precise(item.quantity, 4), received: precise(received, 4), rejected: precise(rejected, 4), outstanding: precise(outstanding, 4), status: outstanding.eq(0) ? "Complete" : received.gt(0) || rejected.gt(0) ? "Partial" : "Pending" }; })) },
        { id: "import-cost-breakdown", title: "Import Cost Breakdown", columns: [{ key: "date", label: "Date" }, { key: "reference", label: "Import" }, { key: "cost", label: "Cost Type" }, { key: "method", label: "Allocation" }, { key: "amount", label: "BDT", align: "right" as const }], rows: imports.flatMap((record) => record.costs.filter((cost) => inPeriod((cost.paymentDate || cost.createdAt).slice(0, 10), from, to)).map((cost) => ({ date: (cost.paymentDate || cost.createdAt).slice(0, 10), reference: record.primaryReference, supplier: record.supplierName, cost: cost.name, method: cost.allocationMethod.replace("_", " "), amount: sensitive ? cost.amountBdt : "Restricted" }))) },
        { id: "landed-cost-product", title: "Landed Cost by Product", columns: [{ key: "date", label: "Finalized" }, { key: "reference", label: "Import" }, { key: "product", label: "Product" }, { key: "quantity", label: "Qty", align: "right" as const }, { key: "landed", label: "Landed / Unit", align: "right" as const }], rows: landed.flatMap((record) => record.snapshot!.products.map((result) => { const item = record.items.find((entry) => entry.id === result.importItemId); return { date: record.snapshot!.finalizedAt.slice(0, 10), reference: record.primaryReference, product: result.productName, family: productFamily(item?.productId ?? ""), quantity: result.quantity, landed: sensitive ? result.finalPerUnitBdt : "Restricted" }; })) },
        { id: "landed-cost-batch-history", title: "Landed Cost History by Batch", columns: [{ key: "received", label: "Received" }, { key: "reference", label: "Import / Source" }, { key: "product", label: "Product" }, { key: "batch", label: "Lot / Batch" }, { key: "quantity", label: "Received Qty", align: "right" as const }, { key: "landed", label: "Landed / Unit", align: "right" as const }], rows: stockBatches.filter((batch) => inPeriod(batch.receivedDate, from, to)).map((batch) => ({ received: batch.receivedDate, reference: batch.sourceReference, product: batch.productName, family: productFamily(batch.productId), batch: `${batch.lotNumber} / ${batch.batchNumber}`, quantity: batch.quantityReceived, landed: sensitive ? batch.landedCostPerUnit : "Restricted" })) }
      ],
      inventory: [
        { id: "product-list", title: "Product List", columns: [{ key: "code", label: "Code / SKU" }, { key: "product", label: "Product" }, { key: "family", label: "Family" }, { key: "unit", label: "Unit" }, { key: "available", label: "Current Stock", align: "right" as const }, { key: "batches", label: "Active Batches", align: "right" as const }, { key: "earliestExpiry", label: "Nearest Expiry" }, { key: "status", label: "Status" }], rows: stockSummary },
        { id: "current-stock", title: "Current Batch Stock", columns: [{ key: "product", label: "Product" }, { key: "lot", label: "Lot / Batch" }, { key: "received", label: "Received" }, { key: "expiry", label: "Expiry" }, { key: "status", label: "Expiry Status" }, { key: "available", label: "Available", align: "right" as const }], rows: stockBatches.map((batch) => ({ product: batch.productName, family: productFamily(batch.productId), lot: `${batch.lotNumber} / ${batch.batchNumber}`, received: batch.receivedDate, expiry: batch.expiryDate, status: expiryStatus(batch.expiryDate), available: batch.quantityAvailable })) },
        { id: "stock-summary", title: "Stock Summary", columns: [{ key: "code", label: "Code" }, { key: "product", label: "Product" }, { key: "family", label: "Family" }, { key: "batches", label: "Batches", align: "right" as const }, { key: "received", label: "Total Received", align: "right" as const }, { key: "available", label: "Available", align: "right" as const }, { key: "earliestExpiry", label: "Earliest Expiry" }], rows: stockSummary },
        { id: "item-details", title: "Item Details", columns: [{ key: "code", label: "Code" }, { key: "product", label: "Product" }, { key: "family", label: "Family" }, { key: "unit", label: "Unit" }, { key: "batches", label: "Batches", align: "right" as const }, { key: "available", label: "Available", align: "right" as const }, { key: "standardPrice", label: "Standard Sale Price", align: "right" as const }, { key: "status", label: "Status" }], rows: stockSummary },
        { id: "expiry-report", title: "Expiry Attention", columns: [{ key: "product", label: "Product" }, { key: "lot", label: "Lot / Batch" }, { key: "expiry", label: "Expiry" }, { key: "status", label: "Status" }, { key: "available", label: "Available", align: "right" as const }, { key: "location", label: "Location" }], rows: stockBatches.filter((batch) => expiryStatus(batch.expiryDate) !== "Normal").sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).map((batch) => ({ product: batch.productName, family: productFamily(batch.productId), lot: `${batch.lotNumber} / ${batch.batchNumber}`, expiry: batch.expiryDate, status: expiryStatus(batch.expiryDate), available: batch.quantityAvailable, location: batch.location ?? batch.warehouse })) },
        { id: "stock-movement", title: "Stock Movements", columns: [{ key: "date", label: "Date" }, { key: "product", label: "Product" }, { key: "batch", label: "Batch" }, { key: "type", label: "Movement" }, { key: "quantity", label: "Qty", align: "right" as const }, { key: "reference", label: "Reference" }], rows: stockMovements.filter((movement) => inPeriod(movement.date, from, to)).map((movement) => ({ date: movement.date, product: movement.productName, batch: movement.batchNumber, type: movement.type, quantity: movement.quantity, reference: movement.reference })) }
      ],
      sales: [
        { id: "sales-summary", title: "Sales Summary", columns: [{ key: "date", label: "Date" }, { key: "invoices", label: "Invoices", align: "right" as const }, { key: "customers", label: "Customers", align: "right" as const }, { key: "quantity", label: "Units", align: "right" as const }, { key: "sales", label: "Approved Sales", align: "right" as const }, { key: "collections", label: "Collections", align: "right" as const }], rows: [...new Set([...periodInvoices.map((invoice) => invoice.date), ...periodCollections.map((entry) => entry.date)])].sort().map((date) => { const dayInvoices = periodInvoices.filter((invoice) => invoice.date === date); const dayCollections = periodCollections.filter((entry) => entry.date === date); return { date, invoices: String(dayInvoices.length), customers: String(new Set(dayInvoices.map((invoice) => invoice.customerId)).size), quantity: precise(dayInvoices.flatMap((invoice) => invoice.lines).reduce((sum, line) => sum.plus(line.quantity), new Decimal(0)), 4), sales: money(dayInvoices.reduce((sum, invoice) => sum.plus(invoice.total), new Decimal(0))), collections: money(dayCollections.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0))) }; }) },
        { id: "customer-list", title: "Customer List", columns: [{ key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "contact", label: "Contact" }, { key: "phone", label: "Phone" }, { key: "address", label: "Address" }, { key: "territory", label: "Territory" }, { key: "salesperson", label: "Salesperson" }, { key: "openingDue", label: "Opening Due", align: "right" as const }, { key: "periodInvoiced", label: "Period Invoiced", align: "right" as const }, { key: "periodPaid", label: "Period Paid", align: "right" as const }, { key: "currentDue", label: "Current Due", align: "right" as const }, { key: "status", label: "Status" }], rows: reportCustomers.map((customer) => ({ customer: customer.name, type: customer.type, contact: customer.contactPerson, phone: customer.phone, address: customer.address, territory: customer.territory, salesperson: demoUsers.find((entry) => entry.id === customer.assignedSalesUserId)?.name ?? customer.assignedSalesUserId, openingDue: customerOpeningBalances.find((entry) => entry.customerId === customer.id)?.openingDue ?? "0.00", periodInvoiced: money(periodInvoices.filter((entry) => entry.customerId === customer.id).reduce((sum, entry) => sum.plus(entry.total), new Decimal(0))), periodPaid: money(periodCollections.filter((entry) => entry.customerId === customer.id).reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0))), currentDue: customer.currentDue, status: customer.active ? "Active" : "Inactive" })) },
        { id: "sales-order-register", title: "Sales Order Register", columns: [{ key: "date", label: "Date" }, { key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "salesperson", label: "Salesperson" }, { key: "status", label: "Status" }, { key: "orderValue", label: "Order Value", align: "right" as const }, { key: "delivered", label: "Delivered Qty", align: "right" as const }, { key: "invoice", label: "Invoice Status" }, { key: "due", label: "Due", align: "right" as const }], rows: periodOrders.map((order) => { const orderDeliveries = deliveries.filter((delivery) => delivery.orderId === order.id && delivery.status !== "Draft"); const activeInvoices = invoices.filter((invoice) => invoice.orderId === order.id && invoice.status !== "Cancelled"); return { date: order.date, order: order.orderNumber, customer: order.customerName, salesperson: demoUsers.find((entry) => entry.id === order.ownerId)?.name ?? order.ownerId, status: order.status, orderValue: order.total, delivered: precise(orderDeliveries.flatMap((delivery) => delivery.lines).reduce((sum, line) => sum.plus(line.quantity), new Decimal(0)), 4), invoice: activeInvoices.length ? [...new Set(activeInvoices.map((invoice) => invoice.status))].join(", ") : "Not invoiced", due: order.due }; }) },
        { id: "order-fulfilment", title: "Order Fulfilment Difference", columns: [{ key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "salesperson", label: "Salesperson" }, { key: "product", label: "Product" }, { key: "ordered", label: "Ordered Qty", align: "right" as const }, { key: "delivered", label: "Delivered Qty", align: "right" as const }, { key: "invoiced", label: "Invoiced Qty", align: "right" as const }, { key: "remaining", label: "Remaining Qty", align: "right" as const }, { key: "status", label: "Status" }], rows: periodOrders.flatMap((order) => order.lines.map((line) => { const delivered = deliveries.filter((delivery) => delivery.orderId === order.id && delivery.status !== "Draft").flatMap((delivery) => delivery.lines).filter((entry) => entry.productId === line.productId).reduce((sum, entry) => sum.plus(entry.quantity), new Decimal(0)); const invoiced = invoices.filter((invoice) => invoice.orderId === order.id && invoice.status !== "Cancelled").flatMap((invoice) => invoice.lines).filter((entry) => entry.productId === line.productId).reduce((sum, entry) => sum.plus(entry.quantity), new Decimal(0)); const remaining = Decimal.max(0, decimal(line.quantity).minus(delivered)); return { order: order.orderNumber, customer: order.customerName, salesperson: demoUsers.find((entry) => entry.id === order.ownerId)?.name ?? order.ownerId, product: line.productName, family: productFamily(line.productId), ordered: precise(line.quantity, 4), delivered: precise(delivered, 4), invoiced: precise(invoiced, 4), remaining: precise(remaining, 4), status: remaining.eq(0) ? "Complete" : delivered.gt(0) ? "Partial" : "Pending" }; })) },
        { id: "delivery-challan-register", title: "Delivery Challan Register", columns: [{ key: "date", label: "Date" }, { key: "challan", label: "Challan" }, { key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "status", label: "Status" }, { key: "quantity", label: "Units", align: "right" as const }, { key: "invoice", label: "Invoice" }], rows: periodDeliveries.map((delivery) => ({ date: delivery.date, challan: delivery.challanNumber, order: orders.find((entry) => entry.id === delivery.orderId)?.orderNumber ?? delivery.orderId, customer: delivery.customerName, status: delivery.status, quantity: precise(delivery.lines.reduce((sum, line) => sum.plus(line.quantity), new Decimal(0)), 4), invoice: invoices.find((entry) => entry.status !== "Cancelled" && entry.deliveryIds.includes(delivery.id))?.invoiceNumber ?? "Not invoiced" })) },
        { id: "delivery-invoice-exceptions", title: "Delivery vs Invoice Exceptions", columns: [{ key: "date", label: "Date" }, { key: "type", label: "Exception" }, { key: "reference", label: "Reference" }, { key: "customer", label: "Customer" }, { key: "detail", label: "Control Note" }], rows: deliveryInvoiceExceptions },
        { id: "invoice-register", title: "Sales Invoice Register", columns: [{ key: "date", label: "Date" }, { key: "invoice", label: "Invoice" }, { key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "salesperson", label: "Salesperson" }, { key: "challans", label: "Delivery Challan(s)" }, { key: "status", label: "Status" }, { key: "amount", label: "Amount", align: "right" as const }], rows: invoices.filter((invoice) => inPeriod(invoice.date, from, to) && (!scopedSalesId || invoice.ownerId === scopedSalesId)).map((invoice) => ({ date: invoice.date, invoice: invoice.invoiceNumber, order: orders.find((entry) => entry.id === invoice.orderId)?.orderNumber ?? "-", customer: invoice.customerName, salesperson: demoUsers.find((entry) => entry.id === invoice.ownerId)?.name ?? invoice.ownerId, challans: invoice.deliveryIds.map((deliveryId) => deliveries.find((entry) => entry.id === deliveryId)?.challanNumber ?? deliveryId).join(", "), status: invoice.status, amount: invoice.total })) },
        { id: "sales-sheet", title: "Sales Sheet", columns: [{ key: "date", label: "Date" }, { key: "invoice", label: "Invoice" }, { key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "salesperson", label: "Salesperson" }, { key: "product", label: "Product" }, { key: "quantity", label: "Qty", align: "right" as const }, { key: "rate", label: "Rate", align: "right" as const }, { key: "amount", label: "Amount", align: "right" as const }], rows: periodInvoices.flatMap((invoice) => invoice.lines.map((line) => ({ date: invoice.date, invoice: invoice.invoiceNumber, order: orders.find((entry) => entry.id === invoice.orderId)?.orderNumber ?? "-", customer: invoice.customerName, salesperson: demoUsers.find((entry) => entry.id === invoice.ownerId)?.name ?? invoice.ownerId, product: line.productName, quantity: line.quantity, rate: line.unitPrice, amount: line.lineTotal }))) },
        { id: "delivered-sales", title: "Delivered Sales by Product", columns: [{ key: "date", label: "Date" }, { key: "challan", label: "Challan" }, { key: "customer", label: "Customer" }, { key: "product", label: "Product" }, { key: "quantity", label: "Qty", align: "right" as const }, { key: "value", label: "Delivered Value", align: "right" as const }, ...(profitVisible ? [{ key: "profit", label: "Gross Profit", align: "right" as const }] : [])], rows: periodDeliveries.flatMap((delivery) => delivery.lines.map((line) => { const batch = stockBatches.find((entry) => entry.id === line.batchId); return { date: delivery.date, challan: delivery.challanNumber, customer: delivery.customerName, product: line.productName, quantity: line.quantity, value: line.lineTotal, ...(profitVisible ? { profit: money(decimal(line.lineTotal).minus(decimal(line.quantity).mul(batch?.landedCostPerUnit ?? 0))) } : {}) }; })) },
        { id: "sales-by-customer", title: "Invoiced Sales by Customer", columns: [{ key: "customer", label: "Customer" }, { key: "quantity", label: "Units Invoiced", align: "right" as const }, { key: "value", label: "Invoice Value", align: "right" as const }], rows: [...salesByCustomer.values()].sort((a, b) => b.value.comparedTo(a.value)).map((row) => ({ customer: row.customer, quantity: precise(row.quantity, 4), value: money(row.value) })) },
        { id: "sales-by-product", title: "Invoiced Sales by Product", columns: [{ key: "product", label: "Product" }, { key: "quantity", label: "Units Invoiced", align: "right" as const }, { key: "value", label: "Invoice Value", align: "right" as const }], rows: [...salesByProduct.values()].sort((a, b) => b.value.comparedTo(a.value)).map((row) => ({ product: row.product, quantity: precise(row.quantity, 4), value: money(row.value) })) },
        { id: "sales-by-family", title: "Sales by Product Family", columns: [{ key: "family", label: "Product Family" }, { key: "quantity", label: "Units Invoiced", align: "right" as const }, { key: "value", label: "Invoice Value", align: "right" as const }], rows: [...salesByFamily].sort(([, a], [, b]) => b.value.comparedTo(a.value)).map(([family, row]) => ({ family, quantity: precise(row.quantity, 4), value: money(row.value) })) },
        { id: "sales-by-salesperson", title: "Sales by Salesperson", columns: [{ key: "salesperson", label: "Salesperson" }, { key: "customers", label: "Customers", align: "right" as const }, { key: "sales", label: "Approved Invoices", align: "right" as const }, { key: "collections", label: "Collections", align: "right" as const }], rows: [...salesBySalesperson.values()].sort((a, b) => b.invoiceValue.comparedTo(a.invoiceValue)).map((row) => ({ salesperson: row.salesperson, customers: String(row.customers.size), sales: money(row.invoiceValue), collections: money(row.collectionValue) })) },
        { id: "sales-by-month", title: "Invoiced Sales by Month", columns: [{ key: "month", label: "Month" }, { key: "invoices", label: "Invoices", align: "right" as const }, { key: "value", label: "Invoice Value", align: "right" as const }], rows: [...salesByMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, row]) => ({ month, invoices: String(row.invoices), value: money(row.value) })) },
        { id: "salesman-ledger", title: "Salesman Ledger", columns: [{ key: "date", label: "Date" }, { key: "salesperson", label: "Salesperson" }, { key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "reference", label: "Reference" }, { key: "debit", label: "Sale / Debit", align: "right" as const }, { key: "credit", label: "Collection / Credit", align: "right" as const }, { key: "due", label: "Customer Due", align: "right" as const }], rows: [...periodInvoices.map((invoice) => ({ date: invoice.date, salesperson: demoUsers.find((entry) => entry.id === invoice.ownerId)?.name ?? invoice.ownerId, customer: invoice.customerName, type: "Invoice", reference: invoice.invoiceNumber, debit: invoice.total, credit: "0.00", due: customers.find((entry) => entry.id === invoice.customerId)?.currentDue ?? "0.00" })), ...periodCollections.map((collection) => ({ date: collection.date, salesperson: demoUsers.find((entry) => entry.id === collection.ownerId)?.name ?? collection.ownerId, customer: collection.customerName, type: "Collection", reference: collection.receiptNumber, debit: "0.00", credit: collection.amount, due: customers.find((entry) => entry.id === collection.customerId)?.currentDue ?? "0.00" }))].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference)) },
        { id: "collections", title: "Collections Received", columns: [{ key: "date", label: "Date" }, { key: "receipt", label: "Receipt" }, { key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "mode", label: "Mode" }, { key: "reference", label: "Payment Ref" }, { key: "amount", label: "Amount", align: "right" as const }], rows: periodCollections.map((collection) => ({ date: collection.date, receipt: collection.receiptNumber, order: orders.find((entry) => entry.id === (collection.orderId ?? invoices.find((invoice) => invoice.id === collection.invoiceId)?.orderId))?.orderNumber ?? "-", customer: collection.customerName, mode: collection.paymentMode, reference: collection.referenceNumber ?? "-", amount: collection.amount })) },
        { id: "customer-dues", title: "Customer Receivables", columns: [{ key: "customer", label: "Customer" }, { key: "terms", label: "Terms" }, { key: "sales", label: "Total Sales", align: "right" as const }, { key: "collected", label: "Collected", align: "right" as const }, { key: "due", label: "Current Due", align: "right" as const }], rows: reportCustomers.map((customer) => ({ customer: customer.name, terms: customer.paymentTerms, sales: customer.totalSales, collected: customer.totalCollected, due: customer.currentDue })) },
        { id: "customer-ledger", title: "Customer Running Ledger", columns: [{ key: "date", label: "Date" }, { key: "customer", label: "Customer" }, { key: "type", label: "Type" }, { key: "reference", label: "Reference" }, { key: "debit", label: "Debit / Sale", align: "right" as const }, { key: "credit", label: "Credit / Collection", align: "right" as const }, { key: "runningDue", label: "Running Due", align: "right" as const }], rows: reportCustomers.flatMap((customer) => (customerLedger(customer.id)?.entries ?? []).filter((entry) => inPeriod(entry.date, from, to)).map((entry) => ({ date: entry.date, customer: customer.name, type: entry.type, reference: entry.reference, debit: entry.debit, credit: entry.credit, runningDue: entry.runningDue }))) },
        ...(profitVisible ? [{ id: "gross-profit-product", title: "Gross Profit by Product", columns: [{ key: "product", label: "Product" }, { key: "revenue", label: "Invoice Revenue", align: "right" as const }, { key: "cogs", label: "FIFO COGS", align: "right" as const }, { key: "profit", label: "Gross Profit", align: "right" as const }, { key: "margin", label: "Margin" , align: "right" as const }], rows: [...grossProfitByProduct.values()].map((row) => { const profit = row.revenue.minus(row.cogs); return { product: row.product, revenue: money(row.revenue), cogs: money(row.cogs), profit: money(profit), margin: `${precise(row.revenue.eq(0) ? 0 : profit.div(row.revenue).mul(100), 2)}%` }; }) }] : [])
      ],
      expenses: [
        { id: "monthly-ac-summary", title: "Monthly A/C Summary", columns: [{ key: "section", label: "Section" }, { key: "category", label: "Category" }, { key: "in", label: "Cash In", align: "right" as const }, { key: "out", label: "Cash Out", align: "right" as const }], rows: [
          { section: "Operating", category: "Sales Collection", in: money(collectionTotal), out: "0.00" },
          ...["Administration", "Salary", "TA", "DA", "Business Entertainment", "Donation", "Boarding Expense", "Miscellaneous / Other"].map((category) => ({ section: "Operating", category, in: "0.00", out: money(categoryTotals.get(category) ?? 0) })),
          ...periodAccountTransactions.filter((transaction) => transaction.sourceType === "Advance").map((transaction) => ({ section: "Non-operating", category: transaction.direction === "Out" ? "Advance Paid" : "Advance Settled / Recovered", in: transaction.direction === "In" ? transaction.amount : "0.00", out: transaction.direction === "Out" ? transaction.amount : "0.00" })),
          ...periodAccountTransactions.filter((transaction) => transaction.sourceType === "Company Loan").map((transaction) => ({ section: "Financing", category: transaction.direction === "In" ? "Company Loan Received" : "Company Loan Repaid", in: transaction.direction === "In" ? transaction.amount : "0.00", out: transaction.direction === "Out" ? transaction.amount : "0.00" }))
        ] },
        { id: "daily-expenditure", title: "Daily Expenditure", columns: [{ key: "date", label: "Date" }, { key: "category", label: "Category / Detail" }, { key: "expenseFor", label: "Expense For" }, { key: "enteredBy", label: "Entered By" }, { key: "remarks", label: "Remarks" }, { key: "paidFrom", label: "Paid From" }, { key: "amount", label: "Cost", align: "right" as const }], rows: periodExpenses.map((expense) => { const paidFrom = accounts.find((account) => account.id === expense.paidFromAccountId)?.name ?? expense.paidFromAccountId; return { date: expense.date, category: expense.categoryName, expenseFor: expense.expenseForName, employee: expense.employeeId ? expense.expenseForName : "", enteredBy: expense.enteredByName, remarks: expense.remarks, paidFrom, account: paidFrom, amount: expense.amount }; }) },
        { id: "monthly-category", title: "Expense Category Summary", columns: [{ key: "category", label: "Category" }, { key: "amount", label: "Total Amount", align: "right" as const }], rows: [...categoryTotals].sort(([a], [b]) => a.localeCompare(b)).map(([category, amount]) => ({ category, amount: money(amount) })) },
        { id: "expense-by-person", title: "Expense by Person", columns: [{ key: "employee", label: "Employee" }, { key: "amount", label: "Total Amount", align: "right" as const }], rows: [...expenseByPerson].sort(([a], [b]) => a.localeCompare(b)).map(([employee, amount]) => ({ employee, amount: money(amount) })) },
        { id: "expense-by-unit", title: "Expense by Office / Warehouse / Company", columns: [{ key: "unit", label: "Operating Unit" }, { key: "amount", label: "Total Amount", align: "right" as const }], rows: [...expenseByUnit].sort(([a], [b]) => a.localeCompare(b)).map(([unit, amount]) => ({ unit, amount: money(amount) })) },
        { id: "monthly-expense", title: "Monthly Expense", columns: [{ key: "month", label: "Month" }, { key: "amount", label: "Total Amount", align: "right" as const }], rows: [...expenseByMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount: money(amount) })) },
        { id: "ta-da", title: "TA/DA Approved Sheet Data", columns: [{ key: "date", label: "Date" }, { key: "employee", label: "Employee" }, { key: "designation", label: "Designation" }, { key: "ta", label: "TA", align: "right" as const }, { key: "da", label: "DA", align: "right" as const }, { key: "remarks", label: "Remarks" }], rows: periodExpenses.filter((expense) => expense.subtype === "TA/DA").map((expense) => ({ date: expense.date, employee: expense.employee ?? "-", designation: expense.designation ?? "-", ta: expense.taAmount ?? "0.00", da: expense.daAmount ?? "0.00", remarks: expense.remarks })) },
        { id: "account-transactions", title: "Cash / Bank Transactions", columns: [{ key: "date", label: "Date" }, { key: "voucher", label: "Voucher" }, { key: "account", label: "Account" }, { key: "direction", label: "In / Out" }, { key: "source", label: "Source" }, { key: "party", label: "Party" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", align: "right" as const }], rows: periodAccountTransactions.map((transaction) => ({ date: transaction.date, voucher: transaction.voucherNumber ?? "-", account: transaction.accountName, direction: transaction.direction, source: transaction.sourceType, party: transaction.partyName ?? "-", description: transaction.description, amount: transaction.amount })) },
        { id: "day-book", title: "Day Book", columns: [{ key: "date", label: "Date" }, { key: "voucher", label: "Voucher" }, { key: "account", label: "Account" }, { key: "direction", label: "In / Out" }, { key: "source", label: "Source" }, { key: "reference", label: "Reference" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", align: "right" as const }], rows: periodAccountTransactions.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((transaction) => ({ date: transaction.date, voucher: transaction.voucherNumber ?? "-", account: transaction.accountName, direction: transaction.direction, source: transaction.sourceType, reference: transaction.reference ?? "-", description: transaction.description, amount: transaction.amount })) },
        ...(["Cash", "Mobile Banking", "Bank"] as const).map((accountType) => ({ id: accountType === "Cash" ? "cash-transactions" : accountType === "Mobile Banking" ? "mobile-banking-transactions" : "bank-transactions", title: `${accountType} Transactions`, columns: [{ key: "date", label: "Date" }, { key: "voucher", label: "Voucher" }, { key: "account", label: "Account" }, { key: "direction", label: "In / Out" }, { key: "source", label: "Source" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount", align: "right" as const }], rows: periodAccountTransactions.filter((transaction) => accounts.find((account) => account.id === transaction.accountId)?.type === accountType).map((transaction) => ({ date: transaction.date, voucher: transaction.voucherNumber ?? "-", account: transaction.accountName, direction: transaction.direction, source: transaction.sourceType, description: transaction.description, amount: transaction.amount })) })),
        { id: "cash-movement-summary", title: "Cash Movement Summary", columns: [{ key: "account", label: "Account" }, { key: "type", label: "Account Type" }, { key: "inflow", label: "Cash In", align: "right" as const }, { key: "outflow", label: "Cash Out", align: "right" as const }, { key: "net", label: "Net Movement", align: "right" as const }], rows: [...accountMovementSummary.values()].map((row) => ({ account: row.account, type: row.type, inflow: money(row.inflow), outflow: money(row.outflow), net: money(row.inflow.minus(row.outflow)) })) },
        ...(financialPositionVisible ? [{ id: "balance-sheet", title: "Balance Sheet", columns: [{ key: "section", label: "Section" }, { key: "account", label: "Account" }, { key: "source", label: "Source" }, { key: "amount", label: "Amount", align: "right" as const }], rows: [
          { section: "Assets", account: "Cash, Bank & Mobile Accounts", source: "Active account balances", amount: money(cashAndBank) },
          { section: "Assets", account: "Accounts Receivable", source: "Customer ledger closing dues", amount: money(receivables) },
          { section: "Assets", account: "Inventory", source: "On-hand batch quantity x landed cost", amount: money(inventoryValue) },
          { section: "Assets", account: "Recoverable Advances", source: "Advance paid less recovered", amount: money(recoverableAdvances) },
          { section: "Assets", account: "Other Receivables", source: "Controlled position entries", amount: money(otherReceivables) },
          { section: "Assets", account: "Fixed Assets", source: "Controlled position entries", amount: money(fixedAssets) },
          { section: "Assets", account: "Less: Accumulated Depreciation", source: "Controlled position entries", amount: money(depreciation.negated()) },
          { section: "Assets", account: "Total Assets", source: "Calculated", amount: money(totalAssets) },
          { section: "Liabilities", account: "Supplier Payable", source: "Supplier obligations less payments", amount: money(supplierPayable) },
          { section: "Liabilities", account: "Statutory Payables", source: "Controlled position entries", amount: money(statutoryPayables) },
          { section: "Liabilities", account: "Other Payables", source: "Controlled position entries", amount: money(otherPayables) },
          { section: "Liabilities", account: "Company Loan Outstanding", source: "Loan inflow less repayment", amount: money(companyLoan) },
          { section: "Liabilities", account: "Total Liabilities", source: "Calculated", amount: money(totalLiabilities) },
          { section: "Equity", account: "Owner / Opening Capital", source: "Controlled position entries", amount: money(ownerCapital) },
          { section: "Equity", account: "Opening Retained Earnings", source: "Controlled position entries", amount: money(retainedEarnings) },
          { section: "Equity", account: "Total Equity", source: "Calculated", amount: money(totalEquity) },
          { section: "Control", account: "Liabilities + Equity", source: "Calculated", amount: money(totalLiabilities.plus(totalEquity)) },
          { section: "Control", account: "Reconciliation Difference", source: reconciliationDifference.eq(0) ? "Balanced" : "Review opening balances / omitted accounts", amount: money(reconciliationDifference) }
        ] }] : [])
      ],
      employees: [
        { id: "employee-list", title: "Employee List", columns: [{ key: "employeeCode", label: "Employee ID" }, { key: "employee", label: "Employee" }, { key: "designation", label: "Designation" }, { key: "department", label: "Department" }, { key: "territory", label: "Territory" }, { key: "phone", label: "Phone" }, { key: "role", label: "System Role" }, { key: "status", label: "Status" }], rows: (user.role === "Sales Executive" ? demoUsers.filter((entry) => entry.id === user.id) : demoUsers).map((record) => { const employee = directoryEntry(record); return { employeeCode: employee.employeeCode, employee: employee.name, designation: employee.title, department: employee.department, territory: employee.territory ?? "-", phone: employee.phone ?? "-", role: record.role, status: employee.status }; }) }
      ],
      controls: [
        { id: "audit-trail", title: "Audit Trail", columns: [{ key: "timestamp", label: "Timestamp" }, { key: "user", label: "User / Role" }, { key: "action", label: "Action" }, { key: "record", label: "Record" }, { key: "summary", label: "Summary / Reason" }], rows: auditEvents.filter((event) => inPeriod(event.timestamp.slice(0, 10), from, to)).map((event) => ({ timestamp: event.timestamp, user: `${event.userName} | ${event.role}`, action: event.action, record: `${event.entityType} | ${event.entityId}`, summary: `${event.summary}${event.reason ? ` | Reason: ${event.reason}` : ""}` })) },
        { id: "access-change-audit", title: "Access Change Audit", columns: [{ key: "timestamp", label: "Timestamp" }, { key: "user", label: "Changed By" }, { key: "action", label: "Action" }, { key: "record", label: "Employee / User" }, { key: "summary", label: "Change" }], rows: auditEvents.filter((event) => inPeriod(event.timestamp.slice(0, 10), from, to) && /access|permission|role|capabilit/i.test(`${event.action} ${event.entityType} ${event.summary}`)).map((event) => ({ timestamp: event.timestamp, user: `${event.userName} | ${event.role}`, action: event.action, record: event.entityId, summary: `${event.summary}${event.reason ? ` | Reason: ${event.reason}` : ""}` })) },
        { id: "fifo-override-audit", title: "FIFO Override / Stock Exception Audit", columns: [{ key: "timestamp", label: "Timestamp" }, { key: "user", label: "User / Role" }, { key: "action", label: "Action" }, { key: "record", label: "Delivery / Batch" }, { key: "summary", label: "Reason" }], rows: auditEvents.filter((event) => inPeriod(event.timestamp.slice(0, 10), from, to) && /fifo|stock override|batch override/i.test(`${event.action} ${event.summary} ${event.reason ?? ""}`)).map((event) => ({ timestamp: event.timestamp, user: `${event.userName} | ${event.role}`, action: event.action, record: event.entityId, summary: `${event.summary}${event.reason ? ` | Reason: ${event.reason}` : ""}` })) }
      ]
    }
  };
  if (!hasEffectivePermission(user, "import", "view")) {
    report.importCosts = [];
    report.tables.imports = hasEffectivePermission(user, "accounts", "view") ? report.tables.imports.filter((table) => ["supplier-list", "supplier-statement"].includes(table.id)) : [];
  }
  if (!hasEffectivePermission(user, "inventory", "view")) {
    report.inventory = [];
    report.tables.inventory = [];
  }
  if (!hasEffectivePermission(user, "sales", "view") && !hasEffectivePermission(user, "customers", "view")) {
    report.sales = [];
    report.tables.sales = [];
  }
  if (!hasEffectivePermission(user, "accounts", "view")) {
    report.expenses = [];
    report.tables.expenses = [];
  }
  if (!hasEffectivePermission(user, "marketing", "view")) report.tables.employees = [];
  if (!["Super Admin", "Managing Director", "Accounts"].includes(user.role)) report.tables.controls = [];
  res.json(ok({
    ...report
  }, `Reports loaded for ${from} to ${to}`));
});

const validRoles: Role[] = ["Super Admin", "Managing Director", "Accounts", "Import Officer", "Warehouse Manager", "Sales Manager", "Sales Executive"];
const validCapabilities: Capability[] = ["view_sensitive_cost", "edit_sensitive_cost", "finalize_landed_cost", "reopen_landed_cost", "view_profit", "view_financial_position", "approve_stock_override", "manage_users", "manage_user_access", "approve_special_price"];

function canManageUserAccess(user: User) {
  return user.role === "Super Admin" || userHasCapability(user, "manage_user_access");
}

function parsePermissionOverrides(value: unknown): UserPermissionOverride[] | null {
  if (!Array.isArray(value)) return null;
  const valid = value.every((override) => override && typeof override === "object" && permissionKeys.includes((override as UserPermissionOverride).permission) && permissionActions.includes((override as UserPermissionOverride).action) && ["ALLOW", "DENY"].includes((override as UserPermissionOverride).effect));
  return valid ? normalizePermissionOverrides(value as UserPermissionOverride[]) : null;
}

function userForViewer(user: User, viewer: User) {
  if (canManageUserAccess(viewer)) return user;
  const profile: User = { ...user };
  delete profile.capabilities;
  delete profile.permissionOverrides;
  return profile;
}

function requireWebsiteAdmin(req: Request, res: Response) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== "Super Admin") {
    fail(res, 403, "Only the Super Admin can manage public website content in this release.");
    return null;
  }
  return user;
}

function parseWebsiteContent<T>(schema: z.ZodType<T>, payload: unknown, res: Response) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    fail(res, 422, parsed.error.issues[0]?.message ?? "Website content is invalid.");
    return null;
  }
  return parsed.data;
}

function publicSlug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

app.get("/api/settings/website", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  res.json(ok({
    settings: publicSiteSettings,
    heroSlides: sortPublicContent(publicHeroSlides),
    categories: sortPublicContent(publicProductCategories),
    products: sortPublicContent(publicProducts),
    certificates: sortPublicContent(publicCertificates),
    resources: sortPublicContent(publicResources),
    inquiries: [...publicInquiries].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
  }, "Website content workspace loaded"));
});

app.patch("/api/settings/website/site", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const parsed = parseWebsiteContent(PublicSiteSettingsSchema, req.body, res);
  if (!parsed) return;
  publicSiteSettings = parsed;
  audit(req, "Public site settings updated", "Website", "public-site", "Company contact, positioning or map settings updated.");
  res.json(ok(publicSiteSettings, "Public site settings updated"));
});

app.post("/api/settings/website/hero-slides", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const candidate = { ...req.body, id: String(req.body?.id || `hero-${publicSlug(req.body?.title)}`), sortOrder: Number(req.body?.sortOrder ?? publicHeroSlides.length + 1) };
  const parsed = parseWebsiteContent(PublicHeroSlideSchema, candidate, res);
  if (!parsed) return;
  if (publicHeroSlides.some((slide) => slide.id === parsed.id)) return fail(res, 409, "A hero slide with this ID already exists.");
  publicHeroSlides.push(parsed);
  audit(req, "Hero slide created", "WebsiteHero", parsed.id, `${parsed.title} added to the public homepage.`);
  res.status(201).json(ok(parsed, "Hero slide created"));
});

app.patch("/api/settings/website/hero-slides/:slideId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicHeroSlides.findIndex((slide) => slide.id === req.params.slideId);
  if (index < 0) return fail(res, 404, "Hero slide not found.");
  const parsed = parseWebsiteContent(PublicHeroSlideSchema, { ...req.body, id: publicHeroSlides[index].id }, res);
  if (!parsed) return;
  publicHeroSlides[index] = parsed;
  audit(req, "Hero slide updated", "WebsiteHero", parsed.id, `${parsed.title} homepage content updated.`);
  res.json(ok(parsed, "Hero slide updated"));
});

app.delete("/api/settings/website/hero-slides/:slideId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicHeroSlides.findIndex((slide) => slide.id === req.params.slideId);
  if (index < 0) return fail(res, 404, "Hero slide not found.");
  if (publicHeroSlides[index].published && publicHeroSlides.filter((slide) => slide.published).length === 1) return fail(res, 409, "Keep at least one published hero slide.");
  const [removed] = publicHeroSlides.splice(index, 1);
  audit(req, "Hero slide deleted", "WebsiteHero", removed.id, `${removed.title} removed from website content.`);
  res.json(ok({ id: removed.id }, "Hero slide deleted"));
});

app.post("/api/settings/website/categories", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const candidate = { ...req.body, id: String(req.body?.id || `cat-${publicSlug(req.body?.name)}`), sortOrder: Number(req.body?.sortOrder ?? publicProductCategories.length + 1) };
  const parsed = parseWebsiteContent(PublicProductCategoryRecordSchema, candidate, res);
  if (!parsed) return;
  if (publicProductCategories.some((category) => category.id === parsed.id || category.name.toLowerCase() === parsed.name.toLowerCase())) return fail(res, 409, "This public product category already exists.");
  publicProductCategories.push(parsed);
  audit(req, "Public category created", "WebsiteCategory", parsed.id, `${parsed.name} added to the public catalogue.`);
  res.status(201).json(ok(parsed, "Public product category created"));
});

app.patch("/api/settings/website/categories/:categoryId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicProductCategories.findIndex((category) => category.id === req.params.categoryId);
  if (index < 0) return fail(res, 404, "Public product category not found.");
  const original = publicProductCategories[index];
  const parsed = parseWebsiteContent(PublicProductCategoryRecordSchema, { ...req.body, id: original.id }, res);
  if (!parsed) return;
  if (publicProductCategories.some((category, candidateIndex) => candidateIndex !== index && category.name.toLowerCase() === parsed.name.toLowerCase())) return fail(res, 409, "This public product category name already exists.");
  publicProductCategories[index] = parsed;
  if (original.name !== parsed.name) publicProducts.forEach((product) => { if (product.category === original.name) product.category = parsed.name; });
  audit(req, "Public category updated", "WebsiteCategory", parsed.id, `${parsed.name} public category updated.`);
  res.json(ok(parsed, "Public product category updated"));
});

app.delete("/api/settings/website/categories/:categoryId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicProductCategories.findIndex((category) => category.id === req.params.categoryId);
  if (index < 0) return fail(res, 404, "Public product category not found.");
  const category = publicProductCategories[index];
  if (publicProducts.some((product) => product.category === category.name)) return fail(res, 409, "Move or delete products in this category before deleting it.");
  publicProductCategories.splice(index, 1);
  audit(req, "Public category deleted", "WebsiteCategory", category.id, `${category.name} removed from website content.`);
  res.json(ok({ id: category.id }, "Public product category deleted"));
});

app.post("/api/settings/website/products", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const candidate = { ...req.body, slug: String(req.body?.slug || publicSlug(req.body?.name)), legacySlug: String(req.body?.legacySlug ?? ""), sortOrder: Number(req.body?.sortOrder ?? publicProducts.length + 1) };
  const parsed = parseWebsiteContent(PublicProductSchema, candidate, res);
  if (!parsed) return;
  if (!publicProductCategories.some((category) => category.name === parsed.category)) return fail(res, 422, "Select an existing public product category.");
  if (publicProducts.some((product) => product.slug === parsed.slug)) return fail(res, 409, "This public product URL slug already exists.");
  publicProducts.push(parsed);
  audit(req, "Public product created", "WebsiteProduct", parsed.slug, `${parsed.name} added to the public catalogue.`);
  res.status(201).json(ok(parsed, "Public product created"));
});

app.patch("/api/settings/website/products/:slug", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicProducts.findIndex((product) => product.slug === req.params.slug);
  if (index < 0) return fail(res, 404, "Public product not found.");
  const parsed = parseWebsiteContent(PublicProductSchema, req.body, res);
  if (!parsed) return;
  if (!publicProductCategories.some((category) => category.name === parsed.category)) return fail(res, 422, "Select an existing public product category.");
  if (publicProducts.some((product, candidateIndex) => candidateIndex !== index && product.slug === parsed.slug)) return fail(res, 409, "This public product URL slug already exists.");
  const oldSlug = publicProducts[index].slug;
  publicProducts[index] = parsed;
  if (oldSlug !== parsed.slug) publicCertificates.forEach((certificate) => { certificate.relatedProductSlugs = certificate.relatedProductSlugs.map((slug) => slug === oldSlug ? parsed.slug : slug); });
  audit(req, "Public product updated", "WebsiteProduct", parsed.slug, `${parsed.name} public catalogue details updated.`);
  res.json(ok(parsed, "Public product updated"));
});

app.delete("/api/settings/website/products/:slug", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicProducts.findIndex((product) => product.slug === req.params.slug);
  if (index < 0) return fail(res, 404, "Public product not found.");
  const [removed] = publicProducts.splice(index, 1);
  publicCertificates.forEach((certificate) => { certificate.relatedProductSlugs = certificate.relatedProductSlugs.filter((slug) => slug !== removed.slug); });
  audit(req, "Public product deleted", "WebsiteProduct", removed.slug, `${removed.name} removed from the public catalogue.`);
  res.json(ok({ id: removed.slug }, "Public product deleted"));
});

app.post("/api/settings/website/certificates", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const candidate = { ...req.body, id: String(req.body?.id || `certificate-${publicSlug(req.body?.title)}`), sortOrder: Number(req.body?.sortOrder ?? publicCertificates.length + 1) };
  const parsed = parseWebsiteContent(PublicCertificateSchema, candidate, res);
  if (!parsed) return;
  if (publicCertificates.some((certificate) => certificate.id === parsed.id)) return fail(res, 409, "This certificate ID already exists.");
  publicCertificates.push(parsed);
  audit(req, "Public certificate created", "WebsiteCertificate", parsed.id, `${parsed.title} added as a public document record.`);
  res.status(201).json(ok(parsed, "Public certificate created"));
});

app.patch("/api/settings/website/certificates/:certificateId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicCertificates.findIndex((certificate) => certificate.id === req.params.certificateId);
  if (index < 0) return fail(res, 404, "Public certificate not found.");
  const parsed = parseWebsiteContent(PublicCertificateSchema, { ...req.body, id: publicCertificates[index].id }, res);
  if (!parsed) return;
  publicCertificates[index] = parsed;
  audit(req, "Public certificate updated", "WebsiteCertificate", parsed.id, `${parsed.title} publication details updated.`);
  res.json(ok(parsed, "Public certificate updated"));
});

app.delete("/api/settings/website/certificates/:certificateId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicCertificates.findIndex((certificate) => certificate.id === req.params.certificateId);
  if (index < 0) return fail(res, 404, "Public certificate not found.");
  const [removed] = publicCertificates.splice(index, 1);
  publicProducts.forEach((product) => { product.certificateIds = product.certificateIds.filter((id) => id !== removed.id); });
  audit(req, "Public certificate deleted", "WebsiteCertificate", removed.id, `${removed.title} removed from website content.`);
  res.json(ok({ id: removed.id }, "Public certificate deleted"));
});

app.post("/api/settings/website/resources", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const candidate = { ...req.body, slug: String(req.body?.slug || publicSlug(req.body?.title)), sortOrder: Number(req.body?.sortOrder ?? publicResources.length + 1) };
  const parsed = parseWebsiteContent(PublicResourceSchema, candidate, res);
  if (!parsed) return;
  if (publicResources.some((resource) => resource.slug === parsed.slug)) return fail(res, 409, "This resource URL slug already exists.");
  publicResources.push(parsed);
  audit(req, "Public resource created", "WebsiteResource", parsed.slug, `${parsed.title} added to News & Resources.`);
  res.status(201).json(ok(parsed, "Public resource created"));
});

app.patch("/api/settings/website/resources/:slug", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicResources.findIndex((resource) => resource.slug === req.params.slug);
  if (index < 0) return fail(res, 404, "Public resource not found.");
  const parsed = parseWebsiteContent(PublicResourceSchema, req.body, res);
  if (!parsed) return;
  if (publicResources.some((resource, candidateIndex) => candidateIndex !== index && resource.slug === parsed.slug)) return fail(res, 409, "This resource URL slug already exists.");
  publicResources[index] = parsed;
  audit(req, "Public resource updated", "WebsiteResource", parsed.slug, `${parsed.title} publication details updated.`);
  res.json(ok(parsed, "Public resource updated"));
});

app.delete("/api/settings/website/resources/:slug", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicResources.findIndex((resource) => resource.slug === req.params.slug);
  if (index < 0) return fail(res, 404, "Public resource not found.");
  const [removed] = publicResources.splice(index, 1);
  audit(req, "Public resource deleted", "WebsiteResource", removed.slug, `${removed.title} removed from News & Resources.`);
  res.json(ok({ id: removed.slug }, "Public resource deleted"));
});

app.patch("/api/settings/website/inquiries/:inquiryId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const inquiry = publicInquiries.find((entry) => entry.inquiryId === req.params.inquiryId);
  if (!inquiry) return fail(res, 404, "Website inquiry not found.");
  const parsed = z.object({ status: z.enum(["Received", "Contacted", "Qualified", "Closed", "Spam"]), internalNotes: z.string().trim().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, parsed.error.issues[0]?.message ?? "Inquiry update is invalid.");
  inquiry.status = parsed.data.status;
  inquiry.internalNotes = parsed.data.internalNotes;
  audit(req, "Website inquiry updated", "WebsiteInquiry", inquiry.inquiryId, `${inquiry.organization || inquiry.name} marked ${inquiry.status}.`);
  res.json(ok(inquiry, "Website inquiry updated"));
});

app.post("/api/settings/website/inquiries/:inquiryId/convert-to-lead", (req, res) => {
  const user = requireWebsiteAdmin(req, res);
  if (!user) return;
  const inquiry = publicInquiries.find((entry) => entry.inquiryId === req.params.inquiryId);
  if (!inquiry) return fail(res, 404, "Website inquiry not found.");
  if (inquiry.status !== "Qualified") return fail(res, 422, "Mark the inquiry Qualified before converting it to a marketing lead.");
  if (inquiry.leadId) return res.json(ok(inquiry, `Inquiry is already linked to ${inquiry.leadNumber ?? inquiry.leadId}`));
  const assignedUserId = String(req.body?.assignedUserId ?? "");
  if (!marketingEmployeeIds(user).has(assignedUserId)) return fail(res, 422, "Assign an active Sales Executive inside your marketing scope.");
  const productIds: string[] = Array.isArray(req.body?.productIds) ? Array.from(new Set<string>((req.body.productIds as unknown[]).map(String))) : [];
  if (productIds.some((productId) => !products.some((product) => product.id === productId && product.active))) return fail(res, 422, "One or more selected ERP products are invalid.");
  const now = new Date().toISOString();
  const organization = inquiry.organization || `${inquiry.name} inquiry`;
  const organizationText = organization.toLowerCase();
  const organizationType: MarketingLead["organizationType"] = organizationText.includes("hospital") ? "Hospital" : organizationText.includes("clinic") || organizationText.includes("dialysis") ? "Clinic" : organizationText.includes("pharmacy") ? "Pharmacy" : organizationText.includes("dealer") || organizationText.includes("medical services") ? "Dealer" : "Other";
  const nextFollowUpAt = String(req.body?.nextFollowUpAt ?? "").trim() || undefined;
  if (nextFollowUpAt && !Number.isFinite(new Date(nextFollowUpAt).getTime())) return fail(res, 422, "Enter a valid first follow-up date and time.");
  const lead: MarketingLead = {
    id: id("lead"), leadNumber: nextReference("LEAD", marketingLeads.length), organizationName: organization, organizationType,
    contactPerson: inquiry.name, contactRole: "Procurement", mobile: inquiry.phone, email: inquiry.email,
    interestedProductIds: productIds, leadSource: "Website Inquiry", assignedUserId, stage: "NEW", nextFollowUpAt,
    notes: [inquiry.subject, inquiry.productInterest, inquiry.message, inquiry.internalNotes].filter(Boolean).join(" | "), createdAt: now, updatedAt: now
  };
  marketingLeads.unshift(lead);
  const employee = demoUsers.find((entry) => entry.id === assignedUserId)!;
  marketingActivities.unshift({ id: id("activity"), userId: assignedUserId, employeeCode: employee.employeeCode ?? employee.id.toUpperCase(), employeeName: employee.name, territory: employee.territory, activityType: "LEAD_CREATED", source: "LEAD", occurredAt: now, submittedAt: now, leadId: lead.id, subjectName: lead.organizationName, productIds, purpose: "Qualified website inquiry converted to lead", referenceType: "Lead", referenceId: lead.id, referenceNumber: lead.leadNumber, verification: "SYSTEM_VERIFIED", createdByUserId: user.id });
  if (nextFollowUpAt) marketingFollowUps.unshift({ id: id("follow"), assignedUserId, leadId: lead.id, subjectName: lead.organizationName, dueAt: nextFollowUpAt, purpose: "Website inquiry follow-up", status: "PENDING", createdAt: now });
  inquiry.leadId = lead.id;
  inquiry.leadNumber = lead.leadNumber;
  audit(req, "Website inquiry converted", "MarketingLead", lead.id, `${inquiry.inquiryId} converted to ${lead.leadNumber} and assigned to ${employee.name}.`);
  res.status(201).json(ok(inquiry, `${inquiry.inquiryId} converted to ${lead.leadNumber}`));
});

app.delete("/api/settings/website/inquiries/:inquiryId", (req, res) => {
  if (!requireWebsiteAdmin(req, res)) return;
  const index = publicInquiries.findIndex((entry) => entry.inquiryId === req.params.inquiryId);
  if (index < 0) return fail(res, 404, "Website inquiry not found.");
  if (publicInquiries[index].leadId) return fail(res, 409, "A converted inquiry is linked to marketing history and cannot be deleted.");
  const [removed] = publicInquiries.splice(index, 1);
  audit(req, "Website inquiry deleted", "WebsiteInquiry", removed.inquiryId, `${removed.organization || removed.name} inquiry removed from the prototype queue.`);
  res.json(ok({ id: removed.inquiryId }, "Website inquiry deleted"));
});

app.get("/api/settings/users", (req, res) => {
  const actor = requirePermission(req, res, "users", "view");
  if (!actor) return;
  res.json(ok(demoUsers.map((user) => userForViewer(user, actor)), "Employees loaded with role-safe login details"));
});
app.post("/api/settings/users", (req, res) => {
  const actor = requirePermission(req, res, "users", "create");
  if (!actor) return;
  if (!canManageEmployees(actor, "create")) return fail(res, 403, "Employee creation requires delegated user-management authority.");
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email || demoUsers.some((user) => user.email.toLowerCase() === email)) return fail(res, 409, "Enter a unique user email.");

  const requestedRole = String(req.body?.role ?? "Sales Executive") as Role;
  if (!validRoles.includes(requestedRole)) return fail(res, 422, "Select a valid role.");
  if (!canManageUserAccess(actor) && requestedRole !== "Sales Executive") return fail(res, 403, "Delegated employee managers create Sales Executive accounts only.");
  if (canManageUserAccess(actor) && !canAssignRole(actor, requestedRole)) return fail(res, 403, "You cannot assign that role.");

  const requestedCapabilities = Array.isArray(req.body?.capabilities) ? [...new Set(req.body.capabilities as Capability[])] : [];
  if (!requestedCapabilities.every((capability) => validCapabilities.includes(capability))) return fail(res, 422, "One or more capabilities are invalid.");
  const requestedOverrides = req.body?.permissionOverrides === undefined ? [] : parsePermissionOverrides(req.body.permissionOverrides);
  if (!requestedOverrides) return fail(res, 422, "One or more permission overrides are invalid.");
  if ((requestedCapabilities.length || requestedOverrides.length || req.body?.password) && !canManageUserAccess(actor)) return fail(res, 403, "Role, access and password assignment require access-management authority.");
  if (!requestedCapabilities.every((capability) => canGrantCapability(actor, capability))) return fail(res, 403, "You cannot grant a capability you do not control.");
  if (!requestedOverrides.every((override) => canGrantPermission(actor, override.permission, override.action, override.effect))) return fail(res, 403, "You cannot grant a permission you do not control.");

  const status = ["Active", "Pending", "Inactive"].includes(req.body?.status) ? req.body.status as User["status"] : "Active";
  const user: User = {
    id: id("user"),
    name: String(req.body.name ?? "New User").trim(),
    email,
    role: requestedRole,
    title: String(req.body.title ?? requestedRole).trim(),
    department: String(req.body.department ?? requestedRole).trim(),
    phone: String(req.body.phone ?? "").trim(),
    avatarUrl: String(req.body.avatarUrl ?? "").trim(),
    status,
    territory: req.body.territory ? String(req.body.territory).trim() : undefined,
    employeeCode: req.body.employeeCode ? String(req.body.employeeCode).trim() : undefined,
    permissionOverrides: requestedOverrides,
    capabilities: requestedCapabilities
  };
  demoUsers.push(user);
  passwordByEmail.set(user.email, canManageUserAccess(actor) && req.body.password ? String(req.body.password) : "password123");
  audit(req, "User Created", "User", user.id, `${user.name} created as ${user.role} with ${user.status} status.`);
  res.status(201).json(ok(userForViewer(user, actor), "User created"));
});
app.patch("/api/settings/users/:userId", (req, res) => {
  const actor = requirePermission(req, res, "users", "edit");
  if (!actor) return;
  const index = demoUsers.findIndex((user) => user.id === req.params.userId);
  if (index < 0) return fail(res, 404, "User not found");
  const before = structuredClone(demoUsers[index]);
  if (actor.role !== "Super Admin" && before.role === "Super Admin") return fail(res, 403, "A non-Super-Admin cannot modify a Super Admin account.");
  const nextRole = Object.hasOwn(req.body ?? {}, "role") ? req.body.role as Role : before.role;
  const nextStatus = Object.hasOwn(req.body ?? {}, "status") ? req.body.status as User["status"] : before.status;
  if (!validRoles.includes(nextRole)) return fail(res, 422, "Select a valid role.");
  if (!["Active", "Pending", "Inactive"].includes(nextStatus)) return fail(res, 422, "Select a valid account status.");
  const activeSuperAdmins = demoUsers.filter((user) => user.role === "Super Admin" && user.status === "Active").length;
  if (before.role === "Super Admin" && before.status === "Active" && activeSuperAdmins === 1 && (nextRole !== "Super Admin" || nextStatus !== "Active")) return fail(res, 409, "The final active Super Admin cannot be deactivated or assigned another role.");
  if (!canManageTargetUser(actor, before)) return fail(res, 403, "You can manage only lower-privilege employee accounts, never yourself or a Super Admin.");

  const changesAccess = ["role", "permissionOverrides", "capabilities", "password"].some((field) => Object.hasOwn(req.body ?? {}, field));
  if (changesAccess && !canManageUserAccess(actor)) return fail(res, 403, "Role, permission, capability and password changes require access-management authority.");

  if (nextRole !== before.role && !canAssignRole(actor, nextRole)) return fail(res, 403, "You cannot assign that role.");

  if (Object.hasOwn(req.body ?? {}, "capabilities") && !Array.isArray(req.body.capabilities)) return fail(res, 422, "Capabilities must be an array.");
  const nextCapabilities = Object.hasOwn(req.body ?? {}, "capabilities") ? [...new Set(req.body.capabilities as Capability[])] : before.capabilities ?? [];
  if (!Array.isArray(nextCapabilities) || !nextCapabilities.every((capability) => validCapabilities.includes(capability))) return fail(res, 422, "One or more capabilities are invalid.");
  if (changesAccess && !nextCapabilities.every((capability) => canGrantCapability(actor, capability))) return fail(res, 403, "You cannot grant or retain a capability you do not control.");

  const nextOverrides = Object.hasOwn(req.body ?? {}, "permissionOverrides") ? parsePermissionOverrides(req.body.permissionOverrides) : before.permissionOverrides ?? [];
  if (!nextOverrides) return fail(res, 422, "One or more permission overrides are invalid.");
  if (changesAccess && !nextOverrides.every((override) => canGrantPermission(actor, override.permission, override.action, override.effect))) return fail(res, 403, "You cannot grant or retain a permission you do not control.");

  const nextEmail = Object.hasOwn(req.body ?? {}, "email") ? String(req.body.email).trim().toLowerCase() : before.email;
  if (!nextEmail || demoUsers.some((user, userIndex) => userIndex !== index && user.email.toLowerCase() === nextEmail)) return fail(res, 409, "Enter a unique user email.");
  if (req.body.password && String(req.body.password).length < 6) return fail(res, 422, "Password must contain at least 6 characters.");

  const editableProfile = ["name", "title", "department", "phone", "avatarUrl", "territory", "employeeCode"] as const;
  const profileChanges = Object.fromEntries(editableProfile.filter((field) => Object.hasOwn(req.body ?? {}, field)).map((field) => [field, req.body[field]]));
  const updated: User = { ...before, ...profileChanges, email: nextEmail, role: nextRole, status: nextStatus, capabilities: nextCapabilities, permissionOverrides: nextOverrides };
  demoUsers[index] = updated;

  if (req.body.password) {
    passwordByEmail.set(nextEmail, String(req.body.password));
    audit(req, "Password Reset", "User", updated.id, `Password reset for ${updated.name}.`);
  } else if (before.email !== nextEmail) {
    const existingPassword = passwordByEmail.get(before.email) ?? "password123";
    passwordByEmail.delete(before.email);
    passwordByEmail.set(nextEmail, existingPassword);
  }
  if (editableProfile.some((field) => before[field] !== updated[field]) || before.email !== updated.email) audit(req, "User Profile Updated", "User", updated.id, `${updated.name}'s employee profile was updated.`);
  if (before.status !== updated.status) audit(req, updated.status === "Inactive" ? "User Deactivated" : "User Activated", "User", updated.id, `${updated.name}: ${before.status} to ${updated.status}.`);
  if (before.role !== updated.role) audit(req, "Role Changed", "User", updated.id, `${updated.name}: ${before.role} to ${updated.role}.`);

  const beforeOverrides = new Map((before.permissionOverrides ?? []).map((override) => [`${override.permission}:${override.action}`, override.effect]));
  const afterOverrides = new Map(nextOverrides.map((override) => [`${override.permission}:${override.action}`, override.effect]));
  for (const [key, effect] of afterOverrides) if (beforeOverrides.get(key) !== effect) audit(req, effect === "ALLOW" ? "Permission Allowed" : "Permission Denied", "User", updated.id, `${updated.name}: ${key} ${effect}.`);
  for (const key of beforeOverrides.keys()) if (!afterOverrides.has(key)) audit(req, "Permission Reset To Default", "User", updated.id, `${updated.name}: ${key} now follows the role default.`);
  for (const capability of nextCapabilities) if (!(before.capabilities ?? []).includes(capability)) audit(req, "Capability Granted", "User", updated.id, `${updated.name}: ${capability}.`);
  for (const capability of before.capabilities ?? []) if (!nextCapabilities.includes(capability)) audit(req, "Capability Revoked", "User", updated.id, `${updated.name}: ${capability}.`);

  res.json(ok(userForViewer(updated, actor), "User access updated"));
});
app.get("/api/settings/decisions", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  res.json(ok(decisions, "Client confirmation queue loaded"));
});
app.patch("/api/settings/decisions/:decisionId", (req, res) => {
  const user = requireArea(req, res, "settings");
  if (!user) return;
  const index = decisions.findIndex((decision) => decision.id === req.params.decisionId);
  if (index < 0) return fail(res, 404, "Decision not found");
  const confirmed = req.body.status === "Confirmed";
  if (confirmed && !String(req.body.resolutionValue ?? decisions[index].resolutionValue ?? "").trim()) return fail(res, 422, "Record the confirmed resolution before closing this decision.");
  decisions[index] = { ...decisions[index], ...req.body, id: decisions[index].id, confirmedBy: confirmed ? user.name : undefined, confirmedAt: confirmed ? new Date().toISOString() : undefined };
  audit(req, "Business decision updated", "BusinessDecision", decisions[index].id, `${decisions[index].title}: ${decisions[index].status}.`);
  res.json(ok(decisions[index], "Client decision updated"));
});

app.get("/api/settings/accounts", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  res.json(ok(accounts, "Settings accounts loaded"));
});
app.post("/api/settings/accounts", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  const account = { ...req.body, id: id("acc"), balance: money(req.body.balance ?? 0), active: req.body.active ?? true };
  accounts.push(account);
  audit(req, "Account created", "CashBankAccount", account.id, `${account.name} added.`);
  res.status(201).json(ok(account, "Cash or bank account created"));
});
app.patch("/api/settings/accounts/:accountId", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  const index = accounts.findIndex((account) => account.id === req.params.accountId);
  if (index < 0) return fail(res, 404, "Account not found");
  accounts[index] = { ...accounts[index], ...req.body, id: accounts[index].id, balance: req.body.balance === undefined ? accounts[index].balance : money(req.body.balance) };
  audit(req, "Account updated", "CashBankAccount", accounts[index].id, `${accounts[index].name} settings updated.`);
  res.json(ok(accounts[index], "Account updated"));
});
app.delete("/api/settings/accounts/:accountId", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  const index = accounts.findIndex((account) => account.id === req.params.accountId);
  if (index < 0) return fail(res, 404, "Account not found");
  const account = accounts[index];
  if (accountTransactions.some((transaction) => transaction.accountId === account.id)) return fail(res, 409, "Accounts with transactions cannot be deleted; mark the account inactive.");
  accounts.splice(index, 1);
  res.json(ok({ id: account.id }, "Account deleted"));
});

app.get("/api/settings/warehouse", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  res.json(ok(warehouseConfig, "Warehouse configuration loaded"));
});
app.patch("/api/settings/warehouse", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  Object.assign(warehouseConfig, req.body, { id: warehouseConfig.id });
  audit(req, "Warehouse updated", "Warehouse", warehouseConfig.id, `${warehouseConfig.name} configuration updated.`);
  res.json(ok(warehouseConfig, "Warehouse configuration updated"));
});

app.post("/api/settings/opening-stock", (req, res) => {
  const user = requireArea(req, res, "settings");
  if (!user) return;
  const product = products.find((entry) => entry.id === req.body.productId);
  if (!product) return fail(res, 422, "Select a valid canonical product.");
  let quantity: Decimal;
  let landedCost: Decimal;
  try {
    quantity = requiredDecimal(req.body.quantity, "Opening quantity");
    landedCost = requiredDecimal(req.body.landedCostPerUnit ?? "0", "Opening landed cost", { allowZero: true });
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Opening stock values are invalid.");
  }
  if (!req.body.lotNumber || !req.body.batchNumber || !req.body.manufacturingDate || !req.body.expiryDate || !req.body.receivedDate) return fail(res, 422, "Lot, batch, manufacturing, expiry and historical received dates are required.");
  if (new Date(req.body.expiryDate) <= new Date(req.body.manufacturingDate)) return fail(res, 422, "Expiry must be after manufacturing date.");
  const batch: StockBatch = { id: id("opening-batch"), productId: product.id, productCode: product.code, productName: product.name, sourceImportId: "opening-stock", sourceReference: String(req.body.sourceReference || "OPENING-STOCK"), sourceType: "Opening Stock", lotNumber: String(req.body.lotNumber), batchNumber: String(req.body.batchNumber), manufacturingDate: String(req.body.manufacturingDate), expiryDate: String(req.body.expiryDate), receivedDate: String(req.body.receivedDate), quantityReceived: precise(quantity, 4), quantityAvailable: precise(quantity, 4), warehouse: String(req.body.warehouse || warehouseConfig.name), location: req.body.location ? String(req.body.location) : undefined, landedCostPerUnit: money(landedCost) };
  if (stockBatches.some((entry) => entry.batchNumber.toLowerCase() === batch.batchNumber.toLowerCase())) return fail(res, 409, "Batch number already exists.");
  stockBatches.unshift(batch);
  stockMovements.unshift({ id: id("mov"), date: batch.receivedDate, productId: batch.productId, productName: batch.productName, batchId: batch.id, batchNumber: batch.batchNumber, type: "Receive", quantity: batch.quantityReceived, reference: batch.sourceReference, reason: "Opening stock migration", createdBy: user.name });
  audit(req, "Opening stock posted", "StockBatch", batch.id, `${batch.productName}: ${batch.quantityReceived} units from ${batch.sourceReference}.`);
  res.status(201).json(ok(visibleBatch(batch, req), "Opening stock batch created"));
});

app.get("/api/settings/customer-opening-balances", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  res.json(ok(customerOpeningBalances, "Customer opening balances loaded"));
});
app.post("/api/settings/customer-opening-balances", (req, res) => {
  const user = requireArea(req, res, "settings");
  if (!user) return;
  const customer = customers.find((entry) => entry.id === req.body.customerId);
  if (!customer) return fail(res, 422, "Select a valid customer.");
  if (customerOpeningBalances.some((entry) => entry.customerId === customer.id)) return fail(res, 409, "An opening balance is already posted for this customer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date ?? ""))) return fail(res, 422, "Enter a valid migration cutover date.");
  let openingDue: Decimal;
  let historicalSales: Decimal;
  let historicalCollected: Decimal;
  try {
    openingDue = requiredDecimal(req.body.openingDue ?? "0", "Opening due", { allowZero: true });
    historicalSales = requiredDecimal(req.body.historicalSales ?? openingDue, "Historical sales", { allowZero: true });
    historicalCollected = requiredDecimal(req.body.historicalCollected ?? "0", "Historical collections", { allowZero: true });
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : "Opening customer values are invalid.");
  }
  if (!historicalSales.minus(historicalCollected).eq(openingDue)) return fail(res, 422, "Historical sales minus historical collections must equal the opening due.");
  const erpDeliveries = deliveries.filter((entry) => entry.customerId === customer.id);
  const erpCollections = collections.filter((entry) => entry.customerId === customer.id && entry.status === "Posted");
  const delivered = erpDeliveries.flatMap((entry) => entry.lines).reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));
  const collected = erpCollections.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
  const currentDue = openingDue.plus(delivered).minus(collected);
  if (currentDue.lt(0)) return fail(res, 422, "Opening due is lower than already-posted ERP collections. Reconcile the migration values first.");
  const opening: CustomerOpeningBalance = {
    id: id("customer-opening"),
    customerId: customer.id,
    customerName: customer.name,
    date: String(req.body.date),
    openingDue: money(openingDue),
    historicalSales: money(historicalSales),
    historicalCollected: money(historicalCollected),
    reference: String(req.body.reference || "LEGACY-SALES-LEDGER"),
    remarks: String(req.body.remarks || "Opening balance imported from the legacy customer ledger."),
    createdBy: user.name,
    createdAt: new Date().toISOString()
  };
  customerOpeningBalances.push(opening);
  customer.currentDue = money(currentDue);
  customer.totalSales = money(historicalSales.plus(delivered));
  customer.totalCollected = money(historicalCollected.plus(collected));
  audit(req, "Customer opening balance posted", "CustomerOpeningBalance", opening.id, `${customer.name}: Tk ${opening.openingDue} opening due at ${opening.date}.`);
  res.status(201).json(ok(opening, "Customer opening balance posted"));
});

app.get("/api/settings/product-aliases", (req, res) => {
  if (!requirePermission(req, res, "products", "view")) return;
  res.json(ok(productAliases, "Product aliases loaded"));
});
app.post("/api/settings/product-aliases", (req, res) => {
  if (!requirePermission(req, res, "products", "create")) return;
  const product = products.find((entry) => entry.id === req.body.productId);
  const aliasText = String(req.body.aliasText ?? "").trim();
  if (!product || aliasText.length < 2) return fail(res, 422, "Enter an alias and select its canonical product.");
  if (productAliases.some((entry) => entry.aliasText.toLowerCase() === aliasText.toLowerCase())) return fail(res, 409, "This alias already exists.");
  const alias: ProductAlias = { id: id("alias"), aliasText, productId: product.id, productName: product.name, source: String(req.body.source || "Manual mapping"), active: true };
  productAliases.push(alias);
  res.status(201).json(ok(alias, "Product alias mapped"));
});
app.delete("/api/settings/product-aliases/:aliasId", (req, res) => {
  if (!requirePermission(req, res, "products", "delete")) return;
  const index = productAliases.findIndex((entry) => entry.id === req.params.aliasId);
  if (index < 0) return fail(res, 404, "Product alias not found");
  const [alias] = productAliases.splice(index, 1);
  res.json(ok({ id: alias.id }, "Product alias removed"));
});

app.get("/api/settings/cost-presets", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  res.json(ok(costPresets, "Cost presets loaded"));
});
app.post("/api/settings/cost-presets", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  const preset = { ...req.body, id: id("preset"), requiresExplicitChoice: true, active: req.body.active ?? true };
  costPresets.push(preset);
  res.status(201).json(ok(preset, "Cost preset created"));
});
app.patch("/api/settings/cost-presets/:presetId", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  const index = costPresets.findIndex((preset) => preset.id === req.params.presetId);
  if (index < 0) return fail(res, 404, "Cost preset not found");
  costPresets[index] = { ...costPresets[index], ...req.body, id: costPresets[index].id };
  res.json(ok(costPresets[index], "Cost preset updated"));
});
app.delete("/api/settings/cost-presets/:presetId", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  const index = costPresets.findIndex((preset) => preset.id === req.params.presetId);
  if (index < 0) return fail(res, 404, "Cost preset not found");
  const [preset] = costPresets.splice(index, 1);
  res.json(ok({ id: preset.id }, "Cost preset deleted"));
});

app.get("/api/settings/print", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  res.json(ok(printConfiguration, "Print configuration loaded"));
});
app.get("/api/print/config", (req, res) => {
  if (!requireUser(req, res)) return;
  res.json(ok(printConfiguration, "Print configuration loaded"));
});
app.patch("/api/settings/print", (req, res) => {
  if (!requireArea(req, res, "settings")) return;
  Object.assign(printConfiguration, req.body);
  audit(req, "Print configuration updated", "PrintConfiguration", "primary", "Letterhead and signatory details updated.");
  res.json(ok(printConfiguration, "Print configuration updated"));
});
app.get(["/api/audit", "/api/security/audit-log"], (req, res) => {
  const user = requirePermission(req, res, "reports", "view");
  if (!user || !["Super Admin", "Managing Director", "Accounts"].includes(user.role)) return user ? fail(res, 403, "Audit data scope is restricted to owner, management and accounts.") : undefined;
  res.json(ok(auditEvents, "Audit events loaded", { total: auditEvents.length }));
});

app.use("/api", (_req, res) => fail(res, 404, "API route not found"));

export default app;
