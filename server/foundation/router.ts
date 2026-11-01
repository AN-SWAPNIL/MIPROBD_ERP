import { Router, type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { createContext, authenticate, type Context } from "./context.js";
import { createAuthRouter } from "./auth.js";
import { createEmployeeRouter } from "./employees.js";
import { createDocumentRouter } from "./documents.js";
import { HttpError } from "./errors.js";
import { createMasterRouter } from "../operations/masters.js";
import { createImportRouter } from "../operations/imports.js";
import { createInventoryRouter } from "../operations/inventory.js";
import { createTradingRouter } from "../trading/router.js";
import { createFulfilmentRouter } from "../trading/fulfilment.js";
import { createInvoiceRouter } from "../trading/invoices.js";
import { createCollectionRouter } from "../trading/collections.js";
import { createCashAccountRouter } from "../trading/accounts.js";
import { createSalesWorkspaceRouter } from "../trading/workspace.js";
import { createExpenseRouter } from "../finance/expenses.js";
import { createSettlementRouter } from "../finance/settlements.js";
import { createPrintRouter } from "../printing/router.js";
import { createReportRouter } from "../reports/router.js";
import { createWorkforceRouter } from "../workforce/router.js";
import { createOperationalSettingsRouter } from "../settings/router.js";
import { createDashboardRouter } from "../dashboard/router.js";
import { createMfaRouter } from "./mfa.js";
import { createInvitationOutboxRouter } from "./invitation-outbox.js";
import { createOpeningRouter } from "../opening/router.js";
import { requireRestrictedRuntime } from "./database-security.js";
import { createSalesOverviewRouter } from "../trading/overview.js";
import { createControlRouter } from "../controls/router.js";
import { createLedgerRouter } from "../ledger/router.js";
import { createStockHoldRouter } from "../operations/holds.js";
import { createStockControlRouter } from "../operations/stock-controls.js";
import { createReturnRouter } from "../returns/router.js";
import { createPayrollRouter } from "../payroll/router.js";
import { createClaimRouter } from "../claims/router.js";
import { createQualityRouter } from "../quality/router.js";
import { createMaintenanceRouter } from "../maintenance/router.js";
import { createSalesPagesRouter } from "../trading/pages.js";
import { createLaunchRouter } from "../maintenance/launch.js";

export function createFoundationRouter(providedContext?: Context) {
  const ctx = providedContext ?? createContext();
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    res.set("X-Request-Id", randomUUID());
    const started = performance.now();
    res.once("finish", () => {
      const durationMs = Math.round(performance.now() - started);
      if (res.statusCode >= 500 || durationMs >= 5000 || process.env.ERP_LOG_REQUESTS === "true") {
        console.info(JSON.stringify({ event: "api_request", requestId: res.get("X-Request-Id"), method: req.method, route: typeof req.route?.path === "string" ? req.route.path : "unmatched", status: res.statusCode, durationMs }));
      }
    });
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const origin = req.get("origin");
      if (origin && origin !== ctx.config.origin) return next(new HttpError(403, "Request origin is not allowed."));
      if (!req.is("application/json")) return next(new HttpError(415, "Use application/json."));
    }
    next();
  });
  router.use(createMaintenanceRouter(ctx));
  router.use(async (_req, _res, next) => { await requireRestrictedRuntime(ctx); next(); });
  router.get("/health", async (_req, res) => {
    try {
      await ctx.client.query("select 1");
      res.json({ success: true, data: { mode: "foundation", database: "connected" }, message: "Backend foundation healthy" });
    } catch { throw new HttpError(503, "Database dependency unavailable."); }
  });
  router.use("/auth", createAuthRouter(ctx));
  router.use("/auth", createMfaRouter(ctx));
  router.use(async (req, res, next) => {
    res.locals.identity = await authenticate(ctx, req, false, req.method === "GET" && req.path === "/me");
    next();
  });
  router.get("/system/status", (_req, res) => res.json({ success: true, data: { phase: "Persistent ERP", authentication: "Connected", database: "Connected", privateStorage: "Configured", businessMigration: "Core operations, approved-source openings, shared approvals, operational GL, stock controls, customer returns/credits/refunds, regular and effective-dated split payroll/commission, supplier claims/replacements and optional source-bound inspection attachments are connected. Customer repair/replacement tracking, additional-cost replacements, formal posted-source corrections, remaining query/operations hardening and real cutover remain pending. Public content is static; AI deferred." }, message: "Backend status" }));
  router.use("/ai", () => { throw new HttpError(503, "AI is deferred for this release. ERP records are not sent to an AI provider."); });
  router.use(createDashboardRouter(ctx));
  router.use(createLaunchRouter(ctx));
  router.use(createOperationalSettingsRouter(ctx));
  router.use(createEmployeeRouter(ctx));
  router.use(createInvitationOutboxRouter(ctx));
  router.use(createOpeningRouter(ctx));
  router.use(createControlRouter(ctx));
  router.use(createLedgerRouter(ctx));
  router.use(createDocumentRouter(ctx));
  router.use(createMasterRouter(ctx));
  router.use(createImportRouter(ctx));
  router.use(createInventoryRouter(ctx));
  router.use(createStockHoldRouter(ctx));
  router.use(createStockControlRouter(ctx));
  router.use(createReturnRouter(ctx));
  router.use(createClaimRouter(ctx));
  router.use(createQualityRouter(ctx));
  router.use(createPayrollRouter(ctx));
  router.use(createTradingRouter(ctx));
  router.use(createFulfilmentRouter(ctx));
  router.use(createInvoiceRouter(ctx));
  router.use(createCollectionRouter(ctx));
  router.use(createCashAccountRouter(ctx));
  router.use(createSalesWorkspaceRouter(ctx));
  router.use(createSalesOverviewRouter(ctx));
  router.use(createSalesPagesRouter(ctx));
  router.use(createExpenseRouter(ctx));
  router.use(createSettlementRouter(ctx));
  router.use(createPrintRouter(ctx));
  router.use(createReportRouter(ctx));
  router.use(createWorkforceRouter(ctx));
  router.use((_req, _res, next) => next(new HttpError(503, "This workflow has not been migrated to the persistent backend. The original prototype remains separate.")));
  const handler: ErrorRequestHandler = (error, _req, res, _next) => {
    void _next;
    if (error instanceof ZodError) return res.status(422).json({ success: false, data: null, message: "Invalid request", errors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
    if (error instanceof HttpError) return res.status(error.status).json({ success: false, data: null, message: error.message });
    const cause = error?.cause ?? error;
    if (cause?.code === "23505") return res.status(409).json({ success: false, data: null, message: "A record with this identifier already exists." });
    if (cause?.code === "22P02") return res.status(422).json({ success: false, data: null, message: "Invalid record identifier." });
    if (["22003", "23514"].includes(cause?.code)) return res.status(422).json({ success: false, data: null, message: "Value exceeds supported precision or violates a data-integrity rule." });
    if (cause?.code === "23503") return res.status(409).json({ success: false, data: null, message: "This record is linked to protected history or refers to an unavailable record." });
    const fault = /timeout|timed out/i.test(String(cause?.message ?? "")) ? "DEPENDENCY_TIMEOUT" : /connection|socket/i.test(String(cause?.message ?? "")) ? "DEPENDENCY_CONNECTION" : "INTERNAL";
    console.error("Backend request failed", { requestId: res.get("X-Request-Id"), code: typeof cause?.code === "string" && /^[A-Z0-9_]+$/.test(cause.code) ? cause.code : fault, errorType: /^[A-Za-z]+$/.test(cause?.name ?? "") ? cause.name : "Error" });
    return res.status(fault === "INTERNAL" ? 500 : 503).json({ success: false, data: null, message: fault === "INTERNAL" ? "Request could not be completed. Reference the request ID when reporting this error." : "A backend dependency is temporarily unavailable. Please retry; quote the request ID if it continues." });
  };
  router.use(handler);
  return router;
}
