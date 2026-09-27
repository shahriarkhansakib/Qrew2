import { db, templateConstants, tokens } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import { TokenService } from "../../../tokens/token.service";

export async function deleteConstant(c: Context) {
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

  const deleted = await TokenService.deleteToken(id, db);
  if (!deleted) return c.json({ error: "Not found" }, 404);

  return c.json({ success: true });
}
