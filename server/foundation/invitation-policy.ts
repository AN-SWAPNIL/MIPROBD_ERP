export const maximumInvitationAttempts = 5;
export function invitationFailure(attempt: number, retryable: boolean, now: Date) {
  return { state: retryable && attempt < maximumInvitationAttempts ? "Queued" as const : "Review" as const,
    nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1)) * 1000) };
}
