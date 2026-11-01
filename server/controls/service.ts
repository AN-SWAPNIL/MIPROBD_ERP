import { and, eq, sql } from "drizzle-orm";
import { approvalEvents, approvalPolicies, approvalRequests, employees } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import type { ControlDomain } from "../../src/domains/controls/contracts.js";
import { businessDate } from "../../src/lib/date.js";
import { canDecideApproval, canReadApprovalAmount, canReadApprovalDomain } from "../../src/domains/controls/access.js";
export { canDecideApproval, canReadApprovalDomain } from "../../src/domains/controls/access.js";
import { D } from "../trading/money.js";
import { audit, toUser } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { newId } from "../operations/common.js";
import { sealQualityEvidence } from "../quality/service.js";
import { isSuperAdmin } from "../../src/lib/permissions/effectiveAccess.js";

export async function createApproval(tx: Transaction, user: User, input: { domain: ControlDomain; resourceType: string; resourceId: string; reference: string; amountBdt: string; payloadHash: string; context?: Record<string, unknown> }) {
  const [policy] = await tx.select().from(approvalPolicies).where(and(eq(approvalPolicies.domain, input.domain), eq(approvalPolicies.state, "Approved"))).for("share");
  if (!policy || policy.data.effectiveFrom > businessDate()) throw new HttpError(409, "An effective, approved approval policy is required.");
  if (new D(input.amountBdt).gt(policy.data.maximumAmountBdt)) throw new HttpError(409, "This amount exceeds the configured approval authority. Review the approved threshold first.");
  const id = newId("approval");
  const evidence=await sealQualityEvidence(tx,user,input.resourceType,input.resourceId,input.payloadHash);
  await tx.insert(approvalRequests).values({ ...input, context:{...input.context,...evidence}, id, policyId: policy.id, policyVersion: policy.version, policy: policy.data, requestedBy: user.id });
  await tx.insert(approvalEvents).values({ id: newId("approval-event"), approvalId: id, actorId: user.id, version: 1, action: "Submitted", reason: "Source submitted with immutable payload hash" });
  await audit(tx, user.id, "Control submitted", input.resourceType, input.resourceId, { approvalId: id, domain: input.domain });
  return id;
}
export async function lockCurrentApproval(tx: Transaction, id: string) {
  const [row] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, id)).for("update");
  if (!row) throw new HttpError(404, "Approval not found.");
  const [policy] = await tx.select().from(approvalPolicies).where(eq(approvalPolicies.id, row.policyId)).for("share");
  if (!policy || policy.state !== "Approved" || policy.version !== row.policyVersion || policy.data.effectiveFrom > businessDate()) throw new HttpError(409, "The approval policy was retired or changed. Prepare a new reviewed revision.");
  return row;
}
export async function decideApproval(tx: Transaction, user: User, id: string, action: "verify" | "approve" | "reject", version: number, reason: string): Promise<void> {
  const row = await lockCurrentApproval(tx, id); assertAllowed(canReadApprovalDomain(user, row.domain));
  if (row.version !== version) throw new HttpError(409, "Approval changed; reload before deciding.");
  if (["Posted", "Rejected"].includes(row.state) || row.state === "Approved" && action !== "reject") throw new HttpError(409, "This approval no longer accepts this decision.");
  const administrator = isSuperAdmin(user);
  if (administrator && action === "approve" && row.state === "Submitted") {
    // Retain both review events atomically; owner authority does not erase the workflow history.
    await decideApproval(tx, user, id, "verify", version, reason);
    return decideApproval(tx, user, id, "approve", version + 1, reason);
  }
  const excluded = Array.isArray(row.context.excludedActorIds) ? row.context.excludedActorIds : [];
  if (!administrator && (row.requestedBy === user.id || excluded.includes(user.id))) throw new HttpError(403, "A delegated preparer cannot verify or approve their own request or any revision they prepared.");
  const verifier = row.policy.verifierIds.includes(user.id); const approver = row.policy.approverIds.includes(user.id);
  if (action === "verify") assertAllowed(administrator || verifier, "You are not a named verifier in this approved policy.");
  else assertAllowed(administrator || approver && canDecideApproval(user, row.domain), "You are not a named, authorized approver in this policy.");
  if (action === "approve" && ["Stock Control","Customer Return","Return Settlement","Supplier Claim","Supplier Replacement Receipt"].includes(row.resourceType)) assertAllowed(canReadApprovalAmount(user, row.domain), "Stock/return final approval requires sensitive-cost authority.");
  if (action === "verify" && row.state !== "Submitted") throw new HttpError(409, "Only submitted requests can be verified.");
  if (action === "approve" && (row.state !== "Verified" || !administrator && row.policy.independentVerifier && row.verifiedBy === user.id)) throw new HttpError(403, "Independent verification and a different final approver are required.");
  const state = action === "verify" ? "Verified" : action === "approve" ? "Approved" : "Rejected";
  const recordedReason = administrator ? `Super Admin authority: ${reason}` : reason;
  await tx.update(approvalRequests).set({ state, version: row.version + 1, reason: recordedReason, updatedAt: new Date(), ...(action === "verify" ? { verifiedBy: user.id, verifiedAsSuperAdmin: administrator } : action === "approve" ? { approvedBy: user.id, approvedAsSuperAdmin: administrator } : {}) }).where(eq(approvalRequests.id, id));
  await tx.insert(approvalEvents).values({ id: newId("approval-event"), approvalId: id, actorId: user.id, version: row.version + 1, action: state, reason: recordedReason });
  await audit(tx, user.id, `Control ${state.toLowerCase()}`, row.resourceType, row.resourceId, { approvalId: id, domain: row.domain, superAdminAuthority: administrator, selfDecision: row.requestedBy === user.id || excluded.includes(user.id) });
}
export async function consumeApproval(tx: Transaction, user: User, id: string, expected: { domain: ControlDomain; resourceType: string; resourceId: string; payloadHash: string }) {
  const row = await lockCurrentApproval(tx, id);
  if (row.state !== "Approved" || row.domain !== expected.domain || row.resourceType !== expected.resourceType || row.resourceId !== expected.resourceId || row.payloadHash !== expected.payloadHash) throw new HttpError(409, "An approved, unchanged source snapshot is required before posting.");
  const authorities = await tx.select().from(employees).where(sql`${employees.id} in (${row.approvedBy},${row.verifiedBy})`).orderBy(employees.id).for("share");
  const approver = authorities.find((p) => p.id === row.approvedBy); const verifier = authorities.find((p) => p.id === row.verifiedBy);
  const excluded = Array.isArray(row.context.excludedActorIds) ? row.context.excludedActorIds : [];
  if (!row.approvedAsSuperAdmin && excluded.includes(row.approvedBy) || !row.verifiedAsSuperAdmin && excluded.includes(row.verifiedBy)) throw new HttpError(409, "A delegated source preparer cannot supply its independent approval evidence.");
  if (!approver || !canDecideApproval(toUser(approver), row.domain) || !verifier || !canReadApprovalDomain(toUser(verifier), row.domain)) throw new HttpError(409, "Verification or final approval authority is no longer active.");
  if (row.approvedAsSuperAdmin && !isSuperAdmin(toUser(approver)) || row.verifiedAsSuperAdmin && !isSuperAdmin(toUser(verifier))) throw new HttpError(409, "Recorded Super Admin authority is no longer active. Obtain a new approval.");
  if (["Stock Control","Customer Return","Return Settlement","Supplier Claim","Supplier Replacement Receipt"].includes(row.resourceType) && !canReadApprovalAmount(toUser(approver), row.domain)) throw new HttpError(409, "Stock/return cost-approval authority was withdrawn.");
  await tx.update(approvalRequests).set({ state: "Posted", version: row.version + 1, updatedAt: new Date() }).where(eq(approvalRequests.id, id));
  await tx.insert(approvalEvents).values({ id: newId("approval-event"), approvalId: id, actorId: user.id, version: row.version + 1, action: "Posted", reason: "Approved source posted atomically" });
}
