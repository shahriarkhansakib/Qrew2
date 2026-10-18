"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Layers, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { Badge } from "@/components/ui/badge";
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

interface TemplateOptionalRowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
}

export function TemplateOptionalRowsModal({
  isOpen,
  onClose,
  templateId,
}: TemplateOptionalRowsModalProps) {
  const queryClient = useQueryClient();

  const [rowToken, setRowToken] = useState("");
  const [label, setLabel] = useState("");
  const [subDescription, setSubDescription] = useState("");
  const [valueType, setValueType] = useState<"normal" | "formula">("normal");
  const [initialValue, setInitialValue] = useState("");
  const [formula, setFormula] = useState("");

  // 1. Fetch catalog
  const { data: catalog, isLoading } = useQuery({
    queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
    queryFn: () => invoiceApi.getTemplateOptionalRows(templateId),
    enabled: isOpen && !!templateId,
  });

  const items: any[] = Array.isArray(catalog) ? catalog : [];

  // Add Mutation
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

      return invoiceApi.addTemplateOptionalRow(templateId, payload);
    },
    onSuccess: (res) => {
      toast.success(`Service "${res.rowToken || rowToken}" added to catalog`);
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
      });
      // Reset form
      setRowToken("");
      setLabel("");
      setSubDescription("");
      setValueType("normal");
      setInitialValue("");
      setFormula("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add optional service");
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (tokenToDelete: string) => {
      return invoiceApi.deleteTemplateOptionalRow(templateId, tokenToDelete);
    },
    onSuccess: () => {
      toast.success("Service removed from catalog");
      queryClient.invalidateQueries({
        queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
      });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete optional service");
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Prebuilt Optional Services Catalog
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Define pre-configured optional line items (crane rental, fumigation, pilotage) that
                staff can select and insert into draft invoices.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Current Catalog Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Configured Services ({items.length})
              </Label>
              <span className="text-[11px] text-muted-foreground">
                Tokens are immutable once added to invoice drafts
              </span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading catalog…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-1.5 border border-dashed rounded-lg bg-muted/20">
                <Info className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-xs font-medium text-foreground">
                  No Optional Services Configured
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm">
                  Add optional service items below to let staff attach standard services without
                  manually authoring formulas or inventing duplicate tokens.
                </p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y divide-border overflow-hidden bg-card">
                {items.map((item: any) => (
                  <div
                    key={item.id || item.rowToken}
                    className="flex items-center justify-between p-3 gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {item.label}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                          {item.rowToken}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                          {item.valueType === "formula" ? "Formula" : "Manual Rate"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                        {item.valueType === "formula" ? (
                          <span className="font-mono">fx: {item.formula || "—"}</span>
                        ) : (
                          <span>Default: ${item.initialValue ?? "0.00"}</span>
                        )}
                        {item.subDescription && (
                          <span className="truncate italic">• {item.subDescription}</span>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteMutation.mutate(item.rowToken)}
                      disabled={deleteMutation.isPending}
                      title="Delete service definition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Define New Service Form */}
          <div className="p-4 rounded-lg border bg-muted/10 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Define New Service Item
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Token Name */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Canonical Token <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={rowToken}
                  onChange={(e) =>
                    setRowToken(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))
                  }
                  placeholder="e.g. CRANE_RENTAL"
                  className="h-8 font-mono text-xs bg-background"
                />
                <p className="text-[10px] text-muted-foreground">
                  UPPER_SNAKE_CASE identifier used in mathematical DAG formulas.
                </p>
              </div>

              {/* Display Label */}
              <div className="space-y-1">
                <Label className="text-xs">
                  Display Label <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Mobile Crane Rental"
                  className="h-8 text-xs bg-background"
                />
                <p className="text-[10px] text-muted-foreground">
                  Standard line item title shown on invoices and client PDFs.
                </p>
              </div>

              {/* Value Type */}
              <div className="space-y-1">
                <Label className="text-xs">Value Type</Label>
                <Select
                  value={valueType}
                  onValueChange={(val: "normal" | "formula") => setValueType(val)}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal" className="text-xs">
                      Normal (Manual / Fixed Rate)
                    </SelectItem>
                    <SelectItem value="formula" className="text-xs">
                      Formula (AST Evaluated)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Initial Value or Formula */}
              {valueType === "normal" ? (
                <div className="space-y-1">
                  <Label className="text-xs">Default Rate ($)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={initialValue}
                    onChange={(e) => setInitialValue(e.target.value)}
                    placeholder="e.g. 500.00"
                    className="h-8 text-xs bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Optional fallback rate. Staff can modify this when adding to drafts.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">
                    Formula Expression <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={formula}
                    onChange={(e) => setFormula(e.target.value.toUpperCase())}
                    placeholder="e.g. PORT_DUES * 0.15"
                    className="h-8 font-mono text-xs bg-background"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Valid arithmetic expression referencing other tokens or functions.
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs">Sub-Description (Optional)</Label>
              <Textarea
                value={subDescription}
                onChange={(e) => setSubDescription(e.target.value)}
                placeholder="Operational notes, specifications, or conditions for this optional service…"
                className="h-16 text-xs bg-background resize-none"
              />
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={!rowToken.trim() || !label.trim() || addMutation.isPending}
                className="gap-1.5 h-8 text-xs"
              >
                {addMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" /> Add to Catalog
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
