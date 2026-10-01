import { db, templateSections, tokens } from "@starter/db";
import { asc, eq } from "drizzle-orm";

/** Convert zero-based index to number string: 0→1, 1→2 */
export function indexToNumberStr(index: number): string {
  return (index + 1).toString();
}

/** Derive the next available section token for a template (returns SECTION_1, SECTION_2…). */
export async function nextSectionToken(templateId: string): Promise<string> {
  const existing = await db
    .select({ sectionToken: tokens.tokenKey })
    .from(templateSections)
    .innerJoin(tokens, eq(tokens.id, templateSections.id))
    .where(eq(templateSections.templateId, templateId))
    .orderBy(asc(tokens.sortOrder));

  const usedTokens = new Set(existing.map((s) => s.sectionToken));
  let idx = 0;
  while (true) {
    const candidate = `SECTION_${indexToNumberStr(idx)}`;
    if (!usedTokens.has(candidate)) return candidate;
    idx++;
  }
}

/** Build token<->id lookup maps for all sections in a template. */
export async function buildSectionIndex(templateId: string): Promise<{
  tokenToId: Record<string, string>;
  idToToken: Record<string, string>;
}> {
  const sections = await db
    .select({ id: templateSections.id, sectionToken: tokens.tokenKey })
    .from(templateSections)
    .innerJoin(tokens, eq(tokens.id, templateSections.id))
    .where(eq(templateSections.templateId, templateId));

  const tokenToId: Record<string, string> = {};
  const idToToken: Record<string, string> = {};
  for (const s of sections) {
    if (s.sectionToken) {
      const fullToken = `SEC_${s.sectionToken}`;
      tokenToId[fullToken] = s.id;
      idToToken[s.id] = fullToken;
    }
  }
  return { tokenToId, idToToken };
}
