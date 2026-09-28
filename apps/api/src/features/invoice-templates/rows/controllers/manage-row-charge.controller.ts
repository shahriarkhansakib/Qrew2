import { db, invoiceTemplates, templateRowCharges, templateRows, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";

export async function deleteCharge(c: Context) {
  const chargeId = c.req.param("chargeId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const chargeCheck = await db
    .select({ id: templateRowCharges.id })
    .from(templateRowCharges)
    .innerJoin(templateRows, eq(templateRowCharges.rowId, templateRows.id))
    .innerJoin(invoiceTemplates, eq(templateRows.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateRowCharges.id, chargeId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);
  if (chargeCheck.length === 0) return c.json({ error: "Row charge not found" }, 404);

  await TokenService.deleteToken(chargeId);

  return c.json({ success: true });
}

export async function reorderCharges(c: Context) {
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

  const body = await c.req.json();
  const parsed = z.object({ orderedIds: z.array(z.string().uuid()) }).safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const { orderedIds } = parsed.data;

  await db.transaction(async (tx) => {
    await Promise.all(
      orderedIds.map((id, index) =>
        tx.update(tokens).set({ sortOrder: index }).where(eq(tokens.id, id)),
      ),
    );
  });

  return c.json({ success: true });
}
