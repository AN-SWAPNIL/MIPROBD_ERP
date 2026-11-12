import { z } from "zod";
export const optionKinds = ["unit", "currency", "product-family", "country", "container-type", "document-type", "import-cost-category"] as const;
export const optionKind = z.enum(optionKinds);
export const optionInput = z.object({ kind: optionKind, value: z.string().trim().min(1).max(80) }).strict().superRefine((input, ctx) => {
  if (input.kind === "currency" && !/^[A-Z]{3}$/.test(input.value)) ctx.addIssue({ code: "custom", path: ["value"], message: "Use a three-letter uppercase currency code, e.g. USD." });
});
export const optionRecord = optionInput.extend({ id: z.string() });
export type OptionKind = z.infer<typeof optionKind>;
