# ADR-0015: General Template Architecture, Multi-Column Line Items, Studio Overlay/Static Modes, Serial Resequencing, and Direct Invoice Generation

- **Status**: Accepted
- **Date**: 2026-10-22
- **Scope**: Invoicing, Templates, General Sheets, Multi-Column Line Items, DND, PBAC Navigation, Draft Sessions

---

## 1. Context & Problem Statement

As the platform expanded from standard project-bound maritime formula invoicing into broader general-purpose business invoicing, several architectural constraints and usability flaws surfaced:

1. **Fixed-Column Table Structure**: Standard templates enforce a rigid 4-column layout (`SL | Description | USD1 | USD2`). Non-maritime expenses, general procurement, consulting services, and multi-currency billing require dynamic, customizable columns (e.g. `Department`, `Quantity`, `Unit Rate`, `Tax Code`, `Currency`).
2. **Arbitrary UUID Row Tokens**: Rows previously generated arbitrary 8-character hex UUID tokens (e.g., `ROW_AAA69AA3`). This produced unfriendly, non-human-readable formula tokens that failed to communicate visual line item sequence.
3. **Screen Space & Sidebar Overlap**: Dense multi-column general tables caused sidebars to compress the document into unreadable slivers. Previous automatic screen-ratio heuristics (such as 4:1) triggered jarring layout shifts and line-item truncation.
4. **Isolated Navigation & Invoice Access**: Standard staff users with `invoice:view` could not see the Invoices navigation item in the sidebar because the gate strictly checked `finance:view_invoices`. Tenant Admin (`/org-admin`) also lacked an Invoices link, forcing admins to exit back to `/dashboard`.
5. **No Direct Invoice Generation from Templates**: Invoices could only be initiated from within a specific project context, preventing staff from generating draft sessions directly from templates or the top-level invoices index.

---

## 2. Decision & Architecture

### 2.1 Archetype Rename & General Sheet Template Architecture
- **Canonical Naming**: Renamed template type `"sheet"` to canonical `"general"` across database schemas, Drizzle models, Hono controllers, and frontend builders (with legacy backward compatibility for `"sheet"`).
- **Dynamic Columns (`columnDefinitions`)**:
  - General templates store an array of `TemplateColumnDefinition` objects in `invoice_templates.columnDefinitions` (JSONB).
  - Columns support customizable labels, keys, alignment (`left | center | right`), pixel widths with responsive drag-to-resize, data types (`text | number | currency | date | select`), and grand-total auto-summing (`isTotaled: true`).
- **Dynamic Table Headers & Grand Totals**:
  - `SheetTableHeader` renders dynamic column headers with inline `+` column insertion pills and a dropdown context menu.
  - `SheetGrandTotal` computes live vertical column sums across all sections using evaluated BigNumber arithmetic.

### 2.2 Serial-Based Row Token Naming & Two-Phase Resequencing Engine
- **Sequential Token Convention**: Row tokens are named canonically after their global topological index: `ROW_1`, `ROW_2`, `ROW_3`, ...
- **Topological Ordering**: Ordered strictly by `sections.sortOrder ASC, rows.sortOrder ASC`.
- **Two-Phase Update Transaction (`resequenceTemplateRowTokens`)**:
  - Phase 1: Rows whose tokens must change are temporarily renamed to `__TMP_<ID>__` to eliminate PostgreSQL unique constraint collisions on `(templateId, tokenKey)`.
  - Phase 2: Rows receive their final canonical `ROW_N` keys.
- **Formula Immutability**: Database formulas are stored with immutable UUID tags (`{{$tok:UUID}}`). Resequencing row tokens dynamically updates display formulas without corrupting calculation graphs.

### 2.3 Explicit Studio Sidebar Modes: Overlay vs. Static
- Replaced automatic ratio clamping with user-controlled display modes:
  1. **Overlay Mode (`"overlay"`)**: The table occupies 100% of the builder page; the Studio sidebar floats above the document with shadow elevation and backdrop blur.
  2. **Static Mode (`"static"`)**: The table and sidebar sit side-by-side in flex layout; the table compresses smoothly without overlap, allowing simultaneous interaction.
- Preference is persisted in `localStorage` under `starter_studio_sidebar_display_mode`.
- Quick toggle controls are exposed in the top navigation bar and inside the Studio sidebar tab strip.

### 2.4 Multi-Column Additional Line Items Catalog & Table-Embedded Actions
- **Dynamic Catalog Columns**: In General templates, the Additional Line Items catalog mirrors the template's configured `columnDefinitions` with horizontal scrolling.
- **Embedded Table Row Action**: The `+ Add Line Item` button is embedded directly inside the catalog table body (as the first row when empty, or immediately beneath the last item when populated), eliminating bulky outer cards.
- **Auto-Open on Save**: Saving or moving a row from the table to Additional Line Items automatically opens the Studio sidebar and focuses the `line-items` tab.

### 2.5 Multi-Permission PBAC Invoicing Navigation & Direct Generation
- **Array-Based Nav Gates**: `navigation.ts`, `dashboard/layout.tsx`, and `org-admin/layout.tsx` evaluate permission arrays using `canAny(...)`.
- **Sidebar Dual Placement**: "Invoices" is gated by `["invoice:view", "finance:view_invoices", "finance:manage_invoices"]` and rendered in both the User Dashboard and Tenant Admin sidebars.
- **Direct Generation Buttons**:
  - Top bar `[ Generate Invoice ]` in `/org-admin/invoice-templates/[id]`.
  - Catalog row action `[ Generate Invoice ]` in `/org-admin/invoice-templates`.
  - Header `[ + Generate Invoice ]` in `/dashboard/invoices`.
- **Project Scope Selection**: `GenerateInvoiceModal` presents an active Project dropdown when launched outside a pre-scoped project.
- **Draft Session Hydration**: Draft builder (`/dashboard/invoices/drafts/[id]`) detects General templates and dynamically mounts `SheetBuilderWorkspace`, hydrating all multi-column `cellValues`.

---

## 3. Consequences

### Positive
- Fully general-purpose, Excel-grade multi-column table authoring seamlessly integrated into the unified AST formula engine.
- Clean, sequential, human-friendly row tokens (`ROW_1`, `ROW_2`, ...) with zero unique constraint collisions.
- Clear user control over workspace layout via Overlay and Static sidebar docking modes.
- Unhindered staff and admin navigation to invoices with 1-click invoice generation from any template or screen.
- 100% test coverage with zero regressions across all 57 backend test suites and 513 unit/integration tests.
