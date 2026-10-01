import { db, invoiceTemplates } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";

const createConstantSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/),
  valueType: z.enum(["number", "percentage", "currency_rate", "text"]),
  value: z.string().optional().default(""),
  description: z.string().optional(),
});

export async function createConstant(c: Context) {
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

  const body = await c.req.json();
  const parsed = createConstantSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const newConstant = await TokenService.createTemplateConstant({
    id: crypto.randomUUID(),
    templateId,
    token: parsed.data.key,
    name: parsed.data.description || parsed.data.key,
    defaultValue: parsed.data.value,
    valueType: parsed.data.valueType,
    organizationId,
  });

  return c.json(newConstant, 201);
}
