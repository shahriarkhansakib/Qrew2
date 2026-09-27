import {
  db,
  decodeFormula,
  encodeFormula,
  invoiceTemplates,
  templateRowCharges,
  templateRows,
  tokens,
} from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { validateTemplateDag } from "../../../invoices/engine/engine-utils";
import { TokenService } from "../../../tokens/token.service";
import { getTemplateFormulaContext } from "../../services/template-formula-context.service";
import { validateFormulaChars } from "../../validation/formula-validator";

const updateRowSchema = z.object({
  label: z.string().optional(),
  rowToken: z
    .string()
    .min(1)
    .regex(
      /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/,
      "rowToken must be UPPER_SNAKE_CASE with no leading, trailing, or consecutive underscores",
    )
    .optional(),
  description: z.string().optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
  valueType: z.enum(["normal", "formula"]).optional(),
  formula: z.string().optional().nullable(),
  initialValue: z.number().optional().nullable(),
});

export async function updateRow(c: Context): Promise<any> {
  const rowId = c.req.param("rowId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const rowCheck = await db
    .select({
      row: templateRows,
      token: tokens,
      orgId: invoiceTemplates.organizationId,
    })
    .from(templateRows)
    .innerJoin(tokens, eq(tokens.id, templateRows.id))
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(and(eq(templateRows.id, rowId), eq(invoiceTemplates.organizationId, organizationId)))
    .limit(1);

  if (rowCheck.length === 0) return c.json({ error: "Row not found" }, 404);
  const existingRow = rowCheck[0].row;
  const existingToken = rowCheck[0].token;

  const body = await c.req.json();
  const parsed = updateRowSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const newRowToken = parsed.data.rowToken ?? existingToken?.tokenKey;

  if (
    parsed.data.rowToken &&
    parsed.data.rowToken !== existingToken?.tokenKey
  ) {
    const dup = await db.query.tokens?.findFirst({
      where: and(
        eq(tokens.templateId, existingRow.templateId),
        eq(tokens.tokenKey, parsed.data.rowToken),
      ),
    });
    if (dup) {
      return c.json(
        { error: `rowToken "${parsed.data.rowToken}" is already used in this template.` },
        409,
      );
    }
  }

  const context = await getTemplateFormulaContext(existingRow.templateId, organizationId);
  const tokenToId = { ...context.rowTokenToId };
  const idToToken = { ...context.rowIdToToken };

  if (
    parsed.data.rowToken &&
    parsed.data.rowToken !== existingToken?.tokenKey
  ) {
    const oldKey = existingToken?.tokenKey;
    if (oldKey) delete tokenToId[oldKey];
    tokenToId[newRowToken] = rowId;
    idToToken[rowId] = newRowToken;
  }

  const tokenPatch: any = {};
  if (parsed.data.label !== undefined) tokenPatch.label = parsed.data.label;
  if (parsed.data.rowToken !== undefined) tokenPatch.tokenKey = parsed.data.rowToken;
  if (parsed.data.description !== undefined) tokenPatch.description = parsed.data.description;
  if (parsed.data.orderIndex !== undefined) tokenPatch.sortOrder = parsed.data.orderIndex;

  const rowPatch: any = {};
  if (parsed.data.valueType !== undefined) rowPatch.valueType = parsed.data.valueType;
  if (parsed.data.formula !== undefined) {
    const formulaToSave = parsed.data.formula?.trim() ?? null;
    if (formulaToSave) {
      const charValidation = validateFormulaChars(formulaToSave, newRowToken);
      if (!charValidation.valid) {
        return c.json({ error: charValidation.error }, 422);
      }
    }
    rowPatch.formula =
      parsed.data.valueType === "formula" || formulaToSave
        ? encodeFormula(
            formulaToSave,
            tokenToId,
            context.secTokenToId,
            context.tplTokenToId,
            context.fileFieldTokens,
            context.globalTokens,
          )
        : null;
    if (formulaToSave) rowPatch.initialValue = null;
  }
  if (parsed.data.initialValue !== undefined) {
    rowPatch.initialValue =
      parsed.data.initialValue != null ? String(parsed.data.initialValue) : null;
    if (parsed.data.initialValue != null) rowPatch.formula = null;
  }

  if (Object.keys(tokenPatch).length === 0 && Object.keys(rowPatch).length === 0) {
    return c.json({ error: "No values to set" }, 400);
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (Object.keys(tokenPatch).length > 0) {
        await TokenService.updateToken(rowId, tokenPatch, tx);
      }

      if (Object.keys(rowPatch).length > 0) {
        await tx.update(templateRows).set(rowPatch).where(eq(templateRows.id, rowId));
      }

      if (rowPatch.formula !== undefined || tokenPatch.tokenKey !== undefined) {
        const validation = await validateTemplateDag(existingRow.templateId, tx);
        if (!validation.valid) {
          throw new Error(`DAG_ERROR:${validation.errors[0].message}`);
        }
      }

      const [finalRow] = await tx
        .select({
          id: templateRows.id,
          templateId: templateRows.templateId,
          sectionId: templateRows.sectionId,
          valueType: templateRows.valueType,
          formula: templateRows.formula,
          initialValue: templateRows.initialValue,
          rowToken: tokens.tokenKey,
          label: tokens.label,
          description: tokens.description,
          sortOrder: tokens.sortOrder,
        })
        .from(templateRows)
        .innerJoin(tokens, eq(tokens.id, templateRows.id))
        .where(eq(templateRows.id, rowId));

      const charges = await tx
        .select({
          id: templateRowCharges.id,
          rowId: templateRowCharges.rowId,
          formula: templateRowCharges.formula,
          qualifier: templateRowCharges.qualifier,
          tags: templateRowCharges.tags,
          chargeToken: tokens.tokenKey,
          label: tokens.label,
          subDescription: tokens.description,
          sortOrder: tokens.sortOrder,
        })
        .from(templateRowCharges)
        .innerJoin(tokens, eq(tokens.id, templateRowCharges.id))
        .where(eq(templateRowCharges.rowId, rowId))
        .orderBy(asc(tokens.sortOrder));

      const mergedRow = finalRow ?? {
        ...existingRow,
        ...existingToken,
        ...rowPatch,
        rowToken: newRowToken,
        label: tokenPatch.label ?? existingToken?.label ?? (existingRow as any)?.label,
        description:
          tokenPatch.description !== undefined
            ? tokenPatch.description
            : existingToken?.description ?? (existingRow as any)?.description,
      };

      return {
        ...mergedRow,
        formula: decodeFormula(
          mergedRow.formula,
          idToToken,
          context.secIdToToken,
          context.tplIdToToken,
          context.fileFieldTokens,
          context.globalTokens,
        ),
        charges: (charges ?? []).map((ch) => ({
          ...ch,
          formula:
            decodeFormula(
              ch.formula,
              idToToken,
              context.secIdToToken,
              context.tplIdToToken,
              context.fileFieldTokens,
              context.globalTokens,
            ) ?? ch.formula,
        })),
      };
    });

    return c.json(result);
  } catch (error: any) {
    if (error.message?.startsWith("DAG_ERROR:")) {
      return c.json({ error: error.message.replace("DAG_ERROR:", "") }, 422);
    }
    throw error;
  }
}
