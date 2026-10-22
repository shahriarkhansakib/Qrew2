# ADR-0011: Workspace Zoom Isolation, Full-Cell Row Selection, Token-Only Creation, and Cross-Section DnD Architecture

- **Status**: Accepted
- **Date**: 2026-10-19
- **Scope**: Invoice Templates, Draft Builder, Additional Line Items, Layout, Drag-and-Drop (DND), PBAC

---

## 1. Context & Problem Statement

Following the initial release of the tabbed Additional Line Items studio (ADR-0010), several UX, layout, and DnD flaws emerged during user testing:

1. **Top Bar Zoom Leak**: When zoom controls (`+` / `-`) were toggled, the top navigation header bar (containing template title, description, zoom buttons, Preview, and Studio toggle buttons) scaled up and down. Only the workspace canvas document was intended to scale; the navigation bar and sidebars must remain fixed at 100% scale.
2. **Constrained Label Click Target**: The inline label edit mode in table rows was only triggered by clicking directly on the inner text string. Clicking anywhere else inside the label column cell (e.g. padding or whitespace) did not activate editing.
3. **Line Items Catalog Visual Discrepancy & Visual Clutter**:
   - The Additional Line Items panel did not align with the 4-column layout of table body rows (`[ Grip :: ] [ Token ] [ Label ] [ USD / Value ]`).
   - Action buttons (Stamp, Edit, Delete) were permanently visible, creating visual clutter.
   - The "New Item" button was pinned at the top rather than mirroring the main table's bottom `+ Add Row` bar.
4. **Over-Complicated Add Row Modal**: The `AddEditRowModal` exposed redundant calculation type dropdowns, manual labels, initial values, and descriptions, violating the streamlined token-first workflow where labels are deduced from tokens and formulas/rates are edited inline.
5. **Catalog Duplicate Collision**: Users could create duplicate entries with the exact same canonical token in the Additional Line Items catalog, creating formula ambiguities and DAG token conflicts.
6. **Cross-Section DnD Failure (Empty Section Droppable Deadlock)**:
   - Users could not drag rows between different sections, especially into empty sections.
   - In `@hello-pangea/dnd`, when a component returns `null`, the `<Droppable>` is unmounted and excluded from the registry. `TemplateRowList` had an early return `if (sortedRows.length === 0) return null;` which destroyed the droppable zone.
   - The top-level `onDragEnd` handler strictly checked `source.droppableId === destination.droppableId` for table rows, silently terminating cross-section moves, and the backend row update endpoint did not support transferring rows across section boundaries (`sectionId`).

---

## 2. Decision & Architecture

### 2.1 Workspace-Scoped Zoom Isolation (`page.tsx`)
- CSS `zoom: builderScale` and the CSS variable `--builder-scale: ${builderScale}` are removed from the root page container.
- Zoom styles are strictly isolated to the workspace canvas scroll container (`<div className="flex flex-col h-full bg-muted/20 overflow-y-auto...">`).
- The top navigation bar, bottom floating formula bar, and right Studio sidebar remain permanently locked at 100% native scale regardless of zoom level.

### 2.2 Full-Cell Click-to-Edit (`table-row.tsx`, `row-item.tsx`, `charge-item.tsx`)
- Table row components (`TableRow`, `SingleRow`, `RowChargeLine`) expose an `onClickLabel` handler bound to the entire cell container `<div onClick={onClickLabel}>`.
- Clicking anywhere within the cell column boundary (including whitespace and padding) activates inline editing mode.
- Action buttons and token chips invoke `e.stopPropagation()` to prevent unwanted inline edit activation when interacting with secondary actions.

### 2.3 4-Column Layout & Hover Actions for Additional Line Items (`additional-line-items-pool.tsx`)
- The Additional Line Items catalog matches the 4-column layout of the table body:
  1. **Grip (`::`)**: Drag-and-drop handle.
  2. **Token**: Canonical token badge with uppercase monospace styling and instance badge.
  3. **Row Label**: Full-cell inline editable label with derived placeholder.
  4. **USD / Rate**: Numeric rate or `fx` formula badge.
- Action buttons (`Plus` to stamp into active section, `Edit2` to edit token, `Trash2` to delete) are hidden by default and appear strictly on hover using `opacity-0 group-hover:opacity-100 transition-opacity`.
- The add button is moved from the top of the panel to the bottom as a full-width `+ Add Line Item` bar matching the table's `+ Add row` pattern.

### 2.4 Token-Only Modal & Automatic Label Derivation (`add-edit-row-modal.tsx`)
- The modal for adding rows (both table rows and catalog line items) is reverted to prompt *strictly* for the `Canonical Token *`.
- Redundant fields (display label, calculation type dropdown, formula string, initial value, description) are eradicated from the modal.
- The display label is automatically deduced from the token: `label = formatTokenToLabel(token)`.
- The calculation type defaults implicitly to `"normal"` with `formula: null` and `initialValue: null`, allowing the user to configure formulas or rates inline directly in the table.

### 2.5 Strict Backend & Frontend Duplicate Prevention
- **Backend Rejection**: `POST /api/invoices/templates/:id/optional-rows` verifies that `currentRows.some(r => r.rowToken === rowToken)`. If found, it returns `409 Conflict` with message `"An item with token ${rowToken} already exists in the catalog"`.
- **Frontend Validation**: `AddEditRowModal` inspects the catalog and active template rows, preventing submission and displaying inline errors if the token is already registered.
- **Drag Deduplication**: Moving a row from the table into the catalog checks if the token already exists, skipping duplicate addition gracefully.

### 2.6 Cross-Section Drag-and-Drop & Droppable Invariant (`row-list/index.tsx`, `update-row.controller.ts`, `page.tsx`)
- **Droppable Invariant**: `TemplateRowList` never returns `null` when `sortedRows.length === 0` in builder mode. It always renders an active `<Droppable>` container with an empty placeholder message (`min-h-[58px]`).
- **Backend Section Transfer**: The `updateRowSchema` and `update-row.controller.ts` accept `sectionId: z.string().min(1).optional()`, allowing rows to be moved across sections in PostgreSQL.
- **DND Orchestrator**: `page.tsx`'s `onDragEnd` supports Case 3B (`source.droppableId !== destination.droppableId` between sections):
  - Optimistically updates React Query state to immediately move the row from the source section to the target section.
  - Sends a `PATCH /api/invoices/templates/sections/:sectionId/rows/:rowId` with `{ sectionId: targetSectionId }`.
  - Re-orders target and source sections asynchronously to persist final sort orders.

---

## 3. Consequences

### Positive
- **Visual Stability**: Navigating and zooming large invoice templates no longer distorts the application header or studio sidebars.
- **Fluid Editing**: Users can click anywhere in label cells to edit labels without pixel-hunting tiny text spans.
- **Uncluttered Sidebar**: Hover-activated actions and standardized 4-column layout make the line items catalog clean and readable.
- **Flawless Cross-Section Organization**: Users can effortlessly drag rows between sections, including into newly created empty sections, with immediate optimistic UI response.
- **Data Integrity**: Duplicate tokens are strictly blocked at both frontend and database layers.

### Trade-offs & Mitigations
- Moving rows across sections requires an additional `PATCH` request for the `sectionId` change alongside standard order recalculation; handled seamlessly via optimistic cache updates.
