import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHARGE_ID,
  makeChargeToken,
  makeCtx,
  makeSectionCharge,
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
    update: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
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
import { updateSectionCharge } from "./update-section-charge.controller";

function mockChargeOwned(charge = makeSectionCharge(), withFormulaIndexes = false) {
  const token = makeChargeToken({
    tokenKey: charge.chargeToken ?? `SEC_${SECTION_TOKEN}_PORT_LEVY`,
    label: charge.label ?? "Port Levy",
  });
  const mock = (db.select as any).mockReturnValueOnce(
    hoistedChain([{ charge, token, section: { templateId: TEMPLATE_ID } }]),
  );
  if (withFormulaIndexes) {
    mock
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]));
  } else {
    mock
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]))
      .mockReturnValueOnce(hoistedChain([]));
  }
}

function mockChargeNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

function mockUpdateReturns(charge: any) {
  (db.update as any).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([charge]),
  });
}

describe("updateSectionCharge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({ orgId: null, params: { chargeId: CHARGE_ID }, body: {} });
    const res = await updateSectionCharge(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when charge not found", async () => {
    mockChargeNotFound();
    const ctx = makeCtx({
      params: { chargeId: CHARGE_ID },
      body: { formula: "SEC_SECTION_A * 0.15" },
    });
    const res = await updateSectionCharge(ctx);
    expect(res.status).toBe(404);
  });

  it("updates formula only", async () => {
    mockChargeOwned(makeSectionCharge(), true);
    const updated = makeSectionCharge({ formula: "SEC_SECTION_A * 0.15" });
    mockUpdateReturns(updated);
    const ctx = makeCtx({
      params: { chargeId: CHARGE_ID },
      body: { formula: "SEC_SECTION_A * 0.15" },
    });
    const res = await updateSectionCharge(ctx);
    expect(res.status).toBe(200);
  });

  it("returns 422 for invalid formula syntax in update", async () => {
    mockChargeOwned(makeSectionCharge(), true);
    const ctx = makeCtx({ params: { chargeId: CHARGE_ID }, body: { formula: "INVALID +" } });
    const res = await updateSectionCharge(ctx);
    expect(res.status).toBe(422);
  });

  it("updates orderIndex (sortOrder) without formula index calls", async () => {
    mockChargeOwned(makeSectionCharge(), false);
    const updated = makeSectionCharge({ sortOrder: 5 });
    mockUpdateReturns(updated);
    const ctx = makeCtx({ params: { chargeId: CHARGE_ID }, body: { orderIndex: 5 } });
    const res = await updateSectionCharge(ctx);
    expect(res.status).toBe(200);
  });

  describe("regression: section charge response decoding", () => {
    it("updateSectionCharge response formula is decoded (not raw UUID form)", async () => {
      mockChargeOwned(makeSectionCharge(), true);
      const rawUpdated = makeSectionCharge({ formula: "{{$row:abc-123}} * 0.15" });
      mockUpdateReturns(rawUpdated);
      const { decodeFormula } = await import("@starter/db");
      (decodeFormula as any).mockReturnValue("SEC_SECTION_A * 0.15");

      const ctx = makeCtx({
        params: { chargeId: CHARGE_ID },
        body: { formula: "SEC_SECTION_A * 0.15" },
      });
      const res = await updateSectionCharge(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.formula).not.toContain("{{$row:");
      expect((res as any).data.formula).toBe("SEC_SECTION_A * 0.15");
    });
  });
});
