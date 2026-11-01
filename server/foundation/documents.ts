import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { documents, employees, importCases, marketingActivities, fieldVisitAttempts, fieldVisits } from "../../database/schema.js";
import { validateVisitImage } from "../workforce/visit-images.js";
import { assertEmployeeScope } from "../workforce/scope.js";
import { canManageTargetUser, hasCapability, hasEffectivePermission } from "../../src/lib/permissions/effectiveAccess.js";
import { uploadSchema } from "./contracts.js";
import { audit, identity, toUser, type Context } from "./context.js";
import { assertAllowed, HttpError } from "./errors.js";
import { sourceForResource,qualityRead,qualityWrite } from "../quality/service.js";
import { inspectBusinessFile } from "./attachment-files.js";

export function matchesFileSignature(mime: string, bytes: Uint8Array) {
  const starts = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  if (mime === "application/pdf") return starts(37, 80, 68, 70, 45);
  if (mime === "image/png") return starts(137, 80, 78, 71, 13, 10, 26, 10);
  if (mime === "image/jpeg") return starts(255, 216, 255);
  if (mime === "image/webp") return starts(82, 73, 70, 70) && [87, 69, 66, 80].every((v, i) => bytes[i + 8] === v);
  return false;
}

export function createDocumentRouter(ctx: Context) {
  const router = Router();
  async function requireOwnerAccess(actor: ReturnType<typeof identity>["user"], employeeId: string) {
    const [employee] = await ctx.db.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new HttpError(404, "Employee not found.");
    assertAllowed(actor.id === employee.id || canManageTargetUser(actor, toUser(employee)));
  }
  async function requireDocumentAccess(actor: ReturnType<typeof identity>["user"], row: Pick<typeof documents.$inferSelect, "employeeId" | "importId" | "sensitive" | "purpose" | "expenseId" | "uploadedBy"> & { activityId?: string|null;visitId?:string|null;visitAttemptId?:string|null;qualityResourceId?:string|null }, write = false) {
    if(row.purpose==="quality-evidence"){if(!row.qualityResourceId)throw new HttpError(404,"Inspection source not found.");await ctx.db.transaction(async tx=>{const s=await sourceForResource(tx,row.qualityResourceId!);if(write)qualityWrite(actor,s);else qualityRead(actor,s);assertAllowed(!row.sensitive||hasCapability(actor,"view_sensitive_cost"));});return;}
    if(row.purpose==="field-visit-evidence"){
      assertAllowed(hasEffectivePermission(actor,"marketing")&&(!write||hasEffectivePermission(actor,"marketing","create")));
      if(row.visitId){const [v]=await ctx.db.select().from(fieldVisits).where(eq(fieldVisits.id,row.visitId));if(!v)throw new HttpError(404,"Visit not found.");await assertEmployeeScope(ctx.db,actor,v.employeeId);if(write)throw new HttpError(423,"Saved visit photos cannot be replaced.");return;}
      assertAllowed(row.uploadedBy===actor.id&&row.employeeId===actor.id);const [a]=await ctx.db.select().from(fieldVisitAttempts).where(eq(fieldVisitAttempts.id,row.visitAttemptId??""));
      if(!a||a.employeeId!==actor.id)throw new HttpError(404,"Own capture attempt not found.");
      if(a.consumedAt||a.expiresAt<new Date())throw new HttpError(409,"Own capture attempt is used or expired.");return;
    }
    if (row.purpose === "marketing-evidence") {
      assertAllowed(hasEffectivePermission(actor,"marketing")&&hasEffectivePermission(actor,"marketing",write?"create":"view"));
      if (!row.activityId) { assertAllowed(actor.id===row.uploadedBy); return; }
      const [activity]=await ctx.db.select().from(marketingActivities).where(eq(marketingActivities.id,row.activityId));
      if(!activity)throw new HttpError(404,"Activity not found.");
      await assertEmployeeScope(ctx.db,actor,activity.employeeId);
      assertAllowed(!write || actor.id===row.uploadedBy);
      assertAllowed(activity.status!=="Draft" || actor.id===activity.employeeId,"Draft evidence is private to its author.");
      return;
    }
    if (row.purpose === "expense-receipt") {
      assertAllowed(hasEffectivePermission(actor, "accounts", write ? "post" : "view"));
      if (!row.expenseId) assertAllowed(actor.id === row.uploadedBy, "Unlinked expense evidence belongs to its uploader.");
      return;
    }
    if (!row.importId) return requireOwnerAccess(actor, row.employeeId);
    const [record] = await ctx.db.select().from(importCases).where(eq(importCases.id, row.importId));
    if (!record) throw new HttpError(404, "Import not found.");
    assertAllowed(hasEffectivePermission(actor, "import", write ? "edit" : "view") && (write || !row.sensitive || hasCapability(actor, "view_sensitive_cost")));
    if (write && ["Closed", "Cancelled"].includes(record.status)) throw new HttpError(423, "Terminal imports are read-only.");
  }

  router.post("/uploads", async (req, res) => {
    const input = uploadSchema.parse(req.body);
    const actor = identity(res).user;
    const employeeId = ["import-document", "expense-receipt", "marketing-evidence", "field-visit-evidence"].includes(input.purpose) ? actor.id : input.employeeId!;
    const sensitive = input.purpose === "import-document" ? !["Packing List", "Bill of Lading", "COA", "CE Certificate", "ISO Certificate"].includes(input.documentType!) || input.sensitive === true : true;
    await requireDocumentAccess(actor, { employeeId, importId: input.importId ?? null, sensitive, purpose: input.purpose, expenseId: null, uploadedBy: actor.id,visitAttemptId:input.visitAttemptId }, true);
    const id = randomUUID();
    const objectPath = input.purpose === "field-visit-evidence" ? `visits/pending/${actor.id}/${id}` : input.purpose === "marketing-evidence" ? `marketing/pending/${actor.id}/${id}` : input.purpose === "expense-receipt" ? `expenses/pending/${actor.id}/${id}` : input.importId ? `imports/${input.importId}/${id}` : `employees/${employeeId}/${id}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await ctx.db.transaction(async (tx) => {
      if(input.purpose==="field-visit-evidence"){
        const [a]=await tx.select().from(fieldVisitAttempts).where(eq(fieldVisitAttempts.id,input.visitAttemptId!)).for("update");if(!a||a.employeeId!==actor.id||a.consumedAt||a.expiresAt<new Date())throw new HttpError(409,"Capture attempt is no longer available.");
        const [{count}]=(await tx.execute<{count:number}>(sql`select count(*)::int count from erp_private.documents where visit_attempt_id=${a.id}`)).rows;if(count>=3)throw new HttpError(429,"At most three photo upload attempts are allowed; restart check-in.");
      }
      await tx.insert(documents).values({ ...input, employeeId, sensitive, documentType: input.documentType ?? "Other", id, uploadedBy: actor.id, objectPath, expiresAt });
      await audit(tx, actor.id, "Upload authorized", "Document", id, { employeeId: input.employeeId, purpose: input.purpose });
    });
    const { data, error } = await ctx.admin.storage.from("erp-documents").createSignedUploadUrl(objectPath, { upsert: false });
    if (error) throw new HttpError(502, "Storage upload authorization is unavailable. Retry with a new upload request.");
    res.status(201).json({ success: true, data: { id, bucket: "erp-documents", path: objectPath, token: data.token, signedUrl: data.signedUrl, expiresAt }, message: "Upload directly to Storage, then complete this upload" });
  });

  router.post("/uploads/:id/complete", async (req, res) => {
    const actor = identity(res).user;
    const [row] = await ctx.db.select().from(documents).where(eq(documents.id, String(req.params.id)));
    if (!row) throw new HttpError(404, "Upload not found.");
    if(row.purpose==="quality-evidence")throw new HttpError(409,"Complete inspection evidence through its source-bound endpoint.");
    await requireDocumentAccess(actor, row, true);
    assertAllowed(actor.id === row.uploadedBy, "Only the authorized uploader can complete this upload.");
    if (row.status === "Attached") return res.json({ success: true, data: { id: row.id }, message: "Upload already attached" });
    if(row.status==="Expired")throw new HttpError(410,"Evidence expired.");
    if (row.expiresAt < new Date()) throw new HttpError(409, "Upload authorization expired. Create a new upload request.");
    const bucket = ctx.admin.storage.from(row.bucket);
    const { data: file, error } = await bucket.download(row.objectPath);
    if (error || !file) throw new HttpError(409, "The authorized file has not been uploaded.");
    if (file.size !== row.sizeBytes || file.type.split(";")[0] !== row.mimeType) {
      throw new HttpError(422, "Uploaded file size, type or signature does not match the authorization.");
    }
    const bytes=Buffer.from(await file.arrayBuffer()),{sha256}=inspectBusinessFile(bytes,row.mimeType);
    const imageInfo=row.purpose==="field-visit-evidence"?await validateVisitImage(bytes,row.mimeType):undefined;
    await ctx.db.transaction(async (tx) => {
      if(row.purpose==="field-visit-evidence"){const [a]=await tx.select().from(fieldVisitAttempts).where(eq(fieldVisitAttempts.id,row.visitAttemptId!)).for("update");if(!a||a.consumedAt||a.expiresAt<new Date())throw new HttpError(409,"Capture attempt expired during upload.");}
      const [attached] = await tx.update(documents).set({ status: "Attached", attachedAt: new Date(),sha256,...(imageInfo?{imageInfo}:{}) })
        .where(and(eq(documents.id, row.id), eq(documents.status, "Pending"))).returning();
      if (attached) await audit(tx, actor.id, "Document attached", "Document", row.id);
    });
    res.json({ success: true, data: { id: row.id }, message: "Document attached" });
  });

  router.get("/documents/:id", async (req, res) => {
    const actor = identity(res).user;
    const [row] = await ctx.db.select().from(documents).where(and(eq(documents.id, String(req.params.id)), eq(documents.status, "Attached")));
    if (!row) throw new HttpError(404, "Document not found.");
    await requireDocumentAccess(actor, row);
    const { data, error } = await ctx.admin.storage.from(row.bucket).createSignedUrl(row.objectPath, 60);
    if (error) throw new HttpError(502, "Document access is temporarily unavailable.");
    await audit(ctx.db, actor.id, "Document opened", "Document", row.id);
    res.json({ success: true, data: { id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes,sha256:row.sha256, url: data.signedUrl, expiresIn: 60 }, message: "Temporary document access granted" });
  });

  router.get("/profile/avatar", async (_req, res) => {
    const actor = identity(res).user;
    const [row] = await ctx.db.select().from(documents).where(and(eq(documents.employeeId, actor.id), eq(documents.purpose, "employee-avatar"), eq(documents.status, "Attached"))).orderBy(sql`${documents.attachedAt} desc`).limit(1);
    if (!row) return res.json({ success: true, data: null, message: "No profile photo" });
    const { data, error } = await ctx.admin.storage.from(row.bucket).createSignedUrl(row.objectPath, 60);
    if (error) throw new HttpError(502, "Profile photo is temporarily unavailable.");
    res.json({ success: true, data: { url: data.signedUrl, expiresIn: 60 }, message: "Profile photo loaded" });
  });
  return router;
}
