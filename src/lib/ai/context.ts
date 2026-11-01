import { create } from "zustand";
import type { AIContext } from "../../domains/erp.types";

type AIContextState = {
  context: AIContext;
  setRoute: (route: string) => void;
  setReportPeriod: (from: string, to: string) => void;
};

function contextForRoute(route: string): AIContext {
  const [path, query = ""] = route.split("?");
  const params = new URLSearchParams(query);
  const importMatch = path.match(/^\/app\/imports\/([^/]+)$/);
  if (importMatch) return { route, entityType: "import", entityId: importMatch[1] };
  if (path.startsWith("/app/imports")) return { route, entityType: "import" };
  if (path.startsWith("/app/inventory")) return { route, entityType: "inventory" };
  if (path.startsWith("/app/employees") && params.get("view") === "field-team") return { route, entityType: "field-team", employeeId: params.get("employee") ?? undefined };
  if (path.startsWith("/app/employees")) return { route, entityType: "employees", employeeId: params.get("employee") ?? undefined };
  if (path.startsWith("/app/sales") && (params.get("view") === "field-team" || params.get("marketing") === "field-team")) return { route, entityType: "field-team", employeeId: params.get("employee") ?? undefined };
  if (path.startsWith("/app/sales") && params.get("view") === "marketing") return { route, entityType: "marketing", employeeId: params.get("employee") ?? undefined };
  if (path.startsWith("/app/sales")) return { route, entityType: "sales" };
  if (path.startsWith("/app/insights")) return { route, entityType: "insights" };
  if (path.startsWith("/app/reports")) return { route, entityType: "reports" };
  if (path.startsWith("/app/accounts")) return { route, entityType: "accounts" };
  if (path.startsWith("/app/settings")) return { route, entityType: "settings" };
  return { route, entityType: "dashboard" };
}

export const useAIContextStore = create<AIContextState>((set) => ({
  context: { route: "/app/dashboard", entityType: "dashboard" },
  setRoute(route) {
    set((state) => {
      const next = contextForRoute(route);
      return { context: next.entityType === "reports" ? { ...next, reportFrom: state.context.reportFrom, reportTo: state.context.reportTo } : next };
    });
  },
  setReportPeriod(from, to) {
    set((state) => ({ context: { ...state.context, reportFrom: from, reportTo: to } }));
  }
}));
