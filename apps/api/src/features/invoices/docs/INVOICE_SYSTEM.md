# Invoice System — Backend Architecture & Feature Reference

> **Purpose:** This document is the authoritative reference for the invoice system backend. Read it before making any invoice-related changes. It prevents hallucination by providing ground-truth architecture, data models, API routes, and business rules.
>
> **Last Updated:** 2026-08-08  
> **Status:** Living Document — update on every structural change

---

## 1. System Overview

The invoice system enables billing managers to design reusable invoice **templates** with formula-driven rows, then generate per-project **invoice drafts** that staff fill in, and finally **finalize** those drafts into permanent, frozen invoice records.

There are **three distinct phases** with separate data surfaces:

| Phase | Surface | Who | Where |
|---|---|---|---|
| **Template Design** | Master template structure | Admin / Billing Manager | `/org-admin/invoice-templates/[id]` |
| **Draft Editing** | Per-project draft copy | Manager / Staff | `/dashboard/invoices/drafts/[id]` |
| **Finalized Invoice** | Immutable, frozen snapshot | Billing records | `/dashboard/invoices` |

> **Critical Rule:** The master template is NEVER modified by the draft editor. Drafts clone the template structure into `invoice_drafts.draftSections` (JSONB). All edits target that JSONB copy only.

---

## 2. Directory Structure

```
apps/api/src/features/
├── invoice-templates/
│   ├── invoice-templates.controller.ts    # CRUD for invoice_templates table
│   ├── invoice-templates.route.ts         # Route mounting + auth middleware
│   ├── template-rows.controller.ts        # Rows + row charges CRUD
│   ├── template-sections.controller.ts    # Sections CRUD + reorder
│   ├── template-section-charges.controller.ts  # Section charges CRUD
│   ├── template-constants.controller.ts   # Template-level constants (CAT_* tokens)
│   └── template-header-fields.controller.ts    # Header field definitions
│
└── invoices/
    ├── invoices.controller.ts             # Finalized invoices CRUD
    ├── invoices.route.ts                  # Route mounting
    ├── drafts.controller.ts               # Draft CRUD (view, update, delete)
    ├── draft-builder.controller.ts        # Draft generation from template
    ├── WORKFLOW.md                        # Human-readable workflow spec
    ├── INVOICE_SYSTEM.md                  # THIS FILE
    └── engine/
        ├── types.ts                       # Canonical TypeScript types for all engine services
        ├── token-resolver.service.ts      # Resolves FILE_* tokens from project data
        ├── ast-evaluator.service.ts       # BigNumber-based formula AST evaluator
        ├── dag-validator.service.ts       # Detects circular deps, forward refs, scope violations
        ├── engine.controller.ts           # Preview endpoint + evaluation orchestrator
        ├── invoice-freeze.ts              # Finalizes draft → invoice_line_items
        ├── text-interpolator.service.ts   # {{TOKEN}} → value text interpolation for descriptions
        └── document-number.ts             # Invoice document number generation
```

---

## 3. Database Schema

### 3.1 Template Tables (`packages/db/src/schema/invoice-templates.ts`)

#### `invoice_templates`
The master template record. Owns all sections, rows, and charges.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `organization_id` | text FK | Cascade delete |
| `name` | text | Display name |
| `description` | text | Optional |
| `document_type` | text FK | → `invoice_types.id` |
| `scope` | enum | `organization` \| `project` |
| `currency` | text | Default `USD` |
| `version` | integer | Template version number |
| `is_archived` | boolean | Soft delete |
| `source_template_id` | text self-FK | For cloning/deriving |

#### `template_sections`
Ordered sections within a template (A, B, C… or custom-named).

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `template_id` | text FK | |
| `display_name` | text | Optional. If null, UI auto-shows letter |
| `section_token` | text | **Frozen after creation.** Drives `SEC_<TOKEN>_BASE/TOTAL/CHARGES` tokens. Unique per template. |
| `sort_order` | integer | |

#### `template_rows`
Parent line items within a section.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `template_id` | text FK | |
| `section_id` | text FK | |
| `parent_label` | text | Group heading label |
| `row_token` | text | **Globally unique per template.** Drives `<TOKEN>` (base) and `<TOKEN>_TOTAL` (base + charges) tokens. |
| `value_type` | enum | `normal` = manual entry, `formula` = engine-computed |
| `formula` | text | Stored as `{{$row:UUID}}` references. Decoded before evaluation. |
| `initial_value` | numeric(20,6) | Pre-fill value for manual rows |

#### `template_row_components`
Sub-line items within a parent row (individual billable items).

| Column | Type | Notes |
|---|---|---|
| `component_token` | text | Format: `<ROW_TOKEN>_<LABEL_SNAKECASE>`. Unique per row. |
| `value_type` | enum | `normal` or `formula` |
| `formula` | text | Bare token expression |
| `initial_value` | numeric | Pre-fill value |

#### `template_row_charges`
Computed additions bound to a parent row (e.g. 15% VAT on PORT_DUES).

| Column | Type | Notes |
|---|---|---|
| `charge_token` | text | Format: `<ROW_TOKEN>_<LABEL_SNAKECASE>`. Unique per row. |
| `formula` | text | **Must reference parent rowToken as primary operand.** Cross-row refs are rejected by the DAG validator. |

#### `template_section_charges`
Computed additions bound to a section (e.g. 10% levy on section BASE).

| Column | Type | Notes |
|---|---|---|
| `charge_token` | text | Format: `SEC_<SECTION_TOKEN>_<LABEL_SNAKECASE>` |
| `formula_base` | enum | `BASE` \| `TOTAL` \| `CHARGES` — which section aggregate to use |
| `formula_rest` | text | Remainder of expression, e.g. `* 0.10` |

Full formula at eval time: `SEC_<SECTION_TOKEN>_<formulaBase> <formulaRest>`

#### `template_header_fields`
Fields displayed above the invoice table (vessel name, GRT, cargo, etc.)

| Column | Type | Notes |
|---|---|---|
| `field_type` | enum | Determines UI input type |
| `file_field_key` | text | Maps to `project.customFields.*` for auto-population |
| `is_formula_injectable` | boolean | When `true`, numeric value becomes a `FILE_*` token available to row formulas |
| `org_config_key` | text | Maps to `org_settings` for org-level defaults |

### 3.2 Invoice Tables (`packages/db/src/schema/invoices.ts`)

- **`invoice_drafts`** — One-per-user-per-project in-progress invoice. Contains `draft_sections` (JSONB clone of template structure + manual overrides). Has unique constraint on `(project_id, user_id)`.
- **`invoices`** — Finalized, immutable invoice records with document numbers, status, grand total.
- **`invoice_line_items`** — Frozen snapshot of every evaluated row and charge value at finalization time.
- **`invoice_instances`** — Instances linking invoices to projects.

---

## 4. Token System

Tokens are string identifiers that serve as variables in formula expressions. All tokens are **globally unique per template**.

### 4.1 Token Types & Naming Convention

| Token Type | Format | Example | Value |
|---|---|---|---|
| Row base | `<ROW_TOKEN>` | `PORT_DUES` | Sum of all components (no charges) |
| Row total | `<ROW_TOKEN>_TOTAL` | `PORT_DUES_TOTAL` | base + all row charges |
| Component | `<ROW_TOKEN>_<LABEL>` | `PORT_DUES_ARRIVAL` | Individual line item value |
| Row charge | `<ROW_TOKEN>_<CHARGE_LABEL>` | `PORT_DUES_VAT_15` | Computed charge on a row |
| Section base | `SEC_<SECTION_TOKEN>_BASE` | `SEC_A_BASE` | Sum of all row bases in section |
| Section total | `SEC_<SECTION_TOKEN>_TOTAL` | `SEC_A_TOTAL` | Section base + row charges + section charges |
| Section charges sum | `SEC_<SECTION_TOKEN>_CHARGES` | `SEC_A_CHARGES` | Sum of section charges only |
| File field | `FILE_<FIELD_KEY_UPPER>` | `FILE_GRT` | Resolved from project custom field |
| Org config | `CAT_<CONFIG_KEY_UPPER>` | `CAT_PORT_TARIFF_RATE` | Resolved from org settings |
| Template constant | `<CONSTANT_TOKEN>` | `BASE_RATE` | Fixed value defined per template |

### 4.2 Formula Storage Format

Formulas stored in the database use `{{$row:UUID}}` reference format to decouple token names from database IDs:

```
DB stored:   "{{$row:abc123}} * 0.15"
Decoded:     "PORT_DUES * 0.15"
Evaluated:   "1000 * 0.15" → 150
```

The `token-resolver.service.ts` handles the decoding step.

### 4.3 Scope Restrictions

- **Row charges** may ONLY reference tokens belonging to their parent row (`rowToken`, component tokens). Cross-row references are a `CHARGE_SCOPE_VIOLATION` error.
- **Section charges** may only reference that section's aggregate tokens (`SEC_X_BASE`, `SEC_X_TOTAL`, `SEC_X_CHARGES`).
- **Rows** may reference any token that has been evaluated before them in topological order.

---

## 5. Formula Engine (`engine/`)

### 5.1 Architecture

The engine is a three-layer pipeline:

```
TokenResolver → DagValidator → AstEvaluator
     ↓               ↓              ↓
  Scope          Topological     BigNumber
 (external       ordering +     evaluation
 CAT/ORG/FILE    error detect   per section
  tokens)
```

**1. `token-resolver.service.ts`** — Builds `scope: Record<string, string>` (all values are BigNumber fixed(6) strings like `"4200.000000"`):
- **CAT_* tokens**: Zero-initializes ALL org expense categories, then overrides with actual SUM of `expenses.amount` per category for the given `projectId`. Categories with no expenses remain 0 (safe for formulas).
- **ORG_* tokens**: Fetches `organization_configs` WHERE `isFormulaInjectable=true`.
- **FILE_* tokens**: Resolves injectable header fields with priority: manual override > project direct column > `project.customFields[fileFieldKey]` > `defaultManualValue` > 0. Also injects ALL numeric project custom fields as three aliases: bare key, UPPERCASE key, and `FILE_<key>`.

**2. `dag-validator.service.ts`** — Uses mathjs (BigNumber mode, precision 20):
- Detects **duplicate tokens** across all rows/charges (validation aborts early on duplicates)
- Enforces **charge scope restriction (hard)**: row charges may ONLY reference `rowToken` and `rowToken_TOTAL`. Section charges may ONLY reference `SEC_<TOKEN>_BASE/TOTAL/CHARGES`.
- Returns a `topologicalOrder` array for safe evaluation sequencing.
- **`validateReorder()`**: Simulates a row move and re-runs full validation before applying drag-drop reorder.

**3. `ast-evaluator.service.ts`** — All values are BigNumber precision-20, serialized as fixed(6) strings:
- Evaluates in topological section/row order.
- Unknown tokens → zero-filled with `UNRESOLVED_REFERENCE` soft notice (non-blocking).
- Returns `EvaluatedSection[]` with `baseValue`, `chargesValue`, `totalValue` per row.

**4. `invoice-freeze.ts`** — 9-step atomic DB transaction:
1. Compute `grandTotal`, `totalBase`, `totalCharges` from provided `EvaluatedSection[]`
2. Insert `invoices` row with `status='draft'`, `documentNumber='PENDING'`
3. Generate final `documentNumber` (SELECT FOR UPDATE NOWAIT on reserved numbers)
4. Re-resolve token scope for audit trail (`resolveScope()` called again inside TX)
5. Write all `invoice_line_items` rows in display order
6. Fetch template name for `historicalFormat`
7. Update invoice to `status='frozen'`, set final `documentNumber`, `historicalFormat` (full EvaluatedSection[] JSONB snapshot), `resolvedScope`, `resolvedHeaderValues`, timestamps
8. Mark `invoice_reserved_numbers` as `isUsed=true`
9. Delete the `invoice_drafts` row for this `(projectId, userId)`

> **Critical:** Any failure causes a full rollback. No partial invoice state is possible.

> **Note on freeze trust:** `freezeInvoice()` trusts the `EvaluatedSection[]` sent from the frontend (produced by the preview endpoint). It does NOT re-run the formula engine. Scope is re-resolved purely for the audit trail snapshot.

### 5.2 Evaluation Order (Critical)

Within each row, the engine MUST follow this order:
1. Evaluate the row's base value (formula or manual)
2. **Register `rowToken` into the token dictionary** (e.g. `PORT_DUES = 0`)
3. Evaluate row charges (which may reference `PORT_DUES`)
4. Compute `rowToken_TOTAL = base + chargesSum`
5. Update `rowToken_TOTAL` in the token dictionary

> **Bug prevention note:** If row charges are evaluated before the base token is registered, charge formulas like `PORT_DUES * 0.15` will fail with a TOKEN_NOT_FOUND error and evaluate to `null`, displaying as `—` instead of `0`.

### 5.3 Engine Error Codes

| Code | Meaning |
|---|---|
| `TOKEN_NOT_FOUND` | A formula references a token that doesn't exist in the template |
| `CIRCULAR_DEPENDENCY` | Formula A references B which references A |
| `FORWARD_REFERENCE` | Row A references Row B which appears later in sort order |
| `UNRESOLVED_REFERENCE` | Token exists but had no value at eval time — zero-filled, soft warning only |
| `CHARGE_SCOPE_VIOLATION` | A row/section charge references a forbidden token |
| `DIVISION_BY_ZERO` | Formula results in division by zero |
| `EVALUATION_FAILED` | General evaluation error |
| `NEGATIVE_VALUE_NOT_ALLOWED` | Result is negative where not permitted |
| `INVALID_FORMULA_SYNTAX` | Formula cannot be parsed |
| `DUPLICATE_TOKEN` | Two rows/charges share the same token |
| `REORDER_VIOLATION` | Proposed reorder would create a forward reference |

---

## 6. API Routes

All routes are mounted under `/api` (see `invoices.route.ts` and `invoice-templates.route.ts`).

### 6.1 Template Management (`/api/invoice-templates`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/invoice-templates` | List all templates for org |
| `POST` | `/api/invoice-templates` | Create new template |
| `GET` | `/api/invoice-templates/:id` | Get template with sections/rows/charges |
| `PATCH` | `/api/invoice-templates/:id` | Update template metadata |
| `DELETE` | `/api/invoice-templates/:id` | Archive/delete template |
| `POST` | `/api/invoice-templates/:id/sections` | Add section |
| `PATCH` | `/api/invoice-templates/:id/sections/:sectionId` | Update section |
| `DELETE` | `/api/invoice-templates/:id/sections/:sectionId` | Delete section |
| `POST` | `/api/invoice-templates/:id/sections/:sectionId/rows` | Add row to section |
| `PATCH` | `/api/invoice-templates/:id/sections/:sectionId/rows/:rowId` | Update row |
| `DELETE` | `/api/invoice-templates/:id/sections/:sectionId/rows/:rowId` | Delete row |
| `POST` | `...rows/:rowId/charges` | Add row charge |
| `PATCH` | `...rows/:rowId/charges/:chargeId` | Update row charge |
| `DELETE` | `...rows/:rowId/charges/:chargeId` | Delete row charge |
| `POST` | `...sections/:sectionId/section-charges` | Add section charge |
| `PATCH` | `...sections/:sectionId/section-charges/:chargeId` | Update section charge |
| `DELETE` | `...sections/:sectionId/section-charges/:chargeId` | Delete section charge |
| `POST` | `/api/invoice-templates/:id/constants` | Add template constant |
| `POST` | `/api/invoice-templates/:id/header-fields` | Add header field |

### 6.2 Invoice Drafts (`/api/invoices/drafts`)

| Method | Path | Description |
|---|---|---|
| `PUT` | `/api/invoices/drafts` | Upsert draft for `{projectId, sourceTemplateId}` |
| `GET` | `/api/invoices/drafts/:id` | Get draft with resolved preview |
| `PATCH` | `/api/invoices/drafts/:id` | Save draft edits (draftSections, header overrides) |
| `DELETE` | `/api/invoices/drafts/:id` | Delete draft |

### 6.3 Invoice Engine (`/api/invoices/engine`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/invoices/engine/preview` | Live preview evaluation — returns `EvaluatedSection[]` + `grandTotal` |
| `POST` | `/api/invoices/engine/validate` | DAG validation only — returns errors without evaluating |

### 6.4 Finalized Invoices (`/api/invoices`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/invoices` | List finalized invoices |
| `GET` | `/api/invoices/:id` | Get invoice with line items |
| `POST` | `/api/invoices/generate` | Finalize draft → invoice (deletes draft) |
| `PATCH` | `/api/invoices/:id` | Update invoice status |

---

## 7. Permission Guards

| Action | Required Permission |
|---|---|
| View invoices list | `invoice:view` |
| Generate invoice / create draft | `invoice:create_draft` |
| View draft page | `invoice:view` |
| Fill manual rates & quantities | `invoice:fill_values` |
| Customize line item labels | `invoice:edit_line_labels` |
| Manage optional service items | `invoice:manage_optional_rows` |
| Author formulas in draft builder | `invoice:author_formulas` |
| Finalize invoice (Ready to Bill) | `invoice:finalize` |
| Revert invoice to draft | `invoice:revert` |
| Void invoice | `invoice:void` |
| Delete draft | `invoice:delete` |
| Manage templates | `template:edit` / `template:create` |

---

## 8. Key Implementation Rules & Invariants

1. **Template is immutable from draft editor.** All draft edits write to `invoice_drafts.draftSections` only. The master template rows/charges are never touched.
2. **One draft per user per project.** Enforced by unique constraint `(project_id, user_id)`. Generating a new draft for the same project overwrites (upserts) the existing one.
3. **Token names are frozen after creation.** `rowToken`, `sectionToken`, `componentToken`, `chargeToken` must never be renamed once created, as existing formulas reference them.
4. **Base token registered before charge evaluation.** `tokens[rowToken]` must be set before any row charge formula is evaluated (see Section 5.2).
5. **Tokens and labels are independent.** Updating a `chargeToken` must never overwrite the existing `label`. They are stored and modified separately.
6. **Always pass `projectId` to preview/engine calls.** The engine needs it to resolve `FILE_*` and `CAT_*` tokens.
7. **BigNumber precision.** All monetary values are stored and computed as `numeric(20, 6)` strings. Use `BigNumber` / the AST evaluator — never JavaScript `float` arithmetic.
8. **Draft deletion on finalization.** When an invoice is finalized, the `invoice_drafts` row must be deleted. The finalized `invoices` record is the permanent record.

---

## 9. Data Flow — File Fields → Invoice Tokens

```
project.name                    → FILE_NAME
project.status                  → FILE_STATUS
project.clientId → client.name  → display only (not injectable)
project.customFields.grt        → FILE_GRT  (if header field isFormulaInjectable = true)
project.customFields.nrt        → FILE_NRT
org_settings / org_configs      → CAT_<KEY>  (e.g. CAT_PORT_TARIFF_RATE)
template_constants              → <CONSTANT_TOKEN>  (e.g. BASE_RATE)
```

The `token-resolver.service.ts` (`resolveScope`) handles this full mapping and returns the combined `TokenMap` used by the AST evaluator.
