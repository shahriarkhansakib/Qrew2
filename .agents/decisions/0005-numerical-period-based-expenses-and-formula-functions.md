# ADR-0005: Period-Aware Numerical Expense Resolution, AST Math Functions, and Formula Keystroke Gating

- **Status**: Accepted
- **Date**: 2026-10-17
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Invoice Calculation Engine, Expense Resolution, Formula Bar UX

---

## Context & Problem Statement

As the invoice engine evolved to support sophisticated billing workflows across consulting agencies, engineering firms, and logistics providers, three primary architectural challenges arose:

1. **Relational Row-Locking vs. Numerical Simplicity**:
   * An earlier proposal suggested tagging individual expense rows with a foreign key (`billedInInvoiceId`) to prevent duplicate billing.
   * However, mutating immutable expense logs introduced severe complications: database migration overhead, locking and race conditions during simultaneous draft edits, and an inability to model multiple competing draft scenarios or milestone/time-window billing (e.g. billing solely "March 2026 expenses").
2. **Missing Mathematical Functions in Invoicing Formulas**:
   * Real-world commercial fee structures frequently require non-linear constraints:
     * Minimum flat charges: e.g. `MAX(HOURLY_TOTAL * 0.15, 250)`
     * Fee caps / surcharges: e.g. `MIN(PERCENT_FEE, 1000)`
     * Value clamping: e.g. `CLAMP(ADJUSTED_FEE, MIN_FEE, MAX_FEE)`
     * Commercial rounding: e.g. `ROUND(EXP_DIRECT * 1.0825, 2)`
     * Absolute differences: e.g. `ABS(DEPOSIT - EXPENSES)`
   * The AST evaluator previously only parsed basic binary arithmetic (`+`, `-`, `*`, `/`, `//`, `%`).
3. **Formula Bar Keystroke Gating & Autocomplete Ergonomics**:
   * The template formula bar must prevent syntax errors before save-time.
   * Free-form typing risks corrupted formulas. Users must only be allowed to type valid token paths or function names.
   * A parenthesis `(` without an operator was previously forbidden, but functions require `FN(` directly.
   * Commas `,` must be strictly restricted to function argument lists and forbidden in standard binary expressions.
   * Users should not be forced to view raw database prefixes like `EXP_` or `FILE_` in table badges and tokens; these must be styled semantically by color.

---

## Decision

### 1. Pure Numerical, Period-Aware Expense Resolution
* **Immutable Append-Only Schema**: The `expenses` table remains strictly append-only. Zero relational row-locking columns (`billedInInvoiceId`) or database schema migrations are introduced.
* **Period-Filtered Aggregation**: In `token-resolver.service.ts`, `resolveScope` accepts optional `periodStart` and `periodEnd` timestamps (or auto-extracts them from invoice header fields such as `PERIOD_START`, `EXPENSE_PERIOD_START`).
* When aggregating `categorySums`, the query dynamically applies:
  ```typescript
  if (dStart) conditions.push(gte(expenses.createdAt, dStart));
  if (dEnd) conditions.push(lte(expenses.createdAt, dEnd));
  ```
* **Multi-Draft Flexibility**: Because expenses are resolved numerically rather than locked row-by-row, authorized users can create multiple competing drafts, test alternate markups, and calculate period-specific invoices (e.g., monthly retainers, quarterly true-ups) with zero database contention.

### 2. AST Math Functions Integration (`ast-evaluator.service.ts` & `formula-evaluator.ts`)
* **BigNumber Implementation**: The backend `ast-evaluator.service.ts` registers high-precision MathJS BigNumber implementations for all core financial functions:
  * `MIN(...args)`: Evaluates minimum of BigNumber operands.
  * `MAX(...args)`: Evaluates maximum of BigNumber operands.
  * `ROUND(val, decimals)`: Performs commercial half-up rounding to specified decimal places.
  * `CLAMP(val, min, max)`: Restricts a value to a closed interval `[min, max]`.
  * `ABS(val)`: Returns the absolute value of a BigNumber.
* **DAG Validator Exclusions**: `dag-validator.service.ts` and `formula-validator.ts` explicitly whitelist `MATH_FUNCTION_NAMES` (`["MIN", "MAX", "ROUND", "CLAMP", "ABS"]`) so function names are never misidentified as undefined tokens or circular row dependencies.
* **Client-Side Mirror**: `apps/web/lib/formula-evaluator.ts` implements identical logic using MathJS BigNumber evaluation, guaranteeing 100% parity between live client previews and frozen backend invoices.

### 3. Strict Formula Bar Keystroke Gating & UI Ergonomics
* **Keystroke Gating (`useFormulaKeyDown`)**:
  * Letter typing is validated against both active tokens and `MATH_FUNCTIONS`. Only valid prefix paths can be typed.
  * An open parenthesis `(` is allowed without an operator **only** immediately following a whitelisted math function name.
  * A comma `,` is permitted **only** inside a function call's parenthesis scope. Placing a comma in binary arithmetic or directly after operators is blocked with immediate toast feedback.
  * Smart Backspace deletes spaced operators atomically (` + `) and respects token/function prefixes.
* **Function-Aware Autocomplete & Insertion (`formula-bar/index.tsx`)**:
  * Selecting a function (e.g. `MAX`) from the autocomplete dropdown or operator bar automatically inserts `MAX(` with the cursor positioned directly inside the parentheses.
* **Collapsible Functions Toolbar (`formula-actions.tsx`)**:
  * Advanced math functions (`MIN(`, `MAX(`, `ROUND(`, `CLAMP(`, `ABS(`, `,`) are tucked neatly under a "Functions ▾" toggle above the formula bar to prevent visual clutter while ensuring one-click accessibility.
* **Semantic Token Color Decoupling**:
  * Token badges decouple raw database prefixes from the UI using semantic colors: Rose for expenses, Sky for file custom fields, Indigo for global constants, Blue for template constants, and Amber for math functions.

---

## Consequences

### Positive
* **Zero Database Migration Overhead**: Retaining append-only expenses eliminates complex data migrations, row-level locks, and rollback sagas.
* **Accurate Accounting Periods**: Organizations can easily bill specific calendar months or project milestones without modifying underlying expense records.
* **Financial Modeling Power**: Complex contracts (floors, ceilings, non-linear minimums) are natively computable in standard row formulas.
* **Foolproof Formula UX**: Users are prevented from typing syntactically invalid formulas at keystroke time, drastically reducing support tickets and calculation errors.

### Negative
* Formulas containing nested functions (e.g. `CLAMP(MAX(ROW1, 10), 5, 20)`) require balanced parentheses tracking across both frontend syntax overlays and backend AST parsers.
