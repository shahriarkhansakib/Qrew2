"use client";

import { AlertTriangle, BookmarkPlus, Edit2, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/constants";
import { decodeFormula, fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { cellFromRow, useBuilderContext } from "../builder-context";
import { RowFormulaBadge } from "../row-list/components/table-row";
import { getColumnWidthStyle, TemplateColumnDefinition } from "./types";

interface SheetTableRowProps {
  row: any;
  rowIndex: number;
  globalSl: number;
  columns: TemplateColumnDefinition[];
  templateId?: string;
  draftId?: string;
  sectionId: string;
  allSections?: any[];
  onDelete: () => void;
  onEdit?: () => void;
  onMoveToAdditionalLineItems?: () => void;
  dragHandleProps?: any;
  zoomLevel?: number;
  onRowUpdated?: (updatedRow: any) => void;
}

export function SheetTableRow({
  row,
  rowIndex,
  globalSl,
  columns,
  templateId,
  draftId: _draftId,
  sectionId,
  allSections = [],
  onDelete,
  onEdit,
  onMoveToAdditionalLineItems,
  dragHandleProps,
  zoomLevel = 0,
  onRowUpdated,
}: SheetTableRowProps) {
  const {
    selectedCell,
    setSelectedCell,
    tokenMap,
    getTokenColor,
    mode,
    setClipboardToken,
    invalidTokens,
    hiddenTokens,
    getTokenDisabledReason,
    headerFields,
    apiBasePath,
  } = useBuilderContext();

  const isFormulaMode = !!selectedCell;
  const isFillMode = mode === "fill";
  const isPdfMode = mode === "preview";

  const token = row.rowToken;
  const isInvalid = token ? invalidTokens.has(token) : false;
  const isHidden = token ? hiddenTokens.has(token) : false;
  const isDisabled = isFillMode ? false : isFormulaMode && (isInvalid || isHidden);
  const disabledReason =
    token && isDisabled
      ? getTokenDisabledReason(token) ||
        (isInvalid ? "Creates circular dependency" : "Not allowed in this cell")
      : undefined;

  // Local cellValues state for smooth typing without lag
  const [localValues, setLocalValues] = useState<Record<string, any>>(() => {
    return {
      ...(row.cellValues || {}),
      label: row.label || row.cellValues?.label || "",
      description: row.description || row.cellValues?.description || "",
    };
  });

  useEffect(() => {
    setLocalValues({
      ...(row.cellValues || {}),
      label: row.label || row.cellValues?.label || "",
      description: row.description || row.cellValues?.description || "",
    });
  }, [row.cellValues, row.label, row.description]);

  const handleTokenClick = (e: React.MouseEvent, clickedToken: string) => {
    e.stopPropagation();
    if (isFillMode || isPdfMode) return;
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

  const saveCell = useCallback(
    async (colKey: string, newValue: any, dataType: string) => {
      const updatedValues = {
        ...localValues,
        [colKey]: newValue,
      };

      setLocalValues(updatedValues);

      const payload: Record<string, any> = {
        cellValues: updatedValues,
      };

      // If the column key represents label or description, sync to top-level row fields as well
      if (colKey === "col_desc" || colKey === "description" || colKey === "label") {
        payload.label = String(newValue ?? "");
      }

      // If numeric, also update initialValue for calculation parity
      if (dataType === "number") {
        payload.initialValue = Number(newValue) || 0;
      }

      try {
        const basePath =
          apiBasePath || (templateId ? `${apiUrl}/api/invoice-templates/${templateId}` : "");
        const res = await fetch(`${basePath}/sections/${sectionId}/rows/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error("Failed to save row changes");
        }

        const data = await res.json();
        if (onRowUpdated) onRowUpdated(data);
      } catch (err: any) {
        console.error("Save cell error:", err);
        toast.error("Failed to save changes");
      }
    },
    [localValues, templateId, sectionId, row.id, onRowUpdated],
  );

  return (
    <div className="relative flex items-stretch border-b border-border bg-background hover:bg-muted/10 transition-colors group/row w-full min-w-fit">
      {/* ── Token badge (absolute to the left of the table row, matching standard templates) ── */}
      {token && !isPdfMode && (
        <div
          className={cn(
            "absolute right-full top-0 bottom-0 w-20 min-w-[5rem] flex items-center justify-end pr-2 select-none transition-all duration-150 insertable-token",
            "z-10 hover:z-50 rounded-l-md group/token",
            "hover:w-max hover:max-w-md hover:bg-background/95 hover:backdrop-blur-sm hover:shadow-md hover:border hover:border-primary/20 hover:px-2.5",
            isDisabled
              ? "opacity-35 cursor-not-allowed bg-muted/10 hover:bg-muted/10"
              : isFillMode
                ? "cursor-default"
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
              : isFillMode
                ? undefined
                : isFormulaMode
                  ? "Insert into formula"
                  : "Copy token"
          }
        >
          <div className="flex items-center gap-1.5">
            {onEdit && !isFormulaMode && !isFillMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover/token:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                title="Edit row token"
              >
                <Pencil className="w-3 h-3" />
              </Button>
            )}
            <span
              className={cn(
                "font-mono text-xs font-semibold truncate transition-colors",
                isDisabled ? "text-muted-foreground" : "text-foreground",
              )}
              style={!isDisabled ? { color: getTokenColor(token) } : undefined}
            >
              {token}
            </span>
          </div>
        </div>
      )}

      {/* 1. Grip handle on the left */}
      <div
        {...dragHandleProps}
        className="w-8 shrink-0 border-r border-border flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/30 group-hover/row:text-muted-foreground/80 hover:bg-muted/30 transition-colors select-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {/* 2. Dynamic Cells */}
      {columns.map((col) => {
        const style = getColumnWidthStyle(col);

        const alignClass =
          col.align === "right"
            ? "justify-end text-right"
            : col.align === "center"
              ? "justify-center text-center"
              : "justify-start text-left";

        const rawValue =
          localValues[col.key] !== undefined
            ? localValues[col.key]
            : col.dataType === "number" && row.initialValue !== undefined
              ? row.initialValue
              : "";

        if (col.dataType === "serial") {
          return (
            <div
              key={col.id || col.key}
              style={style}
              className={cn(
                "px-3 py-1 flex items-center min-w-0 border-r border-border",
                alignClass,
              )}
            >
              <span className="font-mono text-xs font-semibold text-muted-foreground/70 select-none">
                {globalSl}
              </span>
            </div>
          );
        }

        if (col.dataType === "date") {
          return (
            <div
              key={col.id || col.key}
              style={style}
              className={cn(
                "px-3 py-1 flex items-center min-w-0 border-r border-border",
                alignClass,
              )}
            >
              <input
                type="date"
                value={rawValue ? String(rawValue).slice(0, 10) : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalValues((prev) => ({ ...prev, [col.key]: val }));
                  saveCell(col.key, val, "date");
                }}
                className="w-full bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer focus:bg-primary/5 rounded px-1"
                style={{ fontSize: 13 + zoomLevel }}
              />
            </div>
          );
        }

        if (col.dataType === "select" && col.options && col.options.length > 0) {
          return (
            <div
              key={col.id || col.key}
              style={style}
              className={cn(
                "px-3 py-1 flex items-center min-w-0 border-r border-border",
                alignClass,
              )}
            >
              <select
                value={rawValue || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalValues((prev) => ({ ...prev, [col.key]: val }));
                  saveCell(col.key, val, "select");
                }}
                className="w-full bg-transparent text-xs font-medium text-foreground outline-none cursor-pointer focus:bg-primary/5 rounded px-1"
                style={{ fontSize: 13 + zoomLevel }}
              >
                <option value="" className="bg-background text-muted-foreground">
                  -- Select --
                </option>
                {col.options.map((opt) => (
                  <option key={opt} value={opt} className="bg-background text-foreground">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (col.dataType === "number") {
          const isSelected = selectedCell?.rowId === row.id && selectedCell?.columnKey === col.key;
          const isFormula = row.valueType === "formula";
          const decodedFormula = isFormula
            ? decodeFormula(row.formula, allSections, undefined, headerFields)
            : undefined;
          const computedVal =
            tokenMap[row.rowToken] ??
            (rawValue !== "" ? Number(rawValue) : (row.initialValue ?? 0));

          const handleCellClick = () => {
            if (isPdfMode) return;
            setSelectedCell(
              cellFromRow({
                templateId,
                sectionId,
                row,
                decodedFormula,
                columnKey: col.key,
                columnLabel: col.label,
              }),
            );
          };

          return (
            <div
              key={col.id || col.key}
              style={style}
              className={cn(
                "px-2 py-1 flex items-center min-w-0 border-r border-border transition-colors",
                alignClass,
              )}
            >
              {isFormula ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleCellClick}
                  className={cn(
                    "w-full h-full flex items-center justify-end gap-1.5 cursor-pointer rounded px-1 transition-colors select-none",
                    "hover:bg-primary/5",
                    isSelected && "ring-2 ring-primary/60 bg-primary/8",
                  )}
                  title="Click to edit formula"
                >
                  <RowFormulaBadge
                    formula={decodedFormula || row.formula || ""}
                    zoomLevel={zoomLevel}
                    onClickFormula={handleCellClick}
                    getTokenColor={getTokenColor}
                  />
                  <span
                    className="font-mono text-xs font-bold tabular-nums text-foreground/90 truncate"
                    style={{ fontSize: 13 + zoomLevel }}
                  >
                    {fmt(computedVal)}
                  </span>
                </div>
              ) : (
                <div
                  className={cn(
                    "w-full flex items-center rounded transition-colors",
                    isSelected && "ring-2 ring-primary/60 bg-primary/8",
                  )}
                  onClick={() => {
                    if (!isSelected && !isPdfMode) {
                      handleCellClick();
                    }
                  }}
                >
                  <NumberCellInput
                    value={rawValue}
                    zoomLevel={zoomLevel}
                    onSave={(val) => saveCell(col.key, val, "number")}
                  />
                </div>
              )}
            </div>
          );
        }

        // Default: text column
        return (
          <div
            key={col.id || col.key}
            style={style}
            className={cn("px-3 py-1 flex items-center min-w-0 border-r border-border", alignClass)}
          >
            <TextCellInput
              value={rawValue}
              zoomLevel={zoomLevel}
              placeholder={`Enter ${col.label.toLowerCase()}…`}
              onSave={(val) => saveCell(col.key, val, "text")}
            />
          </div>
        );
      })}

      {/* 3. Row Actions (Action buttons on hover matching standard templates) */}
      <div className="w-16 shrink-0 flex items-center justify-center gap-0.5 px-1">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="h-6 w-6 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover/row:opacity-100 transition-opacity"
            title="Edit row token & details"
          >
            <Edit2 className="h-3 w-3" />
          </Button>
        )}
        {onMoveToAdditionalLineItems && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoveToAdditionalLineItems}
            className="h-6 w-6 text-muted-foreground/40 hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity"
            title="Move to Additional Line Items"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="h-6 w-6 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity"
          title="Delete row"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Inline Text Cell ─────────────────────────────────────────────────────────
function TextCellInput({
  value,
  zoomLevel = 0,
  placeholder,
  onSave,
}: {
  value: any;
  zoomLevel?: number;
  placeholder?: string;
  onSave: (val: string) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    if (draft !== String(value ?? "")) {
      onSave(draft);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      onFocus={() => setIsEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={cn(
        "w-full bg-transparent border-none outline-none text-xs font-medium text-foreground placeholder:text-muted-foreground/40 rounded px-1 transition-colors",
        isEditing && "bg-primary/5 ring-1 ring-primary/30",
      )}
      style={{ fontSize: 13 + zoomLevel }}
    />
  );
}

// ─── Inline Number Cell ───────────────────────────────────────────────────────
function NumberCellInput({
  value,
  zoomLevel = 0,
  onSave,
}: {
  value: any;
  zoomLevel?: number;
  onSave: (val: number) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(value != null && value !== "" ? String(value) : "");

  useEffect(() => {
    if (!isFocused) {
      setDraft(value != null && value !== "" ? String(value) : "");
    }
  }, [value, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const num = parseFloat(draft);
    const validNum = isNaN(num) ? 0 : num;
    if (validNum !== Number(value || 0)) {
      onSave(validNum);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  if (!isFocused) {
    const num = parseFloat(String(value));
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsFocused(true)}
        onKeyDown={(e) => e.key === "Enter" && setIsFocused(true)}
        className="w-full text-right font-mono text-xs font-semibold tabular-nums text-foreground/90 cursor-text py-0.5 px-1 hover:bg-primary/5 rounded select-none truncate"
        style={{ fontSize: 13 + zoomLevel }}
      >
        {isNaN(num) || value == null || value === "" ? (
          <span className="text-muted-foreground/30 font-normal">0.00</span>
        ) : (
          fmt(num)
        )}
      </div>
    );
  }

  return (
    <input
      type="number"
      step="any"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full text-right font-mono text-xs font-bold tabular-nums text-foreground bg-primary/5 ring-1 ring-primary/40 rounded px-1 py-0.5 outline-none"
      style={{ fontSize: 13 + zoomLevel }}
    />
  );
}
