import { eq,sql } from "drizzle-orm";
import { qualityResources,qualitySeals } from "../../database/schema.js";
import type { Transaction } from "../../database/client.js";
import type { User } from "../../src/types/index.js";
import { qualityKinds,type QualityKind } from "../../src/domains/quality/contracts.js";
import { hasCapability,hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { assertAllowed,HttpError } from "../foundation/errors.js";

export type QualitySource={kind:QualityKind;sourceId:string;reference:string;state:string;version:number;payloadHash:string;preparerIds:string[];ownerId:string|null};
const sourceTables={"Stock Control":"stock_controls","Customer Return":"customer_returns","Supplier Claim":"supplier_claims","Supplier Replacement Receipt":"supplier_replacement_receipts"} as const;
function resourceScope(kind:QualityKind,id:string){
 return eq(kind==="Stock Control"?qualityResources.stockControlId:kind==="Customer Return"?qualityResources.customerReturnId:kind==="Supplier Claim"?qualityResources.supplierClaimId:qualityResources.replacementReceiptId,id);
}
function canWrite(user:User,kind:QualityKind){
 if(kind==="Stock Control"||kind==="Supplier Replacement Receipt")return hasEffectivePermission(user,"inventory","post");
 if(kind==="Customer Return")return hasEffectivePermission(user,"inventory","post")||hasEffectivePermission(user,"sales","create");
 return hasEffectivePermission(user,"inventory","post")||hasEffectivePermission(user,"import","create")||hasEffectivePermission(user,"accounts","post");
}
export async function qualitySource(tx:Transaction,kind:QualityKind,id:string,lock=false):Promise<QualitySource>{
 const [row]=(await tx.execute<QualitySource>(sql`select ${kind}::text kind,id "sourceId",number reference,state,version,payload_hash "payloadHash",${kind==="Supplier Replacement Receipt"?sql`to_jsonb(array[created_by])`:sql`preparer_ids`} "preparerIds",${kind==="Customer Return"?sql`owner_id`:sql`null::text`} "ownerId" from erp_private.${sql.identifier(sourceTables[kind])} where id=${id} ${lock?sql`for update`:sql``}`)).rows;
 if(!row)throw new HttpError(404,"Quality source not found.");return row;
}
export function qualityRead(user:User,s:QualitySource){
 const allowed=s.kind==="Stock Control"?hasEffectivePermission(user,"inventory"):s.kind==="Customer Return"?hasEffectivePermission(user,"sales")||hasEffectivePermission(user,"inventory"):hasEffectivePermission(user,"import")||hasEffectivePermission(user,"inventory")||hasEffectivePermission(user,"accounts");
 assertAllowed(allowed&&(s.kind!=="Customer Return"||user.role!=="Sales Executive"||s.ownerId===user.id));
}
export function qualityWrite(user:User,s:QualitySource,version?:number){qualityRead(user,s);assertAllowed(canWrite(user,s.kind)&&s.preparerIds.includes(user.id),"Only a recorded preparer can change inspection attachments. Prepare a reviewed revision to contribute evidence.");if(s.state!=="Draft"||version!==undefined&&s.version!==version)throw new HttpError(409,"Inspection evidence is frozen or the source version changed.");}
export async function ensureQualityResource(tx:Transaction,s:QualitySource){const fields=s.kind==="Stock Control"?{stockControlId:s.sourceId}:s.kind==="Customer Return"?{customerReturnId:s.sourceId}:s.kind==="Supplier Claim"?{supplierClaimId:s.sourceId}:{replacementReceiptId:s.sourceId};await tx.insert(qualityResources).values(fields).onConflictDoNothing();return(await tx.select().from(qualityResources).where(resourceScope(s.kind,s.sourceId)))[0];}
export async function sourceForResource(tx:Transaction,id:string,lock=false){const [r]=await tx.select().from(qualityResources).where(eq(qualityResources.id,id));if(!r)throw new HttpError(404,"Quality source not found.");return qualitySource(tx,r.stockControlId?"Stock Control":r.customerReturnId?"Customer Return":r.supplierClaimId?"Supplier Claim":"Supplier Replacement Receipt",r.stockControlId??r.customerReturnId??r.supplierClaimId??r.replacementReceiptId!,lock);}
export async function sealQualityEvidence(tx:Transaction,user:User,kind:string,id:string,hash:string){
 if(!qualityKinds.includes(kind as QualityKind))return{};
 const source=await qualitySource(tx,kind as QualityKind,id,true);qualityRead(user,source);if(source.state!=="Draft"||source.payloadHash!==hash)throw new HttpError(409,"Only the current inspected draft can freeze evidence.");const r=await ensureQualityResource(tx,source);
 const [{pending}]=(await tx.execute<{pending:number}>(sql`select count(*)::int pending from erp_private.documents where quality_resource_id=${r.id} and status='Pending' and expires_at>now()`)).rows;if(pending)throw new HttpError(409,"Complete or cancel pending inspection uploads before submission.");
 const [m]=(await tx.execute<{snapshot:{files:Record<string,unknown>[];withdrawals:Record<string,unknown>[]};hash:string}>(sql`select s snapshot,encode(sha256(convert_to(s::text,'UTF8')),'hex') hash from (select erp_private.quality_manifest(${r.id}) s) m`)).rows;
 if(m.snapshot.files.length>20||m.snapshot.withdrawals.length>200)throw new HttpError(422,"Inspection evidence history exceeds the supported limit.");
 const [seal]=await tx.insert(qualitySeals).values({resourceId:r.id,sourceHash:hash,hash:m.hash,snapshot:m.snapshot,createdBy:user.id}).returning();return{qualitySealId:seal.id,qualityEvidenceHash:seal.hash};
}
export async function readQuality(tx:Transaction,user:User,s:QualitySource){qualityRead(user,s);let [r]=await tx.select().from(qualityResources).where(resourceScope(s.kind,s.sourceId));
 const own=Boolean(r);if(!r&&s.kind!=="Supplier Replacement Receipt"){const [ancestor]=(await tx.execute<{id:string}>(sql`with recursive chain as(select id,revision_of_id parent,0 depth from erp_private.${sql.identifier(sourceTables[s.kind])} where id=${s.sourceId} union all select h.id,h.revision_of_id,c.depth+1 from chain c join erp_private.${sql.identifier(sourceTables[s.kind])} h on h.id=c.parent where c.depth<100) select q.id from chain c join erp_private.quality_resources q on ${s.kind==="Stock Control"?sql`q.stock_control_id`:s.kind==="Customer Return"?sql`q.customer_return_id`:sql`q.supplier_claim_id`}=c.id order by c.depth limit 1`)).rows;if(ancestor)[r]=await tx.select().from(qualityResources).where(eq(qualityResources.id,ancestor.id));}
 const [seal]=r&&own?await tx.select().from(qualitySeals).where(eq(qualitySeals.resourceId,r.id)):[];const canEdit=s.state==="Draft"&&s.preparerIds.includes(user.id)&&canWrite(user,s.kind);
 const rows=r?(await tx.execute<{id:string;fileName:string;mimeType:string;sizeBytes:number;sha256:string|null;sensitive:boolean;uploadedBy:string;uploadedByName:string;createdAt:string;state:string;inherited:boolean;reason:string|null}>(sql`select d.id,d.file_name "fileName",d.mime_type "mimeType",d.size_bytes "sizeBytes",d.sha256,d.sensitive,d.uploaded_by "uploadedBy",e.name "uploadedByName",d.created_at::text "createdAt",case when w.id is not null then 'Withdrawn' else d.status end state,(d.quality_resource_id<>${r.id}) inherited,w.reason from erp_private.documents d join erp_private.employees e on e.id=d.uploaded_by left join lateral(select x.id,x.reason from erp_private.quality_withdrawals x where x.document_id=d.id and x.resource_id in(select resource_id from erp_private.quality_lineage(${r.id})) order by x.created_at desc limit 1) w on true where d.quality_resource_id in(select resource_id from erp_private.quality_lineage(${r.id})) order by d.created_at,d.id limit 201`)).rows:[];
 if(rows.length>200)throw new HttpError(413,"Inspection history exceeds the supported display limit.");const cost=hasCapability(user,"view_sensitive_cost"),visible=rows.filter(d=>!d.sensitive||cost).map(d=>({...d,inherited:!own||d.inherited}));return{kind:s.kind,sourceId:s.sourceId,reference:s.reference,state:s.state,version:s.version,canEdit,sealed:Boolean(seal),sealHash:seal?.hash??null,restrictedFiles:rows.length-visible.length,files:visible};
}
