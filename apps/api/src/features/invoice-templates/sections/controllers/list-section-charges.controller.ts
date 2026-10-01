import {
  db,
  decodeFormula,
  invoiceTemplates,
  templateSectionCharges,
  templateSections,
  tokens,
} from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";
import { buildConstantIndex } from "../../metadata/services/constant-index.service";
import { buildRowIndex } from "../../rows/services/row-index.service";
import { buildSectionIndex } from "../services/section-index.service";

export async function listSectionCharges(c: Context) {
  const sectionId = c.req.param("sectionId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const secCheck = await db
    .select({ id: templateSections.id, templateId: templateSections.templateId })
    .from(templateSections)
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateSections.id, sectionId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);
  if (secCheck.length === 0) return c.json({ error: "Section not found" }, 404);

  const templateId = secCheck[0].templateId;
  const { idToToken } = await buildRowIndex(templateId);
  const { idToToken: secIdToToken } = await buildSectionIndex(templateId);
  const { tplIdToToken } = await buildConstantIndex(templateId);

  const charges = await db
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
    .where(eq(templateSectionCharges.sectionId, sectionId))
    .orderBy(asc(tokens.sortOrder));

  const decoded = charges.map((row) => {
    const r = (row as any).charge ? { ...(row as any).charge, ...row } : row;
    return {
      ...r,
      formula: decodeFormula(r.formula, idToToken, secIdToToken, tplIdToToken),
    };
  });

  return c.json(decoded);
}
