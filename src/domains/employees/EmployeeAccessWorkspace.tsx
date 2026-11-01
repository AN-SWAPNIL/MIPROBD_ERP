import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, ShieldCheck, ShieldMinus, ShieldPlus } from "lucide-react";
import { useEffect, useState } from "react";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import { canManageTargetUser } from "../../lib/permissions/effectiveAccess";
import { useToastStore } from "../../lib/ui/toast";
import type { User } from "../../types";
import { ErrorBlock, LoadingBlock, Modal, Panel, TableFrame } from "../components";
import { employeeService } from "../services";
import EmployeeEditor, { RoleAccessSummary } from "./EmployeeEditor";

export default function EmployeeAccessWorkspace({ actor, requestedEmployeeId, onEmployeeChange }: { actor: User; requestedEmployeeId?: string; onEmployeeChange: (employeeId?: string) => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [editing, setEditing] = useState<User>();
  const query = useQuery({ queryKey: ["employees", "managed", actor.id], queryFn: employeeService.managedUsers });
  const mutation = useMutation({
    mutationFn: ({ user, payload }: { user: User; payload: Partial<User> & { password?: string } }) => employeeService.updateUser(user.id, payload),
    onSuccess: (user) => {
      setEditing(undefined);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      pushToast({ kind: "success", title: `${user.name}'s access updated` });
    },
    onError: (error) => pushToast({ kind: "error", title: "Access could not be updated", message: error instanceof Error ? error.message : undefined })
  });
  const users = query.data ?? [];
  const selected = users.find((user) => user.id === requestedEmployeeId) ?? users[0];

  useEffect(() => {
    if (query.isSuccess && requestedEmployeeId && !users.some((user) => user.id === requestedEmployeeId)) onEmployeeChange(undefined);
  }, [onEmployeeChange, query.isSuccess, requestedEmployeeId, users]);

  if (query.isLoading) return <LoadingBlock label="Loading employee access" />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,.6fr)]">
    <Panel title="Access & Roles" subtitle="Role defaults, employee-specific allowances, explicit denials and sensitive capabilities resolve into one access profile.">
      <TableFrame><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Assigned Role</th><th className="px-4 py-3">Additional Allow</th><th className="px-4 py-3">Explicit Deny</th><th className="px-4 py-3">Sensitive Capabilities</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map((user) => {
        const allows = user.permissionOverrides?.filter((entry) => entry.effect === "ALLOW").length ?? 0;
        const denies = user.permissionOverrides?.filter((entry) => entry.effect === "DENY").length ?? 0;
        const editable = canManageTargetUser(actor, user);
        return <tr className={`cursor-pointer hover:bg-cyan-50/40 ${selected?.id === user.id ? "bg-cyan-50/60" : ""}`} key={user.id} onClick={() => onEmployeeChange(user.id)}><td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar className="h-9 w-9 rounded object-cover" src={user.avatarUrl} name={user.name} /><div><strong className="block">{user.name}</strong><small className="text-slate-500">{user.employeeCode || user.email}</small></div></div></td><td className="px-4 py-3"><span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">{user.role}</span></td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-emerald-700"><ShieldPlus className="h-4 w-4" />{allows}</span></td><td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-rose-700"><ShieldMinus className="h-4 w-4" />{denies}</span></td><td className="px-4 py-3 text-slate-600">{user.capabilities?.length ?? 0}</td><td className="px-4 py-3 text-right"><Button variant="ghost" icon={<Pencil className="h-4 w-4" />} disabled={!editable} onClick={(event) => { event.stopPropagation(); setEditing(user); }} aria-label={`Edit ${user.name} access`} title={editable ? "Edit access" : "This account is protected"} /></td></tr>;
      })}</tbody></table></TableFrame>
    </Panel>
    <div className="grid content-start gap-4">
      {selected ? <>
        <Panel title={selected.name} subtitle={`${selected.employeeCode || "No employee ID"} | ${selected.email}`} actions={<ShieldCheck className="h-5 w-5 text-cyan-700" />}>
          <div className="grid gap-3 p-4 text-sm"><span className="text-slate-500">Assigned role<strong className="mt-1 block text-slate-950">{selected.role}</strong></span><span className="text-slate-500">Account status<strong className="mt-1 block text-slate-950">{selected.status}</strong></span><span className="text-slate-500">Employee-specific access<strong className="mt-1 block text-slate-950">{selected.permissionOverrides?.length ?? 0} exceptions</strong></span><span className="text-slate-500">Sensitive capabilities<strong className="mt-1 block text-slate-950">{selected.capabilities?.length ? selected.capabilities.map((value) => value.replaceAll("_", " ")).join(", ") : "None"}</strong></span></div>
          <div className="border-t border-slate-200 p-3"><Button className="w-full" variant="primary" icon={<KeyRound className="h-4 w-4" />} disabled={!canManageTargetUser(actor, selected)} onClick={() => setEditing(selected)}>Edit Access</Button></div>
        </Panel>
        <RoleAccessSummary role={selected.role} />
      </> : null}
    </div>
    <Modal open={Boolean(editing)} title={`Access: ${editing?.name ?? "Employee"}`} subtitle="Changing roles or permissions requires an authorized human action and is recorded in the audit log." onClose={() => setEditing(undefined)} width="max-w-5xl">{editing ? <EmployeeEditor actor={actor} user={editing} mode="access" busy={mutation.isPending} onSubmit={(payload) => mutation.mutate({ user: editing, payload })} /> : null}</Modal>
  </div>;
}
