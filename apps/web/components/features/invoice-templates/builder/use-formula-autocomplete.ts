"use client";

import { useEffect, useMemo, useState } from "react";
import { getLastWord, lastSegmentIsNumeric } from "./formula-bar-utils";

export function useFormulaAutocomplete(
  inputValue: string,
  cursorPos: number,
  tokenMap: Record<string, number>,
  isActive: boolean,
  currentToken?: string,
  invalidTokens: Set<string> = new Set(),
  hiddenTokens: Set<string> = new Set(),
) {
  const [state, setState] = useState({
    items: [] as string[],
    activeIdx: 0,
  });
  const [forceHidden, setForceHidden] = useState(false);

  // We must calculate the last word relative to where the user is actually typing (the cursor)
  const valueUpToCursor = inputValue.slice(0, cursorPos);
  const lastWord = getLastWord(valueUpToCursor);
  const numericOnly = lastSegmentIsNumeric(valueUpToCursor);

  // Sorted full token list, excluding the current token, its variants, hidden tokens, and legacy prefixed/suffixed aliases
  const allTokens = useMemo(() => {
    return Object.keys(tokenMap)
      .filter((t) => {
        if (hiddenTokens.has(t)) return false;
        if (t === "EXP_TOTAL") {
          // Explicitly keep EXP_TOTAL
        } else if (
          t.endsWith("_TOTAL") ||
          t.startsWith("ORG_") ||
          t.startsWith("GBL_") ||
          t.startsWith("FILE_") ||
          t.startsWith("TPL_") ||
          t.startsWith("EXP_")
        ) {
          return false;
        }
        if (!currentToken) return true;
        const clean = currentToken.replace(/_(BASE|TOTAL|CHARGES)$/, "");
        if (
          t === clean ||
          t === `${clean}_BASE` ||
          t === `${clean}_TOTAL` ||
          t === `${clean}_CHARGES`
        )
          return false;
        if (t === currentToken) return false;
        return true;
      })
      .sort();
  }, [tokenMap, currentToken, hiddenTokens]);

  // Reset forceHidden whenever input value or cursor position changes
  useEffect(() => {
    setForceHidden(false);
  }, [inputValue, cursorPos]);

  // Determine if cursor is at a position where a token is allowed:
  // 1. Start of input (empty or whitespace)
  // 2. Right after an operator or open paren: +, -, *, /, //, % (if binary), (
  // 3. Actively typing a token prefix (lastWord has content and is not purely numeric)
  const trimmed = valueUpToCursor.trimEnd();
  const atInsertPosition =
    trimmed.length === 0 || /[+\-*/%(]$/.test(trimmed) || trimmed.endsWith("//");

  const isAtValidTokenPosition = atInsertPosition || (lastWord.length > 0 && !numericOnly);

  const isVisible = isActive && !forceHidden && !numericOnly && isAtValidTokenPosition;

  useEffect(() => {
    if (!isActive || numericOnly || !isAtValidTokenPosition) {
      setState({ items: [], activeIdx: 0 });
      return;
    }
    if (lastWord.length === 0) {
      setState({ items: allTokens, activeIdx: 0 });
      return;
    }

    // ── Exact Matching (No underscore stripping / fuzzy matching) ──
    const q = lastWord.toUpperCase();

    const tier1: string[] = []; // Exact prefix match (e.g. PORT_ -> PORT_DUES)
    const tier2: string[] = []; // Word boundary exact match (e.g. DUES -> PORT_DUES)
    const tier3: string[] = []; // Exact substring match (e.g. ORT -> PORT_DUES)

    for (const t of allTokens) {
      if (t.startsWith(q)) {
        tier1.push(t);
      } else if (t.split("_").some((part) => part.startsWith(q))) {
        tier2.push(t);
      } else if (t.includes(q)) {
        tier3.push(t);
      }
    }

    const seen = new Set<string>();
    const ranked: string[] = [];
    for (const item of [...tier1, ...tier2, ...tier3]) {
      if (!seen.has(item)) {
        seen.add(item);
        ranked.push(item);
      }
    }

    let firstValidIdx = 0;
    while (firstValidIdx < ranked.length && invalidTokens.has(ranked[firstValidIdx])) {
      firstValidIdx++;
    }
    if (firstValidIdx >= ranked.length) firstValidIdx = 0; // fallback

    setState({ items: ranked, activeIdx: firstValidIdx });
  }, [lastWord, allTokens, isActive, numericOnly, invalidTokens, isAtValidTokenPosition]);

  const setActiveIdx = (i: number) => setState((prev) => ({ ...prev, activeIdx: i }));

  return { state, setState, setActiveIdx, isVisible, lastWord, allTokens, setForceHidden };
}
