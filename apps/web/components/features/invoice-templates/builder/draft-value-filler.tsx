"use client";

import { FileText, Loader2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { decodeFormula } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";

// ─── Unresolved notice popover ────────────────────────────────────────────────
function UnresolvedNoticeButton({ notices }: { notices: any[] }) {
  const [open, setOpen] = useState(false);
  if (!notices?.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/20 hover:bg-accent/30 border border-amber-500/40 transition-colors shrink-0"
          title="Unresolved token references"
        >
          <TriangleAlert className="w-2.5 h-2.5 text-accent-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-3 border-amber-500/30 shadow-xl">
        <div className="flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 text-accent-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-accent-foreground mb-1">
              Unresolved References
            </p>
            <p className="text-[11px] text-muted-foreground mb-2">
              These tokens were not yet available and were treated as{" "}
              <span className="font-mono text-accent-foreground">0</span>.
            </p>
            <ul className="space-y-1">
              {notices.map((n: any, i: number) => (
                <li key={i} className="text-[11px] font-mono bg-muted/40 rounded px-2 py-1">
                  <span className="text-accent-foreground">{n.token ?? "?"}</span>
                  {n.message && <span className="text-muted-foreground ml-1">— {n.message}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Inline value input cell ──────────────────────────────────────────────────
function ValueCell({
  rowToken,
  currentOverride,
  currentValue,
  formula,
  isFormula,
  draftSections,
  onChange,
}: {
  rowToken: string;
  currentOverride?: string;
  currentValue: number;
  formula?: string | null;
  isFormula: boolean;
  draftSections: any[];
  onChange: (token: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayFormula = formula ? decodeFormula(formula, draftSections) : null;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === "") return;
    onChange(rowToken, trimmed);
  }, [draft, rowToken, onChange]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft("");
  }, []);

  if (editing) {
    return (
      <div className="w-full h-full flex items-center justify-end px-2">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className={cn(
            "w-full bg-transparent border-none outline-none text-right",
            "text-sm font-semibold font-mono text-foreground",
            "ring-0 focus:ring-0 p-0",
          )}
          placeholder="0"
        />
      </div>
    );
  }

  const hasOverride = currentOverride !== undefined && currentOverride !== "";

  return (
    <button
      type="button"
      title={
        isFormula
          ? displayFormula
            ? `Formula: = ${displayFormula}`
            : "Formula row"
          : "Click to enter value"
      }
      onClick={() => {
        setDraft(hasOverride ? currentOverride! : isFormula ? "" : String(currentValue || ""));
        setEditing(true);
      }}
      className={cn(
        "w-full h-full flex items-center justify-end px-2 rounded-sm transition-all",
        "hover:ring-1 hover:ring-primary/40 hover:bg-primary/5 cursor-pointer",
        isFormula && !hasOverride
          ? "text-violet-400/80"
          : hasOverride
            ? "text-primary"
            : currentValue !== 0
              ? "text-foreground"
              : "text-muted-foreground/50",
      )}
    >
      <span className="text-sm font-semibold font-mono tabular-nums">
        {currentValue.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </button>
  );
}

// ─── Main DraftValueFiller ────────────────────────────────────────────────────
export function DraftValueFiller({
  previewLoading,
  preview,
  draftSections,
  overrides,
  onOverrideChange,
}: {
  previewLoading: boolean;
  preview: any;
  draftSections: any[];
  overrides: Record<string, string>;
  onOverrideChange: (rowToken: string, value: string) => void;
}) {
  const evaluatedSections: any[] = preview?.sections ?? [];
  const grandTotal = Number(preview?.grandTotal ?? 0);
  const validationErrors: any[] = (preview?.validationErrors ?? []).filter(
    (e: any) => e.code !== "UNRESOLVED_REFERENCE",
  );

  // Build a quick lookup: rowToken → draftRow (for formula / valueType)
  const draftRowByToken: Record<string, any> = {};
  for (const sec of draftSections) {
    for (const row of sec.rows ?? []) {
      draftRowByToken[row.rowToken] = row;
    }
  }

  // Merge evaluated rows with draft info
  const mergedSections = evaluatedSections.map((evalSec: any) => ({
    ...evalSec,
    rows: (evalSec.rows ?? []).map((evalRow: any) => ({
      ...evalRow,
      draftRow: draftRowByToken[evalRow.rowToken] ?? null,
    })),
  }));

  return (
    <div className="flex flex-col w-full">
      {/* Hard errors */}
      {validationErrors.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm mb-4">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Formula errors</p>
            {validationErrors.map((e: any, i: number) => (
              <p key={i} className="text-xs opacity-80">
                {e.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {previewLoading && !preview ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground border rounded-xl bg-card">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Calculating…</span>
        </div>
      ) : mergedSections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border rounded-xl border-dashed">
          <FileText className="w-8 h-8 opacity-30" />
          <p className="text-sm">No sections to fill in.</p>
        </div>
      ) : (
        <div className="border border-border bg-card rounded-xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="flex items-stretch border-b border-border bg-muted/40 h-10">
            {/* SL */}
            <div className="w-10 shrink-0 flex items-center justify-center border-r border-border text-[11px] font-bold text-foreground/50 uppercase tracking-wider">
              SL
            </div>
            {/* Row Label */}
            <div className="flex-1 px-3 flex items-center border-r border-border">
              <span className="text-[11px] font-bold text-foreground/50 uppercase tracking-wider">
                Row Label
              </span>
            </div>
            {/* Value */}
            <div className="w-28 shrink-0 flex items-center justify-end px-2 border-r border-border">
              <span className="text-[11px] font-bold text-foreground/50 uppercase tracking-wider">
                Value
              </span>
            </div>
            {/* Total */}
            <div className="w-28 shrink-0 flex items-center justify-end px-2">
              <span className="text-[11px] font-bold text-foreground/50 uppercase tracking-wider">
                Total
              </span>
            </div>
          </div>

          {/* Sections */}
          {mergedSections.map((sec: any, sIdx: number) => (
            <div key={sec.id} className="border-b last:border-b-0">
              {/* Section header */}
              <div
                className="flex items-center justify-between px-4 py-2 border-b border-border/40"
                style={{ borderLeft: `3px solid hsl(${sIdx * 47 + 140} 70% 55%)` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary">
                    {sec.autoName || String.fromCharCode(65 + sIdx)}
                  </span>
                  {sec.label && (
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {sec.label}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Section total:{" "}
                  <span className="font-semibold">
                    {Number(sec.sectionTotal ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
              </div>

              {/* Rows */}
              {sec.rows?.map((row: any, rIdx: number) => {
                const draftRow = row.draftRow;
                const isFormula = draftRow?.valueType === "formula";
                const notices: any[] = row.notices ?? [];
                const baseVal = Number(row.baseValue ?? 0);
                const totalVal = Number(row.totalValue ?? 0);
                const displayFormula = draftRow?.formula
                  ? decodeFormula(draftRow.formula, draftSections)
                  : null;

                return (
                  <div
                    key={row.rowToken}
                    className={cn(
                      "relative flex items-stretch border-b border-border/30 last:border-0",
                      "hover:bg-muted/5 transition-colors group/row",
                      notices.length > 0 && "bg-accent/[0.03]",
                    )}
                  >
                    {/* Token pill — outside the left border (absolute) */}
                    <div className="absolute right-full top-0 bottom-0 w-32 flex items-center justify-end pr-2 select-none">
                      <span className="font-mono text-xs text-muted-foreground/50 truncate">
                        {row.rowToken}
                      </span>
                    </div>

                    {/* SL */}
                    <div className="w-10 shrink-0 flex items-center justify-center border-r border-border text-xs font-bold text-muted-foreground/50">
                      {rIdx + 1}
                    </div>

                    {/* Label + formula badge */}
                    <div className="flex-1 px-3 py-2 flex items-center gap-2 border-r border-border min-w-0 overflow-hidden">
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{row.label}</span>
                          {notices.length > 0 && <UnresolvedNoticeButton notices={notices} />}
                        </div>
                        {isFormula && displayFormula && (
                          <span className="text-[10px] font-mono text-violet-400/60 truncate">
                            = {displayFormula}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Value cell (base) */}
                    <div
                      className={cn(
                        "w-28 shrink-0 flex items-stretch border-r border-border",
                        !isFormula && "cursor-pointer",
                      )}
                    >
                      <ValueCell
                        rowToken={row.rowToken}
                        currentOverride={overrides[row.rowToken]}
                        currentValue={baseVal}
                        formula={draftRow?.formula}
                        isFormula={isFormula}
                        draftSections={draftSections}
                        onChange={onOverrideChange}
                      />
                    </div>

                    {/* Total cell */}
                    <div className="w-28 shrink-0 flex items-center justify-end px-3">
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          notices.length > 0 ? "text-accent-foreground/80" : "text-foreground",
                        )}
                      >
                        {totalVal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Grand total row */}
          <div className="flex items-stretch border-t-2 border-t-foreground/20 bg-muted/10 h-12">
            <div className="w-10 shrink-0 border-r border-border" />
            <div className="flex-1 px-3 flex items-center justify-end border-r border-border">
              <span className="text-sm font-bold uppercase tracking-wider">Grand Total</span>
            </div>
            <div className="w-28 shrink-0 border-r border-border" />
            <div className="w-28 shrink-0 flex items-center justify-end px-3">
              <span className="text-base font-bold tabular-nums text-primary">
                {grandTotal.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/40 mt-3 text-center">
        Click any value cell to enter or override a value · Formula rows can be overridden too
      </p>
    </div>
  );
}
