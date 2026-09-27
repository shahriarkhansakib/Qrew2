import { db, invoiceTemplates, templateRows } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { TokenService } from "../../../tokens/token.service";

export async function deleteRow(c: Context) {
  const rowId = c.req.param("rowId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const rowCheck = await db
    .select({ id: templateRows.id })
    .from(templateRows)
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(and(eq(templateRows.id, rowId), eq(invoiceTemplates.organizationId, organizationId)))
    .limit(1);

  if (rowCheck.length === 0) return c.json({ error: "Row not found" }, 404);

  // Deleting token cascades to templateRows and charges
  await TokenService.deleteToken(rowId);

  return c.json({ success: true });
}
