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

import { AstEvaluatorService } from "./ast-evaluator.service";
import { DagValidatorService } from "./dag-validator.service";
import { resolveScope } from "./token-resolver.service";
import type { EvaluatorSection } from "./types";
import { validateFormulaChars } from "../../invoice-templates/validation/formula-validator";

describe("Track C — AST Math Functions & Period-Aware Expenses", () => {
  describe("Backend AST Evaluator — Math Functions", () => {
    it("evaluates MIN correctly with BigNumber operands", () => {
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
              label: "Min Test",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "MIN(150, 200, 50)",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("50.000000");
    });

    it("evaluates MAX correctly with tokens and expressions", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-base",
              rowToken: "HOURLY_TOTAL",
              label: "Base Hours",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "1000",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-max",
              rowToken: "FEE",
              label: "Fee with Floor",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "MAX(HOURLY_TOTAL * 0.15, 250)",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors).toHaveLength(0);
      // 1000 * 0.15 = 150; MAX(150, 250) = 250
      expect(evaluatedSections[0].rows[1].baseValue).toBe("250.000000");
    });

    it("evaluates ROUND correctly to specified decimal places", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-round-2",
              rowToken: "ROUNDED_2",
              label: "Round to 2 decimals",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROUND(14.2857, 2)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-round-0",
              rowToken: "ROUNDED_0",
              label: "Round to 0 decimals",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROUND(14.2857, 0)",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("14.290000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("14.000000");
    });

    it("evaluates CLAMP correctly within [min, max] bounds", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-clamp-upper",
              rowToken: "CLAMP_UP",
              label: "Clamp Upper",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(150, 10, 100)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-clamp-lower",
              rowToken: "CLAMP_LOW",
              label: "Clamp Lower",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(5, 10, 100)",
              charges: [],
              sortOrder: 1,
            },
            {
              id: "row-clamp-mid",
              rowToken: "CLAMP_MID",
              label: "Clamp Mid",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(50, 10, 100)",
              charges: [],
              sortOrder: 2,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("100.000000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("10.000000");
      expect(evaluatedSections[0].rows[2].baseValue).toBe("50.000000");
    });

    it("evaluates ABS correctly for negative and positive values", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-abs-neg",
              rowToken: "ABS_NEG",
              label: "Abs Negative",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ABS(-450.75)",
              charges: [],
              sortOrder: 0,
            },
            {
              id: "row-abs-pos",
              rowToken: "ABS_POS",
              label: "Abs Positive",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ABS(120.25)",
              charges: [],
              sortOrder: 1,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("450.750000");
      expect(evaluatedSections[0].rows[1].baseValue).toBe("120.250000");
    });

    it("evaluates nested math functions cleanly", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-nested",
              rowToken: "NESTED_FN",
              label: "Nested Function Test",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "CLAMP(MAX(20, 150), 10, 100)",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors).toHaveLength(0);
      // MAX(20, 150) = 150; CLAMP(150, 10, 100) = 100
      expect(evaluatedSections[0].rows[0].baseValue).toBe("100.000000");
    });

    it("handles non-fatal division by zero inside math functions without crashing", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "A",
          sortOrder: 0,
          sectionCharges: [],
          rows: [
            {
              id: "row-fn-div-zero",
              rowToken: "FN_DIV_ZERO",
              label: "Fn Div Zero",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "MAX(100 / 0, 50)",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, errors, notices } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      // 100 / 0 safely evaluates to non-fatal 0.000000 fallback
      expect(errors).toHaveLength(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("0.000000");
      expect(evaluatedSections[0].rows[0].notices?.some((d) => d.code === "DIVISION_BY_ZERO")).toBe(
        true,
      );
    });
  });

  describe("DAG Validator — Math Function Whitelisting", () => {
    it("does not report MATH_FUNCTIONS as circular or unresolved dependencies", () => {
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
              label: "Row 1",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "MAX(10, 20)",
              charges: [],
              sortOrder: 0,
            },
          ],
        },
      ];

      const validation = DagValidatorService.validate(sections);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe("Formula Validator — Syntax & Char Allowlist", () => {
    it("permits valid commas and function calls", () => {
      expect(validateFormulaChars("MAX(ROW1, 100)").valid).toBe(true);
      expect(validateFormulaChars("CLAMP(ROW1, 10, 50)").valid).toBe(true);
      expect(validateFormulaChars("ROUND(ROW1 * 1.05, 2)").valid).toBe(true);
    });

    it("rejects illegal syntax and characters", () => {
      expect(validateFormulaChars("MAX(ROW1, 100); DROP TABLE").valid).toBe(false);
      expect(validateFormulaChars("ROW1 $ 50").valid).toBe(false);
    });
  });

  describe("Period-Aware Expense Resolution in resolveScope", () => {
    it("handles periodStart and periodEnd inputs gracefully without crashing", async () => {
      const makeSelectChain = (result: any[] = []) => {
        const chain: any = {
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue(result),
          then: (resolve: any) => Promise.resolve(result).then(resolve),
        };
        return chain;
      };

      const mockDb = {
        select: vi.fn(() => makeSelectChain([])),
      };

      const scope = await resolveScope({
        projectId: "proj-123",
        organizationId: "org-123",
        templateId: "tpl-123",
        db: mockDb,
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-31T23:59:59.999Z",
        headerFieldValues: {
          PERIOD_START: "2026-03-01",
          PERIOD_END: "2026-03-31",
        },
      });

      expect(scope).toBeDefined();
      expect(typeof scope).toBe("object");
    });
  });
});
