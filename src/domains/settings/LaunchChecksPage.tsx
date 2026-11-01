import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import PageHeader from "../../components/ui/PageHeader";
import StatusBadge from "../../components/ui/StatusBadge";
import { apiRequest } from "../../lib/api/client";
import { ErrorBlock, LoadingBlock, Panel } from "../components";
import { launchChecksSchema } from "./launchContracts";

export default function LaunchChecksPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["settings", "launch-checks"], queryFn: async () => launchChecksSchema.parse((await apiRequest("/api/system/launch-checks")).data) });
  return <div className="grid min-w-0 gap-4">
    <PageHeader title="Launch Checks" subtitle="Company setup and operational acceptance" actions={<><Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/backend/settings")}>Settings</Button><Button icon={<RefreshCw className="h-4 w-4" />} disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button></>} />
    {query.isPending ? <LoadingBlock /> : query.isError ? <ErrorBlock error={query.error} onRetry={() => void query.refetch()} /> : <Panel title="Release checklist" subtitle={`Last checked: ${new Date(query.data.checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}`}>
      <div className="divide-y divide-blue-100">{query.data.checks.map((check) => <div key={check.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="text-sm font-bold text-blue-950">{check.title}</h2><StatusBadge status={check.status} /></div><p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p></div>{check.path ? <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => navigate(check.path!)}>Open</Button> : null}</div>)}</div>
    </Panel>}
  </div>;
}
