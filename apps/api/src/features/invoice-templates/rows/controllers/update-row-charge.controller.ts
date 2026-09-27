import {
  db,
  decodeFormula,
  encodeFormula,
  invoiceTemplates,
  templateRowCharges,
  templateRows,
  tokens,
} from "@starter/db";
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

function validateFormula(formula: string | null | undefined): boolean {
  if (!formula || !formula.trim()) return false;
  if (/[+\-*/]\s*$/.test(formula.trim())) return false;
  if (/^\s*[+*/]/.test(formula.trim())) return false;
  return true;
}

const updateRowChargeSchema = z.object({
  chargeToken: z
    .string()
    .regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/, "chargeToken must be UPPER_SNAKE_CASE")
    .optional(),
  label: z.string().min(1).optional(),
  subDescription: z.string().optional().nullable(),
  qualifier: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  formula: z.string().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export async function updateCharge(c: Context) {
  const chargeId = c.req.param("chargeId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const chargeCheck = await db
    .select({
      charge: templateRowCharges,
      token: tokens,
      templateId: templateRows.templateId,
      rowId: templateRows.id,
    })
    .from(templateRowCharges)
    .innerJoin(tokens, eq(tokens.id, templateRowCharges.id))
    .innerJoin(templateRows, eq(templateRowCharges.rowId, templateRows.id))
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateRowCharges.id, chargeId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);
  if (chargeCheck.length === 0) return c.json({ error: "Row charge not found" }, 404);

  const body = await c.req.json();
  const parsed = updateRowChargeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const existing = chargeCheck[0].charge;
  const existingToken = chargeCheck[0].token;
  const templateId = chargeCheck[0].templateId;

  const rowTokenRow = await db.query.tokens?.findFirst({
    where: eq(tokens.id, chargeCheck[0].rowId),
  });
  const rowToken = rowTokenRow?.tokenKey ?? (chargeCheck[0] as any)?.row?.rowToken ?? "";

  const context = await getTemplateFormulaContext(templateId, organizationId);
  let encodedFormula: string | undefined;

  if (parsed.data.formula !== undefined) {
    encodedFormula = context.encode(parsed.data.formula) ?? parsed.data.formula;
  }

  if (parsed.data.formula !== undefined) {
    const rateVal = validateRateChargeFormula(parsed.data.formula, rowToken);
    if (!rateVal.valid) {
      return c.json({ error: rateVal.error }, 422);
    }
    const charVal = validateFormulaChars(
      parsed.data.formula,
      parsed.data.chargeToken ?? existingToken?.tokenKey,
    );
    if (!charVal.valid) {
      return c.json({ error: charVal.error }, 422);
    }
  }

  if (parsed.data.chargeToken && parsed.data.chargeToken !== existingToken?.tokenKey) {
    const dup = await db.query.tokens?.findFirst({
      where: and(
        eq(tokens.templateId, templateId),
        eq(tokens.tokenKey, parsed.data.chargeToken),
      ),
    });
    if (dup) {
      return c.json(
        { error: `Row charge token "${parsed.data.chargeToken}" already exists on this row.` },
        409,
      );
    }
  }

  const tokenPatch: any = {};
  if (parsed.data.chargeToken !== undefined) tokenPatch.tokenKey = parsed.data.chargeToken;
  if (parsed.data.label !== undefined) tokenPatch.label = parsed.data.label;
  if (parsed.data.subDescription !== undefined) tokenPatch.description = parsed.data.subDescription;
  if (parsed.data.orderIndex !== undefined) tokenPatch.sortOrder = parsed.data.orderIndex;

  const chargePatch: any = {};
  if (parsed.data.qualifier !== undefined) chargePatch.qualifier = parsed.data.qualifier;
  if (parsed.data.tags !== undefined) chargePatch.tags = parsed.data.tags;
  if (encodedFormula !== undefined) chargePatch.formula = encodedFormula;

  if (Object.keys(tokenPatch).length === 0 && Object.keys(chargePatch).length === 0) {
    return c.json({ error: "No values to set" }, 400);
  }

  try {
    const result = await db.transaction(async (tx) => {
      if (Object.keys(tokenPatch).length > 0) {
        await TokenService.updateToken(chargeId, tokenPatch, tx);
      }

      if (Object.keys(chargePatch).length > 0) {
        await tx
          .update(templateRowCharges)
          .set(chargePatch)
          .where(eq(templateRowCharges.id, chargeId));
      }

      if (encodedFormula !== undefined || parsed.data.chargeToken !== undefined) {
        const validation = await validateTemplateDag(templateId, tx);
        if (!validation.valid) {
          throw new Error(`DAG_ERROR:${validation.errors[0].message}`);
        }
      }

      const [finalCharge] = await tx
        .select({
          id: templateRowCharges.id,
          rowId: templateRowCharges.rowId,
          qualifier: templateRowCharges.qualifier,
          tags: templateRowCharges.tags,
          formula: templateRowCharges.formula,
          chargeToken: tokens.tokenKey,
          label: tokens.label,
          subDescription: tokens.description,
          sortOrder: tokens.sortOrder,
        })
        .from(templateRowCharges)
        .innerJoin(tokens, eq(tokens.id, templateRowCharges.id))
        .where(eq(templateRowCharges.id, chargeId));

      const mergedCharge = finalCharge ?? {
        ...existing,
        ...existingToken,
        formula: encodedFormula ?? existing.formula,
        chargeToken: parsed.data.chargeToken ?? existingToken?.tokenKey ?? (existing as any)?.chargeToken,
        label: parsed.data.label ?? existingToken?.label ?? (existing as any)?.label,
        subDescription:
          parsed.data.subDescription !== undefined
            ? parsed.data.subDescription
            : existingToken?.description ?? (existing as any)?.subDescription,
      };

      return {
        ...mergedCharge,
        formula: context.decode(mergedCharge.formula) ?? mergedCharge.formula,
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
