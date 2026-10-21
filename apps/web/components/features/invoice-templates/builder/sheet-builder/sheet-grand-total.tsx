"use client";

import { fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "../builder-context";
import { getColumnWidthStyle, TemplateColumnDefinition } from "./types";

interface SheetGrandTotalProps {
  sections: any[];
  columns: TemplateColumnDefinition[];
  zoomLevel?: number;
}

export function SheetGrandTotal({ sections, columns, zoomLevel = 0 }: SheetGrandTotalProps) {
  const { tokenMap } = useBuilderContext();
  const hasTotaledCols = columns.some((c) => c.isTotaled);
  if (!hasTotaledCols) return null;

  const firstTotaledIdx = columns.findIndex((c) => c.isTotaled);
  const labelColIdx = firstTotaledIdx > 0 ? firstTotaledIdx - 1 : 0;

  return (
    <div className="flex items-stretch border border-t-2 border-t-foreground/30 border-border bg-muted/20 h-11 font-bold text-xs select-none">
      {/* Spacer matching grip column */}
      <div className="w-8 shrink-0 border-r border-border bg-muted/10" />

      {/* Dynamic Grand Total Cells */}
      {columns.map((col, idx) => {
        const style = getColumnWidthStyle(col);

        const alignClass =
          col.align === "right"
            ? "justify-end text-right"
            : col.align === "center"
              ? "justify-center text-center"
              : "justify-start text-left";

        if (col.isTotaled) {
          const grandTotal = sections.reduce((acc, sec) => {
            return (
              acc +
              (sec.rows || []).reduce((rowAcc: number, r: any) => {
                const val =
                  tokenMap[r.rowToken] ??
                  r.cellValues?.[col.key] ??
                  r.initialValue ??
                  0;
                return rowAcc + (Number(val) || 0);
              }, 0)
            );
          }, 0);

          return (
            <div
              key={col.id || col.key}
              style={{ ...style, fontSize: 14 + zoomLevel }}
              className={cn(
                "px-3 flex items-center min-w-0 border-r border-border font-mono font-extrabold text-foreground tabular-nums",
                alignClass,
              )}
            >
              {fmt(grandTotal)}
            </div>
          );
        }

        if (idx === labelColIdx) {
          return (
            <div
              key={col.id || col.key}
              style={style}
              className="px-3 flex items-center justify-end min-w-0 border-r border-border uppercase tracking-wider text-xs font-black text-foreground"
            >
              Total
            </div>
          );
        }

        return (
          <div
            key={col.id || col.key}
            style={style}
            className="px-3 flex items-center min-w-0 border-r border-border"
          />
        );
      })}

      {/* Trailing actions spacer matching w-16 row actions */}
      <div className="w-16 shrink-0 border-r-0" />
    </div>
  );
}
