"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "./builder-context";

export function SectionViewOptionsPopover({ className }: { className?: string } = {}) {
  const {
    sectionSeparation,
    setSectionSeparation,
    showSectionHeaders,
    setShowSectionHeaders,
    showSectionSubtotals,
    setShowSectionSubtotals,
  } = useBuilderContext();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground border-border select-none",
            className,
          )}
          title="Customize section separation, headers, and subtotals"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">View</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-3 text-xs shadow-xl">
        <div className="flex items-center justify-between pb-1.5 border-b">
          <span className="font-semibold text-foreground text-xs block">Section Presentation</span>
        </div>

        {/* 1. Separation Style */}
        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Separation Style
          </Label>
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-muted/50 rounded-md border text-[11px]">
            <button
              type="button"
              onClick={() => setSectionSeparation("double")}
              className={cn(
                "py-1 px-1 rounded font-medium transition-colors text-center text-[10px]",
                sectionSeparation === "double"
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Double
            </button>
            <button
              type="button"
              onClick={() => setSectionSeparation("step")}
              className={cn(
                "py-1 px-1 rounded font-medium transition-colors text-center text-[10px]",
                sectionSeparation === "step"
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Step
            </button>
            <button
              type="button"
              onClick={() => setSectionSeparation("none")}
              className={cn(
                "py-1 px-1 rounded font-medium transition-colors text-center text-[10px]",
                sectionSeparation === "none"
                  ? "bg-background text-primary shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              None
            </button>
          </div>
        </div>

        {/* 2. Show Section Names */}
        <div className="flex items-center justify-between pt-1 border-t">
          <div className="space-y-0.5">
            <Label htmlFor="toggle-section-names" className="text-xs font-medium cursor-pointer">
              Section Names
            </Label>
            <p className="text-[10px] text-muted-foreground">Display section title bars</p>
          </div>
          <Switch
            id="toggle-section-names"
            checked={showSectionHeaders}
            onCheckedChange={setShowSectionHeaders}
          />
        </div>

        {/* 3. Show Section Subtotals */}
        <div className="flex items-center justify-between pt-1 border-t">
          <div className="space-y-0.5">
            <Label
              htmlFor="toggle-section-subtotals"
              className="text-xs font-medium cursor-pointer"
            >
              Section Subtotals
            </Label>
            <p className="text-[10px] text-muted-foreground">Calculate subtotal per section</p>
          </div>
          <Switch
            id="toggle-section-subtotals"
            checked={showSectionSubtotals}
            onCheckedChange={setShowSectionSubtotals}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
