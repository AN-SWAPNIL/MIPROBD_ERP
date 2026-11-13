import type { ledgerMappingRoles } from "./contracts.js";

type Role = typeof ledgerMappingRoles[number];
export const ledgerBusinessGroups: { id: string; title: string; roles: readonly Role[] }[] = [
  { id: "stock", title: "Stock & imports", roles: ["Inventory", "Inventory Clearing", "Stock Loss", "Stock Gain"] },
  { id: "sales", title: "Sales & customers", roles: ["Receivables", "Sales", "Sales Returns", "COGS"] },
  { id: "suppliers", title: "Suppliers", roles: ["Payables", "Supplier Advances", "Supplier Claims"] },
  { id: "expenses", title: "Expenses & funding", roles: ["Operating Expense", "Company Loans"] },
  { id: "employees", title: "Employees & payroll", roles: ["Payroll Expense", "Payroll Payable", "Employee Advances", "Employee Loans", "Payroll Deductions"] },
  { id: "cash", title: "Cash & bank", roles: [] },
  { id: "equity", title: "Owner's equity", roles: [] }
];
export const ledgerBusinessGroup = (key: string) => key.startsWith("cash:") ? "cash" : key.startsWith("equity:") ? "equity" : ledgerBusinessGroups.find(g => g.roles.some(role => role === key))?.id;
export const ledgerPurposeLabel = (key: string) => ({ COGS: "Cost of goods sold", Receivables: "Customer dues", Payables: "Supplier dues", "Inventory Clearing": "Stock receipt clearing" })[key] ?? key;
