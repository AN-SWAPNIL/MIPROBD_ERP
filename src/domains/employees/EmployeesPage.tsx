import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import FieldTeamPage from "../../components/field-team/FieldTeamPage";
import PageHeader from "../../components/ui/PageHeader";
import { useAuthStore } from "../../lib/auth/session";
import {
  canManageUserAccess,
  canViewEmployeeDirectory,
  canViewManagedEmployeeActivity
} from "../../lib/permissions/effectiveAccess";
import { LoadingBlock, Segmented } from "../components";
import EmployeeAccessWorkspace from "./EmployeeAccessWorkspace";
import EmployeeActivityPerformance from "./EmployeeActivityPerformance";
import EmployeeDirectory from "./EmployeeDirectory";
import { foundationMode } from "../../lib/runtime";
import PersistentEmployeesPage from "./PersistentEmployeesPage";

type View = "directory" | "access" | "field-team" | "activity";

export default function EmployeesPage() {
  return foundationMode ? <PersistentEmployeesPage /> : <LegacyEmployeesPage />;
}

function LegacyEmployeesPage() {
  const actor = useAuthStore((state) => state.session?.user);
  const [params, setParams] = useSearchParams();
  const requested = params.get("view") as View | null;
  const employeeId = params.get("employee") ?? undefined;
  const access = useMemo<Record<View, boolean>>(() => ({
    directory: canViewEmployeeDirectory(actor),
    access: canManageUserAccess(actor),
    "field-team": canViewManagedEmployeeActivity(actor),
    activity: canViewManagedEmployeeActivity(actor)
  }), [actor]);
  const allowedViews = useMemo(() => (Object.keys(access) as View[]).filter((view) => access[view]), [access]);
  const view = requested && access[requested] ? requested : allowedViews[0];

  useEffect(() => {
    if (!view || requested === view) return;
    setParams({ view, ...(employeeId ? { employee: employeeId } : {}) }, { replace: true });
  }, [employeeId, requested, setParams, view]);

  if (!actor || !view) return <LoadingBlock label="Opening permitted employee workspace" />;

  const setView = (next: View, nextEmployeeId?: string) => setParams({ view: next, ...(nextEmployeeId ? { employee: nextEmployeeId } : {}) });
  const openFromDirectory = (destination: "activity" | "field-team" | "report" | "access", selectedEmployeeId: string) => {
    if (destination === "report") {
      setView("activity", selectedEmployeeId);
      return;
    }
    if (!access[destination]) return;
    setView(destination, selectedEmployeeId);
  };

  return <>
    <PageHeader eyebrow="People and team management" title="Employees" subtitle="Employee profiles, access, field activity, daily updates and printable performance reports stay together in one management workspace." />
    <Segmented value={view} onChange={(next) => setView(next)} ariaLabel="Employee management views" options={([
      { value: "directory", label: "Employee Directory" },
      { value: "access", label: "Access & Roles" },
      { value: "field-team", label: "Field Team" },
      { value: "activity", label: "Activity Summary" }
    ] as Array<{ value: View; label: string }>).filter((option) => access[option.value])} />

    {view === "directory" ? <EmployeeDirectory actor={actor} onOpen={openFromDirectory} /> : null}
    {view === "access" ? <EmployeeAccessWorkspace actor={actor} requestedEmployeeId={employeeId} onEmployeeChange={(next) => setView("access", next)} /> : null}
    {view === "field-team" ? <FieldTeamPage /> : null}
    {view === "activity" ? <EmployeeActivityPerformance actor={actor} employeeId={employeeId} onEmployeeChange={(next) => setView("activity", next)} onFieldMap={(next) => setView("field-team", next)} /> : null}
  </>;
}
