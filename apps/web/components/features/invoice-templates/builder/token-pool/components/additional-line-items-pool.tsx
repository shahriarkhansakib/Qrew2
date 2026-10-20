"use client";

import { Draggable, Droppable } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, GripVertical, Layers, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteModal } from "@/components/shared/confirm-delete-modal";
import { cn } from "@/lib/utils";
import { AddEditRowModal } from "../../add-edit-row-modal";
import { useBuilderContext } from "../../builder-context";

interface AdditionalLineItemsPoolProps {
  templateId?: string;
  draftId?: string;
  tokenZoomLevel?: number;
  onAddRowToSection?: (item: any, sectionId?: string) => void;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Excel-Style Inline Editable Label for Catalog Items ─────────────────────
function InlineCatalogLabel({
  value,
  subDescription,
  onSave,
}: {
  value: string;
  subDescription?: string | null;
  onSave: (newLabel: string, newDesc?: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      setDraftLabel(value);
    }
  }, [editing, value]);

  const handleBlurOrSave = () => {
    setEditing(false);
    const trimmedLabel = draftLabel.trim() || value;
    if (trimmedLabel !== value) {
      onSave(trimmedLabel, subDescription);
    }
  };

  if (editing) {
    return (
      <div
        className="w-full flex items-center min-w-0"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        data-no-dnd="true"
      >
        <input
          ref={inputRef}
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onBlur={handleBlurOrSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleBlurOrSave();
            }
            if (e.key === "Escape") {
              setDraftLabel(value);
              setEditing(false);
            }
          }}
          className="w-full bg-transparent border-none outline-none focus:outline-none font-medium text-foreground leading-snug caret-primary text-xs p-0 m-0 placeholder:text-muted-foreground/40"
          placeholder="Enter row label…"
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="cursor-text group/label min-w-0 w-full"
      title="Click to edit label"
    >
      <span className="font-medium text-xs text-foreground truncate leading-snug group-hover/label:text-primary transition-colors block">
        {value}
      </span>
    </div>
  );
}

// ─── Main AdditionalLineItemsPool Component ──────────────────────────────────

export function AdditionalLineItemsPool({
  templateId,
  draftId,
  tokenZoomLevel = 0,
  _onAddRowToSection,
}: AdditionalLineItemsPoolProps & { _onAddRowToSection?: any }) {
  const queryClient = useQueryClient();
  const {
    sections,
    apiBasePath,
    invalidateKey,
    getTokenColor,
    selectedCell,
    setSelectedCell,
    setSidebarTab,
  } = useBuilderContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  // 1. Fetch catalog
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: draftId
      ? invoiceKeys.optionalRows.byDraft(draftId)
      : invoiceKeys.optionalRows.byTemplate(templateId || ""),
    queryFn: async () => {
      if (draftId) {
        const res = await invoiceApi.getDraftOptionalRows(draftId);
        return Array.isArray(res) ? res : res.available || res.optionalRows || [];
      }
      if (templateId) return invoiceApi.getTemplateOptionalRows(templateId);
      return [];
    },
    enabled: Boolean(templateId || draftId),
  });

  const rawItems: any[] = Array.isArray(catalog) ? catalog : [];
  const items = useMemo(() => {
    return rawItems.map((r, idx) => ({
      ...r,
      id: r.id || r.rowToken || `opt-row-${idx}`,
    }));
  }, [rawItems]);

  // 2. Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (idOrToken: string) => {
      if (templateId) {
        return invoiceApi.deleteTemplateOptionalRow(templateId, idOrToken);
      }
      if (draftId) {
        return invoiceApi.deleteDraftOptionalRow(draftId, idOrToken);
      }
    },
    onSuccess: () => {
      toast.success("Removed additional line item from catalog");
      if (templateId) {
        queryClient.invalidateQueries({
          queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
        });
      }
      if (draftId) {
        queryClient.invalidateQueries({
          queryKey: invoiceKeys.optionalRows.byDraft(draftId),
        });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to remove additional line item");
    },
  });

  // 3. Update Mutation for Inline Editing
  const updateMutation = useMutation({
    mutationFn: async ({
      idOrToken,
      payload,
    }: {
      idOrToken: string;
      payload: { label?: string; subDescription?: string | null };
    }) => {
      if (templateId) {
        return invoiceApi.updateTemplateOptionalRow(templateId, idOrToken, payload);
      }
    },
    onSuccess: () => {
      toast.success("Updated additional line item");
      if (templateId) {
        queryClient.invalidateQueries({
          queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
        });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update line item");
    },
  });

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        (item.label || "").toLowerCase().includes(q) ||
        (item.rowToken || "").toLowerCase().includes(q) ||
        (item.subDescription || "").toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  // 4. Derived Selector: Dynamic Badge Counter
  // Calculates how many instances of each catalog item currently exist in active table sections
  const instanceCounts = useMemo(() => {
    const allRows: any[] = (sections || []).flatMap((sec: any) => sec.rows || []);
    const counts: Record<string, number> = {};

    for (const item of items) {
      if (!item.rowToken) continue;
      const baseToken = item.rowToken;
      const escaped = baseToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped}(?:_\\d+)?$`);
      counts[baseToken] = allRows.filter((r) => r.rowToken && regex.test(r.rowToken)).length;
    }

    return counts;
  }, [sections, items]);

  return (
    <div className="flex flex-col h-full overflow-hidden additional-line-items-container">
      {/* ── Header Bar ── */}
      <div className="px-3.5 py-2.5 border-b border-border bg-muted/20 shrink-0 space-y-2">
        <p className="text-[11px] text-muted-foreground leading-tight">
          Drag items into table sections, or drag rows here to save.
        </p>

        {/* Search */}
        <div className="relative">
          <Search className="w-3 h-3 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search line items..."
            className="h-7 text-xs pl-7 bg-background"
          />
        </div>
      </div>

      {/* ── Table-Like Body ── */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col min-h-0">
        {/* Table Header Row */}
        <div className="flex items-stretch border border-b-0 border-border bg-muted/50 h-7 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground rounded-t-md shrink-0 select-none">
          <div className="w-8 shrink-0 flex items-center justify-center border-r border-border">
            ::
          </div>
          <div className="w-28 shrink-0 px-2 flex items-center border-r border-border min-w-0">
            Token
          </div>
          <div className="flex-1 px-2.5 flex items-center border-r border-border min-w-0">
            Row Label
          </div>
          <div className="w-20 shrink-0 flex items-center justify-end px-2">
            USD / Rate
          </div>
        </div>

        {/* Droppable Area */}
        <Droppable droppableId="additional-line-items">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "border border-border rounded-b-md bg-card/30 flex flex-col transition-all divide-y divide-border/40",
                filteredItems.length === 0 ? "min-h-[140px] flex-1" : "min-h-0 shrink-0",
                snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/50 border-primary/40",
              )}
            >
              {snapshot.isDraggingOver && (
                <div className="bg-primary/10 border-b border-primary/20 py-1.5 px-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary animate-pulse">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Drop row here to move to Additional Line Items</span>
                </div>
              )}

              {isLoading ? (
                <div className="p-6 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground flex-1">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Loading catalog...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-6 flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground/70 flex-1">
                  <div className="p-2.5 rounded-full bg-muted/40 border border-border/40 text-muted-foreground/50">
                    <Layers className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-foreground/80">
                    No additional line items yet
                  </span>
                  <p className="text-[11px] max-w-[220px]">
                    Drag any row from the table here to save it, or click "+ Add Line Item" below.
                  </p>
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const count = instanceCounts[item.rowToken] || 0;
                  return (
                    <Draggable key={item.id} draggableId={`catalog-${item.id}`} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={cn(
                            "flex items-stretch bg-background/50 hover:bg-muted/30 transition-colors group relative min-h-[36px]",
                            dragSnapshot.isDragging &&
                              "bg-card shadow-2xl ring-2 ring-primary rounded-md z-50 opacity-95",
                          )}
                          style={{
                            ...dragProvided.draggableProps.style,
                          }}
                        >
                          {/* 1. Drag Grip Handle / Index (mirrors TableRow sl column) */}
                          <div
                            {...dragProvided.dragHandleProps}
                            className="w-8 shrink-0 flex items-center justify-center border-r border-border/40 text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing group/sl relative min-h-[32px] transition-colors bg-muted/5 group-hover:bg-muted/20"
                            title="Grab and drag to table section"
                          >
                            <span className="text-[11px] font-semibold text-muted-foreground/60 group-hover/sl:opacity-0 transition-opacity select-none">
                              {index + 1}
                            </span>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/sl:opacity-100 transition-opacity">
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </div>

                          {/* 2. Token Column (Clean monospace text matching TableRow) */}
                          <div className="w-28 shrink-0 px-2 flex items-center gap-1.5 border-r border-border/40 min-w-0">
                            <span
                              className={cn(
                                "font-mono text-xs font-semibold truncate leading-none",
                                getTokenColor ? getTokenColor(item.rowToken) : "text-primary",
                              )}
                              title={item.rowToken}
                            >
                              {item.rowToken}
                            </span>
                            {count > 0 && (
                              <span
                                className="inline-flex items-center justify-center px-1 py-0.2 rounded-full text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/25 shrink-0"
                                title={`${count} active instance${count === 1 ? "" : "s"} in table`}
                              >
                                {count}
                              </span>
                            )}
                          </div>

                          {/* 3. Label Column with Inline Edit & Pinned Hover Actions */}
                          <div className="flex-1 px-2.5 py-1.5 flex items-center border-r border-border/40 min-w-0 relative group/labelcell">
                            <InlineCatalogLabel
                              value={item.label}
                              subDescription={item.subDescription}
                              onSave={(newLabel, newDesc) =>
                                updateMutation.mutate({
                                  idOrToken: item.id || item.rowToken,
                                  payload: { label: newLabel, subDescription: newDesc },
                                })
                              }
                            />

                            {/* Hover Action Buttons: strictly Edit and Delete (No Quick Add button) */}
                            <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1 pl-6 opacity-0 group-hover/labelcell:opacity-100 group-hover:opacity-100 transition-opacity z-10 bg-gradient-to-l from-background via-background/95 to-transparent">
                              <div className="flex items-center gap-0.5 bg-background rounded border border-border/60 shadow-xs p-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingItem(item);
                                    setIsAddModalOpen(true);
                                  }}
                                  title="Edit token"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setItemToDelete(item);
                                  }}
                                  title="Delete from catalog"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* 4. USD / Rate cell (Clickable to open Formula Bar in Token Mode) */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              const isFormula =
                                item.valueType === "formula" || Boolean(item.formula);
                              const currentInput = isFormula
                                ? item.formula || ""
                                : item.initialValue != null && item.initialValue !== ""
                                  ? String(item.initialValue)
                                  : "";

                              setSelectedCell({
                                templateId: templateId || "",
                                draftId: draftId || "",
                                sectionId: "",
                                rowId: item.id || item.rowToken,
                                row: item,
                                isCatalogItem: true,
                                breadcrumb: item.label || item.rowToken,
                                valueType: isFormula ? "formula" : "normal",
                                currentInput,
                                token: item.rowToken,
                              });

                              // Automatically switch sidebar tab to 'tokens' so user can select tokens for their formula!
                              setSidebarTab("tokens");
                            }}
                            className={cn(
                              "w-20 shrink-0 flex items-center justify-end px-2 font-mono text-xs font-bold text-foreground tabular-nums select-none",
                              "cursor-pointer rounded-xs transition-all duration-100",
                              "hover:ring-1 hover:ring-primary/40 hover:bg-primary/5",
                              selectedCell?.isCatalogItem &&
                                selectedCell?.rowId === (item.id || item.rowToken) &&
                                "ring-2 ring-primary/60 bg-primary/10",
                            )}
                            title="Click to edit formula / rate (opens formula bar)"
                          >
                            {item.valueType === "formula" || item.formula ? (
                              <span
                                className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded truncate max-w-[70px]"
                                title={item.formula || ""}
                              >
                                fx {item.formula || "formula"}
                              </span>
                            ) : item.initialValue != null && item.initialValue !== "" ? (
                              <span>{fmt(Number(item.initialValue))}</span>
                            ) : (
                              <span className="text-muted-foreground/30 font-normal">—</span>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

        {/* ── Sticky Clamped + Add Line Item Button (directly below when short, pinned when scrolling) ── */}
        <div className="sticky bottom-0 z-20 mt-2 pt-2 pb-1 bg-gradient-to-t from-background via-background/95 to-transparent shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/80 hover:border-primary/50 bg-background/80 shadow-xs backdrop-blur-xs transition-all"
            onClick={() => {
              setEditingItem(null);
              setIsAddModalOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Line Item
          </Button>
        </div>
      </div>

      {/* ── Unified Add / Edit Line Item Modal ── */}
      {isAddModalOpen && (
        <AddEditRowModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingItem(null);
          }}
          isCatalog={true}
          templateId={templateId}
          draftId={draftId}
          editRow={editingItem}
        />
      )}

      {/* ── Confirm Delete Modal ── */}
      <ConfirmDeleteModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={() => {
          if (itemToDelete) {
            deleteMutation.mutate(itemToDelete.id || itemToDelete.rowToken);
            setItemToDelete(null);
          }
        }}
        entityName={
          itemToDelete ? `Line Item: ${itemToDelete.rowToken || itemToDelete.label}` : "this line item"
        }
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
