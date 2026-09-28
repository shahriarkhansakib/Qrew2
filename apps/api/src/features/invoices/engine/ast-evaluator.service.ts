/**
 * AST Evaluator Service — Invoice Engine V2
 *
 * Evaluates the formula-driven invoice template in strict topological order:
 *
 *  For each section (in sortOrder):
 *    For each parent row (in sortOrder):
 *      1. Evaluate row base value (normal → initialValue/manualValue, formula → expression)
 *      2. rowToken = base value
 *      3. Evaluate each row charge formula (references rowToken as base)
 *      4. rowToken_TOTAL = rowToken + SUM(row charges)
 *    SEC_X_BASE    = SUM(rowToken values in section)
 *    SEC_X_CHARGES = SUM(all row charge values in section)
 *    SEC_X_TOTAL   = SEC_X_BASE + SEC_X_CHARGES
 *    For each section charge:
 *      Evaluate: SEC_X_{formulaBase} formulaRest
 *  INVOICE_TOTAL = SUM(SEC_X_TOTAL for all X + section charge values)
 *
 * Formula expressions use BARE token names (no {{}} delimiters).
 * Row references are stored as {{$row:UUID}} in DB and decoded before evaluation.
 * Text interpolation ({{TOKEN}} / ${{TOKEN}}) is handled separately by
 * text-interpolator.service.ts.
 */

import {
  decodeFormulaForEval,
  type RowIdToTokenMap,
  type SecIdToTokenMap,
  type TplIdToTokenMap,
} from "@starter/db";
import { all, type BigNumber, create, type MathJsInstance } from "mathjs";
import { sectionIndexToLetter } from "./dag-validator.service";
import {
  type EngineContext,
  type EngineError,
  type EvaluatedRow,
  type EvaluatedRowCharge,
  type EvaluatedSection,
  type EvaluatedSectionCharge,
  type EvaluatorRow,
  type EvaluatorRowCharge,
  type EvaluatorSection,
  type EvaluatorSectionCharge,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// MATHJS CONFIGURATION — BigNumber, precision 20
// ─────────────────────────────────────────────────────────────────────────────
const math: MathJsInstance = create(all, {
  number: "BigNumber",
  precision: 20,
});

const ZERO = math.bignumber("0");
const FIXED_SCALE = 6;

function toFixed(val: BigNumber): string {
  return math.format(val, { notation: "fixed", precision: FIXED_SCALE });
}

function safeBN(val: string | number | null | undefined): BigNumber {
  try {
    if (val == null || val === "") return ZERO;
    return math.bignumber(String(val));
  } catch {
    return ZERO;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMULA EVALUATION (bare token names)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates a bare-token formula expression against the current scope.
 * Returns the BigNumber result or throws an EngineError on failure.
 *
 * @param noticeCollector - If provided, unknown tokens are zero-filled and
 *   an UNRESOLVED_REFERENCE notice is pushed here instead of throwing.
 */
function evalFormula(
  formula: string,
  scope: EngineContext,
  contextLabel: string,
  noticeCollector?: EngineError[],
): BigNumber {
  const TOKEN_RE = /\b([A-Z_][A-Z0-9_]*)\b/g;
  let resolvedFormula = formula;
  if (noticeCollector !== undefined) {
    const unknownTokens = new Set<string>();
    let m: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(formula)) !== null) {
      const tok = m[1];
      if (!(tok in scope)) unknownTokens.add(tok);
    }
    for (const tok of unknownTokens) {
      noticeCollector.push({
        code: "UNRESOLVED_REFERENCE",
        message: `Token "${tok}" is not yet defined — treated as 0.`,
        token: tok,
        formula,
      } as EngineError);
      resolvedFormula = resolvedFormula.replace(new RegExp(`\\b${tok}\\b`, "g"), "0");
    }
  }

  try {
    const result = math.evaluate(resolvedFormula, scope);
    if (result == null) throw new Error("Null result");
    const bn = math.bignumber(result.toString());
    if (!math.isFinite(bn)) {
      throw new Error("Division by zero");
    }
    return bn;
  } catch (err: any) {
    const isDivZero =
      err?.message?.includes("Division by zero") ||
      err?.message?.includes("Infinity") ||
      err?.code === "DIVISION_BY_ZERO";
    throw {
      code: isDivZero ? "DIVISION_BY_ZERO" : "EVALUATION_FAILED",
      message: isDivZero
        ? `Division by zero in ${contextLabel}: "${formula}".`
        : `Failed to evaluate formula in ${contextLabel}: "${formula}". Error: ${err?.message ?? String(err)}`,
      formula,
    } as EngineError;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW EVALUATION (single-value model)
// ─────────────────────────────────────────────────────────────────────────────

export class AstEvaluatorService {
  static evaluate(
    sections: EvaluatorSection[],
    initialScope: Record<string, string> = {},
    idToToken: RowIdToTokenMap = {},
    secIdToToken: SecIdToTokenMap = {},
    tplIdToToken: TplIdToTokenMap = {},
    topologicalOrder: string[] = [],
  ): {
    evaluatedSections: EvaluatedSection[];
    grandTotal: string;
    errors: EngineError[];
  } {
    const errors: EngineError[] = [];
    const notices: EngineError[] = [];
    const scope: EngineContext = { ...initialScope };

    // Initialize tokens and build maps for quick lookup
    const rowMap = new Map<string, { row: EvaluatorRow; sectionToken: string; label: string }>();
    const chargeMap = new Map<
      string,
      { charge: EvaluatorRowCharge; rowToken: string; label: string }
    >();
    const secChargeMap = new Map<
      string,
      { sc: EvaluatorSectionCharge; sectionToken: string; sectionLabel: string }
    >();
    const sectionMap = new Map<string, EvaluatorSection>();

    for (const section of sections) {
      const sectionLetter = sectionIndexToLetter(section.sortOrder);
      const sectionLabel = section.label ?? `Section ${sectionLetter}`;
      sectionMap.set(section.sectionToken, section);

      const secBase = `SEC_${section.sectionToken}_BASE`;
      const secTotal = `SEC_${section.sectionToken}`;
      const secCharges = `SEC_${section.sectionToken}_CHARGES`;
      scope[secBase] = "0.000000";
      scope[secTotal] = "0.000000";
      scope[`${secTotal}_TOTAL`] = "0.000000";
      scope[secCharges] = "0.000000";

      for (const sc of section.sectionCharges) {
        if (sc.chargeToken) {
          scope[sc.chargeToken] = "0.000000";
          secChargeMap.set(sc.chargeToken, {
            sc,
            sectionToken: section.sectionToken,
            sectionLabel,
          });
        }
      }

      for (const row of section.rows) {
        scope[`${row.rowToken}_BASE`] = "0.000000";
        scope[`${row.rowToken}_CHARGES`] = "0.000000";
        scope[row.rowToken] = "0.000000";
        scope[`${row.rowToken}_TOTAL`] = "0.000000";
        rowMap.set(row.rowToken, { row, sectionToken: section.sectionToken, label: row.label });

        for (const charge of row.charges) {
          if (charge.chargeToken) {
            scope[charge.chargeToken] = "0.000000";
            chargeMap.set(charge.chargeToken, { charge, rowToken: row.rowToken, label: row.label });
          }
        }
      }
    }

    // Evaluate nodes in topological order
    for (const token of topologicalOrder) {
      if (token.endsWith("_BASE") && rowMap.has(token.replace("_BASE", ""))) {
        const rowToken = token.replace("_BASE", "");
        const { row } = rowMap.get(rowToken)!;
        let baseValue = ZERO;
        if (row.valueType === "formula") {
          if (!row.formula) {
            errors.push({
              code: "INVALID_FORMULA_SYNTAX",
              message: `Row "${row.label}" has valueType=formula but no formula is set.`,
              rowToken: row.rowToken,
            });
          } else {
            try {
              const decoded = decodeFormulaForEval(
                row.formula,
                idToToken,
                secIdToToken,
                tplIdToToken,
              );
              baseValue = evalFormula(decoded, scope, `row "${row.label}"`, notices);
            } catch (err: any) {
              errors.push({ ...(err as EngineError), rowToken: row.rowToken });
            }
          }
        } else {
          baseValue = safeBN(row.manualValue ?? row.initialValue ?? null);
        }
        scope[token] = toFixed(baseValue);
        continue;
      }

      if (token.endsWith("_CHARGES") && rowMap.has(token.replace("_CHARGES", ""))) {
        const rowToken = token.replace("_CHARGES", "");
        const { row } = rowMap.get(rowToken)!;
        let chargesSum = ZERO;
        for (const c of row.charges) {
          if (c.chargeToken) {
            chargesSum = math.add(chargesSum, safeBN(scope[c.chargeToken])) as BigNumber;
          }
        }
        scope[token] = toFixed(chargesSum);
        continue;
      }

      if (rowMap.has(token)) {
        const rowToken = token;
        const total = math.add(
          safeBN(scope[`${rowToken}_BASE`]),
          safeBN(scope[`${rowToken}_CHARGES`]),
        ) as BigNumber;
        scope[token] = toFixed(total);
        scope[`${token}_TOTAL`] = toFixed(total);
        continue;
      }

      if (chargeMap.has(token)) {
        const { charge, rowToken, label } = chargeMap.get(token)!;
        let val = ZERO;
        if (!charge.formula) {
          errors.push({
            code: "INVALID_FORMULA_SYNTAX",
            message: `Row charge "${charge.label}" in row "${label}" has no formula.`,
            rowToken,
          });
        } else {
          try {
            const decoded = decodeFormulaForEval(
              charge.formula,
              idToToken,
              secIdToToken,
              tplIdToToken,
            );
            val = evalFormula(decoded, scope, `row charge "${charge.label}"`, notices);
          } catch (err: any) {
            errors.push({ ...(err as EngineError), rowToken });
          }
        }
        scope[token] = toFixed(val);
        continue;
      }

      if (token.startsWith("SEC_") && token.endsWith("_BASE")) {
        const sectionToken = token.replace("SEC_", "").replace("_BASE", "");
        const section = sectionMap.get(sectionToken);
        if (section) {
          let secBase = ZERO;
          for (const row of section.rows) {
            secBase = math.add(secBase, safeBN(scope[`${row.rowToken}_BASE`])) as BigNumber;
          }
          scope[token] = toFixed(secBase);
        }
        continue;
      }

      if (token.endsWith("_CHARGES") && token.startsWith("SEC_")) {
        const sectionToken = token.replace("SEC_", "").replace("_CHARGES", "");
        const section = sectionMap.get(sectionToken);
        if (section) {
          let secChargesSum = ZERO;
          for (const row of section.rows) {
            for (const c of row.charges) {
              if (c.chargeToken) {
                secChargesSum = math.add(secChargesSum, safeBN(scope[c.chargeToken])) as BigNumber;
              }
            }
          }
          for (const sc of section.sectionCharges) {
            if (sc.chargeToken) {
              secChargesSum = math.add(secChargesSum, safeBN(scope[sc.chargeToken])) as BigNumber;
            }
          }
          scope[token] = toFixed(secChargesSum);
        }
        continue;
      }

      if (
        token.startsWith("SEC_") &&
        !token.endsWith("_CHARGES") &&
        !token.endsWith("_BASE") &&
        !secChargeMap.has(token)
      ) {
        const sectionToken = token.replace("SEC_", "").replace("_TOTAL", "");
        const section = sectionMap.get(sectionToken);
        if (section) {
          const secBase = safeBN(scope[`SEC_${sectionToken}_BASE`]);
          const secChgs = safeBN(scope[`SEC_${sectionToken}_CHARGES`]);
          const total = math.add(secBase, secChgs) as BigNumber;
          scope[`SEC_${sectionToken}`] = toFixed(total);
          scope[`SEC_${sectionToken}_TOTAL`] = toFixed(total);
        }
        continue;
      }

      if (secChargeMap.has(token)) {
        const { sc, sectionLabel } = secChargeMap.get(token)!;
        let val = ZERO;
        const decoded = decodeFormulaForEval(sc.formula, idToToken, secIdToToken, tplIdToToken);
        try {
          val = evalFormula(
            decoded,
            scope,
            `section charge "${sc.label}" in "${sectionLabel}"`,
            notices,
          );
        } catch (err: any) {
          errors.push(err as EngineError);
        }
        scope[token] = toFixed(val);
      }
    }

    // Now build the EvaluatedSection[] output tree using the visual order
    const evaluatedSections: EvaluatedSection[] = [];
    let grandTotal = ZERO;

    const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);

    for (const section of sortedSections) {
      const sectionToken = section.sectionToken;
      const autoName = sectionIndexToLetter(section.sortOrder);

      const evaluatedRows: EvaluatedRow[] = [];
      const sortedRows = [...section.rows].sort((a, b) => a.sortOrder - b.sortOrder);

      for (const row of sortedRows) {
        const evaluatedRowCharges: EvaluatedRowCharge[] = [];
        let chargesSum = ZERO;

        const sortedCharges = [...row.charges].sort((a, b) => a.sortOrder - b.sortOrder);
        for (const c of sortedCharges) {
          const val = scope[c.chargeToken] ?? "0.000000";
          chargesSum = math.add(chargesSum, safeBN(val)) as BigNumber;
          evaluatedRowCharges.push({
            id: c.id,
            chargeToken: c.chargeToken,
            label: c.label,
            subDescription: c.subDescription,
            qualifier: c.qualifier,
            tags: c.tags,
            formulaSnapshot: c.formula
              ? decodeFormulaForEval(c.formula, idToToken, secIdToToken, tplIdToToken)
              : "",
            value: String(val),
            sortOrder: c.sortOrder,
          });
        }

        const rowNotices = notices.filter((n) => n.rowToken === row.rowToken);

        evaluatedRows.push({
          id: row.id,
          rowToken: row.rowToken,
          label: row.label,
          sectionToken,
          charges: evaluatedRowCharges,
          baseValue: String(scope[`${row.rowToken}_BASE`] ?? "0.000000"),
          chargesValue: toFixed(chargesSum),
          totalValue: String(scope[row.rowToken] ?? "0.000000"),
          sortOrder: row.sortOrder,
          notices: rowNotices.length > 0 ? rowNotices : undefined,
        });
      }

      const evaluatedSecCharges: EvaluatedSectionCharge[] = [];
      const sortedSecCharges = [...section.sectionCharges].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      for (const sc of sortedSecCharges) {
        evaluatedSecCharges.push({
          id: sc.id,
          chargeToken: sc.chargeToken,
          label: sc.label,
          subDescription: sc.subDescription,
          qualifier: sc.qualifier,
          tags: sc.tags,
          formulaSnapshot: decodeFormulaForEval(sc.formula, idToToken, secIdToToken, tplIdToToken),
          value: String(scope[sc.chargeToken] ?? "0.000000"),
          sortOrder: sc.sortOrder,
        });
      }

      evaluatedSections.push({
        id: section.id,
        sectionToken,
        label: section.label,
        autoName,
        rows: evaluatedRows,
        sectionCharges: evaluatedSecCharges,
        sectionBase: String(scope[`SEC_${sectionToken}_BASE`] ?? "0.000000"),
        sectionChargesTotal: String(scope[`SEC_${sectionToken}_CHARGES`] ?? "0.000000"),
        sectionTotal: String(scope[`SEC_${sectionToken}`] ?? "0.000000"),
      });

      grandTotal = math.add(grandTotal, safeBN(scope[`SEC_${sectionToken}`])) as BigNumber;
    }

    scope.INVOICE_TOTAL = toFixed(grandTotal);

    return {
      evaluatedSections,
      grandTotal: toFixed(grandTotal),
      errors,
    };
  }
}
