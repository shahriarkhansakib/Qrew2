# ADR-0007: Prebuilt Optional Service Rows and Granular Invoicing PBAC Architecture

- **Status**: Accepted
- **Date**: 2026-10-17
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Invoicing Pipeline, Template Authoring, Draft Builder UX, Multi-Tier Permissions, Security

---

## Context & Problem Statement

Master invoice templates are authored and maintained by senior leadership, finance directors, and template architects. When operational staff or billing clerks create invoices from these templates, project-specific requirements often emerge:
1. **Optional / Add-on Line Items**: Projects frequently require add-on services (e.g., *Crane Rental*, *Vessel Fumigation*, *Berthing Surcharge*, *Extra Logistics Handling*) that do not belong on every standard invoice, but are standard recurring services.
2. **Formula Authoring Hazards**: Previously, adding arbitrary rows required switching the draft into builder mode. Permitting non-technical staff to author formulas risks syntax errors, broken DAG references, circular dependencies, or altered pricing math.
3. **Coarse Access Control**: The legacy permission model relied on broad keys (`finance:manage_invoices` vs `finance:view_invoices`). Organizations could not delegate data-entry tasks (entering hours, quantities, or manual rates) without granting the ability to alter core pricing formulas or tamper with legal line item descriptions.
4. **Cache Invalidation Drift**: Role updates in the database did not invalidate Redis permission caches, allowing revoked permissions to persist indefinitely in active user sessions.

---

## Decision

### 1. Prebuilt Optional Services Catalog on Templates

* **Template-Level Catalog (`optional_rows`)**:
  * Added `optional_rows: jsonb("optional_rows").$type<TemplateOptionalRow[]>()` to `invoice_templates`.
  * Each optional row defines `id`, `rowToken`, `rowType`, `label`, `formulaRaw`, `constantValue`, `defaultValue`, `subDescription`, and `isDefaultOverrideable`.
  * Managed by template architects in the Master Template Builder via dedicated endpoints (`GET /api/invoice-templates/:id/optional-rows`, `POST`, `DELETE`).
* **Direct Draft Attachment**:
  * Staff open the **"+ Add Service"** modal in draft fill/edit mode, select from the prebuilt catalog, optionally customize the display label or rate, and assign it to a destination section.
  * The backend instantiates the service as a draft row marked with `isOptional: true`.

### 2. Normal Row Semantics & No `ADDON_` Prefix

* **Full Normal Row Behavior**:
  * Optional services are mathematically, structurally, and visually normal rows. They are **not** row charges or surcharges. They calculate via normal formulas or manual inputs, appear in USD1/USD2 table cells, and sum into section totals.
* **No `ADDON_` Prefix**:
  * Optional rows retain their canonical upper-snake tokens directly (e.g., `CRANE_RENTAL`).
* **Collision Avoidance via Sequential Suffixes**:
  * If a draft already contains `CRANE_RENTAL` and a user attaches a second instance, the system automatically detects existing tokens across all sections and assigns `CRANE_RENTAL_2`, `CRANE_RENTAL_3`, etc.
  * Guarantees zero DAG identifier clashes without cluttering user-facing labels.

### 3. Token Immutability with User Freedom Over Labels and Rates

* **Mathematical Token Immutability**:
  * The assigned `rowToken` cannot be modified by staff in drafts. This ensures formula references (`ROW_CRANE_RENTAL`), DAG topological ordering, and snapshot schemas remain unbreakable.
* **Display Label & Manual Value Flexibility**:
  * Authorized staff can freely modify the user-facing `label` and override manual rates without corrupting formula dependencies.

### 4. Guarded Draft Deletion

* **Core Row Protection**:
  * The removal endpoint (`DELETE /api/invoices/drafts/:id/optional-rows/:rowToken`) strictly verifies `draftRow.isOptional === true`.
  * Any attempt to delete a core template row returns `403 Forbidden` (`"Cannot remove core template rows from a draft; only optional service rows can be removed"`).

### 5. Granular Invoicing PBAC Architecture

The permission model is decomposed into atomic permissions:

| Permission Key | Description | Typical Role Mapping |
|:---|:---|:---|
| `invoice:fill_values` | Input numeric rates/quantities for manual and constant rows in drafts | Clerk, Staff, Admin |
| `invoice:edit_line_labels` | Modify row display labels and descriptions | Staff, Admin |
| `invoice:manage_optional_rows` | Attach prebuilt services to drafts and remove optional rows | Staff, Admin |
| `invoice:author_formulas` | Toggle formula mode and author/edit mathematical formulas | Template Architect, Admin |
| `invoice:finalize` | Freeze drafts into legally binding immutable invoices | Accountant, Admin |
| `invoice:revert` | Revert frozen/issued/disputed invoices back to draft for correction | Finance Lead, Admin |
| `invoice:void` | Void finalized invoices and retire document numbers | Finance Director, Admin |
| `invoice:delete` | Delete drafts or voided invoice records | Admin |

* **Backwards Compatibility**:
  * Legacy permissions (`finance:manage_invoices`, `finance:view_invoices`) are retained and granted full equivalent capability.
  * Backend `requireOrgPermission` supports permission arrays (`string | string[]`) evaluated with `some()`.
  * Frontend `<Can I={string | string[]}>` and `usePermissionStore.canAny()` evaluate arrays seamlessly.

### 6. Three-Tier Role Capability Model

1. **Tier 1 (Architect / Admin)**:
   * Holds `invoice:author_formulas` and `finance:manage_invoices`.
   * Can edit master templates directly via `/org-admin/invoice-templates/:id`. A dedicated "Edit Master Template" link is rendered in the draft header.
   * Can manage the template optional rows catalog and enter arbitrary AST formulas in draft builder mode.
2. **Tier 2 (Accountant / Staff)**:
   * Holds `invoice:fill_values`, `invoice:edit_line_labels`, `invoice:manage_optional_rows`.
   * Can attach prebuilt optional services, tweak labels for client requirements, and adjust manual rates. Formula bar is locked for editing formulas.
3. **Tier 3 (Clerk)**:
   * Holds `invoice:fill_values`, `invoice:manage_optional_rows`.
   * Can select prebuilt services and fill numeric rates. Formula authoring and label editing are locked.

### 7. Automated Redis Permission Cache Invalidation

* In `roles.controller.ts`, every role creation, update, and deletion scans and removes Redis cached permission keys (`permission:*`) for that organization, ensuring permission changes take effect immediately without server restarts or stale session retention.

---

## Consequences & Compliance

* **Positive**:
  * Eliminates the risk of non-technical staff corrupting formulas during invoice generation.
  * Allows organizations to establish standard optional service catalogs and empower clerks safely.
  * Fine-grained PBAC matches enterprise compliance and auditing requirements.
  * High-performance cache synchronization prevents privilege escalation or revocation lags.
* **Compliance**:
  * Adheres to the 4 Data Field Categorization Rules.
  * Preserves full multi-tenant isolation and BigNumber arithmetic.
