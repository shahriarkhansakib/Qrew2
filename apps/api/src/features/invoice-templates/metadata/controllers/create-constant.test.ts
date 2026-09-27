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
    query: {
      invoiceTemplates: { findFirst: vi.fn() },
    },
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
import { createConstant } from "./create-constant.controller";

function mockInsertReturns(value: any) {
  (db.insert as any).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([value]),
  });
}

describe("createConstant", () => {
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
      body: { key: "FUEL_RATE", valueType: "number" },
    });
    const res = await createConstant(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when template belongs to a foreign organization", async () => {
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
    const ctx = makeCtx({
      orgId: "foreign-org-999",
      params: { templateId: TEMPLATE_ID },
      body: { key: "FUEL_RATE", valueType: "number", value: "3.5" },
    });
    const res = await createConstant(ctx);
    expect(res.status).toBe(404);
  });

  it("creates constant with 201 on happy path", async () => {
    const constant = makeConstant();
    mockInsertReturns(constant);
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: { key: "FUEL_RATE", valueType: "number", value: "3.5" },
    });
    const res = await createConstant(ctx);
    expect(res.status).toBe(201);
  });

  it("returns 400 when key contains lowercase letters (fails regex)", async () => {
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: { key: "fuel_rate", valueType: "number" },
    });
    const res = await createConstant(ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when valueType is not a valid enum value", async () => {
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: { key: "FUEL_RATE", valueType: "invalid_type" },
    });
    const res = await createConstant(ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 when key is missing", async () => {
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: { valueType: "number" },
    });
    const res = await createConstant(ctx);
    expect(res.status).toBe(400);
  });

  describe("Field mapping contract", () => {
    it("maps 'key' → 'tokenKey' in DB insert", async () => {
      let insertedValues: any;
      (db.insert as any).mockReturnValue({
        values: vi.fn((v: any) => {
          if (v.tokenKey) insertedValues = v;
          return { returning: vi.fn().mockResolvedValue([makeConstant()]) };
        }),
      });
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { key: "FUEL_RATE", valueType: "number", value: "3.5", description: "Fuel price" },
      });
      await createConstant(ctx);
      expect(insertedValues.tokenKey).toBe("FUEL_RATE");
      expect(insertedValues.key).toBeUndefined();
    });

    it("maps 'value' → 'defaultValue' in DB insert", async () => {
      let insertedValues: any;
      (db.insert as any).mockReturnValue({
        values: vi.fn((v: any) => {
          if (v.defaultValue !== undefined) insertedValues = v;
          return { returning: vi.fn().mockResolvedValue([makeConstant()]) };
        }),
      });
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { key: "FUEL_RATE", valueType: "number", value: "3.5" },
      });
      await createConstant(ctx);
      expect(insertedValues.defaultValue).toBe("3.5");
      expect(insertedValues.value).toBeUndefined();
    });

    it("maps 'description' → 'label' in DB insert", async () => {
      let insertedValues: any;
      (db.insert as any).mockReturnValue({
        values: vi.fn((v: any) => {
          if (v.label) insertedValues = v;
          return { returning: vi.fn().mockResolvedValue([makeConstant()]) };
        }),
      });
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { key: "FUEL_RATE", valueType: "number", description: "Fuel price" },
      });
      await createConstant(ctx);
      expect(insertedValues.label).toBe("Fuel price");
    });
  });
});
