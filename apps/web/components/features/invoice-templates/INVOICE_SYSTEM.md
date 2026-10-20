# Invoice System — Frontend Architecture & Feature Reference

> **Purpose:** This document is the authoritative reference for the invoice system frontend. Read it before making any invoice-related UI changes. It prevents hallucination by providing ground-truth component hierarchy, state patterns, UX flows, and critical rules.
>
> **Last Updated:** 2026-08-08  
> **Status:** Living Document — update on every structural change

---

## 1. System Overview

The invoice frontend has two distinct editing surfaces:

| Surface | Path | Mode |
|---|---|---|
| **Template Builder** | `/org-admin/invoice-templates/[id]` | Admin design-time. Edits the master template structure. |
| **Invoice Draft Editor** | `/dashboard/invoices/drafts/[id]` | Staff fill-time. Edits only the draft's JSONB copy. Never touches master template. |

---

## 2. Directory Structure

```
apps/web/
├── app/(app)/
│   ├── org-admin/invoice-templates/
│   │   ├── page.tsx                        # Template list page
│   │   └── [id]/page.tsx                   # Template builder page (admin)
│   └── dashboard/invoices/
│       ├── page.tsx                        # Finalized invoices list
│       ├── [id]/page.tsx                   # Finalized invoice view
│       └── drafts/[id]/page.tsx            # Invoice draft editor page
│
└── components/features/
    ├── invoice-templates/
    │   ├── invoice-templates-data-table.tsx    # Template list table
    │   ├── add-invoice-template-modal.tsx      # Create new template modal
    │   └── builder/                            # All template builder components
    │       ├── builder-context.tsx             # Shared context/state for builder
    │       ├── template-builder-workspace.tsx  # Root builder layout + panel orchestrator
    │       ├── template-formula-bar.tsx        # Formula editor bar (fx bar)
    │       ├── template-row-list.tsx           # Row/charge table rendering
    │       ├── template-section-card.tsx       # Section wrapper + section charges
    │       ├── template-token-pool.tsx         # Sidebar: all available tokens
    │       ├── template-live-preview.tsx       # Live rendered invoice preview
    │       ├── draft-value-filler.tsx          # Draft mode: staff value entry form
    │       ├── invoice-table-preview.tsx       # Table-format invoice preview
    │       ├── template-preview-modal.tsx      # Full-screen preview modal
    │       ├── token-injector.tsx              # Utility: inserts token into formula bar
    │       ├── add-edit-row-modal.tsx          # Add / edit a row
    │       ├── add-row-charge-modal.tsx        # Add row charge modal
    │       ├── add-edit-section-charge-modal.tsx  # Add / edit section charge
    │       ├── add-edit-template-constant-modal.tsx # Add / edit template constant
    │       ├── add-header-field-modal.tsx      # Add header field
    │       └── add-section-modal.tsx           # Add section modal
    │
    └── invoices/
        ├── generate-invoice-modal.tsx          # Select template + generate draft
        └── shared/invoice-api.ts              # Shared API call helpers
```

---

## 3. Builder Context (`builder-context.tsx`)

The `BuilderContext` is the single shared state provider for the entire template builder. All builder sub-components consume it via `useBuilderContext()`.

### Key State Properties

| Property | Type | Purpose |
|---|---|---|
| `templateId` | string | Current template ID |
| `mode` | `"build"` \| `"fill"` \| `"draft"` | Controls which UI elements are shown (see Section 5) |
| `selectedCell` | `CellAddress \| null` | The currently active formula cell. When non-null, the formula bar appears. |
| `tokenPoolOpen` | boolean | Whether the token sidebar is expanded |
| `apiBasePath` | string | Base path for all API calls |
| `invalidateKey` | string[] | React Query key to invalidate on mutations |

### Key Helper Functions

| Function | Returns | Notes |
|---|---|---|
| `cellFromRow(...)` | `CellAddress` | Creates a cell address for a row's value cell |
| `cellFromRowCharge(...)` | `CellAddress` | Creates a cell address for a row charge's formula |
| `cellFromSectionCharge(...)` | `CellAddress` | Creates a cell address for a section charge's formula |

### CellAddress Shape

```ts
{
  templateId: string;
  sectionId: string;
  rowId?: string;
  chargeId?: string;
  rowToken: string;         // used by formula bar to display token label
  decodedFormula: string;   // current formula, human-readable
  sectionToken?: string;
}
```

---

## 4. Component Hierarchy

```
template-builder-workspace.tsx          ← Root: fetches template data, owns layout
├── [Left Panel] template-token-pool.tsx
│       ← Lists all tokens in the template, grouped by section/row
│       ← In formula mode: clicking a token inserts it into the formula bar
│       ← In normal mode: clicking a token copies it to clipboard
│
├── [Center] template-section-card.tsx (one per section)
│   ├── SectionHeader                   ← Section name, reorder buttons
│   ├── template-row-list.tsx           ← Rows + row charges table
│   │   ├── SingleRow                   ← One row (with TableRow renderer)
│   │   │   ├── TableRow               ← Layout: Token | SL | Label | USD1 | USD2
│   │   │   └── RowChargeLine (×N)     ← One row charge line
│   │   └── DragDropContext            ← Row reordering via @hello-pangea/dnd
│   └── SectionChargeLine (×N)         ← Section charges (below rows)
│
├── [Top] template-formula-bar.tsx      ← Shown when selectedCell is set
│       ← Editable formula input with token insertion support
│       ← Shows resolved formula with token decode + formula preview
│
└── [Right Panel] template-live-preview.tsx  ← Real-time rendered invoice preview
```

---

## 5. Builder Modes

The `mode` prop controls which editing controls are visible:

| Mode | Who uses it | Controls shown |
|---|---|---|
| `"build"` | Admin designing the template | All controls: Add Row, Add Section, Add Charge, formula bar, reorder handles, delete buttons |
| `"fill"` | Staff filling in a draft | Only value input fields. No structural editing. Formula bar hidden. No add/delete buttons. |
| `"draft"` | Draft edit mode | Same as `build` but targets `draftSections` JSONB, not the master template |

> **Note:** Draft page starts in View Mode (read-only). Edit Mode (`"draft"`) is entered only when the user explicitly clicks "Edit Draft". This is controlled by a React state boolean on the draft page, not URL params.

---

## 6. TableRow — Two-Column USD Layout

The `TableRow` component is the core table row renderer used for all rows and charges.

### Column Layout

```
[TOKEN — absolute, outside left border] | SL (w-10) | Label (flex-1) | USD1 (w-20) | USD2 (w-20)
```

- **Token column**: Positioned absolutely to the left of the table border. Clickable — in formula mode inserts token into formula bar; in normal mode copies to clipboard. Expands on hover to show full token text.
- **SL column**: Serial number. Auto-incremented, skipped for charge rows.
- **Label column**: Inline-editable for row labels and charge labels. Clicking activates an `<input>` in-place.
- **USD1 (left value column)**:
  - For rows **with charges**: shows the row's **base value**. Clickable → opens formula bar.
  - For rows **without charges**: this column is empty/`Not editable`.
  - For **charge rows**: shows the **charge's own computed value**. Clickable → opens formula bar.
- **USD2 (right value column)**:
  - For rows **without charges**: shows the row's **total value**. Read-only.
  - For rows **with charges**: shown only on the **last charge row** of that group, showing the row's `base + all charges` total. Read-only.
  - For other charge rows: empty.

### Uneditable Cell Guidance

- If a USD cell has no value and is not editable: renders `NOT EDITABLE` placeholder (muted, small-caps text).
- If a USD cell has a value but is not editable: renders value + `title="Not editable"` HTML tooltip.

---

## 7. Formula Bar (`template-formula-bar.tsx`)

The formula bar appears at the top of the workspace whenever `selectedCell` is non-null in `BuilderContext`.

### Key Features

- **Token Label Display**: Shows the human-readable token name of the selected cell.
- **Formula Input**: An `<input>` field where the user types or pastes a formula. Tokens can be inserted by clicking in the token pool sidebar.
- **Token Decode Preview**: Shows the formula with `{{$tok:UUID}}` references decoded to their human-readable token names.
- **Live Computed Preview**: Shows the formula's current evaluated result.
- **Token Insertion**: Subscribes to the global `insert-token` custom DOM event. When the token pool fires this event, the token is inserted at the cursor position.
- **Save on blur / Enter**: On blur or Enter key, the formula is saved via PATCH to the appropriate row/charge endpoint.
- **Escape to cancel**: Reverts to the previously saved formula.

### Formula Storage Format

Formulas are saved to the DB in `{{$tok:UUID}}` format:
```
Display:   "PORT_DUES * 0.15"
Stored:    "{{$tok:abc-123-uuid}} * 0.15"
```

The `decodeFormula` function in `formula-evaluator.ts` converts UUIDs back to token names for display.

---

## 8. Token Pool (`template-token-pool.tsx`)

The right sidebar that lists all tokens available in the current template.

### Behavior by Mode

- **Normal mode**: Clicking a token copies it to clipboard (`navigator.clipboard.writeText`). A toast confirms the copy.
- **Formula mode** (when `selectedCell` is set): Clicking a token fires the `insert-token` custom DOM event, causing the formula bar to insert the token at the current cursor position.

### Token Groupings

Tokens are grouped by:
1. Template constants (`CAT_*`, user-defined constants)
2. File/org fields (`FILE_*`, `CAT_*` from org configs)
3. Per section:
   - Section aggregate tokens (`SEC_X_BASE`, `SEC_X_TOTAL`, `SEC_X_CHARGES`)
   - Per row: row token, component tokens, row charge tokens

---

## 9. Formula Evaluator (`lib/formula-evaluator.ts`)

The **client-side** formula evaluator mirrors the backend engine for live preview in the builder UI. It is NOT used for final invoice generation — that uses the backend AST evaluator with BigNumber precision.

### Key Functions

```ts
// Build token map from template sections (client-side preview only)
buildTokenMap(sections: any[], orgConfigs?: any[], templateConstants?: any[]): TokenMap

// Evaluate a single formula expression against a token map
evaluateFormula(formula: string, tokens: TokenMap): number | null

// Decode {{$tok:UUID}} references to human-readable token names
decodeFormula(formula: string, allSections: any[]): string

// Format a number for display (2dp if fractional, integer otherwise, "—" if null/Infinity)
fmt(val: number | null | undefined): string
```

### Token Evaluation Order (Critical — do not change)

Within `buildTokenMap`, each row is evaluated in this order:

1. Compute `rowBase` (formula or `initialValue`)
2. **Register `tokens[rowToken] = rowBase`** — MUST happen before charge evaluation
3. Register `tokens[rowToken + '_TOTAL'] = rowBase` (preliminary)
4. Evaluate row charges in order; each charge can reference `rowToken`
5. Compute `rowChargesSum`
6. Update `tokens[rowToken + '_TOTAL'] = rowBase + rowChargesSum`

> **Bug prevention:** If step 2 is skipped or moved after step 4, charge formulas like `PORT_DUES * 1` will get `null` (token not found) and display `—` instead of `0`.

---

## 10. Draft Value Filler (`draft-value-filler.tsx`)

Used on the invoice draft page in `"fill"` mode. Renders a form where staff enter actual values for `normal`-type rows.

- Reads `draftSections` from the draft record
- For each `normal`-type row, renders a numeric input
- `formula`-type rows show their computed value (read-only)
- On save, sends `PATCH /api/invoices/drafts/:id` with updated `draftSections` JSONB

---

## 11. Invoice Generation Flow (Frontend)

```
1. User opens File Details Modal (project-details-modal.tsx)
2. Clicks "Generate Invoice" button
3. GenerateInvoiceModal opens → user selects a template
4. Frontend calls: PUT /api/invoices/drafts { projectId, sourceTemplateId }
5. Backend upserts draft, returns { id: draftId }
6. Frontend navigates to: /dashboard/invoices/drafts/[draftId]

Draft Page:
7. Page loads in VIEW MODE (read-only rendered preview)
8. User clicks "Edit Draft" → switches to EDIT MODE (mode = "draft")
9. User edits values, formulas, adds rows to the draft copy
10. Saves are sent to PATCH /api/invoices/drafts/:id (draftSections JSONB only)
11. User clicks "Finalize Invoice"
12. Frontend calls: POST /api/invoices/generate { draftId }
13. Backend freezes invoice → deletes draft → returns invoiceId
14. Frontend navigates to /dashboard/invoices
```

---

## 12. Key Rules & Invariants (Frontend)

1. **Never PATCH master template from the draft editor.** All draft edits call draft-scoped endpoints. Template endpoints (`/api/invoice-templates/...`) are only called from the admin template builder.
2. **Tokens and labels are decoupled.** Changing a `chargeToken` must never overwrite the existing `label`. These are stored in separate fields and modified independently. The add/edit charge modals must preserve the existing label on token-only edits.
3. **Uneditable cells show feedback.** Any `USD1` or `USD2` cell that cannot be clicked must display `NOT EDITABLE` if empty, and have `title="Not editable"` if populated.
4. **Token hover reveals full text.** The token column uses a hover-expand pattern (`hover:w-auto`) so long tokens are not permanently truncated. Do not remove this.
5. **`selectedCell` controls formula bar visibility.** Setting `selectedCell = null` closes the formula bar and saves the formula. Never hide the formula bar by other means.
6. **Section charge labels are inline-editable.** The `SectionChargeLabelCell` component in `template-section-card.tsx` handles in-place editing — do not replace with a static `<span>`.
7. **`buildTokenMap` order is strict.** See Section 9. Never change the evaluation order without updating both the client evaluator and backend engine.
8. **Draft page default is View Mode.** Edit Mode (`isEditMode: true`) requires explicit user action. Never auto-enter edit mode on page load.
