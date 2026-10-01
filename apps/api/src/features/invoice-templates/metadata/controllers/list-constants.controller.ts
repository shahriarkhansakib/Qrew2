import { db, invoiceTemplates, templateConstants, tokens } from "@starter/db";
import { and, asc, eq } from "drizzle-orm";
import { Context } from "hono";

export async function listConstants(c: Context) {
  const templateId = c.req.param("templateId") as string;
  const organizationId = c.get("organizationId") as string;
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const template = await db.query.invoiceTemplates?.findFirst?.({
    where: and(
      eq(invoiceTemplates.id, templateId),
      eq(invoiceTemplates.organizationId, organizationId),
    ),
  });
  if (!template) return c.json({ error: "Template not found" }, 404);

  const constants = await db
    .select({
      id: templateConstants.id,
      templateId: templateConstants.templateId,
      defaultValue: templateConstants.defaultValue,
      token: tokens.tokenKey,
      name: tokens.label,
      valueType: tokens.valueType,
      sortOrder: tokens.sortOrder,
    })
    .from(templateConstants)
    .innerJoin(tokens, eq(tokens.id, templateConstants.id))
    .where(eq(templateConstants.templateId, templateId))
    .orderBy(asc(tokens.sortOrder));

  return c.json(constants);
}
