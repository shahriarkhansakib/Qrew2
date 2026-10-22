# ADR-0013: Template Drift 3-Way Synchronization, Legacy Code & Token Purge, and Clean Baseline Database Rebuild

* **Status:** Accepted
* **Date:** 2026-10-20
* **Scope:** Invoice Templates, Drafts, Formula Codec, PBAC, Database Wipe & Baseline Seed

---

## Context & Problem Statement

Prior to this work, four architectural flaws and loopholes existed across the invoicing and template ecosystem:
1. **Formula UUID Orphan in `saveAsTemplate`**: When converting an invoice draft into a master template, formula strings containing draft-scoped UUID tags (`{{$tok:DRAFT_UUID}}`) were copied verbatim into the master template. Because new template entity IDs were minted, formula references became orphaned, corrupting calculations.
2. **Silent Master Template Drift & Lack of 3-Way Sync**: When a master template was edited (adding sections, renaming rows, modifying formulas), existing draft instances attached to that template had no notification or reconciliation mechanism, drifting silently.
3. **Dual-Engine Inconsistency & Permissive Draft Formulas**: Master templates enforced DAG cycle prevention and charge scope validation, but drafts lacked real-time DAG validation during inline cell edits, allowing drafts to introduce circular references or illegal compounding.
4. **Duplicate Token Namespace Prefixes**: Constants prefixed with `TPL_` were sometimes double-prefixed as `TPL_TPL_*` when published to the calculation scope.
5. **Legacy Token Remnants**: Legacy regexes and tags (`{{$row:UUID}}`, `{{$sec:UUID}}`, `{{$tpl:UUID}}`, and obsolete subcomponents) persisted across codec layers and tests.

---

## Architectural Decision

### 1. Two-Stage Formula Translation in `saveAsTemplate`
When saving a draft as a new master template or updating an existing template (`apps/api/src/features/invoices/drafts/drafts.controller.ts`):
* **Stage 1 (Decode to Bare Tokens)**: All draft formulas are decoded back to bare token names using the draft's current entity ID map (`decodeFormula`).
* **Stage 2 (Re-encode to Template UUIDs)**: Bare token formulas are re-encoded into unified `{${tok:NEW_TPL_UUID}}` storage tags using newly allocated template token IDs (`encodeFormula`).
* **Catalog Inheritance**: Any draft row marked `isOptional: true` is automatically extracted and appended to the new template's `optionalRows` catalog.

### 2. Versioned Template Drift & 3-Way Merge (`TemplateSyncModal`)
* **Version Bumping (`touchTemplate`)**: Any structural mutation on a master template (adding/updating/deleting rows, sections, constants) automatically increments `invoice_templates.version` and updates `updatedAt`.
* **Sync Status Inspection (`GET /api/invoices/drafts/:id/template-sync-status`)**: Compares `draft.sourceTemplateVersion` against current template version and reports additions, removals, and modifications.
* **Non-Destructive 3-Way Merge (`POST /api/invoices/drafts/:id/sync-template`)**:
  - Adds new template sections and rows without disturbing existing user edits.
  - Updates formulas and labels on unmodified rows.
  - Strictly preserves staff rate overrides, manual quantities, and custom row labels.
  - Logs the synchronization event directly into `draft.editHistory`.
* **UI Indicator**: Top bar renders a prominent amber `Sync vX Available` button that opens `TemplateSyncModal`.

### 3. Draft-Level DAG Cycle & Scope Gating
* Implemented `validateDraftDag(draft)` in `engine-utils.ts`, evaluating draft sections, rows, and charges topologically.
* Connected directly to `DraftBuilderController` endpoints (`updateRow`, `createRowCharge`, `updateRowCharge`, `createSectionCharge`, `updateSectionCharge`).
* Rejects self-references, circular loops, and compounding violations with `422 Unprocessable Entity` before changes are persisted to the database.

### 4. Zero-Legacy Unified Formula Architecture
* Eradicated all `{{$row:}}`, `{{$sec:}}`, and `{{$tpl:}}` regexes and fallback branches from `packages/db/src/formula-codec.ts` and `apps/web/lib/formula-evaluator.ts`.
* Standardized strictly on `{{$tok:UUID}}` with suffixes `_BASE` and `_CHARGES`. Bare `{{$tok:UUID}}` represents the full evaluated total.
* Purged lingering maritime legacy references (`pda`, `fda`) from tests, comments, and specs in favor of generic SaaS domain standards.

### 5. Automated Database Wipe & Pristine Rebuild Pipeline
* Created `packages/db/src/wipe-and-rebuild.ts` wired to `pnpm --filter @starter/db rebuild`.
* Drops schema with `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, pushes fresh tables via `drizzle-kit push --force`, re-applies token sync triggers (`0003_token_triggers.sql`), and seeds:
  - 89 PBAC permissions from `PERMISSIONS_CATALOG`.
  - Primary user account linked to Google OAuth.
  - Default workspace organization `org1` with Owner member record.
  - Standard agency invoice templates (*"Creative Agency Retainer & Pass-Through"* and *"Time & Materials Consulting"*).
  - Baseline client (*"Acme Global Enterprises"*) and 2 active projects (*"Q4 Marketing Strategy & Brand Evolution"*, *"Enterprise Architecture Modernization"*).

---

## Consequences & Impact

### Positive
* **Mathematical Integrity**: Saving drafts as templates never produces broken or orphaned formula UUID references.
* **Drift Visibility**: Team members collaborating on drafts are immediately informed when the architect updates master templates and can merge non-destructively.
* **Deterministic Calculations**: Circular dependencies and compounding errors are prevented in drafts identically to master templates.
* **Clean Codebase**: 0 legacy regexes, 0 dangling tokens, and 0 float arithmetic errors.
* **Instant Developer Setup**: The database can be wiped and re-seeded to a pristine state in seconds with `pnpm --filter @starter/db rebuild`.

### Tradeoffs & Guardrails
* Formula encoding requires a lookup map of all tokens in scope; endpoints must fetch token mappings before encoding or decoding formulas.
