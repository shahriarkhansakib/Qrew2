import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, makeSection, ORG_ID, TEMPLATE_ID } from "../../invoice-templates.fixtures";

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

// ─── Mock @starter/db BEFORE importing the controller ────────────────────────
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
import { listSections } from "./list-sections.controller";

// ─── Helpers to configure db mocks ───────────────────────────────────────────

function mockTemplateFound() {
  (db.query.invoiceTemplates.findFirst as any).mockResolvedValue({
    id: TEMPLATE_ID,
    organizationId: ORG_ID,
  });
}

function mockTemplateNotFound() {
  (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
}

function mockSectionList(sections: any[] = []) {
  (db.query.templateSections as any).findMany = vi.fn().mockResolvedValue(sections);
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("listSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no organizationId in context", async () => {
    const ctx = makeCtx({ orgId: null, params: { templateId: TEMPLATE_ID } });
    const res = await listSections(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when template not found for this org", async () => {
    mockTemplateNotFound();
    const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
    const res = await listSections(ctx);
    expect(res.status).toBe(404);
  });

  it("returns sections array on happy path", async () => {
    mockTemplateFound();
    const sections = [makeSection(), makeSection({ id: "sec-002", sortOrder: 1 })];
    mockSectionList(sections);
    const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
    const res = await listSections(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data).toEqual(sections);
  });

  it("returns empty array when template has no sections", async () => {
    mockTemplateFound();
    mockSectionList([]);
    const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
    const res = await listSections(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data).toEqual([]);
  });
});
