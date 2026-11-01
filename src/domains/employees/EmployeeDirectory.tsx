import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileBarChart, MapPinned, Pencil, Plus, Search, ShieldCheck, UserRoundCheck, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import StatusBadge from "../../components/ui/StatusBadge";
import { canManageEmployees, canManageTargetUser, canManageUserAccess, canViewManagedEmployeeActivity } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import type { User } from "../../types";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame, inputClass, labelClass } from "../components";
import { employeeService } from "../services";
import EmployeeEditor from "./EmployeeEditor";

type Destination = "activity" | "field-team" | "report" | "access";

export default function EmployeeDirectory({ actor, onOpen }: { actor: User; onOpen: (destination: Destination, employeeId: string) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [territory, setTerritory] = useState("");
  const [editing, setEditing] = useState<User | "new">();
  const query = useQuery({ queryKey: ["employees", "managed", actor.id], queryFn: employeeService.managedUsers });
  const mutation = useMutation({
    mutationFn: (task: { run: () => Promise<User>; label: string }) => task.run(),
    onSuccess: (_data, task) => {
      setEditing(undefined);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      void queryClient.invalidateQueries({ queryKey: ["settings", "users"] });
      pushToast({ kind: "success", title: task.label });
    },
    onError: (error) => pushToast({ kind: "error", title: "Employee could not be saved", message: error instanceof Error ? error.message : undefined })
  });

  const users = query.data ?? [];
  const options = useMemo(() => ({
    departments: [...new Set(users.map((user) => user.department).filter(Boolean))].sort(),
    roles: [...new Set(users.map((user) => user.role))].sort(),
    territories: [...new Set(users.map((user) => user.territory).filter(Boolean))].sort() as string[]
  }), [users]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) =>
      (!term || [user.name, user.employeeCode ?? "", user.title, user.department, user.territory ?? "", user.email, user.phone, user.role].some((value) => value.toLowerCase().includes(term))) &&
      (!department || user.department === department) &&
      (!role || user.role === role) &&
      (!status || user.status === status) &&
      (!territory || user.territory === territory)
    );
  }, [department, role, search, status, territory, users]);

  if (query.isLoading) return <LoadingBlock label="Loading employee directory" />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;

  const canCreate = canManageEmployees(actor, "create");
  const canAccess = canManageUserAccess(actor);
  const canMonitor = canViewManagedEmployeeActivity(actor);
  const editorUser = editing === "new" ? undefined : editing;
  const save = (payload: Partial<User> & { password?: string }) => mutation.mutate({
    run: () => editorUser ? employeeService.updateUser(editorUser.id, payload) : employeeService.createUser(payload),
    label: editorUser ? `${editorUser.name} updated` : "Employee and login account created"
  });

  const Actions = ({ user }: { user: User }) => {
    const editable = canManageTargetUser(actor, user);
    return <div className="flex flex-wrap items-center justify-end gap-1">
      <Button variant="ghost" icon={<Pencil className="h-4 w-4" />} disabled={!editable} onClick={() => setEditing(user)} aria-label={`Open ${user.name}`} title={editable ? "Open employee" : "This account is protected"} />
      {canMonitor && user.role === "Sales Executive" ? <Button variant="ghost" icon={<MapPinned className="h-4 w-4" />} onClick={() => onOpen("field-team", user.id)} aria-label={`${user.name} field map`} title="Field map" /> : null}
      {canMonitor ? <Button variant="ghost" icon={<FileBarChart className="h-4 w-4" />} onClick={() => onOpen("report", user.id)} aria-label={`${user.name} activity and reports`} title="Activity and employee reports" /> : null}
      {canAccess ? <Button variant="ghost" icon={<ShieldCheck className="h-4 w-4" />} disabled={!editable} onClick={() => onOpen("access", user.id)} aria-label={`${user.name} access`} title="Access and role" /> : null}
    </div>;
  };

  const EmployeeName = ({ user }: { user: User }) => canMonitor
    ? <button className="block max-w-full truncate text-left font-bold text-blue-950 hover:text-cyan-700 hover:underline" type="button" onClick={() => onOpen("activity", user.id)} title={`Open ${user.name} activity and reports`}>{user.name}</button>
    : <strong className="block truncate">{user.name}</strong>;

  return <div className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><UsersRound className="h-5 w-5 text-cyan-700" /><strong className="mt-2 block text-2xl text-slate-950">{users.length}</strong><span className="text-xs text-slate-500">Employees and login accounts</span></div>
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><UserRoundCheck className="h-5 w-5 text-emerald-700" /><strong className="mt-2 block text-2xl text-slate-950">{users.filter((user) => user.status === "Active").length}</strong><span className="text-xs text-slate-500">Active accounts</span></div>
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><MapPinned className="h-5 w-5 text-blue-800" /><strong className="mt-2 block text-2xl text-slate-950">{options.territories.length}</strong><span className="text-xs text-slate-500">Assigned territories</span></div>
    </div>
    <Panel title="Employee Directory" subtitle={`${filtered.length} of ${users.length} employees shown. Select an employee name to open their activity and reports.`} actions={canCreate ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>New Employee</Button> : undefined}>
      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="sm:col-span-2 lg:col-span-1"><span className={labelClass}>Search Employees</span><span className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={inputClass + " pl-9 pr-9"} type="search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, ID, role, phone..." />{search ? <button className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center text-slate-400 hover:text-slate-800" type="button" onClick={() => setSearch("")} aria-label="Clear employee search"><X className="h-4 w-4" /></button> : null}</span></label>
        <label><span className={labelClass}>Department</span><select className={inputClass} value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{options.departments.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span className={labelClass}>Role</span><select className={inputClass} value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{options.roles.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span className={labelClass}>Status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Active</option><option>Pending</option><option>Inactive</option></select></label>
        <label><span className={labelClass}>Territory</span><select className={inputClass} value={territory} onChange={(event) => setTerritory(event.target.value)}><option value="">All territories</option>{options.territories.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {filtered.map((user) => <article className="rounded-md border border-slate-200 bg-white p-3" key={user.id}><div className="flex items-start gap-3"><Avatar className="h-12 w-12 rounded object-cover" src={user.avatarUrl} name={user.name} /><div className="min-w-0 flex-1"><EmployeeName user={user} /><span className="block truncate text-xs text-slate-500">{user.employeeCode || "No employee ID"} | {user.title}</span><span className="block truncate text-xs text-slate-500">{user.department}{user.territory ? ` | ${user.territory}` : ""}</span></div><StatusBadge status={user.status} /></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2"><span className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-800">{user.role}</span><Actions user={user} /></div></article>)}
      </div>
      <div className="hidden md:block"><TableFrame><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Department / Territory</th><th className="px-4 py-3">Login Account</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((user) => <tr className="hover:bg-cyan-50/40" key={user.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar className="h-10 w-10 rounded object-cover" src={user.avatarUrl} name={user.name} /><div className="min-w-0"><EmployeeName user={user} /><small className="text-slate-500">{user.employeeCode || "No employee ID"} | {user.phone || "No phone"}</small></div></div></td><td className="px-4 py-3 text-slate-600">{user.title}</td><td className="px-4 py-3 text-slate-600">{user.department}<small className="block">{user.territory || "No territory"}</small></td><td className="px-4 py-3 text-slate-600">{user.email}</td><td className="px-4 py-3"><span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">{user.role}</span></td><td className="px-4 py-3"><StatusBadge status={user.status} /></td><td className="px-4 py-3"><Actions user={user} /></td></tr>)}{!filtered.length ? <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={7}>No employee matches these filters. Clear or change the search and filters.</td></tr> : null}</tbody></table></TableFrame></div>
    </Panel>
    <Modal open={Boolean(editing)} title={editorUser ? `Employee: ${editorUser.name}` : "New Employee"} subtitle="Profile, employment and login details remain on one employee record." onClose={() => setEditing(undefined)} width="max-w-4xl">{editing ? <EmployeeEditor actor={actor} user={editorUser} mode="profile" busy={mutation.isPending} onSubmit={save} /> : null}</Modal>
  </div>;
}
