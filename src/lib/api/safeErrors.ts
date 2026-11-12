const fallback = "The request could not be completed. Please try again or contact your administrator.";

export function safeErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") return "Some values could not be processed. Review the form, then reload and try again if it continues.";
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) return "Could not connect to the service. Check your connection and try again.";
  if (/API contract|\[DecimalError\]|Unexpected token|Cannot read properties|Failed query:|duplicate key value|violates .*constraint|ECONN|ENOTFOUND|ENOENT|ENOSPC|EACCES|EPERM|EAI_AGAIN|[A-Z]:\\|\/(?:home|Users|tmp|var|workspace|node_modules)\/|postgres(?:ql)?:\/\/|sb_secret_|Bearer\s+[A-Za-z0-9._-]{20}|eyJ[A-Za-z0-9_-]+\.eyJ|[?&](?:token|secret|key|api[_-]?key|access_token|refresh_token|signature)=|"code"\s*:\s*"(?:invalid_|too_small|too_big|custom)/i.test(message)) return fallback;
  // Remove control characters from remote messages, retaining readable line breaks.
  // eslint-disable-next-line no-control-regex
  return message.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").slice(0, 1200);
}

export function safeApiMessage(status: number, message: unknown, requestId?: string | null) {
  if (status >= 500) {
    const reference = requestId && /^[a-f0-9-]{36}$/i.test(requestId) ? ` Reference: ${requestId}.` : "";
    return `The service is temporarily unavailable. Please try again shortly.${reference}`;
  }
  return safeErrorMessage(typeof message === "string" ? message : status === 401 ? "Your session expired. Please sign in again." : "The request could not be completed.");
}
