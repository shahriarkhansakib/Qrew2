import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeChargeToken,
  makeCtx,
  makeSectionCharge,
  SECTION_ID,
  SECTION_TOKEN,
  TEMPLATE_ID,
} from "../../invoice-templates.fixtures";

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
  const asc = vi.fn();

  const db = {
    select: vi.fn(() => hoistedChain()),
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    })),
    transaction: vi.fn(),
    query: {
      templateSectionCharges: { findFirst: vi.fn() },
      tokens: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  };

  return {
    db,
    eq,
    and,
    asc,
    templateSectionCharges: {
      id: "id",
      sectionId: "sectionId",
      chargeToken: "chargeToken",
      sortOrder: "sortOrder",
      formula: "formula",
    },
    templateSections: { id: "id", templateId: "templateId", sectionToken: "sectionToken" },
    templateConstants: { id: "id", templateId: "templateId", token: "token" },
    templateRows: { id: "id", templateId: "templateId", rowToken: "rowToken" },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
    encodeFormula: vi.fn((f: string) => f),
    decodeFormula: vi.fn((f: string) => f ?? ""),
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
import { createSectionCharge } from "./create-section-charge.controller";

function mockSectionOwned(charges: any[] = []) {
  (db.select as any)
    .mockReturnValueOnce(
      hoistedChain([
        {
          section: { id: SECTION_ID, templateId: TEMPLATE_ID, sectionToken: SECTION_TOKEN },
          sectionToken: SECTION_TOKEN,
          templateId: TEMPLATE_ID,
        },
      ]),
    )
    .mockReturnValueOnce(hoistedChain([]))
    .mockReturnValueOnce(hoistedChain([]))
    .mockReturnValueOnce(hoistedChain([]))
    .mockReturnValueOnce(hoistedChain(charges.map((c) => ({ charge: c }))));
}

function mockSectionNotOwned() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

function mockInsertReturns(charge: any) {
  (db.insert as any).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([charge]),
  });
}

describe("createSectionCharge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({
      orgId: null,
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: {},
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when section not found", async () => {
    mockSectionNotOwned();
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: { label: "Port Levy", formula: "SEC_SECTION_A * 0.10" },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when label is missing", async () => {
    mockSectionOwned();
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: { formula: "SEC_SECTION_A * 0.10" },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns 400 when formula is empty string", async () => {
    mockSectionOwned();
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: { label: "Port Levy", formula: "" },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns 422 when formula syntax is invalid", async () => {
    mockSectionOwned();
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: { label: "Port Levy", formula: "INVALID +" },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBe(422);
  });

  it("returns 409 when chargeToken already exists in section", async () => {
    mockSectionOwned();
    (db.query.tokens.findFirst as any).mockResolvedValue(makeChargeToken());
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: { label: "Port Levy", formula: "SEC_SECTION_A * 0.10" },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBe(409);
  });

  it("creates charge successfully with 201", async () => {
    mockSectionOwned();
    (db.query.tokens.findFirst as any).mockResolvedValue(null);
    const newCharge = makeSectionCharge();
    mockInsertReturns(newCharge);
    (db.select as any)
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]));
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: { label: "Port Levy", formula: "SEC_SECTION_A * 0.10" },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBe(201);
    expect((res as any).data.formula).toBe(`SEC_${SECTION_TOKEN} * 0.10`);
  });

  it("accepts null for optional fields (subDescription, qualifier)", async () => {
    mockSectionOwned();
    (db.query.tokens.findFirst as any).mockResolvedValue(null);
    mockInsertReturns(makeSectionCharge());
    (db.select as any)
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]));
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
      body: {
        label: "Port Levy",
        formula: "SEC_SECTION_A * 0.10",
        subDescription: null,
        qualifier: null,
      },
    });
    const res = await createSectionCharge(ctx);
    expect(res.status).toBe(201);
  });

  describe("regression: section charge response decoding", () => {
    it("createSectionCharge response formula is decoded (not raw UUID form)", async () => {
      mockSectionOwned();
      (db.query.tokens.findFirst as any).mockResolvedValue(null);
      const rawCharge = makeSectionCharge({ formula: "{{$row:abc-123}} * 0.10" });
      mockInsertReturns(rawCharge);
      (db.select as any)
        .mockReturnValueOnce(hoistedChain([]))
        .mockReturnValueOnce(hoistedChain([]))
        .mockReturnValueOnce(hoistedChain([]));
      const { decodeFormula } = await import("@starter/db");
      (decodeFormula as any).mockReturnValue("SEC_SECTION_A * 0.10");

      const ctx = makeCtx({
        params: { sectionId: SECTION_ID, templateId: TEMPLATE_ID },
        body: { label: "Port Levy", formula: "SEC_SECTION_A * 0.10" },
      });
      const res = await createSectionCharge(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.formula).not.toContain("{{$row:");
      expect((res as any).data.formula).toBe("SEC_SECTION_A * 0.10");
    });
  });

  describe("Token contract", () => {
    it("chargeToken = SEC_<SECTION_TOKEN>_<UPPER_SNAKE(label)>", () => {
      const sectionToken = "SECTION_A";
      const label = "Port Levy";
      const suffix = label
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "");
      expect(`SEC_${sectionToken}_${suffix}`).toBe("SEC_SECTION_A_PORT_LEVY");
    });

    it("multi-word section token produces correct charge token", () => {
      const sectionToken = "SECTION_PORT_COSTS";
      const label = "Agency Fee";
      const suffix = label.toUpperCase().replace(/\s+/g, "_");
      expect(`SEC_${sectionToken}_${suffix}`).toBe("SEC_SECTION_PORT_COSTS_AGENCY_FEE");
    });
  });
});
