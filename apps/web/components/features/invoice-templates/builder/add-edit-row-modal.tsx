"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Layers, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "./builder-context";

// ─── Token input rules ────────────────────────────────────────────────────────
/**
 * Applies token formatting rules:
 *   - Uppercases letters
 *   - Converts space to underscore
 *   - Strips anything that isn't A-Z, 0-9, or _
 *   - Collapses consecutive underscores
 *   - Strips leading underscores
 * Trailing underscore is allowed while typing (validated on submit).
 */
function processTokenInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/ /g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/^_+/, "")
    .replace(/_+/g, "_");
}

function validateToken(token: string): string | null {
  if (!token) return "Token is required";
  if (token.startsWith("_")) return "Token cannot start with an underscore";
  if (token.endsWith("_")) return "Token cannot end with an underscore";
  if (/__/.test(token)) return "Consecutive underscores are not allowed";
  if (!/^[A-Z0-9_]+$/.test(token))
    return "Only letters A–Z, digits 0–9, and underscore are allowed";
  return null;
}

export function formatTokenToLabel(token: string): string {
  return token
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ─── Main Unified Modal Component ───────────────────────────────────────────

export function AddEditRowModal({
  isOpen,
  onClose,
  templateId,
  draftId,
  sectionId,
  sectionToken,
  editRow,
  isCatalog = false,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  templateId?: string;
  draftId?: string;
  sectionId?: string;
  sectionToken?: string;
  editRow?: any;
  isCatalog?: boolean;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const { apiBasePath, mode, invalidateKey, sections } = useBuilderContext();
  const isEdit = Boolean(editRow);

  const [rowToken, setRowToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Target Section selector (defaults to props sectionId, or first section)
  const [targetSectionId, setTargetSectionId] = useState(sectionId || "");

  // Fetch catalog (enabled whenever modal is open)
  const { data: rawCatalog = [] } = useQuery({
    queryKey: templateId
      ? invoiceKeys.optionalRows.byTemplate(templateId)
      : invoiceKeys.optionalRows.byDraft(draftId || ""),
    queryFn: () => {
      if (templateId) return invoiceApi.getTemplateOptionalRows(templateId);
      if (draftId) return invoiceApi.getDraftOptionalRows(draftId);
      return [];
    },
    enabled: Boolean((templateId || draftId) && isOpen),
  });

  const catalog: any[] = Array.isArray(rawCatalog) ? rawCatalog : [];

  // Source Mode: 'catalog' | 'new' (for adding table rows)
  const [sourceMode, setSourceMode] = useState<"catalog" | "new">("new");
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");

  // ── Pre-fill when editing or opening ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setTargetSectionId(sectionId || (sections && sections[0]?.id) || "");
    if (editRow) {
      setRowToken(editRow.rowToken ?? "");
      setSourceMode("new");
    } else {
      setRowToken("");
      setSourceMode("new");
      if (catalog.length > 0) {
        setSelectedCatalogId(catalog[0].id || catalog[0].rowToken || "");
      } else {
        setSelectedCatalogId("");
      }
    }
    setTokenError("");
    setTimeout(() => tokenInputRef.current?.focus(), 60);
  }, [isOpen, editRow, sectionId, isCatalog, catalog.length, sections]);

  // ── Unified Mutation ───────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async () => {
      // 1. Adding row from catalog to main table
      if (!isCatalog && !isEdit && sourceMode === "catalog") {
        const item = catalog.find(
          (c: any) => (c.id || c.rowToken) === selectedCatalogId,
        );
        if (!item) throw new Error("Please select a line item from the catalog");

        const effectiveSectionId = targetSectionId || sectionId;
        if (!effectiveSectionId) throw new Error("Target section is required");

        const sectionsData =
          queryClient.getQueryData<any[]>(invalidateKey) || sections || [];
        const existingTokens = new Set<string>();
        for (const s of sectionsData) {
          for (const r of s.rows || []) {
            if (r.rowToken) existingTokens.add(r.rowToken);
          }
        }

        let uniqueToken = item.rowToken;
        let counter = 2;
        while (existingTokens.has(uniqueToken)) {
          uniqueToken = `${item.rowToken}_${counter}`;
          counter++;
        }

        const hasFormula = Boolean(item.formula && item.formula.trim());
        const res = await fetch(
          `${apiBasePath}/sections/${effectiveSectionId}/rows`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              rowToken: uniqueToken,
              label: item.label,
              description: item.subDescription || null,
              valueType: hasFormula ? "formula" : item.valueType || "normal",
              formula: hasFormula ? item.formula.trim() : null,
              initialValue:
                !hasFormula && item.initialValue != null
                  ? String(item.initialValue)
                  : null,
              isOptional: true,
            }),
          },
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to add row from catalog");
        }
        return { ...data, rowToken: uniqueToken, label: item.label };
      }

      // 2. Standard token-based workflow (New row, Edit row, or Catalog item)
      const trimmedToken = rowToken.trim();
      const finalLabel = formatTokenToLabel(trimmedToken);

      if (isCatalog) {
        if (isEdit && editRow) {
          if (templateId) {
            return invoiceApi.updateTemplateOptionalRow(
              templateId,
              editRow.id || editRow.rowToken,
              {
                rowToken: trimmedToken,
                label: editRow.label || finalLabel,
                subDescription: editRow.subDescription || null,
                formula: editRow.formula || null,
                initialValue:
                  editRow.initialValue != null ? String(editRow.initialValue) : null,
              },
            );
          }
        } else {
          const catalogPayload = {
            rowToken: trimmedToken,
            label: finalLabel,
            subDescription: null,
            valueType: "normal" as const,
            formula: null,
            initialValue: null,
          };

          if (templateId) {
            return invoiceApi.addTemplateOptionalRow(templateId, catalogPayload);
          }
          if (draftId) {
            return invoiceApi.addDraftOptionalRow(draftId, {
              canonicalToken: trimmedToken,
              customLabel: finalLabel,
            });
          }
        }
        throw new Error("Missing templateId or draftId for catalog row");
      }

      // Section Row workflow (Main Table)
      const effectiveSectionId = targetSectionId || sectionId;
      if (!effectiveSectionId) throw new Error("Section ID required for main table row");

      const sectionPayload: Record<string, any> = isEdit
        ? {
            rowToken: trimmedToken,
          }
        : {
            rowToken: trimmedToken,
            label: finalLabel,
            description: null,
            valueType: "normal",
            formula: null,
            initialValue: null,
          };

      const url = isEdit
        ? `${apiBasePath}/sections/${sectionId}/rows/${editRow.id}`
        : `${apiBasePath}/sections/${effectiveSectionId}/rows`;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sectionPayload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) setTokenError(data.error ?? "Token already in use");
        throw new Error(data.error ?? "Failed to save row");
      }
      return data;
    },
    onSuccess: (data: any) => {
      const tokenName = data?.rowToken || rowToken;
      if (isCatalog) {
        toast.success(`Additional line item "${tokenName}" saved to catalog`);
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
      } else {
        toast.success(isEdit ? "Row updated" : `Row "${tokenName}" added`);
        queryClient.invalidateQueries({ queryKey: invalidateKey });
      }
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      if (!err.message?.includes("conflict") && !err.message?.includes("already exists")) {
        toast.error(err.message ?? "Failed to save row");
      }
    },
  });

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError("");

    if (!isCatalog && !isEdit && sourceMode === "catalog") {
      if (!selectedCatalogId) {
        setTokenError("Please select a line item from the catalog");
        return;
      }
      mutation.mutate();
      return;
    }

    const err = validateToken(rowToken);
    if (err) {
      setTokenError(err);
      return;
    }

    const trimmedToken = rowToken.trim();

    // ── Duplicate prevention check ──────────────────────────────────────────
    if (isCatalog) {
      const isDuplicate = catalog.some(
        (c: any) => c.rowToken === trimmedToken && (!isEdit || c.id !== editRow?.id),
      );
      if (isDuplicate) {
        setTokenError(
          `An additional line item with token "${trimmedToken}" already exists in the catalog.`,
        );
        return;
      }
    } else {
      const sectionsData = queryClient.getQueryData<any[]>(invalidateKey) || [];
      const isDuplicate = sectionsData.some((sec: any) =>
        (sec.rows || []).some(
          (r: any) => r.rowToken === trimmedToken && (!isEdit || r.id !== editRow?.id),
        ),
      );
      if (isDuplicate) {
        setTokenError(`A row with token "${trimmedToken}" already exists in this template.`);
        return;
      }
    }

    mutation.mutate();
  };

  // ── Token input handler ────────────────────────────────────────────────────
  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const processed = processTokenInput(e.target.value);
    setRowToken(processed);
    setTokenError("");
  };

  const handleTokenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.preventDefault();
      const input = e.currentTarget;
      const pos = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, pos);
      const after = input.value.slice(input.selectionEnd ?? pos);
      if (before && !before.endsWith("_")) {
        const next = processTokenInput(`${before}_${after}`);
        setRowToken(next);
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.closest("form")?.requestSubmit();
    }
  };

  // Target Section name helper
  const targetSection = sections?.find((s: any) => s.id === targetSectionId);
  const displaySectionName =
    targetSection?.sectionToken || targetSection?.name || sectionToken || "Section";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto max-w-sm")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isCatalog ? <Layers className="w-4 h-4 text-primary" /> : null}
            <span>
              {isEdit
                ? "Edit Token"
                : isCatalog
                  ? "New Additional Line Item"
                  : `Add Row to ${displaySectionName}`}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isCatalog
              ? "Enter the canonical token. Display label will be deduced automatically."
              : "Choose an existing line item from the catalog or define a new token."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Mode Switcher: Create New Token vs From Line Items (when adding to table) ── */}
          {!isCatalog && !isEdit && catalog.length > 0 && (
            <div className="flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/50 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSourceMode("new");
                  setTokenError("");
                  setTimeout(() => tokenInputRef.current?.focus(), 50);
                }}
                className={cn(
                  "flex-1 py-1 px-2 rounded-md font-medium transition-all text-center",
                  sourceMode === "new"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Create New Token
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceMode("catalog");
                  setTokenError("");
                  if (!selectedCatalogId && catalog.length > 0) {
                    setSelectedCatalogId(catalog[0].id || catalog[0].rowToken || "");
                  }
                }}
                className={cn(
                  "flex-1 py-1 px-2 rounded-md font-medium transition-all text-center",
                  sourceMode === "catalog"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                From Line Items ({catalog.length})
              </button>
            </div>
          )}

          {/* ── Case A: Select from Catalog ── */}
          {!isCatalog && !isEdit && sourceMode === "catalog" && catalog.length > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Line Item *</Label>
              <Select
                value={selectedCatalogId}
                onValueChange={(val) => {
                  setSelectedCatalogId(val);
                  setTokenError("");
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose a line item..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {catalog.map((item: any) => (
                    <SelectItem
                      key={item.id || item.rowToken}
                      value={item.id || item.rowToken}
                      className="text-xs"
                    >
                      <div className="flex items-center gap-2 w-full justify-between">
                        <span className="font-mono text-[11px] font-semibold text-primary">
                          {item.rowToken}
                        </span>
                        <span className="font-medium text-foreground truncate max-w-[140px]">
                          {item.label}
                        </span>
                        {item.formula ? (
                          <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1 py-0.2 rounded shrink-0">
                            fx
                          </span>
                        ) : item.initialValue != null && item.initialValue !== "" ? (
                          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                            ${item.initialValue}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tokenError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {tokenError}
                </p>
              )}
            </div>
          ) : (
            /* ── Case B: Manual Token Input (New Token, Edit Token, or Catalog Item) ── */
            <div className="space-y-1.5">
              <Label htmlFor="rowToken" className="text-xs font-semibold">
                Canonical Token *
                {isEdit && (
                  <span className="text-muted-foreground/50 text-xs ml-2 font-normal">
                    (referenced by formulas)
                  </span>
                )}
              </Label>
              <Input
                id="rowToken"
                ref={tokenInputRef}
                value={rowToken}
                onChange={handleTokenChange}
                onKeyDown={handleTokenKeyDown}
                placeholder="e.g. CRANE_RENTAL"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "font-mono tracking-wide h-9 text-xs",
                  tokenError && "border-destructive focus-visible:ring-destructive",
                )}
                readOnly={mode === "draft" && !isCatalog && isEdit}
                disabled={mode === "draft" && !isCatalog && isEdit}
                required
              />
              {tokenError ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {tokenError}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground/50">
                  Upper-snake uppercase (e.g. PILOTAGE_DUES). Space auto-converts to _.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                mutation.isPending ||
                (!isCatalog && !isEdit && sourceMode === "catalog"
                  ? !selectedCatalogId
                  : !rowToken.trim())
              }
              className="h-8 text-xs gap-1.5"
            >
              {mutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              )}
              {isEdit ? "Save changes" : isCatalog ? "Save to Catalog" : "Add Row"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
