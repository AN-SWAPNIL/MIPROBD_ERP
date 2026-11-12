import { ZodError } from "zod";
import { inputIssues, responseIssues } from "../../src/lib/api/validation.js";
import { safeApiMessage, safeErrorMessage } from "../../src/lib/api/safeErrors.js";
import { HttpError } from "./errors.js";

const uniqueFields: Record<string, { field: string; message: string }> = {
  product_code_lower_unique: { field: "code", message: "This product code already exists. Select the existing product or use another code." },
  import_lc_lower_unique: { field: "lcNumber", message: "This LC number is already linked to another import." },
  batch_number_lower_unique: { field: "batchNumber", message: "This batch number already exists. Enter a unique batch number." },
  purchase_supplier_reference_unique: { field: "reference", message: "This supplier invoice / reference has already been received." },
  employee_email_lower_unique: { field: "email", message: "This email already belongs to an employee." },
  employees_employee_code_unique: { field: "employeeCode", message: "This employee ID already exists." },
  cost_preset_name_unique: { field: "name", message: "A cost preset with this name already exists." }
};

export function errorResponse(error: unknown, requestId?: string) {
  const body = (message: string, errors?: { field: string; message: string }[]) => ({ success: false, data: null, message, ...(errors?.length ? { errors } : {}) });
  if (error instanceof ZodError) return { status: 422, body: body("Check the highlighted input fields.", inputIssues(error.issues)) };
  if (error instanceof HttpError && error.status < 500) return { status: error.status, body: body(safeErrorMessage(error), responseIssues(error.issues)) };
  const source = error as { cause?: unknown; code?: unknown; constraint?: string; message?: string; name?: string } | null;
  const cause = (source?.cause ?? source) as NonNullable<typeof source> | null;
  if (cause?.code === "23505") {
    const issue = Object.hasOwn(uniqueFields, cause.constraint ?? "") ? uniqueFields[cause.constraint!] : undefined;
    return { status: 409, body: body(issue?.message ?? "A record with this identifier already exists.", issue ? [issue] : undefined) };
  }
  if (cause?.code === "22P02") return { status: 422, body: body("Invalid record identifier. Select the record again.") };
  if (["22003", "23514"].includes(String(cause?.code))) return { status: 422, body: body("Check the entered quantities, dates and amounts. A value is outside the supported limits.") };
  if (cause?.code === "23503") return { status: 409, body: body("This record is linked to protected history or refers to an unavailable record.") };
  const status = error instanceof HttpError ? error.status : /timeout|timed out|connection|socket/i.test(cause?.message ?? "") ? 503 : 500;
  const diagnostic = {
    code: typeof cause?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(cause.code) ? cause.code : `HTTP_${status}`,
    errorType: /^[A-Za-z]{1,60}$/.test(cause?.name ?? "") ? cause!.name : "Error"
  };
  return { status, body: body(safeApiMessage(status, null, requestId)), diagnostic };
}
