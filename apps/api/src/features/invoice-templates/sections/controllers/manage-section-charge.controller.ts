import { db, invoiceTemplates, templateSectionCharges, templateSections, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";

export async function deleteSectionCharge(c: Context) {
  const chargeId = c.req.param("chargeId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const chargeCheck = await db
    .select({ id: templateSectionCharges.id })
    .from(templateSectionCharges)
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

  await TokenService.deleteToken(chargeId);

  return c.json({ success: true });
}

export async function reorderSectionCharges(c: Context) {
  const sectionId = c.req.param("sectionId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const secCheck = await db
    .select({ id: templateSections.id })
    .from(templateSections)
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateSections.id, sectionId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);
  if (secCheck.length === 0) return c.json({ error: "Section not found" }, 404);

  const body = await c.req.json();
  const parsed = z.object({ orderedIds: z.array(z.string().uuid()) }).safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const { orderedIds } = parsed.data;

  await db.transaction(async (tx) => {
    await Promise.all(
      orderedIds.map((id, index) =>
        tx
          .update(tokens)
          .set({ sortOrder: index })
          .where(eq(tokens.id, id)),
      ),
    );
  });

  return c.json({ success: true });
}
