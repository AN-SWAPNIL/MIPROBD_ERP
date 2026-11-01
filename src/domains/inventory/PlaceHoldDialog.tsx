import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import Button from "../../components/ui/Button";
import { apiRequest } from "../../lib/api/client";
import { ErrorBlock, inputClass, labelClass, Modal, textareaClass } from "../components";
import { holdInput } from "./holdContracts";

export default function PlaceHoldDialog({ batch, onClose }: { batch: { id: string; productName: string; batchNumber: string }; onClose: () => void }) {
  const [quantity, setQuantity] = useState(""); const [condition, setCondition] = useState<"Quarantine" | "Damaged">("Quarantine"); const [reason, setReason] = useState(""); const [proofReference, setProof] = useState("");
  const [key] = useState(() => crypto.randomUUID()); const client = useQueryClient();
  const run = useMutation({ mutationFn: async () => { const input = holdInput.parse({ batchId: batch.id, quantity, condition, reason, proofReference }); return apiRequest("/api/inventory/holds", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(input) }); }, onSuccess: async () => { await client.invalidateQueries(); onClose(); } });
  return <Modal open title="Place Stock Hold" subtitle={`${batch.productName} | ${batch.batchNumber}`} onClose={onClose}>
    <form className="grid min-w-0 gap-4" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label><span className={labelClass}>Quantity to hold</span><input required className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" aria-label="Quantity to hold" /></label><label><span className={labelClass}>Condition</span><select className={inputClass} value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}><option>Quarantine</option><option>Damaged</option></select></label></div>
      <label><span className={labelClass}>Evidence reference</span><input required minLength={3} maxLength={200} className={inputClass} value={proofReference} onChange={(e) => setProof(e.target.value)} /></label>
      <label><span className={labelClass}>Hold reason</span><textarea required minLength={5} maxLength={1000} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {run.isError ? <ErrorBlock error={run.error} /> : null}
      <div className="flex flex-wrap justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={run.isPending} icon={<ShieldAlert className="h-4 w-4" />}>Place Hold</Button></div>
    </form>
  </Modal>;
}
