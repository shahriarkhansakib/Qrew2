import { db, invoiceTemplates, templateSections } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { TokenService } from "../../../tokens/token.service";

export async function deleteSection(c: Context) {
  const sectionId = c.req.param("sectionId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const sectionRow = await db
    .select({ id: templateSections.id })
    .from(templateSections)
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateSections.id, sectionId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);

  if (sectionRow.length === 0) return c.json({ error: "Section not found" }, 404);

  // Deleting token cascades to templateSections and all child rows/charges
  await TokenService.deleteToken(sectionId);

  return c.json({ success: true });
}
