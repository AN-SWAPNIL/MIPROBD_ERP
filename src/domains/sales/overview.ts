import { apiRequest } from "../../lib/api/client";
import { SalesOverviewSchema } from "./overviewContracts";
export const getSalesOverview = async (signal?: AbortSignal) => SalesOverviewSchema.parse((await apiRequest("/api/sales/overview", { signal })).data);
