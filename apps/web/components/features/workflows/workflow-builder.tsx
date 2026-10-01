"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { apiUrl } from "@/lib/constants";
import { WorkflowGraph } from "./workflow-graph";
import { WorkflowNodeModal } from "./workflow-node-modal";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Status {
  id: string;
  name: string;
  color: string;
  isInitial: boolean;
  isTerminal: boolean;
  isSystem: boolean;
  transitions: { toStatusId: string }[];
  statusFields: { fieldId: string; isRequiredToEnter: boolean }[];
  createdAt: string | Date;
}

// ─── DeleteNodeModal ─────────────────────────────────────────────────────────

function DeleteNodeModal({
  node,
  onConfirm,
  onCancel,
  isPending,
}: {
  node: Status | null;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  if (!node) return null;
  const childCount = node.transitions?.length ?? 0;
  const hasSplice = childCount > 0;

  return (
    <Dialog open={!!node} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-foreground">
              Delete Stage
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: node.color || "#64748b" }}
            />
            <span className="font-semibold text-sm truncate">{node.name}</span>
          </div>

          <div className="text-sm text-muted-foreground space-y-1.5">
            <p>
              You are about to permanently delete the{" "}
              <span className="font-semibold text-foreground">{node.name}</span> stage.
            </p>
            {hasSplice && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-accent/10 border border-amber-500/20 text-accent-foreground dark:text-accent-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  This stage has{" "}
                  <span className="font-semibold">
                    {childCount} outgoing connection{childCount !== 1 ? "s" : ""}
                  </span>
                  . All parent stages will be automatically re-wired to connect directly to its
                  downstream stage{childCount !== 1 ? "s" : ""}.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isPending ? "Deleting..." : "Delete Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ClearAllModal ───────────────────────────────────────────────────────────

function ClearAllModal({
  open,
  nonSystemCount,
  onConfirm,
  onCancel,
  isPending,
}: {
  open: boolean;
  nonSystemCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-4 flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-foreground">
              Clear All Custom Stages
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            This will permanently delete all{" "}
            <span className="font-semibold text-foreground">
              {nonSystemCount} custom stage{nonSystemCount !== 1 ? "s" : ""}
            </span>{" "}
            and all connections between them.
          </p>
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              System stages (<strong>Created</strong> and <strong>Completed</strong>) will be kept.
              Only user-created stages will be removed.
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isPending
              ? "Clearing..."
              : `Clear ${nonSystemCount} Stage${nonSystemCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── WorkflowBuilder ────────────────────────────────────────────────────────

export function WorkflowBuilder({
  initialStatuses,
  customFields,
  disabled,
}: {
  initialStatuses: any;
  customFields: any;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();

  const [editingNode, setEditingNode] = useState<Status | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingNode, setDeletingNode] = useState<Status | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const [insertBetween, setInsertBetween] = useState<{ fromId: string; toId: string } | null>(null);
  const [branchFrom, setBranchFrom] = useState<string | null>(null);

  const statuses: Status[] = Array.isArray(initialStatuses) ? initialStatuses : [];
  const nonSystemStatuses = statuses.filter((s) => !s.isSystem);

  useEffect(() => {
    fetch(`${apiUrl}/api/workspaces/projects/statuses/migrate-defaults`, {
      method: "POST",
      credentials: "include",
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient.invalidateQueries]);

  // ── Move and Swap ──────────────────────────────────────────────────────────

  const moveNodeMutation = useMutation({
    mutationFn: async ({
      id,
      gridColumn,
      gridRow,
    }: {
      id: string;
      gridColumn: number;
      gridRow: number;
    }) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${id}/position`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gridColumn, gridRow }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to move node");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-statuses"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const handleMoveNode = (id: string, col: number, row: number) => {
    moveNodeMutation.mutate({ id, gridColumn: col, gridRow: row });
  };

  const [swapRequest, setSwapRequest] = useState<{
    sourceId: string;
    targetId: string;
    targetCol: number;
    targetRow: number;
    sourceCol: number;
    sourceRow: number;
  } | null>(null);

  const handleSwapNodes = (
    sourceId: string,
    targetId: string,
    targetCol: number,
    targetRow: number,
    sourceCol: number,
    sourceRow: number,
  ) => {
    setSwapRequest({ sourceId, targetId, targetCol, targetRow, sourceCol, sourceRow });
  };

  const swapNodesMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${sourceId}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to swap nodes");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-statuses"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const confirmSwap = async () => {
    if (!swapRequest) return;
    try {
      await swapNodesMutation.mutateAsync({
        sourceId: swapRequest.sourceId,
        targetId: swapRequest.targetId,
      });
      toast.success("Nodes swapped successfully");
    } catch (_e) {
      // toast error is handled by onError in mutation
    } finally {
      setSwapRequest(null);
    }
  };

  // ── Delete node ─────────────────────────────────────────────────────────

  const deleteNodeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete status");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Stage deleted");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
      setDeletingNode(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDeleteNode = (id: string) => {
    const s = statuses.find((x) => x.id === id);
    if (s?.isSystem) {
      toast.error("Cannot delete a system status node.");
      return;
    }
    setDeletingNode(s ?? null);
  };

  // ── Clear all non-system nodes ───────────────────────────────────────────

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      for (const s of nonSystemStatuses) {
        const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${s.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to delete "${s.name}"`);
        }
      }
    },
    onSuccess: () => {
      toast.success("All custom stages cleared.");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
      setClearAllOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
      setClearAllOpen(false);
    },
  });

  // ── Add between / branch ─────────────────────────────────────────────────

  const handleAddBetween = (fromId: string, toId: string) => {
    setInsertBetween({ fromId, toId });
    setIsCreateOpen(true);
  };

  const handleAddBranch = (fromId: string) => {
    setBranchFrom(fromId);
    setIsCreateOpen(true);
  };

  // ── Connect nodes ─────────────────────────────────────────────────────────

  const connectNodesMutation = useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: string; toId: string }) => {
      const from = statuses.find((s) => s.id === fromId);
      if (!from) throw new Error("Source status not found");
      const currentToIds = (from.transitions ?? []).map((t) => t.toStatusId);
      if (currentToIds.includes(toId)) return;
      const newToIds = [...currentToIds, toId];
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${fromId}/transitions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toStatusIds: newToIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect nodes");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Connection added");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleConnectNodes = (fromId: string, toId: string) => {
    if (fromId === toId) {
      toast.error("A stage cannot connect to itself.");
      return;
    }
    const _fromStatus = statuses.find((s) => s.id === fromId);
    const toStatus = statuses.find((s) => s.id === toId);
    if (toStatus?.isInitial) {
      toast.error("Nothing can connect back to the starting stage.");
      return;
    }
    connectNodesMutation.mutate({ fromId, toId });
  };

  // ── Delete edge ───────────────────────────────────────────────────────────

  const deleteEdgeMutation = useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: string; toId: string }) => {
      const from = statuses.find((s) => s.id === fromId);
      if (!from) throw new Error("Source status not found");
      const newToIds = (from.transitions ?? [])
        .map((t) => t.toStatusId)
        .filter((id) => id !== toId);
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${fromId}/transitions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toStatusIds: newToIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete connection");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Connection deleted");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDeleteEdge = (fromId: string, toId: string) => {
    deleteEdgeMutation.mutate({ fromId, toId });
  };

  // ── Close modal ──────────────────────────────────────────────────────────

  const handleClose = () => {
    setEditingNode(null);
    setIsCreateOpen(false);
    setInsertBetween(null);
    setBranchFrom(null);
  };

  const modalInitialTransitions: string[] = insertBetween ? [insertBetween.toId] : [];
  const modalInsertContext = insertBetween ?? null;

  return (
    <div className={`space-y-5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Toolbar */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">Workflow Graph</h2>
          <p className="text-sm text-muted-foreground">
            Hover over connections to insert stages inline. Click a node to configure it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {nonSystemStatuses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              className="border-red-400/40 text-red-500 hover:bg-red-500/10 hover:border-red-400 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </Button>
          )}
          <Button onClick={() => setIsCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Stage
          </Button>
        </div>
      </div>

      {/* Graph Canvas */}
      <WorkflowGraph
        statuses={statuses}
        customFields={customFields}
        disabled={disabled}
        onEditNode={(s) => setEditingNode(s)}
        onAddBetween={handleAddBetween}
        onDeleteNode={handleDeleteNode}
        onAddBranch={handleAddBranch}
        onConnectNodes={handleConnectNodes}
        onDeleteEdge={handleDeleteEdge}
        onMoveNode={handleMoveNode}
        onSwapNodes={handleSwapNodes}
      />

      {/* Swap Node Modal */}
      <Dialog open={!!swapRequest} onOpenChange={(v) => !v && setSwapRequest(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="bg-accent/10 border-b border-amber-500/20 px-6 py-4 flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Swap Nodes
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">Confirm node position swap</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to swap the positions of these two stages?
            </p>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSwapRequest(null)}
              disabled={moveNodeMutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={confirmSwap}
              disabled={moveNodeMutation.isPending}
              className="flex-1 gap-2"
            >
              {moveNodeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {moveNodeMutation.isPending ? "Swapping..." : "Confirm Swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Node Modal */}
      <DeleteNodeModal
        node={deletingNode}
        onConfirm={() => deletingNode && deleteNodeMutation.mutate(deletingNode.id)}
        onCancel={() => setDeletingNode(null)}
        isPending={deleteNodeMutation.isPending}
      />

      {/* Clear All Modal */}
      <ClearAllModal
        open={clearAllOpen}
        nonSystemCount={nonSystemStatuses.length}
        onConfirm={() => clearAllMutation.mutate()}
        onCancel={() => setClearAllOpen(false)}
        isPending={clearAllMutation.isPending}
      />

      {/* Node Modal */}
      {(editingNode || isCreateOpen) && (
        <WorkflowNodeModal
          isOpen={!!editingNode || isCreateOpen}
          onClose={handleClose}
          node={editingNode}
          allStatuses={statuses}
          customFields={customFields?.filter((f: any) => f.entityType === "project") || []}
          initialTransitions={modalInitialTransitions}
          insertBetween={modalInsertContext}
          branchFrom={branchFrom}
        />
      )}
    </div>
  );
}
