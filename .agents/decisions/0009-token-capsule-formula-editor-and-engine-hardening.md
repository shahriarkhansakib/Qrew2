# ADR-0009: Token Capsule Formula Editor, Quick Swap Menu, Autocomplete Layout, and DAG Engine Hardening

- **Status**: Accepted
- **Date**: 2026-10-18
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Formula Editor UX, Token Capsules, Autocomplete Display, Circular Dependency False Positives, Math Functions Extension, Comprehensive Engine Testing

---

## Context & Problem Statement

Template authors and billing architects interact extensively with the Invoice Template Builder (`/org-admin/invoice-templates/[id]`) and Draft Builder modes. Several user experience frictions, display ambiguities, and engine edge cases were identified during real-world workflow testing:

1. **Formula Authoring UX & Visual Clutter**:
   - The original formula bar relied on raw text input with keystroke gating and regex syntax overlays. Formulas with multiple tokens were difficult to scan visually.
   - Deleting or editing a token required tedious character-by-character backspacing.
   - Switching token variants (e.g., from `PORT_DUES_BASE` to `PORT_DUES_TOTAL` or `PORT_DUES_CHARGES`) required completely deleting and retyping the token.
2. **Outside-Click / Blur Collision on Header Fields**:
   - Clicking selectable project fields in the top `FileDetailsHeaderBox` triggered the formula bar's outside-click auto-save/clear behavior instead of inserting the token, because the input lost focus before the token click was handled.
3. **Inconsistent Token Pool Dropdown Behavior**:
   - The `EXP_TOTAL` category dropdown in the Token Pool required clicking the far right to expand/collapse, whereas section row tokens toggled via the left chevron.
4. **Circular Dependency False Positives on Row Charges**:
   - When editing row charges, the frontend dependency graph incorrectly flagged the parent row's base token (`<ROW>_BASE`) as a circular dependency, preventing authors from legitimately referencing the base row value.
5. **Autocomplete Value Visibility**:
   - Evaluated token values in the formula autocomplete dropdown were placed at the far right edge without contrast, causing values to be truncated or clipped when token names were long.
6. **Engine Test Coverage Gaps**:
   - The engine lacked standard integer rounding functions (`FLOOR`, `CEIL`) and did not possess a unified, end-to-end Vitest test suite validating all AST function types, operator sugar, and multi-node DAG cycle permutations.

---

## Decision

### 1. Token Capsule Formula Editor Architecture

* **Minimalist, Compact Aesthetic**:
  - Tokens within the formula bar render as interactive inline token capsules.
  - Designed with zero icons, zero borders, zero boundaries, and zero padding (`px-0 py-0`), ensuring a clean, modern, and uncluttered appearance without cartoonish elements.
  - Tokens display concise keys with tooltip hover showing the human-readable friendly label.
* **Smart Backspace**:
  - When backspacing immediately after an inserted token, the editor removes characters up to the preceding underscore (e.g., `_CHARGES` or `_TOTAL`), or removes the entire token atomically, accelerating editing speed.
* **Quick Swap Pill Menu**:
  - Clicking any active token capsule inside the formula bar pops open a lightweight inline Quick Swap popover.
  - Displays available sibling variants: `[ Base ]`, `[ Charges ]`, and `[ Total ]`.
  - Selecting a variant instantly mutates the formula token in place without requiring manual re-typing or re-opening the autocomplete dropdown.

### 2. Autocomplete Dropdown Value Visibility

* **Adjacent Colored Value Badges**:
  - Autocomplete dropdown widened to `w-88 sm:w-96 max-w-[calc(100vw-2rem)]`.
  - The evaluated numeric value is rendered immediately adjacent to the token name inside a compact badge (`font-mono text-[11px] font-semibold tabular-nums px-1 py-0.2 rounded shrink-0 bg-muted/40`).
  - The badge adopts the exact color family of the token category.
  - The token label is styled with `truncate shrink min-w-0`, guaranteeing that the evaluated value is `shrink-0` and never truncated or hidden regardless of name length.

### 3. File Header Selection Guard

* Elements in `FileDetailsHeaderBox` that inject tokens into the formula bar are marked with the `.insertable-token` CSS class and bind `onMouseDown={(e) => { if (isFormulaMode && isSelectable) e.preventDefault(); }}`.
* Prevents the formula input from blurring on mouse-down, eliminating unwanted outside-click auto-save triggers when users click to insert project tokens.

### 4. Standardized Token Pool Dropdown UX

* The `EXP_TOTAL` category tree in `expense-categories-section.tsx` is standardized to mirror `sections-tree.tsx`:
  - Clicking the section header row toggles accordion expansion.
  - The expansion chevron (`ChevronRight`) is positioned directly beside the `EXP_TOTAL` token chip on the left and rotates 90° when expanded.
  - Clicking the token chip itself independently selects the token for formula insertion without toggling accordion state.
  - The formatted total monetary value is aligned to the right.

### 5. Row Charge Cycle Isolation & Zero-Compounding Security

* **Root Cause Fix**:
  - In `builder-context.tsx` and `formula-evaluator.ts`, `ROW_BASE` is strictly exempted from BFS cycle detection seeds and row-expansion invalidations when `selectedCell.chargeId` is present.
* **Zero-Compounding Security Invariant**:
  - Row charges are rate-based or additive modifiers attached to a parent row.
  - Row charges may **ONLY** reference `<PARENT>_BASE` (e.g., `PORT_DUES_BASE * 15%`) or external constants (`FILE_*`, `GBL_*`).
  - Referencing the unqualified row total `<PARENT>` inside a row charge is strictly rejected with `CHARGE_SCOPE_VIOLATION` to prevent compounding loops.
  - Exposing `<rowToken>` as `<baseValue>` in `scope` prior to charge evaluation ensures correct evaluation without false-positive circular errors.

### 6. Math Engine Extension & Comprehensive Vitest Suite

* **Extended Math Primitives**:
  - Added `FLOOR(x)` and `CEIL(x)` to `MATH_FUNCTION_NAMES` across both frontend (`formula-evaluator.ts`, `dag-validator.service.ts`, `formula-validator.ts`) and backend (`ast-evaluator.service.ts`).
* **Comprehensive Test Suite**:
  - Authored `apps/api/src/features/invoices/engine/comprehensive-formula-engine.test.ts` (22 exhaustive tests) covering:
    - AST math functions (`MIN`, `MAX`, `ROUND`, `CLAMP`, `ABS`, `FLOOR`, `CEIL`) with BigNumber precision.
    - Operator syntax and sugar (`+`, `-`, `*`, `/`, `%`, `//`, `50%`, `15.5%`, nested parentheses).
    - Dynamic external project tokens (`FILE_*`, `GBL_*`, `EXP_*`, `EXP_TOTAL`).
    - Row charges, rate charges, and section totals.
    - Cross-row and cross-section references.
    - DAG cycle detection (self-reference, mutual cycles, chain cycles, cross-row charge violations, duplicate tokens).
    - Strict formula syntax validators.

---

## Consequences

### Positive
- **Streamlined Formula Authoring**: Authors can write, inspect, and mutate complex financial formulas with fewer clicks, zero accidental blurs, and immediate visual feedback.
- **Accurate Cycle Detection**: Authors can configure row charges against parent base rates without triggering false-positive circular dependency errors.
- **Zero Frontend Bundle Bloat**: `mathjs` remains strictly isolated on the backend Node.js server (`@starter/api`).
- **Exhaustive Test Confidence**: All 52 Vitest test files (454 tests) pass with 100% green status.
