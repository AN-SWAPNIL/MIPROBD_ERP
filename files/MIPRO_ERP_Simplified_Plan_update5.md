# MIPRO ERP — Flexible RBAC & Delegated Employee Administration Plan

**Date:** 25 August 2026
**Repository:** `AN-SWAPNIL/Medical_Supplier_ERP`
**Working branch:** `dev`
**Purpose:** Complete the current role/capability model so Super Admin can delegate selected access to specific users without creating many new roles.

---

## 1. Core Decision

Keep the current seven roles as **default permission templates**:

- Super Admin
- Managing Director
- Accounts
- Import Officer
- Warehouse Manager
- Sales Manager
- Sales Executive

Do not create many new roles such as:

- Employee Manager
- Senior Sales Manager
- Import + Reports Manager
- Sales + Employee Admin

Instead use:

```text
Role Defaults
    +
Per-User Permission Overrides
    +
Sensitive Capabilities
```

This gives Super Admin fine-grained control while keeping the system simple.

---

## 2. What Already Exists

The current ERP already has:

- user create/edit,
- role assignment,
- active/pending/inactive status,
- title/department/territory/employee code,
- role-based permission matrix,
- actions:
  - view
  - create
  - edit
  - delete
  - approve
  - post
  - export
- sensitive capabilities:
  - `view_sensitive_cost`
  - `edit_sensitive_cost`
  - `finalize_landed_cost`
  - `reopen_landed_cost`
  - `view_profit`
  - `approve_stock_override`
  - `manage_users`
  - `approve_special_price`

The real missing part is a **general per-user permission override layer**.

---

## 3. Target Behavior

Example:

```text
Tanvir Hasan
Role: Import Officer
```

Role default:

```text
✓ Dashboard
✓ Imports
✓ Products
✓ Suppliers
```

Super Admin may additionally grant:

```text
✓ Inventory → View
✓ Reports → View
✓ Reports → Export
```

without changing Tanvir's role.

Another example:

```text
Farhana Akter
Role: Sales Manager
```

Super Admin may additionally grant:

```text
✓ Users → View
✓ Users → Create
✓ Users → Edit
```

so Farhana can manage employees while remaining a Sales Manager.

---

## 4. Separate Employee Management From Access Management

These should be different powers.

### Employee Management

Authorized manager may:

- view employees,
- create employees,
- edit profile information,
- edit title/department/territory,
- edit employee code,
- activate/deactivate employee,
- trigger password reset/invite later.

Use:

```text
users:view
users:create
users:edit
```

and keep `manage_users` meaningful.

### Access Management

Much more sensitive.

Allows:

- changing role,
- adding/removing permission overrides,
- granting sensitive capabilities,
- granting approval authority,
- granting user-management authority.

Add:

```text
manage_user_access
```

Default:

```text
Super Admin only
```

A normal employee manager must not be able to make someone Super Admin or grant confidential costing access.

---

## 5. Add `users` as a Permission Area

Current `Settings` is too broad to use for delegated employee administration.

Add:

```ts
"users"
```

to `PermissionKey`.

Recommended actions:

```text
users:view
users:create
users:edit
users:delete
```

In practice, prefer **deactivation** instead of hard-delete.

A delegated manager should be able to access:

```text
Settings
└── Users & Capabilities
```

without gaining access to:

- Confirmation Queue
- Products
- Suppliers
- Business Setup
- Data Migration

---

## 6. Per-User Permission Overrides

Add:

```ts
type PermissionEffect = "ALLOW" | "DENY";

type UserPermissionOverride = {
  permission: PermissionKey;
  action: PermissionAction;
  effect: PermissionEffect;
};
```

Extend `User`:

```ts
type User = {
  ...
  role: Role;
  permissionOverrides?: UserPermissionOverride[];
  capabilities?: Capability[];
};
```

Store only differences from role defaults.

Good:

```text
role = Import Officer

overrides:
reports:view = ALLOW
reports:export = ALLOW
```

Do not duplicate the entire role matrix inside every user.

---

## 7. Effective Permission Rule

Create one canonical resolver.

```text
Role Default
    ↓
Explicit ALLOW / DENY
    ↓
Sensitive Capability Check
    ↓
Final Effective Access
```

Recommended precedence:

```text
Explicit DENY
>
Explicit ALLOW
>
Role Default
```

Example:

```text
Sales Manager role:
reports:export = true

User override:
reports:export = DENY

Final:
reports:export = false
```

---

## 8. Sensitive Capabilities Remain Separate

Keep sensitive actions as capabilities rather than normal module permissions.

Keep:

```text
view_sensitive_cost
edit_sensitive_cost
finalize_landed_cost
reopen_landed_cost
view_profit
approve_stock_override
approve_special_price
manage_users
```

Add:

```text
manage_user_access
```

This prevents module access from automatically exposing confidential actions.

---

## 9. Recommended Capability Type

```ts
export type Capability =
  | "view_sensitive_cost"
  | "edit_sensitive_cost"
  | "finalize_landed_cost"
  | "reopen_landed_cost"
  | "view_profit"
  | "approve_stock_override"
  | "approve_special_price"
  | "manage_users"
  | "manage_user_access";
```

---

## 10. Settings Access Must Become Permission-Driven

Instead of making all Settings Super Admin-only:

```text
Users & Capabilities
→ users:view

Products & Aliases
→ products:view

Suppliers
→ suppliers:view

Business Setup
→ settings:view

Migration
→ settings:view
```

A Sales Manager with only `users:view` should enter:

```text
/app/settings?view=users
```

but not see the other Settings sections.

---

## 11. Filter Settings Tabs

Example for delegated Sales Manager:

```text
Settings

[ Users & Capabilities ]
```

Example for Super Admin:

```text
Confirmation Queue
Users & Capabilities
Products & Aliases
Suppliers
Business Setup
Data Migration
```

Only render tabs the current user can actually access.

---

## 12. Main Sidebar Must Use Effective Access

Current role-oriented sidebar logic should become:

```ts
can(user, permission, "view")
```

instead of:

```ts
roles.includes(user.role)
```

Then:

```text
Import Officer
+ reports:view ALLOW
```

automatically sees **Reports**.

And:

```text
Sales Manager
+ reports:view DENY
```

does not.

---

## 13. Route Guards Must Use the Same Resolver

Example:

```tsx
<RequirePermission permission="reports" action="view">
  <ReportsPage />
</RequirePermission>
```

Settings may use a wrapper that permits entry when the user has any valid Settings-subview permission.

Do not maintain separate access logic in sidebar and routes.

---

## 14. Backend Authorization Is Mandatory

Do not implement this only in React.

Replace fixed user-administration checks with:

```ts
requirePermission(req, res, "users", "view")
requirePermission(req, res, "users", "create")
requirePermission(req, res, "users", "edit")
```

Add shared backend helpers:

```ts
hasEffectivePermission(user, permission, action)
requirePermission(req, res, permission, action)
```

Frontend and backend should follow the same definitions.

---

## 15. User Endpoint Authorization

Recommended behavior:

```text
GET /api/settings/users
→ users:view

POST /api/settings/users
→ users:create

PATCH /api/settings/users/:id
→ depends on changed fields
```

If PATCH changes only:

```text
name
phone
title
department
territory
employeeCode
status
```

require:

```text
users:edit
```

If PATCH changes:

```text
role
permissionOverrides
capabilities
```

require:

```text
manage_user_access
```

This fits the current single user-edit endpoint without unnecessary API redesign.

---

## 16. Privilege-Escalation Protection

Add strict safeguards.

### Rule 1

Only Super Admin may create another Super Admin.

### Rule 2

Non-Super-Admin cannot modify a Super Admin's access.

### Rule 3

A delegated manager cannot grant `manage_user_access` unless explicitly allowed.

### Rule 4

A delegated manager cannot grant permissions/capabilities they themselves are not authorized to grant.

### Rule 5

Prefer blocking users from modifying their own sensitive permissions.

### Rule 6

The final active Super Admin cannot be deactivated.

### Rule 7

Every access change is audited.

---

## 17. Audit Access Changes

Record:

```text
User Created
User Profile Updated
User Activated
User Deactivated
Role Changed
Permission Allowed
Permission Denied
Permission Reset To Default
Capability Granted
Capability Revoked
Password Reset
```

Store:

```text
actor
target user
before
after
timestamp
```

Never log plaintext passwords.

---

## 18. Extend the Existing User Edit Modal

Do not create another user-management page.

Use the current modal and add:

```text
Profile
Role
Role Access
Additional Access
Sensitive Capabilities
Account Status
```

---

## 19. Role Access Summary

Show inherited access read-only.

Example:

```text
Role: Import Officer

Default Access

✓ Dashboard
✓ Imports
✓ Products
✓ Suppliers
× Inventory
× Sales
× Accounts
× Reports
```

This makes the effect of the selected role clear before overrides are applied.

---

## 20. Additional Access UI

Add an expandable section:

```text
Additional Access
```

Example:

```text
Inventory

View
(●) Role Default
( ) Allow
( ) Deny

Reports

View
( ) Role Default
(●) Allow
( ) Deny

Export
( ) Role Default
(●) Allow
( ) Deny
```

Only save non-default values.

---

## 21. Employee Manager View

If a user has employee-management permission but not access-management permission, show only:

```text
Profile
Employment
Status
```

Role/capability fields should be hidden or read-only.

Example:

```text
Farhana Akter
Sales Manager

Can:
✓ Create employee
✓ Edit employee
✓ Deactivate employee

Cannot:
× Change role
× Grant Reports
× Grant sensitive cost
× Grant Super Admin
```

---

## 22. Super Admin / Access Manager View

Super Admin sees:

```text
Profile
Role
Default Access
Additional Access
Sensitive Capabilities
Status
```

A trusted delegated access manager may see the same only if granted:

```text
manage_user_access
```

---

## 23. Delegated Employee Manager Example

Super Admin edits:

```text
Farhana Akter
Role: Sales Manager
```

Grant:

```text
users:view = ALLOW
users:create = ALLOW
users:edit = ALLOW
manage_users
```

Result:

Farhana sees:

```text
Settings
└── Users & Capabilities
```

She may:

- create Sales Executive,
- edit employee profile,
- edit territory,
- change status.

She may not:

- grant permissions,
- grant sensitive capabilities,
- edit Super Admin,
- access Business Setup,
- access Migration.

---

## 24. Other Per-User Access Examples

### Import Officer + Reports

```text
Role: Import Officer

reports:view = ALLOW
reports:export = ALLOW
```

### Accounts + Customer Editing

```text
Role: Accounts

customers:edit = ALLOW
```

### Sales Manager Without Export

```text
Role: Sales Manager

reports:export = DENY
```

### Warehouse Manager + Reports

```text
Role: Warehouse Manager

reports:view = ALLOW
```

No new role is needed for any of these.

---

## 25. Data Scope Is Separate From Permission

Do not confuse:

```text
Can open Reports
```

with:

```text
Can see every employee's report
```

Keep the existing scoped logic.

For example:

```text
Sales Executive + reports:view
```

still sees only their own permitted sales/report data.

Do not add generic `OWN / TEAM / ALL` in this update unless a real client case requires it.

---

## 26. AI Must Follow Effective Access

Floating AI and Smart Insights must use:

```text
effective permission
+
current record scope
+
sensitive capability checks
```

Example:

Import Officer gets Reports access but not `view_sensitive_cost`.

AI may discuss allowed reports but must still refuse confidential landed-cost data.

---

## 27. Documents Must Follow Effective Access

Normal module access does not automatically grant confidential documents.

Example:

```text
import:view = ALLOW
```

may permit normal import documents.

But sensitive cost documents still require:

```text
view_sensitive_cost
```

---

## 28. Field Team Scope Remains Separate

Granting Sales access should not automatically expose all GPS data.

Keep:

```text
Sales Executive → self
Sales Manager → allowed team
MD / Super Admin → broader management view
```

No need for a new `field_team` permission unless a real use case requires it.

---

## 29. Current Settings Page Should Stop Fetching Everything

This becomes important once non-Super-Admins can access only one Settings subview.

Currently Settings loads many datasets.

After this update:

- Users tab should fetch users only.
- Products tab should fetch products/aliases only.
- Suppliers tab should fetch suppliers only.
- Business Setup should fetch accounts/warehouse/print/etc.
- Migration should fetch migration-specific data only.

Benefits:

- less data exposure,
- faster Settings load,
- cleaner authorization.

---

## 30. User List Visibility

Delegated employee managers do not need to see every sensitive access detail.

Recommended list columns:

```text
Name
Employee ID
Role
Department
Territory
Status
```

Show detailed capabilities only to:

```text
manage_user_access
```

---

## 31. Delete vs Deactivate

Do not hard-delete employees who have historical activity.

Use current statuses:

```text
Active
Pending
Inactive
```

Employee records may already be linked to:

- quotations,
- collections,
- imports,
- visits,
- approvals,
- audit events.

Prefer:

```text
Deactivate User
```

---

## 32. Future Supabase Model

Recommended later tables:

```text
roles
permissions
role_permissions
user_permission_overrides
user_capabilities
```

Example:

```text
user_permission_overrides
-------------------------
id
user_id
permission_key
action
effect
created_by
created_at
updated_at
```

Unique:

```text
user_id + permission_key + action
```

---

## 33. Shared Permission Logic

Prefer pure shared TypeScript logic:

```text
src/lib/permissions/
  definitions.ts
  effectiveAccess.ts
```

Useful functions:

```ts
hasRolePermission(role, permission, action)

getPermissionOverride(user, permission, action)

hasEffectivePermission(user, permission, action)

hasCapability(user, capability)

canManageTargetUser(actor, target)

canGrantCapability(actor, capability)
```

Avoid separate frontend/backend rules that drift apart.

---

## 34. Required Tests

### Default role

```text
Import Officer
reports:view
→ false
```

### Allow override

```text
Import Officer
reports:view ALLOW
→ true
```

### Deny override

```text
Sales Manager
reports:export DENY
→ false
```

### Sensitive capability

```text
reports:view allowed
view_sensitive_cost missing
→ confidential costing remains blocked
```

---

## 35. Employee Delegation Tests

Delegated Employee Manager:

```text
users:view
users:create
users:edit
manage_users
```

Expected:

- can list employees,
- can create normal employees,
- can edit employee profile/status,
- cannot modify role/access,
- cannot edit Super Admin access,
- cannot grant confidential capabilities.

---

## 36. Navigation Tests

If:

```text
Import Officer
reports:view ALLOW
```

expect:

```text
Reports appears in sidebar
```

If:

```text
Sales Manager
reports:view DENY
```

expect:

```text
Reports disappears
```

Direct routes and APIs must behave the same way.

---

## 37. Privilege Escalation Tests

Must fail:

```text
Sales Manager
→ grant self Super Admin
```

Must fail:

```text
Employee Manager
→ grant view_sensitive_cost
```

Must fail:

```text
Non-Super-Admin
→ deactivate final Super Admin
```

Must fail:

```text
Employee Manager
→ edit Super Admin access
```

---

## 38. UAT — Delegate Employee Management

1. Login as Super Admin.
2. Settings → Users & Capabilities.
3. Edit Sales Manager.
4. Grant:
   - Users View
   - Users Create
   - Users Edit
   - Manage Users.
5. Save.
6. Login as Sales Manager.
7. Settings becomes visible.
8. Only Users & Capabilities appears.
9. Create a Sales Executive.
10. Edit employee territory/status.
11. Attempt to change role/capabilities.
12. System blocks it.

---

## 39. UAT — Grant Reports to Import Officer

1. Super Admin edits Import Officer.
2. Set:
   ```text
   Reports View = Allow
   Reports Export = Allow
   ```
3. Login as Import Officer.
4. Reports appears.
5. Reports work normally.
6. Sensitive cost remains hidden unless separately granted.

---

## 40. UAT — Remove a Default Permission

1. Super Admin edits Sales Manager.
2. Set:
   ```text
   Reports Export = Deny
   ```
3. Login as Sales Manager.
4. Reports remains available.
5. Export button is unavailable.
6. Direct export API attempt returns 403.

---

## 41. Do Not Build

Do not add:

- custom role creation UI now,
- dozens of extra roles,
- enterprise IAM designer,
- hundreds of field-level permissions,
- department hierarchy engine,
- separate employee-management sidebar module,
- a second Settings application.

Keep:

```text
7 role templates
+
small per-user override layer
+
sensitive capabilities
```

---

## 42. Implementation Priority

### P0

1. Add `users` PermissionKey.
2. Add `manage_user_access`.
3. Add `UserPermissionOverride`.
4. Implement effective permission resolver.
5. Update sidebar.
6. Update route guards.
7. Update user-management API authorization.
8. Make `manage_users` functional.
9. Add privilege-escalation protection.
10. Add access-change audit.

### P1

11. Extend current user edit modal.
12. Add Additional Access UI.
13. Add Role Default summary.
14. Add Default / Allow / Deny controls.
15. Filter Settings views by access.
16. Fetch only permitted Settings data.

### P2 / Later

17. Supabase role/permission tables.
18. RLS enforcement.
19. Invite-based employee onboarding.
20. Add OWN/TEAM/ALL scopes only if future client requirements justify them.

---

## 43. Exact Next Milestone

# Flexible RBAC + Delegated Employee Administration

The finished behavior should be:

```text
Super Admin
    ↓
Assign Role
    ↓
Optional Per-User Overrides
    ↓
Optional Sensitive Capabilities
    ↓
Effective Access
    ↓
Sidebar / Route / API / AI / Documents / Reports
```

Super Admin can therefore grant exceptions such as:

```text
Import Officer + Reports
Warehouse Manager + Reports
Sales Manager + Employee Management
Accounts + Customer Edit
```

without creating new roles.

A delegated employee manager can manage employees without gaining permission to change roles, sensitive access, or unrelated system settings.

This should become the ERP's canonical access-control model.

---

**End of Plan**

---

## Implementation Security Amendment

The accompanying access-role analysis is authoritative for security edge cases. In particular:

- delegated employee managers create Sales Executive accounts unless they also hold access-management authority;
- non-Super-Admins manage only lower-ranked users, never themselves, peers, higher-ranked users or Super Admins;
- the final active Super Admin cannot be deactivated or demoted;
- password changes require access-management authority;
- only Super Admin can grant or revoke `manage_user_access`;
- delegated access managers may grant only access they themselves possess;
- employee lifecycle actions require both `manage_users` and the relevant `users:*` permission;
- duplicate permission overrides are normalized, with `DENY` taking precedence.

These corrections close escalation paths while preserving the plan's seven-role plus per-user-override model.
