import type { ZodIssue } from "zod";
import { safeErrorMessage } from "./safeErrors.js";
export type FieldIssue = { field: string; message: string };

export function responseIssues(value: unknown): FieldIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is FieldIssue => Boolean(entry && typeof entry.field === "string" && /^[A-Za-z0-9_. -]{0,200}$/.test(entry.field) && typeof entry.message === "string"))
    .slice(0, 25).map((entry) => ({ field: entry.field, message: safeErrorMessage(entry.message).slice(0, 300) }));
}

export function inputIssues(issues: readonly ZodIssue[]): FieldIssue[] {
  return responseIssues(issues.map((issue) => {
    let message = issue.message;
    if (issue.code === "unrecognized_keys") message = "Remove unsupported fields from this form.";
    else if (issue.code === "invalid_value") message = "Select a valid option.";
    else if (issue.code === "invalid_type") message = issue.expected === "number" ? "Enter a number." : issue.expected === "array" ? "Add the required items." : "Enter a value in the required format.";
    else if (issue.code === "invalid_format" && issue.format === "email") message = "Enter a valid email address.";
    else if (issue.code === "invalid_format" && ["date", "datetime"].includes(issue.format)) message = "Enter a valid date.";
    else if (issue.code === "invalid_format" && /^Invalid (string|input)/.test(message)) message = "Enter a value in the required format.";
    else if (issue.code === "too_small" && /^Too small:/.test(message)) message = issue.origin === "array" ? `Add at least ${issue.minimum} item(s).` : issue.origin === "string" ? issue.minimum === 1 ? "This field is required." : `Enter at least ${issue.minimum} characters.` : `Enter a value ${issue.inclusive ? "of at least" : "greater than"} ${issue.minimum}.`;
    else if (issue.code === "too_big" && /^Too big:/.test(message)) message = issue.origin === "array" ? `Use no more than ${issue.maximum} items.` : issue.origin === "string" ? `Use no more than ${issue.maximum} characters.` : `Enter a value ${issue.inclusive ? "of at most" : "less than"} ${issue.maximum}.`;
    const field = issue.path.slice(0, 10).map((part) => typeof part === "number" || typeof part === "string" && /^[A-Za-z0-9_ -]{1,80}$/.test(part) ? String(part) : "field").join(".").slice(0, 200);
    return { field, message };
  }));
}

export function fieldLabel(path: string) {
  const labels: Record<string, string> = { imageUrl: "Product image", supplierId: "Supplier", productId: "Product", lcNumber: "LC number", lcAmount: "LC total", lcBankAmount: "LC bank amount", lcOtherAmount: "LC other amount", ttReference: "TT / Shipment reference", ttAmount: "TT amount" };
  if (Object.hasOwn(labels, path)) return labels[path];
  return path.replace(/\.(\d+)(?=\.|$)/g, (_, index: string) => ` ${Number(index) + 1}`)
    .replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\./g, " / ").replace(/^./, (value) => value.toUpperCase());
}

export function validationMessage(message: string, issues: FieldIssue[]) {
  return issues.length ? issues.map((issue) => `${fieldLabel(issue.field) || "Form"}: ${issue.message}`).join("; ") : message;
}
