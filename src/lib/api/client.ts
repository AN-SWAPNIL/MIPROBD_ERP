import type { ApiResponse, Session, User } from "../../types";
import { API_BASE_URL, SESSION_KEY, authHeaders } from "../auth/transport";
import { foundationMode } from "../runtime";
import { responseIssues, validationMessage, type FieldIssue } from "./validation";
import { mfaChallengeSchema, mfaStatusSchema } from "../auth/mfaContracts";
import { safeApiMessage } from "./safeErrors";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly issues: FieldIssue[];

  constructor(message: string, status: number, issues: FieldIssue[] = []) {
    super(validationMessage(message, issues));
    this.name = "ApiRequestError";
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (!headers.has("Authorization") && !["/api/auth/login", "/api/auth/forgot-password", "/api/auth/exchange", "/api/auth/reset-password"].includes(path)) {
    Object.entries(await authHeaders()).forEach(([key, value]) => headers.set(key, value));
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  }).catch((error: unknown) => { if (init?.signal?.aborted) throw error; throw new ApiRequestError("Could not connect to the service. Check your connection and try again.", 0); });

  const body = (await response.json().catch(() => ({
    success: false,
    message: "Invalid API response",
    data: null
  }))) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    throw new ApiRequestError(safeApiMessage(response.status, body.message, response.headers.get("X-Request-Id")), response.status, response.status < 500 ? responseIssues((body as unknown as { errors?: unknown }).errors) : []);
  }

  return body;
}

export const apiClient = {
  async login(email: string, password: string) {
    return request<Session>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  async demoUsers() {
    return request<Pick<Session["user"], "email" | "name" | "role" | "title">[]>("/api/auth/demo-users");
  },
  async forgotPassword(email: string) {
    return request<{ email: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  },
  async resetPassword(email: string, password: string, recoveryToken?: string) {
    return request<{ email: string }>("/api/auth/reset-password", {
      method: "POST",
      headers: recoveryToken ? { Authorization: `Bearer ${recoveryToken}` } : undefined,
      body: JSON.stringify(foundationMode ? { password } : { email, password })
    });
  },
  async exchangeRecovery(accessToken: string, refreshToken: string) {
    return request<Session>("/api/auth/exchange", { method: "POST", body: JSON.stringify({ accessToken, refreshToken }) });
  },
  async recoveryFactors(token: string) {
    return mfaStatusSchema.parse((await request("/api/auth/mfa", { headers: { Authorization: `Bearer ${token}` } })).data);
  },
  async verifyRecoveryFactor(token: string, factorId: string, code: string) {
    const headers = { Authorization: `Bearer ${token}` };
    const challenge = mfaChallengeSchema.parse((await request("/api/auth/mfa/challenge", { method: "POST", headers, body: JSON.stringify({ factorId }) })).data);
    return request<Session>("/api/auth/mfa/verify", { method: "POST", headers, body: JSON.stringify({ factorId, challengeId: challenge.id, code }) });
  },
  async saveProfile(name: string, phone: string) {
    return request<User>("/api/profile", { method: "PATCH", body: JSON.stringify({ name, phone }) });
  },
  async profileAvatar() {
    return request<{ url: string; expiresIn: number } | null>("/api/profile/avatar");
  },
  async uploadAvatar(employeeId: string, file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 1 || file.size >= 1_000_000) throw new Error("Choose a JPG, PNG or WebP image smaller than 1 MB.");
    const upload = await request<{ id: string; signedUrl: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ employeeId, purpose: "employee-avatar", fileName: file.name, mimeType: file.type, sizeBytes: file.size }) });
    // File bytes go directly to Storage; no ERP bearer/secret is forwarded to the signed URL.
    const response = await fetch(upload.data.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!response.ok) throw new Error("Profile image upload failed.");
    await request(`/api/uploads/${upload.data.id}/complete`, { method: "POST", body: "{}" });
    return this.profileAvatar();
  },
  async changePassword(currentPassword: string, password: string) {
    return request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, password }) });
  },
  async me() {
    return request<Session>("/api/me");
  }
};

export { SESSION_KEY, request as apiRequest };
