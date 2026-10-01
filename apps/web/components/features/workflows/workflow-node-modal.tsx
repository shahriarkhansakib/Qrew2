"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiUrl } from "@/lib/constants";

export function WorkflowNodeModal({
  isOpen,
  onClose,
  node,
  allStatuses,
  customFields,
  initialTransitions = [],
  insertBetween = null,
  branchFrom = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  node: any | null;
  allStatuses: any[];
  customFields: any[];
  initialTransitions?: string[];
  insertBetween?: { fromId: string; toId: string } | null;
  branchFrom?: string | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!node;

  const [name, setName] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const [isTerminal, setIsTerminal] = useState(false);

  // Graph Edges
  const [transitions, setTransitions] = useState<string[]>([]);

  // Field Mappings
  const [fieldMappings, setFieldMappings] = useState<
    { fieldId: string; isRequiredToEnter: boolean; isVisibleInStage: boolean }[]
  >([]);

  useEffect(() => {
    if (isOpen) {
      if (node) {
        setName(node.name);
        setColor(node.color || "#94a3b8");
        setIsTerminal(node.isTerminal || false);
        setTransitions((node.transitions || []).map((t: any) => t.toStatusId));
        setFieldMappings(
          (node.statusFields || []).map((f: any) => ({
            fieldId: f.fieldId,
            isRequiredToEnter: f.isRequiredToEnter,
            isVisibleInStage: f.isVisibleInStage,
          })),
        );
      } else {
        setName("");
        setColor("#3b82f6");
        setIsTerminal(false);
        // Pre-fill transitions from initialTransitions prop
        setTransitions(initialTransitions);
        setFieldMappings([]);
      }
    }
  }, [isOpen, node, initialTransitions]);

  const saveNodeMutation = useMutation({
    mutationFn: async () => {
      // 1. Create or Update the Status Node itself
      let statusId = node?.id;
      if (!statusId) {
        let gridColumn = 0;
        let gridRow = 0;

        if (insertBetween) {
          const fromStatus = allStatuses.find((s: any) => s.id === insertBetween.fromId);
          gridColumn = (fromStatus?.gridColumn ?? 0) + 1;
          gridRow = fromStatus?.gridRow ?? 0;
        } else if (branchFrom) {
          const fromStatus = allStatuses.find((s: any) => s.id === branchFrom);
          gridColumn = (fromStatus?.gridColumn ?? 0) + 1;

          // Find first free row
          let r = fromStatus?.gridRow ?? 0;
          let offset = 1;
          while (allStatuses.some((s: any) => s.gridColumn === gridColumn && s.gridRow === r)) {
            const rank = Math.ceil(offset / 2);
            r = (fromStatus?.gridRow ?? 0) + (offset % 2 !== 0 ? rank : -rank);
            offset++;
          }
          gridRow = r;
        } else {
          // Default: append to the end
          const maxCol = allStatuses.reduce(
            (max: number, s: any) => Math.max(max, s.gridColumn ?? 0),
            -1,
          );
          gridColumn = maxCol + 1;
          gridRow = 0;
        }

        const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            color,
            isTerminal,
            gridColumn,
            gridRow,
            insertBump: !!insertBetween,
          }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to create node");
        statusId = (await res.json()).id;
      } else {
        const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${statusId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color, isTerminal }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update node");
      }

      // 2. Update Transitions for the new/edited node
      const transRes = await fetch(
        `${apiUrl}/api/workspaces/projects/statuses/${statusId}/transitions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatusIds: transitions }),
          credentials: "include",
        },
      );
      if (!transRes.ok)
        throw new Error((await transRes.json()).error || "Failed to save transitions");

      // 3. If this was an "insert between" operation, patch the FROM node's transitions:
      //    Remove the toId, add this new node's id instead.
      if (!isEditing && insertBetween) {
        const fromStatus = allStatuses.find((s: any) => s.id === insertBetween.fromId);
        if (fromStatus) {
          const oldTransitions: string[] = (fromStatus.transitions ?? []).map(
            (t: any) => t.toStatusId,
          );
          const patchedTransitions = [
            ...oldTransitions.filter((id: string) => id !== insertBetween.toId),
            statusId,
          ];
          await fetch(
            `${apiUrl}/api/workspaces/projects/statuses/${insertBetween.fromId}/transitions`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toStatusIds: patchedTransitions }),
              credentials: "include",
            },
          );
        }
      }

      // 3b. If this was a "branch from" operation, patch the FROM node's transitions to include this new node.
      if (!isEditing && branchFrom) {
        const fromStatus = allStatuses.find((s: any) => s.id === branchFrom);
        if (fromStatus) {
          const oldTransitions: string[] = (fromStatus.transitions ?? []).map(
            (t: any) => t.toStatusId,
          );
          if (!oldTransitions.includes(statusId)) {
            const patchedTransitions = [...oldTransitions, statusId];
            await fetch(`${apiUrl}/api/workspaces/projects/statuses/${branchFrom}/transitions`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ toStatusIds: patchedTransitions }),
              credentials: "include",
            });
          }
        }
      }

      // 4. Update Fields
      const fieldsRes = await fetch(
        `${apiUrl}/api/workspaces/projects/statuses/${statusId}/fields`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: fieldMappings }),
          credentials: "include",
        },
      );
      if (!fieldsRes.ok)
        throw new Error((await fieldsRes.json()).error || "Failed to save field mappings");

      return true;
    },
    onSuccess: () => {
      toast.success(isEditing ? "Stage updated" : "Stage created");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
      onClose();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const _toggleTransition = (id: string) => {
    setTransitions((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const _handleFieldMapping = (fieldId: string, key: "isRequiredToEnter" | "isVisibleInStage") => {
    setFieldMappings((prev) => {
      const existing = prev.find((f) => f.fieldId === fieldId);
      if (existing) {
        const updated = { ...existing, [key]: !existing[key] };
        if (!updated.isRequiredToEnter && !updated.isVisibleInStage) {
          return prev.filter((f) => f.fieldId !== fieldId); // Remove if both are false
        }
        return prev.map((f) => (f.fieldId === fieldId ? updated : f));
      } else {
        return [
          ...prev,
          {
            fieldId,
            isRequiredToEnter: key === "isRequiredToEnter",
            isVisibleInStage: key === "isVisibleInStage",
          },
        ];
      }
    });
  };

  const _availableTargets = allStatuses.filter((s) => s.id !== node?.id);

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>
            {isEditing
              ? `Configure Stage: ${node.name}`
              : insertBetween
                ? "Insert Stage Between Nodes"
                : "Create New Stage"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-8">
            {/* General Info */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
                General Info
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={node?.isSystem}
                  />
                  {node?.isSystem && (
                    <p className="text-xs text-muted-foreground">System nodes cannot be renamed.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Node Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-12 h-10 p-1"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                    <Input
                      className="flex-1 font-mono uppercase"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => saveNodeMutation.mutate()}
            disabled={saveNodeMutation.isPending || !name.trim()}
          >
            {saveNodeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Save Stage Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
