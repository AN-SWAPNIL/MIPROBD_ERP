import { readFile, writeFile } from "node:fs/promises";

// One-time, fail-closed mechanical generation from reviewed migration statements.
// Financial predicates remain unchanged; only preparer-independence predicates
// recognize the immutable authority flags validated by guard_control_approval.
const directory = new URL("../database/migrations/", import.meta.url);
const target = new URL("0067_super_admin_approval_authority.sql", directory);
let output = await readFile(target, "utf8");
const marker = "-- Source-specific Super Admin authority guards";
if (output.includes(marker)) throw new Error("Owner authority guards have already been generated");
const plans = [
  ["0033_approved_stock_controls.sql", "guard_stock_control_header", ["NEW.preparer_ids ? a.verified_by", "NEW.preparer_ids ? a.approved_by"]],
  ["0034_stock_control_guard_aliases.sql", "verify_stock_control_posting", ["v_control.preparer_ids ? a.verified_by", "v_control.preparer_ids ? a.approved_by"]],
  ["0036_return_guards.sql", "guard_customer_return", ["NEW.preparer_ids ? v_a.verified_by", "NEW.preparer_ids ? v_a.approved_by"]],
  ["0049_opening_return_credits.sql", "guard_return_settlement", ["v_a.approved_by=NEW.created_by", "v_a.verified_by=NEW.created_by"]],
  ["0044_payroll_approval_scope.sql", "require_payroll_approval", ["a.context->'excludedActorIds' ? a.approved_by", "a.context->'excludedActorIds' ? a.verified_by"]],
  ["0059_exact_supplier_poisha.sql", "guard_supplier_claim", ["NEW.preparer_ids ? a.verified_by", "NEW.preparer_ids ? a.approved_by"]],
  ["0064_replacement_inspection_guards.sql", "guard_supplier_replacement", ["(c.preparer_ids||to_jsonb(NEW.created_by)) ? a.verified_by", "(c.preparer_ids||to_jsonb(NEW.created_by)) ? a.approved_by"]]
];
output += "\n--> statement-breakpoint\n" + marker + "\n";
for (const [file, name, predicates] of plans) {
  const blocks = (await readFile(new URL(file, directory), "utf8")).split("--> statement-breakpoint");
  let body = blocks.find((block) => new RegExp(`^CREATE (?:OR REPLACE )?FUNCTION erp_private\\.${name}\\(`).test(block.trim()))?.trim();
  if (!body) throw new Error(`Expected function ${name} not found`);
  body = body.replace(/^CREATE FUNCTION /, "CREATE OR REPLACE FUNCTION ");
  for (const predicate of predicates) {
    if (body.split(predicate).length !== 2) throw new Error(`Expected exactly one independence predicate in ${name}`);
    const alias = predicate.match(/\b(v_a|a)\.(approved|verified)_by/) ?? [];
    if (!alias[1]) throw new Error("Missing decision alias");
    body = body.replace(predicate, `(${predicate} AND NOT ${alias[1]}.${alias[2]}_as_super_admin)`);
  }
  output += body + "\n--> statement-breakpoint\n";
}
const blocks = (await readFile(new URL("0026_opening_postings.sql", directory), "utf8")).split("--> statement-breakpoint");
let opening = blocks.find((block) => block.trim().startsWith("CREATE OR REPLACE FUNCTION erp_private.protect_opening_evidence()"))?.trim();
const needle = "IF TG_OP='UPDATE' THEN\n      IF NEW.source_id";
if (!opening || !opening.includes(needle.replaceAll("\n", opening.includes("\r\n") ? "\r\n" : "\n"))) throw new Error("Opening guard template mismatch");
opening = opening.replaceAll("\r\n", "\n").replace(needle, "IF TG_OP='UPDATE' THEN\n      IF NEW.state='Approved' AND OLD.state<>'Approved' AND NOT erp_private.active_super_admin(NEW.approved_by) THEN RAISE EXCEPTION 'Only an active Super Admin may approve reconciled opening data' USING ERRCODE='23514'; END IF;\n      IF NEW.source_id");
output += opening + "\n";
await writeFile(target, output);
console.log("Generated eight source-specific guards; financial and provenance checks retained. No database was changed.");
