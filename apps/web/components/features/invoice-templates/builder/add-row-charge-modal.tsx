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
import { parseChargeFormula } from "@/lib/charge-formula-parser";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "./builder-context";

// ─── Token helpers (same rules as add-edit-row-modal) ────────────────────────
function processTokenSuffix(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/ /g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/^_+/, "")
    .replace(/_+/g, "_");
}

function validateSuffix(suffix: string): string | null {
  if (!suffix) return "Token suffix is required";
  if (suffix.startsWith("_")) return "Suffix cannot start with an underscore";
  if (suffix.endsWith("_")) return "Suffix cannot end with an underscore";
  if (/__/.test(suffix)) return "Consecutive underscores are not allowed";
  if (!/^[A-Z0-9_]+$/.test(suffix))
    return "Only letters A–Z, digits 0–9, and underscore are allowed";
  return null;
}

function formatTokenToLabel(token: string): string {
  return token
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function AddRowChargeModal({
  isOpen,
  onClose,
  templateId,
  sectionId,
  rowId,
  rowToken,
  existingCharges,
  editCharge,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
  sectionId: string;
  rowId: string;
  rowToken: string;
  existingCharges: any[];
  editCharge?: any;
  onSuccess?: () => void;
}) {
  const { apiBasePath } = useBuilderContext();
  const isEdit = !!editCharge;
  const [suffix, setSuffix] = useState("");
  const [rate, setRate] = useState("15");
  const [tokenError, setTokenError] = useState("");
  const [rateError, setRateError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Full charge token = PREFIX + suffix
  const prefix = `${rowToken}_`;
  const fullToken = suffix ? `${prefix}${suffix}` : "";
  const baseToken = `${rowToken}_BASE`;

  useEffect(() => {
    if (!isOpen) return;

    // Reset tokens
    if (isEdit && editCharge.chargeToken) {
      setSuffix(
        editCharge.chargeToken.startsWith(prefix)
          ? editCharge.chargeToken.replace(prefix, "")
          : editCharge.chargeToken,
      );
      setTokenError("");
    } else {
      setSuffix("");
      setTokenError("");
    }

    // Init rate
    if (isEdit && editCharge.formula) {
      const parsed = parseChargeFormula(editCharge.formula, baseToken);
      if (parsed) {
        setRate(String(parsed.value));
      } else {
        // Fallback: extract first number if possible or default to 15
        const numMatch = editCharge.formula.match(/(\d+(?:\.\d+)?)/);
        setRate(numMatch ? numMatch[1] : "15");
      }
    } else {
      setRate("15");
    }
    setRateError("");

    setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen, isEdit, editCharge, prefix, baseToken]);

  const mutation = useMutation({
    mutationFn: async () => {
      const finalFormula = `${baseToken} * ${rate}%`;

      if (isEdit) {
        // PATCH /rows/:rowId/charges/:chargeId
        // Token and label are INDEPENDENT: do NOT touch label here
        const res = await fetch(
          `${apiBasePath}/sections/${sectionId}/rows/${rowId}/charges/${editCharge.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ chargeToken: fullToken, formula: finalFormula }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) setTokenError(data.error ?? "Token already in use");
          throw new Error(data.error ?? "Failed to update charge token");
        }
        return data;
      } else {
        // POST /rows/:rowId/charges
        const newCharge = {
          chargeToken: fullToken,
          label: formatTokenToLabel(suffix),
          formula: finalFormula,
          orderIndex: existingCharges.length,
        };
        const res = await fetch(`${apiBasePath}/sections/${sectionId}/rows/${rowId}/charges`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(newCharge),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) setTokenError(data.error ?? "Token already in use");
          throw new Error(data.error ?? "Failed to add charge");
        }
        return data;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Charge updated" : "Charge added");
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      if (!err.message?.includes("Token") && !err.message?.includes("token")) {
        toast.error(err.message ?? "Failed to save charge");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError("");
    setRateError("");

    const suffixErr = validateSuffix(suffix);
    if (suffixErr) {
      setTokenError(suffixErr);
      return;
    }

    const num = parseFloat(rate);
    if (Number.isNaN(num) || num < 0) {
      setRateError("Please enter a valid rate percentage");
      return;
    }

    mutation.mutate();
  };

  const handleSuffixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuffix(processTokenSuffix(e.target.value));
    setTokenError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.preventDefault();
      const input = e.currentTarget;
      const pos = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, pos);
      const after = input.value.slice(input.selectionEnd ?? pos);
      if (before && !before.endsWith("_")) {
        setSuffix(processTokenSuffix(`${before}_${after}`));
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.closest("form")?.requestSubmit();
    }
  };

  const isPending = mutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Row Charge" : "Add Row Charge"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Token Suffix */}
          <div className="space-y-1.5">
            <Label htmlFor="chargeTokenSuffix">Charge Token *</Label>

            <div
              className={cn(
                "flex items-center rounded-md border bg-background overflow-hidden",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
                tokenError && "border-destructive focus-within:ring-destructive",
              )}
            >
              <span className="pl-3 pr-1 text-sm font-mono text-muted-foreground select-none shrink-0 bg-muted/40 h-9 flex items-center border-r">
                {prefix}
              </span>
              <input
                id="chargeTokenSuffix"
                ref={inputRef}
                value={suffix}
                onChange={handleSuffixChange}
                onKeyDown={handleKeyDown}
                placeholder="VAT_15"
                autoComplete="off"
                spellCheck={false}
                className={cn(
                  "flex-1 h-9 px-3 text-sm font-mono tracking-wide bg-transparent",
                  "border-none outline-none focus:outline-none",
                )}
              />
            </div>

            {tokenError ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" /> {tokenError}
              </p>
            ) : fullToken ? (
              <p className="text-[11px] text-muted-foreground/50">
                Token: <code className="font-mono bg-muted/50 px-1 rounded">{fullToken}</code>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/40">
                Letters A–Z, digits 0–9, underscore. Space auto-converts to _.
              </p>
            )}
          </div>

          {/* Rate Formula */}
          <div className="space-y-1.5">
            <Label htmlFor="chargeRate">Charge Rate *</Label>

            <div className="flex items-center gap-2">
              <div className="bg-muted text-muted-foreground text-xs font-mono px-2.5 h-9 flex items-center rounded-md border font-medium select-none shrink-0">
                {baseToken}
              </div>

              <span className="text-muted-foreground font-mono font-bold text-sm select-none">
                ×
              </span>

              <div className="relative flex-1">
                <Input
                  id="chargeRate"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="15"
                  className={cn(
                    "h-9 pr-7 text-right font-mono text-sm",
                    rateError && "border-destructive focus-visible:ring-destructive",
                  )}
                  value={rate}
                  onChange={(e) => {
                    setRate(e.target.value);
                    setRateError("");
                  }}
                />
                <div className="absolute right-0 top-0 h-full flex items-center pr-2.5 pointer-events-none text-muted-foreground font-mono font-semibold text-sm">
                  %
                </div>
              </div>
            </div>

            {rateError ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" /> {rateError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/50">
                Calculated as{" "}
                <code className="font-mono bg-muted/50 px-1 rounded">
                  {baseToken} × {rate || "0"}%
                </code>
              </p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEdit ? "Save changes" : "Add charge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
