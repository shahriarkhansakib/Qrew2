"use client";

import { useQuery } from "@tanstack/react-query";
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
  const [label, setLabel] = useState("");
  const [fileFieldKey, setFileFieldKey] = useState("");
  const [dataType, setDataType] = useState("text");
  const [columnPosition, setColumnPosition] = useState<"left" | "right">("left");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch project custom fields so users can bind to existing fields easily
  const { data: customFields } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editField) {
      setLabel(editField.label ?? "");
      setFileFieldKey(editField.fileFieldKey ?? "");
      setDataType(editField.isFormulaInjectable ? "number" : "text");
      setColumnPosition(editField.columnPosition ?? "left");
    } else {
      setLabel("");
      setFileFieldKey("");
      setDataType("text");
      setColumnPosition("left");
    }
  }, [isOpen, editField]);

  const handleSelectCustomField = (key: string) => {
    if (key === "__manual__") return;
    const cf = (customFields || []).find((f: any) => f.fieldKey === key);
    if (cf) {
      setLabel(cf.fieldName || cf.fieldKey);
      setFileFieldKey(cf.fieldKey.toUpperCase());
      setDataType(cf.fieldType === "number" || cf.fieldType === "currency" ? "number" : "text");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    setIsSubmitting(true);
    try {
      const finalKey = (
        fileFieldKey.trim() ||
        label
          .trim()
          .replace(/[^a-zA-Z0-9]/g, "_")
          .toUpperCase()
      ).replace(/_+/g, "_");

      const payload = {
        label: label.trim(),
        fieldType: "file_field",
        fileFieldKey: finalKey,
        isFormulaInjectable: dataType === "number",
        columnPosition,
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
        throw new Error(err.error || `Failed to ${isEdit ? "update" : "create"} header field`);
      }

      toast.success(
        isEdit
          ? "Header field updated"
          : draftId
            ? "Header field added to draft"
            : "Header field added to template",
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "An error occurred while saving the header field");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? isSheetMode
                ? "Edit Sheet Details Field"
                : "Edit File Description Field"
              : isSheetMode
                ? "Add Sheet Details Field"
                : "Add File Description Field"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Custom field selector shortcut — only for standard project templates */}
          {!isSheetMode && customFields && customFields.length > 0 && !isEdit && (
            <div className="space-y-2">
              <Label>Bind from Existing Project Field</Label>
              <Select onValueChange={handleSelectCustomField}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an existing project field…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">None (Create manual field)</SelectItem>
                  {customFields.map((cf: any) => (
                    <SelectItem key={cf.id} value={cf.fieldKey}>
                      {cf.fieldName} ({cf.fieldKey}) — {cf.fieldType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="label">Field Label</Label>
            <Input
              id="label"
              placeholder={isSheetMode ? "e.g. Department, Period, Prepared By, Notes" : "e.g. Tax ID, GRT, Reference Number"}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!isEdit && !fileFieldKey) {
                  // auto-slugify
                }
              }}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fileFieldKey">Token / Field Key</Label>
            <Input
              id="fileFieldKey"
              placeholder="e.g. GRT, PORT_CALL"
              value={fileFieldKey}
              onChange={(e) => setFileFieldKey(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
            />
            <p className="text-[11px] text-muted-foreground">
              Formulas will reference this field as{" "}
              <code className="font-mono text-primary">
                {fileFieldKey ||
                  label
                    .trim()
                    .replace(/[^a-zA-Z0-9]/g, "_")
                    .toUpperCase() ||
                  "KEY"}
              </code>
              .
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Type</Label>
              <Select value={dataType} onValueChange={setDataType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select data type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text (Display only)</SelectItem>
                  <SelectItem value="number">Number (Formula injectable)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Column Position</Label>
              <Select
                value={columnPosition}
                onValueChange={(v: "left" | "right") => setColumnPosition(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left Column</SelectItem>
                  <SelectItem value="right">Right Column</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !label.trim()}>
              {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Add Field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { AddHeaderFieldModal as AddEditHeaderFieldModal };
