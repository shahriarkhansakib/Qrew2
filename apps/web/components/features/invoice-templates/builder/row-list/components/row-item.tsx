import { useQueryClient } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { decodeFormula, fmt, TokenMap } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { cellFromRow, cellFromRowCharge, useBuilderContext } from "../../builder-context";
import { RowChargeLine } from "./charge-item";
import { MobileRowActions, RowActions, UnresolvedNoticeButton } from "./row-context-menu";
import { TableRow } from "./table-row";

export type SectionColor = { border: string; bg: string };

export function LabelCell({
  rowId,
  templateId,
  sectionId,
  value,
  zoomLevel = 0,
}: {
  rowId: string;
  templateId: string;
  sectionId: string;
  value: string;
  zoomLevel?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { apiBasePath, invalidateKey } = useBuilderContext();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed === value) return;
    try {
      const res = await fetch(`${apiBasePath}/sections/${sectionId}/rows/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to save label");
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    } catch {
      toast.error("Failed to save label");
    }
  }, [draft, value, rowId, sectionId, queryClient, apiBasePath, invalidateKey]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !editing && setEditing(true)}
      onKeyDown={(e) => e.key === "Enter" && !editing && setEditing(true)}
      className="w-full h-full"
    >
      {editing ? (
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
              setDraft(value);
              setEditing(false);
            }
          }}
          className={cn(
            "w-full bg-transparent border-none outline-none focus:outline-none",
            "font-medium text-foreground leading-snug caret-primary",
            "placeholder:text-muted-foreground/40",
          )}
          style={{ fontSize: 14 + zoomLevel }}
          placeholder="Enter row label…"
        />
      ) : (
        <span
          className={cn(
            "font-medium text-foreground leading-snug",
            !value && "text-muted-foreground/30",
          )}
          style={{ fontSize: 14 + zoomLevel }}
        >
          {value || "Click to add label…"}
        </span>
      )}
    </div>
  );
}

export function SingleRow({
  row,
  globalSl,
  sectionColor,
  tokenMap,
  templateId,
  sectionId,
  allSections,
  onEdit,
  onDelete,
  onAddCharge,
  onDeleteCharge,
  onEditCharge,
  dragHandleProps,
  zoomLevel = 0,
}: {
  row: any;
  globalSl: number;
  sectionColor: SectionColor;
  tokenMap: TokenMap;
  templateId: string;
  sectionId: string;
  allSections: any[];
  onEdit: () => void;
  onDelete: () => void;
  onAddCharge: () => void;
  onDeleteCharge: (chargeId: string) => void;
  onEditCharge: (charge: any) => void;
  dragHandleProps?: any;
  zoomLevel?: number;
}) {
  const { selectedCell, setSelectedCell, mode, validationErrors } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const charges: any[] = row.charges ?? [];
  const hasCharges = charges.length > 0;

  const baseValue = tokenMap[`${row.rowToken}_BASE`];
  const totalValue = tokenMap[row.rowToken] ?? tokenMap[`${row.rowToken}_TOTAL`];

  const notices = (validationErrors || []).filter((e: any) => e.rowToken === row.rowToken);

  const displayBase = baseValue != null ? fmt(baseValue) : undefined;
  const displayTotal = totalValue != null ? fmt(totalValue) : undefined;

  const isSelected = selectedCell?.rowId === row.id;

  const decodedFormula =
    row.valueType === "formula" ? decodeFormula(row.formula, allSections) : undefined;

  const handleValueClick = () =>
    setSelectedCell(cellFromRow({ templateId, sectionId, row, decodedFormula }));

  const formulaAnnotation = decodedFormula;

  return (
    <>
      <TableRow
        token={row.rowToken}
        onEditToken={mode !== "fill" ? onEdit : undefined}
        zoomLevel={zoomLevel}
        sl={
          <div className="group/sl relative flex items-center justify-center w-full h-full min-h-[32px]">
            <span
              className={cn(
                "transition-opacity text-xs font-semibold text-muted-foreground select-none",
                !isFormulaMode && "group-hover/sl:opacity-0",
              )}
            >
              {globalSl}
            </span>
            {mode !== "fill" && (
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center transition-opacity",
                  isFormulaMode
                    ? "opacity-0 pointer-events-none"
                    : "opacity-0 group-hover/sl:opacity-100 cursor-grab active:cursor-grabbing",
                )}
                {...(dragHandleProps ?? {})}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/60" />
              </div>
            )}
          </div>
        }
        actions={
          mode !== "fill" ? (
            <RowActions onEdit={onEdit} onDelete={onDelete} onAddCharge={onAddCharge} />
          ) : undefined
        }
        mobileActions={
          mode !== "fill" ? (
            <MobileRowActions onEdit={onEdit} onDelete={onDelete} onAddCharge={onAddCharge} />
          ) : undefined
        }
        formula={formulaAnnotation}
        onClickFormula={mode !== "fill" && formulaAnnotation ? handleValueClick : undefined}
        labelContent={
          <div className="flex items-center gap-2 min-w-0 truncate w-full">
            <LabelCell
              rowId={row.id}
              templateId={templateId}
              sectionId={sectionId}
              value={row.label ?? ""}
              zoomLevel={zoomLevel}
            />
            {notices && notices.length > 0 && <UnresolvedNoticeButton notices={notices} />}
          </div>
        }
        onClickUsd1={hasCharges ? handleValueClick : undefined}
        onClickUsd2={!hasCharges ? handleValueClick : undefined}
        isUsd1Selected={hasCharges && isSelected}
        isUsd2Selected={!hasCharges && isSelected}
        usd1={hasCharges && displayBase ? <span>{displayBase}</span> : undefined}
        usd2={!hasCharges && displayTotal ? <span>{displayTotal}</span> : undefined}
        notices={notices}
      />

      {charges.map((charge: any, idx: number) => {
        const isLastCharge = idx === charges.length - 1;
        const chargeVal = charge.chargeToken ? tokenMap[charge.chargeToken] : null;
        const displayCharge = chargeVal != null ? fmt(chargeVal) : undefined;
        const chargeDecodedFormula = charge.formula
          ? decodeFormula(charge.formula, allSections)
          : undefined;
        const isChargeSelected = selectedCell?.chargeId === charge.id;

        return (
          <RowChargeLine
            key={charge.id}
            charge={charge}
            sectionColor={sectionColor}
            chargeValue={displayCharge}
            zoomLevel={zoomLevel}
            rowTotal={isLastCharge ? displayTotal : undefined}
            onClickUsd1={() => {
              if (mode !== "fill") {
                setSelectedCell(
                  cellFromRowCharge({
                    templateId,
                    sectionId,
                    row,
                    charge,
                    decodedFormula: chargeDecodedFormula,
                  }),
                );
              }
            }}
            isUsd1Selected={isChargeSelected}
            onEditCharge={mode !== "fill" ? () => onEditCharge(charge) : undefined}
            onDeleteCharge={mode !== "fill" ? () => onDeleteCharge(charge.id) : undefined}
            rowId={mode !== "fill" ? row.id : undefined}
            sectionId={mode !== "fill" ? sectionId : undefined}
            allSections={allSections}
          />
        );
      })}
    </>
  );
}
