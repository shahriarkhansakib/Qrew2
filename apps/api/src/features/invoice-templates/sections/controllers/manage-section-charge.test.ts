import * as crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHARGE_ID, makeCtx, SECTION_ID, TEMPLATE_ID } from "../../invoice-templates.fixtures";

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
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    transaction: vi.fn(),
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
      templateId: "templateId",
    },
  };
});

import { db } from "@starter/db";
import { deleteSectionCharge, reorderSectionCharges } from "./manage-section-charge.controller";

function mockChargeNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

describe("deleteSectionCharge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({ orgId: null, params: { chargeId: CHARGE_ID } });
    const res = await deleteSectionCharge(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when charge not found", async () => {
    mockChargeNotFound();
    const ctx = makeCtx({ params: { chargeId: CHARGE_ID } });
    const res = await deleteSectionCharge(ctx);
    expect(res.status).toBe(404);
  });

  it("deletes charge and returns {success:true}", async () => {
    (db.select as any).mockReturnValueOnce(hoistedChain([{ id: CHARGE_ID }]));
    (db.delete as any).mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const ctx = makeCtx({ params: { chargeId: CHARGE_ID } });
    const res = await deleteSectionCharge(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data.success).toBe(true);
  });
});

describe("reorderSectionCharges", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({
      orgId: null,
      params: { sectionId: SECTION_ID },
      body: { orderedIds: [CHARGE_ID] },
    });
    const res = await reorderSectionCharges(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when section not found", async () => {
    (db.select as any).mockReturnValueOnce(hoistedChain([]));
    const ctx = makeCtx({ params: { sectionId: SECTION_ID }, body: { orderedIds: [CHARGE_ID] } });
    const res = await reorderSectionCharges(ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when orderedIds contains non-UUID values", async () => {
    (db.select as any).mockReturnValueOnce(
      hoistedChain([{ section: { id: SECTION_ID }, templateId: TEMPLATE_ID }]),
    );
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { orderedIds: ["not-a-uuid"] },
    });
    const res = await reorderSectionCharges(ctx);
    expect(res.status).toBe(400);
  });

  it("reorders charges successfully", async () => {
    (db.select as any).mockReturnValueOnce(
      hoistedChain([{ section: { id: SECTION_ID }, templateId: TEMPLATE_ID }]),
    );
    (db.update as any).mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });
    const ctx = makeCtx({
      params: { sectionId: SECTION_ID },
      body: { orderedIds: [crypto.randomUUID(), crypto.randomUUID()] },
    });
    const res = await reorderSectionCharges(ctx);
    expect(res.status).toBe(200);
    expect((res as any).data.success).toBe(true);
  });
});
