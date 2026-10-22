"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckSquare,
  GitFork,
  Loader2,
  Lock,
  Plus,
  Settings2,
  Shield,
  Unlink2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/lib/constants";

interface TransitionItem {
  toStatusId: string;
  allowedRoleIds: string[];
}

interface FieldMappingItem {
  fieldId: string;
  isRequiredToEnter: boolean;
  isVisibleInStage: boolean;
}

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

  const [activeTab, setActiveTab] = useState("general");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#94a3b8");

  // Graph Edges with Role Gating (Option 1)
  const [transitions, setTransitions] = useState<TransitionItem[]>([]);

  // Field Mappings (Scenario A & B)
  const [fieldMappings, setFieldMappings] = useState<FieldMappingItem[]>([]);

  // Fetch available workspace roles for role-gated transitions
  const { data: rolesData, isLoading: isLoadingRoles } = useQuery({
    queryKey: ["org-roles"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/roles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
    enabled: isOpen,
  });

  const availableRoles: { id: string; name: string; description?: string }[] =
    rolesData?.roles || [];

  useEffect(() => {
    if (isOpen) {
      if (node) {
        setName(node.name);
        setColor(node.color || "#94a3b8");
        setTransitions(
          (node.transitions || []).map((t: any) => ({
            toStatusId: t.toStatusId,
            allowedRoleIds: Array.isArray(t.allowedRoleIds) ? t.allowedRoleIds : [],
          })),
        );
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
        setTransitions(
          (initialTransitions || []).map((toId: string) => ({
            toStatusId: toId,
            allowedRoleIds: [],
          })),
        );
        setFieldMappings([]);
      }
      setActiveTab("general");
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

          let r = fromStatus?.gridRow ?? 0;
          let offset = 1;
          while (allStatuses.some((s: any) => s.gridColumn === gridColumn && s.gridRow === r)) {
            const rank = Math.ceil(offset / 2);
            r = (fromStatus?.gridRow ?? 0) + (offset % 2 !== 0 ? rank : -rank);
            offset++;
          }
          gridRow = r;
        } else {
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
          body: JSON.stringify({ name, color }),
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update node");
      }

      // 2. Update Transitions with Role-Gating for the new/edited node
      const transRes = await fetch(
        `${apiUrl}/api/workspaces/projects/statuses/${statusId}/transitions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transitions: transitions.map((t) => ({
              toStatusId: t.toStatusId,
              allowedRoleIds: t.allowedRoleIds || [],
            })),
          }),
          credentials: "include",
        },
      );
      if (!transRes.ok)
        throw new Error((await transRes.json()).error || "Failed to save transitions");

      // 3. If insertBetween: patch the FROM node's transitions
      if (!isEditing && insertBetween) {
        const fromStatus = allStatuses.find((s: any) => s.id === insertBetween.fromId);
        if (fromStatus) {
          const oldTransitions: { toStatusId: string; allowedRoleIds?: string[] }[] =
            fromStatus.transitions ?? [];
          const patchedTransitions = [
            ...oldTransitions
              .filter((t) => t.toStatusId !== insertBetween.toId)
              .map((t) => ({ toStatusId: t.toStatusId, allowedRoleIds: t.allowedRoleIds || [] })),
            { toStatusId: statusId, allowedRoleIds: [] },
          ];
          await fetch(
            `${apiUrl}/api/workspaces/projects/statuses/${insertBetween.fromId}/transitions`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transitions: patchedTransitions }),
              credentials: "include",
            },
          );
        }
      }

      // 3b. If branchFrom: patch the FROM node's transitions
      if (!isEditing && branchFrom) {
        const fromStatus = allStatuses.find((s: any) => s.id === branchFrom);
        if (fromStatus) {
          const oldTransitions: { toStatusId: string; allowedRoleIds?: string[] }[] =
            fromStatus.transitions ?? [];
          if (!oldTransitions.some((t) => t.toStatusId === statusId)) {
            const patchedTransitions = [
              ...oldTransitions.map((t) => ({
                toStatusId: t.toStatusId,
                allowedRoleIds: t.allowedRoleIds || [],
              })),
              { toStatusId: statusId, allowedRoleIds: [] },
            ];
            await fetch(`${apiUrl}/api/workspaces/projects/statuses/${branchFrom}/transitions`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transitions: patchedTransitions }),
              credentials: "include",
            });
          }
        }
      }

      // 4. Update Field Mappings
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

  const disconnectTransition = (targetId: string) => {
    setTransitions((prev) => prev.filter((t) => t.toStatusId !== targetId));
  };

  const toggleRoleForTransition = (targetId: string, roleIdentifier: string) => {
    setTransitions((prev) =>
      prev.map((t) => {
        if (t.toStatusId !== targetId) return t;
        const currentRoles = t.allowedRoleIds || [];
        const exists = currentRoles.includes(roleIdentifier);
        const nextRoles = exists
          ? currentRoles.filter((r) => r !== roleIdentifier)
          : [...currentRoles, roleIdentifier];
        return { ...t, allowedRoleIds: nextRoles };
      }),
    );
  };

  const handleFieldMapping = (fieldId: string, key: "isRequiredToEnter" | "isVisibleInStage") => {
    setFieldMappings((prev) => {
      const existing = prev.find((f) => f.fieldId === fieldId);
      if (existing) {
        const updated = { ...existing, [key]: !existing[key] };
        if (!updated.isRequiredToEnter && !updated.isVisibleInStage) {
          return prev.filter((f) => f.fieldId !== fieldId);
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

  // Only directly connected outgoing nodes are displayed in this modal
  const connectedTargets = allStatuses.filter((s) =>
    transitions.some((t) => t.toStatusId === s.id),
  );

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

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 border-b bg-muted/10">
            <TabsList className="bg-transparent h-11 p-0 gap-6">
              <TabsTrigger
                value="general"
                className="data-active:border-b-2 data-active:border-primary data-active:shadow-none rounded-none px-1 h-full font-medium"
              >
                <Settings2 className="w-4 h-4 mr-1.5" />
                General
              </TabsTrigger>
              <TabsTrigger
                value="transitions"
                className="data-active:border-b-2 data-active:border-primary data-active:shadow-none rounded-none px-1 h-full font-medium"
              >
                <GitFork className="w-4 h-4 mr-1.5" />
                Transitions &amp; Role-Gating ({transitions.length})
              </TabsTrigger>
              <TabsTrigger
                value="fields"
                className="data-active:border-b-2 data-active:border-primary data-active:shadow-none rounded-none px-1 h-full font-medium"
              >
                <CheckSquare className="w-4 h-4 mr-1.5" />
                Field Gates ({fieldMappings.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 px-6 py-4">
            {/* Tab 1: General Info */}
            <TabsContent value="general" className="mt-0 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={node?.isSystem}
                    placeholder="e.g. Under Review"
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
                      className="w-12 h-10 p-1 cursor-pointer"
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

              <div className="p-4 rounded-xl border bg-muted/20 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Stage Nature</Label>
                    <Badge variant="outline" className="text-xs font-mono">
                      {node?.isInitial
                        ? "Initial (Entry)"
                        : transitions.length === 0
                          ? "Terminal (Sink)"
                          : "Intermediate"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {node?.isInitial
                      ? "This is the primary starting stage for new projects entering the workflow."
                      : transitions.length === 0
                        ? "This stage currently has 0 outgoing transitions and acts dynamically as a terminal stage."
                        : `This stage connects to ${transitions.length} downstream stage${transitions.length === 1 ? "" : "s"}.`}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: Outgoing Transitions & Role-Gating */}
            <TabsContent value="transitions" className="mt-0 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Allowed Outgoing Transitions &amp; Role PBAC
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Manage role-based access for existing outgoing transitions from this stage. Edge
                    creation is performed directly on the canvas using the Connect tool or (+)
                    handles.
                  </p>
                </div>
              </div>

              {connectedTargets.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed text-muted-foreground space-y-2">
                  <GitFork className="w-8 h-8 mx-auto opacity-40 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">No Outgoing Transitions</p>
                  <p className="text-xs max-w-sm mx-auto text-muted-foreground">
                    This stage currently has no downstream connections and behaves dynamically as a
                    terminal stage. To connect this stage to other stages, use the{" "}
                    <strong>Connect</strong> tool in the toolbar or click the <strong>(+)</strong>{" "}
                    handle on the canvas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {connectedTargets.map((target) => {
                    const activeTransition = transitions.find((t) => t.toStatusId === target.id);
                    const selectedRoleIds = activeTransition?.allowedRoleIds || [];
                    const isTargetTerminal = (target.transitions?.length ?? 0) === 0;

                    return (
                      <div
                        key={target.id}
                        className="p-3.5 rounded-xl border bg-card border-border shadow-xs space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: target.color || "#94a3b8" }}
                            />
                            <span className="text-sm font-medium text-foreground">
                              {target.name}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0">
                              {isTargetTerminal ? "Terminal" : "Intermediate"}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            {selectedRoleIds.length === 0 ? (
                              <Badge variant="secondary" className="text-[11px] font-normal">
                                All Roles (Anyone)
                              </Badge>
                            ) : (
                              <Badge variant="default" className="text-[11px] font-medium gap-1">
                                <Lock className="w-2.5 h-2.5" />
                                {selectedRoleIds.length} Role
                                {selectedRoleIds.length > 1 ? "s" : ""} Gated
                              </Badge>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => disconnectTransition(target.id)}
                              className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 gap-1"
                              title="Disconnect edge"
                            >
                              <Unlink2 className="w-3.5 h-3.5" />
                              Disconnect
                            </Button>
                          </div>
                        </div>

                        {/* Role Selection */}
                        <div className="pt-2 border-t border-border/40 pl-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Restrict to Roles
                            </span>
                            {selectedRoleIds.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setTransitions((prev) =>
                                    prev.map((t) =>
                                      t.toStatusId === target.id ? { ...t, allowedRoleIds: [] } : t,
                                    ),
                                  )
                                }
                                className="text-[11px] text-muted-foreground hover:text-foreground underline"
                              >
                                Allow All Roles
                              </button>
                            )}
                          </div>

                          {isLoadingRoles ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading roles...
                            </div>
                          ) : availableRoles.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              No custom roles found. Workspace owner &amp; default members can
                              execute this transition.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {availableRoles.map((role) => {
                                const isRoleActive =
                                  selectedRoleIds.includes(role.id) ||
                                  selectedRoleIds.includes(role.name);
                                return (
                                  <button
                                    type="button"
                                    key={role.id}
                                    onClick={() => toggleRoleForTransition(target.id, role.id)}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                      isRoleActive
                                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                                        : "bg-background text-muted-foreground border-border hover:border-primary/50"
                                    }`}
                                  >
                                    {isRoleActive && <Check className="w-3 h-3" />}
                                    {role.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Tab 3: Field Gates (Scenario A & B) */}
            <TabsContent value="fields" className="mt-0 space-y-4">
              <div className="pb-2 border-b">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  Stage Field Validation &amp; Visibility
                </h4>
                <p className="text-xs text-muted-foreground">
                  Define which project custom fields are visible in this stage, and which are
                  strictly required before advancing into this stage (Scenario A).
                </p>
              </div>

              {customFields.length === 0 ? (
                <div className="p-6 text-center rounded-xl border border-dashed text-muted-foreground text-xs">
                  No project custom fields defined. Configure fields in Customize Fields settings.
                </div>
              ) : (
                <div className="space-y-2">
                  {customFields.map((field) => {
                    const mapping = fieldMappings.find((f) => f.fieldId === field.id);
                    const isVisible = mapping?.isVisibleInStage ?? false;
                    const isRequired = mapping?.isRequiredToEnter ?? false;

                    return (
                      <div
                        key={field.id}
                        className="p-3 rounded-lg border bg-card flex items-center justify-between gap-4 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{field.fieldName}</span>
                            <Badge variant="secondary" className="text-[10px] py-0 uppercase">
                              {field.fieldType}
                            </Badge>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground">
                            {field.fieldKey}
                          </span>
                        </div>

                        <div className="flex items-center gap-6 shrink-0">
                          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                            <Checkbox
                              checked={isVisible}
                              onCheckedChange={() =>
                                handleFieldMapping(field.id, "isVisibleInStage")
                              }
                            />
                            <span>Visible in Stage</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
                            <Checkbox
                              checked={isRequired}
                              onCheckedChange={() =>
                                handleFieldMapping(field.id, "isRequiredToEnter")
                              }
                            />
                            <span
                              className={
                                isRequired ? "text-amber-600 dark:text-amber-400 font-semibold" : ""
                              }
                            >
                              Required to Enter
                            </span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

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
