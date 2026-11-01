Done. I re-audited the full current design against the latest `dev` state at `1cc8cce...` before preparing this.

The main conclusion is now stronger than the previous plan: **Employees should become a proper management hub**, because employee identity/access is currently under Settings while Field Team/activity/performance live elsewhere. The existing sidebar still has seven generic destinations, and Settings currently mixes employee administration with Products, Suppliers, Business Setup, Migration, and Website Content.

The proposed final mental model is:

```text
Dashboard

OPERATIONS
Imports
Inventory
Sales & Marketing
Expenses & Accounts

MANAGEMENT
Employees
Reports

SYSTEM
Settings
```

And:

```text
Employees
├── Employee Directory
├── Access & Roles
├── Field Team
└── Activity & Performance
```

The plan carefully preserves the current Import, FIFO Inventory, Marketing, Sales, Expense, Reporting, RBAC, AI, documents, public website, and future mobile architecture rather than creating duplicate systems.

It also includes the remaining refinements we identified: real Marketing auto-refresh, actual transaction timestamps, funnel filtering, simpler Marketing actions, less duplicated performance UI, simpler report filters, permission/scope cleanup, cross-linking, route compatibility, role-specific navigation, and a system-wide client-language copy pass.

### Updated full-system plan

[Download **MIPRO_ERP_Simplified_Plan_update7.md**](sandbox:/mnt/data/MIPRO_ERP_Simplified_Plan_update7.md)

I would use this as the **next and likely final major frontend information-architecture update before client UAT**. After this, further restructuring should be avoided unless actual client testing reveals a concrete usability problem.
