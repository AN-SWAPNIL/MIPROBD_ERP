import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../lib/auth/session";
import { hasEffectivePermission } from "../../lib/permissions/effectiveAccess";
import { salesService } from "../services";
import { workspacePath } from "../../lib/runtime";

export default function SalesReferenceLink({ type, id, label }: { type?: string; id?: string; label: string }) {
  const user = useAuthStore((state) => state.session?.user);
  const enabled = hasEffectivePermission(user, "sales", "view") && Boolean(id && type && ["SalesOrder", "Delivery", "SalesInvoice", "Collection", "Challan"].includes(type));
  const order = useQuery({ queryKey: ["sales", "reference", type, id, user?.id], queryFn: () => salesService.referenceOrder(type!, id!), enabled });
  return order.data ? <Link className="font-semibold text-cyan-800 hover:underline" to={workspacePath(`/app/sales/orders/${order.data.id}`)} title="Open related sales order">{label}</Link> : <span>{label}</span>;
}
