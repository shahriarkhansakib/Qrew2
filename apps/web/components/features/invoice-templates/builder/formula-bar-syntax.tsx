"use client";

// ─── Parenthesis depth colors (Wavelength Distribution) ─────────────────────────

/**
 * Returns color style for parentheses pairs:
 * - Depth 0 (level 1): Blue (#3b82f6)
 * - Depth 1 (level 2): Red (#ef4444)
 * - Depth >= 2: Distributed evenly along the visible color wavelength spectrum (Emerald -> Amber -> Purple -> Cyan -> Pink...)
 */
export function getParenStyle(depth: number): { style: React.CSSProperties; className: string } {
  if (depth === 0) {
    return { style: { color: "#3b82f6" }, className: "font-bold text-blue-500" };
  }
  if (depth === 1) {
    return { style: { color: "#ef4444" }, className: "font-bold text-red-500" };
  }
  // Depth >= 2: Distributed evenly across the visible spectrum via HSL progression
  const spectralHue = (140 + (depth - 2) * 65) % 360;
  return { style: { color: `hsl(${spectralHue}, 85%, 60%)` }, className: "font-bold" };
}

import { cn } from "@/lib/utils";
import { TokenCapsule } from "./formula-bar/token-capsule";
import { MATH_FUNCTIONS } from "./formula-bar-utils";

export interface SyntaxOverlayProps {
  value: string;
  getTokenColor?: (token: string) => string;
  tokenMap?: Record<string, number>;
  sections?: any[];
  templateConstants?: any[];
  externalTokens?: {
    global: Set<string>;
    template: Set<string>;
    file: Set<string>;
    category: Set<string>;
  };
  selectedCell?: { token?: string; breadcrumb?: string } | null;
  isActive?: boolean;
  disabled?: boolean;
  onSwapToken?: (oldToken: string, newToken: string, startIndex: number, endIndex: number) => void;
  onTokenClick?: (cursorPos: number) => void;
}

/** Renders formula text with colored parentheses by depth, and semantic tokens / interactive capsules. */
export function SyntaxOverlay({
  value,
  getTokenColor,
  tokenMap,
  sections,
  templateConstants,
  externalTokens,
  selectedCell,
  isActive = true,
  disabled = false,
  onSwapToken,
  onTokenClick,
}: SyntaxOverlayProps) {
  if (!value) return null;
  const elements: React.ReactNode[] = [];
  let depth = 0;

  const regex = /(\b[a-zA-Z_][a-zA-Z0-9_]*\b|\(|\))/g;
  let lastIdx = 0;
  let match;
  let keyIdx = 0;

  const isInteractive = Boolean(onSwapToken || (tokenMap && isActive));

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIdx) {
      elements.push(
        <span key={keyIdx++} className="text-foreground/80 pointer-events-none">
          {value.slice(lastIdx, match.index)}
        </span>,
      );
    }

    const token = match[0];
    if (token === "(") {
      const parenProps = getParenStyle(depth);
      depth++;
      elements.push(
        <span
          key={keyIdx++}
          style={parenProps.style}
          className={cn(parenProps.className, "pointer-events-none")}
        >
          {token}
        </span>,
      );
    } else if (token === ")") {
      depth = Math.max(0, depth - 1);
      const parenProps = getParenStyle(depth);
      elements.push(
        <span
          key={keyIdx++}
          style={parenProps.style}
          className={cn(parenProps.className, "pointer-events-none")}
        >
          {token}
        </span>,
      );
    } else {
      const colorClass = getTokenColor ? getTokenColor(token) : "text-violet-400";
      const isMathFn = (MATH_FUNCTIONS as readonly string[]).includes(token.toUpperCase());

      if (isInteractive && !isMathFn) {
        elements.push(
          <TokenCapsule
            key={`tok-${match.index}-${token}`}
            token={token}
            startIndex={match.index}
            endIndex={regex.lastIndex}
            colorClass={colorClass}
            tokenMap={tokenMap}
            sections={sections}
            templateConstants={templateConstants}
            externalTokens={externalTokens}
            selectedCell={selectedCell}
            disabled={disabled || !isActive}
            onSwapToken={onSwapToken}
            onTokenClick={onTokenClick}
          />,
        );
      } else if (isMathFn) {
        elements.push(
          <span
            key={keyIdx++}
            className="text-amber-500/90 dark:text-amber-400 font-mono italic lowercase font-medium pointer-events-none"
          >
            {token.toLowerCase()}
          </span>,
        );
      } else {
        elements.push(
          <span key={keyIdx++} className={cn(colorClass, "pointer-events-none")}>
            {token}
          </span>,
        );
      }
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < value.length) {
    elements.push(
      <span key={keyIdx++} className="text-foreground/80 pointer-events-none">
        {value.slice(lastIdx)}
      </span>,
    );
  }

  return <>{elements}</>;
}

// ─── Exact Substring Highlight ────────────────────────────────────────────────

/** Renders a token string with exact matched characters highlighted (including underscores). */
export function renderHighlightedToken(token: string, search: string): React.ReactNode {
  if (!search) return token;
  const s = search.toUpperCase();
  const t = token.toUpperCase();
  const idx = t.indexOf(s);
  if (idx === -1) return token;

  return (
    <>
      {token.slice(0, idx)}
      <span className="text-primary font-bold underline underline-offset-2">
        {token.slice(idx, idx + s.length)}
      </span>
      {token.slice(idx + s.length)}
    </>
  );
}
