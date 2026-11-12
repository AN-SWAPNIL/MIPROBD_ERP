import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, Modal, inputClass, labelClass } from "../components";
import { accountsService } from "../services";

export default function ExpenseCategorySelect({ categories, value, onChange }: { categories: { id: string; name: string; active: boolean }[]; value: string; onChange: (id: string) => void }) {
  const actor = useAuthStore((s) => s.session?.user); const client = useQueryClient();
  const [adding, setAdding] = useState(false); const [name, setName] = useState(""); const [created, setCreated] = useState<{ id: string; name: string }>();
  const save = useMutation({ mutationFn: () => accountsService.createCategory(name), onSuccess: async (row) => { setCreated(row); await client.invalidateQueries({ queryKey: ["accounts", "categories"] }); onChange(row.id); setAdding(false); setName(""); } });
  const rows = [...categories.filter((c) => c.active), ...(created && !categories.some((c) => c.id === created.id) ? [created] : [])];
  return <div className="min-w-0"><select aria-label="Expense Category" required className={inputClass} value={value} onChange={(e) => { if (e.target.value === "__add_category__") { setAdding(true); save.reset(); } else onChange(e.target.value); }}><option value="">Select category</option>{rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{hasEffectivePermission(actor, "settings", "create") ? <option value="__add_category__">+ Add expense category...</option> : null}</select>
    {adding ? <Modal open title="Add expense category" onClose={() => { if (!save.isPending) setAdding(false); }}><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); save.mutate(); }}>{save.isError ? <ErrorBlock title="Category could not be saved" error={save.error} /> : null}<label><span className={labelClass}>Category name</span><input className={inputClass} required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></label><div className="flex justify-end"><Button type="submit" variant="primary" disabled={save.isPending} icon={<Plus className="h-4 w-4" />}>Add Category</Button></div></form></Modal> : null}
  </div>;
}
