/**
 * Formula Codec — Unified Single Namespace
 *
 * Storage format: {{$tok:UUID}}
 * Suffix variants: {{$tok:UUID}}_BASE, {{$tok:UUID}}_CHARGES
 *
 * Display format: bare token name (UPPER_SNAKE_CASE)
 * Engine eval format: prefixed by domain (EXP_TRANSPORTATION, GBL_VAT_RATE, FILE_GRT, TPL_SURCHARGE, etc.)
 *
 * EXP_TOTAL is the only token where the prefix is kept in display.
 * All others: TRANSPORTATION (not EXP_TRANSPORTATION), VAT_RATE (not GBL_VAT_RATE).
 */

export type TokenMap = Record<string, string>; // tokenName -> UUID
export type IdToTokenMap = Record<string, string>; // UUID -> bareToken
export type IdToEvalTokenMap = Record<string, string>; // UUID -> enginePrefixedToken

// Compatibility aliases for controller typing
export type RowTokenToIdMap = Record<string, string>;
export type RowIdToTokenMap = Record<string, string>;
export type SecTokenToIdMap = Record<string, string>;
export type SecIdToTokenMap = Record<string, string>;
export type TplTokenToIdMap = Record<string, string>;
export type TplIdToTokenMap = Record<string, string>;

const TOK_BASE_REF_RE = /\{\{\$tok:([a-zA-Z0-9_-]+)\}\}_BASE/gi;
const TOK_CHARGES_REF_RE = /\{\{\$tok:([a-zA-Z0-9_-]+)\}\}_CHARGES/gi;
const TOK_TOTAL_REF_RE = /\{\{\$tok:([a-zA-Z0-9_-]+)\}\}_TOTAL/gi;
const TOK_REF_RE = /\{\{\$tok:([a-zA-Z0-9_-]+)\}\}/gi;

/**
 * Encode: bare or prefixed tokens -> {{$tok:UUID}}
 * Encodes _BASE, _CHARGES, and _TOTAL suffixes into canonical {{$tok:UUID}}.
 */
export function encodeFormula(
  formula: string | null | undefined,
  tokenMap: TokenMap = {},
  secTokenToId: SecTokenToIdMap = {},
  tplTokenToId: TplTokenToIdMap = {},
  fileFieldTokens: string[] = [],
  globalTokens: string[] = [],
): string | null {
  if (!formula) return null;

  let result = formula;
  const mergedMap: Record<string, string> = {
    ...tokenMap,
    ...secTokenToId,
    ...tplTokenToId,
  };

  const tokens = Object.keys(mergedMap).sort((a, b) => b.length - a.length);

  for (const token of tokens) {
    const id = mergedMap[token];
    // Suffix variants for rows and sections
    result = result.replace(new RegExp(`\\b${token}_BASE\\b`, "g"), `{{$tok:${id}}}_BASE`);
    result = result.replace(new RegExp(`\\b${token}_CHARGES\\b`, "g"), `{{$tok:${id}}}_CHARGES`);
    // _TOTAL maps to bare token
    result = result.replace(new RegExp(`\\b${token}_TOTAL\\b`, "g"), `{{$tok:${id}}}`);
    // Bare token
    result = result.replace(new RegExp(`\\b${token}\\b`, "g"), `{{$tok:${id}}}`);
  }

  // File fields: bare -> FILE_*
  for (const token of fileFieldTokens) {
    result = result.replace(new RegExp(`\\b(?<!FILE_)${token}\\b`, "g"), `FILE_${token}`);
  }

  // Global tokens: bare -> GBL_*
  for (const token of globalTokens) {
    result = result.replace(new RegExp(`\\b(?<!(GBL_|ORG_))${token}\\b`, "g"), `GBL_${token}`);
  }

  return normalizeFormulaSpacing(result);
}

/**
 * Decode: {{$tok:UUID}} -> bare display token
 */
export function decodeFormula(
  stored: string | null | undefined,
  idToToken: IdToTokenMap = {},
  secIdToToken: SecIdToTokenMap = {},
  tplIdToToken: TplIdToTokenMap = {},
  _fileFieldTokens?: string[],
  _globalTokens?: string[],
): string | null {
  if (!stored) return null;

  const tokenMap: Record<string, string> = {
    ...idToToken,
    ...secIdToToken,
    ...tplIdToToken,
  };

  let result = stored;

  // Unified {{$tok:UUID}}
  result = result.replace(TOK_BASE_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? `${token}_BASE` : `{{$tok:${id}}}_BASE`;
  });
  result = result.replace(TOK_CHARGES_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? `${token}_CHARGES` : `{{$tok:${id}}}_CHARGES`;
  });
  result = result.replace(TOK_TOTAL_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$tok:${id}}}`;
  });
  result = result.replace(TOK_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$tok:${id}}}`;
  });

  // Decode prefixes to bare tokens
  result = result.replace(/\bFILE_([A-Z0-9_]+)\b/g, "$1");
  result = result.replace(/\b(?:GBL_|ORG_)([A-Z0-9_]+)\b/g, "$1");
  result = result.replace(/\bEXP_(?!TOTAL\b)([A-Z0-9_]+)\b/g, "$1");

  return normalizeFormulaSpacing(result);
}

/**
 * Decode for engine evaluation: {{$tok:UUID}} -> prefixed engine token
 * e.g. UUID of TRANSPORTATION -> "EXP_TRANSPORTATION"
 *      UUID of VAT_RATE (global) -> "GBL_VAT_RATE"
 *      UUID of PORT_DUES (row) -> "PORT_DUES" (rows stay bare in engine scope)
 */
export function decodeFormulaForEval(
  stored: string | null | undefined,
  idToEvalToken: IdToEvalTokenMap = {},
  secIdToToken: SecIdToTokenMap = {},
  tplIdToToken: TplIdToTokenMap = {},
): string {
  if (!stored) return "";

  const evalMap: Record<string, string> = { ...idToEvalToken };
  for (const [id, tok] of Object.entries(secIdToToken)) {
    if (!evalMap[id]) evalMap[id] = tok;
  }
  for (const [id, tok] of Object.entries(tplIdToToken)) {
    if (!evalMap[id]) evalMap[id] = tok.startsWith("TPL_") ? tok : `TPL_${tok}`;
  }

  let result = stored;

  // Unified {{$tok:UUID}}
  result = result.replace(TOK_BASE_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? `${token}_BASE` : `{{$tok:${id}}}_BASE`;
  });
  result = result.replace(TOK_CHARGES_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? `${token}_CHARGES` : `{{$tok:${id}}}_CHARGES`;
  });
  result = result.replace(TOK_TOTAL_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? token : `{{$tok:${id}}}`;
  });
  result = result.replace(TOK_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? token : `{{$tok:${id}}}`;
  });

  return normalizeFormulaSpacing(result);
}

/**
 * Rigorously normalizes mathematical formula whitespace into canonical delimiter-owned spacing.
 * Rules:
 *  1. Binary operators (+, -, *, /, //, %) have strictly one space on either side.
 *  2. Unary minus clings to its operand (-10, (-5), *-2).
 *  3. Parentheses have zero internal padding: (A + B), never ( A + B ).
 *  4. Function calls have zero space before '(': CLAMP(x, min, max), never CLAMP (x).
 *  5. Function arguments are delimited by comma and single space: ", ".
 *  6. Percentage syntactic sugar clings to numbers: "50%", "0.15%".
 *  7. Encoded tokens ({{$tok:...}}) preserve their delimiters cleanly.
 *  8. Redundant multiple spaces and edge whitespace are eliminated.
 */
export function normalizeFormulaSpacing(formula: string | null | undefined): string {
  if (!formula || typeof formula !== "string") return "";

  let result = formula.trim();
  if (result.length === 0) return "";

  // 1. Collapse multiple whitespace characters into single space
  result = result.replace(/\s+/g, " ");

  // 2. Shield encoded storage tags (e.g. {{$tok:uuid-with-hyphens}})
  const tags: string[] = [];
  result = result.replace(/\{\{.*?\}\}/g, (match) => {
    tags.push(match);
    return `__FORMULA_TAG_${tags.length - 1}__`;
  });

  // 3. Shield percentage attached to pure numeric literals (e.g. "50%", "0.15%")
  const percentages: string[] = [];
  result = result.replace(
    /(^|[^A-Za-z0-9_])(\d+(?:\.\d+)?)\s*%(?!\s*[A-Za-z0-9_(])/g,
    (_, prefix, num) => {
      percentages.push(`${num}%`);
      return `${prefix}__PERCENTAGE_${percentages.length - 1}__`;
    },
  );

  // 4. Protect and normalize modulo operator `//`
  result = result.replace(/\s*\/\/\s*/g, " __MODULO__ ");

  // 5. Binary operators: +, *, /, and modulo % (which was not shielded as percentage)
  result = result.replace(/\s*([+*/%])\s*/g, " $1 ");

  // 6. Binary minus vs unary minus:
  result = result.replace(/([A-Za-z0-9_.)%\]])\s*-\s*/g, "$1 - ");
  result = result.replace(/([+*/(,]|\b__MODULO__\b)\s*-\s*([A-Za-z0-9_])/g, "$1 -$2");
  result = result.replace(/^-\s*([A-Za-z0-9_])/g, "-$1");

  // Restore modulo operator
  result = result.replace(/\s*__MODULO__\s*/g, " // ");

  // Restore percentages
  result = result.replace(/__PERCENTAGE_(\d+)__/g, (_, idx) => percentages[Number(idx)] || "");

  // Restore storage tags
  result = result.replace(/__FORMULA_TAG_(\d+)__/g, (_, idx) => tags[Number(idx)] || "");

  // 7. Parentheses:
  result = result.replace(/\(\s+/g, "(");
  result = result.replace(/\s+\)/g, ")");
  result = result.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s+\(/g, "$1(");
  result = result.replace(/\)(?=[A-Za-z0-9_])/g, ") ");

  // 8. Commas: zero space before, exactly one space after
  result = result.replace(/\s*,\s*/g, ", ");

  // 9. Clean up any accidental double spaces
  result = result.replace(/\s{2,}/g, " ");

  return result.trim();
}
