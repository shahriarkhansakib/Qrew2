import { db, invoiceTemplates, templateSections, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";
import { nextSectionToken } from "../services/section-index.service";

const createSectionSchema = z.object({
  label: z.string().min(1).nullish(),
  description: z.string().nullish(),
  sectionToken: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/, "sectionToken must be UPPER_SNAKE_CASE")
    .nullish(),
  orderIndex: z.number().int().min(0).default(0),
});

export async function createSection(c: Context) {
  const templateId = c.req.param("templateId") as string;
  const organizationId = c.get("organizationId");
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const template = await db.query.invoiceTemplates.findFirst({
    where: and(
      eq(invoiceTemplates.id, templateId),
      eq(invoiceTemplates.organizationId, organizationId),
    ),
  });
  if (!template) return c.json({ error: "Template not found" }, 404);

  const body = await c.req.json();
  const parsed = createSectionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  let sectionToken = parsed.data.sectionToken;
  if (!sectionToken) {
    sectionToken = await nextSectionToken(templateId);
  }

  const collision = await db.query.tokens?.findFirst({
    where: and(
      eq(tokens.templateId, templateId),
      eq(tokens.tokenKey, sectionToken),
    ),
  });
  if (collision) {
    return c.json(
      { error: `Section token "${sectionToken}" is already in use in this template.` },
      409,
    );
  }

  const newSection = await TokenService.createSectionToken({
    id: crypto.randomUUID(),
    templateId,
    sectionToken,
    label: parsed.data.label ?? null,
    description: parsed.data.description ?? null,
    organizationId,
    sortOrder: parsed.data.orderIndex,
  });

  return c.json(newSection, 201);
}
