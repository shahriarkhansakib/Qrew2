/**
 * Text Interpolator — resolves {{TOKEN}} and {{$TOKEN}} in label/description fields.
 *
 * Per BACKEND_AGENT.md §8.4 and ROW_SYSTEM_SPEC.md §5:
 *
 * {{TOKEN_NAME}}  → renders the token KEY as literal text (e.g. "FILE_GRT")
 *   Use case: "PORT DUES @ US$ 0.306 PER {{FILE_GRT}}"
 *             → "PORT DUES @ US$ 0.306 PER FILE_GRT"
 *
 * {{$TOKEN_NAME}} → renders the RESOLVED VALUE (e.g. "20151")
 *   Use case: "PORT DUES @ US$ 0.306 PER GRT X {{$FILE_GRT}}"
 *             → "PORT DUES @ US$ 0.306 PER GRT X 20151"
 *
 * Unknown tokens: left as-is (do not throw, do not substitute empty string)
 * This runs at PDF generation time, AFTER formula evaluation.
 */

/** Matches {{$TOKEN}} — dollar prefix means "insert resolved value" */
const VALUE_TOKEN_REGEX = /\{\{\$([A-Z_][A-Z0-9_]*)\}\}/g;

/** Matches {{TOKEN}} (without dollar) — means "insert the token key name" */
const KEY_TOKEN_REGEX = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

/**
 * Format a resolved BigNumber string for display, based on the token type.
 * For most tokens: strip trailing zeros (e.g. "20151.000000" → "20151")
 * Percentage tokens (ORG_* stored as 0.15) are formatted as "15%" if the
 * caller passes valueType info — but since we don't have that here at this
 * level, the scope value is returned as-is, formatted cleanly.
 */
function formatScopeValue(_tokenName: string, rawValue: string): string {
  // Format: remove unnecessary trailing zeros without floating-point conversion
  // e.g. "20151.000000" → "20151", "0.150000" → "0.15", "0.000000" → "0"
  if (/^[+-]?\d+(\.\d+)?$/.test(rawValue)) {
    if (!rawValue.includes(".")) return rawValue;
    const stripped = rawValue.replace(/\.?0+$/, "");
    return stripped === "" || stripped === "-" || stripped === "+" ? "0" : stripped;
  }
  return rawValue;
}

/**
 * Interpolate a single text string.
 * @param text - The template string (e.g. "PORT DUES {{$FILE_GRT}} GRT")
 * @param scope - Resolved token scope (BigNumber strings from token resolver)
 */
export function interpolate(
  text: string | null | undefined,
  scope: Record<string, string>,
): string {
  if (!text) return "";

  // Step 1: Replace {{$TOKEN}} with the resolved value
  let result = text.replace(new RegExp(VALUE_TOKEN_REGEX.source, "g"), (_match, tokenName) => {
    const rawValue = scope[tokenName];
    if (rawValue === undefined) return _match; // leave unknown tokens as-is
    return formatScopeValue(tokenName, rawValue);
  });

  // Step 2: Replace {{TOKEN}} (no dollar) with the literal token key name
  result = result.replace(new RegExp(KEY_TOKEN_REGEX.source, "g"), (_match, tokenName) => {
    // For non-$ tokens we return the token name itself as text
    // e.g. {{FILE_GRT}} → "FILE_GRT"
    return tokenName;
  });

  return result;
}

/**
 * Interpolate all text fields on a row (label, subDescription, surchargeLabel).
 * Returns a new object with interpolated strings; all other fields unchanged.
 */
export function interpolateRow<
  T extends {
    label: string;
    subDescription?: string | null;
    surchargeLabel?: string | null;
  },
>(row: T, scope: Record<string, string>): T {
  return {
    ...row,
    label: interpolate(row.label, scope),
    subDescription: row.subDescription
      ? interpolate(row.subDescription, scope)
      : row.subDescription,
    surchargeLabel: row.surchargeLabel
      ? interpolate(row.surchargeLabel, scope)
      : row.surchargeLabel,
  };
}

/** Interpolate all rows in an array */
export function interpolateRows<
  T extends {
    label: string;
    subDescription?: string | null;
    surchargeLabel?: string | null;
  },
>(rows: T[], scope: Record<string, string>): T[] {
  return rows.map((row) => interpolateRow(row, scope));
}

/** @deprecated Use the named exports above */
export class TextInterpolatorService {
  static interpolate = interpolate;
  static interpolateRow = interpolateRow;
  static interpolateRows = interpolateRows;
  /** @deprecated alias */
  static interpolateString = interpolate;
}
