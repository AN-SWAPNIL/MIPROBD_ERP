import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { approvalEvents, approvalPolicies, approvalRequests, employees } from "../../database/schema.js";
import { approvalActionInput, approvalPageInput, approvalPolicyInput, controlDomains } from "../../src/domains/controls/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { audit, identity, toUser, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, newId } from "../operations/common.js";
import { canDecideApproval, canReadApprovalDomain, decideApproval } from "./service.js";
import { canReadApprovalAmount } from "../../src/domains/controls/access.js";

function sourcePath(r:typeof approvalRequests.$inferSelect){
    if(r.resourceType==="Supplier Claim")return `/backend/supplier-claims/${encodeURIComponent(r.resourceId)}`;
    if(r.resourceType==="Supplier Replacement Receipt"&&typeof r.context.claimId==="string")return `/backend/supplier-claims/${encodeURIComponent(r.context.claimId)}?receipt=${encodeURIComponent(r.resourceId)}`;
  if(r.resourceType==="Payroll Run")return `/backend/payroll/runs/${encodeURIComponent(r.resourceId)}`;
  if(r.resourceType==="Payroll Payment"&&typeof r.context.runId==="string")return `/backend/payroll/runs/${encodeURIComponent(r.context.runId)}`;
  if(r.resourceType==="Payroll Policy")return `/backend/payroll?view=policies&source=${encodeURIComponent(r.resourceId)}`;
  if(r.resourceType==="Payroll Loan")return `/backend/payroll?view=loans&source=${encodeURIComponent(r.resourceId)}`;
  if(r.resourceType==="Customer Return")return `/backend/returns/${encodeURIComponent(r.resourceId)}`;
  if(r.resourceType==="Return Settlement"&&typeof r.context.returnId==="string")return `/backend/returns/${encodeURIComponent(r.context.returnId)}`;
  if(r.resourceType==="Stock Control")return `/backend/inventory/controls/${encodeURIComponent(r.resourceId)}`;
  if(r.resourceType==="Stock Hold Release"&&typeof r.context.holdId==="string")return `/backend/inventory/holds?hold=${encodeURIComponent(r.context.holdId)}`;
  return undefined;
}

export function createControlRouter(ctx: Context) {
  const router = Router();
  router.get("/controls/approvals", async (req, res) => {
    const user = identity(res).user; const q = approvalPageInput.parse(req.query);
    const domains = controlDomains.filter((domain) => canReadApprovalDomain(user, domain)); assertAllowed(domains.length > 0);
    const where = and(inArray(approvalRequests.domain, domains), q.domain ? eq(approvalRequests.domain, q.domain) : undefined, q.state ? eq(approvalRequests.state, q.state) : undefined,
      user.role === "Super Admin" ? undefined : or(eq(approvalRequests.requestedBy, user.id), sql`${approvalRequests.policy}->'verifierIds' ? ${user.id}`, sql`${approvalRequests.policy}->'approverIds' ? ${user.id}`));
    const data = await ctx.db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(approvalRequests).where(where);
      const rows = await tx.select({ request: approvalRequests, name: employees.name, currentPolicy: approvalPolicies }).from(approvalRequests).innerJoin(employees, eq(employees.id, approvalRequests.requestedBy)).innerJoin(approvalPolicies, eq(approvalRequests.policyId, approvalPolicies.id)).where(where).orderBy(desc(approvalRequests.createdAt), approvalRequests.id).limit(25).offset((q.page - 1) * 25);
      return { rows: rows.map(({ request: r, name, currentPolicy }) => ({ id: r.id, domain: r.domain, resourceType: r.resourceType, resourceId: r.resourceId, sourcePath:sourcePath(r), excludedActorIds: Array.isArray(r.context.excludedActorIds) ? r.context.excludedActorIds.filter((v): v is string => typeof v === "string") : [], reference: r.reference, amountBdt: canReadApprovalAmount(user, r.domain) ? r.amountBdt : "Restricted", state: r.state, version: r.version, requestedBy: r.requestedBy, requestedByName: name, verifiedBy: r.verifiedBy, approvedBy: r.approvedBy, verifiedAsSuperAdmin: r.verifiedAsSuperAdmin, approvedAsSuperAdmin: r.approvedAsSuperAdmin, createdAt: r.createdAt.toISOString(), policy: r.policy, policyVersion: r.policyVersion, policyActive: currentPolicy.state === "Approved" && currentPolicy.version === r.policyVersion })), total, page: q.page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Assigned approval requests" });
  });
  router.get("/controls/approvals/:id/events", async (req, res) => {
    const user = identity(res).user; const [row] = await ctx.db.select().from(approvalRequests).where(eq(approvalRequests.id, String(req.params.id)));
    if (!row) throw new HttpError(404, "Approval not found.");
    assertAllowed(canReadApprovalDomain(user, row.domain) && (user.role === "Super Admin" || row.requestedBy === user.id || row.policy.verifierIds.includes(user.id) || row.policy.approverIds.includes(user.id)));
    const data = await ctx.db.select({ id: approvalEvents.id, actor: employees.name, action: approvalEvents.action, reason: approvalEvents.reason, version: approvalEvents.version, at: approvalEvents.createdAt }).from(approvalEvents).innerJoin(employees, eq(employees.id, approvalEvents.actorId)).where(eq(approvalEvents.approvalId, row.id)).orderBy(approvalEvents.version).limit(20);
    res.json({ success: true, data: data.map((event) => ({ ...event, reason: canReadApprovalAmount(user, row.domain) ? event.reason : "Restricted financial evidence" })), message: "Immutable decision history" });
  });
  for (const action of ["verify", "approve", "reject"] as const) router.post(`/controls/approvals/:id/${action}`, async (req, res) => {
    const input = approvalActionInput.parse(req.body); const actor = identity(res);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "dashboard", "view");
      await decideApproval(tx, user, String(req.params.id), action, input.version, input.reason);
    });
    res.json({ success: true, data: { id: String(req.params.id) }, message: `Approval ${action} recorded` });
  });
  router.get("/controls/policies", async (_req, res) => {
    const user = identity(res).user; assertAllowed(user.role === "Super Admin" && hasEffectivePermission(user, "settings"));
    const rows = await ctx.db.select().from(approvalPolicies).orderBy(desc(approvalPolicies.createdAt), approvalPolicies.id).limit(100);
    const people = await ctx.db.select({ id: employees.id, name: employees.name, role: employees.role }).from(employees).where(eq(employees.status, "Active")).orderBy(employees.name, employees.id).limit(201);
    if (people.length > 200) throw new HttpError(422, "Refine employee selection before configuring policies; more than 200 active employees exist.");
    res.json({ success: true, data: { rows, people }, message: "Latest 100 policy versions; no compensation data" });
  });
  router.post("/controls/policies", async (req, res) => {
    const input = approvalPolicyInput.parse(req.body); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "create"); assertAllowed(user.role === "Super Admin");
      const id = newId("approval-policy"); await tx.insert(approvalPolicies).values({ id, domain: input.domain, data: input, createdBy: user.id });
      await audit(tx, user.id, "Approval policy drafted", "Approval Policy", id, { domain: input.domain }); return id;
    });
    res.status(201).json({ success: true, data: { id }, message: "Policy draft saved; Super Admin can review and activate it" });
  });
  for (const action of ["approve", "retire"] as const) router.post(`/controls/policies/:id/${action}`, async (req, res) => {
    const input = approvalActionInput.parse(req.body); const actor = identity(res);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "approve"); assertAllowed(user.role === "Super Admin");
      await tx.execute(sql`select pg_advisory_xact_lock(77612022)`);
      const [row] = await tx.select().from(approvalPolicies).where(eq(approvalPolicies.id, String(req.params.id))).for("update");
      if (!row) throw new HttpError(404, "Policy not found.");
      if (row.version !== input.version) throw new HttpError(409, "Policy changed; reload.");
      if (action === "approve") {
        if (row.state !== "Draft") throw new HttpError(409, "Only a draft policy can be approved.");
        const data = approvalPolicyInput.parse(row.data); if (data.effectiveFrom > businessDate()) throw new HttpError(422, "Use an effective date no later than today.");
        const people = await tx.select().from(employees).where(inArray(employees.id, [...new Set([...data.verifierIds, ...data.approverIds])]));
        if (people.some((p) => p.status !== "Active") || people.length !== new Set([...data.verifierIds, ...data.approverIds]).size) throw new HttpError(422, "All policy members must be active employees.");
        for (const id of data.verifierIds) assertAllowed(canReadApprovalDomain(toUser(people.find((p) => p.id === id)!), row.domain), "A verifier lacks domain access.");
        for (const id of data.approverIds) assertAllowed(canDecideApproval(toUser(people.find((p) => p.id === id)!), row.domain), "An approver lacks the required domain capability.");
        if (data.independentVerifier && !data.verifierIds.some((id) => data.approverIds.some((other) => other !== id)) && !people.some((p) => p.role === "Super Admin")) throw new HttpError(422, "Delegated independent verification requires distinct people.");
        const [active] = await tx.select({ id: approvalPolicies.id }).from(approvalPolicies).where(and(eq(approvalPolicies.domain, row.domain), eq(approvalPolicies.state, "Approved")));
        if (active) throw new HttpError(409, "Retire the previous policy before approving a replacement. Pending requests will require a new reviewed revision.");
      } else if (row.state !== "Approved") throw new HttpError(409, "Only active approved policies can be retired.");
      await tx.update(approvalPolicies).set({ state: action === "approve" ? "Approved" : "Retired", approvedBy: action === "approve" ? user.id : row.approvedBy, version: row.version + 1 }).where(eq(approvalPolicies.id, row.id));
      await audit(tx, user.id, `Approval policy ${action}`, "Approval Policy", row.id, { reason: input.reason, domain: row.domain, superAdminAuthority: true, selfApproval: action === "approve" && row.createdBy === user.id });
    });
    res.json({ success: true, data: { id: String(req.params.id) }, message: "Policy authority updated" });
  });
  return router;
}
