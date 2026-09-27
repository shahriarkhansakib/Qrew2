import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @starter/db
vi.mock("@starter/db", () => {
  const eq = vi.fn();
  const and = vi.fn();
  const sql = vi.fn();

  const makeSelectChain = (result: any[] = []) => ({
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  });

  const db = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    })),
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };

  return {
    db,
    eq,
    and,
    sql,
    expenseCategories: { id: "id", tokenKey: "tokenKey", organizationId: "organizationId" },
    expenses: {
      categoryId: "categoryId",
      projectId: "projectId",
      organizationId: "organizationId",
      amount: "amount",
    },
    organizationConfigs: {
      organizationId: "organizationId",
      isFormulaInjectable: "isFormulaInjectable",
    },
    templateConstants: { templateId: "templateId" },
    templateHeaderFields: { templateId: "templateId", isFormulaInjectable: "isFormulaInjectable" },
    projects: { id: "id", organizationId: "organizationId" },
    projectStatuses: { id: "id", name: "name" },
    invoiceTemplates: {
      id: "id",
      documentPrefix: "documentPrefix",
      numberingFormat: "numberingFormat",
    },
    invoiceDocumentSequences: {
      id: "id",
      organizationId: "organizationId",
      currentValue: "currentValue",
    },
    decodeFormulaForEval: (f: string) => f,
  };
});

import { AstEvaluatorService } from "./ast-evaluator.service";
import { DagValidatorService } from "./dag-validator.service";
import { generateDocumentNumber } from "./document-number";
import type { EvaluatorSection } from "./types";

describe("Invoice Engine Engine & Security Hardening Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DagValidatorService Strict Restrictions", () => {
    it("allows row charges referencing ROW_<TOKEN>_BASE and external tokens", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "SEC1",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "PORT_DUES",
              label: "Port Dues",
              sectionId: "sec-1",
              valueType: "normal",
              sortOrder: 0,
              charges: [
                {
                  id: "chg-1",
                  chargeToken: "PORT_DUES_VAT",
                  label: "VAT",
                  formula: "PORT_DUES_BASE * GBL_VAT_RATE",
                  sortOrder: 0,
                },
              ],
            },
          ],
          sectionCharges: [],
        },
      ];

      const externalTokens = new Set(["GBL_VAT_RATE"]);
      const result = DagValidatorService.validate(sections, externalTokens);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects row charges referencing total ROW_<TOKEN> (zero-compounding security)", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "SEC1",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "PORT_DUES",
              label: "Port Dues",
              sectionId: "sec-1",
              valueType: "normal",
              sortOrder: 0,
              charges: [
                {
                  id: "chg-1",
                  chargeToken: "PORT_DUES_VAT",
                  label: "VAT",
                  formula: "PORT_DUES * 0.15", // ILLEGAL: referencing total PORT_DUES instead of PORT_DUES_BASE
                  sortOrder: 0,
                },
              ],
            },
          ],
          sectionCharges: [],
        },
      ];

      const result = DagValidatorService.validate(sections);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("CHARGE_SCOPE_VIOLATION");
    });

    it("catches circular dependencies", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "SEC1",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "ROW_1",
              label: "Row 1",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROW_2 * 2", // Circular with ROW_2
              sortOrder: 0,
              charges: [],
            },
            {
              id: "row-2",
              rowToken: "ROW_2",
              label: "Row 2",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "ROW_1 * 2", // Circular with ROW_1
              sortOrder: 1,
              charges: [],
            },
          ],
          sectionCharges: [],
        },
      ];

      const result = DagValidatorService.validate(sections);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("CIRCULAR_DEPENDENCY");
    });
  });

  describe("AstEvaluatorService", () => {
    it("evaluates simple base values and row charges accurately using BigNumber precision", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "SEC1",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "PORT_DUES",
              label: "Port Dues",
              sectionId: "sec-1",
              valueType: "normal",
              initialValue: "100.000000",
              sortOrder: 0,
              charges: [
                {
                  id: "chg-1",
                  chargeToken: "PORT_DUES_VAT",
                  label: "VAT",
                  formula: "PORT_DUES_BASE * 0.15",
                  sortOrder: 0,
                },
              ],
            },
          ],
          sectionCharges: [],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections, grandTotal, errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors.length).toBe(0);
      expect(evaluatedSections[0].rows[0].baseValue).toBe("100.000000");
      expect(evaluatedSections[0].rows[0].chargesValue).toBe("15.000000");
      expect(evaluatedSections[0].rows[0].totalValue).toBe("115.000000");
      expect(grandTotal).toBe("115.000000");
    });

    it("handles division by zero as a controlled DIVISION_BY_ZERO domain error", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "SEC1",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "PORT_DUES",
              label: "Port Dues",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "100 / 0",
              sortOrder: 0,
              charges: [],
            },
          ],
          sectionCharges: [],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { errors } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].code).toBe("DIVISION_BY_ZERO");
      expect(errors[0].message).toContain("Division by zero");
    });

    it("preserves exact decimal math without floating-point precision loss", () => {
      const sections: EvaluatorSection[] = [
        {
          id: "sec-1",
          sectionToken: "SEC1",
          sortOrder: 0,
          rows: [
            {
              id: "row-1",
              rowToken: "PRECISE_SUM",
              label: "Precise Sum",
              sectionId: "sec-1",
              valueType: "formula",
              formula: "0.1 + 0.2",
              sortOrder: 0,
              charges: [],
            },
          ],
          sectionCharges: [],
        },
      ];

      const dag = DagValidatorService.validate(sections);
      const { evaluatedSections } = AstEvaluatorService.evaluate(
        sections,
        {},
        {},
        {},
        {},
        dag.topologicalOrder,
      );

      // In IEEE 754 floating point: 0.1 + 0.2 = 0.30000000000000004
      // With BigNumber math, precision is exactly 0.300000
      expect(evaluatedSections[0].rows[0].baseValue).toBe("0.300000");
    });
  });

  describe("generateDocumentNumber Pattern Engine", () => {
    it("replaces format pattern tokens correctly", async () => {
      const mockTx = {
        select: vi.fn(() => ({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi
            .fn()
            .mockResolvedValue([
              { documentPrefix: "PDA", numberingFormat: "{PREFIX}-{YYYY}-{MM}-{SEQ:4}" },
            ]),
        })),
        insert: vi.fn(() => ({
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ currentValue: 7 }]),
        })),
        update: vi.fn(() => ({
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ currentValue: 8 }]),
        })),
      };

      const docNum = await generateDocumentNumber({
        organizationId: "org-1",
        projectId: "proj-1",
        sourceTemplateId: "tpl-1",
        tx: mockTx,
      });

      const now = new Date();
      const YYYY = now.getFullYear().toString();
      const MM = (now.getMonth() + 1).toString().padStart(2, "0");

      expect(docNum).toBe(`PDA-${YYYY}-${MM}-0008`);
    });
  });
});
