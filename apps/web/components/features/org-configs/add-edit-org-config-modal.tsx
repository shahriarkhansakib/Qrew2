"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
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
// Removed Checkbox
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

export function AddEditOrgConfigModal({
  isOpen,
  onClose,
  editConfig,
}: {
  isOpen: boolean;
  onClose: () => void;
  editConfig?: any;
}) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    configKey: "",
    configValue: "",
    valueType: "number",
    displayLabel: "",
  });

  useEffect(() => {
    if (editConfig) {
      setFormData({
        configKey: editConfig.configKey,
        configValue: editConfig.configValue,
        valueType: editConfig.valueType,
        displayLabel:
          editConfig.displayLabel === editConfig.configKey ? "" : editConfig.displayLabel,
      });
    } else {
      setFormData({
        configKey: "",
        configValue: "",
        valueType: "number",
        displayLabel: "",
      });
    }
  }, [editConfig]);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = editConfig
        ? `${apiUrl}/api/org-configs/${editConfig.id}`
        : `${apiUrl}/api/org-configs`;

      const res = await fetch(url, {
        method: editConfig ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save config");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editConfig ? "Config updated" : "Config created");
      onClose();
      queryClient.invalidateQueries({ queryKey: ["org-configs"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const token = formData.configKey.replace(/^(GBL_|ORG_)/, "").replace(/_+$/, "");
    if (!token) {
      toast.error("Token is required");
      return;
    }

    mutation.mutate({
      ...formData,
      configKey: editConfig ? undefined : token,
      displayLabel: formData.displayLabel || undefined,
      isFormulaInjectable: true,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editConfig ? "Edit Configuration" : "Add Configuration"}</DialogTitle>
          <div className="flex gap-2 items-start bg-accent/10 text-accent-foreground p-3 rounded-md text-sm mt-4">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>Global Constant:</strong> Changes made here will affect <em>all</em> invoice
              templates across the organization.
            </p>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="configKey">Token Key</Label>
            <Input
              id="configKey"
              value={formData.configKey}
              onChange={(e) => {
                setFormData({
                  ...formData,
                  configKey: processTokenInput(e.target.value),
                });
              }}
              required
              placeholder="VAT_RATE"
              className="font-mono"
              disabled={!!editConfig}
            />
            <p className="text-[11px] text-muted-foreground">
              Only uppercase letters, numbers, and underscores.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valueType">Value Type</Label>
              <Select
                value={formData.valueType}
                onValueChange={(val) =>
                  setFormData({ ...formData, valueType: val, configValue: "" })
                }
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
              <Label htmlFor="configValue">Value (Optional)</Label>
              <Input
                id="configValue"
                type="text"
                inputMode={formData.valueType === "number" ? "decimal" : "text"}
                value={formData.configValue}
                onChange={(e) => setFormData({ ...formData, configValue: e.target.value })}
                placeholder={
                  formData.valueType === "number" ? "e.g. 0.05 for 5%" : "e.g. default text"
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayLabel">Description (Optional)</Label>
            <Input
              id="displayLabel"
              value={(formData as any).displayLabel || ""}
              onChange={(e) => setFormData({ ...formData, displayLabel: e.target.value } as any)}
              placeholder="Brief description of this constant"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editConfig ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
