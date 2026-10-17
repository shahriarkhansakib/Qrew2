import { ChevronDown, Clipboard, Delete, Eraser, Redo2, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OPERATORS } from "../formula-bar-types";

export function FormulaActions({
  isActive,
  historyIndex,
  historyLength,
  clipboardToken,
  onUndo,
  onRedo,
  onPaste,
  onInsertChar,
  onDeleteWord,
  onBackspace,
  onClear,
}: {
  isActive: boolean;
  historyIndex: number;
  historyLength: number;
  clipboardToken: string | null;
  onUndo: (e: React.MouseEvent) => void;
  onRedo: (e: React.MouseEvent) => void;
  onPaste: (e: React.MouseEvent) => void;
  onInsertChar: (e: React.MouseEvent, char: string) => void;
  onDeleteWord: (e: React.MouseEvent) => void;
  onBackspace: (e: React.MouseEvent) => void;
  onClear: (e: React.MouseEvent) => void;
}) {
  const [showFunctions, setShowFunctions] = useState(false);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 mb-1 transition-opacity duration-200",
        isActive ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {/* Row 1: Numbers */}
      <div className="flex flex-wrap items-center gap-1">
        {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "."].map((char) => (
          <Button
            key={char}
            variant="ghost"
            size="sm"
            className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onMouseDown={(e) => onInsertChar(e, char)}
          >
            {char}
          </Button>
        ))}
      </div>

      {/* Row 2: Operators & Actions */}
      <div className="flex flex-wrap items-center gap-1">
        {OPERATORS.map((op) => (
          <Button
            key={op.label}
            variant="ghost"
            size="sm"
            className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            title={op.title}
            onMouseDown={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("insert-token", { detail: op.label }));
            }}
          >
            {op.label}
          </Button>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 flex items-center gap-1 rounded border border-border/50 text-xs font-mono transition-colors",
            showFunctions
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-card/50 hover:bg-card text-muted-foreground hover:text-foreground",
          )}
          title={
            showFunctions
              ? "Hide math functions"
              : "Show math functions (MIN, MAX, ROUND, CLAMP, ABS)"
          }
          onMouseDown={(e) => {
            e.preventDefault();
            setShowFunctions(!showFunctions);
          }}
        >
          <span>Functions</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-200",
              showFunctions && "rotate-180",
            )}
          />
        </Button>

        <div className="w-[1px] h-4 bg-border mx-1 hidden sm:block" />

        <Button
          variant="ghost"
          size="sm"
          disabled={historyIndex <= 0}
          className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Undo"
          onMouseDown={onUndo}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={historyIndex >= historyLength - 1}
          className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Redo"
          onMouseDown={onRedo}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        <div className="w-[1px] h-4 bg-border mx-1 hidden sm:block" />

        <Button
          variant="ghost"
          size="sm"
          disabled={!clipboardToken}
          className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title={clipboardToken ? `Paste "${clipboardToken}"` : "Nothing copied to paste"}
          onMouseDown={onPaste}
        >
          <Clipboard className="h-3.5 w-3.5" />
        </Button>

        <div className="w-[1px] h-4 bg-border mx-1 hidden sm:block" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-destructive transition-colors"
          title="Backspace (character by character)"
          onMouseDown={onBackspace}
        >
          <Delete className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-destructive transition-colors"
          title="Delete Token"
          onMouseDown={onDeleteWord}
        >
          <Eraser className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-destructive transition-colors"
          title="Clear Formula"
          onMouseDown={onClear}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        <span className="text-[10px] text-muted-foreground/30 select-none hidden 2xl:block ml-2">
          type a token name to autocomplete · Tab/Enter to insert
        </span>
      </div>

      {/* Row 3: Collapsible Math Functions */}
      {showFunctions && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {[
            { label: "MIN(", title: "Minimum of values: MIN(a, b, ...)" },
            { label: "MAX(", title: "Maximum of values: MAX(a, b, ...)" },
            { label: "ROUND(", title: "Round to decimals: ROUND(value, decimals)" },
            { label: "CLAMP(", title: "Clamp between min and max: CLAMP(val, min, max)" },
            { label: "ABS(", title: "Absolute value: ABS(value)" },
            { label: ",", title: "Argument separator comma" },
          ].map((fn) => (
            <Button
              key={fn.label}
              variant="ghost"
              size="sm"
              className="h-7 px-2 min-w-[28px] flex items-center justify-center rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-mono text-amber-500 dark:text-amber-400 font-semibold transition-colors"
              title={fn.title}
              onMouseDown={(e) => {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("insert-token", { detail: fn.label }));
              }}
            >
              {fn.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
