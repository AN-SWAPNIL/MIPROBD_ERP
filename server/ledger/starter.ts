import type { Transaction } from "../../database/client.js";
import { cashAccounts, ledgerAccounts, ledgerConfigurations } from "../../database/schema.js";
import type { User } from "../../src/types/index.js";
import { ledgerConfigurationInput } from "../../src/domains/ledger/contracts.js";
import { ledgerStarterInput, ledgerStarterProposal } from "../../src/domains/ledger/starter.js";
import { businessDate } from "../../src/lib/date.js";
import { audit } from "../foundation/context.js";
import { HttpError } from "../foundation/errors.js";
import { newId } from "../operations/common.js";
import { lockLedger } from "./service.js";

export async function draftStarterLedger(tx: Transaction, user: User, body: unknown) {
  const input = ledgerStarterInput.parse(body);
  if (user.role !== "Super Admin" || user.status !== "Active") throw new HttpError(403, "Only Super Admin can prepare the initial company posting setup.");
  if (input.effectiveFrom > businessDate()) throw new HttpError(422, "The accounting start date cannot be in the future.");
  await lockLedger(tx);
  const existing = await tx.select().from(ledgerConfigurations).limit(1);
  if (existing.length) throw new HttpError(409, "A posting configuration already exists. Review its draft or use New Mapping; the starter will not replace it.");
  const chart = await tx.select().from(ledgerAccounts);
  const cash = await tx.select({ id: cashAccounts.id, name: cashAccounts.name, active: cashAccounts.active }).from(cashAccounts);
  let proposal;
  try { proposal = ledgerStarterProposal(chart, cash); } catch (error) { throw new HttpError(409, (error as Error).message); }
  const rows = [];
  for (const account of proposal) {
    const id = account.existingId ?? newId("gl-account");
    if (!account.existingId) await tx.insert(ledgerAccounts).values({ id, code: account.code, name: account.name, kind: account.kind, createdBy: user.id });
    rows.push({ ...account, id });
  }
  const data = ledgerConfigurationInput.parse({ effectiveFrom: input.effectiveFrom, proofReference: input.proofReference, mappings: rows.flatMap(row => row.role ? [{ role: row.role, accountId: row.id }] : []), cashMappings: rows.flatMap(row => row.cashAccountId ? [{ cashAccountId: row.cashAccountId, accountId: row.id }] : []) });
  const id = newId("ledger-config");
  await tx.insert(ledgerConfigurations).values({ id, data, createdBy: user.id });
  await audit(tx, user.id, "Starter ledger mapping drafted", "Ledger Configuration", id, { chartAccountsCreated: rows.filter(row => !row.existingId).length, openingBalancesPosted: false, approved: false });
  return id;
}
