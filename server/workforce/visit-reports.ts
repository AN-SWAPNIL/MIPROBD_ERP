import { sql } from "drizzle-orm";
import type { User } from "../../src/types/index.js";
import { between,dim,raw,text,type Query,type Spec } from "../reports/common.js";
import { marketingScope } from "./scope.js";
export function fieldVisitReport(id:string,user:User,q:Query):Spec|undefined{
  if(id!=="visit-verification")return undefined;
  return {base:sql`select v.id,v.reference,v.employee_id,v.snapshot->>'name' employee,v.snapshot->>'employeeCode' code,v.snapshot->>'territory' territory,v.customer_id,v.lead_id,v.subject,v.purpose,v.status,v.quality capture_quality,v.review review_status,v.match,
    to_char(v.received_at at time zone 'Asia/Dhaka','YYYY-MM-DD HH24:MI:SS') checked_in,to_char(v.completed_at at time zone 'Asia/Dhaka','YYYY-MM-DD HH24:MI:SS') completed,
    case when v.position is null then 'Not captured' else (v.position->>'accuracy')||' m' end accuracy,coalesce(v.distance_meters::text||' m','No approved reference') distance,
    case when d.status='Attached' then 'Photo on file ('||replace(v.photo_method,'_',' ')||')' when d.status='Expired' then 'Photo expired under retention policy' else 'No photo: '||v.photo_reason end evidence,
    v.location_reason,v.outcome,(select coalesce(string_agg(e.name||': '||ev.type||' | '||coalesce(ev.details->>'reason',''),' / ' order by ev.recorded_at,ev.id),'Pending') from erp_private.field_visit_events ev join erp_private.employees e on e.id=ev.actor_id where ev.visit_id=v.id and ev.type like 'REVIEW_%') review_history
    from erp_private.field_visits v left join erp_private.documents d on d.id=v.photo_id where ${marketingScope(user,sql`v.employee_id`)} and ${between(sql`(v.received_at at time zone 'Asia/Dhaka')::date`,q)}`,
    dimensions:{employee:dim("employee_id","employee"),customer:dim("customer_id","subject"),lead:dim("lead_id","subject"),territory:dim("territory"),status:dim("status"),captureQuality:dim("capture_quality"),reviewStatus:dim("review_status")},
    result:raw("select *,employee||' | '||code employee_label,checked_in||coalesce(E'\\nCompleted: '||completed,'') timing,purpose||E'\\n'||outcome details,replace(capture_quality,'_',' ')||' | '||replace(match,'_',' ')||E'\\nAccuracy: '||accuracy||' | Distance: '||distance location_detail,review_status||E'\\n'||review_history review_detail from scoped order by checked_in,id"),
    columns:[text("reference","Visit Reference"),text("employee_label","Employee / ID"),text("subject","Customer / Lead"),text("timing","Server Time (Dhaka)"),text("details","Purpose / Outcome"),text("location_detail","Location Evidence"),text("evidence","Photo Evidence"),text("review_detail","Manager Review"),text("status","Visit Status")],
    basis:"Employee-initiated event records, not live location or proof of presence. Capture quality, advisory site match and manager review are independent. Times use server receipt/completion in Bangladesh time. No visit scores are awarded.",notes:["Photos and exact coordinates are excluded from CSV and print. Authorized private details are available through Field Day/Team Activity.","Policy/site versions are captured with each check-in. Later reference changes never retroactively verify a visit. Voided visits remain visible; review history is append-only."]};
}
