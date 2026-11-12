import { HttpError } from "./errors.js";

type PasswordError = { code?: string; status?: number; reasons?: string[] };

export function passwordUpdateError(error: PasswordError): HttpError {
  switch (error.code) {
    case "same_password":
      return new HttpError(422, "Choose a different password. The new password cannot be the same as your current password.");
    case "weak_password": {
      const reasons = error.reasons ?? [];
      const details = ["Use at least 12 characters", "include uppercase and lowercase letters, a number and a symbol"];
      if (reasons.includes("pwned")) return new HttpError(422, "This password appears in a known data breach. Choose a different, unique password.");
      return new HttpError(422, `Password is too weak. ${details.join("; ")}.`);
    }
    case "insufficient_aal":
      return new HttpError(428, "Verify your authenticator code before saving the new password.");
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return new HttpError(401, "This password-change session needs fresh verification. Request a new recovery email and use its newest link.");
    case "current_password_mismatch":
      return new HttpError(422, "Current password is incorrect. Enter your current password again.");
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "bad_jwt":
    case "user_not_found":
      return new HttpError(401, "Your password-change session has expired. Request a new recovery email.");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "request_timeout":
      return new HttpError(429, "Too many password-change attempts or a temporary delay. Wait a few minutes before trying again.");
    default:
      return new HttpError(error.status && error.status >= 500 ? 503 : 422, "The account service could not save your password. Try again shortly; contact your administrator if it continues.");
  }
}

export function logPasswordRejection(operation: "reset" | "change", error: PasswordError) {
  // Provider messages can contain private details; retain only bounded diagnostic codes.
  console.warn("Identity provider rejected password update", {
    operation,
    code: /^[a-z_]{1,64}$/.test(error.code ?? "") ? error.code : "unknown",
    status: typeof error.status === "number" && error.status >= 400 && error.status <= 599 ? error.status : undefined
  });
}
