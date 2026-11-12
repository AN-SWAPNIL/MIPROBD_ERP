import { Router } from "express";
import { sql, type SQL } from "drizzle-orm";
import type { User } from "../../src/types/index.js";
import { businessDate } from "../../src/lib/date.js";
import { hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { expiryStatusAt } from "../../src/domains/inventory/expiry.js";
import { inventoryPageInput } from "../../src/domains/inventory/pageContracts.js";
import { identity, type Context } from "../foundation/context.js";
import { assertAllowed, HttpError } from "../foundation/errors.js";
import { effectiveCondition, heldAt, lastHoldDate } from "./hold-query.js";

type Kind = "stock" | "batches" | "movements";
type Query = ReturnType<typeof inventoryPageInput.parse>;
const recognitionDate = (alias: "b" | "older") => sql`coalesce((select op.as_of_date from erp_private.opening_positions op where op.id=${sql.identifier(alias)}.opening_position_id),(select r.posted_date from erp_private.supplier_replacement_receipts r where r.id=${sql.identifier(alias)}.replacement_receipt_id),(select p.date from erp_private.stock_control_postings p where p.line_id=${sql.identifier(alias)}.correction_line_id),${sql.identifier(alias)}.received_date)`;
const condition = (alias: "b" | "older", date: string) => effectiveCondition(sql`${sql.identifier(alias)}.id`, sql`${date}::date`);
const partialHeld = (alias: "b" | "older", date: string) => heldAt(sql`${sql.identifier(alias)}.id`, sql`${date}::date`);
const available = (alias: "b" | "older", date: string) => sql`(${sql.identifier(alias)}.quantity_available-${partialHeld(alias, date)})`;
const eligible = (alias: "b" | "older", date: string) => sql`${condition(alias, date)}='Saleable' and ${available(alias, date)}>0 and ${sql.identifier(alias)}.expiry_date>=${date}::date and ${recognitionDate(alias)}<=${date}::date and coalesce(${lastHoldDate(sql`${sql.identifier(alias)}.id`)},${recognitionDate(alias)})<=${date}::date`;
function predicates(q: Query, kind: Kind, today: string) {
  const filters: SQL[] = [sql`true`];
  if (q.productId) filters.push(sql`b.product_id=${q.productId}`);
  if (q.batchId) filters.push(sql`b.id=${q.batchId}`);
  if (q.eligibleOnly === "true") filters.push(eligible("b", today));
  if (q.search) {
    const term = `%${q.search.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(kind === "stock" ? sql`concat_ws(' ',p.code,p.name) ilike ${term}` : sql`concat_ws(' ',p.code,p.name,b.batch_number,b.lot_number,b.location,b.source_reference) ilike ${term}`);
  }
  if (q.expiry === "expired") filters.push(sql`b.expiry_date<${today}::date`);
  if (q.expiry === "attention") filters.push(sql`b.expiry_date<=${today}::date+183`);
  if (q.expiry === "normal") filters.push(sql`b.expiry_date>${today}::date+183`);
  return sql.join(filters, sql` and `);
}

export async function inventoryPage(ctx: Context, user: User, kind: Kind, q: Query, compatibility = false) {
  assertAllowed(hasEffectivePermission(user, "inventory")); const today = q.asOfDate ?? businessDate();
  const where = predicates(q, kind, today); const cost = hasCapability(user, "view_sensitive_cost");
  const joined = sql`erp_private.stock_batches b join erp_private.products p on p.id=b.product_id`;
  let base: SQL;
  if (kind === "stock") base = sql`select p.id "productId",p.code "productCode",p.name "productName",p.unit,p.image_url "imageUrl",p.standard_sale_price::text "standardSalePrice",
    sum(b.quantity_available)::text "availableQuantity",coalesce(sum(${available("b", today)}) filter(where ${eligible("b", today)}),0)::text "eligibleQuantity",sum(case when ${condition("b", today)}='Saleable' then ${partialHeld("b", today)} else b.quantity_available end)::text "heldQuantity",
    (array_agg(b.lot_number order by b.received_date,b.id))[1] "oldestLot",to_char(min(b.expiry_date),'YYYY-MM-DD') "nearestExpiry"
    ${cost ? sql`,sum(b.available_value_bdt)::text "inventoryValue"` : sql``}
    from ${joined} where ${where} and b.quantity_available>0 group by p.id,p.code,p.name,p.unit,p.image_url,p.standard_sale_price`;
  else if (kind === "batches") base = sql`select b.id,b.product_id "productId",p.code "productCode",p.name "productName",p.unit,coalesce(b.source_import_id,'') "sourceImportId",b.source_reference "sourceReference",b.lot_number "lotNumber",b.batch_number "batchNumber",${condition("b", today)} "condition",
    to_char(b.manufacturing_date,'YYYY-MM-DD') "manufacturingDate",to_char(b.expiry_date,'YYYY-MM-DD') "expiryDate",to_char(b.received_date,'YYYY-MM-DD') "receivedDate",to_char(${recognitionDate("b")},'YYYY-MM-DD') "availableFromDate",
    b.quantity_received::text "quantityReceived",b.quantity_available::text "quantityAvailable",(case when ${condition("b", today)}='Saleable' then ${partialHeld("b", today)} else b.quantity_available end)::text "heldQuantity",(case when ${eligible("b", today)} then ${available("b", today)} else 0 end)::text "eligibleQuantity",b.warehouse,b.location,
    ${cost ? sql`b.landed_cost_per_unit::text` : sql`'0'::text`} "landedCostPerUnit",case when b.purchase_line_id is not null then 'Purchase Receipt' when b.replacement_receipt_id is not null then 'Supplier Replacement' when b.return_line_id is not null then 'Customer Return' when b.correction_line_id is not null then 'Stock Correction' when b.opening_position_id is not null then 'Opening Stock' else 'Import Receipt' end "sourceType",
    (${eligible("b", today)} and not exists(select 1 from erp_private.stock_batches older where older.product_id=b.product_id and ${eligible("older", today)} and (older.received_date,older.id)<(b.received_date,b.id))) "isFifo"
    from ${joined} where ${where}`;
  else base = sql`select m.id,to_char(m.date,'YYYY-MM-DD') date,b.product_id "productId",p.name "productName",b.id "batchId",b.batch_number "batchNumber",m.type,m.quantity::text,m.quantity_delta::text "quantityDelta",
    case when m.type='Receive' then b.source_reference else m.reference end reference,m.created_by_name "createdBy"
    from erp_private.stock_movements m join erp_private.stock_batches b on b.id=m.batch_id join erp_private.products p on p.id=b.product_id where ${where}`;
  return ctx.db.transaction(async (tx) => {
    const [{ total }] = (await tx.execute<{ total: number }>(sql`with scoped as (${base}) select count(*)::int total from scoped`)).rows;
    const limit = compatibility ? 500 : q.pageSize;
    if (compatibility && total > limit) throw new HttpError(422, "This reference list exceeds 500 rows. Use the paginated Inventory workspace or narrow product selection.");
    const order = kind === "stock" ? sql`"productCode","productId"` : kind === "batches" ? sql`"receivedDate",id` : sql`date desc,id`;
    const rows = (await tx.execute<Record<string, unknown>>(sql`with scoped as (${base}) select * from scoped order by ${order} limit ${limit} offset ${compatibility ? 0 : (q.page - 1) * q.pageSize}`)).rows;
    return { rows: kind === "batches" ? rows.map((row) => ({ ...row, sourceImportId: row.sourceImportId || undefined, expiryStatus: expiryStatusAt(String(row.expiryDate), today) })) : rows, total, page: q.page, pageSize: limit };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export function createInventoryReadRouter(ctx: Context) {
  const router = Router();
  for (const kind of ["stock", "batches", "movements"] as const) router.get(`/inventory/${kind}/page`, async (req, res) => {
    const data = await inventoryPage(ctx, identity(res).user, kind, inventoryPageInput.parse(req.query));
    res.json({ success: true, data, message: "Paginated inventory loaded" });
  });
  router.get("/inventory/summary", async (_req, res) => {
    const user = identity(res).user; assertAllowed(hasEffectivePermission(user, "inventory")); const today = businessDate();
    const data = await ctx.db.transaction(async (tx) => {
      const [head] = (await tx.execute<{ products: number; batches: number; expiryAttention: number; inventoryValue?: string }>(sql`select count(distinct b.product_id)::int products,count(*)::int batches,count(*) filter(where b.expiry_date<=${today}::date+183)::int "expiryAttention"
        ${hasCapability(user, "view_sensitive_cost") ? sql`,coalesce(sum(b.available_value_bdt),0)::text "inventoryValue"` : sql``}
        from erp_private.stock_batches b where b.quantity_available>0`)).rows;
      const units = (await tx.execute<{ unit: string; onHand: string; eligible: string; held: string }>(sql`select p.unit,sum(b.quantity_available)::text "onHand",coalesce(sum(${available("b", today)}) filter(where ${eligible("b", today)}),0)::text eligible,sum(case when ${condition("b", today)}='Saleable' then ${partialHeld("b", today)} else b.quantity_available end)::text held
        from erp_private.stock_batches b join erp_private.products p on p.id=b.product_id where b.quantity_available>0 group by p.unit order by p.unit`)).rows;
      return { ...head, units };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    res.json({ success: true, data, message: "Complete inventory aggregates; quantities remain separated by unit" });
  });
  return router;
}
