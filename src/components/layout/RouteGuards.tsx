import { LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import Button from "../ui/Button";
import { useAuthStore, useEffectiveRole } from "../../lib/auth/session";
import { ApiRequestError } from "../../lib/api/client";
import { canAccessEmployeeHub, canAccessSettings, hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import type { PermissionAction, PermissionKey } from "../../types";
import { foundationMode } from "../../lib/runtime";
import MfaSecurityGate from "../../features/auth/MfaSecurity";
import { canReadPayroll } from "../../domains/ledger/access";

export function ProtectedRoute() {
  const session = useAuthStore((state) => state.session);
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const sessionUserId = session?.user.id;
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState("");

  const verify = useCallback(async (showLoading: boolean) => {
    if (!sessionUserId) return;
    if (showLoading) setVerifiedUserId(null);
    setVerificationError("");
    try {
      await refreshSession();
      setVerifiedUserId(sessionUserId);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        logout();
        return;
      }
      setVerificationError(error instanceof Error ? error.message : "The current access profile could not be verified.");
    }
  }, [logout, refreshSession, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) return;
    void verify(true);
  }, [sessionUserId, verify]);

  useEffect(() => {
    if (!sessionUserId) return;
    const handleFocus = () => void verify(false);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [sessionUserId, verify]);

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (verificationError) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <section className="w-full max-w-lg rounded-md border border-rose-200 bg-white p-6 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-8 w-8 text-rose-700" />
          <h1 className="mt-3 text-xl font-bold text-slate-950">Could not verify this session</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{verificationError}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void verify(true)}>Try again</Button>
            <Button onClick={logout}>Sign out</Button>
          </div>
        </section>
      </main>
    );
  }

  if (verifiedUserId !== session.user.id) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-600"><span className="flex items-center gap-2"><LoaderCircle className="h-5 w-5 animate-spin text-cyan-700" />Checking current access...</span></div>;
  }

  if (foundationMode && session.security?.required && session.security.assurance !== "aal2") return <MfaSecurityGate />;
  return <Outlet />;
}

export function RequirePermission({ permission, action = "view", children }: { permission: PermissionKey; action?: PermissionAction; children: ReactNode }) {
  const user = useAuthStore((state) => state.session?.user);

  if (!hasEffectivePermission(user, permission, action)) {
    return <AccessDenied permission={permission} />;
  }

  return <>{children}</>;
}

export function RequireAnyPermission({ permissions, action = "view", children }: { permissions: PermissionKey[]; action?: PermissionAction; children: ReactNode }) {
  const user = useAuthStore((state) => state.session?.user);
  if (!permissions.some((permission) => hasEffectivePermission(user, permission, action))) return <AccessDenied />;
  return <>{children}</>;
}

export function RequireSettingsAccess({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.session?.user);
  return canAccessSettings(user) ? <>{children}</> : <AccessDenied permission="settings" />;
}

export function RequireEmployeeHubAccess({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.session?.user);
  return canAccessEmployeeHub(user) ? <>{children}</> : <AccessDenied />;
}
export function RequirePayrollAccess({children}:{children:ReactNode}){
  const user=useAuthStore(s=>s.session?.user);
  return canReadPayroll(user)?<>{children}</>:<AccessDenied/>;
}

export function AccessDenied({ permission }: { permission?: PermissionKey }) {
  const navigate = useNavigate();
  const role = useEffectiveRole();

  return (
    <div className="mx-auto mt-12 max-w-2xl rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-rose-50 text-rose-700">
        <LockKeyhole className="h-7 w-7" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-slate-950">Access denied</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Your current {role} access profile cannot view {permission ? permission.replace("-", " ") : "this module"}.
        Sign in with an authorized user. Role defaults, personal exceptions and sensitive capabilities are controlled in Employees.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="primary" onClick={() => navigate(foundationMode ? "/backend" : "/app/dashboard")}>
          Go to overview
        </Button>
        <Button onClick={() => navigate("/login")}>Switch user</Button>
      </div>
    </div>
  );
}
