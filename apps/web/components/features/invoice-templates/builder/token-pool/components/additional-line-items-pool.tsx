"use client";

import { Draggable, Droppable } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GripVertical,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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

export function AdditionalLineItemsPool({
  templateId,
  draftId,
  tokenZoomLevel = 0,
  onAddRowToSection,
}: AdditionalLineItemsPoolProps) {
  const queryClient = useQueryClient();
  const { sections, apiBasePath, invalidateKey, mode } = useBuilderContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [rowToken, setRowToken] = useState("");
  const [label, setLabel] = useState("");
  const [subDescription, setSubDescription] = useState("");
  const [valueType, setValueType] = useState<"normal" | "formula">("normal");
  const [initialValue, setInitialValue] = useState("");
  const [formula, setFormula] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  // 1. Fetch catalog
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: templateId
      ? invoiceKeys.optionalRows.byTemplate(templateId)
      : invoiceKeys.optionalRows.byDraft(draftId || ""),
    queryFn: () => {
      if (templateId) return invoiceApi.getTemplateOptionalRows(templateId);
      if (draftId) return invoiceApi.getDraftOptionalRows(draftId);
      return [];
    },
    enabled: !!templateId || !!draftId,
  });

  const items: any[] = Array.isArray(catalog) ? catalog : [];

  // 2. Add Mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      const cleanToken = rowToken
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");
      if (!cleanToken) throw new Error("Please enter a valid canonical token name");
      if (!label.trim()) throw new Error("Please enter a display label");

      if (
        valueType === "normal" &&
        initialValue.trim() !== "" &&
        Number.isNaN(Number(initialValue))
      ) {
        throw new Error("Initial value must be a valid number");
      }

      if (valueType === "formula" && !formula.trim()) {
        throw new Error("Please enter a formula expression");
      }

      const payload = {
        rowToken: cleanToken,
        label: label.trim(),
        subDescription: subDescription.trim() || undefined,
        valueType,
        initialValue:
          valueType === "normal" && initialValue.trim() !== ""
            ? String(initialValue.trim())
            : undefined,
        formula: valueType === "formula" ? formula.trim() : undefined,
      };

      if (templateId) {
        return invoiceApi.addTemplateOptionalRow(templateId, payload);
      }
      if (draftId) {
        return invoiceApi.addDraftOptionalRow(draftId, {
          canonicalToken: payload.rowToken,
          customLabel: payload.label,
          customValue: payload.initialValue ? Number(payload.initialValue) : undefined,
          customFormula: payload.formula,
        });
      }
    },
    onSuccess: (res: any) => {
      toast.success(`Additional line item "${res?.rowToken || rowToken}" created`);
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
      setIsAddModalOpen(false);
      setRowToken("");
      setLabel("");
      setSubDescription("");
      setValueType("normal");
      setInitialValue("");
      setFormula("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add additional line item");
    },
  });

  // 3. Delete Mutation
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

  // Filter items
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

  const handleQuickAdd = async (item: any) => {
    if (onAddRowToSection) {
      onAddRowToSection(item, selectedSectionId || undefined);
      return;
    }

    // Default quick add: add to first section
    const targetSection = sections?.[0];
    if (!targetSection) {
      toast.error("Please add a section to the table first");
      return;
    }

    try {
      const existingTokens = new Set<string>();
      for (const sec of sections || []) {
        for (const r of sec.rows || []) {
          if (r.rowToken) existingTokens.add(r.rowToken);
        }
      }

      let uniqueToken = item.rowToken;
      let counter = 2;
      while (existingTokens.has(uniqueToken)) {
        uniqueToken = `${item.rowToken}_${counter}`;
        counter++;
      }

      const res = await fetch(`${apiBasePath}/sections/${targetSection.id}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rowToken: uniqueToken,
          label: item.label,
          description: item.subDescription || null,
          valueType: item.valueType || "normal",
          formula: item.formula || null,
          initialValue: item.initialValue || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add row");
      }

      toast.success(`Added "${item.label}" to ${targetSection.sectionToken || "table"}`);
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    } catch (e: any) {
      toast.error(e.message || "Failed to add row to table");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden additional-line-items-container">
      {/* ── Header Bar ── */}
      <div className="px-3.5 py-2.5 border-b border-border bg-muted/20 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span>Additional Line Items</span>
            </h3>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Drag items into table sections, or drag rows here to save.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="h-7 text-xs gap-1 px-2.5 shrink-0 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Item</span>
          </Button>
        </div>

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
      <div className="flex-1 overflow-y-auto p-3 flex flex-col">
        {/* Table Header Row (mirroring table body) */}
        <div className="flex items-stretch border border-b-0 border-border bg-muted/50 h-7 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground rounded-t-md shrink-0">
          <div className="w-7 shrink-0 flex items-center justify-center border-r border-border">
            ::
          </div>
          <div className="flex-1 px-2.5 flex items-center border-r border-border min-w-0">
            Row Label & Token
          </div>
          <div className="w-20 shrink-0 flex items-center justify-center border-r border-border">
            USD / Rate
          </div>
          <div className="w-14 shrink-0 flex items-center justify-center">Action</div>
        </div>

        {/* Droppable Area */}
        <Droppable droppableId="additional-line-items">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "flex-1 border border-border rounded-b-md bg-card/30 flex flex-col transition-all min-h-[140px] divide-y divide-border/40",
                snapshot.isDraggingOver &&
                  "bg-primary/5 ring-2 ring-primary/50 border-primary/40",
              )}
            >
              {snapshot.isDraggingOver && (
                <div className="bg-primary/10 border-b border-primary/20 py-1.5 px-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary animate-pulse">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Drop row here to add to Additional Line Items</span>
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
                  <span className="font-medium text-foreground/80">No additional line items yet</span>
                  <p className="text-[11px] max-w-[220px]">
                    Drag any row from the table here to save it, or click "+ New Item" above.
                  </p>
                </div>
              ) : (
                filteredItems.map((item, index) => (
                  <Draggable key={item.id} draggableId={`catalog-${item.id}`} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={cn(
                          "flex items-stretch bg-background/50 hover:bg-muted/30 transition-colors group relative min-h-[38px]",
                          dragSnapshot.isDragging &&
                            "bg-card shadow-2xl ring-2 ring-primary rounded-md z-50 opacity-95",
                        )}
                        style={{
                          fontSize: 12 + tokenZoomLevel,
                          ...dragProvided.draggableProps.style,
                        }}
                      >
                        {/* Drag Grip Handle */}
                        <div
                          {...dragProvided.dragHandleProps}
                          className="w-7 shrink-0 flex items-center justify-center border-r border-border/40 text-muted-foreground/40 hover:text-primary cursor-grab active:cursor-grabbing bg-muted/10 group-hover:bg-muted/30 transition-colors"
                          title="Grab and drag to table"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>

                        {/* Label & Token Details */}
                        <div className="flex-1 px-2.5 py-1.5 flex flex-col justify-center border-r border-border/40 min-w-0">
                          <span className="font-semibold text-xs text-foreground truncate leading-tight">
                            {item.label}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            <span className="font-mono text-[10px] text-primary/80 bg-primary/10 border border-primary/20 px-1 py-0.2 rounded font-semibold truncate shrink-0">
                              {item.rowToken}
                            </span>
                            {item.subDescription && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {item.subDescription}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* USD / Rate cell */}
                        <div className="w-20 shrink-0 flex items-center justify-end px-2 border-r border-border/40 font-mono text-xs font-bold text-foreground tabular-nums">
                          {item.valueType === "formula" ? (
                            <span
                              className="text-[10px] font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded truncate max-w-[70px]"
                              title={item.formula || ""}
                            >
                              fx {item.formula || "formula"}
                            </span>
                          ) : item.initialValue != null && item.initialValue !== "" ? (
                            <span>{fmt(Number(item.initialValue))}</span>
                          ) : (
                            <span className="text-foreground/30 font-normal">—</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="w-14 shrink-0 flex items-center justify-center gap-0.5 px-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            onClick={() => handleQuickAdd(item)}
                            title="Add to table"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => deleteMutation.mutate(item.id)}
                            title="Delete from catalog"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>

      {/* ── Add Line Item Modal ── */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Create Additional Line Item</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Define a prebuilt item for this catalog. Drag it into any invoice or section at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-semibold">Display Label</Label>
              <Input
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (!rowToken || rowToken === label.toUpperCase().replace(/[^A-Z0-9_]/g, "_")) {
                    setRowToken(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
                  }
                }}
                placeholder="e.g. Mobile Crane Rental"
                className="h-8 text-xs mt-1"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Canonical Token Key</Label>
              <Input
                value={rowToken}
                onChange={(e) =>
                  setRowToken(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))
                }
                placeholder="e.g. CRANE_RENTAL"
                className="h-8 text-xs font-mono mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Calculation Type</Label>
                <Select
                  value={valueType}
                  onValueChange={(v: "normal" | "formula") => setValueType(v)}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal (Numeric Rate)</SelectItem>
                    <SelectItem value="formula">Formula (AST Math)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  {valueType === "formula" ? "Formula Expression" : "Default Rate / Value"}
                </Label>
                {valueType === "formula" ? (
                  <Input
                    value={formula}
                    onChange={(e) => setFormula(e.target.value.toUpperCase())}
                    placeholder="e.g. ROW_1 * 0.15"
                    className="h-8 text-xs font-mono mt-1"
                  />
                ) : (
                  <Input
                    type="number"
                    value={initialValue}
                    onChange={(e) => setInitialValue(e.target.value)}
                    placeholder="0.00"
                    className="h-8 text-xs font-mono mt-1"
                  />
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Sub-Description (Optional)</Label>
              <Input
                value={subDescription}
                onChange={(e) => setSubDescription(e.target.value)}
                placeholder="e.g. As per operational lifting tariff"
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={addMutation.isPending || !label.trim() || !rowToken.trim()}
              onClick={() => addMutation.mutate()}
              className="text-xs h-8 gap-1.5"
            >
              {addMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Line Item</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
