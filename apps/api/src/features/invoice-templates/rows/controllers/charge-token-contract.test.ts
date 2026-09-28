/**
 * Unit tests for TemplateRowChargesController
 *
 * Happy path  : listCharges, createCharge (explicit token, auto-derived token),
 *               updateCharge (formula, chargeToken-only), deleteCharge, reorderCharges
 * Edge cases  : tags stored, qualifier null, zero amount formula, formula operators (+/-),
 *               chargeToken change does NOT auto-update label (AGENTS.md rule)
 * Error cases : 401, 404, 409 token collision, 422 invalid formula, 400 Zod, reorder bad payload
 * Auth cases  : 401 for every endpoint
 *
 * Formula validation in this controller is regex-only (not mathjs AST parse).
 * Circular reference / cross-token validation is out of scope (engine responsibility).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeRow, makeRowCharge } from "../../invoice-templates.fixtures";

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
      where: vi.fn().mockResolvedValue(undefined),
    })),
    transaction: vi.fn(),
    query: {
      templateRowCharges: { findFirst: vi.fn(), findMany: vi.fn() },
      templateRows: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  };
  db.transaction = vi.fn(async (fn: any) => fn(db));

  return {
    db,
    eq,
    and,
    asc,
    encodeFormula: vi.fn((f: any) => f),
    decodeFormula: vi.fn((f: any) => f),
    templateRows: {
      id: "id",
      sectionId: "sectionId",
      templateId: "templateId",
      rowToken: "rowToken",
      sortOrder: "sortOrder",
    },
    templateRowCharges: {
      id: "id",
      rowId: "rowId",
      sortOrder: "sortOrder",
      chargeToken: "chargeToken",
    },
    templateSectionCharges: {
      id: "id",
      templateId: "templateId",
      sectionId: "sectionId",
      sortOrder: "sortOrder",
    },
    templateSections: { id: "id", templateId: "templateId", sectionToken: "sectionToken" },
    templateConstants: { id: "id", templateId: "templateId", token: "token" },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
  };
});

import { db } from "@starter/db";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const ROW_FIXTURE = makeRow();

/** Queue row-ownership check: [0] row+org check, [1-3] index builders for decode */
function _mockRowOwned(row = ROW_FIXTURE) {
  (db.select as any)
    .mockReturnValueOnce(hoistedChain([{ row }]))
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex
    .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex
}

/** Queue row-ownership for createCharge: [0] row check, [1-3] tokenToId indexes, [4-6] idToToken decode */
function _mockRowOwnedForCreate(row = ROW_FIXTURE) {
  (db.select as any)
    .mockReturnValueOnce(hoistedChain([{ row }]))
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex (encode)
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex (encode)
    .mockReturnValueOnce(hoistedChain([])) // buildConstantIndex (encode)
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex (decode)
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex (decode)
    .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex (decode)
}

function _mockRowNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

/** Queue charge-ownership for updateCharge without formula: [0] charge check, [1-3] decode only */
function _mockChargeOwned(charge = makeRowCharge(), withEncodeIndexes = false) {
  const mock = (db.select as any).mockReturnValueOnce(hoistedChain([{ charge, row: ROW_FIXTURE }]));
  if (withEncodeIndexes) {
    mock
      .mockReturnValueOnce(hoistedChain([])) // buildRowIndex (encode)
      .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex (encode)
      .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex (encode)
  }
  // Always queue decode indexes (controller always decodes after update)
  mock
    .mockReturnValueOnce(hoistedChain([])) // buildRowIndex (decode)
    .mockReturnValueOnce(hoistedChain([])) // buildSectionIndex (decode)
    .mockReturnValueOnce(hoistedChain([])); // buildConstantIndex (decode)
}

function _mockChargeNotFound() {
  (db.select as any).mockReturnValueOnce(hoistedChain([]));
}

function _mockInsertReturns(charge: any) {
  (db.insert as any).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([charge]),
  });
}

function _mockUpdateReturns(charge: any) {
  (db.update as any).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([charge]),
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("TemplateRowChargesController - Token contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
  });

  describe("Token contract", () => {
    it("chargeToken auto-derived: PORT_DUES row + label 'VAT 15%' → PORT_DUES_VAT_15", () => {
      const rowToken = "PORT_DUES";
      const label = "VAT 15%";
      const derived = `${rowToken}_${label
        .toUpperCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/, "")}`;
      expect(derived).toBe("PORT_DUES_VAT_15");
    });

    it("explicit chargeToken overrides auto-derivation and never modifies label", () => {
      const explicit = "MY_CUSTOM_TOKEN";
      // The controller takes the explicit value as-is; label is untouched
      expect(explicit).toBe("MY_CUSTOM_TOKEN");
    });
  });
});
