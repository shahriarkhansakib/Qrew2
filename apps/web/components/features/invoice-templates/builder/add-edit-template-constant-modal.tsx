"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2 } from "lucide-react";
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

function processTokenInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/ /g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/^_+/, "")
    .replace(/_+/g, "_");
}

export function AddEditTemplateConstantModal({
  apiBasePath,
  invalidateKey,
  isOpen,
  onClose,
  editConstant,
}: {
  apiBasePath: string;
  invalidateKey: any[];
  isOpen: boolean;
  onClose: () => void;
  editConstant?: any;
}) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    key: "",
    valueType: "number",
    value: "",
    description: "",
  });

  useEffect(() => {
    if (editConstant) {
      setFormData({
        key: editConstant.key || editConstant.token,
        valueType: editConstant.valueType || "number",
        value: (editConstant.value || editConstant.defaultValue || "").toString(),
        description:
          editConstant.description || editConstant.name === editConstant.token
            ? ""
            : editConstant.name || "",
      });
    } else {
      setFormData({
        key: "",
        valueType: "number",
        value: "",
        description: "",
      });
    }
  }, [editConstant]);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = editConstant
        ? `${apiBasePath}/constants/${editConstant.id}`
        : `${apiBasePath}/constants`;

      const res = await fetch(url, {
        method: editConstant ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save constant");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editConstant ? "Constant updated" : "Constant created");
      onClose();
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let token = formData.key;
    token = token.replace(/_+$/, "");
    if (!token) {
      toast.error("Token is required");
      return;
    }

    mutation.mutate({
      key: editConstant ? undefined : token,
      valueType: formData.valueType,
      value: formData.value,
      description: formData.description || undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editConstant ? "Edit Constant" : "Add Constant"}</DialogTitle>
          <div className="flex gap-2 items-start bg-blue-500/10 text-blue-500 p-3 rounded-md text-sm mt-4">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>Template Constant:</strong> Available only within this invoice template for
              formulas.
            </p>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key">Token Key</Label>
            <div className="flex items-center">
              <span className="text-muted-foreground font-mono bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none border-input">
                TPL_
              </span>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    key: processTokenInput(e.target.value),
                  });
                }}
                required
                placeholder="DISCOUNT_RATE"
                className="font-mono rounded-l-none focus-visible:z-10"
                disabled={!!editConstant}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Only uppercase letters, numbers, and underscores.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valueType">Value Type</Label>
              <Select
                value={formData.valueType}
                onValueChange={(val) => setFormData({ ...formData, valueType: val, value: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value">Value (Optional)</Label>
              <Input
                id="value"
                type="text"
                inputMode={formData.valueType === "number" ? "decimal" : "text"}
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder={
                  formData.valueType === "number" ? "e.g. 0.05 for 5%" : "e.g. default text"
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this constant"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editConstant ? "Save Changes" : "Create Constant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
