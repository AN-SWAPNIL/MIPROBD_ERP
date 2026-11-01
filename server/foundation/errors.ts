export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function assertAllowed(condition: unknown, message = "You do not have access to this operation."): asserts condition {
  if (!condition) throw new HttpError(403, message);
}
