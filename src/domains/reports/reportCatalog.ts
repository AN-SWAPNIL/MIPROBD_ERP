import type { Capability } from "../erp.types.js";
import type { PermissionAction, PermissionKey, User } from "../../types/index.js";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess.js";
import { canReadLedger,canReadPayroll } from "../ledger/access.js";

export type ReportCategoryId = "sales" | "customers" | "suppliers" | "inventory" | "accounts" | "employees" | "controls";
export type ReportSourceGroup = "sales" | "inventory" | "imports" | "expenses" | "employees" | "controls";
export type ReportFilterKey = "salesperson" | "customer" | "product" | "family" | "supplier" | "employee" | "account" | "territory" | "status" | "order" | "lead" | "captureQuality" | "reviewStatus" | "stockControl" | "returnId" | "payrollRun" | "supplierClaim";

export type ReportDefinition = {
  id: string;
  title: string;
  category: ReportCategoryId;
  description: string;
  keywords: string[];
  source: "table" | "performance" | "marketing" | "employee-activity";
  sourceGroup?: ReportSourceGroup;
  tableId?: string;
  filters: ReportFilterKey[];
  printable: boolean;
  exportable: boolean;
  permission: { key: PermissionKey; action: PermissionAction };
  capability?: Capability;
  marketingPreset?: string;
  supportsGrouping?: boolean;
};

export const reportCategories: Array<{ id: ReportCategoryId; title: string; description: string }> = [
  { id: "sales", title: "Sales Reports", description: "Approved sales, orders, delivery and item performance" },
  { id: "customers", title: "Customer & Collection Reports", description: "Customer master, ledger, dues and collection position" },
  { id: "suppliers", title: "Supplier & Import Reports", description: "Supplier balances, import purchases and landed cost" },
  { id: "inventory", title: "Inventory & Product Reports", description: "Products, stock, batches, expiry and movement" },
  { id: "accounts", title: "Expense & Accounts Reports", description: "Expenses, account movement and financial position" },
  { id: "employees", title: "Employee & Marketing Reports", description: "Employee roster, performance and field activity" },
  { id: "controls", title: "Audit & Control Reports", description: "Protected actions, access changes and stock exceptions" }
];

const reports: ReportDefinition[] = [
  table("supplier-replacement-receipts","Supplier Replacement Receipts","suppliers","Accepted/rejected inspection quantities, new LOTs, approval and receiving evidence.","import",["supplierClaim","supplier","product","status"],["replacement","receipt","inspection"]),
  table("supplier-claims","Supplier Claim Register","suppliers","Original receipt rejections and held-stock claims, independent approval and agreed resolution.","import",["supplierClaim","supplier","product","status"],["rejection","supplier credit"]),
  table("supplier-replacements","Outstanding Supplier Replacements","suppliers","Approved promises, actual accepted replacements and remaining claim value.","import",["supplierClaim","supplier","product"],["replacement","claim"]),
  table("payroll-register","Payroll Accrual & Payment Register","accounts","Approved employee earnings, deductions, actual payments and unpaid liability.","accounts",["payrollRun","employee"],["salary","payroll"]),
  table("payroll-commission","Commission Reconciliation","accounts","Saved cumulative commission entitlement, earlier accrual, current adjustment and carry.","accounts",["payrollRun","employee"],["commission","clawback"]),
  table("payroll-loans","Employee Advances & Loans","accounts","Original employee financing, approved payroll recoveries and outstanding balance.","accounts",["employee","status"],["advance","loan","recovery"]),
  table("stock-return-register", "Inspected Stock Returns", "inventory", "Original delivery, LOT, expiry, inspection and returned stock condition.", "inventory", ["returnId","order","customer","product","status"], ["refusal","return","inspection"]),
  table("customer-return-credit", "Customer Return Credits", "customers", "Posted original-invoice credits, inspection and restored saved batch cost.", "sales", ["returnId","order","customer","product"], ["return","credit note"]),
  table("return-settlements", "Return Credit Applications & Refunds", "customers", "Approved credit transfers and actual customer refund outflows.", "sales", ["returnId","customer","account","status"], ["refund","credit application"]),
  table("sales-summary", "Sales Summary", "sales", "Approved invoice sales and collections by day, week, month or year.", "sales", ["salesperson", "customer"], ["daily", "weekly", "monthly", "yearly"], undefined, true),
  table("invoice-register", "Sales Invoice Register", "sales", "Approved, draft and cancelled invoices by period.", "sales", ["order", "salesperson", "customer", "status"], ["invoice", "billing"]),
  table("sales-sheet", "Sales Sheet", "sales", "Invoice-level product quantity, rate and amount detail.", "sales", ["order", "salesperson", "customer", "product"], ["item"]),
  table("sales-order-register", "Sales Order Register", "sales", "Orders with delivery, invoice and due status.", "sales", ["order", "salesperson", "customer", "status"], ["order"]),
  table("order-fulfilment", "Order Fulfilment Difference", "sales", "Ordered, delivered, invoiced and remaining quantities.", "sales", ["order", "salesperson", "customer", "product", "status"], ["remaining"]),
  table("delivery-challan-register", "Delivery Challan Register", "sales", "Posted challans, quantities and invoice linkage.", "sales", ["order", "customer", "status"], ["delivery", "challan"]),
  table("delivery-invoice-exceptions", "Delivery vs Invoice Exceptions", "sales", "Accepted deliveries still requiring invoice approval.", "sales", ["order", "customer"], ["reconciliation"]),
  table("delivered-sales", "Delivered Sales by Product", "sales", "Operational product movement based on delivery challans.", "sales", ["customer", "product"], ["dispatch"]),
  table("sales-by-product", "Sales by Product / Item", "sales", "Approved invoice quantity and value by product.", "sales", ["product"], ["item-wise"]),
  table("sales-by-family", "Sales by Product Family", "sales", "Approved invoice quantity and value by canonical family.", "sales", ["family"], ["category"]),
  table("sales-by-salesperson", "Sales by Salesperson", "sales", "Approved invoice sales and posted collections by owner.", "sales", ["salesperson"], ["employee"]),
  table("sales-by-month", "Sales by Month", "sales", "Approved invoices grouped by calendar month.", "sales", [], ["monthly"]),
  table("gross-profit-product", "Gross Profit by Product", "sales", "Invoice revenue less authoritative dispatched-batch cost.", "sales", ["product"], ["profit"], "view_profit"),

  table("customer-list", "Customer List", "customers", "Address, phone, assigned salesperson, period activity and current due.", "customers", ["customer", "salesperson", "territory", "status"], ["address", "number"]),
  table("customer-ledger", "Customer Running Ledger", "customers", "Opening due, invoices, collections and running balance.", "customers", ["customer"], ["statement"]),
  table("customer-dues", "Customer Dues / Receivables", "customers", "Current sales, collection and outstanding due by customer.", "customers", ["customer"], ["balance"]),
  table("collections", "Customer Collection Report", "customers", "Posted customer collections and payment modes.", "sales", ["order", "customer"], ["receipt"]),
  table("sales-by-customer", "Customer Sales Summary", "customers", "Approved invoice quantity and value by customer.", "customers", ["customer"], ["sales"]),
  table("salesman-ledger", "Salesman Ledger", "customers", "Invoice debits and collection credits by salesperson.", "sales", ["salesperson", "customer"], ["employee"]),

  table("supplier-list", "Supplier List", "suppliers", "Supplier contact, obligations, payments and current payable.", "accounts", ["supplier", "status"], ["vendor", "balance"], "view_sensitive_cost"),
  table("supplier-statement", "Supplier Statement / Ledger", "suppliers", "Posted supplier obligations and payments by reference.", "accounts", ["supplier"], ["payment", "unpaid"], "view_sensitive_cost"),
  table("import-register", "Import / Shipment Register", "suppliers", "Import cases, suppliers, references and status.", "import", ["supplier", "status"], ["shipment", "lc", "tt"]),
  table("import-po-register", "Import Purchase Order Register", "suppliers", "PO date, supplier, products, quantity and FOB.", "import", ["supplier", "status"], ["purchase"]),
  table("imported-product-summary", "Imported Product Summary", "suppliers", "Imported quantity, FOB, additional cost and landed value.", "import", ["product", "family"], ["item"], "view_sensitive_cost"),
  table("supplier-import-summary", "Supplier-wise Import Summary", "suppliers", "Import count, products, quantity and value by supplier.", "import", ["supplier"], ["vendor"]),
  table("import-by-family", "Import by Product Family", "suppliers", "Imported quantity and finalized value by product family.", "import", ["family"], ["category"], "view_sensitive_cost"),
  table("po-receipt-difference", "Import vs Warehouse Receipt", "suppliers", "Expected, received, rejected and outstanding quantity.", "import", ["supplier", "product", "status"], ["difference"]),
  table("import-cost-breakdown", "Import Cost Breakdown", "suppliers", "Recorded import cost rows and allocation methods.", "import", ["supplier"], ["allocation"], "view_sensitive_cost"),
  table("landed-cost-product", "Landed Cost by Product", "suppliers", "Final landed unit cost from immutable snapshots.", "import", ["product"], ["cost"], "view_sensitive_cost"),
  table("landed-cost-batch-history", "Landed Cost History by Batch", "suppliers", "Received batches and inherited landed unit cost.", "import", ["product"], ["history"], "view_sensitive_cost"),

  table("product-list", "Product List", "inventory", "Product code, family, current stock, batches and nearest expiry.", "inventory", ["product", "family", "status"], ["master", "sku"]),
  table("stock-summary", "Stock Summary", "inventory", "Consolidated available stock by canonical product.", "inventory", ["product", "family"], ["balance"]),
  table("current-stock", "Current Batch Stock", "inventory", "Available quantity by product lot and batch.", "inventory", ["product", "status"], ["batch"]),
  table("item-details", "Product Details", "inventory", "Product master, batch count, stock and standard price.", "inventory", ["product", "family", "status"], ["detail"]),
  table("stock-movement", "Stock Movements", "inventory", "Receipt and dispatch movement history by product.", "inventory", ["product", "status"], ["receive", "dispatch"]),
  table("stock-holds", "Stock Holds & Releases", "inventory", "Partial quarantine or damage holds, inspected releases and outstanding units.", "inventory", ["product", "status"], ["quarantine", "damage", "inspection"]),
  table("stock-control-register", "Stock Control Register", "inventory", "Prepared counts, write-offs and condition releases with source/approval status.", "inventory", ["stockControl", "product", "status"], ["inspection", "correction"]),
  table("stock-count-variance", "Stock Counts & Variance", "inventory", "Physical counts, book quantities, investigated variance and posted cost impact.", "inventory", ["stockControl", "product", "status"], ["surplus", "shortage"]),
  table("stock-writeoffs", "Stock Write-offs", "inventory", "Approved physical write-offs and their saved inventory loss postings.", "inventory", ["stockControl", "product", "status"], ["damage", "loss"]),
  table("stock-condition-history", "Stock Condition Releases", "inventory", "Inspected whole-batch condition releases without rewriting original sources.", "inventory", ["stockControl", "product", "status"], ["quarantine", "inspection"]),
  table("expiry-report", "Expiry Attention", "inventory", "Expired and near-expiry batches requiring action.", "inventory", ["product", "status"], ["warning"]),

  table("monthly-ac-summary", "Monthly A/C Summary", "accounts", "Operating and non-operating cash summary for any period.", "accounts", [], ["monthly"]),
  table("daily-expenditure", "Daily Expenditure", "accounts", "Posted expenses with category, person and payment account.", "accounts", ["employee", "account"], ["expense"]),
  table("monthly-category", "Expense Category Summary", "accounts", "Posted expense totals grouped by category.", "accounts", [], ["category"]),
  table("expense-by-person", "Expense by Person", "accounts", "Employee-attributed operating expenditure.", "accounts", ["employee"], ["staff"]),
  table("expense-by-unit", "Expense by Unit", "accounts", "Operating expense by office, warehouse or company.", "accounts", [], ["office"]),
  table("monthly-expense", "Monthly Expense", "accounts", "Posted operating expense grouped by month.", "accounts", [], ["month"]),
  table("ta-da", "TA/DA Report", "accounts", "Approved travel and daily allowance detail.", "accounts", ["employee"], ["allowance"]),
  table("account-transactions", "All Account Transactions", "accounts", "Complete cash, bank and mobile transaction ledger.", "accounts", ["account"], ["ledger"]),
  table("day-book", "Day Book", "accounts", "Chronological account movement with source and reference.", "accounts", ["account"], ["transaction"]),
  table("cash-transactions", "Cash Transactions", "accounts", "Transactions posted through cash accounts.", "accounts", ["account"], ["cash"]),
  table("bank-transactions", "Bank Transactions", "accounts", "Transactions posted through bank accounts.", "accounts", ["account"], ["bank"]),
  table("mobile-banking-transactions", "Mobile Banking Transactions", "accounts", "Transactions posted through mobile-banking accounts.", "accounts", ["account"], ["bkash"]),
  table("cash-movement-summary", "Cash & Bank Movement Summary", "accounts", "Inflow, outflow and net movement by account.", "accounts", ["account"], ["flow"]),
  table("balance-sheet", "Balance Sheet", "accounts", "As-of-date financial position with source and reconciliation status.", "accounts", [], ["assets", "liabilities", "equity"], "view_financial_position"),
  table("ledger-trial-balance", "General Ledger Trial Balance", "accounts", "Posted debit, credit and net balance by chart account.", "accounts", ["account"], ["double-entry", "trial"], "view_sensitive_cost"),
  table("ledger-income-statement", "General Ledger Income Statement", "accounts", "Posted income, cost, operating expense and payroll contribution to profit or loss.", "accounts", [], ["profit", "loss", "income", "payroll"], "view_sensitive_cost"),
  table("ledger-account-statement", "General Ledger Account Statement", "accounts", "Posted journal lines and running chart-account balances.", "accounts", ["account"], ["journal", "statement"], "view_sensitive_cost"),
  table("ledger-control-reconciliation", "General Ledger Control Reconciliation", "accounts", "Compare stock, receivables, payables and cash journals with approved ledger mappings.", "accounts", [], ["reconciliation", "control"], "view_sensitive_cost"),

  table("employee-list", "Employee List", "employees", "Printable employee roster with assignment and system role.", "marketing", ["employee", "territory", "status"], ["directory"]),
  performance("salesperson-performance", "Sales Team Comparison", "Comparison of sales, collections, customers and activity.", ["salesperson", "territory"]),
  performance("employee-performance", "Employee Performance", "Named employee operational and marketing performance.", ["employee", "territory"]),
  activity("employee-activity", "Employee Activity", "Daily, weekly, monthly or custom employee activity report."),
  marketing("daily-marketing", "Daily Marketing Activity", "Field and office marketing activity by date and employee.", "today"),
  marketing("lead-funnel", "Lead Funnel", "Lead volume and progression by pipeline stage.", "funnel"),
  marketing("follow-up-status", "Follow-up Status", "Pending, completed and overdue follow-up work.", "week"),
  marketing("target-actual", "Target vs Actual", "Activity, sales, visit and collection progress.", "target"),
  { ...marketing("visit-verification", "Field Visit Report", "Recorded check-ins, capture quality, independent review and outcomes. Not attendance proof.", "verification"), filters: ["employee", "territory", "customer", "lead", "status", "captureQuality", "reviewStatus"] },

  table("audit-trail", "Audit Trail", "controls", "Protected actions, actors and recorded reasons.", "accounts", [], ["audit"]),
  table("access-change-audit", "Access Change Audit", "controls", "Role, permission and capability changes.", "accounts", [], ["security"]),
  table("fifo-override-audit", "FIFO Override / Stock Exceptions", "controls", "Authorized FIFO overrides and stock exception reasons.", "accounts", [], ["batch", "control"])
];

function sourceGroup(category: ReportCategoryId): ReportSourceGroup {
  if (category === "inventory") return "inventory";
  if (category === "suppliers") return "imports";
  if (category === "accounts") return "expenses";
  if (category === "employees") return "employees";
  if (category === "controls") return "controls";
  return "sales";
}

function table(id: string, title: string, category: ReportCategoryId, description: string, permission: PermissionKey, filters: ReportFilterKey[], keywords: string[], capability?: Capability, supportsGrouping = false): ReportDefinition {
  return { id, title, category, description, keywords, source: "table", sourceGroup: sourceGroup(category), tableId: id, filters, printable: true, exportable: true, permission: { key: permission, action: "view" }, capability, supportsGrouping };
}

function performance(id: string, title: string, description: string, filters: ReportFilterKey[]): ReportDefinition {
  return { id, title, category: "employees", description, keywords: ["employee", "performance"], source: "performance", filters, printable: true, exportable: true, permission: { key: "marketing", action: "view" } };
}

function activity(id: string, title: string, description: string): ReportDefinition {
  return { id, title, category: "employees", description, keywords: ["daily", "weekly", "monthly"], source: "employee-activity", filters: ["employee"], printable: true, exportable: true, permission: { key: "marketing", action: "view" } };
}

function marketing(id: string, title: string, description: string, marketingPreset: string): ReportDefinition {
  return { id, title, category: "employees", description, keywords: ["field", "marketing"], source: "marketing", filters: ["employee", "territory"], printable: true, exportable: true, permission: { key: "marketing", action: "view" }, marketingPreset };
}

export const reportCatalog = reports;

export function visibleReportCatalog(user: User | null | undefined, persistent = false) {
  const persistentOnly = new Set(["stock-holds", "stock-control-register", "stock-count-variance", "stock-writeoffs", "stock-condition-history", "stock-return-register", "customer-return-credit", "return-settlements"]);
  return reportCatalog.filter((report) => ["supplier-claims","supplier-replacements","supplier-replacement-receipts"].includes(report.id)?persistent&&hasEffectivePermission(user,"reports")&&(["import","inventory","accounts"] as const).some(k=>hasEffectivePermission(user,k)):report.id.startsWith("payroll-")?persistent&&canReadPayroll(user)&&hasEffectivePermission(user,"reports"):(!persistentOnly.has(report.id) || persistent) && (!report.id.startsWith("ledger-") || persistent && canReadLedger(user)) && hasEffectivePermission(user, report.permission.key, report.permission.action) && (!report.capability || hasCapability(user, report.capability)));
}

export function reportSearchText(report: ReportDefinition) {
  const category = reportCategories.find((entry) => entry.id === report.category)?.title ?? report.category;
  return [report.title, report.description, category, ...report.keywords].join(" ").toLowerCase();
}
