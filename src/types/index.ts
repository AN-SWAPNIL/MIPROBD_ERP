export const roles = [
  "Super Admin",
  "Managing Director",
  "Accounts",
  "Import Officer",
  "Warehouse Manager",
  "Sales Manager",
  "Sales Executive"
] as const;

export type Role = (typeof roles)[number];

export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve" | "post" | "export";

export type PermissionKey =
  | "dashboard"
  | "users"
  | "suppliers"
  | "customers"
  | "products"
  | "import"
  | "inventory"
  | "sales"
  | "marketing"
  | "accounts"
  | "reports"
  | "settings"
  | "print";

export type PermissionEffect = "ALLOW" | "DENY";

export type UserPermissionOverride = {
  permission: PermissionKey;
  action: PermissionAction;
  effect: PermissionEffect;
};

export type ApiMeta = {
  total?: number;
  page?: number;
  pageSize?: number;
  role?: Role;
  scoped?: boolean;
};

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: ApiMeta;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  department: string;
  phone: string;
  avatarUrl: string;
  status: "Active" | "Pending" | "Inactive";
  territory?: string;
  employeeCode?: string;
  permissionOverrides?: UserPermissionOverride[];
  capabilities?: import("../domains/erp.types.js").Capability[];
};

export type Session = {
  token: string;
  user: User;
  security?: { assurance: "aal1" | "aal2"; enrolled: boolean; required: boolean };
};
