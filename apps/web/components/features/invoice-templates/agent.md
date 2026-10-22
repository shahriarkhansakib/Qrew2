# Invoice Templates — Frontend Agent Directives

**Location:** `apps/web/components/features/invoice-templates/agent.md`  
**Binding Architectural Contract for AI Agents**

---

## 1. Core Architecture & Component Hierarchy

The Template Builder (`/org-admin/invoice-templates/[id]`) is the design-time interface for configuring invoice calculation schemas. It branches between standard project-bound formula templates and customizable general sheet templates.

```
components/features/invoice-templates/
├── builder/
│   ├── builder-context.tsx             # Central state: selectedCell, tokenMap, modes, columns
│   ├── template-builder-workspace.tsx  # Standard 4-column layout orchestrator
│   ├── sheet-builder/                  # General multi-column spreadsheet builder
│   │   ├── sheet-builder-workspace.tsx # Dynamic columns, table headers, grand totals
│   │   ├── sheet-table-header.tsx      # Interactive column resize handles, inline + pills
│   │   ├── sheet-table-row.tsx         # Multi-column dynamic data cells, inline editing
│   │   ├── sheet-section-card.tsx      # Section wrapper, centered + Add Row
│   │   ├── sheet-grand-total.tsx       # Live vertical grand-totals across sections
│   │   └── types.ts                    # TemplateColumnDefinition, column styling helpers
│   ├── formula-bar/                    # Sticky formula bar, token capsules, AST functions
│   ├── row-list/                       # Standard template table body & row actions
│   ├── token-pool/                     # Right studio: Token Pool & Additional Line Items
│   ├── template-settings-modal.tsx     # Unified presentation, indexing, and column config
│   └── add-header-field-modal.tsx      # Token-first file & sheet details metadata modal
```

---

## 2. Table Layout Conventions

### A. Standard Templates (`template-builder-workspace.tsx`, `template-row-list.tsx`)
- **Two-Column USD Layout**:
  - **USD1 (Left Column)**: Base values for rows (`normal` or `formula`) and row charges. Clickable to activate formula bar.
  - **USD2 (Right Column)**: Read-only group total (`rowBase + sum(rowCharges)`).
- **Serial Resequencing**: Rows are canonically named `ROW_1`, `ROW_2`, `ROW_3`, ...
- **Token Badge Overlap**: Leftward expandable formula badges on hover (`absolute right-0 top-1`).

### B. General Templates (`sheet-builder/sheet-builder-workspace.tsx`)
- **Dynamic Columns (`columns: TemplateColumnDefinition[]`)**:
  - Arbitrary user-defined columns: text, number, currency, date, single-select.
  - Column drag-to-resize divider handles with live pixel width updates.
  - Inline `+` insertion pills between column headers.
  - Context menu on column header: Edit Column, Insert Left, Insert Right, Delete Column.
- **Vertical Grand Totals (`SheetGrandTotal`)**: Automatically computes evaluated column sums across all sections for columns marked `isTotaled: true`.
- **Sheet Details Metadata (`FileDetailsHeaderBox` with `isSheetMode: true`)**: Custom metadata (Department, Period, Prepared By, Notes) with inline editing and drag-to-reorder.

---

## 3. Explicit Studio Sidebar Modes: Overlay vs. Static

- Builders provide two user-selectable display modes:
  1. **Overlay Mode (`"overlay"`)**:
     - The table occupies 100% of the builder page width (`w-full flex-1 min-w-0`).
     - The Studio sidebar floats over the right side with shadow elevation (`absolute inset-y-0 right-0 z-40 shadow-2xl bg-background/98 backdrop-blur-md`).
     - Clicking the translucent backdrop closes the panel.
  2. **Static Mode (`"static"`)**:
     - The table and sidebar sit side-by-side in flex layout (`relative shrink-0 shadow-none`).
     - The table compresses smoothly without overlap, keeping both panels simultaneously interactive with zero backdrop.
- User preference is persisted in `localStorage` under `starter_studio_sidebar_display_mode`.
- Toggles are accessible both in the top bar (beside the Studio button) and inside the Studio sidebar tab strip.

---

## 4. Additional Line Items Catalog & Table-Embedded Actions

- **Dynamic Columns in General Mode**: The Additional Line Items catalog mirrors the template's configured `columnDefinitions` with horizontal scrolling (`overflow-x-auto min-w-full`).
- **Embedded Table Body Action**: The `+ Add Line Item` action is embedded directly inside the catalog table body:
  - If empty: rendered on the first row directly beneath column headers.
  - If populated: rendered immediately below the last line item row.
- **Auto-Open on Save**: Moving or copying a row from the table to Additional Line Items automatically opens the Studio sidebar and focuses the `line-items` tab (`openAdditionalLineItemsPanel()`).
- **Formula Bar Integration**: Clicking the rate cell in catalog items opens the formula bar with `isCatalogItem: true` and automatically switches the active sidebar tab to `tokens` for easy insertion.

---

## 5. Token Capsule Formula Editor (`formula-bar/`)

- **Token Capsules (`formula-capsule.tsx`)**: Zero padding, borderless capsules with concise keys, expanding to labels on hover.
- **Quick Swap Pill Menu**: 1-click variant switching (`[ Base ]`, `[ Charges ]`, `[ Total ]`) without retyping.
- **Hierarchical Smart Backspace**: Deleting backward through a token strips segment-by-segment back to the previous underscore (`_`).
- **AST Functions Tray**: Collapsible tray exposing `CLAMP`, `MIN`, `MAX`, `ROUND`, `FLOOR`, `CEIL`, `ABS`. Function calls allow `(` immediately after the function name without requiring binary operator spaces.
- **Autocomplete Value Highlighting**: Live evaluated values render directly adjacent to token suggestions with `shrink-0`, ensuring long token names truncate cleanly without ever hiding values.

---

## 6. Direct Invoice Generation & Navigation PBAC

- **Top Bar Generation**: `/org-admin/invoice-templates/[id]` top navigation includes a prominent **`[ Generate Invoice ]`** button beside *Preview Template*.
- **Template Catalog Row Actions**: Every template in `/org-admin/invoice-templates` includes a 1-click **`[ Generate Invoice ]`** button.
- **Draft Workspace Routing**: When opening `/dashboard/invoices/drafts/[id]`, the page detects if the source template is `general` or has custom columns, automatically mounting `SheetBuilderWorkspace` and hydrating all `cellValues`.
