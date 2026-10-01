"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  FileStack,
  FileText,
  Flag,
  GitBranch,
  Loader2,
  Paperclip,
  Plus,
  Receipt,
  RotateCcw,
  Settings2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { AddExpenseModal } from "@/components/features/financials/add-expense-modal";
import { GenerateInvoiceModal } from "@/components/features/invoices/generate-invoice-modal";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { EditStageDataModal } from "./edit-stage-data-modal";
import { ExpenseDetailsModal } from "./expense-details-modal";
import { ProjectDataDisplay } from "./project-data-display";

interface ProjectDetailsModalProps {
  project: any;
  onClose: () => void;
}

// ─── Invoices sub-section ──────────────────────────────────────────────────
function ProjectInvoicesSection({ projectId, router }: { projectId: string; router: any }) {
  const { data: invoiceList, isLoading } = useQuery({
    queryKey: ["project-invoices", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`${apiUrl}/api/invoices?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  const statusColor: Record<string, string> = {
    frozen: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    issued: "bg-primary/15 text-primary border-primary/30",
    paid: "bg-green-500/15 text-green-400 border-green-500/30",
    void: "bg-red-500/15 text-red-400 border-red-500/30",
    draft: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };

  return (
    <div className="p-6 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileStack className="w-4 h-4" />
          Invoices
        </h3>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : !invoiceList || invoiceList.length === 0 ? (
        <div className="text-center py-5 rounded-xl border border-dashed border-border bg-background/50">
          <FileStack className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {invoiceList.map((inv: any) => {
            const isDraft = inv.status === "draft";
            const route = isDraft
              ? `/dashboard/invoices/drafts/${inv.id}`
              : `/dashboard/invoices/${inv.id}`;
            const label =
              inv.documentNumber && inv.documentNumber !== "PENDING"
                ? inv.documentNumber
                : inv.sourceTemplateName || "Invoice Draft";

            return (
              <button
                key={inv.id}
                onClick={() => router.push(route)}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-left group"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(inv.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                      statusColor[inv.status] || "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {inv.status}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    $
                    {Number(inv.grandTotalAmount ?? inv.totalAmount ?? 0).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjectDetailsModal({ project, onClose }: ProjectDetailsModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isExpenseDetailsOpen, setIsExpenseDetailsOpen] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [editStageId, setEditStageId] = useState<string | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [requiredFieldValues, setRequiredFieldValues] = useState<Record<string, string>>({});
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isGenerateInvoiceOpen, setIsGenerateInvoiceOpen] = useState(false);
  const [renamingAttachmentId, setRenamingAttachmentId] = useState<string | null>(null);
  const [renamingFileName, setRenamingFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive a live project from the cache so status/fields update instantly
  // after advancing without waiting for a parent re-render.
  const liveProject = useMemo(() => {
    // Null-guard: when the modal closes, project becomes null before unmount.
    if (!project) return project;
    // Check all "projects" cache entries for the matching project
    const allCaches = queryClient.getQueriesData<any[]>({ queryKey: ["projects"] });
    for (const [, data] of allCaches) {
      if (Array.isArray(data)) {
        const found = data.find((p: any) => p.id === project.id);
        if (found) return found;
      }
    }
    return project;
  }, [project, queryClient.getQueriesData]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: statuses, isLoading: loadingStatuses } = useQuery({
    queryKey: ["project-statuses"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch statuses");
      return res.json();
    },
    staleTime: 0, // Always refetch on focus so workflow config changes reflect immediately
  });

  const { data: customFields, isLoading: loadingFields } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
  });

  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses", project?.id],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expenses?projectId=${project.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      const all = await res.json();
      return all.filter((e: any) => e.projectId === project.id);
    },
    enabled: !!project,
  });

  const { data: attachments, isLoading: loadingAttachments } = useQuery({
    queryKey: ["project-attachments", project?.id],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/${project.id}/attachments`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch attachments");
      return res.json();
    },
    enabled: !!project,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const presignRes = await fetch(
        `${apiUrl}/api/workspaces/projects/${project.id}/attachments/presigned`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            contentType: file.type || "application/octet-stream",
            fileName: file.name,
          }),
        },
      );
      if (!presignRes.ok) throw new Error("Failed to init upload");
      const { url, publicUrl, fileId } = await presignRes.json();

      const uploadRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file to storage");

      const saveRes = await fetch(`${apiUrl}/api/workspaces/projects/${project.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "application/octet-stream",
          fileUrl: publicUrl,
        }),
      });
      if (!saveRes.ok) throw new Error("Failed to save attachment metadata");
      return saveRes.json();
    },
    onSuccess: () => {
      toast.success("Attachment uploaded");
      queryClient.invalidateQueries({ queryKey: ["project-attachments", project?.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to upload attachment"),
  });

  const advanceStatusMutation = useMutation({
    mutationFn: async ({
      toStatusId,
      extraFields,
    }: {
      toStatusId: string;
      extraFields?: Record<string, any>;
    }) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/${project.id}/advance-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toStatusId, customFields: extraFields }),
      });
      if (!res.ok) {
        const err = await res.json();
        if (res.status === 422 && err.missingFields) {
          throw { missingFields: err.missingFields, message: err.error };
        }
        throw new Error(err.error || "Failed to advance status");
      }
      return res.json();
    },
    onSuccess: (updatedProject) => {
      toast.success("File advanced to next stage");

      // 1. Patch every "projects" cache entry immediately so the modal's
      //    `project` prop reflects the new status without a reload.
      queryClient.setQueriesData({ queryKey: ["projects"] }, (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((p: any) => (p.id === updatedProject.id ? { ...p, ...updatedProject } : p));
      });

      // 2. Also invalidate in the background so the list re-fetches fresh data.
      queryClient.invalidateQueries({ queryKey: ["projects"] });

      // 3. Auto-select the new status so fields update immediately.
      setSelectedStatusId(updatedProject.status);

      setPendingStatusId(null);
      setMissingFields([]);
      setRequiredFieldValues({});
    },
    onError: (err: any) => {
      if (err.missingFields) {
        setMissingFields(err.missingFields);
        toast.error(err.message || "Please fill in all required fields.");
      } else {
        toast.error(err.message || "Failed to advance status");
      }
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await fetch(
        `${apiUrl}/api/workspaces/projects/${project.id}/attachments/${attachmentId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to delete attachment");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Attachment deleted");
      queryClient.invalidateQueries({ queryKey: ["project-attachments", project?.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete attachment"),
  });

  const renameAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, newName }: { attachmentId: string; newName: string }) => {
      const res = await fetch(
        `${apiUrl}/api/workspaces/projects/${project.id}/attachments/${attachmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: newName }),
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to rename attachment");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Attachment renamed");
      setRenamingAttachmentId(null);
      queryClient.invalidateQueries({ queryKey: ["project-attachments", project?.id] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to rename attachment"),
  });

  const handleRenameSubmit = (attId: string, oldName: string) => {
    if (renamingFileName && renamingFileName !== oldName) {
      renameAttachmentMutation.mutate({ attachmentId: attId, newName: renamingFileName });
    } else {
      setRenamingAttachmentId(null);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  // Workflows are always on per user decision
  const _workflowsEnabled = true;

  const sortedStatuses = useMemo(() => {
    if (!statuses) return [];
    return [...statuses].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [statuses]);

  const currentStatus = useMemo(
    () => sortedStatuses.find((s: any) => s.id === liveProject?.status) ?? null,
    [sortedStatuses, liveProject?.status],
  );

  const activeStatusForFields = useMemo(() => {
    if (selectedStatusId) return sortedStatuses.find((s: any) => s.id === selectedStatusId);
    return currentStatus;
  }, [selectedStatusId, currentStatus, sortedStatuses]);

  /**
   * pastStatuses — the actual ordered list of stages this file has been through,
   * read directly from liveProject.statusHistory (an ordered array of status IDs
   * appended by the API each time advanceStatus is called).
   *
   * For legacy files created before statusHistory was added, the array will be
   * empty/undefined so we fall back to a best-effort BFS (shortest path) as before.
   */
  const pastStatuses = useMemo(() => {
    if (!sortedStatuses.length) return [];
    const statusById: Record<string, any> = Object.fromEntries(
      sortedStatuses.map((s: any) => [s.id, s]),
    );

    // Use the recorded history if available
    const history: string[] = Array.isArray(liveProject?.statusHistory)
      ? liveProject.statusHistory
      : [];
    if (history.length > 0) {
      return history.map((id: string) => statusById[id]).filter(Boolean);
    }

    // ── Legacy fallback: BFS shortest path ─────────────────────────────────
    if (!currentStatus) return [];
    const initialStatus = sortedStatuses.find((s: any) => s.isInitial);
    if (!initialStatus || initialStatus.id === currentStatus.id) return [];

    const adjMap: Record<string, string[]> = {};
    sortedStatuses.forEach((s: any) => {
      adjMap[s.id] = (s.transitions ?? []).map((t: any) => t.toStatusId);
    });

    const visited = new Set<string>();
    const predecessor: Record<string, string | null> = {};
    const queue: string[] = [initialStatus.id];
    predecessor[initialStatus.id] = null;
    visited.add(initialStatus.id);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === currentStatus.id) break;
      for (const nxt of adjMap[cur] ?? []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          predecessor[nxt] = cur;
          queue.push(nxt);
        }
      }
    }

    if (!(currentStatus.id in predecessor)) return [];
    const path: string[] = [];
    let node: string | null = currentStatus.id;
    while (node !== null) {
      path.unshift(node);
      node = predecessor[node] ?? null;
    }
    return path
      .slice(0, -1)
      .map((id) => statusById[id])
      .filter(Boolean);
  }, [sortedStatuses, currentStatus, liveProject?.statusHistory]);

  const allowedNextStatuses = useMemo(() => {
    if (!currentStatus) return [];
    return (currentStatus.transitions ?? [])
      .map((t: any) => sortedStatuses.find((s: any) => s.id === t.toStatusId))
      .filter(Boolean);
  }, [currentStatus, sortedStatuses]);

  // True when the current stage is a dead-end: either explicitly flagged as
  // terminal OR has zero outgoing transitions configured.
  const isEffectivelyTerminal = currentStatus?.isTerminal || allowedNextStatuses.length === 0;

  const getRequiredFields = (toStatusId: string) => {
    const target = sortedStatuses.find((s: any) => s.id === toStatusId);
    return (target?.statusFields ?? []).filter((m: any) => m.isRequiredToEnter);
  };

  const handleAdvance = (toStatusId: string) => {
    setPendingStatusId(toStatusId);
    setMissingFields([]);
    setRequiredFieldValues({});
    advanceStatusMutation.mutate({ toStatusId });
  };

  const handleConfirmWithFields = () => {
    if (!pendingStatusId) return;
    advanceStatusMutation.mutate({ toStatusId: pendingStatusId, extraFields: requiredFieldValues });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadAll = async () => {
    if (!attachments || attachments.length === 0) return;
    setIsDownloadingAll(true);
    try {
      const zip = new JSZip();
      // Fetch all files
      await Promise.all(
        attachments.map(async (att: any) => {
          try {
            const proxyUrl = `${apiUrl}/api/workspaces/projects/${project.id}/attachments/${att.id}/proxy`;
            const response = await fetch(proxyUrl, { credentials: "include" });
            if (!response.ok) throw new Error("Failed to fetch");
            const blob = await response.blob();
            zip.file(att.fileName, blob);
          } catch (e) {
            console.error(`Failed to fetch ${att.fileName}`, e);
          }
        }),
      );
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const fileNoStr =
        project.fileSequenceNumber && project.createdAt
          ? `${format(new Date(project.createdAt), "MMyy")}${project.fileSequenceNumber.toString().padStart(2, "0")}`
          : "Documents";
      saveAs(zipBlob, `FILE-${fileNoStr}_${project.name}.zip`);
      toast.success("Download started");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate zip file");
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const totalExpense = expenses?.reduce((acc: number, ex: any) => acc + Number(ex.amount), 0) || 0;

  if (!project) return null;
  const isLoading = loadingStatuses || loadingFields;
  const formattedFileNo =
    project.fileSequenceNumber && project.createdAt
      ? `FILE-${format(new Date(project.createdAt), "MMyy")}${project.fileSequenceNumber.toString().padStart(2, "0")}`
      : "New File";

  // ── Render Helpers ─────────────────────────────────────────────────────────

  const renderStatusNode = (status: any, state: "past" | "current") => {
    const isCurrent = state === "current";
    const isPast = state === "past";
    const isSelected = selectedStatusId === status.id || (!selectedStatusId && isCurrent);
    const color = status.color || "#94a3b8";

    // Terminal nodes get a distinct visual treatment
    const fullStatus = sortedStatuses.find((s: any) => s.id === status.id) || status;
    const isDynamicTerminal = !fullStatus.isInitial && fullStatus.transitions?.length === 0;
    const isTerminal = isDynamicTerminal;
    const isNegativeTerminal =
      isTerminal && status.name.toLowerCase().match(/reject|cancel|fail|lost|declin|abort|close/);
    const terminalRingColor = isNegativeTerminal ? "#f43f5e" : isTerminal ? "#10b981" : null;
    const effectiveColor = terminalRingColor ?? color;

    return (
      <div
        className="flex flex-col items-center gap-2 z-10 relative group cursor-pointer"
        key={status.id}
        onClick={() => setSelectedStatusId(status.id)}
      >
        <div
          className={cn(
            "rounded-full flex items-center justify-center transition-all border-2",
            isCurrent ? "w-10 h-10 shadow-lg" : "w-8 h-8",
            isPast ? "opacity-60 hover:opacity-100" : "",
            isSelected && !isCurrent ? "ring-2 ring-offset-1" : "",
            // Terminal nodes get a solid ring even when past
            isTerminal && isCurrent ? "ring-4 ring-offset-2" : "",
          )}
          style={{
            backgroundColor: isCurrent || isPast ? effectiveColor : "transparent",
            borderColor: effectiveColor,
            borderWidth: isCurrent || isPast ? 0 : 2,
            boxShadow: isCurrent
              ? `0 0 0 4px ${effectiveColor}40, 0 0 12px ${effectiveColor}30`
              : isSelected && !isCurrent
                ? `0 0 0 2px ${effectiveColor}80`
                : undefined,
          }}
        >
          {isCurrent && isTerminal && !isNegativeTerminal && (
            <CheckCircle2 className="w-4 h-4 text-white" />
          )}
          {isCurrent && isTerminal && isNegativeTerminal && (
            <XCircle className="w-4 h-4 text-white" />
          )}
          {isCurrent && !isTerminal && (
            <div className="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
          )}
        </div>
        <span
          className={cn(
            "text-xs font-medium max-w-[80px] text-center whitespace-nowrap absolute -bottom-6",
            isSelected ? "text-foreground font-bold" : "text-muted-foreground",
            isTerminal && isCurrent ? "font-bold" : "",
          )}
        >
          {status.name}
        </span>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={!!project} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0 bg-background/95 backdrop-blur-xl border-muted/30 shadow-2xl">
        {/* ── Header ── */}
        <DialogHeader className="flex flex-row items-center justify-between border-b px-8 py-5 shrink-0 bg-background/50">
          <div className="min-w-0 flex items-center gap-4">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <span className="text-muted-foreground font-medium text-lg mr-1">
                {formattedFileNo}
              </span>
              {project.name}
            </DialogTitle>
          </div>

          <div className="flex items-center gap-3 shrink-0 pr-8">
            <Can I="org:manage">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditStageId(activeStatusForFields?.id || null)}
                disabled={!activeStatusForFields}
                className="gap-2 text-xs font-medium shadow-sm h-8"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Edit Stage Fields
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push("/org-admin/workflows")}
                className="gap-2 text-xs font-medium shadow-sm h-8"
              >
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                Configure Workflows
              </Button>
            </Can>
          </div>
        </DialogHeader>

        {/* ── Body ── */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* ── Main Left Content ── */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* Top Graph Section */}
              <div className="border-b bg-card/30 px-8 py-10 relative shrink-0 flex items-center">
                {/* Connecting Line Background */}
                <div className="absolute left-8 right-8 top-14 h-0.5 bg-muted-foreground/20 z-0" />

                <div className="flex items-center justify-between w-full relative z-10">
                  {/* Past Statuses */}
                  {pastStatuses.map((s: any) => renderStatusNode(s, "past"))}

                  {/* Current Status */}
                  {currentStatus && renderStatusNode(currentStatus, "current")}

                  {/* Next Stage or Terminated indicator */}
                  {isEffectivelyTerminal ? (
                    <div className="flex flex-col items-center gap-2 z-10 relative">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center border-2",
                          currentStatus.name
                            .toLowerCase()
                            .match(/reject|cancel|fail|lost|declin|abort|close/)
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-primary/40 bg-primary/10 text-primary",
                        )}
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-semibold absolute -bottom-6",
                          currentStatus.name
                            .toLowerCase()
                            .match(/reject|cancel|fail|lost|declin|abort|close/)
                            ? "text-destructive"
                            : "text-primary",
                        )}
                      >
                        Terminated
                      </span>
                    </div>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="flex flex-col items-center gap-2 z-10 relative group cursor-pointer">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-dashed border-muted-foreground text-muted-foreground bg-background hover:border-primary hover:text-primary hover:bg-primary/5 transition-all">
                            <Plus className="w-4 h-4" />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground absolute -bottom-6">
                            Next Stage
                          </span>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="center">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
                            Allowed Transitions
                          </p>
                          {allowedNextStatuses.length === 0 ? (
                            <div className="px-2 py-2 text-sm text-muted-foreground italic">
                              No next stages configured.
                            </div>
                          ) : (
                            allowedNextStatuses.map((ns: any) => {
                              const isDynamicTerminal =
                                !ns.isInitial && ns.transitions?.length === 0;
                              return (
                                <Button
                                  key={ns.id}
                                  variant="ghost"
                                  className="w-full justify-start gap-2 h-9 text-sm"
                                  onClick={() => handleAdvance(ns.id)}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: ns.color || "#94a3b8" }}
                                  />
                                  <span className="flex-1 text-left">{ns.name}</span>
                                  {isDynamicTerminal && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />
                                  )}
                                </Button>
                              );
                            })
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              {/* Required fields gate — shown when server returns 422 */}
              {missingFields.length > 0 && pendingStatusId && (
                <div className="px-8 pt-6 pb-2 shrink-0">
                  <div className="border rounded-xl bg-accent/10 border-amber-500/20 p-5 space-y-4">
                    <p className="text-sm font-medium text-accent-foreground dark:text-accent-foreground flex items-center gap-2">
                      <ArrowRight className="w-4 h-4" />
                      Required fields must be completed before advancing
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {getRequiredFields(pendingStatusId)
                        .filter((m: any) => missingFields.includes(m.fieldId))
                        .map((m: any) => {
                          const fieldDef = customFields?.find((cf: any) => cf.id === m.fieldId);
                          if (!fieldDef) return null;
                          return (
                            <div key={m.fieldId} className="space-y-1.5">
                              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {fieldDef.fieldName}
                              </label>
                              <input
                                type={fieldDef.fieldType === "date" ? "date" : "text"}
                                className="w-full rounded-md border-amber-500/30 bg-background px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500/20"
                                value={requiredFieldValues[m.fieldId] || ""}
                                onChange={(e) =>
                                  setRequiredFieldValues((prev) => ({
                                    ...prev,
                                    [m.fieldId]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          );
                        })}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleConfirmWithFields}
                      disabled={advanceStatusMutation.isPending}
                      className="bg-accent hover:bg-accent text-white shadow-sm"
                    >
                      {advanceStatusMutation.isPending && (
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      )}
                      Confirm &amp; Advance
                    </Button>
                  </div>
                </div>
              )}

              {/* Past-stage viewer banner */}
              {selectedStatusId &&
                selectedStatusId !== liveProject?.status &&
                (() => {
                  const viewingStatus = sortedStatuses.find((s: any) => s.id === selectedStatusId);
                  return viewingStatus ? (
                    <div className="mx-8 mt-4 shrink-0 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-accent/8 px-4 py-2.5">
                      <p className="text-xs text-accent-foreground dark:text-accent-foreground font-medium">
                        Viewing past snapshot:{" "}
                        <span className="font-bold">{viewingStatus.name}</span>
                      </p>
                      <button
                        onClick={() => setSelectedStatusId(null)}
                        className="flex items-center gap-1 text-xs text-accent-foreground dark:text-accent-foreground hover:text-accent-foreground dark:hover:text-accent-foreground font-medium transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Back to current
                      </button>
                    </div>
                  ) : null;
                })()}

              {/* Fields Display */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <ProjectDataDisplay
                  project={liveProject}
                  customFields={customFields || []}
                  status={activeStatusForFields}
                />
              </div>
            </div>

            {/* ── Right Sidebar ── */}
            <div className="w-full md:w-[340px] shrink-0 border-l bg-muted/20 flex flex-col overflow-y-auto">
              {/* Attachments Section */}
              <div className="p-6 border-b">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Attachments
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMutation.isPending}
                      title="Upload File"
                    >
                      {uploadMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>

                {loadingAttachments ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !attachments || attachments.length === 0 ? (
                  <div className="text-center py-8 bg-background/50 rounded-xl border border-dashed text-muted-foreground">
                    <p className="text-xs font-medium">No attachments</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 mb-3">
                      {attachments.map((att: any) => (
                        <div
                          key={att.id}
                          className="group flex items-center justify-between p-2.5 rounded-lg border bg-background hover:border-primary/30 hover:shadow-sm transition-all"
                        >
                          <a
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer"
                          >
                            <div className="p-1.5 rounded bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                              <FileText className="w-3.5 h-3.5" />
                            </div>
                            <div className="truncate text-left flex-1 min-w-0 mr-2">
                              {renamingAttachmentId === att.id ? (
                                <div
                                  className="flex items-center gap-1"
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <Input
                                    value={renamingFileName}
                                    onChange={(e) => setRenamingFileName(e.target.value)}
                                    className="h-6 text-xs p-1"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleRenameSubmit(att.id, att.fileName);
                                      if (e.key === "Escape") setRenamingAttachmentId(null);
                                    }}
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleRenameSubmit(att.id, att.fileName);
                                    }}
                                  >
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 shrink-0"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setRenamingAttachmentId(null);
                                    }}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                                    {att.fileName}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {(att.fileSize / 1024).toFixed(1)} KB
                                  </p>
                                </>
                              )}
                            </div>
                          </a>
                          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            {renamingAttachmentId !== att.id && (
                              <>
                                <Can I="file:edit">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/5"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setRenamingAttachmentId(att.id);
                                      setRenamingFileName(att.fileName);
                                    }}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                </Can>
                                <Button size="icon" variant="ghost" asChild className="h-7 w-7">
                                  <a
                                    href={`${apiUrl}/api/workspaces/projects/${project.id}/attachments/${att.id}/proxy`}
                                    download
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </Button>
                                <Can I="file:edit">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      deleteAttachmentMutation.mutate(att.id);
                                    }}
                                    disabled={deleteAttachmentMutation.isPending}
                                  >
                                    {deleteAttachmentMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                </Can>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Download All Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs"
                      onClick={handleDownloadAll}
                      disabled={isDownloadingAll}
                    >
                      {isDownloadingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                      Download All as ZIP
                    </Button>
                  </>
                )}
              </div>

              {/* Expenses Summary Section */}
              <div className="p-6 pb-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Financials
                  </h3>
                  <Can I="finance:edit_expenses">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                      onClick={() => setIsAddExpenseOpen(true)}
                      title="Add Expense"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </Can>
                </div>

                <Can
                  I="finance:view_expenses"
                  fallback={
                    <div className="text-center py-6 bg-background/50 rounded-xl border text-muted-foreground opacity-60">
                      <p className="text-xs font-medium">Restricted Access</p>
                    </div>
                  }
                >
                  <div className="bg-background border rounded-xl p-4 shadow-sm flex flex-col">
                    <span className="text-xs text-muted-foreground font-medium mb-1">
                      Total Expenses
                    </span>
                    <span className="text-2xl font-bold tracking-tight">
                      $
                      {totalExpense.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4 bg-muted/30 h-8 text-xs font-medium shadow-none"
                      onClick={() => setIsExpenseDetailsOpen(true)}
                    >
                      View Details
                    </Button>
                    <Can I="finance:manage_invoices">
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full mt-2 h-8 text-xs font-medium"
                        onClick={() => setIsGenerateInvoiceOpen(true)}
                      >
                        Generate Invoice
                      </Button>
                    </Can>
                  </div>
                </Can>
              </div>

              {/* Invoices Section */}
              <Can I="finance:view_invoices">
                <ProjectInvoicesSection projectId={liveProject?.id} router={router} />
              </Can>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Sub-modals */}
      <ExpenseDetailsModal
        isOpen={isExpenseDetailsOpen}
        onClose={() => setIsExpenseDetailsOpen(false)}
        project={project}
        expenses={expenses || []}
        loadingExpenses={loadingExpenses}
      />

      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        defaultProjectId={project?.id}
      />

      {isGenerateInvoiceOpen && (
        <GenerateInvoiceModal
          isOpen={isGenerateInvoiceOpen}
          onClose={() => setIsGenerateInvoiceOpen(false)}
          projectId={project?.id}
        />
      )}

      {editStageId && (
        <EditStageDataModal
          isOpen={!!editStageId}
          onClose={() => setEditStageId(null)}
          project={project}
          status={sortedStatuses?.find((s: any) => s.id === editStageId)}
          customFields={customFields || []}
        />
      )}
    </Dialog>
  );
}
