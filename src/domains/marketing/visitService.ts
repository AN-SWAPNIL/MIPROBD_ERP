import { z } from "zod";
import { domainRequest } from "../services";
import { apiRequest } from "../../lib/api/client";
import { pageSchema } from "./persistentContracts";
import { visitDetailSchema, visitPolicySchema, visitRowSchema, siteLocationSchema } from "./visitContracts";
import type { WorkforceFilters } from "./workforceService";

const id = z.object({ id: z.string() });
const send = (path: string, body: unknown, method = "POST") => domainRequest(path, id, { method, body: JSON.stringify(body) });
const root = "/api/workforce/visits";
export const visitService = {
  policy: () => domainRequest("/api/workforce/visit-policy", visitPolicySchema),
  savePolicy: (body: unknown) => send("/api/workforce/visit-policy", body, "PATCH"),
  attempt: (body: unknown) => domainRequest(`${root}/attempts`, z.object({ id: z.string(), expiresAt: z.string(), policy: visitPolicySchema.omit({ scoringEnabled: true }) }), { method: "POST", body: JSON.stringify(body) }),
  checkIn: (body: unknown) => send(`${root}/check-ins`, body),
  list: (filters: WorkforceFilters) => domainRequest(`${root}?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]))}`, pageSchema(visitRowSchema)),
  detail: (visitId: string) => domainRequest(`${root}/${encodeURIComponent(visitId)}`, visitDetailSchema),
  active: () => domainRequest(`${root}/active`, visitRowSchema.nullable()),
  complete: (visitId: string, body: unknown) => send(`${root}/${encodeURIComponent(visitId)}/complete`, body),
  review: (visitId: string, body: unknown) => send(`${root}/${encodeURIComponent(visitId)}/reviews`, body),
  void: (visitId: string, body: unknown) => send(`${root}/${encodeURIComponent(visitId)}/void`, body),
  site: (customerId: string) => domainRequest(`/api/workforce/customers/${encodeURIComponent(customerId)}/location`, siteLocationSchema.nullable()),
  saveSite: (customerId: string, body: unknown) => send(`/api/workforce/customers/${encodeURIComponent(customerId)}/location`, body, "PATCH"),
  async upload(file: File, visitAttemptId: string) {
    const upload = await apiRequest<{ id: string; signedUrl: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ purpose: "field-visit-evidence", visitAttemptId, fileName: file.name, mimeType: file.type, sizeBytes: file.size }) });
    const stored = await fetch(upload.data.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file, signal: AbortSignal.timeout(90000) });
    if (!stored.ok) throw new Error("Photo upload did not complete. Check your connection and retry.");
    await apiRequest(`/api/uploads/${upload.data.id}/complete`, { method: "POST", body: "{}" });
    return upload.data.id;
  }
};
