import type { ApiResponse, Session, User } from "../../types";
import { API_BASE_URL, SESSION_KEY, authHeaders } from "../auth/transport";
import { foundationMode } from "../runtime";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (!["/api/auth/login", "/api/auth/forgot-password", "/api/auth/exchange", "/api/auth/reset-password"].includes(path)) {
    Object.entries(await authHeaders()).forEach(([key, value]) => headers.set(key, value));
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  const body = (await response.json().catch(() => ({
    success: false,
    message: "Invalid API response",
    data: null
  }))) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    throw new ApiRequestError(body.message || `API request failed: ${response.status}`, response.status);
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
  async saveProfile(name: string, phone: string) {
    return request<User>("/api/profile", { method: "PATCH", body: JSON.stringify({ name, phone }) });
  },
  async profileAvatar() {
    return request<{ url: string; expiresIn: number } | null>("/api/profile/avatar");
  },
  async uploadAvatar(employeeId: string, file: File) {
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
