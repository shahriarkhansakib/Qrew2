import type { TplIdToTokenMap, TplTokenToIdMap } from "@starter/db";
import { db, templateConstants, tokens } from "@starter/db";
import { eq } from "drizzle-orm";

export async function buildConstantIndex(templateId: string): Promise<{
  tplTokenToId: TplTokenToIdMap;
  tplIdToToken: TplIdToTokenMap;
}> {
  const constants = await db
    .select({ id: templateConstants.id, token: tokens.tokenKey })
    .from(templateConstants)
    .innerJoin(tokens, eq(tokens.id, templateConstants.id))
    .where(eq(templateConstants.templateId, templateId));

  const tplTokenToId: TplTokenToIdMap = {};
  const tplIdToToken: TplIdToTokenMap = {};
  for (const c of constants) {
    if (c.token) {
      tplTokenToId[c.token] = c.id;
      tplIdToToken[c.id] = c.token;
    }
  }
  return { tplTokenToId, tplIdToToken };
}
