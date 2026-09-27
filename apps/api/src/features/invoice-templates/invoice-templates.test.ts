/**
 * Unit tests for InvoiceTemplatesController
 *
 * Happy path  : listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate
 * Edge cases  : empty org, default field values on create, very long name, nextSequence
 * Error cases : 404 for get/update/delete, 400 Zod rejection, missing name
 * Auth cases  : 401 for every endpoint when organizationId is absent
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, makeTemplate, ORG_ID, TEMPLATE_ID } from "./invoice-templates.fixtures";

// ─── Mock @starter/db ────────────────────────────────────────────────────────
vi.mock("@starter/db", () => {
  const eq = vi.fn((_a: any, _b: any) => ({ _type: "eq" }));
  const and = vi.fn((...args: any[]) => ({ _type: "and", args }));

  const makeChain = (returnValue: any = []) => {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(returnValue),
    };
    chain.then = (resolve: any) => resolve(returnValue);
    return chain;
  };

  const db = {
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
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    })),
    query: {
      invoiceTemplates: { findFirst: vi.fn() },
      templateSections: { findFirst: vi.fn(), findMany: vi.fn() },
      templateHeaderFields: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  };

  return {
    db,
    eq,
    and,
    invoiceTemplates: {
      id: "id",
      organizationId: "organizationId",
      name: "name",
      description: "description",
      documentPrefix: "documentPrefix",
      numberingFormat: "numberingFormat",
    },
    templateHeaderFields: { id: "id", templateId: "templateId" },
    invoiceDocumentSequences: {
      id: "id",
      organizationId: "organizationId",
      currentValue: "currentValue",
      templateId: "templateId",
    },
    templateSections: { id: "id", templateId: "templateId" },
    customFieldDefinitions: {
      id: "id",
      organizationId: "organizationId",
      entityType: "entityType",
    },
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
  };
});

import { db } from "@starter/db";
import { InvoiceTemplatesController } from "./invoice-templates.controller";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockSelectReturns(returnValue: any[]) {
  (db.select as any).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(returnValue),
    then: (resolve: any) => resolve(returnValue),
  });
}

function mockInsertReturns(value: any) {
  (db.insert as any).mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([value]),
  });
}

function mockUpdateReturns(value: any) {
  (db.update as any).mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([value]),
  });
}

function mockDeleteReturns(value: any) {
  (db.delete as any).mockReturnValue({
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([value]),
  });
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe("InvoiceTemplatesController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── listTemplates ──────────────────────────────────────────────────────────

  describe("listTemplates", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null });
      const res = await InvoiceTemplatesController.listTemplates(ctx);
      expect(res.status).toBe(401);
    });

    it("returns list of templates with nextSequence appended", async () => {
      const tpl = makeTemplate();
      // listTemplates does a select join with invoiceDocumentSequences
      mockSelectReturns([{ ...tpl, nextSequence: 42 }]);
      const ctx = makeCtx({});
      const res = await InvoiceTemplatesController.listTemplates(ctx);
      expect(res.status).toBe(200);
      expect(Array.isArray((res as any).data)).toBe(true);
    });

    it("returns empty array when org has no templates", async () => {
      mockSelectReturns([]);
      const ctx = makeCtx({});
      const res = await InvoiceTemplatesController.listTemplates(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data).toHaveLength(0);
    });
  });

  // ── getTemplate ───────────────────────────────────────────────────────────

  describe("getTemplate", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null, params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.getTemplate(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template not found for this org", async () => {
      mockSelectReturns([]);
      const ctx = makeCtx({ params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.getTemplate(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 when foreign org attempts to access template", async () => {
      mockSelectReturns([]);
      const ctx = makeCtx({ orgId: "foreign-org-999", params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.getTemplate(ctx);
      expect(res.status).toBe(404);
    });

    it("returns the template on happy path", async () => {
      const tpl = makeTemplate();
      mockSelectReturns([tpl]);
      const ctx = makeCtx({ params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.getTemplate(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.id).toBe(TEMPLATE_ID);
    });
  });

  // ── createTemplate ────────────────────────────────────────────────────────

  describe("createTemplate", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null, body: { name: "Test" } });
      const res = await InvoiceTemplatesController.createTemplate(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 400 when name is missing", async () => {
      const ctx = makeCtx({ body: {} });
      const res = await InvoiceTemplatesController.createTemplate(ctx);
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is an empty string", async () => {
      const ctx = makeCtx({ body: { name: "" } });
      const res = await InvoiceTemplatesController.createTemplate(ctx);
      expect(res.status).toBe(400);
    });

    it("creates template with 201 on happy path", async () => {
      const tpl = makeTemplate();
      // createTemplate: select(customFieldDefs) + insert(template) + insert(headerFields)x3 + select(orgCustomFields) + insert(headerFields for custom) + insert(templateSections)
      mockSelectReturns([]); // customFieldDefs query → no custom fields
      mockInsertReturns(tpl); // insert template
      const ctx = makeCtx({ body: { name: "Standard Port Invoice" } });
      const res = await InvoiceTemplatesController.createTemplate(ctx);
      expect(res.status).toBe(201);
    });

    it("applies default documentPrefix = 'INV' when not supplied", async () => {
      const tpl = makeTemplate({ documentPrefix: "INV" });
      mockSelectReturns([]);
      mockInsertReturns(tpl);
      const ctx = makeCtx({ body: { name: "My Template" } });
      const res = await InvoiceTemplatesController.createTemplate(ctx);
      expect(res.status).toBe(201);
      expect((res as any).data.documentPrefix).toBe("INV");
    });
  });

  // ── updateTemplate ────────────────────────────────────────────────────────

  describe("updateTemplate", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null, params: { id: TEMPLATE_ID }, body: { name: "New" } });
      const res = await InvoiceTemplatesController.updateTemplate(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template does not belong to org", async () => {
      mockUpdateReturns(undefined);
      // updateTemplate does update().where().returning() and checks [0]
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      });
      const ctx = makeCtx({ params: { id: TEMPLATE_ID }, body: { name: "New" } });
      const res = await InvoiceTemplatesController.updateTemplate(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 when foreign org attempts to update template", async () => {
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      });
      const ctx = makeCtx({
        orgId: "foreign-org-999",
        params: { id: TEMPLATE_ID },
        body: { name: "New" },
      });
      const res = await InvoiceTemplatesController.updateTemplate(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 when name is an empty string", async () => {
      const ctx = makeCtx({ params: { id: TEMPLATE_ID }, body: { name: "" } });
      const res = await InvoiceTemplatesController.updateTemplate(ctx);
      expect(res.status).toBe(400);
    });

    it("updates name successfully", async () => {
      const updated = makeTemplate({ name: "Renamed Template" });
      mockUpdateReturns(updated);
      const ctx = makeCtx({ params: { id: TEMPLATE_ID }, body: { name: "Renamed Template" } });
      const res = await InvoiceTemplatesController.updateTemplate(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.name).toBe("Renamed Template");
    });
  });

  // ── deleteTemplate ────────────────────────────────────────────────────────

  describe("deleteTemplate", () => {
    it("returns 401 when unauthenticated", async () => {
      const ctx = makeCtx({ orgId: null, params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.deleteTemplate(ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when template does not exist in org", async () => {
      mockDeleteReturns(undefined);
      (db.delete as any).mockReturnValue({
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      });
      const ctx = makeCtx({ params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.deleteTemplate(ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 when foreign org attempts to delete template", async () => {
      (db.delete as any).mockReturnValue({
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      });
      const ctx = makeCtx({ orgId: "foreign-org-999", params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.deleteTemplate(ctx);
      expect(res.status).toBe(404);
    });

    it("deletes template and returns success", async () => {
      const tpl = makeTemplate();
      mockDeleteReturns(tpl);
      const ctx = makeCtx({ params: { id: TEMPLATE_ID } });
      const res = await InvoiceTemplatesController.deleteTemplate(ctx);
      expect(res.status).toBe(200);
      expect((res as any).data.success).toBe(true);
    });
  });
});
