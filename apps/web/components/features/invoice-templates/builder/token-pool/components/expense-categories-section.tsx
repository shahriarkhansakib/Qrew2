"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/formula-evaluator";
import { useBuilderContext } from "../../builder-context";
import { PoolSectionHeader } from "../index";
import { EXPENSE_CATEGORIES_INFO } from "./section-info-popover";

export function ExpenseCategoriesSection({
  categories = [],
  tokenZoomLevel,
  handleTokenClick,
  setShowLegend,
}: {
  categories: Array<{ id?: string; tokenKey: string; label?: string; name?: string }>;
  tokenZoomLevel: number;
  handleTokenClick: (token: string) => void;
  setShowLegend: (show: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const { selectedCell, invalidTokens, hiddenTokens, getTokenDisabledReason, tokenMap } =
    useBuilderContext();
  const isFormulaMode = !!selectedCell;

  const expTotalToken = "EXP_TOTAL";
  const expTotalVal = tokenMap["EXP_TOTAL"] ?? 0;
  const isTotalInvalid = isFormulaMode && invalidTokens.has(expTotalToken);
  const isTotalHidden = isFormulaMode && hiddenTokens.has(expTotalToken);
  const isTotalDisabled = isTotalInvalid || isTotalHidden;
  const totalDisabledReason = isTotalDisabled
    ? getTokenDisabledReason(expTotalToken) ||
      (isTotalInvalid ? "Creates circular dependency" : "Not allowed in active cell")
    : undefined;

  const handleTotalClick = () => {
    if (isTotalDisabled) return;
    handleTokenClick(expTotalToken);
  };

  const nonSystemCategories = categories.filter((c) => c.tokenKey !== "EXP_TOTAL");

  return (
    <div className="px-2">
      <PoolSectionHeader label="Expense Categories" info={EXPENSE_CATEGORIES_INFO} />

      <div className="space-y-1">
        <div className="border border-border/30 rounded-md overflow-hidden bg-muted/10 transition-colors">
          {/* Dropdown Header: Token chip, caret after, total value on right */}
          <div
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/30 cursor-pointer select-none group"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Default Token at Top: EXP_TOTAL */}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 font-mono truncate select-none rounded px-1.5 py-0.5 leading-none font-bold transition-colors insertable-token",
                  isTotalDisabled
                    ? "opacity-35 cursor-not-allowed bg-rose-500/5 text-rose-400 border border-rose-500/10"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20",
                )}
                style={{ fontSize: 13 + tokenZoomLevel }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleTotalClick();
                }}
                title={
                  isTotalDisabled ? `Disabled: ${totalDisabledReason}` : `Insert ${expTotalToken}`
                }
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLegend(true);
                  }}
                  className="w-1.5 h-1.5 rounded-full shrink-0 bg-rose-400 cursor-pointer"
                  title="Expense Category Token"
                />
                <span className={isTotalInvalid ? "line-through opacity-70" : ""}>
                  {expTotalToken}
                </span>
              </span>

              {/* Caret / arrow icon after the token */}
              <ChevronRight
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-transform duration-200 shrink-0",
                  isOpen && "rotate-90",
                )}
              />
            </div>

            {/* Total value at the rightmost side */}
            <span
              className="font-mono shrink-0 tabular-nums text-rose-400 font-bold"
              style={{ fontSize: 14 + tokenZoomLevel }}
            >
              {fmt(expTotalVal)}
            </span>
          </div>

          {/* Child items: individual categories */}
          {isOpen && (
            <div className="px-1.5 py-1 space-y-0.5 bg-background/20 border-t border-border/20">
              {nonSystemCategories.map((cat) => {
                const bareToken = cat.tokenKey.replace(/^EXP_/, "");
                const isInvalid = isFormulaMode && invalidTokens.has(bareToken);
                const isHidden = isFormulaMode && hiddenTokens.has(bareToken);
                const isDisabled = isInvalid || isHidden;
                const disabledReason = isDisabled
                  ? getTokenDisabledReason(bareToken) ||
                    (isInvalid ? "Creates circular dependency" : "Not allowed in active cell")
                  : undefined;

                const label = cat.label || cat.name || bareToken;
                const catVal =
                  tokenMap[bareToken] ??
                  tokenMap[cat.tokenKey] ??
                  tokenMap[`EXP_${bareToken}`] ??
                  0;

                return (
                  <div
                    key={cat.id || cat.tokenKey}
                    className={cn(
                      "flex items-center justify-between gap-2 px-2 py-1 rounded transition-colors group",
                      isDisabled
                        ? "opacity-35 cursor-not-allowed bg-muted/5"
                        : "hover:bg-muted/20 cursor-pointer",
                    )}
                    onClick={() => {
                      if (!isDisabled) handleTokenClick(bareToken);
                    }}
                    title={isDisabled ? `Disabled: ${disabledReason}` : `Insert ${bareToken}`}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-mono truncate select-none rounded px-1.5 py-0.5 leading-none insertable-token",
                        "bg-rose-500/10 text-rose-400 font-medium border border-rose-500/20",
                        isInvalid ? "line-through opacity-70" : "",
                      )}
                      style={{ fontSize: 13 + tokenZoomLevel }}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowLegend(true);
                        }}
                        className="w-1.5 h-1.5 rounded-full shrink-0 bg-rose-400 cursor-pointer"
                        title="Expense Category Token"
                      />
                      {bareToken}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground truncate">{label}</span>
                      <span
                        className="font-mono shrink-0 tabular-nums text-rose-400 font-medium"
                        style={{ fontSize: 13 + tokenZoomLevel }}
                      >
                        {fmt(catVal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="pt-1 px-2">
          <Link
            href="/settings/customize-fields"
            className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 transition-colors"
          >
            <span>Manage categories in Customize Fields</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
