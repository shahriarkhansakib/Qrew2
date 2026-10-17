import { describe, expect, it, vi } from "vitest";

// Mock @starter/db to prevent DATABASE_URL requirement in unit tests
vi.mock("@starter/db", () => {
  return {
    db: {},
    tokens: {},
    templateConstants: {},
    templateHeaderFields: {},
    projects: {},
    projectStatuses: {},
    expenses: {},
    expenseCategories: {},
    organizationConfigs: {},
    customFieldDefinitions: {},
    decodeFormulaForEval: (f: string) => f,
  };
});

import { AstEvaluatorService, roundToCurrency } from "./ast-evaluator.service";
import { parseToBN } from "./token-resolver.service";
import { interpolate } from "./text-interpolator.service";
import type { EvaluatorSection } from "./types";

describe("Invoice Engine — Precision & Arithmetic Integrity", () => {
  describe("parseToBN (Zero-Float String Parsing)", () => {
    it("converts string numerals directly into BigNumber without IEEE-754 drift", () => {
      const bn = parseToBN("14280.415678");
      expect(bn.toFixed(6)).toBe("14280.415678");
    });

    it("safely handles sub-cent precision strings", () => {
      const bn = parseToBN("0.000123456789");
      expect(bn.toFixed(12)).toBe("0.000123456789");
    });

    it("parses integer and zero strings cleanly", () => {
      expect(parseToBN("0").toFixed(6)).toBe("0.000000");
      expect(parseToBN("1000000").toFixed(6)).toBe("1000000.000000");
    });

    it("handles negative numbers correctly", () => {
      expect(parseToBN("-450.50").toFixed(6)).toBe("-450.500000");
    });

    it("falls back to zero on invalid, NaN, null, or undefined values", () => {
      expect(parseToBN(null).toFixed(6)).toBe("0.000000");
      expect(parseToBN(undefined).toFixed(6)).toBe("0.000000");
      expect(parseToBN("").toFixed(6)).toBe("0.000000");
      expect(parseToBN("invalid_text").toFixed(6)).toBe("0.000000");
      expect(parseToBN("NaN").toFixed(6)).toBe("0.000000");
    });
  });

  describe("roundToCurrency (Exact Commercial Half-Up Rounding)", () => {
    it("rounds .415 up to .42 (ROUND_HALF_UP)", () => {
      expect(roundToCurrency("14280.415")).toBe("14280.42");
    });

    it("rounds .414 down to .41", () => {
      expect(roundToCurrency("14280.414")).toBe("14280.41");
    });

    it("rounds half-cent correctly at edge thresholds", () => {
      expect(roundToCurrency("0.005")).toBe("0.01");
      expect(roundToCurrency("0.0049")).toBe("0.00");
      expect(roundToCurrency("100.995")).toBe("101.00");
    });

    it("handles negative values symmetrically", () => {
      expect(roundToCurrency("-14280.415")).toBe("-14280.42");
      expect(roundToCurrency("-14280.414")).toBe("-14280.41");
    });

    it("handles null, undefined, and empty string fallbacks safely", () => {
      expect(roundToCurrency(null)).toBe("0.00");
      expect(roundToCurrency(undefined)).toBe("0.00");
      expect(roundToCurrency("")).toBe("0.00");
    });
  });

  describe("Non-Fatal Division by Zero in AST Evaluator", () => {
    it("safely evaluates division by zero to 0.000000 and records a diagnostic notice", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          label: "Operations",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-div-zero",
              rowToken: "DIV_ZERO_ROW",
              label: "Zero Divisor Test",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "100 / 0",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-dependent",
              rowToken: "DEPENDENT_ROW",
              label: "Dependent Row",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "DIV_ZERO_ROW + 50",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const topologicalOrder = [
        "DIV_ZERO_ROW_BASE",
        "DIV_ZERO_ROW_CHARGES",
        "DIV_ZERO_ROW",
        "DEPENDENT_ROW_BASE",
        "DEPENDENT_ROW_CHARGES",
        "DEPENDENT_ROW",
        "SEC_A_BASE",
        "SEC_A_CHARGES",
        "SEC_A",
      ];

      const result = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        topologicalOrder,
      );

      // Should not throw fatal errors
      expect(result.errors).toHaveLength(0);

      const sec = result.evaluatedSections[0];
      const divRow = sec.rows.find((r) => r.rowToken === "DIV_ZERO_ROW");
      expect(divRow).toBeDefined();
      expect(divRow?.baseValue).toBe("0.000000");

      // Notice should be attached directly to the row
      expect(divRow?.notices).toBeDefined();
      expect(divRow?.notices?.some((n) => n.code === "DIVISION_BY_ZERO")).toBe(true);

      // Dependent row should proceed gracefully without cascade failure
      const depRow = sec.rows.find((r) => r.rowToken === "DEPENDENT_ROW");
      expect(depRow).toBeDefined();
      expect(depRow?.baseValue).toBe("50.000000");

      // Section total should reflect the valid evaluated rows
      expect(sec.sectionTotal).toBe("50.000000");
      expect(result.grandTotal).toBe("50.000000");
    });
  });

  describe("Sub-Cent Calculation & Aggregation Integrity", () => {
    it("preserves exact precision on rate calculations without floating-point artifacts", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-ops",
          sectionToken: "A",
          label: "Agency Services",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "SERVICE",
              label: "Base Agency Fee",
              sectionId: "sec-ops",
              valueType: "normal",
              initialValue: "14280.41",
              charges: [
                {
                  id: "chg-vat",
                  chargeToken: "SERVICE_VAT",
                  label: "VAT 15%",
                  formula: "SERVICE_BASE * 0.15",
                  sortOrder: 0,
                },
              ],
              sortOrder: 0,
            },
          ],
        },
      ];

      const topologicalOrder = [
        "SERVICE_BASE",
        "SERVICE_VAT",
        "SERVICE_CHARGES",
        "SERVICE",
        "SEC_A_BASE",
        "SEC_A_CHARGES",
        "SEC_A",
      ];

      const result = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        topologicalOrder,
      );

      expect(result.errors).toHaveLength(0);
      const row = result.evaluatedSections[0].rows[0];

      // 14280.41 * 0.15 = exactly 2142.0615
      expect(row.charges[0].value).toBe("2142.061500");
      expect(row.chargesValue).toBe("2142.061500");

      // Total = 14280.410000 + 2142.061500 = 16422.471500
      expect(row.totalValue).toBe("16422.471500");
      expect(result.grandTotal).toBe("16422.471500");

      // Verify commercial 2-decimal rounded display
      expect(roundToCurrency(result.grandTotal)).toBe("16422.47");
    });
  });

  describe("Text Interpolation Clean Formatting", () => {
    it("strips trailing zeros without converting through floating-point", () => {
      const scope = {
        FILE_AMOUNT: "20151.000000",
        FILE_RATE: "0.150000",
        FILE_ZERO: "0.000000",
      };

      expect(interpolate("Amount is {{$FILE_AMOUNT}}", scope)).toBe("Amount is 20151");
      expect(interpolate("Rate is {{$FILE_RATE}}", scope)).toBe("Rate is 0.15");
      expect(interpolate("Zero is {{$FILE_ZERO}}", scope)).toBe("Zero is 0");
    });
  });
});
