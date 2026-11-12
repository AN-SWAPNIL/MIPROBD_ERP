const lcFields = ["lcNumber", "lcAmount", "lcBankAmount", "lcOtherAmount", "lcOpenDate", "lcExpiryDate"] as const;
const ttFields = ["ttReference", "ttAmount", "ttDate"] as const;

// Hidden payment controls must not submit blank decimal amounts or stale references.
export function paymentPayload<T extends object>(input: T): T {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const result = { ...input } as Record<string, unknown>;
  const mode = (input as { paymentMode?: string }).paymentMode;
  for (const field of lcFields) if (mode && mode !== "LC" || result[field] === "") delete result[field];
  for (const field of ttFields) if (mode && mode !== "TT" || result[field] === "") delete result[field];
  return result as T;
}

export function activePaymentFields<T extends { paymentMode?: string }>(input: T): T {
  const result = { ...input } as T & Record<string, unknown>;
  if (input.paymentMode !== "LC") for (const key of lcFields) delete result[key];
  if (input.paymentMode !== "TT") for (const key of ttFields) delete result[key];
  return result;
}
