import { db, invoiceTemplates, templateHeaderFields, tokens } from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../tokens/token.service";
import { toSnakeCase } from "../rows/services/row-index.service";

const createHeaderFieldSchema = z.object({
  label: z.string().min(1),
  tokenKey: z.string().optional(),
  fieldType: z.enum(["manual", "org_constant", "file_field"]),
  fileFieldKey: z.string().optional().nullable(),
  customFieldDefinitionId: z.string().optional().nullable(),
  systemFieldKey: z.string().optional().nullable(),
  orgConfigKey: z.string().optional().nullable(),
  defaultManualValue: z.string().optional().nullable(),
  placeholder: z.string().optional().nullable(),
  isFormulaInjectable: z.boolean().optional().default(true),
  columnPosition: z.enum(["left", "right"]).optional().default("left"),
});

export class TemplateHeaderFieldsController {
  static async listHeaderFields(c: Context) {
    const templateId = c.req.param("templateId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const template = await db.query.invoiceTemplates?.findFirst?.({
      where: and(
        eq(invoiceTemplates.id, templateId),
        eq(invoiceTemplates.organizationId, organizationId),
      ),
    });
    if (!template) return c.json({ error: "Template not found" }, 404);

    const fields = await db
      .select({
        id: templateHeaderFields.id,
        templateId: templateHeaderFields.templateId,
        fieldType: templateHeaderFields.fieldType,
        columnPosition: templateHeaderFields.columnPosition,
        customFieldDefinitionId: templateHeaderFields.customFieldDefinitionId,
        systemFieldKey: templateHeaderFields.systemFieldKey,
        orgConfigKey: templateHeaderFields.orgConfigKey,
        defaultManualValue: templateHeaderFields.defaultManualValue,
        placeholder: templateHeaderFields.placeholder,
        tokenKey: tokens.tokenKey,
        label: tokens.label,
        description: tokens.description,
        isFormulaInjectable: tokens.isInjectable,
        sortOrder: tokens.sortOrder,
      })
      .from(templateHeaderFields)
      .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
      .where(eq(templateHeaderFields.templateId, templateId))
      .orderBy(asc(tokens.sortOrder));

    return c.json(fields);
  }

  static async createHeaderField(c: Context) {
    const templateId = c.req.param("templateId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const template = await db.query.invoiceTemplates?.findFirst?.({
      where: and(
        eq(invoiceTemplates.id, templateId),
        eq(invoiceTemplates.organizationId, organizationId),
      ),
    });
    if (!template) return c.json({ error: "Template not found" }, 404);

    const body = await c.req.json();
    const parsed = createHeaderFieldSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error }, 400);

    // Get max sort order for the column
    const existing = await db
      .select({ sortOrder: tokens.sortOrder })
      .from(templateHeaderFields)
      .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
      .where(
        and(
          eq(templateHeaderFields.templateId, templateId),
          eq(templateHeaderFields.columnPosition, parsed.data.columnPosition),
        ),
      );
    const nextOrder = existing.length > 0 ? Math.max(...existing.map((f) => f.sortOrder)) + 1 : 0;

    const tokenKey = parsed.data.tokenKey || toSnakeCase(parsed.data.label);

    const newField = await TokenService.createFileFieldToken({
      id: crypto.randomUUID(),
      templateId,
      fieldType: parsed.data.fieldType,
      label: parsed.data.label,
      tokenKey,
      columnPosition: parsed.data.columnPosition,
      customFieldDefinitionId: parsed.data.customFieldDefinitionId ?? null,
      systemFieldKey: parsed.data.systemFieldKey ?? parsed.data.fileFieldKey ?? null,
      orgConfigKey: parsed.data.orgConfigKey ?? null,
      defaultManualValue: parsed.data.defaultManualValue ?? null,
      placeholder: parsed.data.placeholder ?? null,
      isInjectable: parsed.data.isFormulaInjectable,
      organizationId,
      sortOrder: nextOrder,
    });

    return c.json(newField, 201);
  }

  static async deleteHeaderField(c: Context) {
    const templateId = c.req.param("templateId") as string;
    const fieldId = c.req.param("fieldId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const template = await db.query.invoiceTemplates?.findFirst?.({
      where: and(
        eq(invoiceTemplates.id, templateId),
        eq(invoiceTemplates.organizationId, organizationId),
      ),
    });
    if (!template) return c.json({ error: "Template not found" }, 404);

    const [deleted] = await db
      .delete(templateHeaderFields)
      .where(
        and(eq(templateHeaderFields.id, fieldId), eq(templateHeaderFields.templateId, templateId)),
      )
      .returning();

    if (!deleted) return c.json({ error: "Not found" }, 404);

    await TokenService.deleteToken(fieldId);

    return c.json(deleted);
  }

  static async updateHeaderField(c: Context) {
    const templateId = c.req.param("templateId") as string;
    const fieldId = c.req.param("fieldId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const template = await db.query.invoiceTemplates?.findFirst?.({
      where: and(
        eq(invoiceTemplates.id, templateId),
        eq(invoiceTemplates.organizationId, organizationId),
      ),
    });
    if (!template) return c.json({ error: "Template not found" }, 404);

    const updateHeaderFieldSchema = z.object({
      label: z.string().min(1).optional(),
      tokenKey: z.string().optional(),
      fieldType: z.enum(["manual", "org_constant", "file_field"]).optional(),
      fileFieldKey: z.string().optional().nullable(),
      customFieldDefinitionId: z.string().optional().nullable(),
      systemFieldKey: z.string().optional().nullable(),
      orgConfigKey: z.string().optional().nullable(),
      defaultManualValue: z.string().optional().nullable(),
      placeholder: z.string().optional().nullable(),
      isFormulaInjectable: z.boolean().optional(),
      columnPosition: z.enum(["left", "right"]).optional(),
      sortOrder: z.number().optional(),
    });

    const body = await c.req.json();
    const parsed = updateHeaderFieldSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: parsed.error }, 400);

    const tokenPatch: any = {};
    if (parsed.data.label !== undefined) tokenPatch.label = parsed.data.label;
    if (parsed.data.tokenKey !== undefined) tokenPatch.tokenKey = parsed.data.tokenKey;
    if (parsed.data.isFormulaInjectable !== undefined)
      tokenPatch.isInjectable = parsed.data.isFormulaInjectable;
    if (parsed.data.sortOrder !== undefined) tokenPatch.sortOrder = parsed.data.sortOrder;

    const fieldPatch: any = {};
    if (parsed.data.fieldType !== undefined) fieldPatch.fieldType = parsed.data.fieldType;
    if (parsed.data.columnPosition !== undefined)
      fieldPatch.columnPosition = parsed.data.columnPosition;
    if (parsed.data.customFieldDefinitionId !== undefined)
      fieldPatch.customFieldDefinitionId = parsed.data.customFieldDefinitionId;
    if (parsed.data.systemFieldKey !== undefined || parsed.data.fileFieldKey !== undefined)
      fieldPatch.systemFieldKey = parsed.data.systemFieldKey ?? parsed.data.fileFieldKey;
    if (parsed.data.orgConfigKey !== undefined)
      fieldPatch.orgConfigKey = parsed.data.orgConfigKey;
    if (parsed.data.defaultManualValue !== undefined)
      fieldPatch.defaultManualValue = parsed.data.defaultManualValue;
    if (parsed.data.placeholder !== undefined)
      fieldPatch.placeholder = parsed.data.placeholder;

    await db.transaction(async (tx) => {
      if (Object.keys(tokenPatch).length > 0) {
        await TokenService.updateToken(fieldId, tokenPatch, tx);
      }
      if (Object.keys(fieldPatch).length > 0) {
        await tx
          .update(templateHeaderFields)
          .set(fieldPatch)
          .where(eq(templateHeaderFields.id, fieldId));
      }
    });

    const [updated] = await db
      .select({
        id: templateHeaderFields.id,
        templateId: templateHeaderFields.templateId,
        fieldType: templateHeaderFields.fieldType,
        columnPosition: templateHeaderFields.columnPosition,
        customFieldDefinitionId: templateHeaderFields.customFieldDefinitionId,
        systemFieldKey: templateHeaderFields.systemFieldKey,
        orgConfigKey: templateHeaderFields.orgConfigKey,
        defaultManualValue: templateHeaderFields.defaultManualValue,
        placeholder: templateHeaderFields.placeholder,
        tokenKey: tokens.tokenKey,
        label: tokens.label,
        description: tokens.description,
        isFormulaInjectable: tokens.isInjectable,
        sortOrder: tokens.sortOrder,
      })
      .from(templateHeaderFields)
      .innerJoin(tokens, eq(tokens.id, templateHeaderFields.id))
      .where(eq(templateHeaderFields.id, fieldId));

    if (!updated) return c.json({ error: "Not found" }, 404);

    return c.json(updated);
  }

  static async reorderHeaderFields(c: Context) {
    const templateId = c.req.param("templateId") as string;
    const organizationId = c.get("organizationId");
    if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

    const template = await db.query.invoiceTemplates?.findFirst?.({
      where: and(
        eq(invoiceTemplates.id, templateId),
        eq(invoiceTemplates.organizationId, organizationId),
      ),
    });
    if (!template) return c.json({ error: "Template not found" }, 404);

    const body = await c.req.json();
    const parsed = z
      .object({
        updates: z.array(
          z.object({
            fieldId: z.string(),
            columnPosition: z.enum(["left", "right"]),
            sortOrder: z.number(),
          }),
        ),
      })
      .safeParse(body);

    if (!parsed.success) return c.json({ error: parsed.error }, 400);

    const { updates } = parsed.data;

    await db.transaction(async (tx) => {
      await Promise.all(
        updates.map(async (u) => {
          await tx
            .update(templateHeaderFields)
            .set({ columnPosition: u.columnPosition })
            .where(
              and(
                eq(templateHeaderFields.id, u.fieldId),
                eq(templateHeaderFields.templateId, templateId),
              ),
            );
          await tx
            .update(tokens)
            .set({ sortOrder: u.sortOrder })
            .where(eq(tokens.id, u.fieldId));
        }),
      );
    });

    return c.json({ success: true });
  }
}
