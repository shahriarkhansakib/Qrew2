import { db, invoiceTemplates, templateRows, templateSections } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { getTemplateFormulaContext } from "../../services/template-formula-context.service";

export async function listRows(c: Context) {
  const sectionId = c.req.param("sectionId") as string;
  const templateId = c.req.param("templateId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  // Verify ownership
  const secCheck = await db
    .select({ id: templateSections.id })
    .from(templateSections)
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateSections.id, sectionId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);
  if (secCheck.length === 0) return c.json({ error: "Section not found" }, 404);

  const context = await getTemplateFormulaContext(templateId, organizationId);

  const rows = await db.query.templateRows.findMany({
    where: eq(templateRows.sectionId, sectionId),
    with: {
      token: true,
      charges: {
        with: {
          token: true,
        },
      },
    },
  });

  // Sort rows and charges by token.sortOrder
  rows.sort((a, b) => (a.token?.sortOrder ?? 0) - (b.token?.sortOrder ?? 0));
  for (const row of rows) {
    row.charges.sort((a, b) => (a.token?.sortOrder ?? 0) - (b.token?.sortOrder ?? 0));
  }

  // Decode formulas before sending to frontend and flatten token fields
  const decoded = rows.map((row) => ({
    id: row.id,
    templateId: row.templateId,
    sectionId: row.sectionId,
    valueType: row.valueType,
    formula: context.decode(row.formula),
    initialValue: row.initialValue,
    rowToken: row.token?.tokenKey,
    label: row.token?.label,
    description: row.token?.description,
    sortOrder: row.token?.sortOrder ?? 0,
    charges: row.charges.map((ch) => ({
      id: ch.id,
      rowId: ch.rowId,
      qualifier: ch.qualifier,
      tags: ch.tags,
      formula: context.decode(ch.formula) ?? ch.formula,
      chargeToken: ch.token?.tokenKey,
      label: ch.token?.label,
      subDescription: ch.token?.description,
      sortOrder: ch.token?.sortOrder ?? 0,
    })),
  }));

  return c.json({ rows: decoded, rowIndex: context.rowIdToToken });
}
