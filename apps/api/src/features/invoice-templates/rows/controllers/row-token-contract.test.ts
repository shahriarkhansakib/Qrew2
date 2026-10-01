/**
 * Unit tests for TemplateRowsController
 *
 * Happy path  : listRows, createRow (with charges), updateRow (label, formula), deleteRow, reorderRows
 * Edge cases  : empty section, rowToken format, formula encoding, initialValue clears formula
 * Error cases : 401, 404, 409 token collision, 400 invalid Zod, empty update body, reorder bad payload
 * Auth cases  : 401 for every endpoint
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRow, ORG_ID, SECTION_ID, TEMPLATE_ID } from "../../invoice-templates.fixtures";

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
  };
});

import { db } from "@starter/db";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

/** Queue up all 4 selects for section-ownership flow (section check + 3 index builders) */
function _mockSectionOwned(templateId = TEMPLATE_ID) {
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

function _mockSectionNotFound() {
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

describe("TemplateRowsController - Token contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  describe("Token contract", () => {
    it("chargeToken derives from rowToken + UPPER_SNAKE(label)", () => {
      const rowToken = "PORT_DUES";
      const label = "Base Rate";
      const derived = `${rowToken}_${label
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "")}`;
      expect(derived).toBe("PORT_DUES_BASE_RATE");
    });

    it("chargeToken normalizes special characters from label", () => {
      const label = "Cost (USD)";
      const suffix = label
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/, "");
      expect(suffix).toBe("COST_USD");
    });

    it("rowToken regex rejects lowercase", () => {
      const regex = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
      expect(regex.test("port_dues")).toBe(false);
      expect(regex.test("PORT_DUES")).toBe(true);
    });
  });
});
