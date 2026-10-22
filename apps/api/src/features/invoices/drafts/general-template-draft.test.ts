/**
 * general-template-draft.test.ts
 *
 * Exhaustive integration & unit tests for General Template Draft Hydration & Operations:
 *   1. DraftSeeder.hydrateFromTemplate:
 *      - Preserves custom `cellValues` across all template rows.
 *      - Remaps immutable formula tags {{$tok:OLD_UUID}} to newly generated draft UUIDs.
 *      - Retains section and row topological hierarchy without token corruption.
 *   2. DraftsController.getDraftById:
 *      - Includes `sourceTemplate` with `templateType: "general"` and `columnDefinitions`.
 *   3. Edge cases & Stress tests:
 *      - Empty cellValues defaults to {} without throwing null pointer exceptions.
 *      - Multi-row general templates with 50+ lines preserve cellValues for each row distinctly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbQuery } = vi.hoisted(() => ({
  mockDbQuery: {
    invoiceDrafts: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

let selectResultsQueue: any[] = [];

function createChainableQuery(data: any) {
  const query: any = {
    from: vi.fn(() => query),
    innerJoin: vi.fn(() => query),
    leftJoin: vi.fn(() => query),
    where: vi.fn(() => query),
    orderBy: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: any, reject?: any) => Promise.resolve(data).then(resolve, reject),
  };
  return query;
}

vi.mock("@starter/db", () => {
  return {
    db: {
      query: mockDbQuery,
      select: vi.fn(() => {
        const nextData = selectResultsQueue.length > 0 ? selectResultsQueue.shift() : [];
        return createChainableQuery(nextData);
      }),
      update: vi.fn(() => createChainableQuery([])),
      insert: vi.fn(() => createChainableQuery([])),
      delete: vi.fn(() => createChainableQuery([])),
      transaction: vi.fn(async (cb) =>
        cb({
          query: mockDbQuery,
          select: vi.fn(() => createChainableQuery([])),
          update: vi.fn(() => createChainableQuery([])),
        }),
      ),
    },
    invoiceDrafts: { id: "id", organizationId: "organization_id" },
    invoiceTemplates: {
      id: "id",
      version: "version",
      templateType: "template_type",
      columnDefinitions: "column_definitions",
    },
    templateSections: { id: "id", templateId: "template_id" },
    templateRows: {
      id: "id",
      templateId: "template_id",
      sectionId: "section_id",
      cellValues: "cell_values",
    },
    templateRowCharges: { id: "id", rowId: "row_id" },
    templateSectionCharges: { id: "id", templateId: "template_id" },
    templateConstants: { id: "id", templateId: "template_id" },
    templateHeaderFields: { id: "id", templateId: "template_id" },
    tokens: { id: "id", tokenKey: "token_key", label: "label", sortOrder: "sort_order" },
    projects: { id: "id", organizationId: "organization_id" },
    clients: { id: "id" },
    customFieldDefinitions: { id: "id" },
  };
});

vi.mock("../../engine/document-number", () => ({
  getProjectedDocumentNumber: vi.fn().mockResolvedValue("INV-0001"),
}));

import { DraftSeeder } from "./draft-seeder";
import { DraftsController } from "./drafts.controller";

describe("General Template Draft Hydration & Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResultsQueue = [];
  });

  describe("DraftSeeder.hydrateFromTemplate with General Templates", () => {
    it("hydrates multi-column cellValues accurately into draft sections", async () => {
      const templateId = "tpl-general-1";
      const oldRowId1 = "00000000-0000-0000-0000-000000000001";
      const oldRowId2 = "00000000-0000-0000-0000-000000000002";
      const oldSecId = "00000000-0000-0000-0000-000000000010";

      // Queue results for DraftSeeder's sequential db.select queries:
      selectResultsQueue = [
        [{ version: 3 }], // 1. template version
        [], // 2. template constants
        [], // 3. template headers
        [
          // 4. template sections
          {
            id: oldSecId,
            templateId,
            sectionToken: "SEC_1",
            label: "Expenses Section",
            sortOrder: 0,
          },
        ],
        [
          // 5. template rows with custom cellValues
          {
            id: oldRowId1,
            templateId,
            sectionId: oldSecId,
            valueType: "normal",
            formula: null,
            initialValue: 250,
            cellValues: {
              col_dept: "Marketing",
              col_qty: 5,
              col_unit_rate: 50,
              col_amount: 250,
            },
            rowToken: "ROW_1",
            label: "Digital Ads",
            sortOrder: 0,
          },
          {
            id: oldRowId2,
            templateId,
            sectionId: oldSecId,
            valueType: "formula",
            formula: `{{$tok:${oldRowId1}}} * 0.1`,
            initialValue: null,
            cellValues: {
              col_dept: "Finance",
              col_note: "Management fee",
            },
            rowToken: "ROW_2",
            label: "Agency Commission",
            sortOrder: 1,
          },
        ],
        [], // 6. row charges
        [], // 7. section charges
      ];

      const result = await DraftSeeder.hydrateFromTemplate(templateId);

      expect(result.sourceTemplateVersion).toBe(3);
      expect(result.draftSections.length).toBe(1);

      const section = result.draftSections[0];
      expect(section.label).toBe("Expenses Section");
      expect(section.rows.length).toBe(2);

      const row1 = section.rows[0];
      expect(row1.label).toBe("Digital Ads");
      expect(row1.cellValues).toEqual({
        col_dept: "Marketing",
        col_qty: 5,
        col_unit_rate: 50,
        col_amount: 250,
      });

      const row2 = section.rows[1];
      expect(row2.label).toBe("Agency Commission");
      expect(row2.cellValues).toEqual({
        col_dept: "Finance",
        col_note: "Management fee",
      });

      // Verify formula remapping: oldRowId1 UUID was remapped to the new UUID of row1
      expect(row2.formula).toBe(`{{$tok:${row1.id}}} * 0.1`);
    });

    it("defaults empty cellValues to {} gracefully without errors", async () => {
      selectResultsQueue = [
        [{ version: 1 }],
        [], // constants
        [], // headers
        [{ id: "s-1", sectionToken: "SEC_1", sortOrder: 0 }], // sections
        [
          {
            id: "r-1",
            sectionId: "s-1",
            cellValues: null, // NULL in database
            rowToken: "ROW_1",
            label: "Unconfigured Row",
            sortOrder: 0,
          },
        ], // rows
        [], // row charges
        [], // section charges
      ];

      const result = await DraftSeeder.hydrateFromTemplate("tpl-null-cells");
      expect(result.draftSections[0].rows[0].cellValues).toEqual({});
    });
  });

  describe("DraftsController.getDraftById with General Template Metadata", () => {
    it("eager loads sourceTemplate with templateType and columnDefinitions", async () => {
      const mockDraft = {
        id: "draft-general-123",
        organizationId: "org-1",
        name: "Q4 General Expense Draft",
        sourceTemplateId: "tpl-gen-99",
        sourceTemplate: {
          id: "tpl-gen-99",
          name: "Company Wide Expenses",
          templateType: "general",
          columnDefinitions: [
            { id: "col-1", key: "col_cat", label: "Category", type: "text", width: 140 },
            {
              id: "col-2",
              key: "col_amount",
              label: "Amount",
              type: "currency",
              width: 120,
              isTotaled: true,
            },
          ],
        },
        draftSections: [],
      };

      mockDbQuery.invoiceDrafts.findFirst.mockResolvedValue(mockDraft);

      const c = {
        req: { param: vi.fn().mockReturnValue("draft-general-123") },
        get: vi.fn().mockImplementation((key: string) => {
          if (key === "organizationId") return "org-1";
          if (key === "userId") return "user-1";
          return undefined;
        }),
        json: vi.fn().mockImplementation((data: any) => data),
      } as any;

      const res: any = await DraftsController.getDraftById(c);

      expect(res.id).toBe("draft-general-123");
      expect(res.sourceTemplate.templateType).toBe("general");
      expect(res.sourceTemplate.columnDefinitions.length).toBe(2);
      expect(res.sourceTemplate.columnDefinitions[1].isTotaled).toBe(true);
    });
  });

  describe("High-Volume Multi-Row General Template Stress", () => {
    it("scales cleanly across 50 rows with distinct multi-column data", async () => {
      const rowList = Array.from({ length: 50 }, (_, i) => ({
        id: `old-row-${i}`,
        sectionId: "s-stress",
        valueType: "normal",
        initialValue: i * 10,
        cellValues: {
          col_sku: `SKU-${1000 + i}`,
          col_units: i + 1,
          col_total: (i + 1) * 25,
        },
        rowToken: `ROW_${i + 1}`,
        label: `Item ${i + 1}`,
        sortOrder: i,
      }));

      selectResultsQueue = [
        [{ version: 1 }],
        [], // constants
        [], // headers
        [{ id: "s-stress", sectionToken: "SEC_1", sortOrder: 0 }], // sections
        rowList, // 50 rows
        [], // row charges
        [], // section charges
      ];

      const result = await DraftSeeder.hydrateFromTemplate("tpl-50-rows");
      const hydratedRows = result.draftSections[0].rows;

      expect(hydratedRows.length).toBe(50);
      expect(hydratedRows[49].cellValues).toEqual({
        col_sku: "SKU-1049",
        col_units: 50,
        col_total: 1250,
      });
      // All IDs must be unique
      const ids = new Set(hydratedRows.map((r: any) => r.id));
      expect(ids.size).toBe(50);
    });
  });
});
