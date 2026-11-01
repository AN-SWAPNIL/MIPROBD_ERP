import {
  BarChart3,
  Boxes,
  FileDown,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShoppingCart,
  UsersRound
} from "lucide-react";
import type { ComponentType } from "react";
import type { PermissionKey } from "../../types/index.js";
export { permissionMatrix } from "./definitions.js";
export { hasCapability, hasEffectivePermission, hasRolePermission } from "./effectiveAccess.js";

export type NavItem = {
  label: string;
  path: string;
  permission: PermissionKey;
  icon: ComponentType<{ className?: string }>;
};

export type NavSection = { label: string; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", path: "/app/dashboard", permission: "dashboard", icon: LayoutDashboard }
    ]
  },
  {
    label: "Operations",
    items: [
      { label: "Imports", path: "/app/imports", permission: "import", icon: FileDown },
      { label: "Inventory", path: "/app/inventory", permission: "inventory", icon: Boxes },
      { label: "Sales & Marketing", path: "/app/sales", permission: "sales", icon: ShoppingCart },
      { label: "Expenses & Accounts", path: "/app/accounts", permission: "accounts", icon: ReceiptText }
    ]
  },
  {
    label: "Management",
    items: [
      { label: "Employees", path: "/app/employees", permission: "users", icon: UsersRound },
      { label: "Reports", path: "/app/reports", permission: "reports", icon: BarChart3 }
    ]
  },
  {
    label: "System",
    items: [
      { label: "Settings", path: "/app/settings", permission: "settings", icon: Settings }
    ]
  }
];
