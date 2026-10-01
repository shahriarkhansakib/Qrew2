import { decodeFormula, decodeFormulaForEval, encodeFormula } from "@starter/db/formula-codec";
import { describe, expect, it } from "vitest";

describe("Formula Codec Unit Tests (Frontend-Bare <-> Backend-Prefixed)", () => {
  const rowTokenToId = {
    PORT_DUES: "row-uuid-1",
    LIGHT_CHARGES: "row-uuid-2",
  };
  const rowIdToToken = {
    "row-uuid-1": "PORT_DUES",
    "row-uuid-2": "LIGHT_CHARGES",
  };

  const secTokenToId = {
    SEC_PORT: "sec-uuid-1",
  };
  const secIdToToken = {
    "sec-uuid-1": "SEC_PORT",
  };

  const tplTokenToId = {
    T1: "tpl-uuid-1",
  };
  const tplIdToToken = {
    "tpl-uuid-1": "T1",
  };

  const fileFieldTokens = ["CUSTOM1", "GRT", "LOA"];
  const globalTokens = ["G1", "VAT_RATE"];

  it("encodes bare tokens into prefixed/UUID format for database storage", () => {
    const rawFormula = "PORT_DUES_BASE * VAT_RATE + CUSTOM1 * 2 + T1 + SEC_PORT_BASE";
    const encoded = encodeFormula(
      rawFormula,
      rowTokenToId,
      secTokenToId,
      tplTokenToId,
      fileFieldTokens,
      globalTokens,
    );

    expect(encoded).toBe(
      "{{$tok:row-uuid-1}}_BASE * GBL_VAT_RATE + FILE_CUSTOM1 * 2 + {{$tok:tpl-uuid-1}} + {{$tok:sec-uuid-1}}_BASE",
    );
  });

  it("does not double-prefix if a token already had a prefix", () => {
    const mixedFormula = "FILE_CUSTOM1 + GBL_VAT_RATE + G1";
    const encoded = encodeFormula(
      mixedFormula,
      rowTokenToId,
      secTokenToId,
      tplTokenToId,
      fileFieldTokens,
      globalTokens,
    );

    expect(encoded).toBe("FILE_CUSTOM1 + GBL_VAT_RATE + GBL_G1");
  });

  it("decodes database storage format back to bare tokens for frontend display", () => {
    const stored =
      "{{$row:row-uuid-1}}_BASE * GBL_VAT_RATE + FILE_CUSTOM1 * 2 + {{$tpl:tpl-uuid-1}} + {{$sec:sec-uuid-1}}_CHARGES";
    const decoded = decodeFormula(
      stored,
      rowIdToToken,
      secIdToToken,
      tplIdToToken,
      fileFieldTokens,
      globalTokens,
    );

    expect(decoded).toBe("PORT_DUES_BASE * VAT_RATE + CUSTOM1 * 2 + T1 + SEC_PORT_CHARGES");
  });

  it("decodes for engine evaluation retaining prefixes for external tokens", () => {
    const stored =
      "{{$row:row-uuid-1}}_BASE * GBL_VAT_RATE + FILE_CUSTOM1 * 2 + {{$tpl:tpl-uuid-1}} + {{$sec:sec-uuid-1}}_TOTAL";
    const evalFormula = decodeFormulaForEval(stored, rowIdToToken, secIdToToken, tplIdToToken);

    // Engine expects GBL_* and FILE_* prefixes intact, row/sec tokens decoded, tpl decoded to TPL_*
    expect(evalFormula).toBe(
      "PORT_DUES_BASE * GBL_VAT_RATE + FILE_CUSTOM1 * 2 + TPL_T1 + SEC_PORT",
    );
  });

  it("evaluates decoded formula against backend prefixed scope matching mathematical expectation", () => {
    const rawFormula = "PORT_DUES_BASE * VAT_RATE + CUSTOM1 * 2 + T1 + SEC_PORT_BASE";
    const encoded = encodeFormula(
      rawFormula,
      rowTokenToId,
      secTokenToId,
      tplTokenToId,
      fileFieldTokens,
      globalTokens,
    );
    const evalFormula = decodeFormulaForEval(encoded, rowIdToToken, secIdToToken, tplIdToToken);

    expect(evalFormula).toBe(
      "PORT_DUES_BASE * GBL_VAT_RATE + FILE_CUSTOM1 * 2 + TPL_T1 + SEC_PORT_BASE",
    );

    // Backend scope populated with prefixes
    const scope: Record<string, number> = {
      PORT_DUES_BASE: 100,
      GBL_VAT_RATE: 0.15,
      FILE_CUSTOM1: 25,
      TPL_T1: 10,
      SEC_PORT_BASE: 40,
    };

    let expr = evalFormula;
    for (const [key, val] of Object.entries(scope)) {
      expr = expr.replace(new RegExp(`\\b${key}\\b`, "g"), String(val));
    }

    const result = Function(`"use strict"; return (${expr})`)();
    // 100 * 0.15 + 25 * 2 + 10 + 40 = 15 + 50 + 10 + 40 = 115
    expect(result).toBe(115);
  });
});
