import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decodeFormula, fmt, TokenMap } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { usePermissionStore } from "@/store/use-permission-store";
import { cellFromRow, cellFromRowCharge, useBuilderContext } from "../../builder-context";
import { RowChargeLine } from "./charge-item";
import { MobileRowActions, RowActions, UnresolvedNoticeButton } from "./row-context-menu";
import { TableRow } from "./table-row";

export type SectionColor = { border: string; bg: string };

export function LabelCell({
  rowId,
  templateId: _templateId,
  sectionId,
  value,
  zoomLevel = 0,
  isEditing,
  onEditingChange,
}: {
  rowId: string;
  templateId: string;
  sectionId: string;
  value: string;
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
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { apiBasePath, invalidateKey, mode } = useBuilderContext();
  const { canAny } = usePermissionStore();

  const canEditLabel =
    mode !== "preview" &&
    (mode === "template" ||
      canAny([
        "invoice:edit_line_labels",
        "finance:manage_invoices",
        "template:edit",
        "workspace:manage_settings",
      ]));

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
  }, [draft, value, rowId, sectionId, queryClient, apiBasePath, invalidateKey, setEditing]);

  return (
    <div
      role={canEditLabel ? "button" : undefined}
      tabIndex={canEditLabel ? 0 : undefined}
      onClick={() => canEditLabel && !editing && setEditing(true)}
      onKeyDown={(e) => canEditLabel && e.key === "Enter" && !editing && setEditing(true)}
      className={cn("w-full h-full flex items-center min-w-0", !canEditLabel && "cursor-default")}
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
            "font-medium text-foreground leading-snug truncate",
            !value && "text-muted-foreground/30",
          )}
          style={{ fontSize: 14 + zoomLevel }}
          title={!canEditLabel ? "Label editing locked" : undefined}
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
  const {
    selectedCell,
    setSelectedCell,
    mode,
    validationErrors,
    apiBasePath,
    invalidateKey,
    draftId,
    headerFields,
    templateConstants,
    openAdditionalLineItemsPanel,
  } = useBuilderContext();
  const queryClient = useQueryClient();
  const isFormulaMode = !!selectedCell;
  const isOptionalService = !!row.isOptionalService;
  const charges: any[] = row.charges ?? [];
  const hasCharges = charges.length > 0;
  const { canAny } = usePermissionStore();
  const canEditLabel =
    mode !== "preview" &&
    (mode === "template" ||
      canAny([
        "invoice:edit_line_labels",
        "finance:manage_invoices",
        "template:edit",
        "workspace:manage_settings",
      ]));
  const [isEditingLabel, setIsEditingLabel] = useState(false);

  const handleDeleteOptionalService = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${apiBasePath}/optional-rows/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove optional service");
      }
      toast.success(`Removed optional service "${row.rowToken}"`);
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      if (draftId) {
        queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
        queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to remove optional service");
    }
  };

  const baseValue = tokenMap[`${row.rowToken}_BASE`];
  const totalValue = tokenMap[row.rowToken] ?? tokenMap[`${row.rowToken}_TOTAL`];

  const notices = (validationErrors || []).filter((e: any) => e.rowToken === row.rowToken);

  const displayBase = baseValue != null ? fmt(baseValue) : undefined;
  const displayTotal = totalValue != null ? fmt(totalValue) : undefined;

  const isSelected = selectedCell?.rowId === row.id;

  const decodedFormula =
    row.valueType === "formula"
      ? decodeFormula(row.formula, allSections, templateConstants, headerFields)
      : undefined;

  const isCellEditable = mode !== "preview" && (mode !== "fill" || row.valueType === "normal");

  const handleValueClick = () => {
    if (!isCellEditable) return;
    setSelectedCell(cellFromRow({ templateId, sectionId, row, decodedFormula }));
  };

  const handleSaveToAdditionalLineItems = async () => {
    try {
      if (templateId) {
        await invoiceApi.addTemplateOptionalRow(templateId, {
          rowToken: row.rowToken,
          label: row.label,
          subDescription: row.description || null,
          valueType: row.valueType || "normal",
          formula: row.formula || null,
          initialValue: row.initialValue || null,
        });
        queryClient.invalidateQueries({
          queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
        });
        openAdditionalLineItemsPanel?.();
        toast.success(`Copied "${row.label || row.rowToken}" to Additional Line Items`);
      } else if (draftId) {
        await invoiceApi.addDraftOptionalRow(draftId, {
          canonicalToken: row.canonicalToken || row.rowToken,
          customLabel: row.label,
          customValue:
            row.valueType === "normal" && row.initialValue ? Number(row.initialValue) : undefined,
          customFormula: row.valueType === "formula" ? row.formula : undefined,
        });
        queryClient.invalidateQueries({
          queryKey: invoiceKeys.optionalRows.byDraft(draftId),
        });
        openAdditionalLineItemsPanel?.();
        toast.success(`Copied "${row.label || row.rowToken}" to Additional Line Items`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to copy row to Additional Line Items");
    }
  };

  const formulaAnnotation = decodedFormula;

  return (
    <>
      <TableRow
        token={row.rowToken}
        onEditToken={mode !== "fill" && mode !== "preview" ? onEdit : undefined}
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
            {mode !== "fill" && mode !== "preview" && (
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
          mode !== "fill" && mode !== "preview" ? (
            <RowActions
              onEdit={onEdit}
              onDelete={onDelete}
              onAddCharge={onAddCharge}
              onMoveToAdditionalLineItems={handleSaveToAdditionalLineItems}
            />
          ) : mode === "fill" && isOptionalService ? (
            <Can I={["invoice:manage_optional_rows", "finance:manage_invoices"]}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={handleDeleteOptionalService}
                title="Remove optional service from draft"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </Can>
          ) : undefined
        }
        mobileActions={
          mode !== "fill" && mode !== "preview" ? (
            <MobileRowActions
              onEdit={onEdit}
              onDelete={onDelete}
              onAddCharge={onAddCharge}
              onMoveToAdditionalLineItems={handleSaveToAdditionalLineItems}
            />
          ) : mode === "fill" && isOptionalService ? (
            <Can I={["invoice:manage_optional_rows", "finance:manage_invoices"]}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={handleDeleteOptionalService}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </Can>
          ) : undefined
        }
        formula={formulaAnnotation}
        onClickFormula={
          mode !== "fill" && mode !== "preview" && formulaAnnotation ? handleValueClick : undefined
        }
        onClickLabel={canEditLabel ? () => setIsEditingLabel(true) : undefined}
        labelContent={
          <div className="flex items-center gap-2 min-w-0 truncate w-full">
            <LabelCell
              rowId={row.id}
              templateId={templateId}
              sectionId={sectionId}
              value={row.label ?? ""}
              zoomLevel={zoomLevel}
              isEditing={isEditingLabel}
              onEditingChange={setIsEditingLabel}
            />
            {isOptionalService && (
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 border-primary/30 bg-primary/5 text-primary shrink-0 font-normal"
                title="Prebuilt optional service row"
              >
                Optional
              </Badge>
            )}
          </div>
        }
        onClickUsd1={hasCharges && isCellEditable ? handleValueClick : undefined}
        onClickUsd2={!hasCharges && isCellEditable ? handleValueClick : undefined}
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
          ? decodeFormula(charge.formula, allSections, templateConstants, headerFields)
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
              if (mode !== "fill" && mode !== "preview") {
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
            onEditCharge={
              mode !== "fill" && mode !== "preview" ? () => onEditCharge(charge) : undefined
            }
            onDeleteCharge={
              mode !== "fill" && mode !== "preview" ? () => onDeleteCharge(charge.id) : undefined
            }
            rowId={mode !== "fill" && mode !== "preview" ? row.id : undefined}
            sectionId={mode !== "fill" && mode !== "preview" ? sectionId : undefined}
            allSections={allSections}
          />
        );
      })}
    </>
  );
}
