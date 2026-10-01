import { db, invoiceTemplates, templateSections, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";

const updateSectionSchema = z.object({
  label: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  sectionToken: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, "sectionToken must be UPPER_SNAKE_CASE")
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).optional(),
});

export async function updateSection(c: Context) {
  const sectionId = c.req.param("sectionId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const sectionRow = await db
    .select({
      section: templateSections,
      token: tokens,
      org: invoiceTemplates.organizationId,
    })
    .from(templateSections)
    .innerJoin(tokens, eq(tokens.id, templateSections.id))
    .innerJoin(invoiceTemplates, eq(templateSections.templateId, invoiceTemplates.id))
    .where(
      and(eq(templateSections.id, sectionId), eq(invoiceTemplates.organizationId, organizationId)),
    )
    .limit(1);

  if (sectionRow.length === 0) return c.json({ error: "Section not found" }, 404);

  const currentToken = sectionRow[0].token;

  const body = await c.req.json();
  const parsed = updateSectionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const tokenPatch: any = {};
  if (
    parsed.data.sectionToken !== undefined &&
    parsed.data.sectionToken !== currentToken.tokenKey
  ) {
    if (!parsed.data.sectionToken) {
      return c.json({ error: "sectionToken cannot be empty" }, 400);
    }
    const collision = await db.query.tokens?.findFirst({
      where: and(
        eq(tokens.templateId, sectionRow[0].section.templateId),
        eq(tokens.tokenKey, parsed.data.sectionToken),
      ),
    });
    if (collision) {
      return c.json(
        {
          error: `Section token "${parsed.data.sectionToken}" is already in use in this template.`,
        },
        409,
      );
    }
    tokenPatch.tokenKey = parsed.data.sectionToken;
  }

  if (parsed.data.label !== undefined) tokenPatch.label = parsed.data.label ?? "";
  if (parsed.data.description !== undefined)
    tokenPatch.description = parsed.data.description ?? null;
  if (parsed.data.orderIndex !== undefined) tokenPatch.sortOrder = parsed.data.orderIndex;

  if (Object.keys(tokenPatch).length === 0) {
    return c.json({ error: "No values to set" }, 400);
  }

  const mergedSection = await db.transaction(async (tx: any) => {
    const updatedToken = await TokenService.updateToken(sectionId, tokenPatch, tx);

    return {
      id: sectionRow[0].section.id,
      templateId: sectionRow[0].section.templateId,
      sectionToken: updatedToken?.tokenKey ?? tokenPatch.tokenKey ?? currentToken.tokenKey,
      label:
        updatedToken?.label ??
        (tokenPatch.label !== undefined ? tokenPatch.label : currentToken.label),
      description:
        updatedToken?.description !== undefined
          ? updatedToken.description
          : tokenPatch.description !== undefined
            ? tokenPatch.description
            : currentToken.description,
      sortOrder:
        updatedToken?.sortOrder !== undefined
          ? updatedToken.sortOrder
          : tokenPatch.sortOrder !== undefined
            ? tokenPatch.sortOrder
            : currentToken.sortOrder,
    };
  });

  return c.json(mergedSection);
}
