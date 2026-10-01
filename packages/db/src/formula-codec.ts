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

// Legacy types for compatibility
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

// Legacy regexes for backward compatibility with existing tests/data
const LEGACY_ROW_BASE_REF_RE = /\{\{\$row:([a-zA-Z0-9_-]+)\}\}_BASE/gi;
const LEGACY_ROW_CHARGES_REF_RE = /\{\{\$row:([a-zA-Z0-9_-]+)\}\}_CHARGES/gi;
const LEGACY_ROW_TOTAL_REF_RE = /\{\{\$row:([a-zA-Z0-9_-]+)\}\}_TOTAL/gi;
const LEGACY_ROW_REF_RE = /\{\{\$row:([a-zA-Z0-9_-]+)\}\}/gi;

const LEGACY_SEC_BASE_REF_RE = /\{\{\$sec:([a-zA-Z0-9_-]+)\}\}_BASE/gi;
const LEGACY_SEC_CHARGES_REF_RE = /\{\{\$sec:([a-zA-Z0-9_-]+)\}\}_CHARGES/gi;
const LEGACY_SEC_TOTAL_REF_RE = /\{\{\$sec:([a-zA-Z0-9_-]+)\}\}_TOTAL/gi;
const LEGACY_SEC_REF_RE = /\{\{\$sec:([a-zA-Z0-9_-]+)\}\}/gi;

const LEGACY_TPL_REF_RE = /\{\{\$tpl:([a-zA-Z0-9_-]+)\}\}/gi;

/**
 * Encode: bare or prefixed tokens -> {{$tok:UUID}}
 * Encodes _BASE, _CHARGES, and legacy _TOTAL suffixes first.
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
    // Legacy _TOTAL maps to bare total
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

  return result;
}

/**
 * Decode: {{$tok:UUID}} (and legacy formats) -> bare display token
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

  // Legacy {{$row:...}}, {{$sec:...}}, {{$tpl:...}}
  result = result.replace(LEGACY_ROW_BASE_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? `${token}_BASE` : `{{$row:${id}}}_BASE`;
  });
  result = result.replace(LEGACY_ROW_CHARGES_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? `${token}_CHARGES` : `{{$row:${id}}}_CHARGES`;
  });
  result = result.replace(LEGACY_ROW_TOTAL_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$row:${id}}}`;
  });
  result = result.replace(LEGACY_ROW_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$row:${id}}}`;
  });

  result = result.replace(LEGACY_SEC_BASE_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? `${token}_BASE` : `{{$sec:${id}}}_BASE`;
  });
  result = result.replace(LEGACY_SEC_CHARGES_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? `${token}_CHARGES` : `{{$sec:${id}}}_CHARGES`;
  });
  result = result.replace(LEGACY_SEC_TOTAL_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$sec:${id}}}`;
  });
  result = result.replace(LEGACY_SEC_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$sec:${id}}}`;
  });

  result = result.replace(LEGACY_TPL_REF_RE, (_, id) => {
    const token = tokenMap[id];
    return token ? token : `{{$tpl:${id}}}`;
  });

  // Decode prefixes to bare tokens
  result = result.replace(/\bFILE_([A-Z0-9_]+)\b/g, "$1");
  result = result.replace(/\b(?:GBL_|ORG_)([A-Z0-9_]+)\b/g, "$1");
  result = result.replace(/\bEXP_(?!TOTAL\b)([A-Z0-9_]+)\b/g, "$1");

  return result;
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

  // Legacy {{$row:...}}, {{$sec:...}}, {{$tpl:...}}
  result = result.replace(LEGACY_ROW_BASE_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? `${token}_BASE` : `{{$row:${id}}}_BASE`;
  });
  result = result.replace(LEGACY_ROW_CHARGES_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? `${token}_CHARGES` : `{{$row:${id}}}_CHARGES`;
  });
  result = result.replace(LEGACY_ROW_TOTAL_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? token : `{{$row:${id}}}`;
  });
  result = result.replace(LEGACY_ROW_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? token : `{{$row:${id}}}`;
  });

  result = result.replace(LEGACY_SEC_BASE_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? `${token}_BASE` : `{{$sec:${id}}}_BASE`;
  });
  result = result.replace(LEGACY_SEC_CHARGES_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? `${token}_CHARGES` : `{{$sec:${id}}}_CHARGES`;
  });
  result = result.replace(LEGACY_SEC_TOTAL_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? token : `{{$sec:${id}}}`;
  });
  result = result.replace(LEGACY_SEC_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? token : `{{$sec:${id}}}`;
  });

  result = result.replace(LEGACY_TPL_REF_RE, (_, id) => {
    const token = evalMap[id];
    return token ? (token.startsWith("TPL_") ? token : `TPL_${token}`) : `{{$tpl:${id}}}`;
  });

  return result;
}
