import assert from "node:assert/strict";
import test from "node:test";
import type { ReportTable } from "../erp.types";
import { appendReportFilters, filterReportRows, readReportFilters, reportFilterOptions } from "./reportFilters";

const table: ReportTable = {
  id: "sales-order-register",
  title: "Sales Order Register",
  columns: [
    { key: "order", label: "Order" },
    { key: "customer", label: "Customer" },
    { key: "salesperson", label: "Salesperson" },
    { key: "status", label: "Status" }
  ],
  rows: [
    { order: "SO-001", customer: "Labaid", salesperson: "Rafiq", status: "Open" },
    { order: "SO-002", customer: "Popular", salesperson: "Rafiq", status: "Delivered" },
    { order: "SO-003", customer: "Labaid", salesperson: "Shamima", status: "Open" }
  ]
};
test("supplier claim filters round-trip and isolate one source document",()=>{const filters={supplierClaim:"claim-1"};const params=new URLSearchParams();appendReportFilters(params,filters);assert.deepEqual(readReportFilters(params),filters);const report:ReportTable={id:"supplier-claims",title:"Claims",columns:[{key:"supplierClaim",label:"Claim"}],rows:[{supplierClaim:"claim-1"},{supplierClaim:"claim-2"}]};assert.equal(filterReportRows(report,filters).length,1);});

test("report filters combine dimensions without changing source rows", () => {
  const filtered = filterReportRows(table, { customer: "Labaid", salesperson: "Rafiq", status: "Open" });
  assert.deepEqual(filtered.map((row) => row.order), ["SO-001"]);
  assert.equal(table.rows.length, 3);
});

test("report filter options are unique and sorted", () => {
  assert.deepEqual(reportFilterOptions(table, "customer"), ["Labaid", "Popular"]);
});

test("expense filters accept the API's visible party and payment-account fields", () => {
  const expenses: ReportTable = {
    id: "daily-expenditure",
    title: "Daily Expenditure",
    columns: [],
    rows: [
      { expenseFor: "Rafiq Ahmed", employee: "Rafiq Ahmed", paidFrom: "Petty Cash", account: "Petty Cash" },
      { expenseFor: "Head Office", employee: "", paidFrom: "DBBL Current Account", account: "DBBL Current Account" }
    ]
  };
  assert.deepEqual(reportFilterOptions(expenses, "employee"), ["Rafiq Ahmed"]);
  assert.deepEqual(reportFilterOptions(expenses, "account"), ["DBBL Current Account", "Petty Cash"]);
  assert.equal(filterReportRows(expenses, { account: "Petty Cash", employee: "Rafiq Ahmed" }).length, 1);
});

test("report filters round-trip through print and deep-link query parameters", () => {
  const params = new URLSearchParams();
  appendReportFilters(params, { customer: "Labaid", status: "Open" });
  assert.deepEqual(readReportFilters(params), { customer: "Labaid", status: "Open" });
});

test("order filters persist into print links and isolate one order", () => {
  const params = new URLSearchParams();
  appendReportFilters(params, { order: "SO-001", customer: "Labaid" });
  assert.deepEqual(readReportFilters(params), { order: "SO-001", customer: "Labaid" });
  assert.deepEqual(reportFilterOptions(table, "order"), ["SO-001", "SO-002", "SO-003"]);
  assert.deepEqual(filterReportRows(table, readReportFilters(params)).map((row) => row.order), ["SO-001"]);
});
