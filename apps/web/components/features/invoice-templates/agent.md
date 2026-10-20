# Invoice Templates — Frontend Agent Directives

**Location:** `apps/web/components/features/invoice-templates/agent.md`  
**Binding Architectural Contract for AI Agents**

---

## 1. Core Architecture & Component Hierarchy

The Template Builder (`/org-admin/invoice-templates/[id]`) is the design-time interface for configuring invoice calculation schemas.

```
components/features/invoice-templates/
├── builder/
│   ├── builder-context.tsx             # Central state: selectedCell, tokenMap, cell mutations
│   ├── template-builder-workspace.tsx  # Layout orchestrator: sticky formula bar, table header, sections
│   ├── template-formula-bar.tsx        # Sticky formula bar, keystroke gating, autocomplete, syntax overlay
│   ├── template-row-list.tsx           # Two-column USD layout, SingleRow, RowChargeLine, MobileRowActions
│   ├── template-section-card.tsx       # Section wrapper, section charges, SectionChargeLine
│   ├── template-token-pool.tsx         # Sidebar displaying available tokens and live evaluated values
│   ├── draft-value-filler.tsx          # Staff fill-time mode
│   └── invoice-table-preview.tsx       # Preview panel
```

---

## 2. Table Layout Conventions (`template-row-list.tsx`)

### Two-Column USD Layout
- **USD1 (Left Column)**:
  - Base values for rows (`row.valueType === 'formula'` or `'normal'`).
  - Charge values for row charge lines.
  - Clickable to activate the sticky formula bar for editing.
- **USD2 (Right Column)**:
  - Read-only group total (`rowBase + sum(rowCharges)`).
  - Displayed on single rows without charges, or on the final charge row of a row group.
- **Uneditable Cell Guidance**: Empty uneditable cells must display `"NOT EDITABLE"`; populated uneditable cells must carry `title="Not editable"`.

### Mobile Row Actions (`MobileRowActions`)
- Desktop actions hover outside the table border (`absolute left-full`).
- Mobile/small screens utilize `MobileRowActions`: a three-dot dropdown trigger (`MoreHorizontal`) embedded inline at the right side of the flexible `Label` column, preserving fixed column widths and preventing touch-screen clipping.

---

## 3. Formula Bar Directives (`template-formula-bar.tsx`)

### A. Layout & Placement
- The formula bar is rendered sticky at the top of the table builder (`sticky top-0 z-30`).
- Consists of:
  1. **Quick Operator Bar** (`+`, `-`, `*`, `/`, `(`, `)`, `%`, `//`) rendered directly above the formula row, plus a collapsible "Functions" drawer exposing AST math helpers (`CLAMP`, `MIN`, `MAX`, `ROUND`, `FLOOR`, `CEIL`, `ABS`).
  2. **fx Breadcrumb**: Shows the currently selected cell hierarchy (e.g. `Section > Row > Base`).
  3. **Monospace Input with Overlay**: Monospace transparent input placed over an aligned `SyntaxOverlay`.

### B. Keystroke Gating & Typing Rules
- **No Equals Sign (`=`)**: The formula bar starts directly with tokens, numbers, or parentheses.
- **Allowed Keystrokes**:
  - Operators: `+`, `-`, `*`, `/`, `%`, `//`, `(`, `)`.
  - Digits & Decimals: `0-9`, `.`.
  - Tokens & Functions: Letters and underscores matching active token prefixes or supported AST functions (`CLAMP`, `MIN`, `MAX`, `ROUND`, `FLOOR`, `CEIL`, `ABS`).
  - Function Invocations: Typing `(` directly following a recognized function name is permitted without requiring an operator (e.g. `CLAMP(`).
  - All letters are automatically capitalized (`UPPER_SNAKE_CASE`).
- **Strict Spacing Rules**:
  - Literal spaces CANNOT be manually typed or deleted.
  - Pressing `<Space>` converts to `_` if it forms a valid token prefix; otherwise, the keystroke is rejected.
  - Spaces exist strictly on both sides of binary operators (` + `, ` - `, ` * `, ` / `, ` // `) and nowhere else.
  - Backspace / Delete directly on a space character is blocked.
  - **Smart Backspace**: Deleting right after an operator block deletes the entire block (e.g., ` + `) atomically.
- **Parentheses Balance Guard**: Typing `)` is blocked if closing count would exceed currently opened `(` count.

### C. Syntax Overlay & Depth Color Coding
- Because standard HTML `<input>` elements cannot style individual characters, the formula bar uses a dual-layer approach:
  - Top: `<input className="text-transparent caret-violet-400 font-mono ...">`.
  - Bottom: `<SyntaxOverlay>` with identical typography and scroll synchronization (`overlayRef.current.scrollLeft = inputRef.current.scrollLeft`).
- Parentheses pairs are colorized based on nesting depth across 5 distinct colors (`text-pink-500`, `text-blue-500`, `text-emerald-500`, `text-amber-500`, `text-cyan-500`).

### D. Autocomplete & Fuzzy Search
- **Fuzzy Match (Underscore Tolerance)**: Searching ignores underscores (e.g., typing `lightcharges` or `lightc` matches `LIGHT_CHARGES`).
- **Selective Highlighting (`renderHighlightedToken`)**: Suggestion items in the dropdown highlight only the alphanumeric characters matching the search query; structural underscores in the token name are left un-highlighted.
- **Self-Reference Filter**: The autocomplete suggestions exclude the active row's token and its `<token>_TOTAL` variant to prevent accidental circular references.

### E. Save-Time Validations (`handleSave`)
Before saving on Enter, button click, or outside blur, `handleSave` strictly enforces:
1. **No Trailing Operators**: Cannot end with `+`, `-`, `*`, `/`, `%`, or `//`.
2. **Balanced Parentheses**: Total open `(` must equal total closed `)`.
3. **Complete Tokens**: Every word token must match an existing token in the template (blocks partial names like `LIGHT` if the token is `LIGHT_CHARGES`).
4. **Operator Separation**: Two tokens or numbers cannot appear consecutively without an operator separating them.
*On violation, the save is blocked, a Sonner toast displays the error, and the input is refocused.*

---

## 4. Syntactic Sugar Mappings

| Feature | User Input | Evaluated / Storage Format |
|---|---|---|
| Percentage | `50%` or `.5%` | `(50/100)` or `(0.5/100)` |
| Modulo / Remainder | `//` | `%` |
| Row Reference | `ROW_TOKEN` | Internal DB UUID `{{$tok:UUID}}` via codec |

---

## 5. Prebuilt Optional Services Catalog (`TemplateOptionalRowsModal`)

- **Location**: Master Template Builder header (`/org-admin/invoice-templates/:id`).
- **Trigger**: "Optional Services" button in the template header bar.
- **Functionality**:
  - Architects define reusable optional line items (`TemplateOptionalRow`) associated with the template.
  - Form fields: Token name (`CRANE_RENTAL`), display label (`Crane Rental / Operational Lift`), default rate/value (`numeric(20, 6)`), description/sub-description.
  - Saved to `invoice_templates.optional_rows` JSONB column.
  - Invoices generated or drafted from this template can browse, select, customize label/rate, and attach these services to any destination section.

---

## 6. Token Capsule Formula Editor Architecture (`formula-bar/`)

- **Component Hierarchy**:
  - `formula-bar/index.tsx`: Main formula input container, quick operator buttons, AST function drawer, and popover management.
  - `formula-bar/formula-capsule.tsx`: Individual token capsule badge rendered inline within the input flow.
- **Aesthetic Principles**:
  - **Minimalist & Modern**: Token capsules have zero icons, zero borders, zero boundaries, and zero padding (`px-0 py-0`). They do not use cartoonish tags or heavy cards.
  - **Dense Key Display**: Capsules display the concise uppercase token key (e.g., `PORT_DUES_BASE`), expanding to the user-friendly label on hover.
  - **Category Colors**: Styled using `getTokenColor(token)` across distinct harmonic semantic tints.
- **Quick Swap Pill Menu**:
  - Clicking any active token capsule opens an inline Quick Swap popover showing available sibling variants (`[ Base ]`, `[ Charges ]`, `[ Total ]`).
  - Selecting a variant immediately swaps the token in the formula string without requiring deletion or re-typing.
- **Smart Backspace**:
  - When the cursor is positioned directly after a token or with a token selected, pressing Backspace strips the token back to the preceding underscore (e.g. converting `_TOTAL` to the base token), or removes the token atomically if at the base word.
- **Autocomplete Dropdown Value Layout**:
  - Dropdown container width is set to `w-88 sm:w-96 max-w-[calc(100vw-2rem)]`.
  - Evaluated numeric values are rendered directly adjacent to the token name inside a badge (`font-mono text-[11px] font-semibold tabular-nums px-1 py-0.2 rounded shrink-0 bg-muted/40`).
  - Styled with the token's category color.
  - Token names use `truncate shrink min-w-0` to ensure that the value badge is strictly `shrink-0` and never truncated or clipped.

---

## 7. Token Pool UX & Insertion Invariants (`token-pool/`, `template-builder-workspace.tsx`)

- **Standardized Dropdown Accordions**:
  - Both `sections-tree.tsx` and `expense-categories-section.tsx` follow an identical interaction pattern:
    1. Clicking the header row toggles accordion expansion.
    2. An expansion chevron (`ChevronRight`) is positioned directly beside the main token chip on the left and rotates 90° when expanded.
    3. Clicking the token chip itself independently selects the token for formula insertion without toggling the accordion.
    4. Evaluated total values are right-aligned.
- **Top File Details Table Field Insertion**:
  - Selectable fields in `FileDetailsHeaderBox` that insert tokens on click MUST include `.insertable-token` and bind `onMouseDown={(e) => { if (isFormulaMode && isSelectable) e.preventDefault(); }}`.
  - This prevents `blur` events from triggering the formula bar's outside-click auto-save/deselect behavior before the click event can dispatch `insert-token`.

---

## 8. Additional Line Items Studio & Bidirectional Grab-and-Drag Architecture (`token-pool/`, `additional-line-items-pool.tsx`)

- **Adobe Illustrator-Type Panel Tab Strip**:
  - Docked in the right sidebar header (`TemplateTokenPool`).
  - Seamlessly toggles between `[ Token Pool ]` and `[ Additional Line Items (N) ]` with an active tab highlight, count badge, and clean borders.
- **Table-Body Matching Visual Rhythm**:
  - 4-column layout mimicking the main invoice table:
    1. Grip Handle (`GripVertical`) for grab-and-drag.
    2. Label & Token pill (`font-mono text-primary font-semibold`) with optional sub-description.
    3. USD / Rate column showing formatted rate or `fx` badge for formula-driven items.
    4. Action buttons: `+` Quick-add to table and `Trash` delete from catalog.
- **Bidirectional Drag-and-Drop (DND)**:
  - Drag from Additional Line Items pool into table sections (`additional-line-items` -> `rows-${sectionId}`) automatically handles unique token allocation (`TOKEN_2`, `TOKEN_3`) to avoid DAG collisions.
  - Drag from table section into Additional Line Items pool (`rows-${sectionId}` -> `additional-line-items`) saves the row structure/formula/value to the catalog and removes it from the table.
  - 1-click alternative: "Move to Line Items" button and context menu item in `RowActions` and `MobileRowActions`.
- **Shared DND Architecture**:
  - Prevents nested `DragDropContext` errors by wrapping workspace and sidebar in a unified top-level context while child components set `isSharedDnd: true`.

