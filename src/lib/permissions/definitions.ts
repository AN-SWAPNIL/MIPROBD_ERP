import type { PermissionAction, PermissionKey, Role } from "../../types/index.js";

export const permissionActions: PermissionAction[] = ["view", "create", "edit", "delete", "approve", "post", "export"];
export const permissionKeys: PermissionKey[] = ["dashboard", "users", "suppliers", "customers", "products", "import", "inventory", "sales", "marketing", "accounts", "reports", "settings", "print"];

const all = permissionActions;
const read: PermissionAction[] = ["view", "export"];
const work: PermissionAction[] = ["view", "create", "edit", "delete", "post", "export"];

export const permissionMatrix: Record<Role, Partial<Record<PermissionKey, PermissionAction[]>>> = {
  "Super Admin": {
    dashboard: all,
    users: all,
    import: all,
    inventory: all,
    sales: all,
    marketing: all,
    accounts: all,
    reports: all,
    settings: all,
    print: all,
    products: all,
    suppliers: all,
    customers: all
  },
  "Managing Director": {
    dashboard: read,
    import: ["view", "approve", "export"],
    inventory: read,
    sales: ["view", "approve", "export"],
    marketing: ["view", "approve", "export"],
    customers: read,
    accounts: read,
    reports: read,
    print: read
  },
  Accounts: {
    dashboard: ["view"],
    sales: ["view", "post", "export"],
    accounts: work,
    reports: read,
    customers: read,
    print: read
  },
  "Import Officer": {
    dashboard: ["view"],
    import: work,
    products: work,
    suppliers: work,
    print: read
  },
  "Warehouse Manager": {
    dashboard: ["view"],
    import: read,
    inventory: work,
    print: read
  },
  "Sales Manager": {
    dashboard: ["view"],
    inventory: read,
    sales: work,
    marketing: ["view", "create", "edit", "approve", "export"],
    customers: work,
    reports: read,
    print: read
  },
  "Sales Executive": {
    dashboard: ["view"],
    sales: ["view", "create", "edit", "post"],
    marketing: ["view", "create", "edit"],
    customers: ["view", "create", "edit"],
    reports: ["view", "export"],
    print: ["view"]
  }
};

export const roleRank: Record<Role, number> = {
  "Super Admin": 100,
  "Managing Director": 80,
  "Sales Manager": 50,
  Accounts: 40,
  "Import Officer": 40,
  "Warehouse Manager": 40,
  "Sales Executive": 10
};

export const settingsEntryPermissions: PermissionKey[] = ["settings", "products", "suppliers"];
