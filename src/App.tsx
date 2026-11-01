import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { ProtectedRoute, RequireAnyPermission, RequireEmployeeHubAccess, RequirePermission, RequireSettingsAccess,RequirePayrollAccess } from "./components/layout/RouteGuards";
import ForgotPasswordPage from "./features/auth/ForgotPasswordPage";
import LoginPage from "./features/auth/LoginPage";
import ResetPasswordPage from "./features/auth/ResetPasswordPage";
import PublicLayout from "./features/public/PublicLayout";
import type { PermissionKey } from "./types";
import BackendWorkspace from "./features/auth/BackendWorkspace";
import { foundationMode, workspacePath } from "./lib/runtime";

const HomePage = lazy(() => import("./features/public/HomePage"));
const AboutPage = lazy(() => import("./features/public/AboutPage"));
const ProductsPage = lazy(() => import("./features/public/ProductsPage"));
const ProductDetailPage = lazy(() => import("./features/public/ProductDetailPage"));
const CertificatesPage = lazy(() => import("./features/public/CertificatesPage"));
const NewsPage = lazy(() => import("./features/public/NewsPage"));
const ResourceDetailPage = lazy(() => import("./features/public/ResourceDetailPage"));
const ContactPage = lazy(() => import("./features/public/ContactPage"));
const LegacyProductRedirect = lazy(() => import("./features/public/LegacyProductRedirect"));
const AccountsPage = lazy(() => import("./domains/accounts/AccountsPage"));
const ImportWorkspacePage = lazy(() => import("./domains/imports/ImportWorkspacePage"));
const ImportsPage = lazy(() => import("./domains/imports/ImportsPage"));
const NewImportPage = lazy(() => import("./domains/imports/NewImportPage"));
const InventoryPage = lazy(() => import("./domains/inventory/InventoryPage"));
const PersistentInventoryPage = lazy(() => import("./domains/inventory/PersistentInventoryPage"));
const StockHoldsPage = lazy(() => import("./domains/inventory/StockHoldsPage"));
const StockControlsPage = lazy(() => import("./domains/inventory/StockControlsPage"));
const StockControlWorkspacePage = lazy(() => import("./domains/inventory/StockControlWorkspacePage"));
const ReturnsPage = lazy(() => import("./domains/sales/ReturnsPage"));
const ClaimsPage = lazy(() => import("./domains/claims/ClaimsPage"));
const ClaimWorkspacePage = lazy(() => import("./domains/claims/ClaimWorkspacePage"));
const ReturnWorkspacePage = lazy(() => import("./domains/sales/ReturnWorkspacePage"));
const OpeningDataPage = lazy(() => import("./domains/opening/OpeningDataPage"));
const ApprovalInboxPage = lazy(() => import("./domains/controls/ApprovalInboxPage"));
const ApprovalPoliciesPage = lazy(() => import("./domains/controls/ApprovalPoliciesPage"));
const LedgerPage = lazy(() => import("./domains/ledger/LedgerPage"));
const JournalWorkspacePage = lazy(() => import("./domains/ledger/JournalWorkspacePage"));
const PrintPage = lazy(() => import("./domains/print/PrintPage"));
const ReportsPage = lazy(() => import("./domains/reports/ReportsPage"));
const ReportDetailPage = lazy(() => import("./domains/reports/ReportDetailPage"));
const SalesPage = lazy(() => foundationMode ? import("./domains/sales/PersistentSalesPage") : import("./domains/sales/SalesPage"));
const SalesOrderWorkspacePage = lazy(() => import("./domains/sales/SalesOrderWorkspacePage"));
const EmployeesPage = lazy(() => import("./domains/employees/EmployeesPage"));
const SettingsPage = lazy(() => import("./domains/settings/SettingsPage"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const ProfilePage = lazy(() => import("./features/users/ProfilePage"));
const BackendMastersPage = lazy(() => import("./features/auth/BackendMastersPage"));
const BackendPrintSettings = lazy(() => import("./features/auth/BackendPrintSettings"));
const PersistentDashboard = lazy(() => import("./domains/dashboard/PersistentDashboard"));
const OperationalSettingsPage = lazy(() => import("./domains/settings/OperationalSettingsPage"));
const LaunchChecksPage = lazy(() => import("./domains/settings/LaunchChecksPage"));
const InvitationQueuePage = lazy(() => import("./domains/employees/InvitationQueuePage"));
const PayrollPage=lazy(()=>import("./domains/payroll/PayrollPage"));
const PayrollRunWorkspacePage=lazy(()=>import("./domains/payroll/PayrollRunWorkspacePage"));
const MyPayslipsPage=lazy(()=>import("./domains/payroll/MyPayslipsPage"));
const SmartInsightsPage = lazy(() => import("./components/ai/SmartInsightsPage"));

const deferred = (element: ReactNode) => (
  <Suspense fallback={<div className="grid min-h-64 place-items-center rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-500">Loading workspace...</div>}>
    {element}
  </Suspense>
);

const guarded = (permission: PermissionKey, element: ReactNode) => (
  <RequirePermission permission={permission}>{deferred(element)}</RequirePermission>
);

function SettingsEntry() {
  const location = useLocation();
  if (new URLSearchParams(location.search).get("view") === "users") return <Navigate to="/app/employees?view=directory" replace />;
  return <RequireSettingsAccess>{deferred(<SettingsPage />)}</RequireSettingsAccess>;
}

function PersistentWorkspaceAlias() {
  const { pathname, search, hash } = useLocation();
  let path = pathname === "/app" || pathname === "/app/dashboard" ? "/backend" : workspacePath(pathname);
  if (path === "/backend/settings" && new URLSearchParams(search).get("view") === "users") path = "/backend/employees";
  return <Navigate to={path + search + hash} replace />;
}

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={deferred(<HomePage />)} />
        <Route path="/about" element={deferred(<AboutPage />)} />
        <Route path="/products" element={deferred(<ProductsPage />)} />
        <Route path="/products/:slug" element={deferred(<ProductDetailPage />)} />
        <Route path="/certificates" element={deferred(<CertificatesPage />)} />
        <Route path="/news" element={deferred(<NewsPage />)} />
        <Route path="/news/:slug" element={deferred(<ResourceDetailPage />)} />
        <Route path="/contact" element={deferred(<ContactPage />)} />
      </Route>
      <Route path="/product/:legacySlug" element={deferred(<LegacyProductRedirect />)} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signin" element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        {foundationMode ? <Route path="/backend" element={<BackendWorkspace />}>
          <Route index element={guarded("dashboard", <PersistentDashboard />)} />
          <Route path="profile" element={deferred(<ProfilePage />)} />
          <Route path="payslips" element={deferred(<MyPayslipsPage/>)} />
          <Route path="payroll" element={<RequirePayrollAccess>{deferred(<PayrollPage/>)}</RequirePayrollAccess>} />
          <Route path="payroll/runs/:runId" element={<RequirePayrollAccess>{deferred(<PayrollRunWorkspacePage/>)}</RequirePayrollAccess>} />
          <Route path="imports" element={guarded("import", <ImportsPage />)} />
          <Route path="imports/new" element={<RequirePermission permission="import" action="create">{deferred(<NewImportPage />)}</RequirePermission>} />
          <Route path="imports/:importId" element={guarded("import", <ImportWorkspacePage />)} />
          <Route path="inventory" element={guarded("inventory", <PersistentInventoryPage />)} />
          <Route path="inventory/holds" element={guarded("inventory", <StockHoldsPage />)} />
          <Route path="inventory/controls" element={guarded("inventory", <StockControlsPage />)} />
          <Route path="inventory/controls/:controlId" element={guarded("inventory", <StockControlWorkspacePage />)} />
          <Route path="returns" element={<RequireAnyPermission permissions={["sales","inventory"]}>{deferred(<ReturnsPage/>)}</RequireAnyPermission>}/>
          <Route path="supplier-claims" element={<RequireAnyPermission permissions={["import","inventory","accounts"]}>{deferred(<ClaimsPage/>)}</RequireAnyPermission>}/>
          <Route path="supplier-claims/:claimId" element={<RequireAnyPermission permissions={["import","inventory","accounts"]}>{deferred(<ClaimWorkspacePage/>)}</RequireAnyPermission>}/>
          <Route path="returns/:returnId" element={<RequireAnyPermission permissions={["sales","inventory"]}>{deferred(<ReturnWorkspacePage/>)}</RequireAnyPermission>}/>
          <Route path="sales" element={<RequireAnyPermission permissions={["sales", "marketing"]}>{deferred(<SalesPage />)}</RequireAnyPermission>} />
          <Route path="employees" element={<RequireEmployeeHubAccess>{deferred(<EmployeesPage />)}</RequireEmployeeHubAccess>} />
          <Route path="employees/invitations" element={<RequirePermission permission="users" action="create">{deferred(<InvitationQueuePage />)}</RequirePermission>} />
          <Route path="sales/orders/:orderId" element={guarded("sales", <SalesOrderWorkspacePage />)} />
          <Route path="accounts" element={guarded("accounts", <AccountsPage />)} />
          <Route path="accounts/ledger" element={guarded("accounts", <LedgerPage />)} />
          <Route path="accounts/ledger/journals/:journalId" element={guarded("accounts", <JournalWorkspacePage />)} />
          <Route path="approvals" element={deferred(<ApprovalInboxPage />)} />
          <Route path="reports" element={guarded("reports", <ReportsPage />)} />
          <Route path="reports/:reportId" element={guarded("reports", <ReportDetailPage />)} />
          <Route path="print/:documentType/:id" element={guarded("print", <PrintPage />)} />
          <Route path="settings" element={<RequireAnyPermission permissions={["products", "suppliers", "settings", "accounts"]}>{deferred(<BackendMastersPage />)}</RequireAnyPermission>} />
          <Route path="settings/print" element={guarded("settings", <BackendPrintSettings />)} />
          <Route path="settings/operations" element={guarded("settings", <OperationalSettingsPage />)} />
          <Route path="settings/launch" element={guarded("settings", <LaunchChecksPage />)} />
          <Route path="settings/approvals" element={guarded("settings", <ApprovalPoliciesPage />)} />
          <Route path="settings/opening" element={guarded("settings", <OpeningDataPage />)} />
          <Route path="settings/opening/:draftId" element={guarded("settings", <OpeningDataPage />)} />
          <Route path="*" element={<Navigate to="/backend" replace />} />
        </Route> : null}
        <Route path="/app" element={foundationMode ? <PersistentWorkspaceAlias /> : <AppLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={guarded("dashboard", <DashboardPage />)} />
          <Route path="imports" element={guarded("import", <ImportsPage />)} />
          <Route path="imports/new" element={<RequirePermission permission="import" action="create">{deferred(<NewImportPage />)}</RequirePermission>} />
          <Route path="imports/:importId" element={guarded("import", <ImportWorkspacePage />)} />
          <Route path="inventory" element={guarded("inventory", <InventoryPage />)} />
          <Route path="sales" element={<RequireAnyPermission permissions={["sales", "marketing"]}>{deferred(<SalesPage />)}</RequireAnyPermission>} />
          <Route path="sales/orders/:orderId" element={guarded("sales", <SalesOrderWorkspacePage />)} />
          <Route path="accounts" element={guarded("accounts", <AccountsPage />)} />
          <Route path="employees" element={<RequireEmployeeHubAccess>{deferred(<EmployeesPage />)}</RequireEmployeeHubAccess>} />
          <Route path="reports" element={guarded("reports", <ReportsPage />)} />
          <Route path="reports/:reportId" element={guarded("reports", <ReportDetailPage />)} />
          <Route path="settings" element={<SettingsEntry />} />
          <Route path="insights" element={guarded("dashboard", <SmartInsightsPage />)} />
          <Route path="profile" element={deferred(<ProfilePage />)} />
          <Route path="print/:documentType/:id" element={guarded("print", <PrintPage />)} />

          <Route path="procurement/*" element={<Navigate to="/app/imports" replace />} />
          <Route path="import/*" element={<Navigate to="/app/imports" replace />} />
          <Route path="customs/*" element={<Navigate to="/app/imports" replace />} />
          <Route path="warehouse/grn" element={<Navigate to="/app/imports" replace />} />
          <Route path="warehouse/*" element={<Navigate to="/app/inventory" replace />} />
          <Route path="inventory/*" element={<Navigate to="/app/inventory" replace />} />
          <Route path="sales/*" element={<Navigate to="/app/sales" replace />} />
          <Route path="accounts/*" element={<Navigate to="/app/accounts" replace />} />
          <Route path="expenses/*" element={<Navigate to="/app/accounts" replace />} />
          <Route path="audit/*" element={<Navigate to="/app/reports" replace />} />
          <Route path="users/*" element={<Navigate to="/app/employees?view=directory" replace />} />
          <Route path="roles/*" element={<Navigate to="/app/employees?view=access" replace />} />
          <Route path="master/*" element={<Navigate to="/app/settings" replace />} />
          <Route path="products/*" element={<Navigate to="/app/settings?view=products" replace />} />
          <Route path="suppliers/*" element={<Navigate to="/app/settings?view=suppliers" replace />} />
          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
