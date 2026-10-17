---
name: flaw-finder
description: Systematic methodology and catalog for auditing, discovering, and eliminating hidden architectural, PBAC, caching, and database flaws across the monorepo.
---

# Codebase Flaw Finder & Architectural Audit Guide

This skill serves as the central playbook for discovering, auditing, and eliminating hidden architectural, security, and data integrity flaws across this enterprise monorepo.

Whenever performing code reviews, security audits, or feature sprints, consult this checklist to catch insidious bugs before they reach production.

---

## 1. The Core Flaw Catalog

### Flaw 1: Cache Invalidation Black Holes ("Ghost Invalidation")
- **The Defect**: Service layers implement caching (e.g., Redis `sadd`, `setex`) and provide an invalidation function (e.g., `invalidateCache(userId, orgId)`), but the invalidation function is **never actually invoked** in mutation controllers (POST, PUT, PATCH, DELETE).
- **The Consequence**:
  - Permissions revoked by an admin remain active in Redis for the full TTL (e.g. 15 minutes), allowing unauthorized actions.
  - Data updates do not propagate to read endpoints.
- **Audit Rule**:
  - For every Redis `set`, `sadd`, or cache write, search the codebase for where the corresponding `del` or invalidator is called.
  - If a mutation modifies `org_role_permissions`, `org_member_roles`, or user settings, it **must** call the invalidation hook inside the same transaction or immediately post-commit.

### Flaw 2: Phantom / Orphan Schemas ("The Half-Built Feature")
- **The Defect**: The PostgreSQL database schema defines tables, foreign keys, and indexes (e.g., `org_member_permissions` for Discord-style user-level overrides), and resolution services even reference it, but **zero API routes or controllers exist** to create, update, or delete those records.
- **The Consequence**:
  - Developers and architects assume the system supports user-level permission overrides, but the UI or API has no way to configure them.
  - Clutters the database schema and creates false assumptions during audits.
- **Audit Rule**:
  - Periodically diff all exported tables in `packages/db/src/schema/` against route handlers in `apps/api/src/features/`. Every relational table must have an owner controller or an explicit deprecation plan.

### Flaw 3: The Seed-to-Route Disconnect (Unregistered PBAC Keys)
- **The Defect**: Backend route controllers guard endpoints using a string permission (e.g., `requireOrgPermission("finance:manage_invoices")`), but that permission key was **never registered** in `packages/db/src/seed-permissions.ts` under `INITIAL_PERMISSIONS`.
- **The Consequence**:
  - Organization admins configuring custom roles in the UI can only assign permissions registered in the database.
  - Because the required permission doesn't exist in the database, custom roles can **never** access the endpoint (returning 403 Forbidden).
  - The bug is masked in development because `owner` and `super_admin` accounts have bypass logic that skips PBAC checks entirely.
- **Audit Rule**:
  - Run static assertions or integration tests ensuring every string passed to `requireOrgPermission(...)` strictly exists in `INITIAL_PERMISSIONS`.

### Flaw 4: Monolithic All-or-Nothing PBAC (Lack of Least-Privilege Granularity)
- **The Defect**: A single coarse permission (e.g. `invoice:edit`) controls all mutations within a module: editing manual values, writing AST formulas, adding/deleting sections, and creating custom rows.
- **The Consequence**:
  - Organizations cannot separate roles (e.g., junior data-entry clerks cannot be prevented from accidentally breaking template formulas; accounting specialists cannot be allowed to add optional service rows without also giving them template architect powers).
- **Audit Rule**:
  - Decouple permissions into atomic capabilities:
    - *Fill / Data Entry*: `invoice:fill_values`
    - *Operational Customization*: `invoice:edit_line_labels`, `invoice:manage_optional_rows`
    - *Formula Authoring*: `invoice:author_formulas`
    - *Lifecycle Governance*: `invoice:finalize`, `invoice:revert`, `invoice:void`

### Flaw 5: The Unscoped Mutation Trap (Cross-Tenant Leakage)
- **The Defect**: Updating or deleting a database record using solely its primary key without scoping to `organizationId`:
  ```typescript
  // VULNERABLE:
  await db.update(invoices).set(payload).where(eq(invoices.id, id));
  ```
- **The Consequence**:
  - If a user passes an ID belonging to another organization, the record is modified or deleted across tenant boundaries (IDOR).
- **Audit Rule**:
  - Every update and delete query MUST be compound-scoped:
  ```typescript
  // SECURE:
  await db.update(invoices).set(payload)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
  ```

### Flaw 6: Destructive Re-initialization (Work-in-Progress Wipeout)
- **The Defect**: Implementing a "Sync" or "Reset" feature by completely re-seeding child state from parent template state.
- **The Consequence**:
  - Staff who spent 30 minutes entering custom notes, manual hours, and billing rates lose all their work when a template is refreshed.
- **Audit Rule**:
  - Always implement a non-destructive Diff/Merge: update structural formulas and tokens, but preserve user-entered overrides (`manualValue`, custom labels, notes).

### Flaw 7: Unscoped Identifier Collisions (DAG Crashes)
- **The Defect**: Inserting dynamic or prebuilt items into a calculation graph with static token identifiers without handling repeated insertions.
- **The Consequence**:
  - Adding a service (e.g. "Crane Rental") twice crashes the DAG validator with `422 DUPLICATE_TOKEN`.
- **Audit Rule**:
  - Keep base tokens clean (`CRANE_RENTAL`), but detect collisions and append deterministic sequential suffixes (`CRANE_RENTAL_2`, `CRANE_RENTAL_3`).

---

## 2. Fast Audit Workflow for Code Reviews

When reviewing PRs or refactoring modules, run this 5-minute sanity check:

1. **Check Route Permissions vs Seed**:
   ```bash
   # Search route files for permission keys
   grep -rn "requireOrgPermission" apps/api/src/
   # Verify each key is present in packages/db/src/seed-permissions.ts
   ```
2. **Check Cache Invalidation**:
   ```bash
   # Search for redis.set / sadd / smembers
   grep -rn "redis\." apps/api/src/
   # Verify corresponding del / invalidate calls exist in mutation handlers
   ```
3. **Check Scoped DB Queries**:
   ```bash
   # Verify every update/delete in controllers includes eq(..., organizationId)
   ```
4. **Check Role Bypass Masking**:
   - Always run integration tests using a non-owner, non-super-admin member context to ensure PBAC policies actually permit access.
