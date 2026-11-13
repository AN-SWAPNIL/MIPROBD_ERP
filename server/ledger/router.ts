import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { approvalRequests, cashAccounts, ledgerAccounts, ledgerConfigurations, ledgerJournals, ledgerPeriods, ledgerSourceEvents } from "../../database/schema.js";
import { ledgerAccountInput, ledgerConfigurationInput, ledgerJournalInput, ledgerReportInput, ledgerRoleKind } from "../../src/domains/ledger/contracts.js";
import { approvalActionInput } from "../../src/domains/controls/contracts.js";
import { canManageLedger, canReadLedger, canReadPayroll } from "../../src/domains/ledger/access.js";
import { businessDate } from "../../src/lib/date.js";
import { audit, digest, identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { lockActor, newId } from "../operations/common.js";
import { createApproval, consumeApproval } from "../controls/service.js";
import { balancedLines } from "./money.js";
import { checkLedgerDate, insertJournal, journalHash, lockLedger, postLedgerEvent, readJournal, validateLedgerAccounts } from "./service.js";
import { draftStarterLedger } from "./starter.js";

const versionInput = z.object({ version: z.number().int().positive() }).strict();
const pageInput = z.object({ page: z.coerce.number().int().positive().max(10000).default(1), state: z.enum(["Draft", "Submitted", "Posted", "Rejected", "Superseded"]).optional() }).strict();
export function createLedgerRouter(ctx: Context) {
  const router = Router();
  router.use("/ledger", (_req, res, next) => { assertAllowed(canReadLedger(identity(res).user), "General Ledger needs Accounts, sensitive-cost and ledger authority."); next(); });
  router.get("/ledger/status", async (_req, res) => {
    const user = identity(res).user;
    const data = await ctx.db.transaction(async (tx) => {
      const [config] = await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"));
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(ledgerSourceEvents).where(and(eq(ledgerSourceEvents.state, "Deferred"), canReadPayroll(user) ? undefined : eq(ledgerSourceEvents.confidential, false)));
      const periods = await tx.select({ id: ledgerPeriods.id, throughDate: ledgerPeriods.throughDate, reason: ledgerPeriods.reason }).from(ledgerPeriods).orderBy(desc(ledgerPeriods.throughDate)).limit(25);
      return { strictPosting: process.env.NODE_ENV === "production" || process.env.ERP_REQUIRE_LEDGER_CONFIGURATION === "true", configurationId: config?.id ?? null, cutover: config?.data.effectiveFrom ?? null, deferred: total, periods };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Ledger cutover and closed-period status" });
  });
  router.get("/ledger/cash-masters", async (_req, res) => {
    const rows = await ctx.db.select({ id: cashAccounts.id, name: cashAccounts.name, active: cashAccounts.active }).from(cashAccounts).orderBy(cashAccounts.name, cashAccounts.id).limit(101);
    if (rows.length > 100) throw new HttpError(422, "Cash mapping exceeds 100 accounts. Review the reference limit before configuring the ledger.");
    res.json({ success: true, data: rows, message: "Cash/bank mapping references" });
  });
  router.post("/ledger/configurations/starter", async (req, res) => {
    const id = await ctx.db.transaction(async tx => {
      const user = await lockActor(tx, identity(res), "settings", "create");
      assertAllowed(user.role === "Super Admin");
      return draftStarterLedger(tx, user, req.body);
    });
    res.status(201).json({ success: true, data: { id }, message: "Starter chart and mapping draft saved. Super Admin approval is still required." });
  });
  router.get("/ledger/accounts", async (_req, res) => {
    const rows = await ctx.db.select({ id: ledgerAccounts.id, code: ledgerAccounts.code, name: ledgerAccounts.name, kind: ledgerAccounts.kind, active: ledgerAccounts.active }).from(ledgerAccounts).orderBy(ledgerAccounts.code, ledgerAccounts.id).limit(1001);
    if (rows.length > 1000) throw new HttpError(422, "Chart reference exceeds 1,000 accounts. Refine chart selection before continuing.");
    res.json({ success: true, data: rows, message: "Chart of accounts" });
  });
  router.post("/ledger/accounts", async (req, res) => {
    const input = ledgerAccountInput.parse(req.body); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      const id = newId("gl-account"); await tx.insert(ledgerAccounts).values({ ...input, id, createdBy: user.id });
      await audit(tx, user.id, "Chart account created", "Ledger Account", id, { code: input.code, kind: input.kind }); return id;
    });
    res.status(201).json({ success: true, data: { id }, message: "Chart account created without an opening balance" });
  });
  for (const action of ["archive", "activate"] as const) router.post(`/ledger/accounts/:id/${action}`, async (req, res) => {
    z.object({}).strict().parse(req.body); const actor = identity(res);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user)); await lockLedger(tx);
      const [row] = await tx.update(ledgerAccounts).set({ active: action === "activate" }).where(eq(ledgerAccounts.id, String(req.params.id))).returning();
      if (!row) throw new HttpError(404, "Chart account not found.");
      await audit(tx, user.id, `Chart account ${action}`, "Ledger Account", row.id, {});
    });
    res.json({ success: true, data: { id: String(req.params.id) }, message: "Chart availability updated; history retained" });
  });
  router.get("/ledger/journals", async (req, res) => {
    const user = identity(res).user; const q = pageInput.parse(req.query);
    const where = and(q.state ? eq(ledgerJournals.state, q.state) : undefined, canReadPayroll(user) ? undefined : eq(ledgerJournals.confidential, false));
    const data = await ctx.db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(ledgerJournals).where(where);
      const rows = await tx.select({ id: ledgerJournals.id, number: ledgerJournals.number, date: ledgerJournals.date, description: ledgerJournals.description, reference: ledgerJournals.reference, type: ledgerJournals.type, state: ledgerJournals.state, totalBdt: ledgerJournals.totalBdt, version: ledgerJournals.version }).from(ledgerJournals).where(where).orderBy(desc(ledgerJournals.createdAt), ledgerJournals.id).limit(25).offset((q.page - 1) * 25);
      return { rows, total, page: q.page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Saved journals; drafts do not affect balances" });
  });
  router.get("/ledger/journals/:id", async (req, res) => res.json({ success: true, data: await ctx.db.transaction((tx) => readJournal(tx, String(req.params.id), identity(res).user)), message: "Journal detail" }));
  router.post("/ledger/journals", async (req, res) => {
    const input = ledgerJournalInput.parse(req.body); balancedLines(input.lines); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      if (input.date > businessDate()) throw new HttpError(422, "Future journals are not allowed.");
      const id = await insertJournal(tx, user, input); await audit(tx, user.id, "Ledger draft created", "Ledger Journal", id, {}); return id;
    });
    res.status(201).json({ success: true, data: await ctx.db.transaction((tx) => readJournal(tx, id, actor.user)), message: "Balanced draft saved; no balance posted" });
  });
  router.post("/ledger/journals/:id/revise", async (req, res) => {
    const input = ledgerJournalInput.extend({ version: z.number().int().positive() }).parse(req.body); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      const [old] = await tx.select().from(ledgerJournals).where(eq(ledgerJournals.id, String(req.params.id))).for("update");
      if (!old) throw new HttpError(404, "Journal not found.");
      const current = await readJournal(tx, old.id, user);
      const revisable = ["Draft", "Rejected"].includes(old.state) || old.state === "Submitted" && (current.approvalState === "Rejected" || !current.policyActive);
      if (old.createdBy !== user.id || old.version !== input.version || !revisable) throw new HttpError(409, "Only the preparer can revise a current draft, rejected request or retired-policy submission.");
      const id = await insertJournal(tx, user, { ...input, revisionOfId: old.id });
      await tx.update(ledgerJournals).set({ state: "Superseded", version: old.version + 1 }).where(eq(ledgerJournals.id, old.id));
      await audit(tx, user.id, "Ledger draft revised", "Ledger Journal", id, { previousId: old.id }); return id;
    });
    res.status(201).json({ success: true, data: await ctx.db.transaction((tx) => readJournal(tx, id, actor.user)), message: "Linked revision created; original lines retained" });
  });
  router.post("/ledger/journals/:id/submit", async (req, res) => {
    const input = versionInput.parse(req.body); const actor = identity(res); const id = String(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      const [row] = await tx.select().from(ledgerJournals).where(eq(ledgerJournals.id, id)).for("update");
      if (!row) throw new HttpError(404, "Journal not found.");
      if (row.createdBy !== user.id || row.state !== "Draft" || row.version !== input.version) throw new HttpError(409, "Only the preparer's current draft can be submitted.");
      const record = await readJournal(tx, id, user); await validateLedgerAccounts(tx, record.lines); balancedLines(record.lines);
      const approvalId = await createApproval(tx, user, { domain: "Ledger", resourceType: "Ledger Journal", resourceId: id, reference: row.number, amountBdt: row.totalBdt, payloadHash: journalHash(record) });
      await tx.update(ledgerJournals).set({ state: "Submitted", approvalId, version: row.version + 1 }).where(eq(ledgerJournals.id, id));
    });
    res.json({ success: true, data: await ctx.db.transaction((tx) => readJournal(tx, id, actor.user)), message: "Journal sent for policy-based review and approval" });
  });
  router.post("/ledger/journals/:id/post", async (req, res) => {
    const input = versionInput.parse(req.body); const actor = identity(res); const id = String(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      const [row] = await tx.select().from(ledgerJournals).where(eq(ledgerJournals.id, id)).for("update");
      if (!row) throw new HttpError(404, "Journal not found.");
      if (row.state === "Posted") return;
      if (row.version !== input.version || row.state !== "Submitted" || !row.approvalId) throw new HttpError(409, "Submit and approve this current journal first.");
      await lockLedger(tx); await checkLedgerDate(tx, row.date);
      const record = await readJournal(tx, id, user); balancedLines(record.lines); await validateLedgerAccounts(tx, record.lines);
      await consumeApproval(tx, user, row.approvalId, { domain: "Ledger", resourceType: "Ledger Journal", resourceId: id, payloadHash: journalHash(record) });
      await tx.update(ledgerJournals).set({ state: "Posted", postedBy: user.id, postedAt: new Date(), version: row.version + 1 }).where(eq(ledgerJournals.id, id));
      await audit(tx, user.id, "Manual ledger journal posted", "Ledger Journal", id, { approvalId: row.approvalId });
    });
    res.json({ success: true, data: await ctx.db.transaction((tx) => readJournal(tx, id, actor.user)), message: "Balanced journal posted exactly once" });
  });
  router.get("/ledger/configurations", async (_req, res) => {
    const rows = await ctx.db.select().from(ledgerConfigurations).orderBy(desc(ledgerConfigurations.createdAt), ledgerConfigurations.id).limit(100);
    res.json({ success: true, data: rows, message: "Latest 100 mapping versions; approval does not manufacture opening balances" });
  });
  router.post("/ledger/configurations", async (req, res) => {
    const input = ledgerConfigurationInput.parse(req.body); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "create"); assertAllowed(user.role === "Super Admin");
      const id = newId("ledger-config"); await tx.insert(ledgerConfigurations).values({ id, data: input, createdBy: user.id });
      await audit(tx, user.id, "Ledger mapping drafted", "Ledger Configuration", id, {}); return id;
    });
    res.status(201).json({ success: true, data: { id }, message: "Mapping draft saved; independent approval required" });
  });
  for (const action of ["approve", "retire"] as const) router.post(`/ledger/configurations/:id/${action}`, async (req, res) => {
    const input = approvalActionInput.parse(req.body); const actor = identity(res);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "settings", "approve"); assertAllowed(user.role === "Super Admin"); await lockLedger(tx);
      const [row] = await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.id, String(req.params.id))).for("update");
      if (!row) throw new HttpError(404, "Mapping not found.");
      if (row.version !== input.version) throw new HttpError(409, "Mapping changed; reload.");
      if (action === "approve") {
        if (row.state !== "Draft") throw new HttpError(409, "Only a draft mapping can be approved.");
        const data = ledgerConfigurationInput.parse(row.data);
        if (data.effectiveFrom > businessDate()) throw new HttpError(422, "An active posting configuration cannot start in the future.");
        const ids = [...new Set([...data.mappings, ...data.cashMappings].map((m) => m.accountId))];
        const chart = await tx.select().from(ledgerAccounts).where(inArray(ledgerAccounts.id, ids));
        if (chart.length !== ids.length || chart.some((a) => !a.active)) throw new HttpError(422, "Select active chart accounts for every role.");
        for (const m of data.mappings) {
          const kind = chart.find((a) => a.id === m.accountId)!.kind;
          const expected = ledgerRoleKind(m.role);
          if (kind !== expected) throw new HttpError(422, `${m.role} requires an ${expected} account.`);
        }
        const cash = await tx.select({ id: cashAccounts.id, active: cashAccounts.active }).from(cashAccounts);
        if (cash.some((c) => c.active && !data.cashMappings.some((m) => m.cashAccountId === c.id))) throw new HttpError(422, "Map every active cash/bank account before activation.");
        if (data.cashMappings.some((m) => !cash.some((c) => c.id === m.cashAccountId) || chart.find((a) => a.id === m.accountId)?.kind !== "Asset" || data.mappings.some((role) => role.accountId === m.accountId))) throw new HttpError(422, "Cash mappings require active cash masters and separate Asset accounts, not control accounts.");
        const [active] = await tx.select({ id: ledgerConfigurations.id }).from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Approved"));
        if (active) throw new HttpError(409, "Retire the current mapping before approving another version.");
        const [previous] = await tx.select().from(ledgerConfigurations).where(eq(ledgerConfigurations.state, "Retired")).orderBy(desc(ledgerConfigurations.createdAt)).limit(1);
        if (previous && (previous.data.effectiveFrom !== data.effectiveFrom || previous.data.mappings.some((old) => !data.mappings.some((m) => m.role === old.role && m.accountId === old.accountId)) || previous.data.cashMappings.some((old) => !data.cashMappings.some((m) => m.cashAccountId === old.cashAccountId && m.accountId === old.accountId)))) throw new HttpError(409, "Existing cutover and posting accounts are immutable. A new version may add cash/bank mappings; account reclassification needs a separately reviewed migration.");
      } else if (row.state !== "Approved") throw new HttpError(409, "Only an approved mapping can be retired.");
      await tx.update(ledgerConfigurations).set({ state: action === "approve" ? "Approved" : "Retired", approvedBy: action === "approve" ? user.id : row.approvedBy, version: row.version + 1 }).where(eq(ledgerConfigurations.id, row.id));
      await audit(tx, user.id, `Ledger mapping ${action}`, "Ledger Configuration", row.id, { reason: input.reason, superAdminAuthority: true, selfApproval: action === "approve" && row.createdBy === user.id });
    });
    res.json({ success: true, data: { id: String(req.params.id) }, message: "Ledger mapping state updated" });
  });
  router.get("/ledger/events", async (req, res) => {
    const user = identity(res).user; const q = z.object({ page: z.coerce.number().int().positive().max(10000).default(1), state: z.enum(["Deferred", "Posted", "Excluded"]).default("Deferred") }).strict().parse(req.query);
    const where = and(eq(ledgerSourceEvents.state, q.state), canReadPayroll(user) ? undefined : eq(ledgerSourceEvents.confidential, false));
    const data = await ctx.db.transaction(async (tx) => {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(ledgerSourceEvents).where(where);
      const rows = await tx.select().from(ledgerSourceEvents).where(where).orderBy(ledgerSourceEvents.date, ledgerSourceEvents.id).limit(25).offset((q.page - 1) * 25);
      return { rows, total, page: q.page, pageSize: 25 };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Saved source posting queue" });
  });
  router.post("/ledger/events/:id/post", async (req, res) => {
    z.object({}).strict().parse(req.body); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      const [event] = await tx.select().from(ledgerSourceEvents).where(eq(ledgerSourceEvents.id, String(req.params.id)));
      if (!event || event.confidential && !canReadPayroll(user)) throw new HttpError(404, "Source not found.");
      return postLedgerEvent(tx, user, event.id);
    });
    res.json({ success: true, data: { journalId: id }, message: id ? "Saved source posted" : "Source deferred or outside approved cutover" });
  });
  router.get("/ledger/trial-balance", async (req, res) => {
    const q = ledgerReportInput.parse(req.query); if (q.to > businessDate()) throw new HttpError(422, "Reports cannot end in the future.");
    const rows = (await ctx.db.execute(sql`select a.id,a.code,a.name,a.kind,coalesce(sum(l.debit) filter(where j.date<${q.from}::date),0)::text "openingDebit",coalesce(sum(l.credit) filter(where j.date<${q.from}::date),0)::text "openingCredit",coalesce(sum(l.debit) filter(where j.date>=${q.from}::date),0)::text debit,coalesce(sum(l.credit) filter(where j.date>=${q.from}::date),0)::text credit,coalesce(sum(l.debit-l.credit),0)::text balance from erp_private.ledger_accounts a left join (erp_private.ledger_lines l join erp_private.ledger_journals j on j.id=l.journal_id and j.state='Posted' and j.date<=${q.to}::date) on l.account_id=a.id ${q.accountId ? sql`where a.id=${q.accountId}` : sql``} group by a.id,a.code,a.name,a.kind order by a.code,a.id limit 1001`)).rows;
    if (rows.length > 1000) throw new HttpError(422, "Select one account; the chart exceeds 1,000 accounts.");
    res.json({ success: true, data: { rows, from: q.from, to: q.to, basis: "Posted double-entry journals only. Unreconciled opening/control balances do not become a verified company Balance Sheet." }, message: "Trial balance from immutable posted journals" });
  });
  router.post("/ledger/periods/request", async (req, res) => {
    const input = z.object({ throughDate: z.iso.date() }).strict().parse(req.body); const actor = identity(res);
    const id = await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user));
      if (input.throughDate >= businessDate()) throw new HttpError(422, "Only completed business dates can be closed.");
      return createApproval(tx, user, { domain: "Ledger", resourceType: "Ledger Period", resourceId: newId("period-request"), reference: `Close through ${input.throughDate}`, amountBdt: "0.00", payloadHash: digest(JSON.stringify(input)), context: input });
    });
    res.status(201).json({ success: true, data: { approvalId: id }, message: "Period close requires policy-based review and approval" });
  });
  router.post("/ledger/periods/:id/post", async (req, res) => {
    z.object({}).strict().parse(req.body); const actor = identity(res); const id = String(req.params.id);
    await ctx.db.transaction(async (tx) => {
      const user = await lockActor(tx, actor, "accounts", "post"); assertAllowed(canManageLedger(user)); await lockLedger(tx);
      const [existing] = await tx.select({ id: ledgerPeriods.id }).from(ledgerPeriods).where(eq(ledgerPeriods.approvalId, id)); if (existing) return;
      const [approval] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, id)); if (!approval) throw new HttpError(404, "Period approval not found.");
      const input = z.object({ throughDate: z.iso.date() }).strict().parse(approval.context);
      if (input.throughDate >= businessDate()) throw new HttpError(422, "Only completed business dates can be closed.");
      await consumeApproval(tx, user, id, { domain: "Ledger", resourceType: "Ledger Period", resourceId: approval.resourceId, payloadHash: digest(JSON.stringify(input)) });
      await tx.insert(ledgerPeriods).values({ id: newId("ledger-period"), approvalId: id, throughDate: input.throughDate, reason: approval.reason, createdBy: user.id });
      await audit(tx, user.id, "Accounting period closed", "Ledger Period", id, { throughDate: input.throughDate });
    });
    res.json({ success: true, data: { id }, message: "Closed period retained; corrections require an open period" });
  });
  return router;
}
