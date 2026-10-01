import { db, invoiceTemplates } from "@starter/db";
import {
  decodeFormula,
  decodeFormulaForEval,
  encodeFormula,
  type IdToEvalTokenMap,
  type IdToTokenMap,
  type TokenMap,
} from "@starter/db/formula-codec";
import { eq } from "drizzle-orm";
import { TokenService } from "../../tokens/token.service";

export interface TemplateFormulaContext {
  templateId: string;
  organizationId: string;
  tokenMap: TokenMap;
  idToToken: IdToTokenMap;
  idToEvalToken: IdToEvalTokenMap;
  // Compatibility properties for existing controllers/tests
  rowTokenToId: Record<string, string>;
  rowIdToToken: Record<string, string>;
  secTokenToId: Record<string, string>;
  secIdToToken: Record<string, string>;
  tplTokenToId: Record<string, string>;
  tplIdToToken: Record<string, string>;
  fileFieldTokens: string[];
  globalTokens: string[];
  encode: (formula: string | null | undefined) => string | null;
  decode: (storedFormula: string | null | undefined) => string | null;
  decodeForEval: (storedFormula: string | null | undefined) => string;
}

/**
 * Loads the complete token mapping context for an invoice template.
 * Enables two-way encoding (bare tokens in UI -> {{$tok:UUID}} in DB)
 * and decoding ({{$tok:UUID}} in DB -> bare tokens in UI / prefixed tokens in engine).
 */
export async function getTemplateFormulaContext(
  templateId: string,
  organizationId?: string,
  tx: any = db,
): Promise<TemplateFormulaContext> {
  let orgId = organizationId;
  if (!orgId) {
    try {
      const res = await tx
        .select({ orgId: invoiceTemplates.organizationId })
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.id, templateId))
        .limit(1);
      orgId = res?.[0]?.orgId || "";
    } catch {
      orgId = "";
    }
  }

  const { tokenMap, idToToken, idToEvalToken } = await TokenService.getTemplateTokenMaps(
    templateId,
    orgId || "",
    tx,
  );

  return {
    templateId,
    organizationId: orgId || "",
    tokenMap,
    idToToken,
    idToEvalToken,
    rowTokenToId: tokenMap,
    rowIdToToken: idToToken,
    secTokenToId: tokenMap,
    secIdToToken: idToToken,
    tplTokenToId: tokenMap,
    tplIdToToken: idToToken,
    fileFieldTokens: [],
    globalTokens: [],
    encode: (formula: string | null | undefined) => encodeFormula(formula, tokenMap),
    decode: (storedFormula: string | null | undefined) => decodeFormula(storedFormula, idToToken),
    decodeForEval: (storedFormula: string | null | undefined) =>
      decodeFormulaForEval(storedFormula, idToEvalToken),
  };
}
