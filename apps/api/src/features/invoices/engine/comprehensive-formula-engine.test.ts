import { describe, expect, it, vi } from "vitest";

// Mock @starter/db to prevent DATABASE_URL requirement in unit tests
vi.mock("@starter/db", () => {
  const makeSelectChain = (result: any[] = []) => ({
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  });

  return {
    db: {
      select: vi.fn(() => makeSelectChain()),
    },
    eq: vi.fn(),
    and: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    sql: vi.fn(),
    tokens: {
      id: "id",
      tokenKey: "tokenKey",
      organizationId: "organizationId",
      isSystem: "isSystem",
    },
    templateConstants: { templateId: "templateId" },
    templateHeaderFields: { templateId: "templateId", isFormulaInjectable: "isFormulaInjectable" },
    projects: { id: "id", organizationId: "organizationId" },
    projectStatuses: { id: "id", name: "name" },
    expenses: {
      id: "id",
      organizationId: "organizationId",
      projectId: "projectId",
      createdAt: "createdAt",
      categoryId: "categoryId",
      amount: "amount",
    },
    expenseCategories: { id: "id", tokenKey: "tokenKey", organizationId: "organizationId" },
    organizationConfigs: {
      organizationId: "organizationId",
      isFormulaInjectable: "isFormulaInjectable",
    },
    customFieldDefinitions: { organizationId: "organizationId" },
    decodeFormulaForEval: (f: string) => f,
  };
});

import {
  validateFormulaChars,
  validateRateChargeFormula,
} from "../../invoice-templates/validation/formula-validator";
import { AstEvaluatorService } from "./ast-evaluator.service";
import { DagValidatorService } from "./dag-validator.service";
import type { EvaluatorSection } from "./types";

describe("Comprehensive Formula Engine Test Suite — Section by Section, Type by Type", () => {
  // Helper to quickly evaluate sections through DAG validator and AST evaluator
  const runEvaluation = (sections: EvaluatorSection[], scope: Record<string, string> = {}) => {
    const dag = DagValidatorService.validate(sections, new Set(Object.keys(scope)));
    const evalResult = AstEvaluatorService.evaluate(
      sections,
      scope,
      {},
      {},
      {},
      dag.topologicalOrder,
    );
    return { dag, ...evalResult };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 1: AST MATH FUNCTIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 1: AST Math Functions", () => {
    it("evaluates MIN with multiple BigNumber arguments", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ROW1",
              label: "Min Function",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "MIN(120.50, 45.25, 999, 12.05)",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const { dag, evaluatedSections, errors } = runEvaluation(sections);
      expect(dag.valid).toBe(true);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("12.050000");
    });

    it("evaluates MAX with multiple BigNumber arguments", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ROW1",
              label: "Max Function",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "MAX(120.50, 45.25, 999.99, 12.05)",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("999.990000");
    });

    it("evaluates ROUND with custom decimals and bankers/half-up precision", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ROW1",
              label: "Round 2 decimals",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROUND(123.4567, 2)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "ROW2",
              label: "Round 0 decimals",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROUND(123.4567, 0)",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("123.460000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("123.000000");
    });

    it("evaluates CLAMP within lower, upper, and bound edges", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "LOW_CLAMP",
              label: "Clamp below min",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(5, 10, 50)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "HIGH_CLAMP",
              label: "Clamp above max",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(100, 10, 50)",
              charges: [],
              sortOrder: 1,
            },
            {
              id: "row-3",
              rowToken: "MID_CLAMP",
              label: "Clamp inside range",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(25.5, 10, 50)",
              charges: [],
              sortOrder: 2,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("10.000000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("50.000000");
      expect(evaluatedSections[0].rows[2].baseValue).toBe("25.500000");
    });

    it("evaluates ABS for negative, positive, and zero", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ABS_NEG",
              label: "Abs Negative",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ABS(-42.75)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "ABS_POS",
              label: "Abs Positive",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ABS(18.2)",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("42.750000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("18.200000");
    });

    it("evaluates FLOOR and CEIL correctly", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "FLOOR_POS",
              label: "Floor Positive",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "FLOOR(14.89)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "CEIL_POS",
              label: "Ceil Positive",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CEIL(14.12)",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("14.000000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("15.000000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 2: ARITHMETIC OPERATORS & SYNTACTIC SUGAR
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 2: Arithmetic Operators & Syntactic Sugar", () => {
    it("evaluates standard arithmetic with operator precedence and nested parentheses", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ARITHMETIC",
              label: "Nested Math",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "((10 + 20) * 3 - 10) / 2",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      // ((30) * 3 - 10) / 2 = (90 - 10) / 2 = 80 / 2 = 40
      expect(evaluatedSections[0].rows[0].baseValue).toBe("40.000000");
    });

    it("evaluates percentage sugar and modulo desugaring", () => {
      // In our architecture, 50% desugars to (50/100) and // desugars to %
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "PCT_SUGAR",
              label: "Percentage Sugar",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "200 * (15.5 / 100)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "MOD_RESULT",
              label: "Modulo remainder",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "27 % 4",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("31.000000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("3.000000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 3: EXTERNAL TOKENS & DOMAIN SCOPE RESOLUTION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 3: External Tokens & Domain Scope Resolution", () => {
    it("evaluates formulas with FILE_*, GBL_*, and EXP_* tokens", () => {
      const scope = {
        FILE_GRT: "15000.000000",
        GBL_BERTH_RATE: "0.250000",
        EXP_PORT_FEES: "450.000000",
        EXP_TOTAL: "1200.000000",
      };

      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "BERTHAGE",
              label: "Berthage",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "FILE_GRT * GBL_BERTH_RATE",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "EXPENSE_ROW",
              label: "Expense Offset",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "EXP_PORT_FEES + EXP_TOTAL",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections, scope);
      expect(errors).toHaveLength(0);
      // 15000 * 0.25 = 3750
      expect(evaluatedSections[0].rows[0].baseValue).toBe("3750.000000");
      // 450 + 1200 = 1650
      expect(evaluatedSections[0].rows[1].baseValue).toBe("1650.000000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 4: ROW CHARGES, RATE CHARGES, AND SECTION TOTALS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 4: Row Charges & Rate Charges (Rule 1 & Cycle Prevention)", () => {
    it("evaluates row charge referencing ROW_BASE without circular dependency", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "PILOTAGE",
              label: "Pilotage Fee",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "1000",
              sortOrder: 0,
              charges: [
                {
                  id: "charge-1",
                  chargeToken: "PILOT_VAT",
                  label: "VAT 15%",
                  formula: "PILOTAGE_BASE * 0.15",
                  sortOrder: 0,
                },
              ],
            },
          ],
        },
      ];

      const { dag, evaluatedSections, errors } = runEvaluation(sections);
      expect(dag.valid).toBe(true);
      expect(errors).toHaveLength(0);
      const row = evaluatedSections[0].rows[0];
      expect(row.baseValue).toBe("1000.000000");
      expect(row.charges[0].value).toBe("150.000000");
      expect(row.totalValue).toBe("1150.000000");
      expect(evaluatedSections[0].sectionBase).toBe("1000.000000");
      expect(evaluatedSections[0].sectionTotal).toBe("1150.000000");
    });

    it("rejects row charge referencing parent canonical ROW token (zero-compounding security)", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "PORT_DUES",
              label: "Port Dues",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "2000",
              sortOrder: 0,
              charges: [
                {
                  id: "charge-1",
                  chargeToken: "PORT_SURCHARGE",
                  label: "Surcharge 10%",
                  formula: "PORT_DUES * 0.10",
                  sortOrder: 0,
                },
              ],
            },
          ],
        },
      ];

      const { dag } = runEvaluation(sections);
      expect(dag.valid).toBe(false);
      expect(dag.errors.some((e) => e.code === "CHARGE_SCOPE_VIOLATION")).toBe(true);
    });

    it("evaluates multiple row charges on a single row summing correctly", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "TUG_SERVICES",
              label: "Tug Services",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "3000",
              sortOrder: 0,
              charges: [
                {
                  id: "charge-1",
                  chargeToken: "TUG_FUEL_SURCHARGE",
                  label: "Fuel Surcharge 5%",
                  formula: "TUG_SERVICES_BASE * 0.05",
                  sortOrder: 0,
                },
                {
                  id: "charge-2",
                  chargeToken: "TUG_WEEKEND_PREMIUM",
                  label: "Weekend Premium 10%",
                  formula: "TUG_SERVICES_BASE * 0.10",
                  sortOrder: 1,
                },
              ],
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      const row = evaluatedSections[0].rows[0];
      expect(row.baseValue).toBe("3000.000000");
      expect(row.charges[0].value).toBe("150.000000");
      expect(row.charges[1].value).toBe("300.000000");
      expect(row.totalValue).toBe("3450.000000");
    });

    it("evaluates section charges computing from SEC_X_BASE and summing to grand total", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "LINE_ITEM_1",
              label: "Line 1",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "1000",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "LINE_ITEM_2",
              label: "Line 2",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "1500",
              charges: [],
              sortOrder: 1,
            },
          ],
          sectionCharges: [
            {
              id: "sec-chg-1",
              chargeToken: "SEC_A_SURCHARGE",
              label: "Admin Fee 10%",
              formula: "SEC_A_BASE * 0.10",
              sortOrder: 0,
            },
          ],
        },
      ];

      const { evaluatedSections, grandTotal, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].sectionBase).toBe("2500.000000");
      expect(evaluatedSections[0].sectionCharges[0].value).toBe("250.000000");
      expect(evaluatedSections[0].sectionTotal).toBe("2750.000000");
      expect(grandTotal).toBe("2750.000000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 5: CROSS-ROW AND CROSS-SECTION REFERENCES
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 5: Cross-Row and Cross-Section References", () => {
    it("evaluates downstream row referencing upstream row and row total", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "BASE_FEE",
              label: "Base Fee",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "500",
              charges: [
                {
                  id: "chg-1",
                  chargeToken: "BASE_TAX",
                  label: "Tax 10%",
                  formula: "BASE_FEE_BASE * 0.10",
                  sortOrder: 0,
                },
              ],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "COMPUTED_FEE",
              label: "Computed Fee",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "BASE_FEE * 2", // References total of row 1 (550 * 2 = 1100)
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const { evaluatedSections, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].totalValue).toBe("550.000000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("1100.000000");
    });

    it("evaluates row in Section B referencing Section A total", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "SEC_A_ITEM",
              label: "Section A Item",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "800",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
        {
          id: "sec-2",
          sectionToken: "B",
          sortOrder: 1,
          sectionCharges: [],
          rows: [
            {
              id: "row-2",
              rowToken: "SEC_B_ITEM",
              label: "Section B Item",
              sectionId: "sec-2",
              valueType: "formula",
              formula: "SEC_A * 0.5", // 800 * 0.5 = 400
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const { evaluatedSections, grandTotal, errors } = runEvaluation(sections);
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].sectionTotal).toBe("800.000000");
      expect(evaluatedSections[1].rows[0].baseValue).toBe("400.000000");
      expect(grandTotal).toBe("1200.000000");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 6: STRICT DAG VALIDATION & CYCLE DETECTION
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 6: Strict DAG Validation & Cycle Detection", () => {
    it("detects self-referencing circular dependency in row formula", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "CIRCULAR_SELF",
              label: "Self Reference",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CIRCULAR_SELF + 10",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      expect(dag.valid).toBe(false);
      expect(dag.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });

    it("detects mutual 2-row circular dependency cycle", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ROW_A",
              label: "Row A",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROW_B * 2",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "ROW_B",
              label: "Row B",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROW_A + 50",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      expect(dag.valid).toBe(false);
      expect(dag.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });

    it("detects multi-row indirect circular dependency across sections", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "CHAIN_1",
              label: "Chain 1",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CHAIN_3 + 10",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
        {
          id: "sec-2",
          sectionToken: "B",
          sortOrder: 1,
          sectionCharges: [],
          rows: [
            {
              id: "row-2",
              rowToken: "CHAIN_2",
              label: "Chain 2",
              sectionId: "sec-2",
              valueType: "formula",
              formula: "CHAIN_1 * 2",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-3",
              rowToken: "CHAIN_3",
              label: "Chain 3",
              sectionId: "sec-2",
              valueType: "formula",
              formula: "CHAIN_2 + 5",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      expect(dag.valid).toBe(false);
      expect(dag.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY")).toBe(true);
    });

    it("detects and rejects row charge attempting cross-row reference (CHARGE_SCOPE_VIOLATION)", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "ROW_1",
              label: "Row 1",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "100",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "ROW_2",
              label: "Row 2",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "200",
              sortOrder: 1,
              charges: [
                {
                  id: "illegal-charge",
                  chargeToken: "ILLEGAL_CHARGE",
                  label: "Illegal Cross-Row Charge",
                  formula: "ROW_1 * 0.10", // referencing another row!
                  sortOrder: 0,
                },
              ],
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      expect(dag.valid).toBe(false);
      expect(dag.errors.some((e) => e.code === "CHARGE_SCOPE_VIOLATION")).toBe(true);
    });

    it("detects and rejects duplicate tokens", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-1",
              rowToken: "DUPLICATE_KEY",
              label: "Row 1",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "100",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-2",
              rowToken: "DUPLICATE_KEY", // Duplicate!
              label: "Row 2",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "200",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      expect(dag.valid).toBe(false);
      expect(dag.errors.some((e) => e.code === "DUPLICATE_TOKEN")).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TYPE 7: FORMULA VALIDATOR STRICT UTILITIES
  // ───────────────────────────────────────────────────────────────────────────
  describe("Type 7: Formula Validator Strict Utilities", () => {
    it("validates valid rate charge formulas with ROW_BASE and rejects ROW", () => {
      expect(validateRateChargeFormula("PORT_DUES_BASE * 15%", "PORT_DUES").valid).toBe(true);
      expect(validateRateChargeFormula("PORT_DUES_BASE * 0.15", "PORT_DUES").valid).toBe(true);
      expect(validateRateChargeFormula("PORT_DUES_BASE * (15/100)", "PORT_DUES").valid).toBe(true);

      // Rejects row without _BASE (zero compounding security)
      expect(validateRateChargeFormula("PORT_DUES * 15%", "PORT_DUES").valid).toBe(false);
      // Rejects foreign row
      expect(validateRateChargeFormula("OTHER_ROW_BASE * 15%", "PORT_DUES").valid).toBe(false);
      // Rejects complex expressions in charge
      expect(validateRateChargeFormula("PORT_DUES_BASE * 15% + 10", "PORT_DUES").valid).toBe(false);
    });

    it("validates formula characters including all math functions FLOOR and CEIL", () => {
      expect(validateFormulaChars("FLOOR(ROW1 / 2)").valid).toBe(true);
      expect(validateFormulaChars("CEIL(ROW1 * 1.05)").valid).toBe(true);
      expect(validateFormulaChars("CLAMP(ROW1, 10, 100)").valid).toBe(true);
      expect(validateFormulaChars("ROUND(ROW1, 2)").valid).toBe(true);
      expect(validateFormulaChars("ABS(ROW1 - 50)").valid).toBe(true);

      // Rejects self-reference
      expect(validateFormulaChars("ROW1 + 10", "ROW1").valid).toBe(false);
      expect(validateFormulaChars("ROW1_BASE * 2", "ROW1").valid).toBe(false);
      expect(validateFormulaChars("ROW1_TOTAL - 5", "ROW1").valid).toBe(false);
    });
  });
});
