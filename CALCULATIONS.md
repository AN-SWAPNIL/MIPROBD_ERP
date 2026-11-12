# MIPRO ERP Calculation Reference

The persistent backend uses `decimal.js` for import costing, receipt/dispatch valuation, sales, invoices, collections and operating finance. SQL reports use PostgreSQL `numeric`. API amounts are decimal strings; BDT monetary totals round half-up to two decimals.

Inspection attachments do **not** change quantity, landed cost, credit, loss or payroll. SHA-256 identifies the validated original file bytes; a second SHA-256 over the database's canonical evidence JSON binds the exact included files/withdrawals to the source approval. It is an integrity checksum, not a monetary formula or electronic signature. Photos remain optional; an empty evidence manifest is valid.

## Mid-Month Compensation

- Each approved effective compensation profile covers its actual dates within the month, clipped to approved joining/end dates. Every participating profile is retained; the latest rate is not applied to the whole month.
- A preparer enters an evidenced earned factor and overtime hours for **each** period. Factor totals must match the employee total and cannot exceed 1; hours must also reconcile. Calendar-day attendance/proration is not guessed.
- Per period: `earned component = round(monthly component * earned factor, 2)` and `overtime = round(approved hourly rate * approved hours, 2)`. Sum these saved period amounts, then apply the existing bonus, commission, recovery and deduction formulas once. This intentionally rounds each independently evidenced period before summing.
- Review, payslip, accrued salary liability and actual payments use the same saved breakdown. A newly activated policy invalidates an unposted stale review; it cannot rewrite an already accrued month. Post-accrual corrections remain a separate unfinished workflow.

## Import And Landed Cost

`LC total = bank amount + other amount`, in the selected LC currency, using exact decimals and two decimal places. This is a declared breakdown, not a cash posting or an extra product cost. Both parts remain separate in the saved import; the API derives the total. Old totals with no recorded split are retained without assuming all of the money came through a bank.

Currency changes clear the unsaved exchange-rate input. The operator enters the new captured rate; the ERP does not guess or fetch a rate. BDT is fixed at 1. Quantities use the product's recorded unit; no box-to-piece conversion is assumed, and changing the unit of an already-used product is blocked.

```text
FOB value in BDT = Quantity * FOB/unit * captured exchange rate
Cost line in BDT  = Foreign amount * captured exchange rate
Final landed total = Product FOB value in BDT + all allocated import costs
Landed cost/unit   = Final landed total / imported quantity
```

Each cost row is allocated by one selected basis:

| Method | Item share |
|---|---|
| CBM | item CBM / total eligible CBM |
| FOB value | item FOB value / total eligible FOB value |
| Quantity | item quantity / total eligible quantity |
| Product-specific | 100% to exactly one selected import item |
| Manual split | user-entered amounts that must equal the cost-row total |

Final allocation uses largest-fractional-remainder rounding: calculate every exact share, round down to poisha, then assign remaining poisha to the largest fractions with stable item-ID tie-breaking. This guarantees allocated totals equal the source cost exactly.

Both FOB/item and converted cost rows are rounded to BDT two decimals before allocating. Manual splits must reconcile to that rounded cost-row amount. CBM is either `cartons * CBM/carton` (8 decimals) or the explicitly entered total. Quantity allocation uses units, not volume; FOB allocation uses BDT value. Each cost row chooses its own basis.

The screen displays unit cost at 2 decimals; finalized snapshots also retain a 10-decimal unit rate. Partial receipts use `round(final item total * cumulative accepted quantity / imported quantity, 2) - previously received value`. Example: BDT 100 over 3 units receives as 33.33, 33.34, 33.33, not 99.99. Stock valuation sums these saved batch values. Rejected units create no stock; their proportional value remains outside inventory pending a later loss/claim workflow.

Customs duty is not calculated by the ERP. The user enters the final assessed amount per product, and that amount is included as a product-specific landed cost.

## Inventory And FIFO

### Purchase Receipts

`Purchase line value (BDT) = round(quantity * supplier unit price * captured exchange rate, 2)`. BDT uses rate `1`. Sum the saved line values for the receipt total and supplier payable. The stored unit cost is `saved line value / quantity` at 10 decimals; later stock issues consume the saved batch value, not its two-decimal display. A receipt adds stock and a supplier obligation atomically. It does not move cash; Accounts records the actual supplier payment separately. Imports and opening balances are separate sources. Quantities use the product's canonical unit, with no implicit pack/box conversion. Once a product is used, its unit cannot be changed to reinterpret existing quantities; create a new variant instead.

### Opening Review Preview (Update 13)

`Opening cost value = round(quantity * explicitly approved BDT unit cost, 2)` using decimal strings, 48-digit intermediate precision and half-up rounding. Unit cost accepts up to 10 decimals; it is not the product's selling price. Missing cost, invalid dates, duplicate positions, missing exact ERP mappings or unresolved source exceptions block approval. Preview sums stock cost separately from customer/supplier balances and cash. Preview alone posts nothing; approval (Super Admin may self-approve) and explicit Super Admin posting create the linked journals atomically.

Opening AR is the approved **remaining** invoice due, not a new sale. Original invoice/due dates are retained; collections allocate oldest original invoices first. Supplier payable is `obligations - actual payments - historical opening advances`; a negative balance is an advance. Historical advances do not create another cash payment. Cash openings require an account without existing journals. Reconciliation compares original postings with approved source lines, not the later changing balances. These subledgers are not a balanced general ledger.

Source control differences are `reported sales - reported paid - reported due`. The XLSX reader preserves formulas and their saved cached results; it does not recalculate Excel formulas or assume a blank means zero. The actual file hash/cells are authoritative evidence, not figures copied from an earlier analysis. Detailed source profiles stay private under `artifacts/opening/`.

### Posted Inventory

```text
Physical batch quantity = sum(saved signed quantity deltas)
Physical batch value = sum(saved signed value deltas)
Receive / Opening / Return: positive; Dispatch: negative; Adjustment: explicit +1 / -1
Dispatch eligibility = Saleable condition + recognized by dispatch date + not expired
Delivery COGS = round(batch received value * cumulative dispatched quantity / batch received quantity, 2)
                - previously posted COGS for that batch
```

Automatic dispatch uses the oldest eligible non-expired matching batch first. Original receipt date orders FIFO; an opening batch is recognized only on its opening count date, so an older receipt date cannot make it dispatchable before cutover. If one batch is insufficient, allocation continues into the next oldest. A newer-batch override requires authority and an audited reason. Transactional dispatch persists quantity and exact COGS together. It never multiplies a rounded display unit cost: BDT 100 over three units dispatches as 33.33, 33.34 and 33.33. Product/batch locks prevent two API workers from overselling.

## Sales, Invoice And Due

```text
Line gross    = round(Quantity * Unit price, 2)
Line total    = Line gross - Line discount
Invoice total = Sum of line totals
Customer due  = Sum(customer journal debits - credits)
             = Opening due + approved invoices - collections + receipt reversals - invoice cancellations
```

Persistent quotes use quantities with four decimals, unit prices/absolute discounts with two decimals, and sum the rounded line amounts. The discount is a BDT amount, not a percentage. Values use a dedicated 48-digit Decimal context; numbers beyond the database precision are rejected. Product identity/name comes from the master, and submitted line/document totals are ignored. Quote-to-order conversion copies those saved lines and snapshots exactly, without posting stock, cash or due. Customer/order balances are derived from journal debits minus credits, not editable totals.

A Delivery Challan reduces stock but does not create customer due. A Draft Invoice changes no balance. Invoice approval posts the receivable once; collection then reduces customer/order due and increases the selected cash, bank or mobile-banking account.

## Order Lifecycle (Update 11)

The server uses Decimal to group quantities by product. Money is returned with two decimal places and quantities with four.

```text
Delivered = Sum of posted challan quantities for the order/product
Remaining to deliver = max(0, ordered quantity - delivered quantity)
Approved invoiced = Sum of approved invoice quantities for the order/product
Delivered not invoiced = max(0, delivered quantity - approved invoiced quantity)
Delivered value = Sum of posted challan line totals after discount
Approved invoice value = Sum of approved invoice totals for the order
Collected = Sum of posted receipts linked to the order OR its invoices, counted once
Outstanding = max(0, approved invoice value - collected)
Invoice payment ceiling = Invoice receivable - active receipt allocations to that receivable
```

Draft invoices reserve challans against duplicate invoicing but create no due; their quantities appear separately as pending approval. Cancelled invoices and reversed receipts do not count. An invoice-only payment resolves its order. Customer-level receipts allocate to eligible outstanding receivables oldest date first, with stable entry-ID tie-breaking; only the allocation to a particular order counts there. Example: a BDT 1,000 receipt allocated 250.01/749.99 contributes 250.01 to the first order, not 1,000. Overpayment is rejected.

Partial delivery revenue and discount use the same cumulative-share formula as COGS, based on the saved order-line totals. Invoices copy complete saved challan lines. Receipt reversal appends equal customer debit and bank outflow, preserving the original receipt and journals; invoice cancellation appends a credit after its receipts are reversed. Cash/bank balances sum immutable inflows minus outflows. Server and database guards require exact reconciliation and nonnegative stock/cash balances.

## Expenses And Account Reports

```text
TA/DA expense = TA amount + DA amount
Account balance after cash in  = Previous balance + amount
Account balance after cash out = Previous balance - amount
Operating expense total = Sum of posted, non-reversed operating expenses
Supplier net balance = Posted obligations - posted payments
Supplier payable = max(0, net balance)
Supplier advance = max(0, -net balance)
```

TA/DA totals are derived by the server, ignoring a submitted total. Employee/category names are captured from their masters at posting, and Entered By comes from the authenticated user. General expenses use their entered positive amount. Expense posting creates an equal cash/bank outflow atomically; reversal creates an equal inflow. Neither changes import landed cost.

Supplier obligations record debt but move no cash. Payments create equal account outflows; reversing a payment restores cash. Approved historical opening advances reduce the supplier balance without a second cash outflow. Payments plus opening advances exceeding obligations remain a supplier advance, not a hidden negative payable. Financial-position entries are verified opening/adjustment sources only and do not change cash automatically.

Account balances sum immutable inflows minus outflows, including compensating reversals; they are not editable totals. Concurrent expense/payment requests lock the same account, so they cannot spend the same balance twice. Current cash entries must be chronological; historical/backdated posting and opening reconciliation remain launch items.

Advance and Company Loan movements remain separate from operating expenses. The persistent Monthly A/C Summary groups the saved cash journal by source, with non-operating movements separate. It is a cash movement report, not a profit-and-loss statement.

## Profit And Period Reports

```text
Delivered gross profit = Delivered line value - actual dispatched-batch COGS
Period invoiced sales   = Approved invoice postings - cancellations dated in the period
Period collections      = Receipt allocations - receipt reversals dated in the period
```

Financial sales reports use approved invoices. Operational delivery reports use Delivery Challans. They are intentionally separate so one delivery and its invoice are never counted as two financial sales.

## Update 9 Operational Reports

```text
Order remaining quantity = Ordered quantity - Delivered quantity
PO receipt outstanding    = Expected quantity - Received quantity - Rejected quantity
Account net movement      = Period inflow - Period outflow
```

Product-family reports group canonical products by their master-data category. Stock Summary totals available quantities from batches; it does not infer stock from invoices. Day Book and channel reports use posted account transactions, while Customer Dues uses the customer ledger balance. The same period and catalogue filters are applied to the screen table, CSV export and A4 preview.

## Persistent Report Dates And Totals

- PostgreSQL `numeric` performs report arithmetic; API values remain decimal strings. The browser only formats explicit money/quantity columns, never regroups financial data with `Number`.
- An invoice dated yesterday remains yesterday's sale after cancellation today. Today shows its negative reversal. Receipt, expense and supplier reversals follow the same business-date rule. Current workspace totals above describe current status; historical reports use dated events.
- Customer opening due is `sum(debit - credit)` before From; closing due includes all entries through To. Running statements carry earlier amounts into an explicit opening row. Mixed-order receipts count each actual allocation once.
- Cash opening/closing use `sum(inflow - outflow)` before From/through To. Period flows exclude earlier entries. Non-operating advances and loans are not sales or operating expenses.
- Physical stock/value at To are the sums of signed immutable quantity/value deltas through To: receiving/opening/evidenced surplus positive, dispatch/count shortage/write-off negative. Invoice cancellation does not restore stock. Saved postings, not rounded display unit costs, determine book value and COGS.
- Expiry attention uses the report end date: expired, then 31/92/183-day bands, matching the existing Inventory screen's approximate one/three/six-month alerts. Expired stock remains physically on hand but cannot be dispatched.
- Sales Summary groups by calendar day, Monday-start week, month or year. Distinct customers are counted within the whole group, not added from daily counts. Gross Profit by Product uses invoiced saved delivery cost and reverses that margin on cancellation.
- Master names/assignments/status are current. Import registers use current commercial records filtered by PO date; finalized-cost reports use the current immutable snapshot's finalization date. These are not reconstructed historical master/commercial records.
- Screen totals cover every filtered row, not just the current page. Running balances, unit rates and document-register values are not summed as revenue. Print/CSV regenerate using the same authorized period, grouping and stable record IDs; later postings can change a later regeneration.
- Reports never manufacture opening balances or a balancing equity figure. Balance Sheet remains pending approved opening/reconciliation data. Saved field check-ins are evidence-assisted records, not GPS proof.

## Employee Performance

- Submitted activities: count authenticated manual submissions in the occurred-date period, excluding drafts and activities voided through the end date. Self-reported visits are not GPS-verified visits.
- Net sales: approved invoice journal debits minus cancellation credits, attributed to the invoice owner. Quotations, orders and deliveries do not add financial sales.
- Collections: actual receipt allocations minus dated reversals, attributed to each invoice owner (receipt owner for unallocated entries). A shared receipt is not duplicated across employees.
- Score: `sum(eligible event count * current active rule points)`. Defaults: qualified lead 10, actual lead-to-customer conversion 5, submitted quotation 15, order 30, posted receipt 20, completed follow-up 5. Receipt reversal subtracts its 20-point credit on its reversal date. Receipt score belongs once to its saved owner, independently of financial allocation. Unverified visits score zero.
- Targets: sum configured monthly targets for months intersecting the period, without prorating. Progress is `actual / target * 100`, rounded to two decimals; absent/zero targets display `Not set`.
- Plans are commitments, not actual performance. Lead funnel shows current derived commercial stages for leads created through To, not a reconstructed historical funnel. Weights and master assignments are current; manual activity name/ID snapshots remain unchanged after profile edits.

## Field Check-ins (Update 12)

- **Location age:** server receipt time minus the browser's claimed capture time. More than the saved policy limit (default 30 seconds), or over five seconds in the future, is `STALE`. Accuracy above the saved limit (default 100 m) is `POOR_ACCURACY`. Missing location requires a reason. Browser values can be spoofed; none proves attendance.
- **Site distance:** Haversine great-circle distance, using mean Earth radius `6,371,008.8 m`, rounded to two decimals. Compare only with an independently approved, versioned customer site.
- **Advisory match:** with fresh/acceptable accuracy, `distance + accuracy <= radius` means approximate match; `distance - accuracy > radius` means outside; overlapping uncertainty means uncertain. Default radius is 150 m. Without a reference, display `NO_REFERENCE`; poor/stale evidence with a reference remains uncertain.
- **Counts:** recorded check-ins exclude currently voided visits in the server-receipt period. Manager-accepted count is their current accepted subset. Visit-record total = check-ins + submitted same-period visit notes not explicitly linked to a non-void check-in. A link must identify the same author/contact/business date. Unlinked records are not assumed to be duplicates. These counts are not attendance totals or historical review snapshots.
- **Points and money:** every check-in awards **zero visit points**, regardless of score-rule settings or manager acceptance. Imports, stock, invoices, collections and accounts remain unchanged. Completing a visit may create one follow-up atomically; completing that follow-up later remains its own existing scored event.
- **Photo size:** Canvas scales the longest edge to at most 960 px (smaller if needed), adaptively encodes to at most `300 * 1024` bytes, and strips original metadata. The server decodes actual pixels, enforces 16-1920 px per side/no animation and stores a SHA-256 of the accepted bytes. Photos stay in private Storage, not database/base64 payloads.

## Persistent Dashboard

- Net sales/collections and invoiced gross profit reuse the report SQL facts above, including reversals on their own dates. Gross profit excludes operating expenses; the same stock dispatch is not counted again as an invoice cost.
- Receivables = sum of positive per-customer `debit - credit` balances through To. Customer credit balances are not netted against another customer's due; Reports retains those credits separately.
- Cash/bank = sum of posted `In - Out` through To, including compensating entries. Missing openings are not estimated.
- Current stock KPI counts distinct products with positive batch stock, not a sum of mixed units. Expiry attention counts remaining batches expiring within 92 days, including already expired ones. Active imports exclude Received, Closed and Cancelled.
- Follow-up queues show current pending items due today or earlier. Check-ins use the selected server-receipt dates and current non-void status. Employee/team scope and financial permissions are applied before data leaves the server.
- Values remain PostgreSQL numeric/decimal strings. Only chart coordinates use JavaScript numbers; displayed totals/tooltips retain the original exact strings. Work lists show at most eight rows alongside the full matching count.

Warehouse settings and cost presets calculate no balances or prices. A preset never chooses an allocation method automatically. Client-decision confirmation records an agreement, not an automatic financial posting or permission grant.

## General Ledger (Update 13)

- Amounts use decimal strings and 48-digit decimal arithmetic. Journal lines are saved to two decimal places. Each line has one positive debit or credit; the saved debit total must equal the credit total exactly. Drafts never affect balances.
- Saved warehouse receipts: **Dr Inventory / Cr Inventory Clearing**. Actual dispatch cost: **Dr COGS / Cr Inventory**. Revenue is separate: approved invoices post **Dr Receivables / Cr Sales**.
- Posted collections: **Dr selected Cash/Bank / Cr Receivables**. Operating expenses: **Dr Operating Expense / Cr selected Cash/Bank**. Supplier obligations: **Dr Inventory Clearing / Cr Payables**; supplier payments: **Dr Payables / Cr selected Cash/Bank**. Direct import-cost payments use Inventory Clearing, not Operating Expense.
- Cash-source and invoice reversals swap the original journal's debit/credit and account IDs, once. They do not use today's mapping or delete the original. A historical invoice cancellation without an original GL journal uses the explicitly mapped Sales Returns contra-income account and Receivables.
- Trial balance: `opening = sum(debit - credit) before From`; `period debit/credit = their separate sums within From..To`; `closing = opening + period debit - period credit`. Positive net is debit; negative net is credit. Running account statements apply the same signed arithmetic per chart account.
- Ledger income statement uses only posted Income/Expense accounts within From..To. Income = income-account credits minus debits; expense = expense-account debits minus credits; `profit/loss = income - expense`. Payroll accrual contributes expense, but salary payment, loan issue and recovery do not expense it again. This differs from invoiced gross margin and is not certified statutory accounts.
- Control reconciliation compares as-of stock value, customer net receivables, supplier obligations minus payments/advances, and cash inflows minus outflows with their approved GL mappings. Confidential payroll users additionally see unpaid net salary and outstanding employee advances/loans. `difference = operational source - ledger control`. "Not configured" is not a successful reconciliation. A balanced trial balance is not proof of complete company openings or a verified Balance Sheet.
- There are no invented opening equity, salary or commission amounts. Approved stock count/write-off, customer return and payroll sources use the calculations below. Unsupported/ambiguous sources cannot guess an account after cutover. Supplier claims/replacements are described below; formal posted-source reversal remains unfinished.

## Partial Stock Holds (Update 13)

- `outstanding hold = initially held quantity - posted releases - approved posted write-offs`. Pending, rejected or merely approved documents do not free units. Write-offs dispose of stock; they do not release it for sale. Quantities retain four-decimal precision.
- `eligible units = physical on hand - outstanding holds`, only for Saleable, recognized, unexpired batches. Otherwise eligible is zero. FIFO uses those eligible units but preserves original received-date order. Actual dispatch cannot be backdated before the latest hold/release control.
- A hold's review amount is `saved current batch value * held quantity / physical on-hand quantity`, rounded to two decimals. A release's approval-review amount is `saved hold review amount * release quantity / original held quantity`, rounded independently to two decimals. These amounts check authority thresholds only; they are not cost allocations, loss postings or additive accounting totals.
- Holds/releases leave physical quantity, saved stock value and GL unchanged. Actual delivery still posts its cumulative share of the original saved batch total. For example, 10 units valued at BDT 10.10, with 4 held and 2 released, has 8 eligible units; dispatching 7 leaves 3 physical, 2 held, 1 eligible and BDT 3.03 book value.
- As-of reports include holds/releases/disposals dated through To alongside signed stock journals. A separate approved whole-batch release adds a condition-history event without changing original source evidence or expiry. Return accounting is not implemented by reservations.

## Stock Counts And Write-offs (Update 13)

- `variance quantity = physically counted quantity - saved current book quantity`. A count covers its explicitly selected batches, not an assumed complete warehouse. Fingerprints block posting after any later stock/hold/condition change; a reviewed new snapshot is required.
- Shortage/write-off cost = `round(original saved value * (previously consumed quantity + removed quantity) / original quantity, 2) - previously consumed saved value`. Thus BDT 10.01 over three units consumes 3.34, 3.33 and 3.34, exactly 10.01.
- Surplus value = `surplus quantity * explicitly evidenced unit cost`, rounded once to two decimals. Missing cost/condition blocks approval submission. Surplus creates a separate count-source batch; original receipt quantities, price and landed cost do not change.
- Approval exposure is the sum of absolute line variance values, not net gain minus loss. Whole-condition release uses the inspected stock's book value for authority review but has zero financial effect. All source preparers across revisions are excluded from decisions.
- Posted loss/write-off: **Dr Stock Loss / Cr Inventory**. Posted surplus: **Dr Inventory / Cr Stock Gain**. These share one transaction with stock/approval/GL, use reviewed mappings, and create no customer due, supplier payment or cash movement. Zero variance creates no quantity/GL journal. Observation date is retained; stock/value change on posting date.

## Customer Returns And Credit (Update 13)

- Returnable quantity = original delivered quantity minus all previously posted returns/refusals for that line. Returned cost = `round(original saved delivery cost * cumulative returned quantity / delivered quantity, 2) - previously returned saved cost`. Original LOT/expiry stays unchanged; a separate inspected return-source batch receives this exact saved total.
- Credit/discount use the same cumulative method against the original invoice's saved net total/discount and its invoiced quantity, not today's price or selling-price markup. For an uninvoiced refusal, financial credit is zero; its saved operational value/discount/cost instead reduce the later accepted-only invoice. Fully refused goods need no invoice/collection and are excluded from missing-invoice exceptions; gross challan quantities remain operational delivery facts. BDT 10.01 across three units restores 3.34, 3.33, 3.34 exactly.
- At posting, `applied to original due = min(return credit, max(original invoice due, 0))`. `unapplied credit = return credit - original due application - posted refunds/applications`. Pending approvals spend nothing. `refundable = min(unapplied credit, max(-current customer due, 0))`; a refund cannot exceed actual net customer credit or the selected account's funds.
- A credit application debits the original credit invoice and credits a different same-customer invoice or approved opening receivable by the identical amount: total customer due, cash, revenue and GL control balances do not change. Opening remaining due is `original approved due - unreversed allocated collections - posted credit applications`; later collection skips an already settled opening. The original opening journal is never edited. Refund posts **Dr Receivables / Cr selected Cash/Bank** and consumes credit; it is not a deleted/relabelled collection.
- Returned stock posts **Dr Inventory / Cr COGS**. Invoiced credit posts **Dr Sales Returns / Cr Receivables**. Approval exposure is credit plus restored cost, not a netted amount. All related stock/credit/approval/GL changes share one transaction. Net sales and collection reports include dated credits/refunds; original import landed-cost snapshots never change. Damage impairment/write-off remains its separate approved source.

## Payroll And Commission (Update 13)

- Each fixed wage component is `round(approved component * explicitly approved earned factor, 2)`. Fixed gross is the sum of basic, house rent, medical, transport and other fixed allowance, counted once. Overtime is `round(approved hourly rate * approved hours, 2)`; bonus and other deductions require evidence. No GPS/visit score determines attendance or wages, and no statutory rate or tax is guessed.
- Cumulative commission entitlement is the sum of `round(saved net basis in each effective policy interval * approved rate / 100, 2)`. Basis is explicitly Net Invoiced Sales or Net Collections. Invoices, returns, cancellations, allocated receipts, reversals and refunds retain their real business dates. `commission delta = entitlement through the salary month - commission already accrued in earlier runs`; cash payment timing cannot earn commission twice.
- Positive delta is added. Negative delta is deducted only under approved recovery authority and only up to available earned salary after other deductions; the remaining signed difference stays as commission carry. Net salary cannot be negative. Stopping future commission uses an approved zero-rate policy, preserving historical entitlement.
- `earned gross = fixed gross + bonus + overtime + applied signed commission`. `deductions = original advance recovery + original loan installment + other approved deduction`. `net salary = earned gross - deductions`. Example: 130 fixed + 10 bonus + 7.50 OT + 25 commission - 10 advance - 5 loan - 2 other = **155.50 net**. All arithmetic uses decimal strings/48-digit intermediates and half-up poisha rounding.
- Accrual: **Dr Payroll Expense (earned gross) / Cr Payroll Payable (net) / Cr Employee Advances / Cr Employee Loans / Cr Payroll Deductions**, as applicable. Financing disbursement: **Dr Employee Advances or Employee Loans / Cr selected Cash/Bank**. Actual salary payment: **Dr Payroll Payable / Cr selected Cash/Bank**. Recovery reduces the original employee receivable, not a second cash receipt. Paid plus unpaid must equal accrued net; separate approved partial payments cannot exceed unpaid net or available funds.
- A recovery cannot exceed original outstanding financing or a nonzero agreed installment, enforced by both API and database. Zero installment sets no automatic schedule: recovery still requires an explicitly prepared, evidenced and independently approved payroll amount. Financing terms cannot be silently edited after posting.
- Payroll runs retain approved profiles, employee name/ID/designation/department/status and source calculations. All preparers and beneficiaries are excluded from verification/final approval. Only completed salary months accrue; duplicate/backdated regular payroll is blocked. Source changes require a linked reviewed revision. Explicit mid-month splits are described below; posted payroll corrections/reversals and automatic statutory calculations are not implemented and cannot be bypassed with guessed values.

## Supplier Rejections And Replacements (Update 13)

- Receipt rejection is never stock. Once every imported item unit is inspected, `rejected cost pool = finalized item cost - actual accepted receipt values`. The pool is split across rejected receipt lines by rejected quantity; largest fractional poisha wins, with receipt-line ID as the stable tie-breaker. This prevents charging a rejected unit a poisha already capitalized into accepted stock.
- PostgreSQL uses exact integer-poisha/quanta quotient and remainder, not an intermediate decimal division followed by another rounding. This agrees with the API's Decimal result on both sides of a half-poisha, even at maximum supported quantity precision.
- Each partial claim uses `round(source value * (previously consumed quantity + new quantity) / original source quantity, 2) - previously consumed value`. Held-stock claims use the original batch totals and all earlier consumption, not the displayed rounded unit price. Held units leave physical stock only when the independently approved disposition posts.
- Supplier credit is the explicit negotiated amount, not an assumed refund of landed cost. Credit posts **Dr Payables / Cr Inventory (held stock) or Inventory Clearing (receipt rejection)**. Cost above credit is Stock Loss; credit above cost is Stock Gain. No cash payment is created. Supplier due is `obligations - actual payments - historical advances - supplier credits`.
- Replacement resolution transfers saved cost into **Dr Supplier Claims / Cr Inventory or Inventory Clearing**. Each separately approved accepted replacement creates a new LOT/batch at its cumulative share of that claim value: **Dr Inventory / Cr Supplier Claims**. Outstanding quantity/value equals the original promise less posted accepted receipts. Rejected replacement observations do not consume the promise. Additional receiving costs must be explicitly confirmed zero; they are never silently dropped or guessed.
- Receipt preparation now follows **Draft > Submit > Verify > Approve > Post**. Draft/submitted quantities, saved values and optional inspection attachments are review information, not stock, cash or consumed replacement entitlement. Submission seals the exact files and source; only posted accepted units enter the formula above. A fully rejected inspection creates no batch or cost journal. This changes review controls, not the costing formula.
- Write-off posts **Dr Stock Loss / Cr Inventory or Inventory Clearing**. Original import/receipt/landed-cost evidence stays unchanged. Zero-value stock/claims retain their quantities without fabricating a nonzero journal. Replays do not repeat quantities, supplier credits or GL entries.

## Print Calibration

The print sheet is fixed at `210 x 297 mm` (A4), with zero CSS page margin. Digital letterhead artwork uses `1.5 mm` bleed on each edge, and the content safe area is shifted left by `1.5 mm` (`24 mm` to `22.5 mm`). Browser printing must use A4, no margins, 100% scale, background graphics enabled, and browser headers/footers disabled.

Persistent transaction previews display saved monetary totals to two decimals and quantities to four (trailing quantity zeroes omitted). Order subtotal is `sum(saved line total + saved line discount)`; discount is `sum(saved line discount)`. Printing never recalculates the posted amount from a rounded unit cost. Report page edges remain 1.5 mm left/0.2 mm right, with an additional internal 27 mm left branding-safe zone. Printer-driver margins cannot be overridden by these CSS calculations.

Screen previews fit the available width using `min(1, preview content width / A4 width at 96 dpi)`. Print media resets this preview-only zoom to 1; physical A4 dimensions and stationery offsets do not change.
