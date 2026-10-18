"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Layers, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { cn } from "@/lib/utils";
import { invoiceApi } from "../shared/invoice-api";
import { invoiceKeys } from "../shared/invoice-keys";

interface AddOptionalServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftId: string;
  sections: Array<{
    id: string;
    sectionToken: string;
    headerName?: string;
    sortOrder?: number;
  }>;
  onSuccess?: () => void;
}

export function AddOptionalServiceModal({
  isOpen,
  onClose,
  draftId,
  sections = [],
  onSuccess,
}: AddOptionalServiceModalProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [customLabel, setCustomLabel] = useState("");
  const [customValue, setCustomValue] = useState("");

  // 1. Fetch available optional rows and attached count
  const { data, isLoading } = useQuery({
    queryKey: invoiceKeys.optionalRows.byDraft(draftId),
    queryFn: () => invoiceApi.getDraftOptionalRows(draftId),
    enabled: isOpen && !!draftId,
  });

  const available: any[] = data?.available || [];
  const attached: any[] = data?.attached || [];

  // Sort sections by sortOrder
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [sections]);

  // Set default section on load or open
  useEffect(() => {
    if (sortedSections.length > 0 && !selectedSectionId) {
      setSelectedSectionId(sortedSections[0].id);
    }
  }, [sortedSections, selectedSectionId]);

  // Count how many times each token is already attached
  const attachedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of attached) {
      const canonical = row.canonicalToken || row.token?.replace(/_\d+$/, "");
      if (canonical) {
        counts[canonical] = (counts[canonical] || 0) + 1;
      }
    }
    return counts;
  }, [attached]);

  // Filtered catalog items
  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) return available;
    const q = searchQuery.toLowerCase();
    return available.filter((item: any) => {
      const token = (item.rowToken || "").toLowerCase();
      const label = (item.label || "").toLowerCase();
      const desc = (item.subDescription || "").toLowerCase();
      return token.includes(q) || label.includes(q) || desc.includes(q);
    });
  }, [available, searchQuery]);

  // When a service is picked, pre-fill label and value
  const activeService = useMemo(() => {
    return available.find((item: any) => item.rowToken === selectedToken) || null;
  }, [available, selectedToken]);

  const handleSelectService = (item: any) => {
    setSelectedToken(item.rowToken);
    setCustomLabel(item.label || "");
    setCustomValue(item.initialValue != null ? String(item.initialValue) : "");
    if (item.suggestedSectionToken) {
      const matched = sortedSections.find(
        (s) => s.sectionToken.toUpperCase() === item.suggestedSectionToken.toUpperCase(),
      );
      if (matched) {
        setSelectedSectionId(matched.id);
      }
    }
  };

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSelectedToken(null);
      setCustomLabel("");
      setCustomValue("");
      setSearchQuery("");
    }
  }, [isOpen]);

  // Mutation to add service row
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedToken) throw new Error("Please select a service item");
      if (!selectedSectionId) throw new Error("Please select a destination section");

      const parsedVal = customValue.trim() !== "" ? parseFloat(customValue) : undefined;
      return invoiceApi.addDraftOptionalRow(draftId, {
        canonicalToken: selectedToken,
        sectionId: selectedSectionId,
        customLabel: customLabel.trim() || undefined,
        customValue: !Number.isNaN(parsedVal as number) ? parsedVal : undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(`Service row "${res.allocatedToken}" added to invoice`);
      queryClient.invalidateQueries({ queryKey: ["draft-sections", draftId] });
      queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
      queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.optionalRows.byDraft(draftId) });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add optional service row");
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Add Prebuilt Optional Service
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Attach an optional service item to this invoice draft with its preconfigured
                formulas or rates.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading available services…</span>
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 border border-dashed rounded-lg bg-muted/20">
              <Info className="h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">No Optional Services Defined</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                This template currently has no prebuilt optional services configured. Template
                Architects can add catalog items in the Master Template Builder.
              </p>
            </div>
          ) : (
            <>
              {/* Search filter */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search services by name or token…"
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Service Cards Grid */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Available Catalog Items ({filteredServices.length})
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                  {filteredServices.map((item: any) => {
                    const isSelected = selectedToken === item.rowToken;
                    const attachCount = attachedCounts[item.rowToken] || 0;

                    return (
                      <div
                        key={item.id || item.rowToken}
                        onClick={() => handleSelectService(item)}
                        className={cn(
                          "flex flex-col justify-between p-3 rounded-lg border text-left cursor-pointer transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-foreground block truncate">
                              {item.label}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground block truncate mt-0.5">
                              {item.rowToken}
                            </span>
                          </div>
                          {isSelected ? (
                            <div className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                              <Check className="h-2.5 w-2.5" />
                            </div>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] px-1.5 py-0 shrink-0 font-mono",
                                item.valueType === "formula"
                                  ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                              )}
                            >
                              {item.valueType === "formula" ? "Formula" : "Manual"}
                            </Badge>
                          )}
                        </div>

                        {item.subDescription && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1.5">
                            {item.subDescription}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/50">
                          <span>
                            {item.valueType === "formula"
                              ? `fx: ${item.formula || "—"}`
                              : `Default: $${item.initialValue ?? "0.00"}`}
                          </span>
                          {attachCount > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                            >
                              Attached ({attachCount})
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Configuration panel when a service is selected */}
              {activeService && (
                <div className="p-4 rounded-lg border bg-muted/20 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Service Configuration
                    </span>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      Token:{" "}
                      {attachedCounts[activeService.rowToken]
                        ? `${activeService.rowToken}_${attachedCounts[activeService.rowToken] + 1}`
                        : activeService.rowToken}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Destination Section */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Destination Section</Label>
                      <Select
                        value={selectedSectionId}
                        onValueChange={(val) => setSelectedSectionId(val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue placeholder="Select section…" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedSections.map((sec) => (
                            <SelectItem key={sec.id} value={sec.id} className="text-xs">
                              {sec.headerName || sec.sectionToken}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Rate / Initial Value (if normal valueType) */}
                    {activeService.valueType === "normal" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Initial Rate / Value ($)</Label>
                        <Input
                          type="number"
                          step="any"
                          value={customValue}
                          onChange={(e) => setCustomValue(e.target.value)}
                          placeholder="e.g. 500.00"
                          className="h-8 text-xs bg-background"
                        />
                      </div>
                    )}

                    {/* Formula notice if formula valueType */}
                    {activeService.valueType === "formula" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Prebuilt Formula</Label>
                        <div className="h-8 px-2 flex items-center rounded-md border bg-muted/40 font-mono text-xs text-foreground truncate select-all">
                          {activeService.formula || "—"}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Label Override */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Custom Line Item Label</Label>
                    <Input
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="e.g. Mobile Crane 50T - Pier 4"
                      className="h-8 text-xs bg-background"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      The label displayed on the invoice and exported PDF. Token remains locked.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/10 gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={addMutation.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => addMutation.mutate()}
            disabled={!selectedToken || !selectedSectionId || addMutation.isPending}
            className="gap-1.5"
          >
            {addMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Add to Invoice
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
