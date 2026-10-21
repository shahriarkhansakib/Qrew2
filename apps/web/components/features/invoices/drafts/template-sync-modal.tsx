"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, GitMerge, Info, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { invoiceApi } from "../shared/invoice-api";
import { invoiceKeys } from "../shared/invoice-keys";

export interface TemplateSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftId: string;
  syncStatus?: {
    hasTemplateDrift?: boolean;
    templateId?: string;
    templateName?: string;
    templateVersion?: number;
    draftTemplateVersion?: number;
    templateUpdatedAt?: string;
    changes?: {
      formulaUpdates?: string[];
      addedRows?: string[];
      addedSections?: string[];
    };
  } | null;
  onSuccess?: () => void;
}

export function TemplateSyncModal({
  isOpen,
  onClose,
  draftId,
  syncStatus,
  onSuccess,
}: TemplateSyncModalProps) {
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: () => invoiceApi.syncDraftWithTemplate(draftId),
    onSuccess: (data: any) => {
      toast.success(data.message || "Draft synchronized with master template!");
      queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
      queryClient.invalidateQueries({ queryKey: ["draft-sections", draftId] });
      queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.drafts.syncStatus(draftId) });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to synchronize draft with master template");
    },
  });

  const formulaUpdates = syncStatus?.changes?.formulaUpdates || [];
  const addedRows = syncStatus?.changes?.addedRows || [];
  const addedSections = syncStatus?.changes?.addedSections || [];
  const totalChanges = formulaUpdates.length + addedRows.length + addedSections.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <GitMerge className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Synchronize with Master Template
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>
                  Synchronize with{" "}
                  <strong className="text-foreground">
                    {syncStatus?.templateName || "Master Template"}
                  </strong>{" "}
                  (v{syncStatus?.templateVersion ?? 1})
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded cursor-pointer"
                        aria-label="Merge info"
                      >
                        <Info className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs p-2.5 z-50">
                      <p className="font-semibold text-emerald-500 mb-1">
                        Non-Destructive 3-Way Merge
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        Your manual numeric rates, custom item labels, and optional line items are
                        strictly preserved. Only base formulas and new template items are integrated.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {/* Change Breakdown: Strictly list changes from master template */}
          {totalChanges > 0 ? (
            <div className="rounded-lg border border-border/70 p-3 space-y-2 bg-muted/20 text-xs">
              <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider block">
                Template Changes to Integrate ({totalChanges})
              </span>

              {formulaUpdates.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Updated Formulas ({formulaUpdates.length})
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {formulaUpdates.map((tok, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono text-foreground/80"
                      >
                        {tok}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {addedRows.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/40">
                  <span className="text-[11px] font-medium text-primary flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> New Rows Added ({addedRows.length})
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {addedRows.map((tok, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded bg-background border text-[10px] font-mono text-foreground/80"
                      >
                        {tok}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {addedSections.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/40">
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    New Sections Added ({addedSections.length}): {addedSections.join(", ")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-border/60 bg-muted/20 text-xs text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                Calculations and line items match master template v
                {syncStatus?.templateVersion ?? 1}.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={syncMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 border border-emerald-600 shadow-xs"
          >
            {syncMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <GitMerge className="w-3.5 h-3.5" />
                <span>Sync with Master</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
