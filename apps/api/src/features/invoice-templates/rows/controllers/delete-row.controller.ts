import { db, invoiceTemplates, templateRows } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { TokenService } from "../../../tokens/token.service";
import { touchTemplate } from "../../invoice-templates.controller";
import { resequenceTemplateRowTokens } from "../services/resequence-rows.service";

export async function deleteRow(c: Context) {
  const rowId = c.req.param("rowId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const rowCheck = await db
    .select({ id: templateRows.id, templateId: templateRows.templateId })
    .from(templateRows)
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(and(eq(templateRows.id, rowId), eq(invoiceTemplates.organizationId, organizationId)))
    .limit(1);

  if (rowCheck.length === 0) return c.json({ error: "Row not found" }, 404);

  const templateId = rowCheck[0].templateId;

  // Deleting token cascades to templateRows and charges
  await TokenService.deleteToken(rowId);
  await resequenceTemplateRowTokens(templateId);
  await touchTemplate(templateId);

  return c.json({ success: true });
}
