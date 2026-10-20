# Template Rows Submodule

**Location:** `apps/api/src/features/invoice-templates/rows/agent.md`  
**Binding Architectural Contract for AI Agents**

---

## 1. Responsibilities
- Manages template parent rows (`template_rows`) and row charges (`template_row_charges`).
- Implements single-value row architecture (direct `valueType`, `formula`, `initialValue` on parent rows; sub-components are obsolete).
- Enforces UUID formula codec (`encodeFormula` before writing, `decodeFormula` before responding).

## 2. Invariants & Rules
1. **Formula Storage Format**: Rows and row charges store formulas in database using `{{$tok:UUID}}` references. Never store raw token names in DB formulas.
2. **Base Token Publishing**: The row's token (`rowToken`) represents its base value. Derived total token is `<rowToken>_TOTAL` (base + sum of row charges).
3. **Circular Reference Prevention**: A row or row charge cannot reference its own token or its `_TOTAL` variant (enforced via `validateFormulaChars`).
4. **Token/Label Independence**: Updating `rowToken` or `chargeToken` must NEVER overwrite or mutate `parentLabel` or `label`.
5. **PBAC**: Requires `finance:manage_invoices` for write operations, `finance:view_invoices` for reading.

## 3. Files
- `template-rows.controller.ts`: Row CRUD, orderIndex management, formula/initialValue mutations.
- `template-rows.test.ts`: Test coverage for row operations and formula encoding/decoding.
- `template-row-charges.controller.ts`: Row charge CRUD, sortOrder, charge formula validation.
- `template-row-charges.test.ts`: Test coverage for row charge calculations and token derivation.
