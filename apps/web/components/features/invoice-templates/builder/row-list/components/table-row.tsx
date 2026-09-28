import { AlertTriangle, Edit2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "../../builder-context";
import { SyntaxOverlay } from "../../formula-bar-syntax";

export function ClickableCell({
  onClick,
  isSelected,
  children,
  className,
}: {
  onClick?: () => void;
  isSelected?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!onClick) {
    return (
      <div
        className={cn("w-full h-full flex items-center justify-end", className)}
        title="Not editable"
      >
        {children}
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      className={cn(
        "w-full h-full flex items-center justify-end",
        "cursor-pointer rounded-sm transition-all duration-100",
        "hover:ring-1 hover:ring-primary/30 hover:bg-primary/5",
        isSelected && "ring-2 ring-primary/60 bg-primary/8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function RowFormulaBadge({
  formula,
  zoomLevel = 0,
  onClickFormula,
  getTokenColor,
}: {
  formula: string;
  zoomLevel?: number;
  onClickFormula?: () => void;
  getTokenColor: (token: string) => string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(() => formula.length > 20);

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth + 1);
      }
    };
    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, []);

  const shouldExpand = isHovered && isTruncated;

  return (
    <div
      className={cn(
        "relative select-none shrink-0 h-full flex items-center",
        onClickFormula ? "cursor-pointer" : "pointer-events-none",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClickFormula}
    >
      {/* ── Base / Compact Formula Pill (Always in DOM for measurement, hidden when expanded) ── */}
      <div
        className={cn(
          "font-mono font-semibold leading-none px-2.5 py-1.5 rounded-md transition-colors inline-flex relative max-w-[12rem] border shadow-sm overflow-hidden",
          onClickFormula
            ? "bg-background border-primary/20 hover:border-primary/40"
            : "bg-muted/40 border-transparent",
          shouldExpand && "invisible",
        )}
        style={{ fontSize: 12 + zoomLevel }}
      >
        <span ref={textRef} className="truncate flex items-center whitespace-pre">
          <SyntaxOverlay value={formula} getTokenColor={getTokenColor} />
        </span>
      </div>

      {/* ── Expanded Formula Overlay (Grows leftwards overlapping table, and downwards over next row if multi-line) ── */}
      {shouldExpand && (
        <div
          className={cn(
            "absolute right-0 top-1 z-50 font-mono font-semibold rounded-md border shadow-2xl transition-all duration-150",
            "w-max max-w-xl 2xl:max-w-2xl px-3 py-1.5",
            "bg-background/98 backdrop-blur-md border-primary/40 text-foreground",
            "whitespace-pre-wrap break-words leading-relaxed",
          )}
          style={{ fontSize: 12 + zoomLevel }}
        >
          <SyntaxOverlay value={formula} getTokenColor={getTokenColor} />
        </div>
      )}
    </div>
  );
}

export function TableRow({
  token,
  sl,
  labelContent,
  usd1,
  usd2,
  formula,
  className,
  actions,
  mobileActions,
  style,
  onClickUsd1,
  onClickUsd2,
  onClickFormula,
  isUsd1Selected,
  isUsd2Selected,
  notices,
  zoomLevel = 0,
  onEditToken,
}: {
  token?: string;
  sl?: React.ReactNode;
  labelContent: React.ReactNode;
  usd1?: React.ReactNode;
  usd2?: React.ReactNode;
  formula?: string;
  className?: string;
  actions?: React.ReactNode;
  mobileActions?: React.ReactNode;
  style?: React.CSSProperties;
  onClickUsd1?: () => void;
  onClickUsd2?: () => void;
  onClickFormula?: () => void;
  isUsd1Selected?: boolean;
  isUsd2Selected?: boolean;
  notices?: any[];
  zoomLevel?: number;
  onEditToken?: () => void;
}) {
  const {
    selectedCell,
    setClipboardToken,
    getTokenColor,
    invalidTokens,
    hiddenTokens,
    getTokenDisabledReason,
  } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const isInvalid = token ? invalidTokens.has(token) : false;
  const isHidden = token ? hiddenTokens.has(token) : false;
  const isDisabled = isFormulaMode && (isInvalid || isHidden);
  const disabledReason =
    token && isDisabled
      ? getTokenDisabledReason(token) ||
        (isInvalid ? "Creates circular dependency" : "Not allowed in this cell")
      : undefined;

  const handleTokenClick = (e: React.MouseEvent, clickedToken: string) => {
    e.stopPropagation();
    if (isFormulaMode) {
      if (isInvalid || isHidden) {
        toast.error(`Cannot insert: ${disabledReason || `"${clickedToken}" is not allowed.`}`);
        return;
      }
      window.dispatchEvent(new CustomEvent("insert-token", { detail: clickedToken }));
    } else {
      navigator.clipboard.writeText(clickedToken);
      setClipboardToken(clickedToken);
      toast.success(`Copied "${clickedToken}" to clipboard`);
    }
  };

  return (
    <div
      className={cn(
        "relative flex items-stretch border-b border-border group/row hover:z-[60]",
        "hover:bg-muted/5 transition-colors bg-background",
        notices && notices.length > 0 && "bg-accent/[0.03] hover:bg-accent/[0.06]",
        className,
      )}
      style={style}
    >
      {token && (
        <div
          className={cn(
            "absolute right-full top-0 bottom-0 w-36 min-w-[9rem] hover:w-auto flex items-center justify-end pr-3 select-none transition-colors insertable-token",
            "z-10 hover:z-50 hover:pl-4 rounded-l-md group/token",
            isDisabled
              ? "opacity-35 cursor-not-allowed bg-muted/10 hover:bg-muted/10"
              : isFormulaMode
                ? "cursor-pointer hover:bg-primary/5 hover:border-primary/20"
                : "cursor-pointer hover:bg-muted hover:shadow-sm",
          )}
          onClick={(e) => handleTokenClick(e, token)}
          title={
            isDisabled
              ? disabledReason?.startsWith("Disabled:")
                ? disabledReason
                : `Disabled: ${disabledReason}`
              : isFormulaMode
                ? "Insert into formula"
                : "Copy token"
          }
        >
          <div className="flex items-center gap-1.5">
            {isInvalid && (
              <span
                className="text-accent-foreground flex items-center text-[10px] font-sans font-medium shrink-0"
                title={disabledReason || "Creates circular dependency"}
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-0.5 shrink-0" />
              </span>
            )}
            {onEditToken && !isFormulaMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover/token:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditToken();
                }}
                title="Edit Token"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
            <span
              className={cn(
                "font-mono font-semibold truncate leading-none",
                isInvalid ? "text-muted-foreground/70 line-through" : getTokenColor(token),
              )}
              style={{ fontSize: 12 + zoomLevel }}
            >
              {token}
            </span>
          </div>
        </div>
      )}

      <div className="absolute left-full top-0 bottom-0 flex items-center pl-3 gap-2 z-20">
        {formula && (
          <RowFormulaBadge
            formula={formula}
            zoomLevel={zoomLevel}
            onClickFormula={onClickFormula}
            getTokenColor={getTokenColor}
          />
        )}
      </div>

      <div
        className={cn(
          "w-10 shrink-0 flex items-center justify-center border-r border-border font-bold transition-colors select-none",
          token
            ? isFormulaMode
              ? "cursor-pointer text-primary hover:bg-primary/10"
              : "cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/10"
            : "text-muted-foreground",
        )}
        onClick={(e) => token && handleTokenClick(e, token)}
        title={token ? (isFormulaMode ? "Insert into formula" : "Copy token") : undefined}
        style={{ fontSize: 14 + zoomLevel }}
      >
        {sl}
      </div>

      <div
        className="flex-1 px-3 py-1.5 flex items-center justify-between gap-2 border-r border-border min-w-0 overflow-hidden font-medium relative"
        style={{ fontSize: 14 + zoomLevel }}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">{labelContent}</div>

        {actions && !isFormulaMode && (
          <div className="hidden md:flex absolute right-0 top-0 bottom-0 items-center opacity-0 group-hover/row:opacity-100 transition-opacity z-10 bg-gradient-to-l from-background via-background/90 to-transparent pl-12 pr-2">
            <div className="relative flex items-center gap-0.5 bg-background rounded-md shadow-sm border border-border/50 px-0.5 py-0.5">
              {actions}
            </div>
          </div>
        )}

        {mobileActions && !isFormulaMode && (
          <div className="md:hidden shrink-0 flex items-center ml-1 relative z-10">
            {mobileActions}
          </div>
        )}
      </div>

      <div
        className={cn(
          "w-20 shrink-0 flex items-center justify-end border-r border-border",
          "font-bold text-foreground tabular-nums",
          onClickUsd1 ? "p-1" : "px-2 py-1",
        )}
        style={{ fontSize: 16 + zoomLevel }}
      >
        <ClickableCell onClick={onClickUsd1} isSelected={isUsd1Selected} className="px-2">
          {usd1 ??
            (onClickUsd1 ? (
              <span className="text-muted-foreground/30 text-sm select-none">—</span>
            ) : (
              <span className="text-muted-foreground/30 text-[10px] uppercase tracking-wider select-none">
                Not editable
              </span>
            ))}
        </ClickableCell>
      </div>

      <div
        className={cn(
          "w-20 shrink-0 flex items-center justify-end",
          "font-bold text-foreground tabular-nums",
          onClickUsd2 ? "p-1" : "px-2 py-1",
        )}
        style={{ fontSize: 16 + zoomLevel }}
      >
        <ClickableCell onClick={onClickUsd2} isSelected={isUsd2Selected} className="px-2">
          {usd2 ??
            (onClickUsd2 ? (
              <span className="text-muted-foreground/30 text-sm select-none">—</span>
            ) : (
              <span className="text-muted-foreground/30 text-[10px] uppercase tracking-wider select-none">
                Not editable
              </span>
            ))}
        </ClickableCell>
      </div>
    </div>
  );
}
