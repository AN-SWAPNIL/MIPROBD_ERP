# MIPRO ERP Access and Role Analysis

**Reviewed:** 25 August 2026
**Decision:** Use the seven existing roles as defaults, then apply small per-user ALLOW/DENY exceptions and separate sensitive capabilities.

## What the update 5 plan gets right

- Roles should be reusable templates, not a growing list of one-off job titles.
- One effective-access resolver must control navigation, routes, actions, API endpoints, documents and exports.
- Explicit `DENY` must beat `ALLOW`, and `ALLOW` must beat the role default.
- Employee profile management and access management are different authorities.
- Settings must expose only permitted tabs and must fetch only the data for those tabs.
- Data scope (own/team/all records) remains separate from module/action permission.

## Security corrections required before implementation

1. A delegated employee manager without `manage_user_access` may create only the baseline `Sales Executive` role. Otherwise `users:create` could create an Accounts or Managing Director account and become an escalation path.
2. Non-Super-Admins may manage only lower-ranked users. They cannot manage themselves, peers, higher-ranked roles or any Super Admin.
3. The last active Super Admin is protected from deactivation **and** role change.
4. Password assignment/reset is access-sensitive. In this prototype it is restricted to Super Admin or a user with `manage_user_access`, not ordinary employee editors.
5. `manage_user_access` can be granted or revoked only by a Super Admin. It cannot be delegated onward by an access manager.
6. A non-Super-Admin access manager can grant only permissions and capabilities they currently possess, and only to a lower-ranked target.
7. `manage_users` is required alongside the relevant `users:view/create/edit` permission for employee lifecycle actions. `manage_user_access` is additionally required for role, permission, capability or password changes.
8. Duplicate overrides are normalized by `(permission, action)`. If malformed input contains both effects, `DENY` wins deterministically.
9. Users are deactivated rather than deleted. Every status, role, permission and capability change creates an audit event without storing a plaintext password.
10. Operational product/customer lookups do not automatically grant master-data administration. Settings visibility remains tied to explicit administration permissions.

## Correct effective-access decision

```text
Explicit DENY
    > Explicit ALLOW
    > Role default
```

Sensitive operations then require the matching capability in addition to the module/action permission. Authentication status and record scope are evaluated separately.

## Role hierarchy for delegated administration

```text
Super Admin > Managing Director > department managers/officers > Sales Executive
```

Hierarchy is a safety boundary for user administration, not a replacement for permissions. Super Admin remains the only unrestricted access administrator in the prototype.

## Acceptance conclusion

The update 5 plan is a good architectural improvement after applying the corrections above. It should replace fixed role arrays throughout the current prototype and become the canonical access-control contract for both frontend and mock API.
