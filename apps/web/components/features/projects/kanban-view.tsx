"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  Building2,
  Calendar,
  FileText,
  Flag,
  Loader2,
  MoreVertical,
  Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { usePermissionStore } from "@/store/use-permission-store";

export interface KanbanViewProps {
  projects: any[];
  customFields: any[];
  isLoading: boolean;
  onEdit?: (project: any) => void;
  onDelete?: (project: any) => void;
  onView?: (project: any) => void;
  onArchiveToggle?: (project: any) => void;
  onViewClient?: (client: any) => void;
  allStatuses: any[];
  workflowsEnabled?: boolean;
  hiddenColumns?: Record<string, boolean>;
}

interface PendingTransition {
  project: any;
  targetStatus: any;
  missingFields: any[];
}

export function KanbanView({
  projects,
  customFields,
  isLoading,
  onEdit,
  onDelete: _onDelete,
  onView,
  onArchiveToggle,
  onViewClient,
  allStatuses = [],
  workflowsEnabled = false,
  hiddenColumns: _hiddenColumns = {},
}: KanbanViewProps) {
  const queryClient = useQueryClient();
  const { hasRole } = usePermissionStore();

  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  // ── Sort and Prepare Workflow Columns ──────────────────────────────────────
  const columns = useMemo(() => {
    if (!allStatuses || allStatuses.length === 0) return [];

    return [...allStatuses].sort((a: any, b: any) => {
      // Primary sort by gridColumn (infinite grid flow)
      if (a.gridColumn !== b.gridColumn) {
        return (a.gridColumn ?? 0) - (b.gridColumn ?? 0);
      }
      // Secondary sort by gridRow
      if (a.gridRow !== b.gridRow) {
        return (a.gridRow ?? 0) - (b.gridRow ?? 0);
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [allStatuses]);

  // ── Group Projects by Status ID ───────────────────────────────────────────
  const projectsByStatus = useMemo(() => {
    const map: Record<string, any[]> = {};
    columns.forEach((col: any) => {
      map[col.id] = [];
    });

    const fallbackStatusId = columns.find((c: any) => c.isInitial)?.id || columns[0]?.id;

    (projects || []).forEach((p: any) => {
      const statusId = p.status || fallbackStatusId;
      if (map[statusId]) {
        map[statusId].push(p);
      } else if (fallbackStatusId && map[fallbackStatusId]) {
        map[fallbackStatusId].push(p);
      }
    });

    return map;
  }, [projects, columns]);

  // ── Advance Status Mutation ───────────────────────────────────────────────
  const advanceStatusMutation = useMutation({
    mutationFn: async ({
      projectId,
      toStatusId,
      extraFields,
      version,
    }: {
      projectId: string;
      toStatusId: string;
      extraFields?: Record<string, any>;
      version?: number;
    }) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/${projectId}/advance-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          toStatusId,
          customFields: extraFields,
          version,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 422 && err.missingFields) {
          throw {
            missingFields: err.missingFields,
            message: err.error,
            isGatingError: true,
          };
        }
        throw new Error(err.error || "Failed to advance project status");
      }

      return res.json();
    },
    onSuccess: (updatedProject, variables) => {
      const targetCol = columns.find((c) => c.id === variables.toStatusId);
      toast.success(`File moved to "${targetCol?.name || "next stage"}" successfully`);

      // Optimistically patch cache
      queryClient.setQueriesData({ queryKey: ["projects"] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((p: any) => (p.id === updatedProject.id ? { ...p, ...updatedProject } : p));
      });

      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setPendingTransition(null);
      setFieldValues({});
    },
    onError: (err: any) => {
      if (err.isGatingError) {
        toast.error(err.message || "Please complete all required fields");
      } else {
        toast.error(err.message || "Failed to advance stage");
      }
    },
  });

  // ── Drag & Drop Event Handler ─────────────────────────────────────────────
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const sourceStatusId = source.droppableId;
    const targetStatusId = destination.droppableId;

    if (sourceStatusId === targetStatusId) {
      // Reordering within the same column (visual no-op)
      return;
    }

    const project = (projects || []).find((p: any) => p.id === draggableId);
    if (!project) return;

    const sourceStatus = columns.find((c: any) => c.id === sourceStatusId);
    const targetStatus = columns.find((c: any) => c.id === targetStatusId);

    if (!sourceStatus || !targetStatus) return;

    // 1. Verify Allowed Transition in Workflow Graph & Role PBAC
    if (workflowsEnabled && sourceStatus.transitions?.length > 0) {
      const matchedTransition = sourceStatus.transitions.find(
        (t: any) => t.toStatusId === targetStatusId,
      );
      if (!matchedTransition) {
        toast.error(
          `Transition from "${sourceStatus.name}" to "${targetStatus.name}" is not permitted by the workflow graph.`,
        );
        return;
      }

      if (
        matchedTransition.allowedRoleIds &&
        matchedTransition.allowedRoleIds.length > 0 &&
        !hasRole(matchedTransition.allowedRoleIds)
      ) {
        toast.error(
          `Your role does not have permission to advance files to "${targetStatus.name}".`,
        );
        return;
      }
    }

    // 2. Check for Missing Required Fields on Target Status
    const requiredFieldMappings = (targetStatus.statusFields || []).filter(
      (m: any) => m.isRequiredToEnter,
    );

    const missingFields: any[] = [];
    requiredFieldMappings.forEach((mapping: any) => {
      const fieldDef = (customFields || []).find((cf: any) => cf.id === mapping.fieldId);
      if (fieldDef) {
        const val =
          project.customFields?.[fieldDef.fieldKey] ?? project.customFields?.[fieldDef.id];
        if (
          val === undefined ||
          val === null ||
          val === "" ||
          (Array.isArray(val) && val.length === 0)
        ) {
          missingFields.push(fieldDef);
        }
      }
    });

    if (missingFields.length > 0) {
      // Open Gating Modal
      setPendingTransition({
        project,
        targetStatus,
        missingFields,
      });
      setFieldValues({});
      return;
    }

    // 3. All valid — directly trigger mutation
    advanceStatusMutation.mutate({
      projectId: project.id,
      toStatusId: targetStatusId,
      version: project.version,
    });
  };

  // ── Handle Modal Submission for Gated Stage ──────────────────────────────
  const handleConfirmTransitionWithFields = () => {
    if (!pendingTransition) return;

    advanceStatusMutation.mutate({
      projectId: pendingTransition.project.id,
      toStatusId: pendingTransition.targetStatus.id,
      extraFields: fieldValues,
      version: pendingTransition.project.version,
    });
  };

  // ── Format Currency Helper ────────────────────────────────────────────────
  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num || 0);
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
          <p className="text-sm text-muted-foreground">Loading Kanban board...</p>
        </div>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold">No Workflow Stages Configured</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Please define project workflow statuses in your workspace settings to view files in the
          Kanban board.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1 select-none">
          {columns.map((status: any) => {
            const columnProjects = projectsByStatus[status.id] || [];
            const count = columnProjects.length;

            return (
              <div
                key={status.id}
                className="flex flex-col w-80 shrink-0 bg-muted/20 border rounded-xl overflow-hidden shadow-xs"
              >
                {/* ── Column Header ── */}
                <div className="px-4 py-3 border-b bg-card/60 backdrop-blur-xs flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: status.color || "#94a3b8" }}
                    />
                    <span className="font-semibold text-sm text-foreground truncate">
                      {status.name}
                    </span>
                    {status.isTerminal && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none shrink-0"
                      >
                        Terminal
                      </Badge>
                    )}
                  </div>

                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">
                    {count}
                  </span>
                </div>

                {/* ── Droppable Column Body ── */}
                <Droppable droppableId={status.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex-1 p-3 flex flex-col gap-3 min-h-[500px] max-h-[calc(100vh-280px)] overflow-y-auto transition-colors",
                        snapshot.isDraggingOver
                          ? "bg-primary/5 ring-1 ring-primary/20 ring-inset"
                          : "",
                      )}
                    >
                      {columnProjects.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center border border-dashed rounded-lg p-6 text-center text-muted-foreground/60 text-xs">
                          <span>No files in this stage</span>
                        </div>
                      ) : (
                        columnProjects.map((project: any, index: number) => {
                          const fileNo = project.fileSequence
                            ? `#${project.fileSequence}`
                            : project.docNumber || "FILE";

                          return (
                            <Draggable key={project.id} draggableId={project.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className={cn(
                                    "group bg-card hover:bg-accent/5 border rounded-lg p-3.5 shadow-xs transition-all relative flex flex-col gap-2.5 cursor-grab active:cursor-grabbing",
                                    dragSnapshot.isDragging
                                      ? "shadow-lg ring-2 ring-primary/40 rotate-1 scale-[1.02] z-50"
                                      : "hover:border-primary/40 hover:shadow-sm",
                                  )}
                                >
                                  {/* Top Row: File Sequence & Menu */}
                                  <div className="flex items-center justify-between gap-2">
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-[10px] px-1.5 py-0 h-5 bg-muted/40 font-semibold"
                                    >
                                      {fileNo}
                                    </Badge>

                                    <div className="flex items-center gap-1">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
                                          >
                                            <MoreVertical className="h-3.5 w-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-36">
                                          {onView && (
                                            <DropdownMenuItem onClick={() => onView(project)}>
                                              <FileText className="h-3.5 w-3.5 mr-2" />
                                              View Details
                                            </DropdownMenuItem>
                                          )}
                                          {onEdit && (
                                            <DropdownMenuItem onClick={() => onEdit(project)}>
                                              <Pencil className="h-3.5 w-3.5 mr-2" />
                                              Edit File
                                            </DropdownMenuItem>
                                          )}
                                          {onViewClient && project.client && (
                                            <DropdownMenuItem
                                              onClick={() => onViewClient(project.client)}
                                            >
                                              <Building2 className="h-3.5 w-3.5 mr-2" />
                                              View Client
                                            </DropdownMenuItem>
                                          )}
                                          {onArchiveToggle && (
                                            <DropdownMenuItem
                                              onClick={() => onArchiveToggle(project)}
                                            >
                                              <Flag className="h-3.5 w-3.5 mr-2" />
                                              {project.lifecycleState === "archived"
                                                ? "Unarchive"
                                                : "Archive"}
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>

                                  {/* Project Title */}
                                  <div
                                    onClick={() => onView?.(project)}
                                    className="font-medium text-sm text-foreground hover:text-primary transition-colors line-clamp-2 cursor-pointer"
                                  >
                                    {project.name}
                                  </div>

                                  {/* Client & Date Metadata */}
                                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                                    {project.client?.name && (
                                      <span
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onViewClient?.(project.client);
                                        }}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted/50 px-2 py-0.5 rounded-md hover:text-foreground transition-colors cursor-pointer"
                                      >
                                        <Building2 className="h-3 w-3 shrink-0" />
                                        <span className="truncate max-w-[140px]">
                                          {project.client.name}
                                        </span>
                                      </span>
                                    )}

                                    <span className="inline-flex items-center gap-1 text-[11px]">
                                      <Calendar className="h-3 w-3 shrink-0" />
                                      {format(new Date(project.createdAt), "MMM d")}
                                    </span>
                                  </div>

                                  {/* Financial Rollup */}
                                  <Can I="finance:view_expenses">
                                    {project.totalExpenses > 0 && (
                                      <div className="pt-2 border-t flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground text-[11px]">
                                          Expenses:
                                        </span>
                                        <span className="font-semibold text-foreground font-mono text-[11px]">
                                          {formatCurrency(project.totalExpenses)}
                                        </span>
                                      </div>
                                    )}
                                  </Can>
                                </div>
                              )}
                            </Draggable>
                          );
                        })
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* ── Stage Gating / Required Fields Modal ── */}
      <Dialog open={!!pendingTransition} onOpenChange={(v) => !v && setPendingTransition(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Required Fields for &quot;{pendingTransition?.targetStatus?.name}&quot;
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete the mandatory stage fields to proceed with this transition.
              </p>
            </div>
          </div>

          <ScrollArea className="px-6 py-4 max-h-[60vh]">
            <div className="space-y-4">
              {pendingTransition?.missingFields.map((fieldDef: any) => {
                const key = fieldDef.fieldKey || fieldDef.id;

                return (
                  <div key={fieldDef.id} className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                      {fieldDef.fieldName}
                      <span className="text-red-500">*</span>
                    </Label>

                    {fieldDef.fieldType === "single_select" && fieldDef.options?.length ? (
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                        value={fieldValues[key] ?? ""}
                        onChange={(e) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select an option...</option>
                        {fieldDef.options.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : fieldDef.fieldType === "boolean" ? (
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
                        value={fieldValues[key] !== undefined ? String(fieldValues[key]) : ""}
                        onChange={(e) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [key]: e.target.value === "true",
                          }))
                        }
                      >
                        <option value="">Select Yes / No...</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : fieldDef.fieldType === "date" ? (
                      <Input
                        type="date"
                        className="w-full bg-background text-sm"
                        value={fieldValues[key] ?? ""}
                        onChange={(e) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                      />
                    ) : fieldDef.fieldType === "number" ? (
                      <Input
                        type="number"
                        placeholder="Enter numeric value..."
                        className="w-full bg-background text-sm"
                        value={fieldValues[key] ?? ""}
                        onChange={(e) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [key]: e.target.value === "" ? "" : Number(e.target.value),
                          }))
                        }
                      />
                    ) : (
                      <Input
                        type="text"
                        placeholder={`Enter ${fieldDef.fieldName.toLowerCase()}...`}
                        className="w-full bg-background text-sm"
                        value={fieldValues[key] ?? ""}
                        onChange={(e) =>
                          setFieldValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingTransition(null)}
              disabled={advanceStatusMutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmTransitionWithFields}
              disabled={advanceStatusMutation.isPending}
              className="flex-1 gap-2"
            >
              {advanceStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {advanceStatusMutation.isPending ? "Advancing..." : "Confirm Transition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
