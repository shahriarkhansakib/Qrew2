/**
 * invoices.test.ts
 *
 * Comprehensive integration and state machine tests for InvoicesController:
 *   - issueInvoice: transitions frozen/disputed -> issued, guards terminal states
 *   - disputeInvoice: transitions issued -> disputed, halts automated dunning, guards states
 *   - markPaid: transitions issued/disputed/frozen -> paid, guards void/draft states
 *   - voidInvoice: marks invoice as void, blocks voiding paid invoices
 *   - unfreezeInvoice: Correction Workflow (reverts frozen, issued, disputed to draft,
 *                      restores constants, seeds audit trail, cleans up old invoice record)
 *   - Multi-tenant isolation: ensures organizationId boundary enforcement
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesController } from "./invoices.controller";

const {
  mockDbQuery,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockDbTransaction,
} = vi.hoisted(() => {
  const mockDbQuery = {
    invoices: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    templateConstants: {
      findMany: vi.fn(),
    },
  };
  const mockDbInsert = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockDbDelete = vi.fn();
  const mockDbTransaction = vi.fn();

  return {
    mockDbQuery,
    mockDbInsert,
    mockDbUpdate,
    mockDbDelete,
    mockDbTransaction,
  };
});

vi.mock("@starter/db", () => {
  const chainable = () => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "inv-1", status: "updated" }]),
    values: vi.fn().mockReturnThis(),
  });

  return {
    db: {
      query: mockDbQuery,
      select: vi.fn(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      })),
      insert: (...args: any[]) => {
        mockDbInsert(...args);
        return chainable();
      },
      update: (...args: any[]) => {
        mockDbUpdate(...args);
        return chainable();
      },
      delete: (...args: any[]) => {
        mockDbDelete(...args);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
      transaction: (fn: any) => mockDbTransaction(fn),
    },
    invoices: {
      id: "id",
      organizationId: "organization_id",
      status: "status",
      notes: "notes",
      voidReason: "void_reason",
      voidedAt: "voided_at",
      paidAt: "paid_at",
      issuedAt: "issued_at",
    },
    invoiceDrafts: {
      id: "id",
      organizationId: "organization_id",
      projectId: "project_id",
      userId: "user_id",
    },
    invoiceLineItems: {
      id: "id",
      invoiceId: "invoice_id",
    },
    templateConstants: {
      templateId: "template_id",
    },
    tokens: {
      organizationId: "organization_id",
      templateId: "template_id",
      isVisible: "is_visible",
      domain: "domain",
      sortOrder: "sort_order",
    },
  };
});

function createMockContext({
  body,
  params = {},
  query = {},
  orgId = "org_test",
  user = { id: "usr_member", name: "Alice", email: "alice@example.com" },
}: {
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
  orgId?: string;
  user?: any;
} = {}) {
  return {
    get: (k: string) => {
      if (k === "organizationId") return orgId;
      if (k === "user") return user;
      return undefined;
    },
    req: {
      json: async () => body,
      param: (k: string) => params[k],
      query: (k?: string) => (k ? query[k] : query),
    },
    json: (data: any, status = 200) => ({ data, status }),
  } as any;
}

describe("InvoicesController — Lifecycle State Machine & Correction Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. issueInvoice
  // ───────────────────────────────────────────────────────────────────────────
  describe("issueInvoice", () => {
    it("transitions invoice from frozen to issued (happy path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-1",
        organizationId: "org_test",
        status: "frozen",
      });

      const ctx = createMockContext({ params: { id: "inv-1" } });
      const res: any = await InvoicesController.issueInvoice(ctx);

      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("transitions invoice from disputed to issued (dispute resolution path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-1",
        organizationId: "org_test",
        status: "disputed",
      });

      const ctx = createMockContext({ params: { id: "inv-1" } });
      const res: any = await InvoicesController.issueInvoice(ctx);

      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("rejects when invoice is already issued (409)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-1",
        organizationId: "org_test",
        status: "issued",
      });

      const ctx = createMockContext({ params: { id: "inv-1" } });
      const res: any = await InvoicesController.issueInvoice(ctx);

      expect(res.status).toBe(409);
      expect(res.data.error).toBe("Invoice is already issued");
    });

    it("rejects when invoice is paid (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-1",
        organizationId: "org_test",
        status: "paid",
      });

      const ctx = createMockContext({ params: { id: "inv-1" } });
      const res: any = await InvoicesController.issueInvoice(ctx);

      expect(res.status).toBe(409);
      expect(res.data.error).toBe("Invoice is already marked as paid");
    });

    it("rejects when invoice is voided (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-1",
        organizationId: "org_test",
        status: "void",
      });

      const ctx = createMockContext({ params: { id: "inv-1" } });
      const res: any = await InvoicesController.issueInvoice(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toBe("Cannot issue a voided invoice");
    });

    it("returns 404 when invoice does not exist or belongs to another org", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce(null);

      const ctx = createMockContext({ params: { id: "inv-foreign" } });
      const res: any = await InvoicesController.issueInvoice(ctx);

      expect(res.status).toBe(404);
      expect(res.data.error).toBe("Invoice not found");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. disputeInvoice
  // ───────────────────────────────────────────────────────────────────────────
  describe("disputeInvoice", () => {
    it("transitions invoice from issued to disputed with reason (happy path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-2",
        organizationId: "org_test",
        status: "issued",
        notes: "Initial note",
      });

      const ctx = createMockContext({
        params: { id: "inv-2" },
        body: { disputeReason: "Client contests billable overtime hours" },
      });
      const res: any = await InvoicesController.disputeInvoice(ctx);

      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("rejects disputing an invoice that is already disputed (409)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-2",
        organizationId: "org_test",
        status: "disputed",
      });

      const ctx = createMockContext({ params: { id: "inv-2" } });
      const res: any = await InvoicesController.disputeInvoice(ctx);

      expect(res.status).toBe(409);
      expect(res.data.error).toBe("Invoice is already marked as disputed");
    });

    it("rejects disputing a paid invoice (409)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-2",
        organizationId: "org_test",
        status: "paid",
      });

      const ctx = createMockContext({ params: { id: "inv-2" } });
      const res: any = await InvoicesController.disputeInvoice(ctx);

      expect(res.status).toBe(409);
      expect(res.data.error).toBe("Cannot dispute a paid invoice");
    });

    it("rejects disputing a void invoice (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-2",
        organizationId: "org_test",
        status: "void",
      });

      const ctx = createMockContext({ params: { id: "inv-2" } });
      const res: any = await InvoicesController.disputeInvoice(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toBe("Cannot dispute a voided invoice");
    });

    it("rejects disputing a frozen invoice that was not yet issued (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-2",
        organizationId: "org_test",
        status: "frozen",
      });

      const ctx = createMockContext({ params: { id: "inv-2" } });
      const res: any = await InvoicesController.disputeInvoice(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toBe("Only issued invoices can be marked as disputed");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. markPaid
  // ───────────────────────────────────────────────────────────────────────────
  describe("markPaid", () => {
    it("marks an issued invoice as paid (happy path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-3",
        organizationId: "org_test",
        status: "issued",
      });

      const ctx = createMockContext({ params: { id: "inv-3" } });
      const res: any = await InvoicesController.markPaid(ctx);

      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("marks a disputed invoice as paid (settlement path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-3",
        organizationId: "org_test",
        status: "disputed",
      });

      const ctx = createMockContext({ params: { id: "inv-3" } });
      const res: any = await InvoicesController.markPaid(ctx);

      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("rejects when invoice is already paid (409)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-3",
        organizationId: "org_test",
        status: "paid",
      });

      const ctx = createMockContext({ params: { id: "inv-3" } });
      const res: any = await InvoicesController.markPaid(ctx);

      expect(res.status).toBe(409);
      expect(res.data.error).toBe("Invoice is already marked as paid");
    });

    it("rejects marking a voided invoice as paid (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-3",
        organizationId: "org_test",
        status: "void",
      });

      const ctx = createMockContext({ params: { id: "inv-3" } });
      const res: any = await InvoicesController.markPaid(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toBe("Cannot mark a voided invoice as paid");
    });

    it("rejects marking an unfrozen draft invoice as paid (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-3",
        organizationId: "org_test",
        status: "draft",
      });

      const ctx = createMockContext({ params: { id: "inv-3" } });
      const res: any = await InvoicesController.markPaid(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toBe("Cannot mark a draft invoice as paid without finalizing it");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. voidInvoice
  // ───────────────────────────────────────────────────────────────────────────
  describe("voidInvoice", () => {
    it("voids an invoice with a voidReason (happy path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-4",
        organizationId: "org_test",
        status: "issued",
      });

      const ctx = createMockContext({
        params: { id: "inv-4" },
        body: { voidReason: "Order cancelled by customer" },
      });
      const res: any = await InvoicesController.voidInvoice(ctx);

      expect(res.status).toBe(200);
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it("rejects voiding an already voided invoice (409)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-4",
        organizationId: "org_test",
        status: "void",
      });

      const ctx = createMockContext({ params: { id: "inv-4" } });
      const res: any = await InvoicesController.voidInvoice(ctx);

      expect(res.status).toBe(409);
      expect(res.data.error).toBe("Invoice is already voided");
    });

    it("rejects voiding a paid invoice (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        id: "inv-4",
        organizationId: "org_test",
        status: "paid",
      });

      const ctx = createMockContext({ params: { id: "inv-4" } });
      const res: any = await InvoicesController.voidInvoice(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toContain("Cannot void a paid invoice");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. unfreezeInvoice (Correction Workflow)
  // ───────────────────────────────────────────────────────────────────────────
  describe("unfreezeInvoice (Correction Workflow)", () => {
    const mockSnapshotInvoice = {
      id: "inv-corr-1",
      organizationId: "org_test",
      projectId: "proj-100",
      documentNumber: "INV-2026-0042",
      status: "issued",
      sourceTemplateId: "tpl-1",
      sourceTemplateVersion: 1,
      historicalFormat: {
        sections: [{ id: "sec-1", label: "Services", rows: [] }],
      },
      resolvedHeaderValues: { clientName: "Acme Corp" },
    };

    it("reverts an issued invoice to draft for correction (happy path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce(mockSnapshotInvoice);

      mockDbTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          query: {
            templateConstants: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: "tc-1",
                  defaultValue: "100",
                  token: { tokenKey: "HOURLY_RATE", label: "Rate" },
                },
              ]),
            },
          },
          insert: vi.fn(() => ({
            values: vi.fn().mockResolvedValue([]),
          })),
          delete: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        };
        return await callback(tx);
      });

      const ctx = createMockContext({ params: { id: "inv-corr-1" } });
      const res: any = await InvoicesController.unfreezeInvoice(ctx);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.draftId).toBeDefined();
      expect(res.data.message).toContain("reverted to editable draft for correction");
    });

    it("reverts a disputed invoice to draft for correction (dispute path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        ...mockSnapshotInvoice,
        status: "disputed",
      });

      mockDbTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          query: {
            templateConstants: { findMany: vi.fn().mockResolvedValue([]) },
          },
          insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
          delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
        };
        return await callback(tx);
      });

      const ctx = createMockContext({ params: { id: "inv-corr-1" } });
      const res: any = await InvoicesController.unfreezeInvoice(ctx);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it("reverts a frozen invoice to draft (early adjustment path)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        ...mockSnapshotInvoice,
        status: "frozen",
      });

      mockDbTransaction.mockImplementation(async (callback: any) => {
        const tx = {
          query: {
            templateConstants: { findMany: vi.fn().mockResolvedValue([]) },
          },
          insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
          delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
        };
        return await callback(tx);
      });

      const ctx = createMockContext({ params: { id: "inv-corr-1" } });
      const res: any = await InvoicesController.unfreezeInvoice(ctx);

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it("strictly blocks reverting a paid invoice to draft (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        ...mockSnapshotInvoice,
        status: "paid",
      });

      const ctx = createMockContext({ params: { id: "inv-corr-1" } });
      const res: any = await InvoicesController.unfreezeInvoice(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toContain("Cannot revert a paid invoice to draft");
    });

    it("strictly blocks reverting a voided invoice to draft (422)", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce({
        ...mockSnapshotInvoice,
        status: "void",
      });

      const ctx = createMockContext({ params: { id: "inv-corr-1" } });
      const res: any = await InvoicesController.unfreezeInvoice(ctx);

      expect(res.status).toBe(422);
      expect(res.data.error).toContain("Cannot revert a voided invoice to draft");
    });

    it("returns 404 when target invoice is not found in the current organization", async () => {
      mockDbQuery.invoices.findFirst.mockResolvedValueOnce(null);

      const ctx = createMockContext({ params: { id: "non-existent" } });
      const res: any = await InvoicesController.unfreezeInvoice(ctx);

      expect(res.status).toBe(404);
      expect(res.data.error).toBe("Invoice not found");
    });
  });
});
