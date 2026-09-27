import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, makeSection, ORG_ID, SECTION_ID } from "../../invoice-templates.fixtures";

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
    query: {
      invoiceTemplates: { findFirst: vi.fn() },
      templateSections: { findFirst: vi.fn(), findMany: vi.fn() },
      tokens: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  };
  db.transaction = vi.fn(async (cb) => cb(db));

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
    templateRows: {
      id: "id",
      templateId: "templateId",
      rowToken: "rowToken",
      formula: "formula",
      sortOrder: "sortOrder",
    },
    templateRowCharges: { id: "id", sortOrder: "sortOrder" },
    templateSectionCharges: { id: "id", sectionId: "sectionId", formula: "formula" },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
    encodeFormula: vi.fn((f) => f),
    templateConstants: { id: "id", templateId: "templateId", token: "token" },
    decodeFormula: vi.fn((f) => f),
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
      templateId: "templateId",
    },
  };
});

import { db } from "@starter/db";
import { updateSection } from "./update-section.controller";

// ─── Helpers to configure db mocks ───────────────────────────────────────────

function mockSelectReturns(returnValue: any[]) {
  (db.select as any).mockReturnValue(makeSelectChain(returnValue));
}

function mockUpdateReturns(returnValue: any) {
  (db.update as any).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([returnValue]),
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("updateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({
      orgId: null,
      params: { sectionId: SECTION_ID },
      body: { label: "New Name" },
    });
    const res = await updateSection(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when section not found or belongs to another org", async () => {
    mockSelectReturns([]); // select returns empty — section not found
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { label: "New Name" },
    });
    const res = await updateSection(ctx);
    expect(res.status).toBe(404);
  });

  it("updates label and description successfully", async () => {
    const section = makeSection();
    mockSelectReturns([{ section, org: ORG_ID }]);
    const updatedSection = makeSection({ label: "New Port Costs", description: "Updated desc" });
    mockUpdateReturns(updatedSection);

    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { label: "New Port Costs", description: "Updated desc" },
    });
    const res = await updateSection(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data.label).toBe("New Port Costs");
    expect((res as any).data.description).toBe("Updated desc");
  });

  it("accepts null label to clear the name", async () => {
    const section = makeSection();
    mockSelectReturns([{ section, org: ORG_ID }]);
    const updatedSection = makeSection({ label: null });
    mockUpdateReturns(updatedSection);

    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { label: null },
    });
    const res = await updateSection(ctx);
    expect(res.status).toBe(200);
  });

  it("updates sortOrder via orderIndex", async () => {
    const section = makeSection();
    mockSelectReturns([{ section, org: ORG_ID }]);
    const updatedSection = makeSection({ sortOrder: 3 });
    mockUpdateReturns(updatedSection);

    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { orderIndex: 3 },
    });
    const res = await updateSection(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data.sortOrder).toBe(3);
  });

  it("returns 400 for invalid body (orderIndex negative)", async () => {
    const section = makeSection();
    mockSelectReturns([{ section, org: ORG_ID }]);

    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { orderIndex: -1 },
    });
    const res = await updateSection(ctx);
    expect(res.status).toBe(400);
  });

  describe("sectionToken rename sweep", () => {
    it("re-encodes row formulas that reference the old sectionToken", async () => {
      const section = makeSection({ sectionToken: "SECTION_A" });
      mockSelectReturns([{ section, org: ORG_ID }]);

      // collision check for new token
      (db.query.templateSections.findFirst as any).mockResolvedValue(null);

      // transaction sweep: update + findMany rows + findMany section charges
      const sweepRows = [{ id: "row-1", formula: "SEC_SECTION_A * 1.0" }];

      (db.transaction as any).mockImplementation(async (fn: any) => {
        const tx = {
          update: vi.fn(() => ({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([makeSection({ sectionToken: "SECTION_B" })]),
          })),
          select: vi.fn(() => ({
            from: vi.fn().mockReturnThis(),
            innerJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue(sweepRows),
          })),
        };
        return fn(tx);
      });

      const ctx = makeCtx({
        params: { sectionId: SECTION_ID },
        body: { sectionToken: "SECTION_B" },
      });
      const res = await updateSection(ctx);
      expect(res.status).toBe(200);
      expect(db.transaction as any).toHaveBeenCalled();
    });
  });
});
