"use client";

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteModal } from "@/components/shared/confirm-delete-modal";
import { apiUrl } from "@/lib/constants";
import { TokenMap } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddEditRowModal } from "../add-edit-row-modal";
import { AddRowChargeModal } from "../add-row-charge-modal";
import { useBuilderContext } from "../builder-context";
import { SectionColor, SingleRow } from "./components/row-item";

export { MobileRowActions } from "./components/row-context-menu";
export type { SectionColor } from "./components/row-item";
export { TableRow } from "./components/table-row";

export function TemplateRowList({
  templateId,
  sectionId,
  sectionToken,
  rows,
  isLoading,
  slOffset = 0,
  sectionColor,
  tokenMap,
  allSections,
  zoomLevel = 0,
  isSharedDnd = false,
}: {
  templateId: string;
  sectionId: string;
  sectionToken: string;
  rows?: any[];
  isLoading?: boolean;
  slOffset?: number;
  sectionColor: SectionColor;
  tokenMap: TokenMap;
  allSections: any[];
  zoomLevel?: number;
  isSharedDnd?: boolean;
}) {
  const { apiBasePath, invalidateKey, mode, selectedCell } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const queryClient = useQueryClient();
  const [editingRow, setEditingRow] = useState<any>(null);
  const [addingChargeForRow, setAddingChargeForRow] = useState<any>(null);
  const [editingChargeForRow, setEditingChargeForRow] = useState<{ row: any; charge: any } | null>(
    null,
  );
  const [rowToDelete, setRowToDelete] = useState<any>(null);
  const [chargeToDelete, setChargeToDelete] = useState<any>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: invalidateKey });
  };

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch(`${apiBasePath}/sections/${sectionId}/rows/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: invalidateKey });
      const previousData = queryClient.getQueryData(invalidateKey);
      queryClient.setQueryData(invalidateKey, (old: any) => {
        if (!old) return old;
        return old.map((section: any) => {
          if (section.id !== sectionId) return section;
          const rowById: Record<string, any> = Object.fromEntries(
            (section.rows ?? []).map((r: any) => [r.id, r]),
          );
          const reorderedRows = orderedIds
            .map((id, i) => (rowById[id] ? { ...rowById[id], sortOrder: i } : null))
            .filter(Boolean);
          return { ...section, rows: reorderedRows };
        });
      });
      return { previousData };
    },
    onError: (_err, _ids, context: any) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(invalidateKey, context.previousData);
      }
      toast.error("Failed to reorder rows");
    },
    onSettled: () => {
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBasePath}/sections/${sectionId}/rows/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete row");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Row deleted");
      invalidate();
      setRowToDelete(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteChargeMutation = useMutation({
    mutationFn: async ({ rowId, chargeId }: { rowId: string; chargeId: string }) => {
      const res = await fetch(
        `${apiUrl}/api/invoice-templates/${templateId}/sections/${sectionId}/rows/${rowId}/charges/${chargeId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to delete charge");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Charge deleted");
      invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const sortedRows = [...(rows || [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  if (sortedRows.length === 0 && (mode === "fill" || mode === "preview")) return null;

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const dstIdx = result.destination.index;
    if (srcIdx === dstIdx) return;

    const newOrder = [...sortedRows];
    const [moved] = newOrder.splice(srcIdx, 1);
    newOrder.splice(dstIdx, 0, moved);

    reorderMutation.mutate(newOrder.map((r: any) => r.id));
  };

  if (mode === "fill" || mode === "preview") {
    return (
      <div className="flex flex-col bg-background overflow-visible">
        {sortedRows.map((row: any, idx: number) => (
          <div key={row.id} className="overflow-visible">
            <SingleRow
              row={row}
              globalSl={slOffset + idx + 1}
              sectionColor={sectionColor}
              tokenMap={tokenMap}
              templateId={templateId}
              sectionId={sectionId}
              allSections={allSections}
              onEdit={() => {}}
              onDelete={() => {}}
              onAddCharge={() => {}}
              onDeleteCharge={() => {}}
              onEditCharge={() => {}}
              dragHandleProps={{}}
              zoomLevel={zoomLevel}
            />
          </div>
        ))}
      </div>
    );
  }

  const droppableContent = (
    <Droppable droppableId={`rows-${sectionId}`}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            "flex flex-col bg-background overflow-visible transition-all duration-150 w-full min-w-fit",
            sortedRows.length === 0 &&
              "min-h-[58px] border-b border-dashed border-border/60 flex items-center justify-center p-2",
            snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/40 ring-inset",
          )}
        >
          {sortedRows.length === 0 && (
            <div
              className={cn(
                "text-[11px] font-medium transition-colors select-none pointer-events-none py-1.5 px-3 rounded-md",
                snapshot.isDraggingOver
                  ? "text-primary font-bold bg-primary/10 animate-pulse"
                  : "text-muted-foreground/50",
              )}
            >
              {snapshot.isDraggingOver
                ? "Drop row here to add to section"
                : "Empty section — drag line items or rows here"}
            </div>
          )}
          {sortedRows.map((row: any, idx: number) => (
            <Draggable key={row.id} draggableId={row.id} index={idx} isDragDisabled={isFormulaMode}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  className="overflow-visible w-full min-w-fit"
                >
                  <SingleRow
                    row={row}
                    globalSl={slOffset + idx + 1}
                    sectionColor={sectionColor}
                    tokenMap={tokenMap}
                    templateId={templateId}
                    sectionId={sectionId}
                    allSections={allSections}
                    onEdit={() => setEditingRow(row)}
                    onDelete={() => setRowToDelete(row)}
                    onAddCharge={() => setAddingChargeForRow(row)}
                    onDeleteCharge={(chargeId) => {
                      const charge = row.charges.find((c: any) => c.id === chargeId);
                      setChargeToDelete({ rowId: row.id, charge });
                    }}
                    onEditCharge={(charge) => setEditingChargeForRow({ row, charge })}
                    dragHandleProps={provided.dragHandleProps}
                    zoomLevel={zoomLevel}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  const modals = (
    <>
      {editingRow && (
        <AddEditRowModal
          isOpen={!!editingRow}
          onClose={() => setEditingRow(null)}
          templateId={templateId}
          sectionId={sectionId}
          sectionToken={sectionToken}
          editRow={editingRow}
          onSuccess={() => {
            invalidate();
            setEditingRow(null);
          }}
        />
      )}

      {(addingChargeForRow || editingChargeForRow) && (
        <AddRowChargeModal
          isOpen={!!addingChargeForRow || !!editingChargeForRow}
          onClose={() => {
            setAddingChargeForRow(null);
            setEditingChargeForRow(null);
          }}
          templateId={templateId}
          sectionId={sectionId}
          rowId={addingChargeForRow?.id || editingChargeForRow?.row.id}
          rowToken={addingChargeForRow?.rowToken || editingChargeForRow?.row.rowToken}
          existingCharges={addingChargeForRow?.charges || editingChargeForRow?.row.charges || []}
          editCharge={editingChargeForRow?.charge}
          onSuccess={() => {
            invalidate();
            setAddingChargeForRow(null);
            setEditingChargeForRow(null);
          }}
        />
      )}

      <ConfirmDeleteModal
        isOpen={!!rowToDelete}
        onClose={() => setRowToDelete(null)}
        onConfirm={() => rowToDelete && deleteMutation.mutate(rowToDelete.id)}
        entityName={rowToDelete ? `Row: ${rowToDelete.rowToken}` : "this row"}
        isDeleting={deleteMutation.isPending}
      />
      <ConfirmDeleteModal
        isOpen={!!chargeToDelete}
        onClose={() => setChargeToDelete(null)}
        onConfirm={() =>
          chargeToDelete &&
          deleteChargeMutation.mutate({
            rowId: chargeToDelete.rowId,
            chargeId: chargeToDelete.charge.id,
          })
        }
        entityName={chargeToDelete ? `Charge: ${chargeToDelete.charge.chargeToken}` : "this charge"}
        isDeleting={deleteChargeMutation.isPending}
      />
    </>
  );

  if (isSharedDnd) {
    return (
      <>
        {droppableContent}
        {modals}
      </>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {droppableContent}
      {modals}
    </DragDropContext>
  );
}
