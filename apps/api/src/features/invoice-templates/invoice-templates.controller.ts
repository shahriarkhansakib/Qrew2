import { db, invoiceDocumentSequences, invoiceTemplates, TemplateOptionalRow } from "@starter/db";
import { and, eq, sql } from "drizzle-orm";
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
  optionalRows: z.array(z.any()).optional(),
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
      .set({
        ...parsed.data,
        version: sql`${invoiceTemplates.version} + 1`,
        updatedAt: new Date(),
      })
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

  static async listOptionalRows(c: Context) {
    const id = c.req.param("id") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const [tpl] = await db
      .select({ optionalRows: invoiceTemplates.optionalRows })
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .limit(1);

    if (!tpl) return c.json({ error: "Template not found" }, 404);
    return c.json(tpl.optionalRows || []);
  }

  static async addOptionalRow(c: Context) {
    const id = c.req.param("id") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    const rowToken = toSnakeCase(body.rowToken || body.label || "OPTIONAL_ROW");
    const newRow: TemplateOptionalRow = {
      id: crypto.randomUUID(),
      rowToken,
      label: body.label || "Optional Service",
      subDescription: body.subDescription || null,
      valueType: body.valueType === "formula" ? "formula" : "normal",
      formula: body.formula || null,
      initialValue: body.initialValue ? String(body.initialValue) : null,
      suggestedSectionToken: body.suggestedSectionToken || null,
    };

    const [tpl] = await db
      .select({ optionalRows: invoiceTemplates.optionalRows })
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .limit(1);

    if (!tpl) return c.json({ error: "Template not found" }, 404);
    const currentRows = (tpl.optionalRows as TemplateOptionalRow[]) || [];
    if (currentRows.some((r) => r.rowToken === rowToken)) {
      return c.json(
        {
          error: `An additional line item with token "${rowToken}" already exists in this template.`,
        },
        409,
      );
    }
    const updatedRows = [...currentRows, newRow];

    await db
      .update(invoiceTemplates)
      .set({ optionalRows: updatedRows })
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)));

    return c.json(newRow, 201);
  }

  static async deleteOptionalRow(c: Context) {
    const id = c.req.param("id") as string;
    const optionalRowId = c.req.param("optionalRowId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const [tpl] = await db
      .select({ optionalRows: invoiceTemplates.optionalRows })
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .limit(1);

    if (!tpl) return c.json({ error: "Template not found" }, 404);
    const currentRows = (tpl.optionalRows as TemplateOptionalRow[]) || [];
    const updatedRows = currentRows.filter(
      (r) => r.id !== optionalRowId && r.rowToken !== optionalRowId,
    );

    await db
      .update(invoiceTemplates)
      .set({ optionalRows: updatedRows })
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)));

    return c.json({ success: true });
  }

  static async updateOptionalRow(c: Context) {
    const id = c.req.param("id") as string;
    const optionalRowId = c.req.param("optionalRowId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json();
    const [tpl] = await db
      .select({ optionalRows: invoiceTemplates.optionalRows })
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)))
      .limit(1);

    if (!tpl) return c.json({ error: "Template not found" }, 404);
    const currentRows = (tpl.optionalRows as TemplateOptionalRow[]) || [];

    let matched = false;
    const updatedRows = currentRows.map((r) => {
      if (r.id === optionalRowId || r.rowToken === optionalRowId) {
        matched = true;
        const newFormula = body.formula !== undefined ? body.formula : r.formula;
        const newValueType =
          body.valueType !== undefined
            ? body.valueType
            : newFormula && newFormula.trim()
              ? "formula"
              : r.valueType || "normal";

        return {
          ...r,
          label: body.label !== undefined ? String(body.label).trim() : r.label,
          subDescription:
            body.subDescription !== undefined
              ? body.subDescription
              : body.description !== undefined
                ? body.description
                : r.subDescription,
          initialValue: body.initialValue !== undefined ? body.initialValue : r.initialValue,
          formula: newFormula,
          valueType: newValueType,
        };
      }
      return r;
    });

    if (!matched) return c.json({ error: "Optional row not found" }, 404);

    await db
      .update(invoiceTemplates)
      .set({ optionalRows: updatedRows })
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.organizationId, organizationId)));

    const updatedRow = updatedRows.find(
      (r) => r.id === optionalRowId || r.rowToken === optionalRowId,
    );
    return c.json(updatedRow || { success: true });
  }
}

export async function touchTemplate(templateId: string, tx: any = db) {
  try {
    await tx
      .update(invoiceTemplates)
      .set({
        version: sql`${invoiceTemplates.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(invoiceTemplates.id, templateId));
  } catch (err) {
    console.error("[touchTemplate] Failed to bump version", err);
  }
}
