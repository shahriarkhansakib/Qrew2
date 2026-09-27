import {
  db,
  templateConstants,
  tokens,
} from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { z } from "zod";
import { TokenService } from "../../../tokens/token.service";

const updateConstantSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9_]+$/)
    .optional(),
  valueType: z.enum(["number", "percentage", "currency_rate", "text"]).optional(),
  value: z.string().optional(),
  description: z.string().optional(),
});

export async function updateConstant(c: Context) {
  const id = c.req.param("constantId") as string;
  const organizationId = c.get("organizationId") as string;
  if (!organizationId) return c.json({ error: "Unauthorized" }, 401);

  const existing = await db
    .select({ id: templateConstants.id })
    .from(templateConstants)
    .innerJoin(tokens, eq(tokens.id, templateConstants.id))
    .where(and(eq(templateConstants.id, id), eq(tokens.organizationId, organizationId)))
    .limit(1);
  if (existing.length === 0) return c.json({ error: "Constant not found" }, 404);

  const body = await c.req.json();
  const parsed = updateConstantSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error }, 400);

  const tokenPatch: any = {};
  if (parsed.data.key !== undefined) tokenPatch.tokenKey = parsed.data.key;
  if (parsed.data.valueType !== undefined) tokenPatch.valueType = parsed.data.valueType;
  if (parsed.data.description !== undefined) tokenPatch.label = parsed.data.description;

  const constPatch: any = {};
  if (parsed.data.value !== undefined) constPatch.defaultValue = parsed.data.value;

  if (Object.keys(tokenPatch).length === 0 && Object.keys(constPatch).length === 0) {
    return c.json({ error: "No values to set" }, 400);
  }

  await db.transaction(async (tx) => {
    if (Object.keys(tokenPatch).length > 0) {
      await TokenService.updateToken(id, tokenPatch, tx);
    }
    if (Object.keys(constPatch).length > 0) {
      await tx
        .update(templateConstants)
        .set(constPatch)
        .where(eq(templateConstants.id, id));
    }
  });

  const [updated] = await db
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
    .where(eq(templateConstants.id, id));

  if (!updated) return c.json({ error: "Not found" }, 404);

  return c.json(updated);
}
