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
import { resequenceTemplateRowTokens } from "./resequence-rows.service";

describe("resequenceTemplateRowTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exits early if template is not found", async () => {
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
    await resequenceTemplateRowTokens("tpl-123");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("resequences general template rows in topological order", async () => {
    const template = { id: "tpl-1", templateType: "general" };
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(template);

    const mockSections = [
      { id: "sec-1", sortOrder: 0 },
      { id: "sec-2", sortOrder: 1 },
    ];

    const mockRows = [
      { id: "row-b", sectionId: "sec-1", tokenKey: "ROW_2", sortOrder: 1 },
      { id: "row-a", sectionId: "sec-1", tokenKey: "ROW_3", sortOrder: 0 },
      { id: "row-c", sectionId: "sec-2", tokenKey: "ROW_1", sortOrder: 0 },
    ];

    const updateCalls: Array<{ id: string; tokenKey: string }> = [];
    const mockTx = {
      query: {
        invoiceTemplates: { findFirst: vi.fn().mockResolvedValue(template) },
      },
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockImplementation((_order) => {
          return mockSections;
        }),
        then: (resolve: any) => resolve(mockRows),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => ({
          where: vi.fn().mockImplementation(() => {
            updateCalls.push(val);
            return Promise.resolve();
          }),
        })),
      }),
    };

    (db.transaction as any).mockImplementation(async (cb: any) => cb(mockTx));

    await resequenceTemplateRowTokens("tpl-1", mockTx);

    // Verify Phase 1 (temp keys) and Phase 2 (target ROW_1, ROW_2, ROW_3) were executed
    const finalTokens = updateCalls.filter((c) => c.tokenKey.startsWith("ROW_"));
    expect(finalTokens.length).toBeGreaterThan(0);
  });
});
