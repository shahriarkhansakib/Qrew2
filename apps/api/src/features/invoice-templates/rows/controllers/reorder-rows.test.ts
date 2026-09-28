import { reorderRows } from "./reorder-rows.controller";
/**
 * Unit tests for TemplateRowsController
 *
 * Happy path  : listRows, createRow (with charges), updateRow (label, formula), deleteRow, reorderRows
 * Edge cases  : empty section, rowToken format, formula encoding, initialValue clears formula
 * Error cases : 401, 404, 409 token collision, 400 invalid Zod, empty update body, reorder bad payload
 * Auth cases  : 401 for every endpoint
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeCtx,
  makeRow,
  ORG_ID,
  ROW_ID,
  SECTION_ID,
  TEMPLATE_ID,
} from "../../invoice-templates.fixtures";

// ─── hoisted chain builder used inside the vi.mock factory ────────────────────
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

  const dbObj: any = {
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
      where: vi.fn().mockResolvedValue(undefined),
    })),
    query: {
      templateSections: { findFirst: vi.fn(), findMany: vi.fn() },
      templateRows: { findFirst: vi.fn(), findMany: vi.fn() },
      templateRowCharges: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    transaction: vi.fn(),
  };
  dbObj.transaction = vi.fn(async (fn: any) => fn(dbObj));

  return {
    db: dbObj,
    eq,
    and,
    asc,
    encodeFormula: vi.fn((f: any) => f),
    decodeFormula: vi.fn((f: any) => f),
    templateSections: { id: "sec-id", templateId: "sec-templateId" },
    invoiceTemplates: { id: "tpl-id", organizationId: "tpl-orgId" },
    templateRows: {
      id: "row-id",
      templateId: "row-templateId",
      sectionId: "row-sectionId",
      rowToken: "rowToken",
      sortOrder: "sortOrder",
    },
    templateRowCharges: {
      id: "ch-id",
      rowId: "ch-rowId",
      sortOrder: "sortOrder",
      chargeToken: "ch-chargeToken",
    },
    templateSectionCharges: {
      id: "sc-id",
      templateId: "sc-templateId",
      sectionId: "sc-sectionId",
      sortOrder: "sc-sortOrder",
    },
    templateConstants: { id: "c-id", templateId: "c-templateId", token: "c-token" },
    tokens: {
      id: "tokens-id",
      tokenKey: "tokens-tokenKey",
      label: "tokens-label",
      description: "tokens-description",
      sortOrder: "tokens-sortOrder",
      valueType: "tokens-valueType",
      domain: "tokens-domain",
      entityType: "tokens-entityType",
      isSystem: "tokens-isSystem",
      isInjectable: "tokens-isInjectable",
      isVisible: "tokens-isVisible",
      organizationId: "tokens-organizationId",
    },
  };
});

import { db } from "@starter/db";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/** Queue up all 4 selects for section-ownership flow (section check + 3 index builders) */
function mockSectionOwned(templateId = TEMPLATE_ID) {
  (db.select as any)
    .mockReturnValueOnce(
      hoistedChain([
        {
          section: { id: SECTION_ID, templateId, sectionToken: "SECTION_A" },
          templateOrgId: ORG_ID,
        },
      ]),
    )
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex
    .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex
}

function mockSectionNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

/** Queue up all 4 selects for row-ownership flow (row+org check + 3 index builders) */
function _mockRowOwned(row = makeRow()) {
  (db.select as any)
    .mockReturnValueOnce(hoistedChain([{ row, orgId: ORG_ID }]))
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex (collision check)
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex
    .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex
}

function _mockRowNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

function _mockTransaction(result: any) {
  (db.transaction as any).mockImplementation(async (fn: any) => {
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([result]),
      })),
      update: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([result]),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      query: {
        templateRowCharges: { findMany: vi.fn().mockResolvedValue([]) },
      },
    };
    return fn(tx);
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("TemplateRowsController - reorderRows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  describe("reorderRows", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({
        orgId: null,
        params: { sectionId: SECTION_ID },
        body: { orderedIds: [ROW_ID] },
      });
      const res = await reorderRows(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when section not found", async () => {
      mockSectionNotFound();
      const ctx = makeCtx({ params: { sectionId: SECTION_ID }, body: { orderedIds: [ROW_ID] } });
      const res = await reorderRows(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 when orderedIds contains non-UUID values", async () => {
      mockSectionOwned();
      const ctx = makeCtx({
        params: { sectionId: SECTION_ID },
        body: { orderedIds: ["not-a-uuid"] },
      });
      const res = await reorderRows(ctx);
      expect(res.status).toBe(400);
    });

    it("reorders rows successfully", async () => {
      mockSectionOwned();
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      });
      const ctx = makeCtx({
        params: { sectionId: SECTION_ID },
        body: { orderedIds: [crypto.randomUUID(), crypto.randomUUID()] },
      });
      const res = await reorderRows(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.success).toBe(true);
    });
  });
});
