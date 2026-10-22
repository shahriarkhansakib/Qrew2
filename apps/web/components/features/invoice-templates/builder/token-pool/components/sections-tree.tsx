import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "../../builder-context";
import { SECTION_PALETTE } from "../../template-builder-workspace";
import { PoolSectionHeader, TokenRow } from "../index";
import { ROW_TOKENS_INFO, SECTIONS_HEADER_INFO, SectionInfoPopover } from "./section-info-popover";

function SectionItem({
  section,
  idx,
  tokenMap,
  tokenZoomLevel,
  handleTokenClick,
  setShowLegend,
}: {
  section: any;
  idx: number;
  tokenMap: any;
  tokenZoomLevel: number;
  handleTokenClick: (token: string) => void;
  setShowLegend: (show: boolean) => void;
}) {
  const { selectedCell, invalidTokens, hiddenTokens, getTokenDisabledReason, templateType } =
    useBuilderContext();
  const isSheet = templateType === "sheet" || templateType === "general";
  const isFormulaMode = !!selectedCell;
  const [activeTab, setActiveTab] = useState<"rows" | "section">("rows");
  const sectionToken: string = section.sectionToken;
  const rows: any[] = (section.rows ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const sectionCharges: any[] = section.sectionCharges ?? [];
  const color = SECTION_PALETTE[idx % SECTION_PALETTE.length];

  const sectionLabel = section.label ?? sectionToken.split("_").pop() ?? sectionToken;

  const secBase = tokenMap[`SEC_${sectionToken}_BASE`];
  const secCharges = tokenMap[`SEC_${sectionToken}_CHARGES`];
  const secTotal = tokenMap[`SEC_${sectionToken}`] ?? tokenMap[`SEC_${sectionToken}_TOTAL`];

  // Rule: By default row dropdowns are closed unless they have charges
  const [openRows, setOpenRows] = useState<Set<string>>(
    () => new Set(rows.filter((r: any) => r.charges && r.charges.length > 0).map((r: any) => r.id)),
  );

  const toggleRow = (rowId: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-border/40 bg-transparent overflow-hidden mb-3">
      {/* ── Section Title Row ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color.border }}
          />
          <span className="font-semibold text-xs text-foreground truncate">{sectionLabel}</span>
        </div>
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground/80 shrink-0">
          {secTotal != null ? fmt(secTotal) : "—"}
        </span>
      </div>

      {/* ── Sub-tabs: Row Tokens vs Section Tokens ── */}
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between border-b border-border/30 pb-1 mb-2">
          <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-md">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab("rows")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setActiveTab("rows");
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer select-none",
                activeTab === "rows"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>Row Tokens ({rows.length})</span>
              <SectionInfoPopover info={ROW_TOKENS_INFO} />
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("section")}
              className={cn(
                "px-2 py-0.5 text-[11px] font-medium rounded transition-colors",
                activeTab === "section"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Section Tokens
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "section" ? (
          /* Section Tokens: specifically Section Base, Section Charges, Section Total */
          <div className="space-y-2 pb-2">
            <div className="bg-muted/10 border border-border/20 rounded-md p-1.5 space-y-0.5">
              <div className="flex items-center justify-between px-1 mb-1">
                <span>Section Tokens</span>
                <span className="font-mono text-[10px] text-muted-foreground/40">
                  {sectionToken}
                </span>
              </div>
              {!isSheet && (
                <>
                  <TokenRow
                    token={`SEC_${sectionToken}_BASE`}
                    value={secBase ?? null}
                    type="sec-base"
                    zoomLevel={tokenZoomLevel}
                    onLegendClick={() => setShowLegend(true)}
                    onClick={() => handleTokenClick(`SEC_${sectionToken}_BASE`)}
                  />
                  <TokenRow
                    token={`SEC_${sectionToken}_CHARGES`}
                    value={secCharges ?? null}
                    type="sec-charges"
                    zoomLevel={tokenZoomLevel}
                    onLegendClick={() => setShowLegend(true)}
                    onClick={() => handleTokenClick(`SEC_${sectionToken}_CHARGES`)}
                  />
                </>
              )}
              <TokenRow
                token={`SEC_${sectionToken}`}
                value={secTotal ?? null}
                type="sec-total"
                zoomLevel={tokenZoomLevel}
                onLegendClick={() => setShowLegend(true)}
                onClick={() => handleTokenClick(`SEC_${sectionToken}`)}
              />
            </div>

            {sectionCharges.length > 0 && !isSheet && (
              <div className="bg-muted/5 border border-border/20 rounded-md p-1.5 space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground/50 px-1 mb-0.5 tracking-wider">
                  Individual Section Charges
                </div>
                {sectionCharges.map((sc: any) =>
                  sc.chargeToken ? (
                    <TokenRow
                      key={sc.id}
                      token={sc.chargeToken}
                      value={tokenMap[sc.chargeToken] ?? null}
                      type="sec-charge-item"
                      zoomLevel={tokenZoomLevel}
                      onLegendClick={() => setShowLegend(true)}
                      onClick={() => handleTokenClick(sc.chargeToken)}
                    />
                  ) : null,
                )}
              </div>
            )}
          </div>
        ) : (
          /* Row Tokens Tab: all row tokens in a dropdown structure */
          <div className="space-y-1.5 pb-2">
            {rows.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/40 italic px-1 py-1">
                No rows in this section
              </p>
            ) : (
              rows.map((row: any) => {
                const rowTotalVal = tokenMap[row.rowToken] ?? tokenMap[`${row.rowToken}_TOTAL`];
                const rowBaseVal = tokenMap[`${row.rowToken}_BASE`];
                const rowChargesVal = tokenMap[`${row.rowToken}_CHARGES`];
                const rowCharges: any[] = row.charges ?? [];
                const isRowOpen = openRows.has(row.id);

                const isRowTokenInvalid = isFormulaMode && invalidTokens.has(row.rowToken);
                const isRowTokenHidden = isFormulaMode && hiddenTokens.has(row.rowToken);
                const isRowTokenDisabled = isRowTokenInvalid || isRowTokenHidden;
                const rowDisabledReason = isRowTokenDisabled
                  ? getTokenDisabledReason(row.rowToken) ||
                    (isRowTokenInvalid
                      ? "Creates circular dependency"
                      : "Not allowed in active cell")
                  : undefined;

                const onRowTokenClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (isRowTokenInvalid || isRowTokenHidden) {
                    toast.error(
                      `Cannot insert: ${rowDisabledReason || `"${row.rowToken}" is not allowed.`}`,
                    );
                    return;
                  }
                  handleTokenClick(row.rowToken);
                };

                return (
                  <div
                    key={row.id}
                    className="border border-border/30 rounded-md overflow-hidden bg-muted/10 transition-colors"
                  >
                    {/* Row Dropdown Header: Default token at top, caret after, total value on right */}
                    <div
                      onClick={isSheet ? onRowTokenClick : () => toggleRow(row.id)}
                      className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/30 cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Default Token at Top: ROW_TOKEN (Row Total) */}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 font-mono truncate select-none rounded px-1.5 py-0.5 leading-none font-bold transition-colors",
                            isRowTokenDisabled
                              ? "opacity-35 cursor-not-allowed bg-slate-500/5 text-slate-400 border border-slate-500/10"
                              : "bg-slate-500/10 text-slate-400 border border-slate-500/20 hover:bg-slate-500/20",
                          )}
                          style={{ fontSize: 13 + tokenZoomLevel }}
                          onClick={onRowTokenClick}
                          title={
                            isRowTokenDisabled
                              ? rowDisabledReason?.startsWith("Disabled:")
                                ? rowDisabledReason
                                : `Disabled: ${rowDisabledReason}`
                              : `Insert ${row.rowToken}${row.label ? ` (${row.label})` : ""}`
                          }
                        >
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowLegend(true);
                            }}
                            className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-400 cursor-pointer"
                            title={isSheet ? "Row Value" : "Row Total (Base + Charges)"}
                          />
                          {isRowTokenInvalid && (
                            <AlertTriangle className="w-3 h-3 text-accent-foreground shrink-0 mr-0.5" />
                          )}
                          <span className={isRowTokenInvalid ? "line-through opacity-70" : ""}>
                            {row.rowToken}
                          </span>
                        </span>

                        {/* Caret / down arrow icon after the token (Standard templates only) */}
                        {!isSheet && (
                          <ChevronRight
                            className={cn(
                              "w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-transform duration-200 shrink-0",
                              isRowOpen && "rotate-90",
                            )}
                          />
                        )}
                      </div>

                      {/* Total value at the rightmost side after the token */}
                      <span
                        className="font-mono shrink-0 tabular-nums text-slate-400 font-bold"
                        style={{ fontSize: 14 + tokenZoomLevel }}
                      >
                        {rowTotalVal != null ? fmt(rowTotalVal) : "—"}
                      </span>
                    </div>

                    {/* Dropped down tokens: remaining 3 types (Base, Line Charges, Charges Total) */}
                    {!isSheet && isRowOpen && (
                      <div className="px-1.5 py-1 space-y-0.5 bg-background/20 border-t border-border/20">
                        {/* 1. Base Token */}
                        <TokenRow
                          token={`${row.rowToken}_BASE`}
                          value={rowBaseVal ?? null}
                          type="row-base"
                          zoomLevel={tokenZoomLevel}
                          onLegendClick={() => setShowLegend(true)}
                          onClick={() => handleTokenClick(`${row.rowToken}_BASE`)}
                        />

                        {/* 2. Individual Charge Token(s) */}
                        {rowCharges.map((charge: any) =>
                          charge.chargeToken ? (
                            <TokenRow
                              key={charge.id}
                              token={charge.chargeToken}
                              value={tokenMap[charge.chargeToken] ?? null}
                              type="row-charge-item"
                              zoomLevel={tokenZoomLevel}
                              onLegendClick={() => setShowLegend(true)}
                              onClick={() => handleTokenClick(charge.chargeToken)}
                            />
                          ) : null,
                        )}

                        {/* 3. All Charge Total Token */}
                        <TokenRow
                          token={`${row.rowToken}_CHARGES`}
                          value={rowChargesVal ?? null}
                          type="row-charges"
                          zoomLevel={tokenZoomLevel}
                          onLegendClick={() => setShowLegend(true)}
                          onClick={() => handleTokenClick(`${row.rowToken}_CHARGES`)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionsTree({
  sortedSections,
  tokenMap,
  tokenZoomLevel,
  handleTokenClick,
  setShowLegend,
}: {
  sortedSections: any[];
  tokenMap: any;
  tokenZoomLevel: number;
  handleTokenClick: (token: string) => void;
  setShowLegend: (show: boolean) => void;
}) {
  if (sortedSections.length === 0) return null;
  return (
    <div>
      <PoolSectionHeader label="Sections" info={SECTIONS_HEADER_INFO} />
      {sortedSections.map((section: any, idx: number) => (
        <SectionItem
          key={section.id}
          section={section}
          idx={idx}
          tokenMap={tokenMap}
          tokenZoomLevel={tokenZoomLevel}
          handleTokenClick={handleTokenClick}
          setShowLegend={setShowLegend}
        />
      ))}
    </div>
  );
}
