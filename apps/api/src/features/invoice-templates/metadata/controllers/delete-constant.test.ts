import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSTANT_ID, makeConstant, makeCtx, TEMPLATE_ID } from "../../invoice-templates.fixtures";

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
  };
  db.transaction = vi.fn(async (fn: any) => fn(db));

  return {
    db,
    eq,
    and,
    encodeFormula: vi.fn((f: any) => f),
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
import { deleteConstant } from "./delete-constant.controller";

function mockDeleteReturns(value: any) {
  (db.delete as any).mockReturnValue({
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(value ? [value] : []),
  });
}

describe("deleteConstant", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
    (db.select as any).mockReturnValue(hoistedChain([{ id: CONSTANT_ID }]));
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({
      orgId: null,
      params: { constantId: CONSTANT_ID },
    });
    const res = await deleteConstant(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when constant belongs to a foreign organization", async () => {
    (db.select as any).mockReturnValue(hoistedChain([]));
    const ctx = makeCtx({
      orgId: "foreign-org-999",
      params: { constantId: CONSTANT_ID },
    });
    const res = await deleteConstant(ctx);
    expect(res.status).toBe(404);
  });

  it("deletes constant and returns {success:true}", async () => {
    mockDeleteReturns(makeConstant());
    const ctx = makeCtx({ params: { constantId: CONSTANT_ID } });
    const res = await deleteConstant(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data.success).toBe(true);
  });

  it("returns 404 when constant not found", async () => {
    (db.select as any).mockReturnValue(hoistedChain([]));
    mockDeleteReturns(null);
    const ctx = makeCtx({ params: { constantId: CONSTANT_ID } });
    const res = await deleteConstant(ctx);
    expect(res.status).toBe(404);
  });
});
