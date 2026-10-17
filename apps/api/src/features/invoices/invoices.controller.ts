import {
  db,
  invoiceDrafts,
  invoiceLineItems,
  invoices,
  templateConstants,
  tokens,
} from "@starter/db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { appendAuditEntry } from "./drafts/draft-audit";
import { freezeInvoice } from "./engine/invoice-freeze";

const generateSchema = z.object({
  projectId: z.string(),
  clientId: z.string(),
  sourceTemplateId: z.string().optional(),
  sourceTemplateVersion: z.number().optional(),
  headerFieldValues: z.record(z.string(), z.string()).default({}),
  issuedToClientName: z.string(),
  currency: z.string().default("USD"),
  notes: z.string().optional(),
});

export class InvoicesController {
  static async getTokens(c: Context) {
    try {
      const orgId = c.get("organizationId");
      if (!orgId) return c.json({ error: "Organization context required" }, 401);

      const templateId = c.req.query("templateId");

      const allTokens = await db
        .select()
        .from(tokens)
        .where(
          and(
            eq(tokens.organizationId, orgId),
            templateId
              ? or(eq(tokens.templateId, templateId), isNull(tokens.templateId))
              : isNull(tokens.templateId),
            eq(tokens.isVisible, true),
          ),
        )
        .orderBy(tokens.domain, tokens.sortOrder);

      const categories = allTokens
        .filter((t) => t.domain === "expense_category")
        .map((t) => ({
          tokenKey: t.tokenKey,
          label: t.label,
          token: t.tokenKey === "EXP_TOTAL" ? "EXP_TOTAL" : `EXP_${t.tokenKey}`,
        }));

      const orgConfigs = allTokens
        .filter((t) => t.domain === "global_constant")
        .map((t) => ({
          configKey: t.tokenKey,
          displayLabel: t.label,
          token: `GBL_${t.tokenKey}`,
        }));

      const fileFields = allTokens
        .filter((t) => t.domain === "file_field" && t.isInjectable)
        .map((t) => ({
          fieldKey: t.tokenKey,
          displayLabel: t.label,
          token: `FILE_${t.tokenKey}`,
        }));

      const sections = allTokens
        .filter((t) => t.domain === "section")
        .map((t) => ({
          sectionToken: t.tokenKey,
          name: t.label,
          token: `SEC_${t.tokenKey}`,
        }));

      const rows = allTokens
        .filter((t) => t.domain === "row")
        .map((t) => ({
          rowToken: t.tokenKey,
          label: t.label,
          token: t.tokenKey,
        }));

      return c.json({
        tokens: allTokens.map((t) => ({
          id: t.id,
          tokenKey: t.tokenKey,
          label: t.label,
          description: t.description,
          domain: t.domain,
          valueType: t.valueType,
          isInjectable: t.isInjectable,
          isSystem: t.isSystem,
        })),
        categories,
        orgConfigs,
        fileFields,
        sections,
        rows,
        categoryTokens: categories.map((c) => c.token),
        organizationTokens: orgConfigs.map((o) => o.token),
      });
    } catch (err: any) {
      console.error(err);
      return c.json({ error: "Failed to discover tokens" }, 500);
    }
  }

  static async listInvoices(c: Context) {
    try {
      const orgId = c.get("organizationId");
      if (!orgId) return c.json({ error: "Organization context required" }, 401);

      const projectId = c.req.query("projectId");
      const status = c.req.query("status");

      const conditions = [eq(invoices.organizationId, orgId)];
      if (projectId) conditions.push(eq(invoices.projectId, projectId));
      if (status) conditions.push(eq(invoices.status, status as any));

      const allInvoices = await db.query.invoices.findMany({
        where: and(...conditions),
        orderBy: [desc(invoices.createdAt)],
        with: {
          project: {
            with: {
              client: true,
            },
          },
        },
      });

      return c.json(allInvoices);
    } catch (err: any) {
      console.error(err);
      return c.json({ error: "Failed to list invoices" }, 500);
    }
  }

  static async getInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      if (!id) return c.json({ error: "Invoice ID required" }, 400);
      const orgId = c.get("organizationId");
      if (!orgId) return c.json({ error: "Organization context required" }, 401);

      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id), eq(invoices.organizationId, orgId)),
        with: {
          project: {
            with: {
              client: true,
            },
          },
        },
      });

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);

      const lines = await db
        .select()
        .from(invoiceLineItems)
        .where(eq(invoiceLineItems.invoiceId, id));

      return c.json({ invoice, lineItems: lines });
    } catch (err: any) {
      console.error(err);
      return c.json({ error: "Failed to get invoice" }, 500);
    }
  }

  static async generateInvoice(c: Context) {
    try {
      const organizationId = c.get("organizationId");
      const userId = (c.get("user") as any).id;
      const body = await c.req.json();
      const parsed = generateSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Invalid payload", details: parsed.error.format() }, 400);
      }

      const frozenInvoice = await freezeInvoice({
        organizationId,
        userId,
        ...parsed.data,
      });

      return c.json({
        invoiceId: frozenInvoice.id,
        documentNumber: frozenInvoice.documentNumber,
        status: frozenInvoice.status,
      });
    } catch (err: any) {
      console.error("[InvoicesController.generateInvoice]", err);
      if (err.message === "INVOICE_GENERATION_IN_PROGRESS") {
        return c.json(
          { error: "Invoice generation is already in progress for this project." },
          409,
        );
      }
      return c.json({ error: err.message || "Failed to generate invoice" }, 500);
    }
  }

  static async issueInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");

      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)),
      });

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);
      if (invoice.status === "issued") return c.json({ error: "Invoice is already issued" }, 409);
      if (invoice.status === "paid")
        return c.json({ error: "Invoice is already marked as paid" }, 409);
      if (invoice.status === "void") return c.json({ error: "Cannot issue a voided invoice" }, 422);
      if (invoice.status !== "frozen" && invoice.status !== "disputed") {
        return c.json(
          { error: `Cannot issue invoice from current status '${invoice.status}'` },
          422,
        );
      }

      const [updated] = await db
        .update(invoices)
        .set({ status: "issued", issuedAt: new Date() })
        .where(and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)))
        .returning();

      return c.json(updated);
    } catch (err: any) {
      console.error("[InvoicesController.issueInvoice]", err);
      return c.json({ error: "Failed to issue invoice" }, 500);
    }
  }

  static async disputeInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");
      let body: any = {};
      try {
        body = await c.req.json();
      } catch {
        // body is optional
      }

      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)),
      });

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);
      if (invoice.status === "disputed")
        return c.json({ error: "Invoice is already marked as disputed" }, 409);
      if (invoice.status === "paid") return c.json({ error: "Cannot dispute a paid invoice" }, 409);
      if (invoice.status === "void")
        return c.json({ error: "Cannot dispute a voided invoice" }, 422);
      if (invoice.status !== "issued") {
        return c.json({ error: "Only issued invoices can be marked as disputed" }, 422);
      }

      const [updated] = await db
        .update(invoices)
        .set({
          status: "disputed",
          notes: body.disputeReason ? `Dispute: ${body.disputeReason}` : invoice.notes,
        })
        .where(and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)))
        .returning();

      return c.json(updated);
    } catch (err: any) {
      console.error("[InvoicesController.disputeInvoice]", err);
      return c.json({ error: "Failed to mark invoice as disputed" }, 500);
    }
  }

  static async voidInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");
      const body = await c.req.json().catch(() => ({}));

      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)),
      });

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);
      if (invoice.status === "void") return c.json({ error: "Invoice is already voided" }, 409);
      if (invoice.status === "paid") {
        return c.json(
          { error: "Cannot void a paid invoice. Please record a credit note or refund." },
          422,
        );
      }

      const [updated] = await db
        .update(invoices)
        .set({ status: "void", voidedAt: new Date(), voidReason: body.voidReason || null })
        .where(and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)))
        .returning();

      return c.json(updated);
    } catch (err: any) {
      console.error("[InvoicesController.voidInvoice]", err);
      return c.json({ error: "Failed to void invoice" }, 500);
    }
  }

  static async markPaid(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");

      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)),
      });

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);
      if (invoice.status === "paid")
        return c.json({ error: "Invoice is already marked as paid" }, 409);
      if (invoice.status === "void")
        return c.json({ error: "Cannot mark a voided invoice as paid" }, 422);
      if (invoice.status === "draft") {
        return c.json({ error: "Cannot mark a draft invoice as paid without finalizing it" }, 422);
      }

      const [updated] = await db
        .update(invoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)))
        .returning();

      return c.json(updated);
    } catch (err: any) {
      console.error("[InvoicesController.markPaid]", err);
      return c.json({ error: "Failed to mark invoice as paid" }, 500);
    }
  }

  /**
   * Revert invoice to draft state (for corrections requested by clients or pre-issue adjustments).
   * Supports invoices in 'frozen', 'issued', or 'disputed' status.
   */
  static async unfreezeInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");
      const user = c.get("user") as any;

      // Find the invoice
      const invoice = await db.query.invoices.findFirst({
        where: and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)),
      });

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);

      if (invoice.status === "paid") {
        return c.json(
          { error: "Cannot revert a paid invoice to draft. Void or refund the invoice first." },
          422,
        );
      }
      if (invoice.status === "void") {
        return c.json({ error: "Cannot revert a voided invoice to draft." }, 422);
      }
      if (!["frozen", "issued", "disputed"].includes(invoice.status)) {
        return c.json(
          { error: `Cannot revert invoice with status '${invoice.status}' to draft` },
          422,
        );
      }

      const resultDraftId = await db.transaction(async (tx) => {
        // Create draft from the historical snapshot
        const { historicalFormat, resolvedHeaderValues } = invoice;

        // Restore template constants if available
        const restoredConstants: Record<string, any> = {};
        if (invoice.sourceTemplateId) {
          const tplConstants = await tx.query.templateConstants.findMany({
            where: eq(templateConstants.templateId, invoice.sourceTemplateId),
            with: { token: true },
          });
          for (const tc of tplConstants) {
            if (tc.token?.tokenKey) {
              restoredConstants[tc.token.tokenKey] = {
                id: tc.id,
                key: tc.token.tokenKey,
                value: tc.defaultValue || "0",
                description: tc.token.label,
              };
            }
          }
        }

        const draftName = invoice.documentNumber
          ? `Correction: ${invoice.documentNumber}`
          : "Draft";

        const auditHistory = appendAuditEntry(
          [],
          user,
          `Reverted from ${invoice.status} invoice (${invoice.documentNumber || "Draft"}) for correction`,
        );

        const newDraftId = crypto.randomUUID();
        await tx.insert(invoiceDrafts).values({
          id: newDraftId,
          organizationId: invoice.organizationId,
          projectId: invoice.projectId,
          userId: user.id,
          sourceTemplateId: invoice.sourceTemplateId,
          sourceTemplateVersion: invoice.sourceTemplateVersion,
          name: draftName,
          draftHeaderValues: resolvedHeaderValues || {},
          draftConstants: restoredConstants,
          draftSections: historicalFormat?.sections || [],
          editHistory: auditHistory,
          lastAutoSavedAt: new Date(),
        });

        // Delete the frozen/issued/disputed invoice record (which cascades to line items)
        await tx.delete(invoices).where(eq(invoices.id, id!));

        return newDraftId;
      });

      return c.json({
        success: true,
        message: "Invoice successfully reverted to editable draft for correction",
        draftId: resultDraftId,
      });
    } catch (err: any) {
      console.error("[InvoicesController.unfreezeInvoice]", err);
      return c.json({ error: "Failed to revert invoice to draft" }, 500);
    }
  }
}
