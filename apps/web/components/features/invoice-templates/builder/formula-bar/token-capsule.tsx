"use client";

import React, { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { resolveTokenMetadata, TokenMetadata } from "../formula-bar-utils";

export interface TokenCapsuleProps {
  token: string;
  startIndex: number;
  endIndex: number;
  colorClass: string;
  tokenMap?: Record<string, number>;
  sections?: any[];
  templateConstants?: any[];
  externalTokens?: {
    global: Set<string>;
    template: Set<string>;
    file: Set<string>;
    category: Set<string>;
  };
  selectedCell?: { token?: string } | null;
  disabled?: boolean;
  onSwapToken?: (oldToken: string, newToken: string, startIndex: number, endIndex: number) => void;
  onTokenClick?: (cursorPos: number) => void;
}

export function TokenCapsule({
  token,
  startIndex,
  endIndex,
  colorClass,
  tokenMap = {},
  sections = [],
  templateConstants = [],
  externalTokens,
  selectedCell,
  disabled = false,
  onSwapToken,
  onTokenClick,
}: TokenCapsuleProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const metadata: TokenMetadata = useMemo(() => {
    return resolveTokenMetadata({
      token,
      sections,
      templateConstants,
      externalTokens,
      tokenMap,
      selectedCell,
    });
  }, [token, sections, templateConstants, externalTokens, tokenMap, selectedCell]);

  const hasSiblings = Boolean(onSwapToken && metadata.siblings.length > 0 && !disabled);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    onTokenClick?.(endIndex);

    if (hasSiblings) {
      setIsMenuOpen((prev) => !prev);
    }
  };

  const formattedValue = useMemo(() => {
    if (metadata.evaluatedValue === null || metadata.evaluatedValue === undefined) return null;
    const v = metadata.evaluatedValue;
    return v % 1 === 0
      ? v.toLocaleString("en-US")
      : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [metadata.evaluatedValue]);

  // Minimalist, borderless, icon-free token chip text
  const chipSpan = (
    <span
      role={hasSiblings ? "button" : undefined}
      tabIndex={hasSiblings ? -1 : undefined}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "inline font-mono text-sm select-none transition-colors pointer-events-auto",
        colorClass,
        disabled
          ? "cursor-default opacity-60"
          : cn(
              "cursor-pointer",
              "hover:underline underline-offset-4 decoration-current/40 hover:brightness-110",
              isMenuOpen && "underline underline-offset-4 decoration-current font-bold",
            ),
      )}
    >
      {token}
    </span>
  );

  return (
    <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <Tooltip open={isHovered && !isMenuOpen} onOpenChange={setIsHovered}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{chipSpan}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="z-50 bg-popover/95 text-popover-foreground border border-border/80 backdrop-blur-md shadow-xl px-2.5 py-1.5 flex flex-col gap-0.5 rounded-md text-xs pointer-events-none"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-xs">{metadata.friendlyLabel}</span>
            {formattedValue !== null && (
              <span className="font-mono text-[11px] font-medium text-emerald-500 dark:text-emerald-400">
                {formattedValue}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{metadata.categoryLabel}</span>
            {hasSiblings && (
              <>
                <span>·</span>
                <span className="text-primary font-medium">Click to swap variant</span>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {hasSiblings && (
        <PopoverContent
          side="top"
          align="center"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="w-auto p-1 rounded-full bg-popover/95 backdrop-blur-md border border-border/70 shadow-xl flex items-center gap-1 z-50 pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-100"
        >
          <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground/50 pl-2 pr-1 select-none">
            Variant
          </span>
          <div className="h-3 w-px bg-border/60" />
          <div className="flex items-center gap-0.5 pr-0.5">
            {metadata.siblings.map((sibling) => (
              <button
                key={sibling.key}
                type="button"
                disabled={sibling.disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSwapToken?.(token, sibling.key, startIndex, endIndex);
                  setIsMenuOpen(false);
                }}
                title={sibling.disabledReason}
                className={cn(
                  "px-2.5 py-0.5 text-xs font-medium rounded-full transition-all select-none",
                  sibling.isCurrent
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : sibling.disabled
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70 active:scale-95 cursor-pointer",
                )}
              >
                {sibling.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
