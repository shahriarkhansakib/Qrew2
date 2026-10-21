"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/constants";
import { buildTokenMap, fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddHeaderFieldModal } from "./add-header-field-modal";
import { AddSectionModal } from "./add-section-modal";
import { useBuilderContext } from "./builder-context";
import { TemplateFormulaBar } from "./formula-bar";
import { SectionColor } from "./row-list";
import { TemplateSectionCard } from "./template-section-card";

// ─── Section color palette ────────────────────────────────────────────────────
export const SECTION_PALETTE: SectionColor[] = [
  { border: "#22c55e", bg: "rgba(34,197,94,0.05)" }, // green
  { border: "#3b82f6", bg: "rgba(59,130,246,0.05)" }, // blue
  { border: "#f59e0b", bg: "rgba(245,158,11,0.05)" }, // amber
  { border: "#a855f7", bg: "rgba(168,85,247,0.05)" }, // purple
  { border: "#ef4444", bg: "rgba(239,68,68,0.05)" }, // red
  { border: "#14b8a6", bg: "rgba(20,184,166,0.05)" }, // teal
  { border: "#f97316", bg: "rgba(249,115,22,0.05)" }, // orange
  { border: "#ec4899", bg: "rgba(236,72,153,0.05)" }, // pink
];

// ─── "Add section here" divider ───────────────────────────────────────────────
function AddSectionDivider({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex items-center justify-center h-7 group">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-primary/30 transition-colors" />
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative z-10 inline-flex items-center gap-1 px-3 h-5 rounded-full text-[11px] font-medium",
          "border border-dashed border-border bg-background text-muted-foreground",
          "hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all duration-150",
          "shadow-sm",
        )}
      >
        <Plus className="h-2.5 w-2.5" />
        Add section here
      </button>
    </div>
  );
}

// ─── Table header row ─────────────────────────────────────────────────────────
// 4 columns: SL (w-10) | Label (flex-1) | USD (w-20) | USD (w-20)
// The token area is outside the table (absolute-positioned per row), so NO token space here.
function TableHeaderRow() {
  const { mode } = useBuilderContext();
  const isPdfMode = mode === "preview";

  return (
    <div className="flex items-stretch border border-b-0 border-border bg-muted/40 h-10">
      {/* SL */}
      <div className="w-10 shrink-0 flex items-center justify-center border-r border-border text-sm font-extrabold text-foreground/60">
        SL
      </div>
      {/* Label */}
      <div className="flex-1 px-3 flex items-center gap-2 border-r border-border min-w-0">
        <span className="text-sm font-extrabold text-foreground/60">
          {isPdfMode ? "Description" : "Row Label"}
        </span>
        {!isPdfMode && <span className="text-sm text-foreground/40">(text displayed in PDF)</span>}
      </div>
      {/* USD1 — base/charge values */}
      <div className="w-20 shrink-0 flex items-center justify-center border-r border-border text-sm font-extrabold text-foreground/60">
        USD
      </div>
      {/* USD2 — row totals */}
      <div className="w-20 shrink-0 flex items-center justify-center text-sm font-extrabold text-foreground/60">
        USD
      </div>
    </div>
  );
}

// ─── Grand total row ──────────────────────────────────────────────────────────
// Totals in USD2 (right column). No token space (tokens are absolute per-row).
function GrandTotalRow({ total }: { total: number | null }) {
  return (
    <div className="flex items-stretch border border-t-2 border-t-foreground/30 border-border bg-muted/10 h-12">
      {/* SL empty */}
      <div className="w-10 shrink-0 border-r border-border" />
      {/* Label — "Total" right-aligned */}
      <div className="flex-1 px-3 flex items-center justify-end border-r border-border min-w-0">
        <span className="text-base font-extrabold text-foreground uppercase tracking-wide">
          Total
        </span>
      </div>
      {/* USD1 — blank */}
      <div className="w-20 shrink-0 border-r border-border" />
      {/* USD2 — grand total */}
      <div className="w-20 shrink-0 flex items-center justify-end px-3">
        <span className="text-base font-extrabold text-foreground tabular-nums">
          {total != null ? fmt(total) : "—"}
        </span>
      </div>
    </div>
  );
}

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

export interface FileDetailsHeaderBoxProps {
  templateHeaderFields?: Array<{
    id: string;
    label: string;
    tokenKey?: string;
    fileFieldKey?: string;
    fieldType: string;
    columnPosition: "left" | "right";
    sortOrder: number;
    isFormulaInjectable?: boolean;
    defaultManualValue?: string;
    systemFieldKey?: string;
    customFieldDefinitionId?: string;
    fieldKey?: string;
  }>;
  project?: any; // The actual project data to populate values
  draftHeaderValues?: Record<string, any>;
  onDelete?: (id: string) => void;
  onEdit?: (field: any) => void;
  onAdd?: () => void;
  onReorder?: (updates: any[], optimisticState: any[]) => void;
  isTemplateMode?: boolean;
  isSharedDnd?: boolean;
  draftId?: string;
  templateId?: string;
  refetchHeaderFields?: () => void;
  title?: string;
  isSheetMode?: boolean;
}

export function FileDetailsHeaderBox({
  templateHeaderFields = [],
  project,
  draftHeaderValues,
  onDelete,
  onEdit,
  onAdd,
  onReorder,
  isTemplateMode = false,
  isSharedDnd = false,
  zoomLevel = 0,
  draftId,
  templateId,
  refetchHeaderFields,
  title,
  isSheetMode = false,
}: FileDetailsHeaderBoxProps & { zoomLevel?: number }) {
  const { selectedCell, mode } = useBuilderContext();
  const queryClient = useQueryClient();
  const isFormulaMode = !!selectedCell;
  const isFillMode = mode === "fill";
  const isPdfMode = mode === "preview";
  const isEditable = isTemplateMode || mode === "draft";

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const handleTokenClick = (e: React.MouseEvent, clickedToken: string) => {
    e.stopPropagation();
    if (isFillMode) return;
    if (isFormulaMode) {
      window.dispatchEvent(new CustomEvent("insert-token", { detail: clickedToken }));
    } else {
      navigator.clipboard.writeText(clickedToken);
      toast.success("Token copied");
    }
  };

  const getCleanToken = (field: any) => {
    if (field.tokenKey) {
      return field.tokenKey
        .toUpperCase()
        .replace(/^FILE_/, "")
        .replace(/^(GBL_|ORG_)/, "");
    }
    if (field.fileFieldKey) {
      return field.fileFieldKey.toUpperCase().replace(/^FILE_/, "");
    }
    if (field.orgConfigKey) {
      return field.orgConfigKey.toUpperCase().replace(/^(GBL_|ORG_)/, "");
    }
    return (field.label || "")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^FILE_/, "");
  };

  const isFieldTiedToFile = (field: any) => {
    if (field.systemFieldKey) return true;
    if (field.customFieldDefinitionId) return true;

    if (project) {
      const key = field.fieldKey || field.fileFieldKey;
      const cleanToken = getCleanToken(field);
      const tokenKey = field.tokenKey;

      if (
        key === "clientId" ||
        key === "client" ||
        key === "name" ||
        key === "status" ||
        field.label?.toLowerCase() === "client" ||
        field.label?.toLowerCase() === "name" ||
        field.label?.toLowerCase() === "status"
      ) {
        return true;
      }

      if (key && project[key] !== undefined) return true;

      if (project.customFields) {
        const cf = project.customFields;
        if (
          (key && cf[key] !== undefined) ||
          (tokenKey && cf[tokenKey] !== undefined) ||
          (cleanToken && cf[cleanToken] !== undefined) ||
          (field.label && cf[field.label] !== undefined)
        ) {
          return true;
        }

        const candidates = [key, tokenKey, cleanToken, field.label]
          .filter(Boolean)
          .map((k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, ""));

        for (const cfKey of Object.keys(cf)) {
          const normalized = cfKey.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (candidates.includes(normalized)) {
            return true;
          }
        }
      }
    }

    return false;
  };

  const getRawVal = (field: any): string | null => {
    const key = field.fieldKey || field.systemFieldKey || field.fileFieldKey;
    const cleanToken = getCleanToken(field);
    const tokenKey = field.tokenKey;

    let val: any = null;

    // 1. Check draftHeaderValues first (draft mode)
    if (draftHeaderValues) {
      val =
        (field.id ? draftHeaderValues[field.id] : undefined) ??
        (tokenKey ? draftHeaderValues[tokenKey] : undefined) ??
        (cleanToken ? draftHeaderValues[cleanToken] : undefined) ??
        (key ? draftHeaderValues[key] : undefined) ??
        (cleanToken ? draftHeaderValues[`FILE_${cleanToken}`] : undefined);
    }

    // 2. Humanize project status & client if raw UUID or code was loaded
    if (project) {
      if (key === "clientId" || key === "client" || field.label?.toLowerCase() === "client") {
        if (project.client?.name) val = project.client.name;
        else if (!val) val = project.clientId;
      } else if (key === "name" || field.label?.toLowerCase() === "name") {
        if (project.name) val = project.name;
      } else if (key === "status" || field.label?.toLowerCase() === "status") {
        if (project.statusRelation?.name) val = project.statusRelation.name;
        else if (project.status && (!val || val === project.status)) val = project.status;
      } else if ((val === null || val === undefined) && key && project[key] !== undefined) {
        val = project[key];
      }

      // Try customFields lookup if not found in root project properties
      if ((val === null || val === undefined) && project.customFields) {
        const cf = project.customFields;
        val =
          (key ? cf[key] : undefined) ??
          (field.tokenKey ? cf[field.tokenKey] : undefined) ??
          (cleanToken ? cf[cleanToken] : undefined) ??
          (field.label ? cf[field.label] : undefined);

        if (val === null || val === undefined) {
          const candidates = [key, field.tokenKey, cleanToken, field.label]
            .filter(Boolean)
            .map((k) =>
              String(k)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, ""),
            );

          for (const [cfKey, cfVal] of Object.entries(cf)) {
            const normalizedCfKey = cfKey.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (candidates.includes(normalizedCfKey)) {
              val = cfVal;
              break;
            }
          }
        }
      }
    }

    // 3. Fallback to defaultManualValue on the template field definition
    if ((val === null || val === undefined || val === "") && field.defaultManualValue) {
      val = field.defaultManualValue;
    }

    if (val === null || val === undefined) return null;
    return String(val);
  };

  const handleSaveFieldValue = async (field: any, newValue: string) => {
    const trimmed = newValue;
    setEditingFieldId(null);
    const currentVal = getRawVal(field) ?? "";
    if (trimmed === currentVal) return;

    const cleanToken = getCleanToken(field);
    const tokenKey = field.tokenKey || (cleanToken ? `FILE_${cleanToken}` : undefined);

    if (draftId) {
      try {
        const payloadValues: Record<string, string> = {
          [field.id]: trimmed,
        };
        if (tokenKey) payloadValues[tokenKey] = trimmed;
        if (cleanToken) payloadValues[cleanToken] = trimmed;

        // Optimistically update query client
        queryClient.setQueryData(["invoice-draft", draftId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            draftHeaderValues: {
              ...(old.draftHeaderValues || {}),
              ...payloadValues,
            },
          };
        });

        await invoiceApi.updateDraftHeaderValues(draftId, payloadValues);
        queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
        queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
        toast.success(`Updated ${field.label}`);
      } catch (err: any) {
        toast.error(err.message || `Failed to update ${field.label}`);
        queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
      }
    } else if (templateId) {
      try {
        const res = await fetch(
          `${apiUrl}/api/invoice-templates/${templateId}/header-fields/${field.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ defaultManualValue: trimmed }),
          },
        );
        if (!res.ok) throw new Error("Failed to update template field default");
        refetchHeaderFields?.();
        toast.success(`Updated default for ${field.label}`);
      } catch (err: any) {
        toast.error(err.message || `Failed to update default for ${field.label}`);
      }
    }
  };

  const renderFieldRow = (field: any) => {
    const isSelectable = field.isFormulaInjectable === true;
    const cleanToken = getCleanToken(field);
    const isTied = isFieldTiedToFile(field);
    // Custom file fields created in template builder can be edited like manual input cells
    const isManual = !isTied && !isPdfMode;
    const isEditing = editingFieldId === field.id;
    const rawVal = getRawVal(field);

    return (
      <div
        className={cn(
          "flex items-stretch min-h-[38px] group relative hover:bg-muted/5 transition-colors bg-background w-full border-b border-border/40 last:border-b-0",
          isSelectable &&
            !isFillMode &&
            isFormulaMode &&
            "hover:bg-primary/5 cursor-pointer insertable-token",
          isSelectable &&
            !isFillMode &&
            !isFormulaMode &&
            "cursor-pointer hover:bg-muted/10 insertable-token",
        )}
        onMouseDown={(e) => {
          if (isFormulaMode && isSelectable) {
            e.preventDefault();
          }
        }}
        onClick={(e) => {
          if (isFormulaMode && isSelectable && cleanToken) {
            handleTokenClick(e, cleanToken);
          }
        }}
        title={
          isFormulaMode && isSelectable
            ? `Insert ${cleanToken} into formula`
            : !isFillMode && isSelectable
              ? `Copy token ${cleanToken}`
              : undefined
        }
      >
        {/* Label cell */}
        <div
          className={cn(
            "w-32 sm:w-36 shrink-0 px-3 py-2 bg-muted/20 border-r border-border font-semibold text-xs uppercase tracking-wider flex items-start select-none",
            isSelectable && isFormulaMode ? "text-primary/80" : "text-muted-foreground",
          )}
          style={{ fontSize: 11 + zoomLevel }}
        >
          <span className="break-words leading-tight">{field.label}</span>
        </div>

        {/* Value cell */}
        <div
          className={cn(
            "flex-1 px-3 py-2 text-xs sm:text-sm font-medium text-foreground flex items-start justify-between min-w-0 gap-2",
            isManual && !isEditing && "cursor-pointer hover:bg-primary/[0.03]",
          )}
          onClick={(e) => {
            if (isManual && !isEditing && (!isFormulaMode || !isSelectable)) {
              e.stopPropagation();
              setEditingFieldId(field.id);
              setEditValue(rawVal ?? "");
            }
          }}
        >
          {isEditing ? (
            <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
              <TextareaAutosize
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveFieldValue(field, editValue);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingFieldId(null);
                  }
                }}
                onBlur={() => handleSaveFieldValue(field, editValue)}
                minRows={1}
                maxRows={8}
                className="w-full bg-primary/[0.04] border border-primary/40 rounded px-2 py-1 text-xs sm:text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
                style={{ fontSize: 13 + zoomLevel }}
                placeholder={`Enter ${field.label}...`}
                autoFocus
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mt-1 select-none">
                <span>Enter to save • Shift+Enter for newline • Esc to cancel</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0 pr-1">
              {rawVal !== null && rawVal !== undefined && rawVal !== "" && rawVal !== "—" ? (
                <span
                  className="font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed block"
                  style={{ fontSize: 13 + zoomLevel }}
                >
                  {rawVal}
                </span>
              ) : isManual ? (
                <span className="text-muted-foreground/40 italic font-sans text-xs flex items-center gap-1 select-none">
                  <Pencil className="w-3 h-3 shrink-0 opacity-40" />
                  <span>Click to enter {field.label}...</span>
                </span>
              ) : (
                <span className="text-foreground/20 font-light">—</span>
              )}
            </div>
          )}

          {/* Action buttons (Edit / Delete) */}
          {isEditable && !isEditing && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 ml-1 transition-opacity self-start mt-0.5">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(field);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  title="Edit field configuration"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(field.id);
                  }}
                  className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                  title="Remove field"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !onReorder) return;

    const sourceCol = result.source.droppableId.replace(/^header-/, "");
    const destCol = result.destination.droppableId.replace(/^header-/, "");

    const leftFields = Array.from(
      templateHeaderFields.filter(
        (f, idx) => f.columnPosition === "left" || (!f.columnPosition && idx % 2 === 0),
      ),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const rightFields = Array.from(
      templateHeaderFields.filter(
        (f, idx) => f.columnPosition === "right" || (!f.columnPosition && idx % 2 !== 0),
      ),
    ).sort((a, b) => a.sortOrder - b.sortOrder);

    const sourceList = sourceCol === "left" ? leftFields : rightFields;
    const destList = destCol === "left" ? leftFields : rightFields;

    const [moved] = sourceList.splice(result.source.index, 1);

    if (sourceCol !== destCol) {
      moved.columnPosition = destCol as "left" | "right";
    }

    destList.splice(result.destination.index, 0, moved);

    leftFields.forEach((f, i) => {
      f.sortOrder = i;
      f.columnPosition = "left";
    });
    rightFields.forEach((f, i) => {
      f.sortOrder = i;
      f.columnPosition = "right";
    });

    const newState = [...leftFields, ...rightFields];
    const updates = newState.map((f) => ({
      fieldId: f.id,
      columnPosition: f.columnPosition,
      sortOrder: f.sortOrder,
    }));

    onReorder(updates, newState);
  };

  const effectiveFields =
    templateHeaderFields && templateHeaderFields.length > 0
      ? templateHeaderFields
      : isSheetMode
        ? []
        : [
            {
              id: "default-name",
              label: "Name",
              fileFieldKey: "name",
              tokenKey: "NAME",
              columnPosition: "left",
              sortOrder: 0,
              fieldType: "file_field",
            },
            {
              id: "default-client",
              label: "Client",
              fileFieldKey: "clientId",
              tokenKey: "CLIENT",
              columnPosition: "left",
              sortOrder: 1,
              fieldType: "file_field",
            },
            {
              id: "default-status",
              label: "Status",
              fileFieldKey: "status",
              tokenKey: "STATUS",
              columnPosition: "right",
              sortOrder: 0,
              fieldType: "file_field",
            },
          ];

  const leftFields = effectiveFields
    .filter((f, idx) => f.columnPosition === "left" || (!f.columnPosition && idx % 2 === 0))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const rightFields = effectiveFields
    .filter((f, idx) => f.columnPosition === "right" || (!f.columnPosition && idx % 2 !== 0))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const renderDroppable = (id: string, fields: any[]) => (
    <Droppable droppableId={id} direction="vertical">
      {(provided, snapshot) => (
        <div
          className={cn(
            "flex flex-col divide-y divide-border min-h-[70px]",
            snapshot.isDraggingOver && "bg-muted/10",
          )}
          ref={provided.innerRef}
          {...provided.droppableProps}
        >
          {fields.length === 0 && (
            <div className="flex items-center justify-center p-4 text-xs text-muted-foreground/40 italic select-none">
              {snapshot.isDraggingOver ? "Drop field here" : "No fields in this column"}
            </div>
          )}
          {fields.map((field, index) => (
            <Draggable
              key={field.id}
              draggableId={field.id}
              index={index}
              isDragDisabled={!isEditable || !onReorder}
            >
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  style={provided.draggableProps.style}
                  className={cn(
                    "flex items-stretch group/drag relative",
                    snapshot.isDragging &&
                      "bg-card shadow-lg z-20 rounded border border-primary/40",
                  )}
                >
                  {isEditable && onReorder && (
                    <div
                      {...provided.dragHandleProps}
                      className="w-7 shrink-0 flex items-center justify-center border-r border-border text-muted-foreground/30 hover:text-foreground cursor-grab opacity-0 group-hover/drag:opacity-100 transition-opacity bg-muted/10"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">{renderFieldRow(field)}</div>
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  const leftDroppableId = isSharedDnd ? "header-left" : "left";
  const rightDroppableId = isSharedDnd ? "header-right" : "right";

  const dndContent = (
    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
      {renderDroppable(leftDroppableId, leftFields)}
      {renderDroppable(rightDroppableId, rightFields)}
    </div>
  );

  const headerTitle = title ?? (isSheetMode ? "Sheet Details" : "File Details");
  const headerSubtitle = isSheetMode ? "(Sheet Information)" : "(Header Information)";
  const isCompletelyEmpty = effectiveFields.length === 0;

  return (
    <div className="relative group mt-3 mb-4 file-details-header-box overflow-hidden rounded-md border border-border shadow-sm bg-background">
      {/* Table Header Bar matching TableHeaderRow */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 h-10 px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-foreground/60 uppercase tracking-wider">
            {headerTitle}
          </span>
          {!isFillMode && mode !== "preview" && (
            <span className="text-xs text-foreground/40 font-normal">
              {headerSubtitle}
            </span>
          )}
        </div>

        {isEditable && onAdd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAdd}
            className="h-7 px-2.5 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title={`Add field to ${headerTitle.toLowerCase()}`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Field</span>
          </Button>
        )}
      </div>

      {/* Table Body Grid */}
      {isCompletelyEmpty && isSheetMode ? (
        <div className="py-6 px-4 text-center text-xs text-muted-foreground/60 select-none flex flex-col items-center justify-center gap-2">
          <span>No sheet details fields yet. Click &ldquo;Add Field&rdquo; above to define metadata (e.g. Department, Period, Prepared By).</span>
          {isEditable && onAdd && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
              className="h-7 px-3 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Sheet Details Field</span>
            </Button>
          )}
        </div>
      ) : isSharedDnd ? (
        dndContent
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>{dndContent}</DragDropContext>
      )}
    </div>
  );
}

// ─── Inner workspace (inside BuilderProvider) ─────────────────────────────────

function WorkspaceInner({
  templateId,
  draftId,
  zoomLevel = 0,
  onZoomChange,
  project,
  draftHeaderValues,
  isSharedDnd = false,
  resolvedTokens,
  projectedDocumentNumber,
}: {
  templateId?: string;
  draftId?: string;
  zoomLevel?: number;
  onZoomChange?: React.Dispatch<React.SetStateAction<number>>;
  project?: any;
  draftHeaderValues?: Record<string, any>;
  isSharedDnd?: boolean;
  resolvedTokens?: Record<string, any>;
  projectedDocumentNumber?: string | null;
}) {
  const {
    setTokenMap,
    tokenPoolOpen,
    apiBasePath,
    invalidateKey,
    mode,
    setExternalTokens,
    setSections,
    setHeaderFields,
    setTemplateConstants,
  } = useBuilderContext();
  const queryClient = useQueryClient();
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [isAddHeaderModalOpen, setIsAddHeaderModalOpen] = useState(false);
  const [editingHeaderField, setEditingHeaderField] = useState<any>(null);
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpenModal = () => {
      setEditingHeaderField(null);
      setIsAddHeaderModalOpen(true);
    };
    window.addEventListener("open-add-header-field-modal", handleOpenModal);
    return () => window.removeEventListener("open-add-header-field-modal", handleOpenModal);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onZoomChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) onZoomChange((z) => Math.min(z + 1, 8));
        else if (e.deltaY > 0) onZoomChange((z) => Math.max(z - 1, -4));
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onZoomChange]);

  useEffect(() => {
    if (!onZoomChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          onZoomChange((z) => Math.min(z + 1, 8));
        } else if (e.key === "-") {
          e.preventDefault();
          onZoomChange((z) => Math.max(z - 1, -4));
        } else if (e.key === "0") {
          e.preventDefault();
          onZoomChange(0);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onZoomChange]);

  const { data: sections, isLoading } = useQuery({
    queryKey: invalidateKey,
    queryFn: async () => {
      const res = await fetch(`${apiBasePath}/sections`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sections");
      return res.json();
    },
  });

  const headerFieldsQueryKey = draftId
    ? ["draft-header-fields", draftId]
    : ["template-header-fields", templateId];
  const headerFieldsUrl = draftId
    ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields`
    : `${apiUrl}/api/invoice-templates/${templateId}/header-fields`;

  const { data: templateHeaderFields, refetch: refetchHeaderFields } = useQuery({
    queryKey: headerFieldsQueryKey,
    queryFn: async () => {
      const res = await fetch(headerFieldsUrl, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(draftId || templateId),
  });

  const { data: projectCustomFields } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Fetch constants (template constants for template mode, draft constants key fed through same endpoint for draft mode) ──
  const constantsQueryKey = draftId
    ? ["draft-constants", draftId]
    : ["template-constants", templateId];
  const constantsUrl = draftId
    ? `${apiUrl}/api/invoices/drafts/${draftId}/constants`
    : `${apiUrl}/api/invoice-templates/${templateId}/constants`;
  const { data: constantsData } = useQuery({
    queryKey: constantsQueryKey,
    queryFn: async () => {
      const res = await fetch(constantsUrl, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(draftId || templateId),
  });

  // ── Fetch org configs for global constants ──
  const { data: orgConfigs } = useQuery({
    queryKey: ["org-configs"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/org-configs`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Fetch expense categories ──
  const { data: expenseCategoriesData } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expense-categories`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sortedSections = useMemo(() => {
    if (!sections) return [];
    return [...sections].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [sections]);

  // Merge resolvedTokens from engine preview with project.customFields
  const externalTokenValues = useMemo(() => {
    const map: Record<string, any> = {};
    if (project?.customFields) {
      for (const [k, v] of Object.entries(project.customFields)) {
        if (v !== undefined && v !== null) {
          map[k] = v;
          map[k.toUpperCase()] = v;
          map[`FILE_${k.toUpperCase()}`] = v;
        }
      }
    }
    if (resolvedTokens) {
      for (const [k, v] of Object.entries(resolvedTokens)) {
        map[k] = v;
      }
    }
    return map;
  }, [project?.customFields, resolvedTokens]);

  // ── Compute token map and push it to context ──────────────────────────────
  // Pass constants, file fields, and expense categories so formula rows that reference them resolve correctly
  const tokenMap = useMemo(() => {
    return buildTokenMap(
      sortedSections,
      orgConfigs ?? [],
      constantsData ?? [],
      templateHeaderFields ?? [],
      expenseCategoriesData ?? [],
      externalTokenValues,
    );
  }, [
    sortedSections,
    orgConfigs,
    constantsData,
    templateHeaderFields,
    expenseCategoriesData,
    externalTokenValues,
  ]);

  useEffect(() => {
    setTokenMap(tokenMap);
  }, [tokenMap, setTokenMap]);

  useEffect(() => {
    if (setSections) setSections(sortedSections);
  }, [sortedSections, setSections]);

  useEffect(() => {
    if (setHeaderFields && templateHeaderFields) {
      setHeaderFields(templateHeaderFields);
    }
  }, [templateHeaderFields, setHeaderFields]);

  useEffect(() => {
    if (setTemplateConstants && constantsData) {
      setTemplateConstants(constantsData);
    }
  }, [constantsData, setTemplateConstants]);

  useEffect(() => {
    if (!setExternalTokens) return;
    const globalSet = new Set<string>();
    const templateSet = new Set<string>();
    const fileSet = new Set<string>();
    const categorySet = new Set<string>();

    categorySet.add("EXP_TOTAL");
    if (expenseCategoriesData) {
      for (const cat of expenseCategoriesData) {
        const key = cat.tokenKey;
        if (key && key !== "EXP_TOTAL") {
          const bare = key.replace(/^EXP_/, "");
          categorySet.add(bare);
        }
      }
    }

    if (orgConfigs) {
      for (const config of orgConfigs) {
        if (config.configKey) {
          const bare = config.configKey.replace(/^(ORG_|GBL_)/, "");
          globalSet.add(bare);
        }
      }
    }

    if (constantsData) {
      const constantsArray = Array.isArray(constantsData)
        ? constantsData
        : Object.values(constantsData);
      for (const constant of constantsArray) {
        const key = constant.key ?? constant.token;
        if (key) {
          const bare = key.replace(/^TPL_/, "");
          templateSet.add(bare);
        }
      }
    }

    if (templateHeaderFields) {
      for (const field of templateHeaderFields) {
        let bareToken = (field.label || "")
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, "_")
          .replace(/^FILE_/, "");
        if (field.fieldType === "file_field" && field.fileFieldKey) {
          bareToken = field.fileFieldKey.toUpperCase().replace(/^FILE_/, "");
        } else if (field.fieldType === "org_config" && field.orgConfigKey) {
          bareToken = field.orgConfigKey.toUpperCase().replace(/^(GBL_|ORG_)/, "");
        }
        if (bareToken) {
          fileSet.add(bareToken);
        }
      }
    }

    setExternalTokens({
      global: globalSet,
      template: templateSet,
      file: fileSet,
      category: categorySet,
    });
  }, [orgConfigs, constantsData, templateHeaderFields, expenseCategoriesData, setExternalTokens]);

  // ── Global SL offsets ─────────────────────────────────────────────────────
  const sectionSlOffsets = useMemo(() => {
    const offsets: number[] = [];
    let globalCounter = 0;
    for (const sec of sortedSections) {
      offsets.push(globalCounter);
      globalCounter += (sec.rows ?? []).length;
    }
    return offsets;
  }, [sortedSections]);

  // ── Grand total ───────────────────────────────────────────────────────────
  const grandTotal = useMemo(() => {
    if (sortedSections.length === 0) return null;
    return sortedSections.reduce((sum: number, sec: any) => {
      const v = tokenMap[`SEC_${sec.sectionToken}`] ?? tokenMap[`SEC_${sec.sectionToken}_TOTAL`];
      return sum + (v ?? 0);
    }, 0);
  }, [sortedSections, tokenMap]);

  const handleConfirmDeleteField = async () => {
    if (!fieldToDelete) return;
    try {
      const deleteUrl = draftId
        ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields/${fieldToDelete}`
        : `${apiUrl}/api/invoice-templates/${templateId}/header-fields/${fieldToDelete}`;
      await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Header field removed");
      refetchHeaderFields();
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    } catch (error) {
      console.error("Failed to delete header field", error);
      toast.error("Failed to delete header field");
    } finally {
      setFieldToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto w-full space-y-1">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    );
  }

  return (
    // Extra left padding to give the outside-border token (w-28 = 112px) space to render.
    // overflow-visible is required so absolute-positioned tokens escape the container border.
    <div
      ref={containerRef}
      className={cn(
        "px-4 sm:px-6 md:px-12 lg:px-44 xl:px-48 pb-8 overflow-visible transition-all duration-200 outline-none w-full",
      )}
      tabIndex={0}
    >
      <div className="w-full max-w-4xl mx-auto relative overflow-visible">
        {/* ── Document Reference Banner (Invoice Number above File Details) ── */}
        {projectedDocumentNumber && (
          <div className="flex items-center justify-between pb-2.5 pt-1 px-1 select-none">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                Invoice Document No:
              </span>
              <Badge
                variant="outline"
                className="text-xs font-mono font-bold px-2 py-0.5 border-primary/30 text-primary bg-primary/5"
                title="Projected invoice document number upon finalization"
              >
                {projectedDocumentNumber}
              </Badge>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground/70">
              (Projected on finalize)
            </span>
          </div>
        )}

        {/* ── File Details Header Box ── */}
        <FileDetailsHeaderBox
          templateHeaderFields={templateHeaderFields || []}
          project={project}
          draftHeaderValues={draftHeaderValues}
          zoomLevel={zoomLevel}
          isTemplateMode={!draftId}
          isSharedDnd={isSharedDnd}
          draftId={draftId}
          templateId={templateId}
          refetchHeaderFields={refetchHeaderFields}
          onDelete={(fieldId) => setFieldToDelete(fieldId)}
          onReorder={async (updates, optimisticState) => {
            queryClient.setQueryData(headerFieldsQueryKey, optimisticState);
            try {
              const reorderUrl = draftId
                ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields/reorder`
                : `${apiUrl}/api/invoice-templates/${templateId}/header-fields/reorder`;
              await fetch(reorderUrl, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ updates }),
              });
              refetchHeaderFields();
            } catch (e) {
              console.error(e);
              refetchHeaderFields();
            }
          }}
          onEdit={(field) => {
            setEditingHeaderField(field);
            setIsAddHeaderModalOpen(true);
          }}
          onAdd={() => {
            setEditingHeaderField(null);
            setIsAddHeaderModalOpen(true);
          }}
        />

        {/* ── Sticky formula bar ── */}
        {mode !== "preview" && (
          <div className="sticky top-0 z-30 py-2">
            <TemplateFormulaBar />
          </div>
        )}

        {/* ── Table header ── */}
        <TableHeaderRow />

        {/* ── Sections ── */}
        {/* overflow-visible is REQUIRED so row tokens (position:absolute right:100%) escape the border */}
        <div className="border-x border-border bg-background overflow-visible">
          {mode !== "fill" && mode !== "preview" && (
            <AddSectionDivider onClick={() => setInsertAtIndex(0)} />
          )}

          {sortedSections.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground/50">
              No sections yet — add one above.
            </div>
          ) : (
            sortedSections.map((section: any, idx: number) => {
              const sectionColor = SECTION_PALETTE[idx % SECTION_PALETTE.length];
              return (
                <div key={section.id}>
                  <TemplateSectionCard
                    templateId={templateId || ""}
                    draftId={draftId}
                    section={section}
                    allSections={sortedSections}
                    isFirst={idx === 0}
                    isLast={idx === sortedSections.length - 1}
                    slOffset={sectionSlOffsets[idx]}
                    sectionColor={sectionColor}
                    tokenMap={tokenMap}
                    isSharedDnd={isSharedDnd}
                  />
                  {mode !== "fill" && mode !== "preview" && (
                    <AddSectionDivider onClick={() => setInsertAtIndex(section.sortOrder + 1)} />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Grand total ── */}
        <GrandTotalRow total={grandTotal} />

        {insertAtIndex !== null && (
          <AddSectionModal
            isOpen={true}
            onClose={() => setInsertAtIndex(null)}
            templateId={templateId || ""}
            draftId={draftId}
            insertAtIndex={insertAtIndex}
            existingSections={sortedSections}
          />
        )}

        {(templateId || draftId) && (
          <AddHeaderFieldModal
            isOpen={isAddHeaderModalOpen}
            onClose={() => {
              setIsAddHeaderModalOpen(false);
              setEditingHeaderField(null);
            }}
            templateId={templateId}
            draftId={draftId}
            editField={editingHeaderField}
            onSuccess={() => refetchHeaderFields()}
          />
        )}

        {/* ── Delete Field Alert Dialog ── */}
        <AlertDialog
          open={!!fieldToDelete}
          onOpenChange={(open) => !open && setFieldToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will remove the field from this {draftId ? "draft" : "template"}. It
                will not delete the custom field from the global schema, but any formulas relying on
                this token will become invalid.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDeleteField}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ─── Exported workspace ────────────────────────────
export function TemplateBuilderWorkspace({
  templateId,
  draftId,
  zoomLevel = 0,
  onZoomChange,
  project,
  draftHeaderValues,
  isSharedDnd = false,
  resolvedTokens,
  projectedDocumentNumber,
}: {
  templateId?: string;
  draftId?: string;
  zoomLevel?: number;
  onZoomChange?: React.Dispatch<React.SetStateAction<number>>;
  project?: any;
  draftHeaderValues?: Record<string, any>;
  isSharedDnd?: boolean;
  resolvedTokens?: Record<string, any>;
  projectedDocumentNumber?: string | null;
}) {
  return (
    <WorkspaceInner
      templateId={templateId}
      draftId={draftId}
      zoomLevel={zoomLevel}
      onZoomChange={onZoomChange}
      project={project}
      draftHeaderValues={draftHeaderValues}
      isSharedDnd={isSharedDnd}
      resolvedTokens={resolvedTokens}
      projectedDocumentNumber={projectedDocumentNumber}
    />
  );
}
