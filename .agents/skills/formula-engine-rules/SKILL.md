---
name: formula-engine-rules
description: Strict guidelines and architectural rules for interacting with, modifying, or extending the Formula Engine and Invoice Builder.
---

# Formula Engine & Invoice Builder Rules

When working on the Invoice Builder or Formula Engine, you MUST adhere to the following rules to prevent hallucinated logic, UI bugs, or database corruption.

## 1. Row Architecture & UUID Tagging
- **Storage vs. Display:** Formulas are stored in the database using immutable unified token UUID tags: `{{$tok:UUID}}` (with `_BASE` and `_CHARGES` variants). Legacy tags (`{{$row:}}`, `{{$sec:}}`, `{{$tpl:}}`) are strictly purged.
- **Codec Usage:** All API endpoints MUST call \`decodeFormula\` before serving formulas to the client (converting UUID tags to human-readable tokens) and \`encodeFormula\` before writing to the database.
- **Why:** This ensures that renaming a row token never breaks existing formulas, as references are bound by UUID.

## 2. Token Evaluation Order
- **Base Before Charges:** Base row tokens (e.g., \`ROW3\`) MUST be exposed in the \`tokens\` dictionary BEFORE evaluating the row's charges (e.g., \`ROW3 * 1\`).
- **Why:** If charges are evaluated first, references to the base token return \`null\`, causing erroneous \`—\` fallback values instead of \`0\`.

## 3. Token vs. Label Independence
- Editing or updating a \`chargeToken\` must NEVER overwrite or auto-generate the charge's custom \`label\`. Tokens and labels are strictly decoupled.

## 4. Input & Validation (Formula Bar)
- **Allowed Keystrokes:** Only valid operators (\`+\`, \`-\`, \`*\`, \`/\`, \`//\`, \`%\`, \`(\`, \`)\`), numbers, decimals, and characters matching active tokens are accepted.
- **Syntactic Sugar:** \`50%\` must be translated to \`(50/100)\`. Modulo \`//\` translates to \`%\` in the backend.
- **Strict Spacing:** Literal spaces cannot be typed. Spaces exist only around operators (\` + \`).
- **Backend Validation:** The backend must return \`422 Unprocessable Entity\` for unbalanced parentheses, invalid syntax, or circular references (referencing its own cell token).

## 5. UI Rendering Rules
- **Hover Badges:** Formula badges expand towards the *left* on hover. If it exceeds \`max-w-xl\`, it wraps to multiple lines and extends downward (\`z-50\`). No external popovers.
- **Token Pool Sidebar:** Row dropdowns are closed by default unless they have charge line items.
- **Fuzzy Autocomplete:** Ignores underscores (e.g., \`lightc\` matches \`LIGHT_CHARGES\`). Self-references must be filtered out of suggestions.
