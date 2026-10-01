import { db, invoiceTemplates, templateSections, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";

export async function reorderRows(c: Context) {
  const sectionId = c.req.param("sectionId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  // Verify section ownership
  const secResult = await db
    .select({ section: templateSections })
    .from(templateSections)
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateSections.id, sectionId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);
  if (secResult.length === 0) return c.json({ error: "Section not found" }, 404);

  const body = await c.req.json();
  const parsed = z.object({ orderedIds: z.array(z.string().uuid()) }).safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const { orderedIds } = parsed.data;

  // Bulk-update every row's sortOrder to its position in the list
  await db.transaction(async (tx) => {
    await Promise.all(
      orderedIds.map((id, index) =>
        tx.update(tokens).set({ sortOrder: index }).where(eq(tokens.id, id)),
      ),
    );
  });

  return c.json({ success: true });
}
