import { apiRequest } from "../../lib/api/client";
import { openingLineInput, type OpeningLine, type OpeningSource } from "./contracts";
export const openingBase = "/backend/settings/opening";
export const openingRequest = async <T,>(path: string, body?: unknown, method = "POST") => (await apiRequest<T>(`/api/opening${path}`, body === undefined ? undefined : { method, body: JSON.stringify(body) })).data;
export const blankOpeningLine = (source?: OpeningSource): OpeningLine => openingLineInput.parse({ id: crypto.randomUUID(), kind: "Stock", sourceSheet: source?.profile?.sheets[0]?.name ?? "Stock List", sourceCell: "B7", condition: "Saleable" });
