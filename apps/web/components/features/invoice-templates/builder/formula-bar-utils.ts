import { normalizeFormulaSpacing } from "@starter/db/formula-codec";

export { normalizeFormulaSpacing };

/**
 * Convert the user-facing formula to storage format before saving:
 *  - normalizes canonical spacing
 *  - `50%`  → `(50/100)`   percentage sugar
 *  - `//`   → `%`          modulo operator
 */
export function preprocessForSave(formula: string): string {
  const normalized = normalizeFormulaSpacing(formula);
  return (
    normalized
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

export const MATH_FUNCTIONS = ["MIN", "MAX", "ROUND", "CLAMP", "ABS", "FLOOR", "CEIL"] as const;

export interface TokenVariantSibling {
  key: string;
  label: string;
  isCurrent: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface TokenMetadata {
  token: string;
  friendlyLabel: string;
  categoryLabel: string;
  evaluatedValue: number | null;
  siblings: TokenVariantSibling[];
}

/**
 * Resolves human-friendly label, category, live evaluated value, and sibling variants
 * ([ Base ], [ Charges ], [ Total ]) for any token in the formula editor.
 */
export function resolveTokenMetadata({
  token,
  sections = [],
  templateConstants = [],
  externalTokens,
  tokenMap = {},
  selectedCell,
}: {
  token: string;
  sections?: any[];
  templateConstants?: any[];
  externalTokens?: {
    global: Set<string>;
    template: Set<string>;
    file: Set<string>;
    category: Set<string>;
  };
  tokenMap?: Record<string, number>;
  selectedCell?: { token?: string } | null;
}): TokenMetadata {
  const currentCellToken = selectedCell?.token;
  const currentCellRoot = currentCellToken?.replace(/_(BASE|TOTAL|CHARGES)$/, "");
  const isRowCharge = Boolean(
    selectedCell && ("chargeId" in selectedCell ? (selectedCell as any).chargeId : false),
  );

  const isSelfReference = (targetToken: string) => {
    if (!currentCellToken) return false;
    if (targetToken === currentCellToken || targetToken === `${currentCellToken}_TOTAL`)
      return true;
    if (isRowCharge) {
      // Row charges cannot reference their own charge token, but CAN reference parent row base
      return false;
    }
    const targetRoot = targetToken.replace(/_(BASE|TOTAL|CHARGES)$/, "");
    if (targetRoot && currentCellRoot && targetRoot === currentCellRoot) return true;
    return false;
  };

  const rawVal = tokenMap[token];
  const evaluatedValue = typeof rawVal === "number" && !isNaN(rawVal) ? rawVal : null;

  // 1. Check Row Tokens
  for (const sec of sections || []) {
    for (const row of sec.rows || []) {
      const rowToken = row.rowToken;
      if (!rowToken) continue;

      const isBase = token === `${rowToken}_BASE`;
      const isCharges = token === `${rowToken}_CHARGES`;
      const isTotal = token === rowToken || token === `${rowToken}_TOTAL`;

      if (isBase || isCharges || isTotal) {
        const rowLabel = row.label || rowToken;
        const friendlyLabel = isBase
          ? `${rowLabel} (Base)`
          : isCharges
            ? `${rowLabel} (Charges)`
            : `${rowLabel} (Total)`;

        const categoryLabel = isBase ? "Row Base" : isCharges ? "Row Charges" : "Row Total";

        const baseKey = `${rowToken}_BASE`;
        const chargesKey = `${rowToken}_CHARGES`;
        const totalKey = rowToken;

        const siblings: TokenVariantSibling[] = [
          {
            key: baseKey,
            label: "Base",
            isCurrent: isBase,
            disabled: isSelfReference(baseKey),
            disabledReason: isSelfReference(baseKey)
              ? "Cannot reference current row base"
              : undefined,
          },
          {
            key: chargesKey,
            label: "Charges",
            isCurrent: isCharges,
            disabled: isRowCharge ? true : isSelfReference(chargesKey),
            disabledReason: isRowCharge
              ? "Row charge cannot reference row charges sum"
              : isSelfReference(chargesKey)
                ? "Cannot reference current row charges"
                : undefined,
          },
          {
            key: totalKey,
            label: "Total",
            isCurrent: isTotal,
            disabled: isRowCharge ? false : isSelfReference(totalKey),
            disabledReason:
              !isRowCharge && isSelfReference(totalKey)
                ? "Cannot reference current row total"
                : undefined,
          },
        ];

        return {
          token,
          friendlyLabel,
          categoryLabel,
          evaluatedValue,
          siblings,
        };
      }

      // Check Row Charge Items
      for (const charge of row.charges || []) {
        if (charge.chargeToken === token) {
          return {
            token,
            friendlyLabel: charge.label || charge.chargeToken,
            categoryLabel: "Row Charge Item",
            evaluatedValue,
            siblings: [],
          };
        }
      }
    }
  }

  // 2. Check Section Tokens
  for (const sec of sections || []) {
    const secToken = sec.sectionToken;
    if (!secToken) continue;

    const isBase = token === `SEC_${secToken}_BASE`;
    const isCharges = token === `SEC_${secToken}_CHARGES`;
    const isTotal = token === `SEC_${secToken}` || token === `SEC_${secToken}_TOTAL`;

    if (isBase || isCharges || isTotal) {
      const secLabel = sec.name || secToken;
      const friendlyLabel = isBase
        ? `${secLabel} (Base)`
        : isCharges
          ? `${secLabel} (Charges)`
          : `${secLabel} (Total)`;

      const categoryLabel = isBase
        ? "Section Base"
        : isCharges
          ? "Section Charges"
          : "Section Total";

      const baseKey = `SEC_${secToken}_BASE`;
      const chargesKey = `SEC_${secToken}_CHARGES`;
      const totalKey = `SEC_${secToken}`;

      const siblings: TokenVariantSibling[] = [
        {
          key: baseKey,
          label: "Base",
          isCurrent: isBase,
          disabled: isSelfReference(baseKey),
          disabledReason: isSelfReference(baseKey)
            ? "Cannot reference current section base"
            : undefined,
        },
        {
          key: chargesKey,
          label: "Charges",
          isCurrent: isCharges,
          disabled: isSelfReference(chargesKey),
          disabledReason: isSelfReference(chargesKey)
            ? "Cannot reference current section charges"
            : undefined,
        },
        {
          key: totalKey,
          label: "Total",
          isCurrent: isTotal,
          disabled: isSelfReference(totalKey),
          disabledReason: isSelfReference(totalKey)
            ? "Cannot reference current section total"
            : undefined,
        },
      ];

      return {
        token,
        friendlyLabel,
        categoryLabel,
        evaluatedValue,
        siblings,
      };
    }

    // Check Section Charge Items
    for (const charge of sec.sectionCharges || []) {
      if (charge.chargeToken === token) {
        return {
          token,
          friendlyLabel: charge.label || charge.chargeToken,
          categoryLabel: "Section Charge Item",
          evaluatedValue,
          siblings: [],
        };
      }
    }
  }

  // 3. Check Expense Categories
  if (token === "EXP_TOTAL") {
    return {
      token,
      friendlyLabel: "Total Recorded Expenses",
      categoryLabel: "Expense Total",
      evaluatedValue,
      siblings: [],
    };
  }
  if (token.startsWith("EXP_") || externalTokens?.category?.has(token)) {
    const rawCat = token.startsWith("EXP_") ? token.slice(4) : token;
    const catName = rawCat.replace(/_/g, " ").toLowerCase();
    const formattedCat = catName.charAt(0).toUpperCase() + catName.slice(1);
    return {
      token,
      friendlyLabel: `Expense: ${formattedCat}`,
      categoryLabel: "Expense Category",
      evaluatedValue,
      siblings: [],
    };
  }

  // 4. Template Constants
  const constantsList = Array.isArray(templateConstants)
    ? templateConstants
    : templateConstants
      ? Object.values(templateConstants)
      : [];
  const foundConst = constantsList.find((c: any) => c.token === token);
  if (foundConst) {
    return {
      token,
      friendlyLabel: foundConst.name || token,
      categoryLabel: "Template Constant",
      evaluatedValue,
      siblings: [],
    };
  }
  if (token.startsWith("TPL_")) {
    return {
      token,
      friendlyLabel: token.slice(4).replace(/_/g, " "),
      categoryLabel: "Template Constant",
      evaluatedValue,
      siblings: [],
    };
  }

  // 5. Global Constants
  if (token.startsWith("GBL_") || externalTokens?.global?.has(token)) {
    const raw = token.startsWith("GBL_") ? token.slice(4) : token;
    return {
      token,
      friendlyLabel: raw.replace(/_/g, " "),
      categoryLabel: "Global Constant",
      evaluatedValue,
      siblings: [],
    };
  }

  // 6. File Custom Fields
  if (token.startsWith("FILE_") || externalTokens?.file?.has(token)) {
    const raw = token.startsWith("FILE_") ? token.slice(5) : token;
    return {
      token,
      friendlyLabel: raw.replace(/_/g, " "),
      categoryLabel: "File Field",
      evaluatedValue,
      siblings: [],
    };
  }

  // 7. Math Functions
  if ((MATH_FUNCTIONS as readonly string[]).includes(token)) {
    return {
      token,
      friendlyLabel: `Math Function: ${token}()`,
      categoryLabel: "Math Function",
      evaluatedValue: null,
      siblings: [],
    };
  }

  // 8. Fallback
  return {
    token,
    friendlyLabel: token.replace(/_/g, " "),
    categoryLabel: "Token",
    evaluatedValue,
    siblings: [],
  };
}

/**
 * Computes smart backspace result:
 * 1. Suffix stripping: `PORT_DUES_BASE` -> `PORT_DUES` (removes `_BASE` including underscore)
 * 2. Atomic token deletion: `PORT_DUES` -> deletes whole token cleanly
 * 3. Operator deletion: ` + ` -> deleted atomically
 * 4. Parenthesis deletion: `) ` -> deleted atomically
 */
export function getSmartBackspaceResult(
  inputValue: string,
  cursorPos: number,
  allTokens: string[],
): { newVal: string; newCursor: number } | null {
  if (cursorPos <= 0 || cursorPos > inputValue.length) return null;

  const before = inputValue.slice(0, cursorPos);
  const after = inputValue.slice(cursorPos);

  // 1. Spaced operator block " + " / " - " / " * " / " / " / " // " / " % "
  const matchSpaced = before.match(/ (\+|-|\*|\/|\/\/|%) $/);
  if (matchSpaced) {
    const toRemove = matchSpaced[0].length;
    return {
      newVal: before.slice(0, -toRemove) + after,
      newCursor: cursorPos - toRemove,
    };
  }

  // 1b. Comma delimiter ", "
  if (before.endsWith(", ")) {
    return {
      newVal: before.slice(0, -2) + after,
      newCursor: cursorPos - 2,
    };
  }

  // 2. Partial operator block " +" / " -" / " *" / " /" / " //" / " %"
  const matchPartial = before.match(/ (\+|-|\*|\/|\/\/|%)$/);
  if (matchPartial) {
    const toRemove = matchPartial[0].length;
    return {
      newVal: before.slice(0, -toRemove) + after,
      newCursor: cursorPos - toRemove,
    };
  }

  // 3. Trailing space after closing parenthesis ") "
  if (before.endsWith(") ")) {
    return {
      newVal: before.slice(0, -2) + after,
      newCursor: cursorPos - 2,
    };
  }

  // 4. Any other trailing space -> let normal backspace handle it
  if (before.endsWith(" ")) {
    return null;
  }

  // 5. Token chunk check
  const chunk = getChunkAtCursor(inputValue, cursorPos - 1);
  if (chunk && /^[A-Za-z0-9_]+$/.test(chunk.text) && !/^[0-9.]+$/.test(chunk.text)) {
    // If cursor is at the end of this token chunk
    if (cursorPos === chunk.end) {
      const text = chunk.text;
      const lastUnderscore = text.lastIndexOf("_");

      if (lastUnderscore > 0) {
        const prefix = text.slice(0, lastUnderscore);
        const suffix = text.slice(lastUnderscore); // e.g. '_BASE', '_CHARGES', '_TOTAL'

        const isKnownVariantSuffix = ["_BASE", "_CHARGES", "_TOTAL"].includes(suffix);
        const isPrefixValid =
          allTokens.includes(prefix) ||
          allTokens.includes(`${prefix}_TOTAL`) ||
          (prefix.startsWith("SEC_") && allTokens.includes(prefix));

        if (isKnownVariantSuffix || isPrefixValid) {
          // Remove suffix including underscore: e.g. PORT_DUES_BASE -> PORT_DUES
          const toRemove = suffix.length;
          return {
            newVal: inputValue.slice(0, cursorPos - toRemove) + after,
            newCursor: cursorPos - toRemove,
          };
        }
      }

      // If no valid prefix or no variant suffix, delete the entire token atomically
      return {
        newVal: inputValue.slice(0, chunk.start) + after,
        newCursor: chunk.start,
      };
    }

    // Cursor is inside the token
    const relativePos = cursorPos - chunk.start;
    const textBeforeCursor = chunk.text.slice(0, relativePos);
    const lastUnderscore = textBeforeCursor.lastIndexOf("_");

    if (lastUnderscore >= 0) {
      const toRemove = relativePos - lastUnderscore;
      return {
        newVal: inputValue.slice(0, chunk.start + lastUnderscore) + inputValue.slice(cursorPos),
        newCursor: chunk.start + lastUnderscore,
      };
    } else {
      return {
        newVal: inputValue.slice(0, chunk.start) + inputValue.slice(cursorPos),
        newCursor: chunk.start,
      };
    }
  }

  return null;
}

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
