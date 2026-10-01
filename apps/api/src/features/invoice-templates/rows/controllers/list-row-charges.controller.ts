import {
  db,
  decodeFormula,
  invoiceTemplates,
  templateRowCharges,
  templateRows,
  tokens,
} from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";
import { buildConstantIndex } from "../../metadata/services/constant-index.service";
import { buildSectionIndex } from "../../sections/services/section-index.service";
import { buildRowIndex } from "../services/row-index.service";

export async function listCharges(c: Context) {
  const rowId = c.req.param("rowId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const rowCheck = await db
    .select({ row: templateRows })
    .from(templateRows)
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(and(eq(templateRows.id, rowId), eq(invoiceTemplates.organizationId, organizationId)))
    .limit(1);
  if (rowCheck.length === 0) return c.json({ error: "Row not found" }, 404);

  const templateId = rowCheck[0].row.templateId;
  const { idToToken } = await buildRowIndex(templateId);
  const { idToToken: secIdToToken } = await buildSectionIndex(templateId);
  const { tplIdToToken } = await buildConstantIndex(templateId);

  const charges = await db
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
    .where(eq(templateRowCharges.rowId, rowId))
    .orderBy(asc(tokens.sortOrder));

  const decoded = charges.map((ch) => ({
    ...ch,
    formula: decodeFormula(ch.formula, idToToken, secIdToToken, tplIdToToken) ?? ch.formula,
  }));

  return c.json(decoded);
}
