import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeConstant, makeCtx, TEMPLATE_ID } from "../../invoice-templates.fixtures";

const { hoistedChain } = vi.hoisted(() => ({
  hoistedChain: (result: any[] = []) => {
    const p = Promise.resolve(result) as any;
    p.from = vi.fn().mockReturnValue(p);
    p.innerJoin = vi.fn().mockReturnValue(p);
    p.where = vi.fn().mockReturnValue(p);
    p.limit = vi.fn().mockReturnValue(p);
    p.orderBy = vi.fn().mockReturnValue(p);
    return p;
  },
}));

vi.mock("@starter/db", () => {
  const eq = vi.fn();
  const and = vi.fn();

  const db: any = {
    select: vi.fn(() => hoistedChain()),
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
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    })),
    transaction: vi.fn(),
    query: {
      invoiceTemplates: { findFirst: vi.fn() },
    },
  };
  db.transaction = vi.fn(async (fn: any) => fn(db));

  return {
    db,
    eq,
    and,
    asc: vi.fn(),
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
    encodeFormula: vi.fn((f: any) => f),
    templateConstants: {
      id: "id",
      templateId: "templateId",
      defaultValue: "defaultValue",
    },
    templateRows: { id: "id", templateId: "templateId", rowToken: "rowToken", formula: "formula" },
    templateSections: { id: "id", templateId: "templateId", sectionToken: "sectionToken" },
    templateSectionCharges: { id: "id", sectionId: "sectionId", formula: "formula" },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
  };
});

import { db } from "@starter/db";
import { listConstants } from "./list-constants.controller";

function mockSelectReturns(value: any[]) {
  (db.select as any).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(value),
    then: (resolve: any) => resolve(value),
  });
}

describe("listConstants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue({
      id: TEMPLATE_ID,
      organizationId: "org-001",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({
      orgId: null,
      params: { templateId: TEMPLATE_ID },
    });
    const res = await listConstants(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when template belongs to a foreign organization", async () => {
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
    const ctx = makeCtx({
      orgId: "foreign-org-999",
      params: { templateId: TEMPLATE_ID },
    });
    const res = await listConstants(ctx);
    expect(res.status).toBe(404);
  });

  it("returns list of constants for templateId", async () => {
    const constants = [makeConstant(), makeConstant({ id: "const-002", token: "PILOTAGE_RATE" })];
    mockSelectReturns(constants);
    const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
    const res = await listConstants(ctx);
    expect(res.status).toBe(200);
    expect(Array.isArray((res as any).data)).toBe(true);
  });

  it("returns empty array when template has no constants", async () => {
    mockSelectReturns([]);
    const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
    const res = await listConstants(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data).toHaveLength(0);
  });
});
