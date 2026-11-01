import { Check, ImagePlus, Save, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import { navSections } from "../../lib/permissions/matrix";
import { permissionActions, permissionKeys, settingsEntryPermissions } from "../../lib/permissions/definitions";
import {
  canAssignRole,
  canGrantCapability,
  canManageUserAccess,
  hasRolePermission
} from "../../lib/permissions/effectiveAccess";
import type { PermissionAction, PermissionEffect, PermissionKey, Role, User, UserPermissionOverride } from "../../types";
import { roles } from "../../types";
import { inputClass, labelClass } from "../components";
import type { Capability } from "../erp.types";

export const capabilityOptions: ReadonlyArray<readonly [Capability, string]> = [
  ["view_sensitive_cost", "View sensitive import cost"],
  ["edit_sensitive_cost", "Edit sensitive import cost"],
  ["finalize_landed_cost", "Finalize landed cost"],
  ["reopen_landed_cost", "Reopen landed cost"],
  ["view_profit", "View selling-profit information"],
  ["view_financial_position", "View balance sheet and financial position"],
  ["approve_stock_override", "Approve FIFO override"],
  ["approve_special_price", "Approve special price"],
  ["manage_users", "Manage employee lifecycle"],
  ["manage_user_access", "Manage roles and access"],
  ["manage_ledger", "Manage general ledger"], ["approve_ledger", "Approve ledger journals"],
  ["view_payroll", "View confidential payroll"], ["manage_payroll", "Prepare and pay payroll"],
  ["approve_payroll", "Approve payroll"], ["approve_stock_control", "Approve stock controls"]
];

function roleCanOpen(role: Role, path: string, permission: PermissionKey) {
  if (path === "/app/settings") return settingsEntryPermissions.some((key) => hasRolePermission(role, key));
  if (path === "/app/sales") return hasRolePermission(role, "sales") || hasRolePermission(role, "marketing");
  if (path === "/app/employees") return hasRolePermission(role, "users") || ["Super Admin", "Managing Director", "Sales Manager"].includes(role);
  return hasRolePermission(role, permission);
}

export function RoleAccessSummary({ role }: { role: Role }) {
  const areas = navSections.flatMap((section) => section.items);
  return (
    <section className="rounded-md border border-blue-200 bg-blue-50 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-blue-800" />
        <div>
          <strong className="block text-sm text-blue-950">Role default access | {role}</strong>
          <span className="text-xs text-blue-800">Workspace visibility before employee-specific allowances or denials</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {areas.map((area) => {
          const allowed = roleCanOpen(role, area.path, area.permission);
          return <span className={`flex items-center gap-1.5 rounded bg-white px-2 py-1.5 text-xs font-semibold ${allowed ? "text-emerald-700" : "text-slate-400"}`} key={area.path}>{allowed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{area.label}</span>;
        })}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-blue-800">{role === "Super Admin" ? "Super Admin has full owner access, including policy administration and self-approval. Business validations and audit history still apply." : "Sensitive capabilities remain separate from workspace access. An explicit denial wins for delegated users."}</p>
    </section>
  );
}

type EmployeeEditorProps = {
  actor: User;
  user?: User;
  mode: "profile" | "access";
  busy: boolean;
  onSubmit: (payload: Partial<User> & { password?: string }) => void;
};

export default function EmployeeEditor({ actor, user, mode, busy, onSubmit }: EmployeeEditorProps) {
  const accessManager = canManageUserAccess(actor);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "Sales Executive" as Role,
    title: user?.title ?? "",
    department: user?.department ?? "",
    phone: user?.phone ?? "",
    avatarUrl: user?.avatarUrl ?? "",
    territory: user?.territory ?? "",
    employeeCode: user?.employeeCode ?? "",
    status: user?.status ?? "Active" as User["status"],
    password: "",
    capabilities: user?.capabilities ?? [] as Capability[],
    permissionOverrides: user?.permissionOverrides ?? [] as UserPermissionOverride[]
  });
  const roleOptions = roles.filter((role) => canAssignRole(actor, role));
  const effectFor = (permission: PermissionKey, action: PermissionAction): PermissionEffect | "DEFAULT" => form.permissionOverrides.find((override) => override.permission === permission && override.action === action)?.effect ?? "DEFAULT";
  const setEffect = (permission: PermissionKey, action: PermissionAction, effect: PermissionEffect | "DEFAULT") => setForm((current) => ({
    ...current,
    permissionOverrides: [
      ...current.permissionOverrides.filter((override) => override.permission !== permission || override.action !== action),
      ...(effect === "DEFAULT" ? [] : [{ permission, action, effect } as UserPermissionOverride])
    ]
  }));

  const chooseImage = (file?: File) => {
    if (!file || file.size > 2_000_000 || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, avatarUrl: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (mode === "access") {
      onSubmit({ role: form.role, capabilities: form.capabilities, permissionOverrides: form.permissionOverrides, ...(form.password ? { password: form.password } : {}) });
      return;
    }
    onSubmit({
      name: form.name,
      email: form.email,
      title: form.title,
      department: form.department,
      phone: form.phone,
      avatarUrl: form.avatarUrl,
      territory: form.territory || undefined,
      employeeCode: form.employeeCode || undefined,
      status: form.status,
      ...(!user && accessManager ? { role: form.role } : {}),
      ...(accessManager && form.password ? { password: form.password } : {})
    });
  };

  if (mode === "access") {
    return (
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Avatar className="h-14 w-14 rounded object-cover" src={form.avatarUrl} name={form.name} />
          <div className="min-w-0"><strong className="block truncate">{form.name}</strong><span className="block truncate text-xs text-slate-500">{form.employeeCode || "No employee ID"} | {form.email}</span></div>
        </div>
        <RoleAccessSummary role={form.role} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className={labelClass}>Assigned Role</span><select className={inputClass} value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
          <label><span className={labelClass}>Reset Password (optional)</span><input className={inputClass} type="password" minLength={6} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Leave unchanged" /></label>
        </div>
        <details className="rounded-md border border-slate-200" open={form.permissionOverrides.length > 0}>
          <summary className="cursor-pointer px-3 py-3 text-sm font-bold text-blue-950">Employee-specific access <span className="ml-2 text-xs font-normal text-slate-500">{form.permissionOverrides.length} exception{form.permissionOverrides.length === 1 ? "" : "s"}</span></summary>
          <div className="grid gap-3 border-t border-slate-200 p-3">
            {permissionKeys.map((permission) => <details className="rounded-md border border-slate-200 bg-white" key={permission} open={form.permissionOverrides.some((override) => override.permission === permission)}><summary className="cursor-pointer px-3 py-2 text-sm font-semibold capitalize">{permission.replaceAll("_", " ")}</summary><div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-3">{permissionActions.map((action) => <label className="grid grid-cols-[1fr_112px] items-center gap-2 text-xs" key={action}><span className="capitalize text-slate-600">{action}<small className="block text-[10px] text-slate-400">Role: {hasRolePermission(form.role, permission, action) ? "Allowed" : "Denied"}</small></span><select className={inputClass} disabled={form.role === "Super Admin"} value={form.role === "Super Admin" ? "ALLOW" : effectFor(permission, action)} onChange={(event) => setEffect(permission, action, event.target.value as PermissionEffect | "DEFAULT")}><option value="DEFAULT">Role default</option><option value="ALLOW">Additional allow</option><option value="DENY">Explicit deny</option></select></label>)}</div></details>)}
          </div>
        </details>
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-xs font-bold uppercase text-slate-500">Sensitive capabilities</legend>
          <div className="grid gap-2 sm:grid-cols-2">{capabilityOptions.filter(([value]) => canGrantCapability(actor, value) || form.capabilities.includes(value)).map(([value, label]) => <label className="flex items-center gap-2 rounded bg-slate-50 p-2 text-sm" key={value}><input type="checkbox" checked={form.role === "Super Admin" || form.capabilities.includes(value)} disabled={form.role === "Super Admin" || value === "manage_user_access" && actor.role !== "Super Admin"} onChange={(event) => setForm((current) => ({ ...current, capabilities: event.target.checked ? [...current.capabilities, value] : current.capabilities.filter((capability) => capability !== value) }))} /> {label}</label>)}</div>
        </fieldset>
        <div className="flex justify-end"><Button type="submit" variant="primary" icon={<ShieldCheck className="h-4 w-4" />} disabled={busy}>Save Access</Button></div>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <legend className="px-1 text-xs font-bold uppercase text-slate-500">Profile</legend>
        <Avatar className="h-24 w-24 rounded-md object-cover" src={form.avatarUrl} name={form.name || "Employee"} />
        <div className="grid gap-3"><label><span className={labelClass}>Profile Image URL</span><input className={inputClass} value={form.avatarUrl} onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://..." /></label><label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ImagePlus className="h-4 w-4" />Choose Image<input className="sr-only" type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} /></label><small className="text-slate-500">Images up to 2 MB are kept for this running demo session.</small></div>
        <label className="sm:col-span-2"><span className={labelClass}>Full Name</span><input className={inputClass} required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span className={labelClass}>Phone</span><input className={inputClass} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
      </fieldset>
      <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-bold uppercase text-slate-500">Employment</legend>
        <label><span className={labelClass}>Employee ID</span><input className={inputClass} value={form.employeeCode} onChange={(event) => setForm((current) => ({ ...current, employeeCode: event.target.value }))} /></label>
        <label><span className={labelClass}>Designation</span><input className={inputClass} required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
        <label><span className={labelClass}>Department</span><input className={inputClass} required value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} /></label>
        <label><span className={labelClass}>Territory</span><input className={inputClass} value={form.territory} onChange={(event) => setForm((current) => ({ ...current, territory: event.target.value }))} /></label>
      </fieldset>
      <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-bold uppercase text-slate-500">Login Account</legend>
        <label><span className={labelClass}>Login Email</span><input className={inputClass} type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
        <label><span className={labelClass}>Account Status</span><select className={inputClass} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as User["status"] }))}><option>Active</option><option>Pending</option><option>Inactive</option></select></label>
        {!user && accessManager ? <label><span className={labelClass}>Initial Role</span><select className={inputClass} value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label> : <label><span className={labelClass}>Assigned Role</span><input className={inputClass} readOnly value={form.role} /></label>}
        {accessManager ? <label><span className={labelClass}>{user ? "Reset Password (optional)" : "Initial Password (optional)"}</span><input className={inputClass} type="password" minLength={6} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={user ? "Leave unchanged" : "Demo default: password123"} /></label> : null}
      </fieldset>
      <div className="flex justify-end"><Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} disabled={busy}>Save Employee</Button></div>
    </form>
  );
}
