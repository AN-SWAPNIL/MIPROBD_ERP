import { z } from "zod";
import { domainRequest } from "../services";
import { decisionRecord, presetRecord, warehouseRecord } from "./operationalContracts";

export const operationalService = {
  warehouse: () => domainRequest("/api/settings/warehouse", warehouseRecord),
  presets: () => domainRequest("/api/settings/cost-presets", z.array(presetRecord)),
  decisions: () => domainRequest("/api/settings/decisions", z.array(decisionRecord)),
  saveWarehouse: (body: unknown) => domainRequest("/api/settings/warehouse", warehouseRecord, { method: "PATCH", body: JSON.stringify(body) }),
  savePreset: (id: string | null, body: unknown) => domainRequest(`/api/settings/cost-presets${id ? `/${encodeURIComponent(id)}` : ""}`, presetRecord, { method: id ? "PATCH" : "POST", body: JSON.stringify(body) }),
  saveDecision: (id: string, body: unknown) => domainRequest(`/api/settings/decisions/${encodeURIComponent(id)}`, decisionRecord, { method: "PATCH", body: JSON.stringify(body) })
};
