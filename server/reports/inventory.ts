import { sql } from "drizzle-orm";
import type { User } from "../../src/types/index.js";
import { hasCapability } from "../../src/lib/permissions/effectiveAccess.js";
import { between, count, dim, money, qty, raw, text, type Query, type Spec } from "./common.js";
import { expiryBands } from "../../src/domains/inventory/expiry.js";
import { effectiveCondition, heldAt } from "../operations/hold-query.js";

export function inventorySpec(id: string, user: User, q: Query): Spec | undefined {
  const dimensions = { product: dim("product_id", "product"), family: dim("family"), status: dim("status") };
  const canCost = hasCapability(user, "view_sensitive_cost");
  if (id === "purchase-receipts") return {
    base: sql`select r.id,r.number reference,r.received_date date,r.supplier_id,r.supplier_name supplier,r.reference supplier_reference,l.product_id,p.code,p.name product,p.family,p.unit,l.quantity,l.value_bdt value,r.created_by_name actor from erp_private.purchase_receipts r join erp_private.purchase_lines l on l.receipt_id=r.id join erp_private.products p on p.id=l.product_id where ${between(sql`r.received_date`, q)}`,
    dimensions: { ...dimensions, supplier: dim("supplier_id", "supplier") }, result: raw("select * from scoped order by date,reference,code"),
    basis: "Posted purchase receipts by actual receipt date. BDT value is quantity x supplied unit price x captured currency rate, rounded per line. Each receipt posts the matching supplier payable; payments are recorded separately in Accounts. Imports and opening stock are not included.",
    columns: [text("date", "Received"), text("reference", "Receipt"), text("supplier", "Supplier"), text("supplier_reference", "Supplier Invoice / Reference"), text("code", "Code"), text("product", "Product"), text("unit", "Unit"), qty("quantity", "Received Quantity"), ...(canCost ? [money("value", "Received Value (BDT)")] : []), text("actor", "Posted By")]
  };
  const physical = sql`coalesce((select sum(m.quantity_delta) from erp_private.stock_movements m where m.batch_id=b.id and m.date<=${q.to}::date),0)`;
  const condition = effectiveCondition(sql`b.id`, sql`${q.to}::date`);
  const held = sql`case when ${condition}='Saleable' then ${heldAt(sql`b.id`, sql`${q.to}::date`)} else ${physical} end`;
  const eligible = sql`case when ${condition}='Saleable' and b.expiry_date>=${q.to}::date then ${physical}-${held} else 0 end`;
  if (["stock-control-register", "stock-count-variance", "stock-writeoffs", "stock-condition-history"].includes(id)) return {
    base: sql`select c.id control_id,c.number reference,c.kind,c.state status,c.count_date date,c.posted_date posted_date,l.id,l.batch_id,l.snapshot->>'productId' product_id,l.snapshot->>'productCode' code,l.snapshot->>'productName' product,l.snapshot->>'unit' unit,l.snapshot->>'batchNumber' batch,l.snapshot->>'lotNumber' lot,l.snapshot->>'condition' original_condition,
      l.book_quantity book,l.counted_quantity counted,l.delta_quantity variance,l.held_quantity held,case when c.state='Posted' then case when l.delta_quantity<0 then -l.value_bdt else l.value_bdt end else 0 end value,case when c.kind='Condition Release' then l.book_value_bdt else l.value_bdt end proposed_value,
      c.reason,c.inspection,c.proof_reference proof,e.name preparer,coalesce(v.name,'') verifier,coalesce(a.name,'') approver
      from erp_private.stock_controls c join erp_private.stock_control_lines l on l.control_id=c.id join erp_private.employees e on e.id=c.created_by left join erp_private.approval_requests r on r.id=c.approval_id left join erp_private.employees v on v.id=r.verified_by left join erp_private.employees a on a.id=r.approved_by
      where ${between(id === "stock-writeoffs" ? sql`c.posted_date` : sql`c.count_date`, q)}
      ${id === "stock-count-variance" ? sql`and c.kind='Physical Count'` : id === "stock-writeoffs" ? sql`and c.kind='Write-off' and c.state='Posted'` : id === "stock-condition-history" ? sql`and c.kind='Condition Release'` : sql``}`,
    dimensions: { product: dim("product_id", "product"), status: dim("status"), stockControl: dim("control_id", "reference") }, result: raw("select * from scoped order by date,reference,id"), inventoryJournal: true,
    basis: "Selected-batch source snapshots, not a claim of a complete warehouse count. Counts and condition reports use observation date; posted write-offs use posting date. Draft/submitted/superseded proposals change no stock or GL. Posted cost impact is signed: loss negative, evidenced surplus positive; a condition release changes neither. Review/source references and independent decision names are retained.",
    columns: [text("date", "Observed"), text("posted_date", "Posted"), text("reference", "Document"), text("kind", "Control"), text("status", "Status"), text("product", "Product"), text("unit", "Unit"), text("batch", "Batch"), text("lot", "LOT"), text("original_condition", "Inspected Condition"), qty("book", "Book Qty"), qty("counted", "Counted / Remaining"), qty("variance", "Variance"), ...(canCost ? [money("proposed_value", "Reviewed Value", false), money("value", "Posted Cost Impact")] : []), text("inspection", "Inspection"), text("reason", "Reason"), text("proof", "Evidence Reference"), text("preparer", "Prepared By"), text("verifier", "Verified By"), text("approver", "Approved By")]
  };
  if (id === "stock-holds") return {
    base: sql`select h.id,h.number reference,h.date,b.product_id,p.code,p.name product,p.unit,p.family,b.batch_number batch,b.lot_number lot,h.condition status,h.reason,h.proof_reference proof,e.name actor,h.quantity,
      coalesce((select sum(r.quantity) from erp_private.stock_hold_releases r where r.hold_id=h.id and r.state='Posted' and r.date<=${q.to}::date),0) released,
      coalesce((select sum(w.quantity) from erp_private.stock_hold_writeoffs w where w.hold_id=h.id and w.date<=${q.to}::date),0) disposed,
        coalesce((select sum(p.quantity) from erp_private.supplier_claim_postings p where p.hold_id=h.id and p.date<=${q.to}::date),0) supplier_returned,
        erp_private.stock_hold_outstanding(h.id,${q.to}::date) outstanding
      from erp_private.stock_holds h join erp_private.stock_batches b on b.id=h.batch_id join erp_private.products p on p.id=b.product_id join erp_private.employees e on e.id=h.created_by where h.date<=${q.to}::date`,
    dimensions, result: raw("select * from scoped order by date,reference,id"), inventoryJournal: true,
    basis: "Hold reservations, approved releases and separately approved physical write-offs through the end date. A release makes units eligible subject to condition/expiry; a write-off removes its units and saved cost. Neither pending approval frees stock.",
    columns: [text("date", "Held On"), text("reference", "Hold"), text("code", "Code"), text("product", "Product"), text("unit", "Unit"), text("batch", "Batch"), text("lot", "LOT"), text("status", "Held Condition"), qty("quantity", "Initially Held"), qty("released", "Released"), qty("disposed", "Written Off"), qty("supplier_returned", "Supplier Return"), qty("outstanding", "Still Held"), text("reason", "Reason"), text("proof", "Evidence Reference"), text("actor", "Held By")]
  };
  if (id === "stock-movement") return {
    base: sql`select m.date,m.id,m.reference,m.type status,b.product_id,p.code,p.name product,p.family,p.unit,b.batch_number batch,b.lot_number lot,b.expiry_date expiry,m.quantity_delta quantity,m.value_delta_bdt value,m.created_by_name actor from erp_private.stock_movements m join erp_private.stock_batches b on b.id=m.batch_id join erp_private.products p on p.id=b.product_id where ${between(sql`m.date`,q)}`,
    dimensions, result: raw("select * from scoped order by date,reference,id"), basis: "Signed immutable stock postings inside the period: inbound positive, outbound negative. Opening stock posts on its count date, not its original FIFO receipt date. Saved costs are not recomputed from rounded unit costs.", inventoryJournal: true,
    columns: [text("date", "Date"), text("reference", "Reference"), text("status", "Movement"), text("code", "Code"), text("product", "Product"), text("unit", "Unit"), text("batch", "Batch"), text("lot", "LOT"), text("expiry", "Expiry"), qty("quantity", "Quantity"), ...(canCost ? [money("value", "Movement Cost", false)] : []), text("actor", "Posted By")]
  };
  if (["current-stock", "expiry-report"].includes(id)) return {
    base: sql`select b.id,b.product_id,p.code,p.name product,p.family,p.unit,b.batch_number batch,b.lot_number lot,b.source_reference reference,b.received_date received,b.expiry_date expiry,b.warehouse,b.location,${condition} "condition",
      case when b.expiry_date<${q.to}::date then 'Expired' when b.expiry_date<=${q.to}::date+${expiryBands[0].days}::integer then '1 Month Alert' when b.expiry_date<=${q.to}::date+${expiryBands[1].days}::integer then '3 Month Alert' when b.expiry_date<=${q.to}::date+${expiryBands[2].days}::integer then '6 Month Alert' else 'Normal' end status,
      ${physical} quantity,${held} held,${eligible} eligible,
      coalesce((select sum(m.value_delta_bdt) from erp_private.stock_movements m where m.batch_id=b.id and m.date<=${q.to}::date),0) value
      from erp_private.stock_batches b join erp_private.products p on p.id=b.product_id where b.received_date<=${q.to}::date`,
    dimensions, result: sql`select * from scoped where quantity>0 ${id === "expiry-report" ? raw("and status<>'Normal'") : raw("")} order by expiry,received,id`, inventoryJournal: true,
    basis: "Physical on-hand reconstructed through the end date. Held units include whole-batch opening conditions and outstanding partial holds at that date. Eligible excludes holds and expired stock; no hold or release changes book cost. Expiry bands use Inventory's 31/92/183-day boundaries.",
    columns: [text("code", "Code"), text("product", "Product"), text("unit", "Unit"), text("reference", "Source Reference"), text("lot", "LOT"), text("batch", "Batch"), text("received", "FIFO Received"), text("expiry", "Expiry"), text("condition", "Effective Condition"), text("status", "Expiry Status"), text("location", "BIN"), qty("quantity", "On Hand"), qty("held", "Held"), qty("eligible", "Eligible"), ...(canCost ? [money("value", "Inventory Value")] : [])]
  };
  if (["product-list", "stock-summary", "item-details"].includes(id)) return {
    base: sql`select p.id product_id,p.code,p.name product,p.family,p.variant,p.unit,p.hs_code hs_code,p.standard_sale_price price,case when p.active then 'Active' else 'Inactive' end status,
      coalesce((select sum(m.quantity_delta) from erp_private.stock_movements m join erp_private.stock_batches b on b.id=m.batch_id where b.product_id=p.id and m.date<=${q.to}::date),0) quantity,
      coalesce((select sum(m.value_delta_bdt) from erp_private.stock_movements m join erp_private.stock_batches b on b.id=m.batch_id where b.product_id=p.id and m.date<=${q.to}::date),0) value,
      coalesce((select sum(${held}) from erp_private.stock_batches b where b.product_id=p.id),0) held,
      coalesce((select sum(${eligible}) from erp_private.stock_batches b where b.product_id=p.id),0) eligible,
      (select count(*) from erp_private.stock_batches b where b.product_id=p.id and b.received_date<=${q.to}::date and coalesce((select sum(m.quantity_delta) from erp_private.stock_movements m where m.batch_id=b.id and m.date<=${q.to}::date),0)>0) batches,
      (select min(b.expiry_date) from erp_private.stock_batches b where b.product_id=p.id and b.received_date<=${q.to}::date and coalesce((select sum(m.quantity_delta) from erp_private.stock_movements m where m.batch_id=b.id and m.date<=${q.to}::date),0)>0) expiry
      from erp_private.products p`,
    dimensions, result: raw("select * from scoped order by code,product_id"), inventoryJournal: true,
    basis: "Current canonical product directory, with physical stock/value reconstructed through the end date. Product names, active status and standard selling prices are current master data, not historical price snapshots.",
    columns: [text("code", "Code"), text("product", "Product"), text("family", "Family"), text("variant", "Variant"), text("unit", "Unit"), text("status", "Status"), qty("quantity", "On Hand"), qty("held", "Held"), qty("eligible", "Eligible"), count("batches", "Stocked Batches"), text("expiry", "Nearest Expiry"), ...(id === "item-details" && user.role !== "Warehouse Manager" ? [money("price", "Current Standard Price", false)] : []), ...(canCost ? [money("value", "Inventory Value")] : [])]
  };
  return undefined;
}
