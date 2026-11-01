import type { ReportTable } from "../erp.types";
import type { ReportFilterKey } from "./reportCatalog";

export const reportFilterLabels: Record<ReportFilterKey, string> = {
  order: "Sales Order",
  stockControl: "Stock Control Document",
  returnId: "Return / Credit Note",
  payrollRun: "Payroll Run",
  supplierClaim: "Supplier Claim",
  salesperson: "Salesperson",
  customer: "Customer / Buyer",
  product: "Product",
  family: "Product Family",
  supplier: "Supplier / Seller",
  employee: "Employee",
  account: "Account",
  territory: "Territory",
  status: "Status",
  lead: "Lead / Prospect",
  captureQuality: "Location Quality",
  reviewStatus: "Review Decision"
};

const rowKeys: Record<ReportFilterKey, string[]> = {
  order: ["order"],
  stockControl: ["stockControl"],
  returnId: ["returnId"],
  payrollRun: ["payrollRun"],
  supplierClaim: ["supplierClaim"],
  salesperson: ["salesperson"],
  customer: ["customer"],
  product: ["product"],
  family: ["family"],
  supplier: ["supplier"],
  employee: ["employee"],
  account: ["account", "paidFrom"],
  territory: ["territory"],
  status: ["status", "type"],
  lead: ["lead"],
  captureQuality: ["captureQuality"],
  reviewStatus: ["reviewStatus"]
};

export type ReportFilterValues = Partial<Record<ReportFilterKey, string>>;

export function filterReportRows(table: ReportTable, filters: ReportFilterValues) {
  return table.rows.filter((row) => Object.entries(filters).every(([filter, selected]) => {
    if (!selected) return true;
    return rowKeys[filter as ReportFilterKey].some((key) => row[key] === selected);
  }));
}

export function reportFilterOptions(table: ReportTable, filter: ReportFilterKey) {
  return [...new Set(rowKeys[filter].flatMap((key) => table.rows.map((row) => row[key]).filter(Boolean)))].sort((left, right) => left.localeCompare(right));
}

export function readReportFilters(params: URLSearchParams): ReportFilterValues {
  return (Object.keys(reportFilterLabels) as ReportFilterKey[]).reduce<ReportFilterValues>((values, key) => {
    const value = params.get(`filter.${key}`);
    if (value) values[key] = value;
    return values;
  }, {});
}

export function appendReportFilters(params: URLSearchParams, filters: ReportFilterValues) {
  for (const [key, value] of Object.entries(filters)) if (value) params.set(`filter.${key}`, value);
}
