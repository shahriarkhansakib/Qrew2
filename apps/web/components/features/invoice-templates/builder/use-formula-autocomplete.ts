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
  isFormulaCell: boolean = true,
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

  // Sorted full token list, including all independent categories/fields, constants, and row tokens
  const allTokens = useMemo(() => {
    const rawTokens = Object.keys(tokenMap).filter((t) => {
      if (hiddenTokens.has(t)) return false;
      if (t.endsWith("_TOTAL") && t !== "EXP_TOTAL") {
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
    });

    return [...new Set(rawTokens)].sort();
  }, [tokenMap, currentToken, hiddenTokens]);

  // Reset forceHidden whenever input value or cursor position changes
  useEffect(() => {
    setForceHidden(false);
  }, []);

  // Determine if cursor is at a position where a token is allowed:
  // 1. Start of input (empty or whitespace)
  // 2. Right after an operator, comma, or open paren: +, -, *, /, //, %, (, ,
  // 3. Actively typing a token prefix (lastWord has content and is not purely numeric)
  const trimmed = valueUpToCursor.trimEnd();
  const atInsertPosition =
    trimmed.length === 0 || /[+\-*/%(,]$/.test(trimmed) || trimmed.endsWith("//");

  const isAtValidTokenPosition = atInsertPosition || (lastWord.length > 0 && !numericOnly);

  const isVisible =
    isFormulaCell && isActive && !forceHidden && !numericOnly && isAtValidTokenPosition;

  useEffect(() => {
    if (!isFormulaCell || !isActive || numericOnly || !isAtValidTokenPosition) {
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
