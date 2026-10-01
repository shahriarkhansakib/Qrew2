export type SimpleChargeFormula = {
  operator: "*";
  value: number;
  unit: "percent";
};

/**
 * Parses a rate charge formula string:
 * [baseToken] * [number]%
 * Or desugared: [baseToken] * ([number]/100) or [baseToken] * 0.XX
 *
 * @param formula The raw formula string from the DB (decoded format)
 * @param baseToken The base token for the row (e.g. 'PORT_DUES_BASE')
 * @returns SimpleChargeFormula with the rate percentage, or null
 */
export function parseChargeFormula(formula: string, baseToken: string): SimpleChargeFormula | null {
  if (!formula?.trim()) return null;

  const raw = formula.trim();
  const cleanBase = baseToken.replace(/_BASE$/, "");
  const escapedClean = cleanBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenPattern = `(?:${escapedClean}_BASE|${escapedClean})`;

  // 1. Percentage syntax: BASE * 15%
  const percentMatch = raw.match(
    new RegExp(`^\\s*${tokenPattern}\\s*\\*\\s*(\\d*(?:\\.\\d+)?)%\\s*$`),
  );
  if (percentMatch) {
    const val = parseFloat(percentMatch[1]);
    if (!Number.isNaN(val)) return { operator: "*", value: val, unit: "percent" };
  }

  // 2. Fraction syntax: BASE * (15/100)
  const fractionMatch = raw.match(
    new RegExp(`^\\s*${tokenPattern}\\s*\\*\\s*\\((\\d*(?:\\.\\d+)?)\\/100\\)\\s*$`),
  );
  if (fractionMatch) {
    const val = parseFloat(fractionMatch[1]);
    if (!Number.isNaN(val)) return { operator: "*", value: val, unit: "percent" };
  }

  // 3. Decimal syntax: BASE * 0.15
  const decimalMatch = raw.match(
    new RegExp(`^\\s*${tokenPattern}\\s*\\*\\s*(\\d*(?:\\.\\d+)?)\\s*$`),
  );
  if (decimalMatch) {
    const numValue = parseFloat(decimalMatch[1]);
    if (!Number.isNaN(numValue)) {
      const percentValue = Math.round(numValue * 100 * 10000) / 10000;
      return { operator: "*", value: percentValue, unit: "percent" };
    }
  }

  return null;
}

/**
 * Builds a strict rate charge formula string:
 * E.g. "PORT_DUES_BASE * 15%"
 */
export function buildChargeFormula(data: { value: number }, baseToken: string): string {
  return `${baseToken} * ${data.value}%`;
}
