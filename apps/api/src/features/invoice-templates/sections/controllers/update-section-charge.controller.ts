import {
  db,
  decodeFormula,
  encodeFormula,
  invoiceTemplates,
  templateSectionCharges,
  templateSections,
  tokens,
} from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import * as math from "mathjs";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";
import { getTemplateFormulaContext } from "../../services/template-formula-context.service";
import { validateFormulaChars } from "../../validation/formula-validator";

function validateFormula(formula: string): boolean {
  try {
    math.parse(formula);
    return true;
  } catch {
    return false;
  }
}

const updateSectionChargeSchema = z.object({
  chargeToken: z.string().optional(),
  label: z.string().min(1).optional(),
  subDescription: z.string().optional().nullable(),
  qualifier: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  formula: z.string().min(1).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export async function updateSectionCharge(c: Context) {
  const chargeId = c.req.param("chargeId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const chargeCheck = await db
    .select({
      charge: templateSectionCharges,
      token: tokens,
      section: templateSections,
    })
    .from(templateSectionCharges)
    .innerJoin(tokens, eq(tokens.id, templateSectionCharges.id))
    .innerJoin(templateSections, eq(templateSectionCharges.sectionId, templateSections.id))
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(
        eq(templateSectionCharges.id, chargeId),
        eq(invoiceTemplates.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (chargeCheck.length === 0) return c.json({ error: "Section charge not found" }, 404);

  const body = await c.req.json();
  const parsed = updateSectionChargeSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const existing = chargeCheck[0].charge;
  const existingToken = chargeCheck[0].token;
  const templateId = chargeCheck[0].section.templateId;

  const context = await getTemplateFormulaContext(templateId, organizationId);
  let encodedFormula;
  if (parsed.data.formula !== undefined) {
    encodedFormula = context.encode(parsed.data.formula) ?? parsed.data.formula;
  }

  const nextFormula = encodedFormula ?? existing.formula;
  if (!validateFormula(nextFormula)) {
    return c.json({ error: `Invalid formula syntax: "${nextFormula}"` }, 422);
  }

  if (parsed.data.formula !== undefined) {
    const charVal = validateFormulaChars(
      parsed.data.formula,
      parsed.data.chargeToken ?? existingToken.tokenKey,
    );
    if (!charVal.valid) {
      return c.json({ error: charVal.error }, 422);
    }
  }

  if (parsed.data.chargeToken && parsed.data.chargeToken !== existingToken.tokenKey) {
    const dup = await db.query.tokens?.findFirst({
      where: and(
        eq(tokens.templateId, templateId),
        eq(tokens.tokenKey, parsed.data.chargeToken),
      ),
    });
    if (dup) {
      return c.json(
        {
          error: `Section charge token "${parsed.data.chargeToken}" already exists in this template.`,
        },
        409,
      );
    }
  }

  const tokenPatch: any = {};
  if (parsed.data.chargeToken !== undefined) tokenPatch.tokenKey = parsed.data.chargeToken;
  if (parsed.data.label !== undefined) tokenPatch.label = parsed.data.label;
  if (parsed.data.subDescription !== undefined)
    tokenPatch.description = parsed.data.subDescription;
  if (parsed.data.orderIndex !== undefined) tokenPatch.sortOrder = parsed.data.orderIndex;

  const chargePatch: any = {};
  if (parsed.data.qualifier !== undefined) chargePatch.qualifier = parsed.data.qualifier;
  if (parsed.data.tags !== undefined) chargePatch.tags = parsed.data.tags;
  if (encodedFormula !== undefined) chargePatch.formula = encodedFormula;

  if (Object.keys(tokenPatch).length === 0 && Object.keys(chargePatch).length === 0) {
    return c.json({ error: "No values to set" }, 400);
  }

  await db.transaction(async (tx) => {
    if (Object.keys(tokenPatch).length > 0) {
      await TokenService.updateToken(chargeId, tokenPatch, tx);
    }
    if (Object.keys(chargePatch).length > 0) {
      await tx
        .update(templateSectionCharges)
        .set(chargePatch)
        .where(eq(templateSectionCharges.id, chargeId));
    }
  });

  const [finalCharge] = await db
    .select({
      id: templateSectionCharges.id,
      sectionId: templateSectionCharges.sectionId,
      templateId: templateSectionCharges.templateId,
      qualifier: templateSectionCharges.qualifier,
      tags: templateSectionCharges.tags,
      formula: templateSectionCharges.formula,
      chargeToken: tokens.tokenKey,
      label: tokens.label,
      subDescription: tokens.description,
      sortOrder: tokens.sortOrder,
    })
    .from(templateSectionCharges)
    .innerJoin(tokens, eq(tokens.id, templateSectionCharges.id))
    .where(eq(templateSectionCharges.id, chargeId));

  const mergedCharge = finalCharge ?? {
    ...existing,
    ...chargePatch,
    chargeToken: tokenPatch.tokenKey ?? existingToken.tokenKey,
    label: tokenPatch.label ?? existingToken.label,
    subDescription:
      tokenPatch.description !== undefined ? tokenPatch.description : existingToken.description,
    sortOrder:
      tokenPatch.sortOrder !== undefined ? tokenPatch.sortOrder : existingToken.sortOrder,
  };

  const decoded =
    decodeFormula(mergedCharge.formula, context.idToToken) ??
    context.decode(mergedCharge.formula) ??
    mergedCharge.formula;

  return c.json({
    ...mergedCharge,
    formula: decoded,
  });
}
