import type { ApiResponse, Session } from "../../types";
import { foundationMode } from "../runtime";

export const SESSION_KEY = "mipro-erp-session";
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const SESSION_EVENT = "mipro-session-updated";
let refreshing: Promise<void> | null = null;

export function readSession(): Session | null {
  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    if (foundationMode && session?.token?.startsWith("mock-token-")) return null;
    return session;
  } catch { return null; }
}

export function saveSession(session: Session | null) {
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export async function authHeaders(): Promise<Record<string, string>> {
  let session = readSession();
  if (!session) return {};
  if (foundationMode) {
    let expires = 0;
    try { expires = JSON.parse(atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { /* Invalid tokens are rejected by the API. */ }
    if (expires < Date.now() + 60000) {
      const previous = session;
      refreshing ??= (async () => {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
        const body = await response.json() as ApiResponse<Session>;
        if (!response.ok || !body.success) {
          if (response.status === 401 && readSession()?.token === previous.token) saveSession(null);
          throw new Error("Your session expired. Please sign in again.");
        }
        if (readSession()?.token === previous.token) saveSession(body.data);
      })().finally(() => { refreshing = null; });
      await refreshing;
      session = readSession();
      if (!session) return {};
    }
    return { Authorization: `Bearer ${session.token}` };
  }
  return { Authorization: `Bearer ${session.token}`, "x-user-id": session.user.id, "x-role": session.user.role };
}
