"use client";

import { Draggable, Droppable } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Edit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { ConfirmDeleteModal } from "@/components/shared/confirm-delete-modal";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/constants";
import { fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddEditRowModal } from "../add-edit-row-modal";
import { AddSectionModal } from "../add-section-modal";
import { useBuilderContext } from "../builder-context";
import { SectionColor } from "../row-list";
import { SheetTableRow } from "./sheet-table-row";
import { getColumnWidthStyle, TemplateColumnDefinition } from "./types";

interface SheetSectionCardProps {
  templateId: string;
  section: any;
  allSections: any[];
  columns: TemplateColumnDefinition[];
  isFirst: boolean;
  isLast: boolean;
  slOffset: number;
  sectionColor: SectionColor;
  zoomLevel?: number;
}

export function SheetSectionCard({
  templateId,
  section,
  allSections,
  columns,
  isFirst,
  isLast,
  slOffset,
  sectionColor,
  zoomLevel = 0,
}: SheetSectionCardProps) {
  const queryClient = useQueryClient();
  const { tokenMap, mode, openAdditionalLineItemsPanel } = useBuilderContext();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [rowToDelete, setRowToDelete] = useState<any | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["template-sections", templateId] });
  };

  // Reorder section up/down
  const reorderMutation = useMutation({
    mutationFn: async (direction: "up" | "down") => {
      const currentIdx = allSections.findIndex((s) => s.id === section.id);
      const targetIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1;
      if (targetIdx < 0 || targetIdx >= allSections.length) return;

      const newSections = [...allSections];
      const [moved] = newSections.splice(currentIdx, 1);
      newSections.splice(targetIdx, 0, moved);

      const orderedIds = newSections.map((s) => s.id);
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/sections/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder sections");
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.message || "Failed to reorder"),
  });

  // Delete section
  const deleteSectionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${apiUrl}/api/invoice-templates/${templateId}/sections/${section.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to delete section");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Section deleted");
      invalidate();
      setIsDeleteModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete section"),
  });

  // Delete single row
  const deleteRowMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const res = await fetch(
        `${apiUrl}/api/invoice-templates/${templateId}/sections/${section.id}/rows/${rowId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to delete row");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Row removed");
      invalidate();
      setRowToDelete(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete row"),
  });

  // Move row to additional line items catalog
  const handleMoveToLineItems = async (row: any) => {
    try {
      await invoiceApi.addTemplateOptionalRow(templateId, {
        rowToken: row.rowToken,
        label: row.label || row.rowToken,
        subDescription: row.description || null,
        valueType: row.valueType || "normal",
        formula: row.formula || null,
        initialValue: row.initialValue || null,
        cellValues: row.cellValues || null,
      });

      await fetch(
        `${apiUrl}/api/invoice-templates/${templateId}/sections/${section.id}/rows/${row.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      invalidate();
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
      });
      openAdditionalLineItemsPanel?.();
      toast.success(`Moved "${row.label || row.rowToken}" to Additional Line Items`);
    } catch (err: any) {
      toast.error(err.message || "Failed to move row to catalog");
    }
  };

  // Inline "+ Add Row" instant creation
  const addRowMutation = useMutation({
    mutationFn: async () => {
      const defaultValues: Record<string, any> = {};
      for (const col of columns) {
        if (col.defaultValue !== undefined) {
          defaultValues[col.key] = col.defaultValue;
        }
      }

      const res = await fetch(
        `${apiUrl}/api/invoice-templates/${templateId}/sections/${section.id}/rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            label: "",
            cellValues: defaultValues,
            initialValue: 0,
            valueType: "normal",
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to add row");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success("Row added");
    },
    onError: (err: any) => toast.error(err.message || "Failed to add row"),
  });

  const rows: any[] = section.rows || [];
  const hasTotaledCols = columns.some((c) => c.isTotaled);

  return (
    <div className="relative group/section bg-background overflow-visible">
      {/* ── Section Header Bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-y border-border select-none"
        style={{
          backgroundColor: sectionColor.bg,
          borderLeftColor: sectionColor.border,
          borderLeftWidth: 3,
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-bold uppercase tracking-wider text-foreground truncate"
            style={{ fontSize: 13 + zoomLevel }}
          >
            {section.label || section.sectionToken}
          </span>
          {section.description && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">
              — {section.description}
            </span>
          )}
        </div>

        {/* Section Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/section:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => reorderMutation.mutate("up")}
            disabled={isFirst || reorderMutation.isPending}
            className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Move Section Up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => reorderMutation.mutate("down")}
            disabled={isLast || reorderMutation.isPending}
            className="h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Move Section Down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditModalOpen(true)}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Edit Section"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDeleteModalOpen(true)}
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            title="Delete Section"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Rows List (Droppable) ─────────────────────────────────────────── */}
      <Droppable droppableId={`rows-${section.id}`} type="ROW">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col overflow-visible"
          >
            {rows.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground/60 select-none">
                No rows in this section. Click &ldquo;+ Add row&rdquo; below.
              </div>
            ) : (
              rows.map((row, idx) => (
                <Draggable key={row.id} draggableId={row.id} index={idx}>
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className="overflow-visible"
                    >
                      <SheetTableRow
                        row={row}
                        rowIndex={idx}
                        globalSl={slOffset + idx + 1}
                        columns={columns}
                        templateId={templateId}
                        sectionId={section.id}
                        allSections={allSections}
                        onDelete={() => setRowToDelete(row)}
                        onEdit={() => setEditingRow(row)}
                        onMoveToAdditionalLineItems={() => handleMoveToLineItems(row)}
                        dragHandleProps={dragProvided.dragHandleProps}
                        zoomLevel={zoomLevel}
                        onRowUpdated={() => invalidate()}
                      />
                    </div>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* ── Footer — Add row (matching standard template builder) ── */}
      {mode !== "fill" && mode !== "preview" && (
        <div className="flex items-stretch border-b border-border bg-muted/5 hover:bg-muted/10 transition-colors">
          {/* Grip spacer matching row grip */}
          <div className="w-8 shrink-0 border-r border-border" />
          {/* Add row button spanning all data columns */}
          <div className="flex-1 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 cursor-pointer"
              onClick={() => addRowMutation.mutate()}
              disabled={addRowMutation.isPending}
            >
              <Plus className="h-3 w-3 mr-1" /> Add row
            </Button>
          </div>
          {/* Actions spacer matching row actions */}
          <div className="w-16 shrink-0 border-r-0" />
        </div>
      )}

      {/* ── Section Subtotal Row (Auto-computed for totaled columns) ───────── */}
      {hasTotaledCols && rows.length > 0 && (
        <div className="flex items-stretch border-b border-border bg-muted/15 h-9 font-semibold text-xs select-none">
          {/* Grip spacer */}
          <div className="w-8 shrink-0 border-r border-border bg-muted/10" />

          {/* Subtotal cells */}
          {(() => {
            const firstTotaledIdx = columns.findIndex((c) => c.isTotaled);
            const labelColIdx = firstTotaledIdx > 0 ? firstTotaledIdx - 1 : 0;

            return columns.map((col, idx) => {
              const style = getColumnWidthStyle(col);

              const alignClass =
                col.align === "right"
                  ? "justify-end text-right"
                  : col.align === "center"
                    ? "justify-center text-center"
                    : "justify-start text-left";

              // If totaled numeric column, compute subtotal evaluating live formulas or cellValues
              if (col.isTotaled) {
                const subtotal = rows.reduce((acc, r) => {
                  const val =
                    tokenMap[r.rowToken] ?? r.cellValues?.[col.key] ?? r.initialValue ?? 0;
                  return acc + (Number(val) || 0);
                }, 0);

                return (
                  <div
                    key={col.id || col.key}
                    style={{ ...style, fontSize: 13 + zoomLevel }}
                    className={cn(
                      "px-3 flex items-center min-w-0 border-r border-border font-mono font-bold text-foreground tabular-nums",
                      alignClass,
                    )}
                  >
                    {fmt(subtotal)}
                  </div>
                );
              }

              // Only show "Subtotal" on the single column right before the first totaled column
              if (idx === labelColIdx) {
                return (
                  <div
                    key={col.id || col.key}
                    style={style}
                    className="px-3 flex items-center justify-end min-w-0 border-r border-border uppercase tracking-wider text-[11px] font-bold text-muted-foreground"
                  >
                    Subtotal
                  </div>
                );
              }

              return (
                <div
                  key={col.id || col.key}
                  style={style}
                  className="px-3 flex items-center min-w-0 border-r border-border"
                />
              );
            });
          })()}

          {/* Actions spacer matching w-16 row actions */}
          <div className="w-16 shrink-0 border-r-0" />
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {isEditModalOpen && (
        <AddSectionModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          templateId={templateId}
          editSection={section}
        />
      )}

      {isDeleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={() => deleteSectionMutation.mutate()}
          entityName={`Section "${section.label || section.sectionToken}"`}
          isDeleting={deleteSectionMutation.isPending}
        />
      )}

      {editingRow && (
        <AddEditRowModal
          isOpen={!!editingRow}
          onClose={() => setEditingRow(null)}
          templateId={templateId}
          sectionId={section.id}
          sectionToken={section.sectionToken}
          editRow={editingRow}
          onSuccess={() => {
            invalidate();
            setEditingRow(null);
          }}
        />
      )}

      {rowToDelete && (
        <ConfirmDeleteModal
          isOpen={!!rowToDelete}
          onClose={() => setRowToDelete(null)}
          onConfirm={() => deleteRowMutation.mutate(rowToDelete.id)}
          entityName="this row"
          isDeleting={deleteRowMutation.isPending}
        />
      )}
    </div>
  );
}
