import type { PersistentReport } from "./persistentContracts.js";
import { reportDisplay } from "./reportDisplay.js";

// Keep the detailed export contract; group related facts for readable screen/A4 columns.
export function reportPresentation(report:PersistentReport):PersistentReport {
  if(report.id==="supplier-replacement-receipts"){const cost=report.columns.some(c=>c.key==="value");return{...report,columns:[{key:"replacement_source",label:"Receipt / Claim / Supplier",format:"text"},{key:"replacement_product",label:"Product / New LOT / Expiry",format:"text"},{key:"replacement_quantity",label:"Accepted / Rejected / BIN",format:"text"},{key:"status",label:"Status",format:"text"},...(cost?[{key:"value",label:"Saved Accepted Value",format:"money" as const,align:"right" as const}]:[]),{key:"replacement_review",label:"Inspection / Independent Review",format:"text"}],rows:report.rows.map(r=>({...r,replacement_source:[r.reference,r.claim_reference,r.supplier,`Observed: ${r.date}`,r.posted_date?`Posted: ${r.posted_date}`:"Not posted"].join("\n"),replacement_product:[r.product,`LOT: ${r.lot}`,`Batch: ${r.batch}`,`Expiry: ${r.expiry}`].join("\n"),replacement_quantity:[`Accepted: ${reportDisplay(r.accepted,"quantity")} ${r.unit}`,`Rejected: ${reportDisplay(r.rejected,"quantity")} ${r.unit}`,`BIN: ${r.location}`].join("\n"),replacement_review:[r.inspection,`Evidence: ${r.proof}`,`Prepared: ${r.preparer}`,`Verified: ${r.verifier||"Pending"}`,`Approved: ${r.approver||"Pending"}`].join("\n")}))};}
  if(report.id==="supplier-claims"){const cost=report.columns.some(c=>c.key==="cost");return{...report,columns:[{key:"claim_source",label:"Claim / Import / Supplier",format:"text"},{key:"claim_product",label:"Product / LOT / Quantity",format:"text"},{key:"claim_resolution",label:"Source / Resolution / Status",format:"text"},...(cost?[{key:"cost",label:"Saved Cost",format:"money" as const,align:"right" as const},{key:"credit",label:"Agreed Credit",format:"money" as const,align:"right" as const}]:[]),{key:"claim_review",label:"Evidence / Independent Review",format:"text"}],rows:report.rows.map(r=>({...r,claim_source:[r.reference,r.import_reference,r.supplier,r.date].join("\n"),claim_product:[r.product,`LOT: ${r.lot}`,`${reportDisplay(r.quantity,"quantity")} ${r.unit}`].join("\n"),claim_resolution:[r.source,r.resolution,r.status,r.reason].join("\n"),claim_review:[r.inspection,`Evidence: ${r.proof}`,`Prepared: ${r.preparer}`,`Verified: ${r.verifier||"Pending"}`,`Approved: ${r.approver||"Pending"}`].join("\n")}))};}
  if(report.id==="payroll-register")return{...report,columns:[{key:"payroll_source",label:"Payroll / Salary Month",format:"text"},{key:"payroll_employee",label:"Employee / ID",format:"text"},{key:"payroll_earnings",label:"Earnings / Deductions",format:"text"},{key:"net",label:"Net Salary",format:"money",align:"right"},{key:"paid",label:"Paid",format:"money",align:"right"},{key:"unpaid",label:"Unpaid",format:"money",align:"right"}],rows:report.rows.map(r=>({...r,payroll_source:[r.reference,r.period,`Accrued: ${r.date}`,`Prepared: ${r.preparer}`,`Approved: ${r.approver}`].join("\n"),payroll_employee:[r.employee,r.code,r.designation].filter(Boolean).join("\n"),payroll_earnings:[`Fixed: ${reportDisplay(r.fixed_gross,"money")}`,`Earned gross: ${reportDisplay(r.gross,"money")}`,`Deductions: ${reportDisplay(r.deductions,"money")}`].join("\n")}))};
  if(report.id==="payroll-commission")return{...report,columns:[{key:"payroll_source",label:"Payroll / Employee",format:"text"},{key:"entitlement",label:"Cumulative Entitlement",format:"money",align:"right"},{key:"previous",label:"Previously Accrued",format:"money",align:"right"},{key:"commission",label:"Applied This Run",format:"money",align:"right"},{key:"carry",label:"Unapplied Carry",format:"money",align:"right"}],rows:report.rows.map(r=>({...r,payroll_source:[r.reference,r.period,r.employee,r.code].join("\n")}))};
  if(report.id==="payroll-loans")return{...report,columns:[{key:"financing_source",label:"Financing / Employee",format:"text"},{key:"kind",label:"Type",format:"text"},{key:"amount",label:"Principal",format:"money",align:"right"},{key:"recovered",label:"Recovered",format:"money",align:"right"},{key:"outstanding",label:"Outstanding",format:"money",align:"right"},{key:"installment",label:"Agreed Installment",format:"money",align:"right"}],rows:report.rows.map(r=>({...r,financing_source:[r.reference,r.date,r.employee,r.code].join("\n")}))};
  if(["stock-return-register","customer-return-credit"].includes(report.id)){
    const credit=report.columns.some((c)=>c.key==="credit"),cost=report.columns.some((c)=>c.key==="cost");
    return{...report,columns:[{key:"return_document",label:"Return / Original Documents",format:"text"},{key:"returned_stock",label:"Product / Original LOT",format:"text"},{key:"inspection_result",label:"Quantity / Condition / Evidence",format:"text"},...(credit?[{key:"credit",label:"Credit",format:"money" as const,align:"right" as const}]:[]),...(cost?[{key:"cost",label:"Saved Cost",format:"money" as const,align:"right" as const}]:[]),{key:"return_review",label:"Prepared / Verified / Approved",format:"text"}],rows:report.rows.map((r)=>({...r,return_document:[r.reference,r.kind,r.status,r.date,r.customer,r.order_number,`Challan: ${r.challan}`,r.invoice?`Invoice: ${r.invoice}`:"No invoice credit"].join("\n"),returned_stock:[r.product,`LOT: ${r.lot}`,`Expiry: ${r.expiry}`].join("\n"),inspection_result:[`${reportDisplay(r.quantity,"quantity")} ${r.unit}`,r.condition,`BIN: ${r.location}`,r.inspection,`Evidence: ${r.proof}`].join("\n"),return_review:[`Prepared: ${r.preparer}`,`Verified: ${r.verifier||"Pending"}`,`Approved: ${r.approver||"Pending"}`].join("\n")}))};
  }
  if(report.id==="return-settlements")return{...report,columns:[{key:"settlement_source",label:"Settlement / Return / Customer",format:"text"},{key:"destination",label:"Kind / Destination",format:"text"},{key:"amount",label:"Credit Used",format:"money",align:"right"},{key:"proof_detail",label:"Reason / Evidence",format:"text"},{key:"settlement_review",label:"Prepared / Verified / Approved",format:"text"}],rows:report.rows.map((r)=>({...r,settlement_source:[r.reference,r.return_reference,r.customer,r.date].join("\n"),destination:[r.status,r.account,r.invoice].filter(Boolean).join("\n"),proof_detail:[r.reason,r.proof].join("\n"),settlement_review:[r.preparer,r.verifier,r.approver].filter(Boolean).join("\n")}))};
  if (["stock-control-register", "stock-count-variance", "stock-writeoffs", "stock-condition-history"].includes(report.id)) {
    const cost = report.columns.some((c) => c.key === "value");
    return { ...report, columns: [
      { key: "control_record", label: "Document / Status", format: "text" },
      { key: "stock_identity", label: "Product / LOT / Condition", format: "text" },
      { key: "physical_variance", label: "Physical Count / Variance", format: "text" },
      ...(cost ? [{ key: "value", label: "Posted Cost Impact", format: "money" as const, align: "right" as const }] : []),
      { key: "inspection_evidence", label: "Inspection / Evidence", format: "text" },
      { key: "independent_review", label: "Prepared / Verified / Approved", format: "text" }
    ], rows: report.rows.map((r) => ({ ...r,
      control_record: [r.reference, r.kind, r.status, `Observed: ${r.date}`, r.posted_date ? `Posted: ${r.posted_date}` : "Not posted"].join("\n"),
      stock_identity: [r.product, `Batch: ${r.batch}`, `LOT: ${r.lot}`, `${r.original_condition} | ${r.unit}`].join("\n"),
      physical_variance: [`Book: ${reportDisplay(r.book, "quantity")}`, `Count / remaining: ${reportDisplay(r.counted, "quantity")}`, `Variance: ${reportDisplay(r.variance, "quantity")}`, ...(cost && r.proposed_value ? [`Review: ${reportDisplay(r.proposed_value, "money")}`] : [])].join("\n"),
      inspection_evidence: [r.inspection, r.reason, `Evidence: ${r.proof}`].join("\n"),
      independent_review: [`Prepared: ${r.preparer}`, `Verified: ${r.verifier || "Pending"}`, `Approved: ${r.approver || "Pending"}`].join("\n")
    })) };
  }
  if(report.id==="visit-verification")return {...report,columns:[
    {key:"visit_record",label:"Visit / Server Time (Dhaka)",format:"text"},
    {key:"employee_label",label:"Employee / ID",format:"text"},
    {key:"visit_contact",label:"Customer / Purpose / Outcome",format:"text"},
    {key:"location_detail",label:"Location Evidence",format:"text"},
    {key:"evidence",label:"Photo Evidence",format:"text"},
    {key:"visit_review",label:"Status / Manager Review",format:"text"}
  ],rows:report.rows.map((row)=>({...row,visit_record:[row.reference,row.timing].filter(Boolean).join("\n"),visit_contact:[row.subject,row.details].filter(Boolean).join("\n"),visit_review:[row.status,row.review_detail].filter(Boolean).join("\n"),location_detail:row.location_detail?.replaceAll("_"," ")}))};
  if(!["employee-activity","daily-marketing"].includes(report.id))return report;
  return {...report,columns:[
    {key:"activity_time",label:"Date / Time (Dhaka)",format:"text"},
    {key:"activity_employee",label:"Employee / ID",format:"text"},
    {key:"activity_record",label:"Activity / Reference",format:"text"},
    {key:"subject",label:"Customer / Lead",format:"text"},
    {key:"activity_details",label:"Purpose / Outcome",format:"text"},
    {key:"activity_status",label:"Source / Status",format:"text"}
  ],rows:report.rows.map((row)=>({...row,
    activity_time:[row.date,row.occurred?`Occurred: ${row.occurred}`:"",row.submitted?`Submitted: ${row.submitted}`:""].filter(Boolean).join("\n"),
    activity_employee:[row.employee_label,row.territory].filter(Boolean).join("\n"),
    activity_record:[row.activity,row.reference].filter(Boolean).join("\n"),
    activity_details:[row.purpose,row.remarks].filter(Boolean).join("\n"),
    activity_status:[row.verification==="MANUAL"?"Self-reported":row.verification==="SYSTEM_VERIFIED"?"System record":row.verification==="EVIDENCE_ASSISTED"?"Check-in evidence (not proof)":row.verification,row.status,row.reason].filter(Boolean).join("\n")
  }))};
}
