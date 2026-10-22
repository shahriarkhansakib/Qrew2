"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/constants";

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

interface AddHeaderFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId?: string;
  draftId?: string;
  editField?: any;
  onSuccess: () => void;
  isSheetMode?: boolean;
}

export function AddHeaderFieldModal({
  isOpen,
  onClose,
  templateId,
  draftId,
  editField,
  onSuccess,
  isSheetMode = false,
}: AddHeaderFieldModalProps) {
  const isEdit = !!editField;
  const [token, setToken] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [dataType, setDataType] = useState<"text" | "number">("text");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editField) {
      const initialToken =
        editField.fileFieldKey ||
        editField.tokenKey ||
        editField.label?.toUpperCase().replace(/[^A-Z0-9_]/g, "_") ||
        "";
      setToken(initialToken);
      setCustomLabel(editField.label ?? formatTokenToLabel(initialToken));
      setDataType(editField.isFormulaInjectable ? "number" : "text");
    } else {
      setToken("");
      setCustomLabel("");
      setDataType("text");
    }
  }, [isOpen, editField]);

  const derivedLabel = token ? formatTokenToLabel(token) : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = processTokenInput(token);
    const tokenErr = validateToken(cleanToken);
    if (tokenErr) {
      toast.error(tokenErr);
      return;
    }

    const finalLabel = isEdit
      ? customLabel.trim() || derivedLabel || formatTokenToLabel(cleanToken)
      : derivedLabel || formatTokenToLabel(cleanToken);

    setIsSubmitting(true);
    try {
      const payload = {
        label: finalLabel,
        fieldType: "file_field",
        fileFieldKey: cleanToken,
        tokenKey: cleanToken,
        isFormulaInjectable: dataType === "number",
        columnPosition: editField?.columnPosition || "left",
      };

      const url = draftId
        ? isEdit
          ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields/${editField.id}`
          : `${apiUrl}/api/invoices/drafts/${draftId}/header-fields`
        : isEdit
          ? `${apiUrl}/api/invoice-templates/${templateId}/header-fields/${editField.id}`
          : `${apiUrl}/api/invoice-templates/${templateId}/header-fields`;

      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to ${isEdit ? "update" : "create"} field`);
      }

      toast.success(
        isEdit
          ? isSheetMode
            ? "Sheet details field updated"
            : "File details field updated"
          : isSheetMode
            ? "Sheet details field added"
            : "File details field added",
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "An error occurred while saving the field");
    } finally {
      setIsSubmitting(false);
    }
  };

  const titlePrefix = isEdit ? "Edit" : "Add";
  const entityName = isSheetMode ? "Sheet Details Field" : "File Details Field";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {titlePrefix} {entityName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* 1. Token Input */}
          <div className="space-y-1.5">
            <Label htmlFor="token" className="text-xs font-semibold">
              Token
            </Label>
            <Input
              id="token"
              placeholder={isSheetMode ? "e.g. DEPARTMENT, PREPARED_BY" : "e.g. GRT, PORT_CALL"}
              value={token}
              onChange={(e) => {
                const nextToken = processTokenInput(e.target.value);
                setToken(nextToken);
                if (isEdit && (!customLabel || customLabel === derivedLabel)) {
                  setCustomLabel(formatTokenToLabel(nextToken));
                }
              }}
              autoFocus
              className="font-mono text-sm tracking-wide"
              required
            />
            {/* Auto-derived preview for Add mode only */}
            {!isEdit && token && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                <span>Display Label:</span>
                <span className="font-semibold text-foreground bg-muted/30 px-1.5 py-0.5 rounded border border-border/40">
                  {derivedLabel}
                </span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Formulas will reference this field as{" "}
              <code className="font-mono text-primary font-semibold">{token || "TOKEN"}</code>.
            </p>
          </div>

          {/* 2. Display Label Input — Presented in Edit Mode */}
          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="label" className="text-xs font-semibold">
                Display Label
              </Label>
              <Input
                id="label"
                placeholder={derivedLabel || "Field Label"}
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="text-sm"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Human-friendly label displayed in the header box and PDF invoice.
              </p>
            </div>
          )}

          {/* 3. Data Type Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Data Type</Label>
            <Select value={dataType} onValueChange={(v: "text" | "number") => setDataType(v)}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select data type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text" className="text-xs">
                  Text (Display value)
                </SelectItem>
                <SelectItem value="number" className="text-xs">
                  Number (Formula injectable)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || !token.trim()}>
              {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Add Field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { AddHeaderFieldModal as AddEditHeaderFieldModal };
