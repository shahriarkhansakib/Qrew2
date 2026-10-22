import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@starter/db", () => {
  return {
    db: {
      select: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(async (cb) => {
        return cb({
          select: vi.fn(),
          update: vi.fn(),
          query: {},
        });
      }),
      query: {
        invoiceTemplates: { findFirst: vi.fn() },
      },
    },
    invoiceTemplates: { id: "id", templateType: "template_type" },
    templateSections: { id: "id", templateId: "template_id" },
    templateRows: { id: "id", templateId: "template_id", sectionId: "section_id" },
    tokens: { id: "id", templateId: "template_id", tokenKey: "token_key", sortOrder: "sort_order" },
  };
});

vi.mock("../../invoice-templates.controller", () => ({
  touchTemplate: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@starter/db";
import { touchTemplate } from "../../invoice-templates.controller";
import { resequenceTemplateRowTokens } from "./resequence-rows.service";

function createMockTx(options: {
  template?: any;
  sections?: any[];
  rows?: any[];
  updateCalls?: any[];
}) {
  const {
    template = { id: "tpl-1", templateType: "general" },
    sections = [],
    rows = [],
    updateCalls = [],
  } = options;

  let selectCallCount = 0;

  const mockTx: any = {
    query: {
      invoiceTemplates: {
        findFirst: vi.fn().mockResolvedValue(template),
      },
    },
    select: vi.fn(() => {
      selectCallCount++;
      const currentCall = selectCallCount;
      const data = currentCall === 1 ? sections : rows;

      const builder: any = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        then: (resolve: any, reject?: any) => Promise.resolve(data).then(resolve, reject),
      };
      return builder;
    }),
    update: vi.fn(() => ({
      set: vi.fn((val) => ({
        where: vi.fn(() => {
          updateCalls.push(val);
          return Promise.resolve();
        }),
      })),
    })),
  };

  return mockTx;
}

describe("resequenceTemplateRowTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exits early if template is not found", async () => {
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
    await resequenceTemplateRowTokens("tpl-123");
    expect(db.update).not.toHaveBeenCalled();
    expect(touchTemplate).not.toHaveBeenCalled();
  });

  it("exits early if template has zero sections", async () => {
    const updateCalls: any[] = [];
    const mockTx = createMockTx({
      template: { id: "tpl-empty", templateType: "general" },
      sections: [],
      rows: [],
      updateCalls,
    });

    await resequenceTemplateRowTokens("tpl-empty", mockTx);
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it("exits early if template has zero rows across sections", async () => {
    const updateCalls: any[] = [];
    const mockTx = createMockTx({
      template: { id: "tpl-empty-rows", templateType: "general" },
      sections: [{ id: "sec-1", sortOrder: 0 }],
      rows: [],
      updateCalls,
    });

    await resequenceTemplateRowTokens("tpl-empty-rows", mockTx);
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it("does nothing (no-op) when all rows are already in perfect canonical sequence", async () => {
    const updateCalls: any[] = [];
    const mockTx = createMockTx({
      template: { id: "tpl-1", templateType: "general" },
      sections: [{ id: "sec-1", sortOrder: 0 }],
      rows: [
        { id: "row-1", sectionId: "sec-1", tokenKey: "ROW_1", sortOrder: 0 },
        { id: "row-2", sectionId: "sec-1", tokenKey: "ROW_2", sortOrder: 1 },
        { id: "row-3", sectionId: "sec-1", tokenKey: "ROW_3", sortOrder: 2 },
      ],
      updateCalls,
    });

    await resequenceTemplateRowTokens("tpl-1", mockTx);
    expect(mockTx.update).not.toHaveBeenCalled();
    expect(touchTemplate).not.toHaveBeenCalled();
  });

  it("resequences general template rows in topological order across multiple sections", async () => {
    const updateCalls: any[] = [];
    const mockTx = createMockTx({
      template: { id: "tpl-1", templateType: "general" },
      sections: [
        { id: "sec-1", sortOrder: 0 },
        { id: "sec-2", sortOrder: 1 },
      ],
      rows: [
        { id: "row-b", sectionId: "sec-1", tokenKey: "ROW_99", sortOrder: 1 },
        { id: "row-a", sectionId: "sec-1", tokenKey: "ROW_88", sortOrder: 0 },
        { id: "row-c", sectionId: "sec-2", tokenKey: "ROW_77", sortOrder: 0 },
      ],
      updateCalls,
    });

    await resequenceTemplateRowTokens("tpl-1", mockTx);

    // Phase 1 (temp keys) followed by Phase 2 (canonical ROW_1, ROW_2, ROW_3)
    const tempKeys = updateCalls.filter((c) => c.tokenKey.startsWith("__TMP_"));
    const finalTokens = updateCalls.filter((c) => c.tokenKey.startsWith("ROW_"));

    expect(tempKeys.length).toBe(finalTokens.length);
    expect(finalTokens.map((t) => t.tokenKey)).toEqual(["ROW_1", "ROW_2", "ROW_3"]);
    expect(touchTemplate).toHaveBeenCalledWith("tpl-1", mockTx);
  });

  it("in standard templates, preserves custom named tokens while only resequencing numeric/UUID tokens", async () => {
    const updateCalls: any[] = [];
    const mockTx = createMockTx({
      template: { id: "tpl-standard", templateType: "standard" },
      sections: [{ id: "sec-1", sortOrder: 0 }],
      rows: [
        { id: "row-1", sectionId: "sec-1", tokenKey: "PORT_DUES", sortOrder: 0 }, // Custom named token: must NOT be renamed
        { id: "row-2", sectionId: "sec-1", tokenKey: "ROW_A1B2C3D4", sortOrder: 1 }, // Legacy hex UUID token: must be normalized
        { id: "row-3", sectionId: "sec-1", tokenKey: "ROW_5", sortOrder: 2 }, // Numeric token: must be normalized to ROW_3
      ],
      updateCalls,
    });

    await resequenceTemplateRowTokens("tpl-standard", mockTx);

    // PORT_DUES at index 0 should NOT be renamed to ROW_1
    const portDuesRenamed = updateCalls.some((c) => c.tokenKey === "ROW_1");
    expect(portDuesRenamed).toBe(false);

    // ROW_UUID1234 and ROW_5 should be updated to ROW_2 and ROW_3
    const finalTokens = updateCalls.filter((c) => c.tokenKey.startsWith("ROW_"));
    expect(finalTokens.map((t) => t.tokenKey)).toEqual(["ROW_2", "ROW_3"]);
  });

  it("handles a high-volume stress scenario (100 rows across 5 sections) cleanly with zero collisions", async () => {
    const mockSections = [
      { id: "sec-1", sortOrder: 0 },
      { id: "sec-2", sortOrder: 1 },
      { id: "sec-3", sortOrder: 2 },
      { id: "sec-4", sortOrder: 3 },
      { id: "sec-5", sortOrder: 4 },
    ];

    // Create 100 rows with reversed / chaotic sort orders
    const mockRows: any[] = [];
    for (let s = 0; s < 5; s++) {
      for (let r = 0; r < 20; r++) {
        const id = `row-s${s}-r${r}`;
        mockRows.push({
          id,
          sectionId: `sec-${s + 1}`,
          tokenKey: `ROW_CHAOS_${s * 20 + r}`,
          sortOrder: 20 - r, // Reverse order to force full re-sorting
        });
      }
    }

    const updateCalls: any[] = [];
    const mockTx = createMockTx({
      template: { id: "tpl-stress", templateType: "general" },
      sections: mockSections,
      rows: mockRows,
      updateCalls,
    });

    await resequenceTemplateRowTokens("tpl-stress", mockTx);

    const phase1Keys = updateCalls
      .filter((c) => c.tokenKey.startsWith("__TMP_"))
      .map((c) => c.tokenKey);
    const phase2Keys = updateCalls
      .filter((c) => c.tokenKey.startsWith("ROW_"))
      .map((c) => c.tokenKey);

    expect(phase1Keys.length).toBe(100);
    expect(phase2Keys.length).toBe(100);

    // Check all Phase 1 keys are unique
    const uniquePhase1 = new Set(phase1Keys);
    expect(uniquePhase1.size).toBe(100);

    // Check all Phase 2 keys strictly follow ROW_1 to ROW_100 sequentially
    const expectedTokens = Array.from({ length: 100 }, (_, i) => `ROW_${i + 1}`);
    expect(phase2Keys).toEqual(expectedTokens);
  });
});
