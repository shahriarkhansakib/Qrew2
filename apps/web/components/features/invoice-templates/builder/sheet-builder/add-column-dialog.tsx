"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TemplateColumnDefinition } from "./types";

interface AddColumnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  insertIndex?: number;
  editColumn?: TemplateColumnDefinition;
  onSave: (col: TemplateColumnDefinition, index?: number) => void;
}

export function AddColumnDialog({
  isOpen,
  onClose,
  insertIndex,
  editColumn,
  onSave,
}: AddColumnDialogProps) {
  const [label, setLabel] = useState("");
  const [dataType, setDataType] = useState<TemplateColumnDefinition["dataType"]>("text");
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [isTotaled, setIsTotaled] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editColumn) {
        setLabel(editColumn.label || "");
        setDataType(editColumn.dataType || "text");
        setAlign(editColumn.align || "left");
        setIsTotaled(!!editColumn.isTotaled);
      } else {
        setLabel("");
        setDataType("text");
        setAlign("left");
        setIsTotaled(false);
      }
    }
  }, [isOpen, editColumn]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Please enter a column heading");
      return;
    }

    const colKey =
      editColumn?.key ||
      `col_${label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")}_${Date.now().toString().slice(-4)}`;

    const defaultWidth =
      editColumn?.width ||
      (dataType === "serial"
        ? "56px"
        : dataType === "date"
          ? "144px"
          : dataType === "number"
            ? "144px"
            : dataType === "select"
              ? "144px"
              : "160px");

    const defaultAlign = dataType === "serial" ? "center" : dataType === "number" ? "right" : align;

    const column: TemplateColumnDefinition = {
      id: editColumn?.id || crypto.randomUUID(),
      key: colKey,
      label: label.trim(),
      dataType,
      width: defaultWidth,
      align: defaultAlign,
      isTotaled: dataType === "number" ? isTotaled : false,
    };

    onSave(column, insertIndex);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editColumn ? "Edit Column" : "Add New Column"}</DialogTitle>
          <DialogDescription>
            {editColumn
              ? "Modify the column heading label and calculation settings."
              : "Specify the heading label and data format for this column."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="col-label">Heading Label</Label>
            <Input
              id="col-label"
              autoFocus
              placeholder="e.g. Quantity, Rate, Amount, Category"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data Type</Label>
            <Select
              value={dataType}
              onValueChange={(val: any) => {
                setDataType(val);
                if (val === "number") setAlign("right");
                else if (val === "serial") setAlign("center");
                else setAlign("left");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="serial">Serial Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Amount / Numeric</SelectItem>
                <SelectItem value="select">Dropdown Select</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Text Alignment</Label>
            <Select value={align} onValueChange={(val: any) => setAlign(val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left Aligned</SelectItem>
                <SelectItem value="center">Centered</SelectItem>
                <SelectItem value="right">Right Aligned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {dataType === "number" && (
            <div className="flex items-center gap-2 pt-1 border-t">
              <Checkbox
                id="is-totaled"
                checked={isTotaled}
                onCheckedChange={(checked) => setIsTotaled(!!checked)}
              />
              <label
                htmlFor="is-totaled"
                className="text-xs font-medium text-foreground cursor-pointer select-none"
              >
                Auto-calculate Section Subtotal & Document Total
              </label>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{editColumn ? "Save Changes" : "Insert Column"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
