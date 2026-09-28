"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// ─── Main Modal Component ───────────────────────────────────────────────────

export function AddEditRowModal({
  isOpen,
  onClose,
  templateId,
  sectionId,
  sectionToken,
  editRow,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  sectionId: string;
  sectionToken: string;
  editRow?: any;
  onSuccess?: () => void;
}) {
  const { apiBasePath, mode } = useBuilderContext();
  const isEdit = !!editRow;

  const [rowToken, setRowToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // ── Pre-fill when editing ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (editRow) {
      setRowToken(editRow.rowToken ?? "");
    } else {
      setRowToken("");
    }
    setTokenError("");
    // Auto-focus the token input
    setTimeout(() => tokenInputRef.current?.focus(), 50);
  }, [isOpen, editRow]);

  // ── Mutation ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = isEdit
        ? `${apiBasePath}/sections/${sectionId}/rows/${editRow.id}`
        : `${apiBasePath}/sections/${sectionId}/rows`;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setTokenError(data.error ?? "Token already in use");
        throw new Error(data.error ?? "Failed to save row");
      }
      return data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Token updated" : "Row created");
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      if (!err.message?.includes("conflict") && !err.message?.includes("Token")) {
        toast.error(err.message ?? "Failed to save row");
      }
    },
  });

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError("");

    const err = validateToken(rowToken);
    if (err) {
      setTokenError(err);
      return;
    }

    const formatTokenToLabel = (token: string) => {
      return token
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    };

    const payload: any = {
      rowToken,
      label: isEdit ? (editRow.label ?? "") : formatTokenToLabel(rowToken),
    };

    mutation.mutate(payload);
  };

  // ── Token input handler ────────────────────────────────────────────────────
  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowToken(processTokenInput(e.target.value));
    setTokenError("");
  };

  /**
   * Handle Space key explicitly — converts to underscore with immediate feedback,
   * and prevents the browser's default space-in-input behaviour.
   */
  const handleTokenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.preventDefault();
      const input = e.currentTarget;
      const pos = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, pos);
      const after = input.value.slice(input.selectionEnd ?? pos);
      // Only insert underscore if the previous char isn't already one and the field isn't empty
      if (before && !before.endsWith("_")) {
        setRowToken(processTokenInput(`${before}_${after}`));
      }
    }
    // Submit on Enter when in create mode and the form only has the token field
    if (e.key === "Enter" && !isEdit) {
      e.preventDefault();
      e.currentTarget.closest("form")?.requestSubmit();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", "max-w-sm")}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Token" : "Add Row"}</DialogTitle>
          {!isEdit && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Enter the row token and press{" "}
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>. The label is
              filled in directly on the table after creation.
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Token field (always shown) ── */}
          <div className="space-y-1.5">
            <Label htmlFor="rowToken">
              Token *
              {isEdit && (
                <span className="text-muted-foreground/50 text-xs ml-2">
                  (changing the name is safe)
                </span>
              )}
            </Label>
            <Input
              id="rowToken"
              ref={tokenInputRef}
              value={rowToken}
              onChange={handleTokenChange}
              onKeyDown={handleTokenKeyDown}
              placeholder="e.g. PORT_DUES"
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "font-mono tracking-wide",
                tokenError && "border-destructive focus-visible:ring-destructive",
              )}
              readOnly={mode === "draft"}
              disabled={mode === "draft"}
              required
              autoFocus
            />
            {tokenError ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" /> {tokenError}
              </p>
            ) : rowToken ? (
              <p className="text-[11px] text-muted-foreground/50">
                Use <code className="font-mono bg-muted/50 px-1 rounded">{rowToken}_TOTAL</code> to
                reference this row's total in other formulas.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/40">
                Letters A–Z, digits 0–9, underscore. Space auto-converts to _.
              </p>
            )}
          </div>

          {/* ── Create mode hint ── */}
          {!isEdit && (
            <p className="text-xs text-muted-foreground/50 bg-muted/20 rounded p-2">
              💡 After creating the row, click its label cell to type a label inline, and click the
              value cell to enter a formula. Charges can be added via the edit button.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEdit ? "Save changes" : "Add row"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
