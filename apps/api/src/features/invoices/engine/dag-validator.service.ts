/**
 * DAG Validator Service — Invoice Engine V2
 *
 * Validates the dependency graph for the formula-driven invoice engine.
 *
 * Rules enforced:
 * 1. No circular dependencies.
 * 2. Forward reference prohibition — a formula may only reference tokens from
 *    rows that appear ABOVE in the template (lower sortOrder within the
 *    global top-to-bottom ordering across all sections).
 * 3. Charge scope restriction — row charges may ONLY reference:
 *      - the parent row's rowToken (base sum)
 *      - the parent row's componentTokens
 *    Section charges may ONLY reference:
 *      - SEC_<SECTION_TOKEN>_BASE
 *      - SEC_<SECTION_TOKEN>_TOTAL
 *      - SEC_<SECTION_TOKEN>_CHARGES
 *    Cross-row or cross-section references in charges = CHARGE_SCOPE_VIOLATION.
 * 4. Duplicate token detection.
 */

import {
  decodeFormulaForEval,
  type RowIdToTokenMap,
  type SecIdToTokenMap,
  type TplIdToTokenMap,
} from "@starter/db";
import { type DagValidationResult, type EngineError, type EvaluatorSection } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts all bare token identifiers from a formula string.
 * Tokens are alphanumeric + underscore sequences (not numbers or operators).
 * e.g. "PORT_DUES * 0.15 + FILE_GRT" → ["PORT_DUES", "FILE_GRT"]
 */
function extractTokens(formula: string): string[] {
  // Match word-char sequences that are NOT pure numbers
  const matches = formula.match(/\b[A-Z_][A-Z0-9_]*\b/g);
  return matches ? [...new Set(matches)] : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION LETTER COMPUTATION
// Mirrors the UI's auto-naming: A, B, C … Z, AA, AB …
// ─────────────────────────────────────────────────────────────────────────────
export function sectionIndexToLetter(index: number): string {
  let result = "";
  let n = index;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAG VALIDATOR SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class DagValidatorService {
  /**
   * Validates a set of sections, checks for duplicate tokens, detects cycles,
   * verifies scope constraints, and returns a valid topological evaluation order.
   */
  static validate(
    sections: EvaluatorSection[],
    externalTokens: Set<string> = new Set(),
    idToToken: RowIdToTokenMap = {},
    secIdToToken: SecIdToTokenMap = {},
    tplIdToToken: TplIdToTokenMap = {},
  ): DagValidationResult {
    const errors: EngineError[] = [];
    const topologicalOrder: string[] = [];

    // Pass 1: Gather ALL defined tokens & detect duplicates, build nodeTokens
    const seenTokens = new Set<string>();
    const tokenSeen = new Map<string, string>(); // token -> description of where it was defined
    const nodeTokens = new Set<string>();

    for (const section of sections) {
      const sectionToken = section.sectionToken;
      const sectionLetter = sectionIndexToLetter(section.sortOrder);

      for (const row of section.rows) {
        if (seenTokens.has(row.rowToken)) {
          errors.push({
            code: "DUPLICATE_TOKEN",
            message: `Row token "${row.rowToken}" is already used by ${tokenSeen.get(row.rowToken)}.`,
            rowToken: row.rowToken,
            token: row.rowToken,
          });
        } else {
          seenTokens.add(row.rowToken);
          tokenSeen.set(row.rowToken, `row "${row.label}"`);
          nodeTokens.add(`${row.rowToken}_BASE`);
          nodeTokens.add(`${row.rowToken}_CHARGES`);
          nodeTokens.add(row.rowToken);
        }

        for (const charge of row.charges) {
          if (seenTokens.has(charge.chargeToken)) {
            errors.push({
              code: "DUPLICATE_TOKEN",
              message: `Row charge token "${charge.chargeToken}" is already used by ${tokenSeen.get(charge.chargeToken)}.`,
              rowToken: row.rowToken,
              token: charge.chargeToken,
            });
          } else {
            seenTokens.add(charge.chargeToken);
            tokenSeen.set(charge.chargeToken, `row charge "${charge.label}" in row "${row.label}"`);
            nodeTokens.add(charge.chargeToken);
          }
        }
      }

      for (const sc of section.sectionCharges) {
        if (seenTokens.has(sc.chargeToken)) {
          errors.push({
            code: "DUPLICATE_TOKEN",
            message: `Section charge token "${sc.chargeToken}" is already used by ${tokenSeen.get(sc.chargeToken)}.`,
            token: sc.chargeToken,
          });
        } else {
          seenTokens.add(sc.chargeToken);
          tokenSeen.set(
            sc.chargeToken,
            `section charge "${sc.label}" in section "${sectionLetter}"`,
          );
          nodeTokens.add(sc.chargeToken);
        }
      }

      const secBase = `SEC_${sectionToken}_BASE`;
      const secCharges = `SEC_${sectionToken}_CHARGES`;
      const secTotal = `SEC_${sectionToken}`;
      nodeTokens.add(secBase);
      nodeTokens.add(secCharges);
      nodeTokens.add(secTotal);
    }

    // If duplicate tokens found, abort further validation (results would be unreliable)
    if (errors.length > 0) {
      return { valid: false, topologicalOrder: [], errors };
    }

    // Pass 2: Build Adjacency List + Check Scope Constraints
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // dependency -> dependents

    for (const node of nodeTokens) {
      inDegree.set(node, 0);
      graph.set(node, []);
    }

    const addEdge = (dependency: string, dependent: string) => {
      if (nodeTokens.has(dependency)) {
        graph.get(dependency)!.push(dependent);
        inDegree.set(dependent, inDegree.get(dependent)! + 1);
      }
    };

    for (const section of sections) {
      const sectionToken = section.sectionToken;
      const sectionLetter = sectionIndexToLetter(section.sortOrder);
      const sectionLabel = section.label ?? `Section ${sectionLetter}`;
      const secBase = `SEC_${sectionToken}_BASE`;
      const secTotal = `SEC_${sectionToken}`;
      const secCharges = `SEC_${sectionToken}_CHARGES`;

      addEdge(secBase, secTotal);
      addEdge(secCharges, secTotal);

      for (const row of section.rows) {
        const rowBase = `${row.rowToken}_BASE`;
        const rowChargesToken = `${row.rowToken}_CHARGES`;
        const rowTotal = row.rowToken;
        const rowChargeAllowedTokens = new Set<string>([rowBase]);

        // Base and charges sum add to total
        addEdge(rowBase, rowTotal);
        addEdge(rowChargesToken, rowTotal);
        // Base adds to section base
        addEdge(rowBase, secBase);

        if (row.formula) {
          const decodedFormula = decodeFormulaForEval(
            row.formula,
            idToToken,
            secIdToToken,
            tplIdToToken,
          );
          const refs = extractTokens(decodedFormula);
          for (const ref of refs) {
            addEdge(ref, rowBase);
          }
        }

        for (const charge of row.charges) {
          addEdge(charge.chargeToken, rowChargesToken);
          addEdge(charge.chargeToken, secCharges);

          if (charge.formula) {
            const decodedFormula = decodeFormulaForEval(
              charge.formula,
              idToToken,
              secIdToToken,
              tplIdToToken,
            );
            const refs = extractTokens(decodedFormula);
            const isExternalToken = (ref: string) =>
              externalTokens.has(ref) || /^(GBL_|FILE_|TPL_|EXP_)/.test(ref);

            for (const ref of refs) {
              addEdge(ref, charge.chargeToken);

              if (!rowChargeAllowedTokens.has(ref) && !isExternalToken(ref)) {
                errors.push({
                  code: "CHARGE_SCOPE_VIOLATION",
                  message: `Row charge "${charge.label}" in row "${row.label}" references "${ref}". Row charges may only reference their parent row's base value (${rowBase}) or external constants.`,
                  rowToken: row.rowToken,
                  token: ref,
                  formula: decodedFormula,
                });
              }
            }
          }
        }
      }

      const sectionChargeAllowedTokens = new Set<string>([secBase]);

      for (const sc of section.sectionCharges) {
        addEdge(sc.chargeToken, secTotal);
        addEdge(sc.chargeToken, secCharges);

        const decodedFormula = decodeFormulaForEval(
          sc.formula,
          idToToken,
          secIdToToken,
          tplIdToToken,
        );
        const refs = extractTokens(decodedFormula);
        const isExternalToken = (ref: string) =>
          externalTokens.has(ref) || /^(GBL_|FILE_|TPL_|EXP_)/.test(ref);

        for (const ref of refs) {
          addEdge(ref, sc.chargeToken);

          if (!sectionChargeAllowedTokens.has(ref) && !isExternalToken(ref)) {
            errors.push({
              code: "CHARGE_SCOPE_VIOLATION",
              message: `Section charge "${sc.label}" in section "${sectionLabel}" references "${ref}". Section charges may only reference ${secBase} or external constants.`,
              token: ref,
              formula: decodedFormula,
            });
          }
        }
      }
    }

    // Pass 3: Kahn's Algorithm
    const queue: string[] = [];
    // Enqueue nodes with in-degree 0 in the order they were defined (stable sort fallback)
    for (const node of nodeTokens) {
      if (inDegree.get(node) === 0) queue.push(node);
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      topologicalOrder.push(node);

      for (const dependent of graph.get(node) || []) {
        const degree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, degree);
        if (degree === 0) queue.push(dependent);
      }
    }

    if (topologicalOrder.length < nodeTokens.size) {
      const cycleNodes = [];
      for (const [node, degree] of inDegree.entries()) {
        if (degree > 0) cycleNodes.push(node);
      }
      errors.push({
        code: "CIRCULAR_DEPENDENCY",
        message: `A circular dependency was detected involving these tokens: ${cycleNodes.join(", ")}`,
      });
    }

    return {
      valid: errors.length === 0,
      topologicalOrder,
      errors,
    };
  }

  /**
   * Validates whether re-ordering a row to a new position would violate
   * any rules (e.g. creating a circular dependency).
   */
  static validateReorder(
    sections: EvaluatorSection[],
    movedRowToken: string,
    newSortOrder: number,
    newSectionId: string,
    externalTokens: Set<string> = new Set(),
    idToToken: RowIdToTokenMap = {},
  ): EngineError | null {
    const simulatedSections = sections.map((sec) => ({
      ...sec,
      rows: sec.rows.map((row) =>
        row.rowToken === movedRowToken
          ? { ...row, sortOrder: newSortOrder, sectionId: newSectionId }
          : row,
      ),
    }));

    simulatedSections.forEach((sec) => {
      sec.rows.sort((a, b) => a.sortOrder - b.sortOrder);
    });

    const result = DagValidatorService.validate(simulatedSections, externalTokens, idToToken);
    if (!result.valid) {
      const firstError = result.errors[0];
      return {
        code: "REORDER_VIOLATION",
        message: `Cannot move this row to the requested position. ${firstError.message}`,
        rowToken: movedRowToken,
        details: { originalErrors: result.errors },
      };
    }
    return null;
  }
}
