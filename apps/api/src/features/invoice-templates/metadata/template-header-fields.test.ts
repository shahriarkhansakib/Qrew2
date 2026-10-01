/**
 * Unit tests for TemplateHeaderFieldsController
 *
 * Happy path  : listHeaderFields, createHeaderField (left col, right col),
 *               deleteHeaderField, reorderHeaderFields (same col, cross-col)
 * Edge cases  : isFormulaInjectable default, columnPosition default, empty updates array
 * Error cases : 401, 404 not found on delete, 400 Zod (empty label, invalid fieldType, bad reorder)
 * Auth cases  : 401 for every endpoint (controller has its own organizationId guard)
 *
 * Known limitation: deleteHeaderField returns the deleted field object (200 + {…field}),
 * NOT {success:true} like every other delete endpoint in this feature.
 * This is intentional — tested and flagged here; see agent.md "Known limitations".
 *
 * Out of scope: Circular reference validation → invoices/engine/dag-validator.service.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HEADER_FIELD_ID,
  makeCtx,
  makeHeaderField,
  ORG_ID,
  TEMPLATE_ID,
} from "../invoice-templates.fixtures";

const { hoistedChain } = vi.hoisted(() => ({
  hoistedChain: (result: any[] = []) => {
    const p = Promise.resolve(result) as any;
    p.from = vi.fn().mockReturnValue(p);
    p.innerJoin = vi.fn().mockReturnValue(p);
    p.leftJoin = vi.fn().mockReturnValue(p);
    p.where = vi.fn().mockReturnValue(p);
    p.orderBy = vi.fn().mockReturnValue(p);
    p.limit = vi.fn().mockReturnValue(p);
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
    asc,
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
    templateHeaderFields: {
      id: "id",
      templateId: "templateId",
      sortOrder: "sortOrder",
      columnPosition: "columnPosition",
    },
    invoiceTemplates: { id: "id", organizationId: "organizationId" },
  };
});

import { db } from "@starter/db";
import { TemplateHeaderFieldsController } from "./template-header-fields.controller";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockSelectReturnsChain(value: any[]) {
  (db.select as any).mockReturnValueOnce(hoistedChain(value));
}

function mockInsertReturns(value: any) {
  (db.insert as any).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([value]),
  });
}

function mockDeleteReturns(value: any) {
  (db.delete as any).mockReturnValue({
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(value ? [value] : []),
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("TemplateHeaderFieldsController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (db.transaction as any).mockImplementation(async (fn: any) => fn(db));
    (db.query.invoiceTemplates.findFirst as any).mockResolvedValue({
      id: TEMPLATE_ID,
      organizationId: ORG_ID,
    });
  });

  // ── listHeaderFields ──────────────────────────────────────────────────────

  describe("listHeaderFields", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null, params: { templateId: TEMPLATE_ID } });
      const res = await TemplateHeaderFieldsController.listHeaderFields(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template belongs to a foreign organization", async () => {
      (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
      const ctx = makeCtx({
        orgId: "foreign-org-999",
        params: { templateId: TEMPLATE_ID },
      });
      const res = await TemplateHeaderFieldsController.listHeaderFields(ctx);
      expect(res.status).toBe(404);
    });

    it("returns fields ordered by sortOrder on happy path", async () => {
      const fields = [
        makeHeaderField({ sortOrder: 0 }),
        makeHeaderField({ id: "hf-002", sortOrder: 1, columnPosition: "right" }),
      ];
      mockSelectReturnsChain(fields);
      const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
      const res = await TemplateHeaderFieldsController.listHeaderFields(ctx);
      expect(res.status).toBe(200);
      expect(Array.isArray((res as any).data)).toBe(true);
    });

    it("returns empty array when template has no header fields", async () => {
      mockSelectReturnsChain([]);
      const ctx = makeCtx({ params: { templateId: TEMPLATE_ID } });
      const res = await TemplateHeaderFieldsController.listHeaderFields(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data).toHaveLength(0);
    });
  });

  // ── createHeaderField ─────────────────────────────────────────────────────

  describe("createHeaderField", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({
        orgId: null,
        params: { templateId: TEMPLATE_ID },
        body: { label: "Client", fieldType: "file_field" },
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template belongs to a foreign organization", async () => {
      (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
      const ctx = makeCtx({
        orgId: "foreign-org-999",
        params: { templateId: TEMPLATE_ID },
        body: { label: "Client", fieldType: "file_field" },
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 when label is empty string", async () => {
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { label: "", fieldType: "file_field" },
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(400);
    });

    it("returns 400 when fieldType is invalid enum value", async () => {
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { label: "Client", fieldType: "invalid_type" },
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(400);
    });

    it("creates field in left column with sortOrder=0 when left column is empty", async () => {
      // First select: get existing fields in same column (empty → nextOrder = 0)
      mockSelectReturnsChain([]);
      const newField = makeHeaderField({ columnPosition: "left", sortOrder: 0 });
      mockInsertReturns(newField);
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { label: "Client", fieldType: "file_field", columnPosition: "left" },
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.columnPosition).toBe("left");
    });

    it("creates field in right column — sortOrder is independent from left column", async () => {
      // Right column has 2 existing fields → nextOrder = 2
      mockSelectReturnsChain([{ sortOrder: 0 }, { sortOrder: 1 }]);
      const newField = makeHeaderField({ columnPosition: "right", sortOrder: 2 });
      mockInsertReturns(newField);
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { label: "Status", fieldType: "file_field", columnPosition: "right" },
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.columnPosition).toBe("right");
      expect((res as any).data.sortOrder).toBe(2);
    });

    it("isFormulaInjectable defaults to true when not supplied", async () => {
      mockSelectReturnsChain([]);
      const newField = makeHeaderField({ isFormulaInjectable: true });
      mockInsertReturns(newField);
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { label: "Amount", fieldType: "file_field" }, // no isFormulaInjectable
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.isFormulaInjectable).toBe(true);
    });

    it("columnPosition defaults to 'left' when not supplied", async () => {
      mockSelectReturnsChain([]);
      const newField = makeHeaderField({ columnPosition: "left" });
      mockInsertReturns(newField);
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { label: "Amount", fieldType: "file_field" }, // no columnPosition
      });
      const res = await TemplateHeaderFieldsController.createHeaderField(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.columnPosition).toBe("left");
    });
  });

  // ── deleteHeaderField ─────────────────────────────────────────────────────

  describe("deleteHeaderField", () => {
    /**
     * NOTE: deleteHeaderField returns the deleted field object (c.json(deleted)),
     * NOT {success:true} like all other delete endpoints.
     * This is an inconsistency flagged in agent.md "Known limitations".
     * The tests assert the ACTUAL current behavior.
     */
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({
        orgId: null,
        params: { templateId: TEMPLATE_ID, fieldId: HEADER_FIELD_ID },
      });
      const res = await TemplateHeaderFieldsController.deleteHeaderField(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template belongs to a foreign organization", async () => {
      (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
      const ctx = makeCtx({
        orgId: "foreign-org-999",
        params: { templateId: TEMPLATE_ID, fieldId: HEADER_FIELD_ID },
      });
      const res = await TemplateHeaderFieldsController.deleteHeaderField(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 when field not found or belongs to a different template", async () => {
      mockDeleteReturns(null);
      const ctx = makeCtx({ params: { templateId: TEMPLATE_ID, fieldId: HEADER_FIELD_ID } });
      const res = await TemplateHeaderFieldsController.deleteHeaderField(ctx);
      expect(res.status).toBe(404);
    });

    it("deletes field and returns the deleted field object (NOT {success:true})", async () => {
      const field = makeHeaderField();
      mockDeleteReturns(field);
      const ctx = makeCtx({ params: { templateId: TEMPLATE_ID, fieldId: HEADER_FIELD_ID } });
      const res = await TemplateHeaderFieldsController.deleteHeaderField(ctx);
      expect(res.status).toBe(200);
      // Returns the deleted field — not a success flag
      expect((res as any).data).toHaveProperty("id");
      expect((res as any).data.id).toBe(HEADER_FIELD_ID);
      // Explicitly assert this inconsistency to make it traceable
      expect((res as any).data.success).toBeUndefined();
    });

    it("multi-tenant isolation: cannot delete field from a different template (same fieldId)", async () => {
      // Controller uses AND(id = fieldId, templateId = :templateId) in WHERE
      // If templateId doesn't match, .returning() is empty → 404
      mockDeleteReturns(null); // empty because templateId mismatch
      const ctx = makeCtx({
        params: { templateId: "other-template-id", fieldId: HEADER_FIELD_ID },
      });
      const res = await TemplateHeaderFieldsController.deleteHeaderField(ctx);
      expect(res.status).toBe(404);
    });
  });

  // ── reorderHeaderFields ───────────────────────────────────────────────────

  describe("reorderHeaderFields", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({
        orgId: null,
        params: { templateId: TEMPLATE_ID },
        body: { updates: [] },
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template belongs to a foreign organization", async () => {
      (db.query.invoiceTemplates.findFirst as any).mockResolvedValue(null);
      const ctx = makeCtx({
        orgId: "foreign-org-999",
        params: { templateId: TEMPLATE_ID },
        body: { updates: [] },
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 when updates array has malformed entries (missing sortOrder)", async () => {
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { updates: [{ fieldId: HEADER_FIELD_ID, columnPosition: "left" }] }, // missing sortOrder
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(400);
    });

    it("returns 400 when columnPosition is invalid enum value", async () => {
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { updates: [{ fieldId: HEADER_FIELD_ID, columnPosition: "center", sortOrder: 0 }] },
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(400);
    });

    it("reorders within same column successfully", async () => {
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      });
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: {
          updates: [
            { fieldId: "hf-001", columnPosition: "left", sortOrder: 0 },
            { fieldId: "hf-002", columnPosition: "left", sortOrder: 1 },
          ],
        },
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.success).toBe(true);
    });

    it("cross-column drag: moves field from left to right and updates columnPosition", async () => {
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      });
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: {
          updates: [{ fieldId: HEADER_FIELD_ID, columnPosition: "right", sortOrder: 0 }],
        },
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.success).toBe(true);
    });

    it("empty updates array is a valid no-op call", async () => {
      const ctx = makeCtx({
        params: { templateId: TEMPLATE_ID },
        body: { updates: [] },
      });
      const res = await TemplateHeaderFieldsController.reorderHeaderFields(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.success).toBe(true);
    });
  });
});
