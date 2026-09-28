import { db, invoiceDocumentSequences, invoiceTemplates } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../tokens/token.service";
import { toSnakeCase } from "./rows/services/row-index.service";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  documentPrefix: z.string().optional().default("INV"),
  numberingFormat: z.string().optional().default("{PREFIX}-{YYYY}-{SEQ:4}"),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  documentPrefix: z.string().optional(),
  numberingFormat: z.string().optional(),
});

export class InvoiceTemplatesController {
  static async listTemplates(c: Context) {
    const _user = c.get("user");
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const templates = await db
      .select()
      .from(invoiceTemplates)
      .where(eq(invoiceTemplates.organizationId, organizationId));

    const [seqRow] = await db
      .select({ currentValue: invoiceDocumentSequences.currentValue })
      .from(invoiceDocumentSequences)
      .where(eq(invoiceDocumentSequences.organizationId, organizationId))
      .limit(1);

    const nextSequence = (seqRow?.currentValue || 0) + 1;

    return c.json(templates.map((t) => ({ ...t, nextSequence })));
  }

  static async getTemplate(c: Context) {
    const id = c.req.param("id") as string;
    const _user = c.get("user");
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const template = await db
      .select()
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .limit(1);

    if (template.length === 0) return c.json({ error: "Not found" }, 404);

    return c.json(template[0]);
  }

  static async createTemplate(c: Context) {
    const user = c.get("user");
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error }, 400);

    const templateId = crypto.randomUUID();

    const [newTemplate] = await db
      .insert(invoiceTemplates)
      .values({
        id: templateId,
        organizationId,
        name: parsed.data.name,
        description: parsed.data.description,
        documentPrefix: parsed.data.documentPrefix,
        numberingFormat: parsed.data.numberingFormat,
        createdByUserId: user.id,
      })
      .returning();

    // Seed default system fields for the template header
    const systemFields = [
      {
        fieldType: "file_field" as const,
        fileFieldKey: "name",
        label: "Name",
        sortOrder: 1,
        isFormulaInjectable: false,
      },
      {
        fieldType: "file_field" as const,
        fileFieldKey: "clientId",
        label: "Client",
        sortOrder: 2,
        isFormulaInjectable: false,
      },
      {
        fieldType: "file_field" as const,
        fileFieldKey: "status",
        label: "Status",
        sortOrder: 3,
        isFormulaInjectable: false,
      },
    ];

    // Fetch existing global project custom fields
    const { customFieldDefinitions } = await import("@starter/db");
    const projectFields = await db
      .select()
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.organizationId, organizationId),
          eq(customFieldDefinitions.entityType, "project"),
        ),
      );

    const customFieldsToSeed = projectFields.map((field, idx) => ({
      fieldType: "file_field" as const,
      fileFieldKey: field.fieldKey,
      customFieldDefinitionId: field.id,
      label: field.fieldName,
      sortOrder: systemFields.length + 1 + idx,
      isFormulaInjectable: field.fieldType === "number",
    }));

    for (const f of [...systemFields, ...customFieldsToSeed]) {
      const tokenKey = toSnakeCase(f.fileFieldKey || f.label);
      await TokenService.createFileFieldToken({
        id: crypto.randomUUID(),
        templateId,
        fieldType: f.fieldType,
        label: f.label,
        tokenKey,
        systemFieldKey: (f as any).customFieldDefinitionId ? null : f.fileFieldKey,
        customFieldDefinitionId: (f as any).customFieldDefinitionId ?? null,
        isInjectable: f.isFormulaInjectable,
        organizationId,
        sortOrder: f.sortOrder,
      });
    }

    // Seed default section 1
    await TokenService.createSectionToken({
      id: crypto.randomUUID(),
      templateId,
      sectionToken: "SECTION_1",
      label: "1",
      organizationId,
      sortOrder: 0,
    });

    return c.json(newTemplate, 201);
  }

  static async updateTemplate(c: Context) {
    const id = c.req.param("id") as string;
    const _user = c.get("user");
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error }, 400);

    const [updated] = await db
      .update(invoiceTemplates)
      .set(parsed.data)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .returning();

    if (!updated) return c.json({ error: "Not found" }, 404);

    return c.json(updated);
  }

  static async deleteTemplate(c: Context) {
    const id = c.req.param("id") as string;
    const _user = c.get("user");
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const [deleted] = await db
      .delete(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .returning();

    if (!deleted) return c.json({ error: "Not found" }, 404);

    return c.json({ success: true });
  }
}
