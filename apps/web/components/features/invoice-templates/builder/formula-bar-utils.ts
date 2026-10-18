// ─── Formula Bar Pure Utilities ──────────────────────────────────────────────

/**
 * Convert the user-facing formula to storage format before saving:
 *  - `50%`  → `(50/100)`   percentage sugar
 *  - `//`   → `%`          modulo operator
 */
export function preprocessForSave(formula: string): string {
  return (
    formula
      // percentage: 50% → (50/100), 0.15% → (0.15/100)
      .replace(/(\d+(?:\.\d+)?)%/g, "($1/100)")
      // modulo: // → %
      .replace(/\/\//g, "%")
  );
}

/** Returns last contiguous `[A-Za-z0-9_]+` segment uppercased. */
export function getLastWord(str: string): string {
  const match = str.match(/[A-Za-z0-9_]+$/);
  return match ? match[0].toUpperCase() : "";
}

/** Returns true if the last word-like segment is purely numeric (digits / decimal). */
export function lastSegmentIsNumeric(str: string): boolean {
  const match = str.match(/[\w.]+$/);
  if (!match) return false;
  return /^[0-9.]+$/.test(match[0]);
}

/**
 * Given a string and a cursor position, returns the start/end indices of the
 * contiguous "chunk" (token, number, or operator block) closest to the cursor.
 */
export function getChunkAtCursor(
  str: string,
  cursor: number,
): { start: number; end: number; text: string } | null {
  if (str.length === 0) return null;
  cursor = Math.max(0, Math.min(cursor, str.length));

  const regex = /([A-Za-z0-9_.]+)|([+\-*/%()]+)/g;
  let match;
  let best = null;
  let minDistance = Infinity;

  while ((match = regex.exec(str)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    // If cursor is strictly inside or at boundaries
    if (cursor >= start && cursor <= end) {
      return { start, end, text: match[0] };
    }

    const dist = Math.min(Math.abs(cursor - start), Math.abs(cursor - end));
    if (dist < minDistance) {
      minDistance = dist;
      best = { start, end, text: match[0] };
    }
  }
  return best;
}

export const MATH_FUNCTIONS = ["MIN", "MAX", "ROUND", "CLAMP", "ABS"] as const;

/**
 * Returns true if the string is either a valid number, or it is a prefix of at least one valid token or math function.
 */
export function isValidTokenPrefix(str: string, allTokens: string[]): boolean {
  if (!str) return true; // empty is always valid prefix
  if (/^[0-9.]+$/.test(str)) return true;
  const upper = str.toUpperCase();
  return (
    allTokens.some((token) => token.startsWith(upper) || token.includes(`_${upper}`)) ||
    (MATH_FUNCTIONS as readonly string[]).some((fn) => fn.startsWith(upper))
  );
}

/**
 * Validates a formula string at save time.
 * Returns an error message string if invalid, or null if valid.
 *
 * Checks (in order):
 * 1. Ends with an operator or comma
 * 2. Unbalanced parentheses
 * 3. Incomplete / invalid tokens
 * 4. Adjacent values without an operator
 * 5. Consecutive operators
 */
export function validateFormulaSave(
  trimmed: string,
  fullTokenList: string[],
  currentToken?: string,
  invalidTokens?: Set<string>,
  hiddenTokens?: Set<string>,
): string | null {
  // 1. Ends with operator or comma
  if (/[-+*/%,]$/.test(trimmed) || trimmed.endsWith("//")) {
    return "Formula cannot end with an operator or comma.";
  }

  // 1.5. Circular dependency
  if (currentToken) {
    const tokensInFormula: string[] = trimmed.match(/[A-Z_][A-Z0-9_]*/g) ?? [];
    if (tokensInFormula.includes(currentToken)) {
      return `Circular reference: a formula cannot reference its own token "${currentToken}"`;
    }
    if (tokensInFormula.includes(`${currentToken}_TOTAL`)) {
      return `Circular reference: a formula cannot reference its own total "${currentToken}_TOTAL"`;
    }

    for (const token of tokensInFormula) {
      if ((MATH_FUNCTIONS as readonly string[]).includes(token)) continue;
      if (invalidTokens?.has(token)) {
        return `Circular reference: "${token}" depends on the current cell.`;
      }
      if (hiddenTokens?.has(token)) {
        return `Invalid token: "${token}" is hidden or not applicable here.`;
      }
    }
  }

  // 2. Unbalanced parentheses
  const openCount = (trimmed.match(/\(/g) || []).length;
  const closeCount = (trimmed.match(/\)/g) || []).length;
  if (openCount !== closeCount) {
    return `Mismatched parentheses: ${openCount} open, ${closeCount} closed.`;
  }

  // 3. Incomplete / invalid tokens (excluding registered math functions)
  const wordMatches = trimmed.match(/[A-Z][A-Z0-9_]*/g) || [];
  for (const word of wordMatches) {
    if ((MATH_FUNCTIONS as readonly string[]).includes(word)) {
      continue;
    }
    const isLegacy = word.startsWith("GBL_") || word.startsWith("FILE_") || word.endsWith("_TOTAL");
    const canonicalEquivalent = word.replace(/^(GBL_|FILE_)/, "").replace(/_TOTAL$/, "");
    if (
      !fullTokenList.includes(word) &&
      !(isLegacy && fullTokenList.includes(canonicalEquivalent))
    ) {
      return `Incomplete or invalid token: "${word}"`;
    }
  }

  // 4. Adjacent values without an operator
  //    Split on operators, commas, parentheses and check each segment
  const segments = trimmed.split(/\s*[+\-*/%(),]+\s*/);
  for (const seg of segments) {
    const items = seg.trim().split(/\s+/).filter(Boolean);
    if (items.length > 1) {
      return "Values must be separated by an operator (e.g. + or *).";
    }
  }

  // 5. Consecutive operators: detect two operator chars in a row (excluding `//`)
  //    Normalize `//` to a placeholder so it doesn't trigger a false positive
  const normalized = trimmed.replace(/\/\//g, "MODULO");
  // Match: operator, optional spaces, another operator
  if (/[+\-*/%]\s+[+\-*/%]/.test(normalized) || /[+\-*/%]\s*,/.test(normalized)) {
    return "Formula contains consecutive operators.";
  }

  return null;
}
