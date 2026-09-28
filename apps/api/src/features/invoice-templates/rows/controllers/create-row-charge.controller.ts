import { db, invoiceTemplates, templateRows, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { validateTemplateDag } from "../../../invoices/engine/engine-utils";
import { TokenService } from "../../../tokens/token.service";
import { getTemplateFormulaContext } from "../../services/template-formula-context.service";
import {
  validateFormulaChars,
  validateRateChargeFormula,
} from "../../validation/formula-validator";
import { toSnakeCase } from "../services/row-index.service";

function _validateFormula(formula: string | null | undefined): boolean {
  if (!formula?.trim()) return false;
  if (/[+\-*/]\s*$/.test(formula.trim())) return false;
  if (/^\s*[+*/]/.test(formula.trim())) return false;
  return true;
}

const createRowChargeSchema = z.object({
  chargeToken: z
    .string()
    .regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/, "chargeToken must be UPPER_SNAKE_CASE")
    .optional(),
  label: z.string().min(1),
  subDescription: z.string().optional().nullable(),
  qualifier: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  formula: z.string().min(1),
  orderIndex: z.number().int().min(0).default(0),
});

export async function createCharge(c: Context) {
  const rowId = c.req.param("rowId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const rowCheck = await db
    .select({ row: templateRows, rowToken: tokens.tokenKey })
    .from(templateRows)
    .innerJoin(tokens, eq(tokens.id, templateRows.id))
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(and(eq(templateRows.id, rowId), eq(invoiceTemplates.organizationId, organizationId)))
    .limit(1);
  if (rowCheck.length === 0) return c.json({ error: "Row not found" }, 404);

  const body = await c.req.json();
  const parsed = createRowChargeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const existingRow = rowCheck[0].row;
  const rowToken = rowCheck[0].rowToken ?? (existingRow as any)?.rowToken;
  const templateId = existingRow.templateId;

  const chargeToken = parsed.data.chargeToken ?? `${rowToken}_${toSnakeCase(parsed.data.label)}`;

  const rateVal = validateRateChargeFormula(parsed.data.formula, rowToken);
  if (!rateVal.valid) {
    return c.json({ error: rateVal.error }, 422);
  }
  const charVal = validateFormulaChars(parsed.data.formula, chargeToken);
  if (!charVal.valid) {
    return c.json({ error: charVal.error }, 422);
  }

  const dup = await db.query.tokens?.findFirst({
    where: and(eq(tokens.templateId, templateId), eq(tokens.tokenKey, chargeToken)),
  });
  if (dup) {
    return c.json({ error: `Row charge token "${chargeToken}" already exists on this row.` }, 409);
  }

  const context = await getTemplateFormulaContext(templateId, organizationId);

  try {
    const result = await db.transaction(async (tx) => {
      const encoded = context.encode(parsed.data.formula) ?? parsed.data.formula;
      const newCharge = await TokenService.createRowChargeToken(
        {
          id: crypto.randomUUID(),
          rowId,
          chargeToken,
          label: parsed.data.label,
          subDescription: parsed.data.subDescription ?? null,
          qualifier: parsed.data.qualifier ?? null,
          tags: parsed.data.tags ?? [],
          formula: encoded,
          templateId,
          organizationId,
          sortOrder: parsed.data.orderIndex,
        },
        tx,
      );

      if (parsed.data.formula) {
        const validation = await validateTemplateDag(templateId, tx);
        if (!validation.valid) {
          throw new Error(`DAG_ERROR:${validation.errors[0].message}`);
        }
      }

      return {
        ...newCharge,
        formula: context.decode(newCharge.formula) ?? newCharge.formula,
      };
    });

    return c.json(result, 201);
  } catch (error: any) {
    if (error.message?.startsWith("DAG_ERROR:")) {
      return c.json({ error: error.message.replace("DAG_ERROR:", "") }, 422);
    }
    throw error;
  }
}
