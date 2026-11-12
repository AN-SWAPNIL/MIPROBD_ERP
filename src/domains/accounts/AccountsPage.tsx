import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Banknote, CreditCard, Eye, FileBarChart, Landmark, Plus, Printer, RotateCcw, Save, Search, WalletCards } from "lucide-react";
import Decimal from "decimal.js";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import DocumentViewer from "../../components/documents/DocumentViewer";
import ExpenseEntryForm from "./ExpenseEntryForm";
import ExpenseCategoriesForm from "./ExpenseCategoriesForm";
import MasterSelect from "../masters/MasterSelect";
import SupplierPositionPanels from "./SupplierPositionPanels";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { ErrorBlock, LoadingBlock, Modal, Panel, Segmented, TableFrame, inputClass, labelClass, textareaClass } from "../components";
import type { AccountTransaction, DocumentRecord, FinancialPositionEntry, Supplier, SupplierSettlement } from "../erp.types";
import { accountsService, employeeService, salesService } from "../services";
import { useAuthStore } from "../../lib/auth/session";
import { businessDate } from "../../lib/date";
import { hasCapability, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import { formatMoney as formatCurrency } from "../../utils/precise";
import SalesReferenceLink from "../sales/SalesReferenceLink";
import { foundationMode, workspacePath } from "../../lib/runtime";
import { canReadLedger,canReadPayroll } from "../ledger/access";

type View = "expenses" | "accounts" | "transactions" | "dues" | "position";
type Task = { run: () => Promise<unknown>; success: string };
type ReversalTarget = { kind: "expense" | "supplier" | "position" | "voucher"; id: string; label: string; amount: string };
const Money = Decimal.clone({ precision: 48, rounding: Decimal.ROUND_HALF_UP });
const total = (amounts: string[]) => amounts.reduce((sum, amount) => sum.plus(amount), new Money(0)).toFixed(2);

export default function AccountsPage() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const initialView = (["expenses", "accounts", "transactions", "dues", "position"] as View[]).includes(requestedView as View) ? requestedView as View : "expenses";
  const [view, setViewState] = useState<View>(initialView);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [reversing, setReversing] = useState<ReversalTarget | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [viewingDocument, setViewingDocument] = useState<DocumentRecord | null>(null);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const [search, setSearch] = useState("");
  const user = useAuthStore((state) => state.session?.user);
  const route = useNavigate();
  const navigate = (path: string) => route(workspacePath(path));
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const canPost = hasEffectivePermission(user, "accounts", "post");
  const canViewReports = hasEffectivePermission(user, "reports", "view");
  const canPrint = hasEffectivePermission(user, "print", "view");
  const canViewCustomers = hasEffectivePermission(user, "customers", "view");
  const canViewSales = hasEffectivePermission(user, "sales", "view");
  const canCreateCategory = hasEffectivePermission(user, "settings", "create");
  const canPostCollection = canViewSales && hasEffectivePermission(user, "sales", "post");
  const canViewPosition = hasCapability(user, "view_financial_position");

  const setView = (next: View) => {
    setViewState(next);
    setParams({ view: next }, { replace: true });
  };

  useEffect(() => {
    if ((["expenses", "accounts", "transactions", "dues", "position"] as View[]).includes(requestedView as View) && requestedView !== view) setViewState(requestedView as View);
  }, [requestedView, view]);

  useEffect(() => {
    if (params.get("action") !== "expense") return;
    if (canPost) {
      setViewState("expenses");
      setExpenseOpen(true);
    }
    const next = new URLSearchParams(params);
    next.delete("action");
    next.set("view", "expenses");
    setParams(next, { replace: true });
  }, [canPost, params, setParams]);

  const expenseQuery = useQuery({ queryKey: ["accounts", "expenses"], queryFn: accountsService.expenses });
  const categoriesQuery = useQuery({ queryKey: ["accounts", "categories"], queryFn: accountsService.categories });
  const accountsQuery = useQuery({ queryKey: ["accounts", "cash-bank"], queryFn: accountsService.accounts });
  const transactionsQuery = useQuery({ queryKey: ["accounts", "transactions"], queryFn: accountsService.transactions });
  const customersQuery = useQuery({ queryKey: ["sales", "customers"], queryFn: salesService.customers, enabled: canViewCustomers });
  const collectionsQuery = useQuery({ queryKey: ["sales", "collections"], queryFn: salesService.collections, enabled: canViewSales });
  const employeesQuery = useQuery({ queryKey: ["employees", "expense-directory", user?.id], queryFn: foundationMode ? accountsService.expenseEmployees : () => employeeService.directory("all"), enabled: canPost });
  const suppliersQuery = useQuery({ queryKey: ["accounts", "suppliers"], queryFn: accountsService.suppliers });
  const settlementsQuery = useQuery({ queryKey: ["accounts", "supplier-settlements"], queryFn: accountsService.supplierSettlements });
  const positionQuery = useQuery({ queryKey: ["accounts", "financial-position"], queryFn: accountsService.financialPosition, enabled: canViewPosition });
  const importsQuery = useQuery({ queryKey: ["accounts", "import-references"], queryFn: accountsService.importReferences, enabled: foundationMode && canPost });
  const queries = [expenseQuery, categoriesQuery, accountsQuery, transactionsQuery, suppliersQuery, settlementsQuery, ...(canViewCustomers ? [customersQuery] : []), ...(canViewSales ? [collectionsQuery] : []), ...(canPost ? [employeesQuery] : []), ...(foundationMode && canPost ? [importsQuery] : []), ...(canViewPosition ? [positionQuery] : [])];
  const error = queries.find((query) => query.error)?.error;
  const refresh = () => Promise.all(["accounts", "sales", "dashboard", "reports"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  const action = useMutation({
    mutationFn: (task: Task) => task.run(),
    onSuccess: async (_data, task) => {
      await refresh();
      setExpenseOpen(false);
      setCategoryOpen(false);
      setReversing(null);
      setReverseReason("");
      setTransactionOpen(false);
      setSettlementOpen(false);
      setPositionOpen(false);
      pushToast({ kind: "success", title: task.success });
    },
    onError: (error) => pushToast({ kind: "error", title: "Accounts action failed", message: error instanceof Error ? error.message : undefined })
  });

  if (queries.some((query) => query.isLoading)) return <LoadingBlock label="Loading operational accounts" />;
  if (error) return <ErrorBlock error={error} onRetry={() => queries.forEach((query) => void query.refetch())} />;

  const expenses = expenseQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const settlements = settlementsQuery.data ?? [];
  const positionEntries = positionQuery.data ?? [];
  const postedExpenses = expenses.filter((expense) => expense.status === "Posted");
  const totalExpense = total(postedExpenses.map((expense) => expense.amount));
  const totalBalance = total(accounts.map((account) => account.balance));
  const totalDue = total(customers.map((customer) => customer.currentDue));
  const inflow = total(transactions.filter((transaction) => transaction.direction === "In").map((transaction) => transaction.amount));
  const matches = (...values: (string | undefined)[]) => values.some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleExpenses = expenses.filter((expense) => matches(expense.categoryName, expense.expenseForName, expense.remarks, expense.enteredByName));
  const visibleTransactions = transactions.filter((entry) => matches(entry.voucherNumber, entry.accountName, entry.partyName, entry.sourceType, entry.description));
  const openReversal = (target: ReversalTarget) => { setReverseReason(""); setReversing(target); };
  const reverse = () => {
    if (!reversing) return;
    const methods = { expense: accountsService.reverseExpense, supplier: accountsService.reverseSupplierSettlement, position: accountsService.reverseFinancialPosition, voucher: accountsService.reverseTransaction };
    action.mutate({ run: () => methods[reversing.kind](reversing.id, reverseReason), success: "Entry reversed; original preserved" });
  };

  return (
    <>
      <PageHeader
        eyebrow="Operational finance"
        title="Expenses & Accounts"
        subtitle="Daily expenditure, TA/DA, collections, customer dues and simple cash/bank transactions. This is not a full accounting replacement."
        actions={
          <>
            {foundationMode && canReadLedger(user) ? <Button icon={<Landmark className="h-4 w-4" />} onClick={() => navigate("/backend/accounts/ledger")}>General Ledger</Button> : null}
            {foundationMode&&hasEffectivePermission(user,"accounts")?<Button icon={<Landmark className="h-4 w-4"/>} onClick={()=>navigate("/backend/supplier-claims")}>Supplier Claims</Button>:null}
            {foundationMode&&canReadPayroll(user)?<Button icon={<WalletCards className="h-4 w-4"/>} onClick={()=>navigate("/backend/payroll")}>Payroll & Commission</Button>:null}
            {canViewReports ? <Button icon={<FileBarChart className="h-4 w-4" />} onClick={() => navigate(`/app/reports/${view === "expenses" ? "daily-expenditure" : view === "dues" ? "customer-dues" : view === "accounts" ? "cash-movement-summary" : view === "position" ? "balance-sheet" : "account-transactions"}`)}>Open Report</Button> : null}
            {view === "expenses" && canPost ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={action.isPending} onClick={() => setExpenseOpen(true)}>Post Expense</Button> : view === "transactions" && canPost ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={action.isPending} onClick={() => setTransactionOpen(true)}>Post Voucher</Button> : view === "position" && canPost ? <><Button icon={<Plus className="h-4 w-4" />} disabled={action.isPending} onClick={() => setSettlementOpen(true)}>Supplier Entry</Button>{canViewPosition ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={action.isPending} onClick={() => setPositionOpen(true)}>Position Entry</Button> : null}</> : view === "dues" && canPostCollection ? <Button icon={<Banknote className="h-4 w-4" />} onClick={() => navigate("/app/sales?view=collections")}>Post Collection</Button> : null}
          </>
        }
      />

      <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
        <strong>Clear boundary:</strong> rent, salary, office utilities, transport and TA/DA affect the selected cash/bank account only. They never enter import landed cost.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Posted expenses", formatCurrency(totalExpense), "current operating records"], ["Cash & bank", formatCurrency(totalBalance), accounts.length + " accounts"], ["Customer dues", canViewCustomers ? formatCurrency(totalDue) : "Restricted", canViewCustomers ? customers.filter((customer) => Number(customer.currentDue) > 0).length + " balances" : "customer access not assigned"], ["Ledger inflow", formatCurrency(inflow), transactions.filter((entry) => entry.direction === "In").length + " credit entries"]].map(([label, value, detail]) => <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm" key={label}><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block break-words text-xl text-slate-950">{value}</strong><small className="text-slate-400">{detail}</small></div>)}
      </div>

      <Segmented
        value={view}
        onChange={setView}
        ariaLabel="Accounts views"
        options={[
          { value: "expenses", label: "Daily Expenses", count: expenses.length },
          { value: "accounts", label: "Cash & Bank", count: accounts.length },
          { value: "transactions", label: "Account Ledger", count: transactions.length },
          { value: "dues", label: "Customer Dues & Collections", count: customers.filter((customer) => Number(customer.currentDue) > 0).length },
          { value: "position", label: canViewPosition ? "Suppliers & Position" : "Supplier Ledger", count: settlements.length + positionEntries.length }
        ]}
      />

      <label className="relative block max-w-md"><span className="sr-only">Search account records</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={inputClass + " pl-9"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search party, reference or description" /></label>

      {view === "expenses" ? (
        <Panel title="Daily expenditure" subtitle="Posted financial rows are reversed with a reason instead of being silently deleted." actions={canCreateCategory || hasEffectivePermission(user, "settings", "edit") ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCategoryOpen(true)}>Expense Categories</Button> : undefined}>
          <TableFrame>
            <table className="min-w-[1180px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Expense For</th><th className="px-4 py-3">Detail</th><th className="px-4 py-3">Paid From</th><th className="px-4 py-3">Entered By</th><th className="px-4 py-3">Attachment</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleExpenses.map((expense) => <tr className={expense.status === "Reversed" ? "opacity-55" : ""} key={expense.id}><td className="px-4 py-3 text-slate-600">{expense.date}</td><td className="px-4 py-3"><strong>{expense.categoryName}</strong><small className="block text-slate-500">{expense.subtype}</small></td><td className="px-4 py-3"><strong className="block">{expense.expenseForName}</strong><small className="text-slate-500">{expense.expenseFor}{expense.employeeCode ? ` | ${expense.employeeCode}` : ""}</small></td><td className="max-w-80 px-4 py-3"><span className="block truncate text-slate-700">{expense.remarks}</span>{expense.subtype === "TA/DA" ? <small className="text-slate-500">TA {formatCurrency(expense.taAmount ?? 0)} | DA {formatCurrency(expense.daAmount ?? 0)}</small> : null}</td><td className="px-4 py-3 text-slate-600">{accounts.find((account) => account.id === expense.paidFromAccountId)?.name ?? expense.paidFromAccountId}</td><td className="px-4 py-3 text-slate-600">{expense.enteredByName}</td><td className="px-4 py-3 text-xs text-slate-500">{expense.attachmentName ?? "-"}</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(expense.amount)}</td><td className="px-4 py-3"><StatusBadge status={expense.status} /></td><td className="px-4 py-3 text-right">{canPost && expense.status === "Posted" ? <Button variant="ghost" icon={<RotateCcw className="h-4 w-4 text-amber-700" />} aria-label={`Reverse expense ${expense.id}`} disabled={action.isPending} onClick={() => openReversal({ kind: "expense", id: expense.id, label: expense.categoryName, amount: expense.amount })}>Reverse</Button> : null}</td></tr>)}{!visibleExpenses.length ? <tr><td colSpan={10} className="p-6 text-center text-slate-500">No expenses match this search.</td></tr> : null}</tbody></table>
          </TableFrame>
          {visibleExpenses.some((expense) => expense.attachment) ? <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 p-3"><span className="mr-1 text-xs font-bold text-slate-500">Supporting files</span>{visibleExpenses.filter((expense) => expense.attachment).map((expense) => <Button variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setViewingDocument(expense.attachment!)} key={expense.id}>View {expense.attachment!.fileName}</Button>)}</div> : null}
        </Panel>
      ) : null}

      {view === "accounts" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.filter((account) => matches(account.name, account.accountNumber, account.type)).map((account) => {
            const Icon = account.type === "Cash" ? WalletCards : account.type === "Bank" ? Landmark : CreditCard;
            const recent = transactions.filter((transaction) => transaction.accountId === account.id).slice(-3).reverse();
            return <Panel key={account.id} title={account.name} subtitle={[account.type, account.accountNumber].filter(Boolean).join(" · ")} actions={<Icon className="h-5 w-5 text-red-700" />}><div className="p-4"><span className="text-xs text-slate-500">Available balance</span><strong className="mt-1 block text-3xl">{formatCurrency(account.balance)}</strong></div><div className="divide-y divide-slate-100 border-t border-slate-200">{recent.map((transaction) => <div className="flex items-center gap-3 px-4 py-2.5" key={transaction.id}>{transaction.direction === "In" ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" /> : <ArrowUpRight className="h-4 w-4 text-red-600" />}<span className="min-w-0 flex-1 truncate text-xs text-slate-600">{transaction.description}</span><strong className={"text-xs " + (transaction.direction === "In" ? "text-emerald-700" : "text-red-700")}>{transaction.direction === "In" ? "+" : "-"}{formatCurrency(transaction.amount)}</strong></div>)}</div></Panel>;
          })}
        </div>
      ) : null}

      {view === "transactions" ? (
        <Panel title="Account ledger" subtitle="Every collection, expense, advance and company loan identifies its source record and voucher.">
          <TableFrame>
            <table className="min-w-[1120px] w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Date / Voucher</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Party / Description</th><th className="px-4 py-3 text-right">In</th><th className="px-4 py-3 text-right">Out</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleTransactions.map((transaction) => <tr key={transaction.id}><td className="px-4 py-3 text-slate-600">{transaction.date}<small className="block font-semibold text-slate-900">{transaction.voucherNumber ?? "-"}</small></td><td className="px-4 py-3 font-semibold">{transaction.accountName}</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"><SalesReferenceLink type={transaction.sourceType === "Collection" ? "Collection" : undefined} id={transaction.sourceId} label={transaction.sourceType} /></span></td><td className="px-4 py-3 text-slate-600">{transaction.partyName ? <strong className="block text-slate-900">{transaction.partyName}</strong> : null}{transaction.description}{transaction.reversalOfId ? <small className="block text-amber-700">Reversal of {transactions.find((entry) => entry.id === transaction.reversalOfId)?.voucherNumber ?? "earlier entry"}</small> : transactions.some((entry) => entry.reversalOfId === transaction.id) ? <small className="block text-amber-700">Reversed; original retained</small> : null}</td><td className="px-4 py-3 text-right font-bold text-emerald-700">{transaction.direction === "In" ? formatCurrency(transaction.amount) : "-"}</td><td className="px-4 py-3 text-right font-bold text-red-700">{transaction.direction === "Out" ? formatCurrency(transaction.amount) : "-"}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-1">{canPrint && transaction.voucherNumber ? <Button variant="ghost" icon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/app/print/${transaction.direction === "In" ? "credit-voucher" : "debit-voucher"}/${transaction.id}`)} aria-label={`Print ${transaction.voucherNumber}`} title="Print voucher" /> : null}{foundationMode && canPost && !transaction.reversalOfId && !transactions.some((entry) => entry.reversalOfId === transaction.id) && ["Advance", "Company Loan", "Manual Authorized"].includes(transaction.sourceType) ? <Button variant="ghost" disabled={action.isPending} icon={<RotateCcw className="h-4 w-4" />} title="Reverse voucher" aria-label={`Reverse ${transaction.voucherNumber}`} onClick={() => openReversal({ kind: "voucher", id: transaction.id, label: transaction.voucherNumber ?? "voucher", amount: transaction.amount })} /> : null}</div></td></tr>)}{!visibleTransactions.length ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">No account transactions match this search.</td></tr> : null}</tbody></table>
          </TableFrame>
        </Panel>
      ) : null}

      {view === "dues" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Customer dues" subtitle="One current balance from each customer ledger.">
            <div className="divide-y divide-slate-100">{customers.filter((customer) => matches(customer.name, customer.phone, customer.paymentTerms)).sort((a, b) => Number(b.currentDue) - Number(a.currentDue)).map((customer) => <div className="flex items-center gap-3 px-4 py-3" key={customer.id}><span className="grid h-9 w-9 place-items-center rounded bg-red-50 text-xs font-bold text-red-700">{customer.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{customer.name}</strong><span className="text-xs text-slate-500">{customer.paymentTerms} · limit {formatCurrency(customer.creditLimit)}</span></div><strong className="text-sm text-red-700">{formatCurrency(customer.currentDue)}</strong></div>)}</div>
          </Panel>
          <Panel title="Recent collections" subtitle="Receipts post into the selected account ledger.">
            <div className="divide-y divide-slate-100">{collections.filter((entry) => entry.status === "Posted").slice(0, 10).map((collection) => <div className="flex items-center gap-3 px-4 py-3" key={collection.id}><Banknote className="h-4 w-4 text-emerald-600" /><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{collection.customerName}</strong><span className="text-xs text-slate-500">{collection.receiptNumber} · {collection.paymentMode}</span></div><strong className="text-sm text-emerald-700">{formatCurrency(collection.amount)}</strong></div>)}</div>
            <div className="border-t border-slate-200 p-3"><Button className="w-full" icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate("/app/sales?view=collections")}>Open Collection Workspace</Button></div>
          </Panel>
        </div>
      ) : null}

      {view === "position" ? <SupplierPositionPanels suppliers={suppliers} settlements={settlements} positions={positionEntries} search={search} canViewPosition={canViewPosition} canPost={canPost} busy={action.isPending} onReverse={(kind, entry) => openReversal({ ...entry, kind })} /> : null}

      <Modal open={expenseOpen} title="Post daily expense" subtitle="Choose who or which operating unit incurred the expense; Entered By comes from your login." onClose={() => setExpenseOpen(false)} width="max-w-4xl"><ExpenseEntryForm categories={categoriesQuery.data ?? []} accounts={accounts.filter((account) => account.active)} employees={(employeesQuery.data ?? []).filter((employee) => employee.status === "Active")} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => accountsService.createExpense(payload), success: "Expense posted to operational ledger" })} /></Modal>
      <Modal open={categoryOpen} title="Expense Categories" subtitle="Posted expenses preserve their original category names." onClose={() => setCategoryOpen(false)}><ExpenseCategoriesForm categories={categoriesQuery.data ?? []} busy={action.isPending} canCreate={canCreateCategory} canEdit={hasEffectivePermission(user, "settings", "edit")} onCreate={(name) => action.mutate({ run: () => accountsService.createCategory(name), success: "Expense category added" })} onUpdate={(id, payload) => action.mutate({ run: () => accountsService.updateCategory(id, payload), success: "Category updated; posted history preserved" })} /></Modal>
      <Modal open={Boolean(reversing)} title={`Reverse ${reversing?.label ?? "entry"}`} subtitle="The original posting is preserved with an explained reversal." onClose={() => setReversing(null)}>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); reverse(); }}>
          <div className="border-b border-blue-100 pb-3 text-sm"><strong>{reversing?.label}</strong><span className="ml-3">{formatCurrency(reversing?.amount ?? "0")}</span></div>
          <label><span className={labelClass}>Reversal Reason</span><textarea className={textareaClass} minLength={5} required value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></label>
          <div className="flex justify-end"><Button type="submit" variant="primary" icon={<RotateCcw className="h-4 w-4" />} disabled={action.isPending || reverseReason.trim().length < 5}>Post Reversal</Button></div>
        </form>
      </Modal>
      <Modal open={transactionOpen} title="Post debit or credit voucher" subtitle="Use Advance and Company Loan only for controlled non-expense movements. The selected direction determines the voucher type." onClose={() => setTransactionOpen(false)}><TransactionForm accounts={accounts.filter((account) => account.active)} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => accountsService.createTransaction(payload), success: "Voucher posted to account ledger" })} /></Modal>
      <Modal open={settlementOpen} title="Post supplier settlement entry" subtitle="Record an obligation or a real payment against an import, PO or supplier reference." onClose={() => setSettlementOpen(false)}><SupplierSettlementForm suppliers={suppliers.filter((supplier) => supplier.active)} accounts={accounts.filter((account) => account.active)} importReferences={importsQuery.data} busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => accountsService.createSupplierSettlement(payload), success: "Supplier settlement entry posted" })} /></Modal>
      <Modal open={positionOpen} title="Post financial-position entry" subtitle="Restricted, auditable opening or adjustment source for Balance Sheet reporting." onClose={() => setPositionOpen(false)}><FinancialPositionForm busy={action.isPending} onSubmit={(payload) => action.mutate({ run: () => accountsService.createFinancialPosition(payload), success: "Financial-position entry posted" })} /></Modal>
      <DocumentViewer document={viewingDocument} onClose={() => setViewingDocument(null)} />
    </>
  );
}

function TransactionForm({ accounts, busy, onSubmit }: { accounts: Array<{ id: string; name: string }>; busy: boolean; onSubmit: (payload: Partial<AccountTransaction>) => void }) {
  const [form, setForm] = useState({ date: businessDate(), accountId: "", sourceType: "Advance" as AccountTransaction["sourceType"], direction: "Out" as AccountTransaction["direction"], amount: "", partyName: "", reference: "", description: "", remarks: "" });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label><span className={labelClass}>Date</span><input className={inputClass} type="date" required value={form.date} onChange={(event) => change("date", event.target.value)} /></label><label><span className={labelClass}>Cash / Bank Account</span><MasterSelect kind="accounts" label="Cash / Bank Account" required value={form.accountId} onChange={(id) => change("accountId", id)} options={accounts.map((a) => ({ id: a.id, label: a.name }))} /></label><label><span className={labelClass}>Movement Type</span><select className={inputClass} value={form.sourceType} onChange={(event) => change("sourceType", event.target.value)}><option>Advance</option><option>Company Loan</option><option>Manual Authorized</option></select></label><label><span className={labelClass}>Voucher Direction</span><select aria-label="Voucher Direction" className={inputClass} value={form.direction} onChange={(event) => change("direction", event.target.value)}><option value="Out">Debit Voucher · Cash Out</option><option value="In">Credit Voucher · Cash In</option></select></label><label><span className={labelClass}>Party / Employee</span><input className={inputClass} required value={form.partyName} onChange={(event) => change("partyName", event.target.value)} /></label><label><span className={labelClass}>Amount</span><input className={inputClass} type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => change("amount", event.target.value)} /></label><label><span className={labelClass}>External Reference</span><input className={inputClass} value={form.reference} onChange={(event) => change("reference", event.target.value)} /></label><label><span className={labelClass}>Description</span><input className={inputClass} required value={form.description} onChange={(event) => change("description", event.target.value)} /></label><label className="sm:col-span-2"><span className={labelClass}>Remarks</span><textarea className={textareaClass} value={form.remarks} onChange={(event) => change("remarks", event.target.value)} /></label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Post {form.direction === "In" ? "Credit" : "Debit"} Voucher</Button></div></form>;
}


function SupplierSettlementForm({ suppliers, accounts, importReferences = [], busy, onSubmit }: { suppliers: Supplier[]; accounts: Array<{ id: string; name: string }>; importReferences?: { id: string; supplierId: string; reference: string }[]; busy: boolean; onSubmit: (payload: Partial<SupplierSettlement>) => void }) {
  const [form, setForm] = useState({ date: businessDate(), supplierId: "", importId: "", reference: "", entryType: "Obligation" as SupplierSettlement["entryType"], amount: "", accountId: "", paymentReference: "", notes: "" });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label><span className={labelClass}>Date</span><input className={inputClass} type="date" required value={form.date} onChange={(event) => change("date", event.target.value)} /></label><label><span className={labelClass}>Supplier</span><MasterSelect kind="suppliers" label="Supplier" required value={form.supplierId} onChange={(id) => setForm((current) => ({ ...current, supplierId: id, importId: "", reference: current.importId ? "" : current.reference }))} options={suppliers.map((s) => ({ id: s.id, label: s.name }))} /></label>{foundationMode ? <label className="sm:col-span-2"><span className={labelClass}>Linked Import (optional)</span><select aria-label="Linked Import" className={inputClass} value={form.importId} onChange={(event) => { const selected = importReferences.find((entry) => entry.id === event.target.value); setForm((current) => ({ ...current, importId: selected?.id ?? "", reference: selected?.reference ?? current.reference })); }}><option value="">Unlinked supplier reference</option>{importReferences.filter((entry) => entry.supplierId === form.supplierId).map((entry) => <option key={entry.id} value={entry.id}>{entry.reference}</option>)}</select></label> : null}<label><span className={labelClass}>Entry Type</span><select aria-label="Entry Type" className={inputClass} value={form.entryType} onChange={(event) => change("entryType", event.target.value)}><option>Obligation</option><option>Payment</option></select></label><label><span className={labelClass}>Import / PO / Reference</span><input className={inputClass} required value={form.reference} onChange={(event) => change("reference", event.target.value)} placeholder="LC-77612 or PO-2026-001" /></label><label><span className={labelClass}>Amount (BDT)</span><input className={inputClass} type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => change("amount", event.target.value)} /></label>{form.entryType === "Payment" ? <label><span className={labelClass}>Payment Account</span><MasterSelect kind="accounts" label="Payment Account" required value={form.accountId} onChange={(id) => change("accountId", id)} options={accounts.map((a) => ({ id: a.id, label: a.name }))} /></label> : null}{form.entryType === "Payment" ? <label><span className={labelClass}>Payment Reference</span><input className={inputClass} value={form.paymentReference} onChange={(event) => change("paymentReference", event.target.value)} /></label> : null}<label className="sm:col-span-2"><span className={labelClass}>Notes</span><textarea className={textareaClass} value={form.notes} onChange={(event) => change("notes", event.target.value)} /></label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Post Supplier Entry</Button></div></form>;
}

function FinancialPositionForm({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: Partial<FinancialPositionEntry>) => void }) {
  const [form, setForm] = useState({ asOfDate: businessDate(), category: "Owner Capital" as FinancialPositionEntry["category"], label: "", amount: "", reference: "", notes: "" });
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const categories: FinancialPositionEntry["category"][] = ["Owner Capital", "Fixed Assets", "Accumulated Depreciation", "Statutory Payables", "Other Receivables", "Other Payables", "Opening Retained Earnings"];
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}><label><span className={labelClass}>As-of Date</span><input className={inputClass} type="date" required value={form.asOfDate} onChange={(event) => change("asOfDate", event.target.value)} /></label><label><span className={labelClass}>Position Category</span><select aria-label="Position Category" className={inputClass} value={form.category} onChange={(event) => change("category", event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label><span className={labelClass}>Label</span><input className={inputClass} required value={form.label} onChange={(event) => change("label", event.target.value)} placeholder="Verified opening owner capital" /></label><label><span className={labelClass}>Amount (BDT)</span><input className={inputClass} type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => change("amount", event.target.value)} /></label><label><span className={labelClass}>Source Reference</span><input className={inputClass} required value={form.reference} onChange={(event) => change("reference", event.target.value)} placeholder="Board approval or opening schedule" /></label><label><span className={labelClass}>Notes</span><input className={inputClass} value={form.notes} onChange={(event) => change("notes", event.target.value)} /></label><div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Post Position Entry</Button></div></form>;
}
