"use client";

import { AlertTriangle, FileText, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Yellow exclamation button that reveals UNRESOLVED_REFERENCE notices in a popover. */
function UnresolvedNoticeButton({ notices }: { notices: any[] }) {
  const [open, setOpen] = useState(false);
  if (!notices || notices.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 hover:bg-accent/30 border border-amber-500/40 transition-colors ml-1.5 shrink-0"
          title="This row has unresolved token references"
          onClick={() => setOpen((v) => !v)}
        >
          <TriangleAlert className="w-3 h-3 text-accent-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3 bg-popover border border-amber-500/30 shadow-xl"
      >
        <div className="flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 text-accent-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-accent-foreground mb-1.5">
              Unresolved Token References
            </p>
            <p className="text-[11px] text-muted-foreground mb-2">
              The following tokens were not yet defined when this row was evaluated. They were
              treated as <span className="font-mono text-accent-foreground">0</span> for the
              calculation.
            </p>
            <ul className="space-y-1">
              {notices.map((n: any, i: number) => (
                <li
                  key={i}
                  className="text-[11px] font-mono text-foreground/80 bg-muted/40 rounded px-2 py-1"
                >
                  <span className="text-accent-foreground">{n.token || "?"}</span>
                  {n.message ? (
                    <span className="text-muted-foreground ml-1">— {n.message}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InvoiceTablePreview({
  previewLoading,
  preview,
  sections,
  grandTotal,
  validationErrors = [],
}: {
  previewLoading: boolean;
  preview: any;
  sections: any[];
  grandTotal: number;
  validationErrors?: any[];
}) {
  // Separate hard errors from soft notices
  const hardErrors = validationErrors.filter((e: any) => e.code !== "UNRESOLVED_REFERENCE");

  return (
    <>
      {/* Hard validation errors */}
      {hardErrors.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm mb-6">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Formula errors</p>
            {hardErrors.map((e: any, i: number) => (
              <p key={i} className="text-xs opacity-80">
                {e.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Invoice table preview */}
      {previewLoading && !preview ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground border rounded-xl bg-card">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Calculating preview...</span>
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border rounded-xl border-dashed">
          <FileText className="w-8 h-8 opacity-30" />
          <p className="text-sm">No sections found. Add sections to see preview.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_8rem_8rem] gap-0 border-b bg-muted/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>SL</span>
            <span>Description</span>
            <span className="text-right">Base</span>
            <span className="text-right">Amount</span>
          </div>

          {/* Sections */}
          {sections.map((section: any, sIdx: number) => (
            <div key={section.id} className="border-b last:border-b-0">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary">
                    {section.autoName || String.fromCharCode(65 + sIdx)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {section.label || ""}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Section total:{" "}
                  <span className="font-semibold">
                    {Number(section.sectionTotal ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </span>
              </div>

              {/* Rows */}
              {section.rows?.map((row: any, rIdx: number) => {
                const effectiveValue = Number(row.totalValue ?? 0);
                const baseVal = Number(row.baseValue ?? 0);
                const rowNotices: any[] = row.notices ?? [];

                return (
                  <div key={row.rowToken}>
                    <div
                      className={cn(
                        "grid gap-0 px-4 py-3 border-b border-border/30 last:border-0 transition-colors grid-cols-[2rem_1fr_8rem_8rem]",
                        rowNotices.length > 0 && "bg-accent/[0.03]",
                      )}
                    >
                      <span className="text-xs text-muted-foreground/60 font-mono self-center">
                        {rIdx + 1}
                      </span>

                      <div className="flex flex-col gap-0.5 self-center">
                        <div className="flex items-center gap-0">
                          <span className="text-sm font-medium">{row.label}</span>
                          {rowNotices.length > 0 && <UnresolvedNoticeButton notices={rowNotices} />}
                        </div>
                        {row.sectionToken && (
                          <span className="text-[10px] font-mono text-muted-foreground/40">
                            {row.rowToken}
                          </span>
                        )}
                      </div>

                      <div className="text-right self-center text-muted-foreground text-xs pr-4">
                        <span className="tabular-nums">
                          {baseVal !== effectiveValue
                            ? baseVal.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })
                            : "-"}
                        </span>
                      </div>

                      <div className="text-right self-center">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            rowNotices.length > 0 && "text-accent-foreground/80",
                          )}
                        >
                          {effectiveValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Grand total footer */}
          <div className="bg-primary/5 border-t p-4 flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-sm">Grand Total</span>
            <span className="text-lg font-bold tabular-nums">
              {grandTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
