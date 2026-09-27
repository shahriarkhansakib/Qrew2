import {
  db,
  expenseCategories,
  invoiceDrafts,
  invoiceLineItems,
  invoices,
  organizationConfigs,
  templateHeaderFields,
  templateRows,
  templateSections,
  tokens,
} from "@starter/db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
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

      const [invoice] = await db
        .update(invoices)
        .set({ status: "issued", issuedAt: new Date() })
        .where(
          and(
            eq(invoices.id, id!),
            eq(invoices.organizationId, organizationId!),
            eq(invoices.status, "frozen"),
          ),
        )
        .returning();

      if (!invoice) return c.json({ error: "Invoice not found or not in frozen state" }, 404);

      return c.json(invoice);
    } catch (err: any) {
      console.error("[InvoicesController.issueInvoice]", err);
      return c.json({ error: "Failed to issue invoice" }, 500);
    }
  }

  static async voidInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");
      const body = await c.req.json();

      const [invoice] = await db
        .update(invoices)
        .set({ status: "void", voidedAt: new Date(), voidReason: body.voidReason || null })
        .where(and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)))
        .returning();

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);

      return c.json(invoice);
    } catch (err: any) {
      console.error("[InvoicesController.voidInvoice]", err);
      return c.json({ error: "Failed to void invoice" }, 500);
    }
  }

  static async markPaid(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");

      const [invoice] = await db
        .update(invoices)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(eq(invoices.id, id!), eq(invoices.organizationId, organizationId!)))
        .returning();

      if (!invoice) return c.json({ error: "Invoice not found" }, 404);

      return c.json(invoice);
    } catch (err: any) {
      console.error("[InvoicesController.markPaid]", err);
      return c.json({ error: "Failed to mark invoice as paid" }, 500);
    }
  }

  static async unfreezeInvoice(c: Context) {
    try {
      const id = c.req.param("id");
      const organizationId = c.get("organizationId");
      const userId = (c.get("user") as any).id;

      // Find the frozen invoice
      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, id!),
          eq(invoices.organizationId, organizationId!),
          eq(invoices.status, "frozen"),
        ),
      });

      if (!invoice) return c.json({ error: "Frozen invoice not found" }, 404);

      await db.transaction(async (tx) => {
        // Create draft from the historical snapshot
        const { historicalFormat, resolvedHeaderValues } = invoice;

        // Check if draft exists
        const [existingDraft] = await tx
          .select()
          .from(invoiceDrafts)
          .where(
            and(eq(invoiceDrafts.projectId, invoice.projectId), eq(invoiceDrafts.userId, userId)),
          )
          .limit(1);

        if (existingDraft) {
          await tx
            .update(invoiceDrafts)
            .set({
              sourceTemplateId: invoice.sourceTemplateId,
              draftHeaderValues: resolvedHeaderValues || {},
              draftSections: historicalFormat?.sections || [],
              draftConstants: {},
              lastAutoSavedAt: new Date(),
            })
            .where(eq(invoiceDrafts.id, existingDraft.id));
        } else {
          await tx.insert(invoiceDrafts).values({
            id: crypto.randomUUID(),
            organizationId: invoice.organizationId,
            projectId: invoice.projectId,
            userId: userId,
            sourceTemplateId: invoice.sourceTemplateId,
            draftHeaderValues: resolvedHeaderValues || {},
            draftConstants: {},
            draftSections: historicalFormat?.sections || [],
            lastAutoSavedAt: new Date(),
          });
        }

        // Delete the frozen invoice (which also deletes line items due to cascade)
        await tx.delete(invoices).where(eq(invoices.id, id!));
      });

      return c.json({ success: true, message: "Reverted to draft" });
    } catch (err: any) {
      console.error("[InvoicesController.unfreezeInvoice]", err);
      return c.json({ error: "Failed to unfreeze invoice" }, 500);
    }
  }
}
