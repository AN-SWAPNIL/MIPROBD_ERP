import { useState } from "react";
import { Check } from "lucide-react";
import Button from "../../components/ui/Button";
import { ErrorBlock, Modal, labelClass, textareaClass } from "../components";
export default function DecisionDialog({ title, busy, error, onClose, onConfirm }: { title: string; busy: boolean; error?: Error | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <Modal open title={title} onClose={() => { if (!busy) onClose(); }}><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); onConfirm(reason); }}>
    <label><span className={labelClass}>Decision reason / evidence</span><textarea className={textareaClass} autoFocus required minLength={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    {error ? <ErrorBlock error={error} /> : null}
    <div className="flex justify-end gap-2"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} icon={<Check className="h-4 w-4" />} type="submit">{busy ? "Saving..." : "Confirm"}</Button></div>
  </form></Modal>;
}
