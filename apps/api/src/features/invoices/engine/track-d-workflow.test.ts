import { describe, expect, it, vi } from "vitest";

// Mock @starter/db to prevent DATABASE_URL requirement in unit tests
vi.mock("@starter/db", () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(() => ({
        values: vi.fn().mockResolvedValue([]),
      })),
      update: vi.fn(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    },
    eq: vi.fn((a, b) => ({ op: "eq", a, b })),
    and: vi.fn((...args) => ({ op: "and", args })),
    gte: vi.fn((a, b) => ({ op: "gte", a, b })),
    lte: vi.fn((a, b) => ({ op: "lte", a, b })),
    sql: vi.fn(() => ""),
    tokens: {
      id: "id",
      tokenKey: "token_key",
      organizationId: "organization_id",
      isSystem: "is_system",
      templateId: "template_id",
    },
    templateConstants: { templateId: "template_id" },
    templateHeaderFields: {
      templateId: "template_id",
      isFormulaInjectable: "is_formula_injectable",
    },
    projects: { id: "id", organizationId: "organization_id" },
    projectStatuses: { id: "id", name: "name" },
    expenses: {
      id: "id",
      organizationId: "organization_id",
      projectId: "project_id",
      createdAt: "created_at",
      categoryId: "category_id",
      amount: "amount",
    },
    expenseCategories: { id: "id", tokenKey: "token_key", organizationId: "organization_id" },
    organizationConfigs: {
      organizationId: "organization_id",
      isFormulaInjectable: "is_formula_injectable",
    },
    customFieldDefinitions: { organizationId: "organization_id" },
    invoiceTemplates: { id: "id", organizationId: "organization_id" },
    templateSections: { id: "id", templateId: "template_id" },
    templateRows: { id: "id", templateId: "template_id" },
    decodeFormulaForEval: (f: string) => f,
  };
});

vi.mock("drizzle-orm", async () => {
  const actual: any = await vi.importActual("drizzle-orm");
  return {
    ...actual,
    gte: vi.fn((a, b) => ({ op: "gte", a, b })),
    lte: vi.fn((a, b) => ({ op: "lte", a, b })),
  };
});

import { seedAgencyTemplates } from "@starter/db/seed-agency-templates";
import { gte, lte } from "drizzle-orm";
import { resolveScope } from "./token-resolver.service";

function createMockDb(categorySums: any[] = []) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    then: (resolve: any) => Promise.resolve(categorySums).then(resolve),
  };

  return {
    select: vi.fn(() => chain),
  };
}

describe("Track D — Workflow Engine & Invoicing Pipeline", () => {
  describe("Default Lifetime Billing vs Optional Period Filtering", () => {
    it("defaults to full project lifetime without gte/lte conditions when period dates are omitted", async () => {
      vi.clearAllMocks();

      const mockDb = createMockDb([{ tokenKey: "MEALS", isSystem: false, total: "350.000000" }]);

      const scope = await resolveScope({
        projectId: "proj-1",
        organizationId: "org-1",
        templateId: "tpl-1",
        db: mockDb,
        // No periodStart or periodEnd passed!
      });

      expect(gte).not.toHaveBeenCalled();
      expect(lte).not.toHaveBeenCalled();
      expect(scope.EXP_TOTAL).toBe("350.000000");
      expect(scope.EXP_MEALS).toBe("350.000000");
    });

    it("applies gte and lte conditions when periodStart and periodEnd are explicitly provided", async () => {
      vi.clearAllMocks();

      const mockDb = createMockDb([{ tokenKey: "TRAVEL", isSystem: false, total: "1200.000000" }]);

      const scope = await resolveScope({
        projectId: "proj-1",
        organizationId: "org-1",
        templateId: "tpl-1",
        db: mockDb,
        periodStart: "2026-03-01",
        periodEnd: "2026-03-31T23:59:59.999Z",
      });

      expect(gte).toHaveBeenCalled();
      expect(lte).toHaveBeenCalled();
      expect(scope.EXP_TOTAL).toBe("1200.000000");
      expect(scope.EXP_TRAVEL).toBe("1200.000000");
    });

    it("accepts null/undefined period dates gracefully and falls back to full lifetime", async () => {
      vi.clearAllMocks();

      const mockDb = createMockDb([]);

      const scope = await resolveScope({
        projectId: "proj-1",
        organizationId: "org-1",
        templateId: "tpl-1",
        db: mockDb,
        periodStart: null,
        periodEnd: undefined,
      });

      expect(gte).not.toHaveBeenCalled();
      expect(lte).not.toHaveBeenCalled();
      expect(scope.EXP_TOTAL).toBe("0.000000");
    });
  });

  describe("Seed Agency Templates", () => {
    it("skips template seeding if organization already has invoice templates", async () => {
      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ id: "existing-tpl" }]),
        })),
        insert: vi.fn(),
      };

      await seedAgencyTemplates(mockDb, "org-1", "user-1");

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("seeds Creative Agency Retainer and Time & Materials templates when org has no templates", async () => {
      const insertedRows: any[] = [];
      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([]), // No existing templates
        })),
        insert: vi.fn(() => ({
          values: vi.fn().mockImplementation((val) => {
            insertedRows.push(val);
            return Promise.resolve();
          }),
        })),
      };

      await seedAgencyTemplates(mockDb, "org-1", "user-1");

      expect(mockDb.insert).toHaveBeenCalled();
      // Check that templates were inserted
      const templateInserts = insertedRows.filter(
        (r) => r.name === "Creative Agency Retainer & Pass-Through",
      );
      expect(templateInserts.length).toBeGreaterThan(0);
      expect(templateInserts[0].documentPrefix).toBe("INV");

      // Check that formulas use EXP_TOTAL and CLAMP
      const rowInserts = insertedRows.filter((r) => r.formula);
      const clampRow = rowInserts.find((r) => r.formula?.includes("CLAMP"));
      expect(clampRow).toBeDefined();
      expect(clampRow.formula).toBe("CLAMP(EXP_TOTAL * 0.10, 50, 500)");
    });
  });
});
