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
import { createSection } from "./create-section.controller";

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

function mockSectionFound(section = makeSection()) {
  (db.query.templateSections.findFirst as any).mockResolvedValue(section);
  (db.query.tokens.findFirst as any).mockResolvedValue(section);
}

function mockSectionNotFound() {
  (db.query.templateSections.findFirst as any).mockResolvedValue(null);
  (db.query.tokens.findFirst as any).mockResolvedValue(null);
}

function mockInsertReturns(returnValue: any) {
  (db.insert as any).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([returnValue]),
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("createSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({ orgId: null, params: { templateId: TEMPLATE_ID }, body: { label: "A" } });
    const res = await createSection(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when template not found", async () => {
    mockTemplateNotFound();
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: { label: "Port Costs", sectionToken: "SECTION_PORT_COSTS", orderIndex: 0 },
    });
    const res = await createSection(ctx);
    expect(res.status).toBe(404);
  });

  it("[REGRESSION] accepts null label, description, sectionToken without ZodError", async () => {
    mockTemplateFound();
    mockSectionNotFound(); // no collision
    const newSection = makeSection({ label: null, description: null, sectionToken: "SECTION_A" });
    mockInsertReturns(newSection);

    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: {
        label: null,
        description: null,
        sectionToken: null,
        orderIndex: 0,
      },
    });
    const res = await createSection(ctx);
    expect(res.status).not.toBe(400);
    expect(res.status).toBe(201);
  });

  it("creates a section with explicit SECTION_ prefixed token", async () => {
    mockTemplateFound();
    mockSectionNotFound();
    const newSection = makeSection({ sectionToken: "SECTION_PORT_COSTS" });
    mockInsertReturns(newSection);

    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: {
        label: "Port Costs",
        sectionToken: "SECTION_PORT_COSTS",
        orderIndex: 0,
      },
    });
    const res = await createSection(ctx);
    expect(res.status).toBe(201);
    expect((res as any).data.sectionToken).toBe("SECTION_PORT_COSTS");
  });

  it("returns 400 for invalid sectionToken (not UPPER_SNAKE_CASE)", async () => {
    mockTemplateFound();
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: {
        sectionToken: "invalid token!",
        orderIndex: 0,
      },
    });
    const res = await createSection(ctx);
    expect(res.status).toBe(400);
  });

  it("returns 409 when sectionToken already exists in template", async () => {
    mockTemplateFound();
    mockSectionFound(); // collision found
    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: {
        sectionToken: "SECTION_PORT_COSTS",
        orderIndex: 0,
      },
    });
    const res = await createSection(ctx);
    expect(res.status).toBe(409);
  });

  it("stores description when provided", async () => {
    mockTemplateFound();
    mockSectionNotFound();
    const newSection = makeSection({ description: "Covers all mandatory port dues" });
    mockInsertReturns(newSection);

    const ctx = makeCtx({
      params: { templateId: TEMPLATE_ID },
      body: {
        label: "Port Costs",
        description: "Covers all mandatory port dues",
        sectionToken: "SECTION_PORT_COSTS",
        orderIndex: 0,
      },
    });
    const res = await createSection(ctx);
    expect(res.status).toBe(201);
    expect((res as any).data.description).toBe("Covers all mandatory port dues");
  });

  describe("Token naming contract", () => {
    it("section token with label 'A' maps to token SECTION_A", async () => {
      mockTemplateFound();
      mockSectionNotFound();
      const newSection = makeSection({ label: "A", sectionToken: "SECTION_A" });
      mockInsertReturns(newSection);

      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: {
          label: "A",
          sectionToken: "SECTION_A",
          orderIndex: 0,
        },
      });
      const res = await createSection(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.sectionToken).toBe("SECTION_A");
    });

    it("empty string sectionToken in body is treated as null (auto-assigned)", async () => {
      mockTemplateFound();
      mockSectionNotFound();
      const newSection = makeSection({ sectionToken: "SECTION_A" });
      mockInsertReturns(newSection);

      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: {
          sectionToken: null,
          orderIndex: 0,
        },
      });
      const res = await createSection(ctx);
      expect(res.status).toBe(201);
    });
  });
});
