---
name: permission-lifecycle-management
description: Architectural rules and lifecycle protocols for declaring, modifying, deprecating, and enforcing strongly-typed PBAC permissions across the monorepo.
---

# Permission Lifecycle Management & PBAC Architectural Protocols

This skill outlines the strict architectural contracts, invariant rules, and step-by-step procedures for managing Permission-Based Access Control (PBAC) permissions across the B2B SaaS platform.

---

## 1. Core Invariants & Architecture

### Single Source of Truth (`PERMISSIONS_CATALOG`)
All system permissions MUST be declared in `packages/db/src/permissions-registry.ts` inside `PERMISSIONS_CATALOG` as an immutable `as const` array of objects:
```ts
export const PERMISSIONS_CATALOG = [
  {
    key: "invoice:create_draft",
    category: "Invoicing",
    description: "Create new invoice drafts from templates",
  },
  // ...
] as const;

export type AppPermission = (typeof PERMISSIONS_CATALOG)[number]["key"];
```

### Complete Eradication of Magic Strings
- API route guards (`requireOrgPermission(perm)`) and frontend authorization wrappers (`<Can I={perm}>`) MUST NEVER accept arbitrary raw string literals.
- They MUST strictly type their parameters as `AppPermission | AppPermission[]`.
- Any typo or undefined permission will be caught immediately by the TypeScript compiler (`tsc --noEmit`) at compile time.

### Zero Dangling Aliases Policy
- When a permission is refactored, split into atomic actions, or renamed, legacy strings (e.g. `invoice:create`, `invoice:edit`) MUST NEVER remain in code, routes, seeders, or database tables.
- All code, UI components, navigation definitions, and route guards must immediately transition to canonical atomic permissions.

### Mathematical Foreign Key Safety (Code `23503`)
- PostgreSQL table `org_role_permissions` has a foreign key constraint:
  `org_role_permissions.permission_key` REFERENCES `permissions.key`.
- In `packages/db/src/org-initializer.ts`, default roles (`ownerPerms`, `managerPerms`, `staffPerms`) MUST be typed strictly as `AppPermission[]`.
- `ownerPerms` defaults to `PERMISSIONS_CATALOG.map((p) => p.key)`.
- Because `ownerPerms`, `managerPerms`, and `staffPerms` are statically checked against `AppPermission[]`, it is mathematically impossible to assign a permission to a role that does not exist in the database `permissions` table, permanently eliminating Postgres foreign key violation crashes (`23503`).

---

## 2. Canonical Naming Conventions

All permissions follow the `<domain>:<action>` naming convention in lower snake_case.

| Category / Domain | Canonical Key Prefix | Standard Actions |
|---|---|---|
| Clients | `client:` | `view`, `view_details`, `view_sensitive`, `create`, `edit`, `archive`, `restore`, `delete`, `view_archived` |
| Files / Projects | `file:` | `view`, `view_details`, `view_sensitive`, `create`, `edit`, `archive`, `restore`, `delete`, `view_archived`, `advance_status` |
| Financials | `finance:` | `view_expenses`, `record_expense`, `request_funds`, `approve_funds`, `view_wallets`, `view_wallet_details`, `manage_wallets`, `manage_categories`, `view_invoices`, `manage_invoices` |
| Invoicing | `invoice:` | `view`, `create_draft`, `fill_values`, `edit_line_labels`, `manage_optional_rows`, `author_formulas`, `finalize`, `revert`, `void`, `delete` |
| Invoice Templates | `template:` | `view`, `create`, `edit`, `delete` |
| Staff Management | `staff:` | `view`, `view_details`, `view_sensitive`, `invite`, `create`, `edit_role`, `revoke` |
| Roles & Permissions | `role:` | `view`, `create`, `edit`, `delete`, `manage` |
| Workspace / Org | `workspace:` | `view`, `manage_settings`, `manage_fields`, `manage_billing` |
| Workflows | `workflow:` | `view`, `manage` |
| Activity Logs | `audit:` | `view` |
| Inventory | `inventory:` | `view_products`, `view_cost_price`, `create_product`, `edit_product`, `delete_product`, `manage_categories`, `manage_brands`, `view_customers`, `create_customer`, `edit_customer`, `delete_customer`, `view_warehouses`, `manage_warehouses`, `view_purchases`, `create_purchase`, `edit_purchase`, `confirm_purchase`, `cancel_purchase`, `delete_purchase`, `view_sales`, `create_sale`, `edit_sale`, `confirm_sale`, `cancel_sale`, `delete_sale`, `view_stock`, `view_transactions` |

---

## 3. Step-by-Step Procedure for Modifying Permissions

Whenever adding, updating, or deprecating a permission, you MUST execute this exact 6-step lifecycle procedure:

### Step 1: Update the Registry
Add or update the definition in `packages/db/src/permissions-registry.ts`:
```ts
{
  key: "domain:action",
  category: "Category Name",
  description: "Clear human-readable description of what this permission grants",
}
```

### Step 2: Update Default Roles
In `packages/db/src/org-initializer.ts`:
- Ensure `managerPerms: AppPermission[]` and `staffPerms: AppPermission[]` are updated if the new permission should be granted by default to those roles.
- `ownerPerms` automatically receives all permissions via `PERMISSIONS_CATALOG.map((p) => p.key)`.

### Step 3: Audit & Global Search (Zero Legacy Strings)
Run a git grep across the entire monorepo to find any outdated permission strings:
```bash
git grep -n "old_domain:old_action"
```
Update all call sites:
- API routes: `apps/api/src/features/**/*.route.ts`
- Frontend gates: `<Can I="...">` in `apps/web/`
- Navigation definitions: `apps/web/lib/config/navigation.ts`
- Documentation files in `docs/` and `agent.md` files

### Step 4: Database Synchronization
Run database seed or reset:
```bash
pnpm.cmd db:seed
# Or for a complete wipe and fresh reinitialization:
pnpm.cmd db:reset
```

### Step 5: Redis Cache Invalidation
Whenever role permissions or user overrides are updated at runtime, `PermissionService.invalidateCache(userId, orgId)` or cache-key pattern purge MUST be triggered to prevent stale permissions from persisting.

### Step 6: Monorepo Typecheck Verification
Run full TypeScript compiler verification across packages:
```bash
pnpm.cmd --filter @starter/api typecheck
pnpm.cmd --filter @starter/web typecheck
```
Both checks MUST pass with 0 errors.
