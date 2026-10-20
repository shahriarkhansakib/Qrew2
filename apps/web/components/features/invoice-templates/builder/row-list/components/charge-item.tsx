import { useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decodeFormula } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "../../builder-context";
import { MobileRowActions } from "./row-context-menu";
import { TableRow } from "./table-row";

export type SectionColor = { border: string; bg: string };

export function ChargeLabelCell({
  charge,
  rowId,
  sectionId,
  zoomLevel = 0,
  isEditing,
  onEditingChange,
}: {
  charge: any;
  rowId: string;
  sectionId: string;
  zoomLevel?: number;
  isEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [internalEditing, setInternalEditing] = useState(false);
  const editing = isEditing !== undefined ? isEditing : internalEditing;
  const setEditing = useCallback(
    (val: boolean) => {
      if (onEditingChange) onEditingChange(val);
      else setInternalEditing(val);
    },
    [onEditingChange],
  );
  const [draft, setDraft] = useState(charge.label);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { apiBasePath, invalidateKey } = useBuilderContext();

  useEffect(() => {
    if (!editing) setDraft(charge.label);
  }, [charge.label, editing]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed === charge.label || !trimmed) return;
    try {
      const res = await fetch(
        `${apiBasePath}/sections/${sectionId}/rows/${rowId}/charges/${charge.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ label: trimmed }),
        },
      );
      if (!res.ok) throw new Error("Failed to save charge label");
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    } catch {
      toast.error("Failed to save charge label");
    }
  }, [draft, charge, rowId, sectionId, apiBasePath, queryClient, invalidateKey, setEditing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            setDraft(charge.label);
            setEditing(false);
          }
        }}
        className={cn(
          "w-full bg-transparent border-none outline-none focus:outline-none text-right",
          "font-medium text-foreground/80 leading-snug caret-primary",
        )}
        style={{ fontSize: 14 + zoomLevel }}
        placeholder="Enter label…"
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      className="font-medium text-foreground/80 leading-snug hover:text-foreground cursor-text"
      style={{ fontSize: 14 + zoomLevel }}
    >
      {draft || "Click to label…"}
    </span>
  );
}

export function RowChargeLine({
  charge,
  sectionColor,
  chargeValue,
  rowTotal,
  onEditCharge,
  onDeleteCharge,
  rowId,
  sectionId,
  allSections,
  onClickUsd1,
  isUsd1Selected,
  zoomLevel = 0,
}: {
  charge: any;
  sectionColor?: SectionColor;
  chargeValue?: string;
  rowTotal?: string;
  onEditCharge?: () => void;
  onDeleteCharge?: () => void;
  rowId?: string;
  sectionId?: string;
  allSections?: any[];
  onClickUsd1?: () => void;
  isUsd1Selected?: boolean;
  zoomLevel?: number;
}) {
  const { templateConstants, headerFields } = useBuilderContext();
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const canEditLabel = Boolean(rowId && sectionId);

  return (
    <TableRow
      token={charge.chargeToken}
      onEditToken={onEditCharge}
      formula={
        allSections && charge.formula
          ? decodeFormula(charge.formula, allSections, templateConstants, headerFields)
          : charge.formula
      }
      zoomLevel={zoomLevel}
      onClickUsd1={onClickUsd1}
      onClickFormula={onClickUsd1}
      isUsd1Selected={isUsd1Selected}
      onClickLabel={canEditLabel ? () => setIsEditingLabel(true) : undefined}
      style={
        sectionColor
          ? {
              backgroundColor: sectionColor.bg,
              borderLeftColor: sectionColor.border,
              borderLeftWidth: 2,
            }
          : undefined
      }
      actions={
        onEditCharge || onDeleteCharge ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onEditCharge}
              title="Edit row charge"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onDeleteCharge}
              title="Delete charge"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : undefined
      }
      mobileActions={
        onEditCharge || onDeleteCharge ? (
          <MobileRowActions onEdit={onEditCharge} onDelete={onDeleteCharge} isCharge />
        ) : undefined
      }
      labelContent={
        <div className="flex items-center justify-end gap-1 w-full text-right pr-1">
          {rowId && sectionId ? (
            <ChargeLabelCell
              charge={charge}
              rowId={rowId}
              sectionId={sectionId}
              zoomLevel={zoomLevel}
              isEditing={isEditingLabel}
              onEditingChange={setIsEditingLabel}
            />
          ) : (
            <span
              className="text-foreground/60 italic leading-snug"
              style={{ fontSize: 14 + zoomLevel }}
            >
              {charge.label}
            </span>
          )}
        </div>
      }
      usd1={chargeValue ? <span>{chargeValue}</span> : undefined}
      usd2={rowTotal ? <span>{rowTotal}</span> : undefined}
    />
  );
}
