/**
 * Strict formula validator for invoice template formulas.
 * Validates human-readable (decoded) formula strings before UUID encoding.
 */

/** Valid character regex for a preprocessed formula */
const VALID_CHAR_RE = /^[A-Z0-9_.+\-*/%\s()]+$/;

/**
 * Validate a formula string for character allowlist and basic syntax.
 * Token existence is checked separately via buildValidTokenSet.
 */
export function validateFormulaStrict(
  formula: string | null | undefined,
  validTokens: Set<string>,
  currentToken?: string,
): { valid: boolean; error?: string } {
  if (!formula?.trim()) {
    return { valid: false, error: "Formula cannot be empty" };
  }

  const f = formula.trim();

  // 1. Character allowlist
  if (!VALID_CHAR_RE.test(f)) {
    const bad = f.match(/[^A-Z0-9_.+\-*/%\s()]/);
    return {
      valid: false,
      error: `Invalid character in formula: "${bad?.[0]}" — only tokens, numbers, and operators are allowed`,
    };
  }

  // 1.5. Self-referencing (circular dependency) checks
  if (currentToken) {
    const tokensInFormula: string[] = f.match(/[A-Z_][A-Z0-9_]*/g) ?? [];
    if (tokensInFormula.includes(currentToken)) {
      return {
        valid: false,
        error: `Circular reference: a formula cannot reference its own token "${currentToken}"`,
      };
    }
    const baseToken = `${currentToken}_BASE`;
    if (tokensInFormula.includes(baseToken)) {
      return {
        valid: false,
        error: `Circular reference: a formula cannot reference its own base "${baseToken}"`,
      };
    }
    const totalToken = `${currentToken}_TOTAL`;
    if (tokensInFormula.includes(totalToken)) {
      return {
        valid: false,
        error: `Circular reference: a formula cannot reference its own total "${totalToken}"`,
      };
    }
  }

  // 2. Word segments must be known tokens (skip if set is empty — means skip check)
  if (validTokens.size > 0) {
    const wordSegments = f.match(/[A-Z_][A-Z0-9_]*/g) ?? [];
    for (const word of wordSegments) {
      if (!validTokens.has(word)) {
        return {
          valid: false,
          error: `Unknown token "${word}" — not found in this template's token registry`,
        };
      }
    }
  }

  // 3. Basic syntax checks
  if (/(?:[+\-*/]|(?<!\d)%)\s*$/.test(f)) {
    return { valid: false, error: "Formula ends with an operator" };
  }
  if (/^\s*[+*/%]/.test(f)) {
    return { valid: false, error: "Formula starts with an invalid operator" };
  }

  return { valid: true };
}

/**
 * Character-only validation (no token existence check).
 * Fast path for contexts where loading the full token set would be too expensive.
 * Optionally pass currentToken to enforce self-referencing checks.
 */
export function validateFormulaChars(
  formula: string | null | undefined,
  currentToken?: string,
): { valid: boolean; error?: string } {
  return validateFormulaStrict(formula, new Set(), currentToken);
}

/**
 * Strict validator for rate charge formulas.
 * Enforces: <PARENT_TOKEN>_BASE * <RATE>%
 * Desugared representations like: <PARENT_TOKEN>_BASE * (<RATE>/100) or <PARENT_TOKEN>_BASE * 0.XX are also accepted.
 */
export function validateRateChargeFormula(
  formula: string | null | undefined,
  parentRowToken: string,
): { valid: boolean; error?: string } {
  if (!formula?.trim()) {
    return { valid: false, error: "Rate charge formula cannot be empty" };
  }

  const f = formula.trim();
  const baseToken = `${parentRowToken}_BASE`;

  // Matches: BASE * 15% or BASE * 15.5% or BASE * .15% or BASE * (15/100) or BASE * 0.15
  const percentPattern = new RegExp(`^${baseToken}\\s*\\*\\s*(\\d*\\.?\\d+)%$`);
  const fractionPattern = new RegExp(`^${baseToken}\\s*\\*\\s*\\((\\d*\\.?\\d+)\\/100\\)$`);
  const decimalPattern = new RegExp(`^${baseToken}\\s*\\*\\s*(\\d*\\.?\\d+)$`);

  if (percentPattern.test(f) || fractionPattern.test(f) || decimalPattern.test(f)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Rate charge formula must strictly be "${baseToken} * <number>%" (e.g. "${baseToken} * 15%"). Complex formulas are not allowed in charges.`,
  };
}
