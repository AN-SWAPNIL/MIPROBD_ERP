import { apiRequest } from "../../lib/api/client";
import { salesPageSchema, salesSummarySchema, type SalesKind, type SalesRows } from "./pageContracts";

export async function getSalesPage<K extends SalesKind>(kind: K, params: Record<string, string> = {}, signal?: AbortSignal) {
  const result = salesPageSchema(kind).parse((await apiRequest(`/api/sales/page?${new URLSearchParams({ ...params, kind })}`, { signal })).data);
  return result as { rows: SalesRows[K][]; selected: SalesRows[K] | null; total: number; page: number; pageSize: number };
}
export const getSalesSummary = async () => salesSummarySchema.parse((await apiRequest("/api/sales/summary")).data);
