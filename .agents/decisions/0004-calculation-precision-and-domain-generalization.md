# ADR-0004: General-Purpose Domain Decoupling, Zero-Float Arithmetic, and Calculation Precision

- **Status**: Accepted
- **Date**: 2026-10-17
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Invoice Calculation Engine & Core Billing Domain Models

---

## Context & Problem Statement

The platform originated from a maritime port disbursement prototype. As the strategic objective shifted towards building a **universal, general-purpose agency management and invoice builder**, several architectural limitations were identified:

1. **Domain Coupling**: Schema models contained maritime-specific document types (`pda`, `fda`) and layout columns (`pdaPrefix`, `fdaPrefix`), causing cognitive friction and naming pollution.
2. **Token Namespace Ambiguity**: An earlier design injected duplicate bare tokens (`<KEY>`) alongside prefixed tokens (`FILE_<KEY>`), risking collision across custom fields, expense categories, and global constants.
3. **Floating-Point Imprecision**: Several paths converted monetary strings using JavaScript's native IEEE-754 `parseFloat()`, introducing sub-cent rounding drift on high-precision and multi-currency billing calculations.
4. **Fatal Formula Division by Zero**: Entering a formula with a zero divisor (e.g. `RATE / 0` or referencing an unpopulated cell) threw an unhandled domain error, terminating evaluation, crashing live previews, and rendering broken dashes (`—`).

---

## Decision

We executed a comprehensive modernization of the invoice engine across domain generalization, token scoping, and numeric precision:

### 1. Complete Removal of Legacy Maritime Backend Models
* **No Backward Compatibility Required**: Because the platform is in active development prior to production launch, all legacy maritime aliases and backward-compatibility shims were permanently removed.
* **Generalized Document Types**: `documentTypeEnum` in `packages/db` is streamlined strictly to universal agency types:
  ```typescript
  export const documentTypeEnum = pgEnum("document_type_enum", [
    "general",
    "standard",
    "retainer",
    "proforma",
    "credit_note",
  ]);
  ```
* **Generalized Layout Prefixes**: `invoicePdfLayouts` schema removed `pdaPrefix` and `fdaPrefix`, maintaining canonical prefixes: `generalPrefix`, `standardPrefix`, `proformaPrefix`, `retainerPrefix`, and `creditNotePrefix`.
* **Dynamic Custom Fields**: All domain-specific parameters (e.g., hours, retainers, units, milestones) are modeled dynamically via `custom_field_definitions` and `projects.customFields` (JSONB) without hardcoding industry columns in the core database.

### 2. Single Canonical Token Scoping
* All project custom fields and header fields resolve strictly to single canonical tokens: `FILE_<KEY_UPPER>`.
* Bare token aliases (`<KEY>`) were eliminated to prevent namespace collisions between project fields, expense categories (`EXP_<CAT>`), and organization constants (`GBL_<KEY>`).

### 3. Zero-Float String Ingestion (`parseToBN`)
* **Strict Rule**: JavaScript `number` and `parseFloat()` are completely banned for monetary values across the entire codebase.
* **Implementation**: All strings, numbers, and inputs are parsed directly into MathJS `BigNumber` (20-decimal precision) using `parseToBN(val: unknown)`:
  ```typescript
  export function parseToBN(val: unknown): math.BigNumber {
    if (val === null || val === undefined) return bigMath.bignumber(0);
    const str = String(val).trim();
    if (str === "" || str === "NaN" || str === "null" || str === "undefined") {
      return bigMath.bignumber(0);
    }
    if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(str)) {
      try {
        return bigMath.bignumber(str);
      } catch {
        return bigMath.bignumber(0);
      }
    }
    return bigMath.bignumber(0);
  }
  ```
* All 100% of `parseFloat` calls were eliminated from `token-resolver.service.ts`, `engine.controller.ts`, `invoice-freeze.ts`, and `text-interpolator.service.ts`.

### 4. Non-Fatal Division by Zero
* When evaluating formulas where division by zero occurs (e.g. `100 / 0` or `BASE / ZERO_RATE`):
  * The engine does NOT abort or throw a fatal error.
  * A diagnostic notice (`code: "DIVISION_BY_ZERO"`) is collected and attached to the evaluated row.
  * The cell value safely falls back to `"0.000000"`.
  * Downstream dependent formulas continue calculating without crashing section totals or grand totals.

### 5. Exact Commercial Rounding (`roundToCurrency`)
* Calculations maintain full arbitrary precision (up to 20 decimals internally, stored as `numeric(20, 6)`).
* Display formatting uses standard commercial `ROUND_HALF_UP` 2-decimal currency rounding:
  ```typescript
  export function roundToCurrency(val: BigNumber | string | number | null | undefined): string {
    if (val == null || val === "") return "0.00";
    try {
      const bn = typeof val === "object" && val !== null && "toFixed" in val
        ? (val as BigNumber)
        : math.bignumber(String(val));
      return bn.toFixed(2);
    } catch {
      return "0.00";
    }
  }
  ```

---

## Consequences

* **Positive**:
  * Complete domain freedom: The engine seamlessly powers creative agencies, legal firms, logistics providers, and software consulting without architectural changes.
  * Zero IEEE-754 floating-point drift across multi-tier rate, tax, and surcharge compounding.
  * Live invoice preview is resilient to intermediate or half-typed user formulas.
* **Negative**:
  * Mathematical operations must continue to be executed via `mathjs` BigNumber APIs (`math.add`, `math.multiply`) rather than native `+` / `*` operators.
