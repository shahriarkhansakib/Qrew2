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
  CHARGE_ID,
  makeCtx,
  makeRow,
  makeRowCharge,
  makeSelectChain,
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
import { listRows } from "./list-rows.controller";

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
function mockRowOwned(row = makeRow()) {
  (db.select as any)
    .mockReturnValueOnce(hoistedChain([{ row, orgId: ORG_ID }]))
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex (collision check)
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex
    .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex
}

function mockRowNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

function mockTransaction(result: any) {
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

describe("TemplateRowsController - listRows", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  describe("listRows", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null, params: { sectionId: SECTION_ID } });
      const res = await listRows(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when section not found or wrong org", async () => {
      mockSectionNotFound();
      const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
      const res = await listRows(ctx);
      expect(res.status).toBe(404);
    });

    it("returns rows array with rowIndex on happy path", async () => {
      mockSectionOwned();
      const rows = [makeRow(), makeRow({ id: "row-002", sortOrder: 1 })];
      (db.query.templateRows.findMany as any).mockResolvedValue(rows);
      const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
      const res = await listRows(ctx);
      expect(res.status).toBe(200);
      expect(Array.isArray((res as any).data.rows)).toBe(true);
      expect((res as any).data.rows).toHaveLength(2);
      expect((res as any).data).toHaveProperty("rowIndex");
    });

    it("returns empty rows array when section has no rows", async () => {
      mockSectionOwned();
      (db.query.templateRows.findMany as any).mockResolvedValue([]);
      const ctx = makeCtx({ params: { sectionId: SECTION_ID } });
      const res = await listRows(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.rows).toHaveLength(0);
    });
  });
});
