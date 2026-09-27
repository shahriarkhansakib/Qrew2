"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TokenDocItem {
  name: string;
  role: string;
  description: string;
  badgeClass: string;
}

export interface SectionInfoData {
  title?: string;
  description: string;
  prefix: string;
  prefixClass?: string;
  tokens?: TokenDocItem[];
  rules?: string[];
}

export const GLOBAL_CONSTANTS_INFO: SectionInfoData = {
  description: "Organization-wide constants shared across all templates.",
  prefix: "GBL_",
  prefixClass: "text-indigo-400 bg-indigo-500/10",
};

export const TEMPLATE_CONSTANTS_INFO: SectionInfoData = {
  description: "Fixed values defined specifically for this template.",
  prefix: "TPL_",
  prefixClass: "text-blue-400 bg-blue-500/10",
};

export const FILE_DETAILS_INFO: SectionInfoData = {
  description: "Fields pulled from project and file metadata.",
  prefix: "FILE_",
  prefixClass: "text-sky-400 bg-sky-500/10",
};

export const EXPENSE_CATEGORIES_INFO: SectionInfoData = {
  title: "Expense Category Tokens",
  description: "Dynamic expense sums recorded for this project across all categories.",
  prefix: "EXP_<CATEGORY>",
  prefixClass: "text-rose-400 bg-rose-500/10",
  tokens: [
    {
      name: "EXP_TOTAL",
      role: "Total Expenses",
      description: "Sum of all recorded expenses across every category for this project.",
      badgeClass: "text-rose-500 bg-rose-500/15 font-bold",
    },
    {
      name: "<CATEGORY>",
      role: "Category Sum",
      description: "Sum of recorded expenses in this specific category.",
      badgeClass: "text-rose-400 bg-rose-500/10 font-medium",
    },
  ],
  rules: [
    "Values evaluate to 0 in the builder template and resolve live per project at invoice time.",
    "Categories are configured in Customize Fields and cannot be edited in the template builder.",
  ],
};

export const SECTIONS_HEADER_INFO: SectionInfoData = {
  title: "Section Tokens",
  description: "Sections group rows together and summarize their totals.",
  prefix: "SEC_<NAME>",
  prefixClass: "text-primary bg-primary/10",
  tokens: [
    {
      name: "SEC_<NAME>",
      role: "Total",
      description: "Final section total (Base + all section charges).",
      badgeClass: "text-slate-400 bg-slate-500/10 font-bold",
    },
    {
      name: "SEC_<NAME>_BASE",
      role: "Base",
      description: "Sum of all row base values in this section.",
      badgeClass: "text-primary bg-primary/10 font-semibold",
    },
    {
      name: "SEC_<NAME>_CHARGES",
      role: "Charges",
      description: "Sum of all charges applied to this section.",
      badgeClass: "text-orange-400 bg-orange-500/10 font-medium",
    },
  ],
  rules: [
    "Use SEC_<NAME> in formulas to reference the entire section total.",
    "Updates automatically when rows or charges change.",
  ],
};

export const ROW_TOKENS_INFO: SectionInfoData = {
  title: "Row Tokens",
  description: "Every row has 4 tokens separating base cost from rate charges.",
  prefix: "<ROW_TOKEN>",
  prefixClass: "text-violet-400 bg-violet-500/10",
  tokens: [
    {
      name: "<ROW_TOKEN>",
      role: "Total (Main)",
      description: "Row Base + all charges. Default token at the top.",
      badgeClass: "text-slate-400 bg-slate-500/10 font-bold",
    },
    {
      name: "<ROW_TOKEN>_BASE",
      role: "Base",
      description: "Raw value before charges. Used in charge formulas.",
      badgeClass: "text-violet-400 bg-violet-500/10 font-semibold",
    },
    {
      name: "<ROW_TOKEN>_<CHARGE>",
      role: "Line Charge",
      description: "Single charge line (calculated as Base × Rate%).",
      badgeClass: "text-accent-foreground/80 bg-accent/10",
    },
    {
      name: "<ROW_TOKEN>_CHARGES",
      role: "Charges Sum",
      description: "Total of all charges added to this row.",
      badgeClass: "text-accent-foreground bg-accent/10 font-medium",
    },
  ],
  rules: [
    "Charges strictly calculate on _BASE.",
    "Use <ROW_TOKEN> in formulas for the complete row total.",
  ],
};

export function SectionInfoPopover({
  info,
  buttonClassName,
  align = "start",
  side = "bottom",
}: {
  info: SectionInfoData;
  buttonClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  const isDetailed = !!info.tokens && info.tokens.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center p-0.5 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer",
            buttonClassName,
          )}
          title={info.title || "Token info"}
          aria-label={info.title || "Token info"}
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={6}
        className={cn(
          "shadow-2xl border border-border bg-card/95 backdrop-blur-md rounded-lg z-50",
          isDetailed
            ? "w-72 p-3 space-y-2.5 max-h-[85vh] overflow-y-auto"
            : "w-56 p-2.5 space-y-1.5",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {info.title && (
          <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
            <h4 className="font-bold text-foreground text-xs uppercase tracking-wide">
              {info.title}
            </h4>
          </div>
        )}

        <p className="text-muted-foreground text-xs leading-relaxed">{info.description}</p>

        <div className="flex items-center gap-1.5 pt-1 border-t border-border/30 text-xs">
          <span className="text-muted-foreground/70 font-medium">Prefix:</span>
          <code
            className={cn(
              "font-mono text-xs px-1.5 py-0.5 rounded font-bold",
              info.prefixClass || "text-primary bg-primary/10",
            )}
          >
            {info.prefix}
          </code>
        </div>

        {/* Detailed token breakdown */}
        {isDetailed && (
          <div className="space-y-1.5 pt-1 border-t border-border/30">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
              Tokens:
            </div>
            <div className="space-y-1.5">
              {info.tokens!.map((t) => (
                <div
                  key={t.name}
                  className="flex flex-col gap-0.5 py-1 border-b border-border/15 last:border-0"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        "text-xs font-mono px-1.5 py-0.5 rounded w-fit font-medium",
                        t.badgeClass,
                      )}
                    >
                      {t.name}
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">{t.role}</span>
                  </div>
                  <span className="text-xs text-muted-foreground leading-snug pl-0.5">
                    {t.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rules */}
        {info.rules && info.rules.length > 0 && (
          <div className="space-y-1 pt-1.5 border-t border-border/30">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
              Key Rules:
            </div>
            <ul className="space-y-1 pl-3.5 list-disc text-xs text-muted-foreground">
              {info.rules.map((r, idx) => (
                <li key={idx} className="leading-snug">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
