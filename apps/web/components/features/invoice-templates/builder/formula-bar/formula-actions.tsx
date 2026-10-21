import { Clipboard, Delete, Eraser, Redo2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 p-2 rounded-md bg-popover border border-border shadow-xl shrink-0 w-48 md:w-52 transition-all duration-150",
        isActive ? "opacity-100" : "hidden opacity-0 pointer-events-none",
      )}
    >
      {/* Numbers & Operators Keypad Grid */}
      <div className="grid grid-cols-4 gap-1">
        {["7", "8", "9", "+"].map((char) => (
          <Button
            key={char}
            variant="ghost"
            size="sm"
            className="h-6 px-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              if (char === "+") {
                window.dispatchEvent(new CustomEvent("insert-token", { detail: "+" }));
              } else {
                onInsertChar(e, char);
              }
            }}
          >
            {char}
          </Button>
        ))}
        {["4", "5", "6", "-"].map((char) => (
          <Button
            key={char}
            variant="ghost"
            size="sm"
            className="h-6 px-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              if (char === "-") {
                window.dispatchEvent(new CustomEvent("insert-token", { detail: "-" }));
              } else {
                onInsertChar(e, char);
              }
            }}
          >
            {char}
          </Button>
        ))}
        {["1", "2", "3", "*"].map((char) => (
          <Button
            key={char}
            variant="ghost"
            size="sm"
            className="h-6 px-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              if (char === "*") {
                window.dispatchEvent(new CustomEvent("insert-token", { detail: "*" }));
              } else {
                onInsertChar(e, char);
              }
            }}
          >
            {char}
          </Button>
        ))}
        {["0", ".", "//", "/"].map((char) => (
          <Button
            key={char}
            variant="ghost"
            size="sm"
            className="h-6 px-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              if (char === "//" || char === "/") {
                window.dispatchEvent(new CustomEvent("insert-token", { detail: char }));
              } else {
                onInsertChar(e, char);
              }
            }}
          >
            {char}
          </Button>
        ))}
        {["(", ")", "%", ","].map((char) => (
          <Button
            key={char}
            variant="ghost"
            size="sm"
            className="h-6 px-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent("insert-token", { detail: char }));
            }}
          >
            {char}
          </Button>
        ))}
      </div>

      {/* Action Tools (Undo, Redo, Paste, Backspace, Delete Word, Clear) */}
      <div className="flex items-center justify-between gap-0.5 pt-1 border-t border-border/40">
        <Button
          variant="ghost"
          size="sm"
          disabled={historyIndex <= 0}
          className="h-6 px-1 flex-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Undo"
          onMouseDown={(e) => {
            e.preventDefault();
            onUndo(e);
          }}
        >
          <Undo2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={historyIndex >= historyLength - 1}
          className="h-6 px-1 flex-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Redo"
          onMouseDown={(e) => {
            e.preventDefault();
            onRedo(e);
          }}
        >
          <Redo2 className="h-3 w-3" />
        </Button>

        <div className="w-[1px] h-3.5 bg-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          disabled={!clipboardToken}
          className="h-6 px-1 flex-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title={clipboardToken ? `Paste "${clipboardToken}"` : "Nothing copied to paste"}
          onMouseDown={(e) => {
            e.preventDefault();
            onPaste(e);
          }}
        >
          <Clipboard className="h-3 w-3" />
        </Button>

        <div className="w-[1px] h-3.5 bg-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 flex-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-destructive transition-colors"
          title="Backspace"
          onMouseDown={(e) => {
            e.preventDefault();
            onBackspace(e);
          }}
        >
          <Delete className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 flex-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-destructive transition-colors"
          title="Delete Token"
          onMouseDown={(e) => {
            e.preventDefault();
            onDeleteWord(e);
          }}
        >
          <Eraser className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 flex-1 flex items-center justify-center rounded bg-card/50 hover:bg-card border border-border/50 text-xs text-muted-foreground hover:text-destructive transition-colors"
          title="Clear Formula"
          onMouseDown={(e) => {
            e.preventDefault();
            onClear(e);
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Math Functions (Always shown) */}
      <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border/40">
        {[
          { label: "min(", title: "Minimum of values: min(a, b, ...)" },
          { label: "max(", title: "Maximum of values: max(a, b, ...)" },
          { label: "round(", title: "Round to decimals: round(value, decimals)" },
          { label: "clamp(", title: "Clamp between min and max: clamp(val, min, max)" },
          { label: "floor(", title: "Floor value: floor(value)" },
          { label: "ceil(", title: "Ceil value: ceil(value)" },
          { label: "abs(", title: "Absolute value: abs(value)" },
        ].map((fn, idx) => (
          <Button
            key={fn.label}
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 px-1.5 flex items-center justify-center rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] font-mono text-amber-500 dark:text-amber-400 font-semibold italic lowercase transition-colors",
              idx === 6 && "col-span-2",
            )}
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
    </div>
  );
}
