import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Plus, Upload } from "lucide-react";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import { businessDate } from "../../lib/date";
import { ErrorBlock, LoadingBlock, Panel, TableFrame, inputClass } from "../components";
import { WorkforcePager } from "../marketing/WorkforceUi";
import { openingLineInput, type OpeningDraft, type OpeningSource } from "./contracts";
import { openingBase, openingRequest, blankOpeningLine } from "./client";
import OpeningSourceReview from "./OpeningSourceReview";
import OpeningDraftEditor from "./OpeningDraftEditor";

export default function OpeningDataPage() {
  const { draftId } = useParams(); const navigate = useNavigate(); const client = useQueryClient(); const [sourceId, setSourceId] = useState(""); const [page, setPage] = useState(1);
  const sources = useQuery({ queryKey: ["opening", "sources"], queryFn: () => openingRequest<OpeningSource[]>("/sources"), enabled: !draftId });
  const source = useQuery({ queryKey: ["opening", "source", sourceId], queryFn: () => openingRequest<OpeningSource>(`/sources/${sourceId}`), enabled: Boolean(sourceId) && !draftId });
  const drafts = useQuery({ queryKey: ["opening", "drafts", page], queryFn: () => openingRequest<{ rows: OpeningDraft[]; total: number }>(`/drafts?page=${page}`), enabled: !draftId });
  const draft = useQuery({ queryKey: ["opening", "draft", draftId], queryFn: () => openingRequest<OpeningDraft>(`/drafts/${draftId}`), enabled: Boolean(draftId) });
  const upload = useMutation({ mutationFn: async (file: File) => {
    const reserved = await openingRequest<{ id: string; signedUrl: string; mimeType: string }>("/sources/upload", { fileName: file.name, sizeBytes: file.size });
    const response = await fetch(reserved.signedUrl, { method: "PUT", headers: { "Content-Type": reserved.mimeType }, body: file });
    if (!response.ok) throw new Error("Private source upload failed. Select the XLSX again to retry.");
    return openingRequest<OpeningSource>(`/sources/${reserved.id}/complete`, {});
  }, onSuccess: (row) => { setSourceId(row.id); void client.invalidateQueries({ queryKey: ["opening", "sources"] }); } });
  const create = useMutation({ mutationFn: async () => {
    if (!source.data) throw new Error("Select a profiled workbook first."); const profile = source.data.profile;
    const lines = profile?.stockCandidates.length ? profile.stockCandidates.map((candidate) => openingLineInput.parse({ id: crypto.randomUUID(), kind: "Stock", sourceSheet: candidate.sheet, sourceCell: candidate.cell, lot: candidate.lot, quantity: candidate.quantity, condition: "Saleable" })) : [blankOpeningLine(source.data)];
    return openingRequest<OpeningDraft>("/drafts", { name: `Opening review - ${source.data.fileName}`, sourceId, data: { asOfDate: businessDate(), proofReference: source.data.fileName, lines, exceptionResolutions: [] } });
  }, onSuccess: (row) => navigate(`${openingBase}/${row.id}`) });
  return <>
    <PageHeader title={draftId ? "Opening Review" : "Opening Data"} eyebrow="Controlled migration" subtitle="Source evidence, approval and reconciled opening positions." actions={<Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(draftId ? openingBase : "/backend/settings")}>{draftId ? "Opening Data" : "Settings"}</Button>} />
    {draftId ? draft.isPending ? <LoadingBlock /> : draft.isError ? <ErrorBlock error={draft.error} /> : <OpeningDraftEditor key={`${draft.data.id}:${draft.data.version}`} draft={draft.data} /> : <>
      <div className="flex flex-wrap gap-3 text-xs font-semibold text-blue-900">{[["stock", "Stock template"], ["customer-dues", "Customer dues template"], ["supplier-positions", "Supplier positions template"], ["cash-bank", "Cash / bank template"]].map(([name, label]) => <a key={name} className="underline underline-offset-4" download href={`/templates/opening-${name}.csv`}>{label}</a>)}</div>
      <Panel title="Private source workbooks" actions={<label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-950"><Upload className="h-4 w-4" />{upload.isPending ? "Uploading..." : "Upload XLSX"}<input className="sr-only" aria-label="Upload opening workbook" type="file" accept=".xlsx" disabled={upload.isPending} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ""; }} /></label>}>
        <div className="p-4"><label className="text-xs font-semibold text-slate-600">Source workbook<select className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">Select a workbook</option>{sources.data?.filter((s) => s.state === "Ready").map((row) => <option key={row.id} value={row.id}>{row.fileName} | {row.sha256?.slice(0, 12)}</option>)}</select></label></div>
        {upload.isError ? <ErrorBlock error={upload.error} /> : null}{sources.isError ? <ErrorBlock error={sources.error} /> : null}
        {source.isFetching ? <LoadingBlock /> : source.isError ? <ErrorBlock error={source.error} /> : source.data ? <><OpeningSourceReview key={source.data.id} source={source.data} /><div className="border-t border-blue-100 p-4"><Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={create.isPending} onClick={() => create.mutate()}>Prepare Opening Draft</Button>{create.isError ? <ErrorBlock error={create.error} /> : null}</div></> : null}
      </Panel>
      <Panel title="Opening drafts">{drafts.isPending ? <LoadingBlock /> : drafts.isError ? <ErrorBlock error={drafts.error} /> : <><TableFrame><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-blue-50 text-blue-950"><tr>{["Review", "Count date", "Status", "Updated", ""].map((v, i) => <th className="p-3" key={i}>{v}</th>)}</tr></thead><tbody className="divide-y divide-blue-100">{drafts.data.rows.map((row) => <tr key={row.id}><td className="p-3 font-semibold">{row.name}</td><td className="p-3">{row.data.asOfDate}</td><td className="p-3">{row.state}</td><td className="p-3">{new Date(row.updatedAt).toLocaleString()}</td><td className="p-3"><Button icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`${openingBase}/${row.id}`)}>Open</Button></td></tr>)}</tbody></table></TableFrame>{!drafts.data.total ? <p className="p-6 text-sm text-slate-500">No opening drafts prepared.</p> : null}<WorkforcePager total={drafts.data.total} page={page} pageSize={25} onChange={setPage} /></>}</Panel>
    </>}
  </>;
}
