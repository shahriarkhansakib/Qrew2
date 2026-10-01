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

// ─── SyntaxOverlay ────────────────────────────────────────────────────────────

/** Renders formula text with colored parentheses by depth, and semantic tokens. */
export function SyntaxOverlay({
  value,
  getTokenColor,
}: {
  value: string;
  getTokenColor?: (token: string) => string;
}) {
  if (!value) return null;
  const elements: React.ReactNode[] = [];
  let depth = 0;

  const regex = /(\b[A-Z_][A-Z0-9_]*\b|\(|\))/g;
  let lastIdx = 0;
  let match;
  let keyIdx = 0;

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIdx) {
      elements.push(
        <span key={keyIdx++} className="text-foreground/80">
          {value.slice(lastIdx, match.index)}
        </span>,
      );
    }

    const token = match[0];
    if (token === "(") {
      const parenProps = getParenStyle(depth);
      depth++;
      elements.push(
        <span key={keyIdx++} style={parenProps.style} className={parenProps.className}>
          {token}
        </span>,
      );
    } else if (token === ")") {
      depth = Math.max(0, depth - 1);
      const parenProps = getParenStyle(depth);
      elements.push(
        <span key={keyIdx++} style={parenProps.style} className={parenProps.className}>
          {token}
        </span>,
      );
    } else {
      const colorClass = getTokenColor ? getTokenColor(token) : "text-violet-400";
      elements.push(
        <span key={keyIdx++} className={colorClass}>
          {token}
        </span>,
      );
    }

    lastIdx = regex.lastIndex;
  }

  if (lastIdx < value.length) {
    elements.push(
      <span key={keyIdx++} className="text-foreground/80">
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
