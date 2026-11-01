import { apiRequest } from "../../lib/api/client";
export async function controlRequest<T = unknown>(path: string, body?: unknown): Promise<T> {
  return (await apiRequest<T>(`/api${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) })).data;
}
