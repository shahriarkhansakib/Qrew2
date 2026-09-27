import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, SECTION_ID } from "../../invoice-templates.fixtures";

const { makeChain } = vi.hoisted(() => {
  return {
    makeChain: (returnValue: any = []) => {
      const p = Promise.resolve(returnValue) as any;
      p.from = vi.fn().mockReturnValue(p);
      p.innerJoin = vi.fn().mockReturnValue(p);
      p.where = vi.fn().mockReturnValue(p);
      p.limit = vi.fn().mockReturnValue(p);
      p.orderBy = vi.fn().mockReturnValue(p);
      p.with = vi.fn().mockReturnValue(p);
      return p;
    },
  };
});

const { makeSelectChain } = vi.hoisted(() => {
  return {
    makeSelectChain: (result = [{ id: "id" }]) => {
      const p = Promise.resolve(result) as any;
      p.from = vi.fn().mockReturnValue(p);
      p.innerJoin = vi.fn().mockReturnValue(p);
      p.where = vi.fn().mockReturnValue(p);
      p.limit = vi.fn().mockReturnValue(p);
      p.orderBy = vi.fn().mockReturnValue(p);
      return p;
    },
  };
});

vi.mock("@starter/db", () => {
  const eq = vi.fn((_a: any, _b: any) => ({ _type: "eq" }));
  const and = vi.fn((...args: any[]) => ({ _type: "and", args }));
  const asc = vi.fn((col: any) => ({ _type: "asc", col }));

  const db: any = {
    select: vi.fn(() => makeChain()),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };

  return {
    db,
    eq,
    and,
    asc,
    templateSections: {
      id: "id",
      templateId: "templateId",
      sectionToken: "sectionToken",
      sortOrder: "sortOrder",
      label: "label",
    },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
    tokens: {
      id: "id",
      tokenKey: "tokenKey",
      label: "label",
      description: "description",
      sortOrder: "sortOrder",
      valueType: "valueType",
      domain: "domain",
      entityType: "entityType",
      isSystem: "isSystem",
      isInjectable: "isInjectable",
      isVisible: "isVisible",
      organizationId: "organizationId",
    },
  };
});

import { db } from "@starter/db";
import { deleteSection } from "./delete-section.controller";

function mockSelectReturns(returnValue: any[]) {
  (db.select as any).mockReturnValue(makeSelectChain(returnValue));
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("deleteSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({ orgId: null, params: { sectionId: SECTION_ID } });
    const res = await deleteSection(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when section not found", async () => {
    mockSelectReturns([]);
    const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
    const res = await deleteSection(ctx);
    expect(res.status).toBe(404);
  });

  it("deletes section and returns success", async () => {
    mockSelectReturns([{ id: SECTION_ID }]);
    (db.delete as any).mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
    const res = await deleteSection(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data.success).toBe(true);
  });
});
