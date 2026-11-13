import { useIsMutating, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import Button from "../../components/ui/Button";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { ErrorBlock, LoadingBlock, Modal } from "../components";
import { controlRequest } from "../controls/client";
import { ledgerAccountSchema } from "./contracts";
import LedgerConfigurationPanel from "./LedgerConfigurationPanel";

export default function LedgerSetupDialog({ onClose }: { onClose: () => void }) {
  const user = useAuthStore(s => s.session?.user);
  const allowed = user?.role === "Super Admin" && hasEffectivePermission(user, "settings");
  const busy = useIsMutating({ mutationKey: ["ledger-configuration"] }) > 0;
  const chart = useQuery({ queryKey: ["ledger", "chart"], queryFn: async () => z.array(ledgerAccountSchema).parse(await controlRequest("/ledger/accounts")), enabled: allowed });
  return <Modal open title="Company Accounting Setup" subtitle="Shared company accounts. The current import is unchanged." width="max-w-5xl" onClose={() => { if (!busy) onClose(); }} footer={<Button disabled={busy} icon={<ArrowLeft className="h-4 w-4" />} onClick={onClose}>Return to Import</Button>}>
    {!allowed ? <ErrorBlock error={new Error("Only Super Admin can configure company accounting.")} /> : chart.isPending ? <LoadingBlock /> : chart.isError ? <ErrorBlock error={chart.error} onRetry={() => void chart.refetch()} /> : <LedgerConfigurationPanel chart={chart.data} />}
  </Modal>;
}
