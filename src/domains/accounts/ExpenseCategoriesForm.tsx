import { useState } from "react";
import { Pencil, Plus, Save } from "lucide-react";
import Button from "../../components/ui/Button";
import { foundationMode } from "../../lib/runtime";
import { TableFrame, inputClass, labelClass } from "../components";
import type { ExpenseCategory } from "../services";

export default function ExpenseCategoriesForm({ categories, busy, canCreate, canEdit, onCreate, onUpdate }: { categories: ExpenseCategory[]; busy: boolean; canCreate: boolean; canEdit: boolean; onCreate: (name: string) => void; onUpdate: (id: string, payload: Partial<ExpenseCategory>) => void }) {
  const [editing, setEditing] = useState<ExpenseCategory>();
  const [name, setName] = useState(""); const [active, setActive] = useState(true); const [search, setSearch] = useState("");
  return <div className="grid min-w-0 gap-4">
    <label><span className="sr-only">Search categories</span><input className={inputClass} placeholder="Search category name" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <TableFrame><table className="w-full text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr><th className="p-3">Category</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-blue-100">{categories.filter((entry) => entry.name.toLowerCase().includes(search.toLowerCase())).map((entry) => <tr key={entry.id}><td className="break-words p-3">{entry.name}</td><td className="p-3">{entry.active ? "Active" : "Inactive"}</td><td className="p-3 text-right">{foundationMode && canEdit ? <Button variant="ghost" disabled={busy} icon={<Pencil className="h-4 w-4" />} aria-label={`Edit ${entry.name}`} title="Edit category" onClick={() => { setEditing(entry); setName(entry.name); setActive(entry.active); }} /> : null}</td></tr>)}</tbody></table></TableFrame>
    {canCreate || editing ? <form className="grid gap-4 border-t border-blue-100 pt-4" onSubmit={(event) => { event.preventDefault(); if (editing) onUpdate(editing.id, { name, active, version: editing.version }); else onCreate(name); }}>
      <label><span className={labelClass}>Category Name</span><input className={inputClass} required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
      {editing ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Active for new expenses</label> : null}
      <div className="flex justify-end gap-2">{editing ? <Button type="button" disabled={busy} onClick={() => { setEditing(undefined); setName(""); setActive(true); }}>Cancel Edit</Button> : null}<Button type="submit" variant="primary" disabled={busy} icon={editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}>{editing ? "Save Category" : "Add Category"}</Button></div>
    </form> : null}
  </div>;
}
