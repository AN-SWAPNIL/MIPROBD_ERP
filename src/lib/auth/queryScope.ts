import type { User } from "../../types/index.js";
import { normalizePermissionOverrides } from "../permissions/effectiveAccess.js";

export function queryScope(user: User | null | undefined) {
  if (!user) return "public";
  return JSON.stringify({
    id: user.id, role: user.role, status: user.status,
    capabilities: [...new Set(user.capabilities ?? [])].sort(),
    overrides: normalizePermissionOverrides(user.permissionOverrides)
  });
}
