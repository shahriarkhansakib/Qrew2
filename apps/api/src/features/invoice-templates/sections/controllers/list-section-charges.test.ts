import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
import { listSectionCharges } from "./list-section-charges.controller";

function mockSectionOwned(charges: any[] = []) {
  (db.select as any)
    .mockReturnValueOnce(
      hoistedChain([
        {
          section: { id: SECTION_ID, templateId: TEMPLATE_ID, sectionToken: SECTION_TOKEN },
          templateId: TEMPLATE_ID,
        },
      ]),
    )
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex
    .mockReturnValueOnce(hoistedChain([])) // buildConstantIndex
    .mockReturnValueOnce(hoistedChain(charges.map((c) => ({ charge: c })))); // charges list
}

function mockSectionNotOwned() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

describe("listSectionCharges", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const ctx = makeCtx({ orgId: null, params: { sectionId: SECTION_ID } });
    const res = await listSectionCharges(ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when section not found or not owned", async () => {
    mockSectionNotOwned();
    const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
    const res = await listSectionCharges(ctx);
    expect(res.status).toBe(404);
  });

  it("returns charges array on happy path", async () => {
    const charges = [makeSectionCharge(), makeSectionCharge({ id: "chg-002", sortOrder: 1 })];
    mockSectionOwned(charges);
    const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
    const res = await listSectionCharges(ctx);
    expect(res.status).toBe(200);
    expect(Array.isArray((res as any).data)).toBe(true);
  });
});
