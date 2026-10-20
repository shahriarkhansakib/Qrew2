"use client";

import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  BookmarkPlus,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Layers,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
// --- TEMPLATE BUILDER IMPORTS ---
import { BuilderProvider } from "@/components/features/invoice-templates/builder/builder-context";
import { SectionViewOptionsPopover } from "@/components/features/invoice-templates/builder/section-view-options";
import { TemplateBuilderWorkspace } from "@/components/features/invoice-templates/builder/template-builder-workspace";
import { TemplateTokenPool } from "@/components/features/invoice-templates/builder/token-pool";
import { AddOptionalServiceModal } from "@/components/features/invoices/drafts/add-optional-service-modal";
import { SaveDraftAsTemplateModal } from "@/components/features/invoices/drafts/save-draft-as-template-modal";
import { TemplateSyncModal } from "@/components/features/invoices/drafts/template-sync-modal";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function DraftBuilderPage() {
  const { id } = useParams() as { id: string };
  const draftId = id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [draftMode, setDraftMode] = useState<"fill" | "builder" | "preview">("fill");
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isAddOptionalServiceModalOpen, setIsAddOptionalServiceModalOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [tokenPoolOpen, setTokenPoolOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"tokens" | "line-items">("tokens");
  const [builderScale, setBuilderScale] = useState<number>(1);
  const [poolWidth, setPoolWidth] = useState(320);

  const handleEnterPreview = useCallback(() => {
    setDraftMode("preview");
    setTokenPoolOpen(false);
  }, []);

  // 1. Fetch draft
  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ["invoice-draft", draftId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/drafts/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch draft");
      return res.json();
    },
    enabled: !!id,
  });

  // Fetch master template metadata (e.g. name)
  const { data: syncStatus } = useQuery({
    queryKey: invoiceKeys.drafts.syncStatus(draftId),
    queryFn: () => invoiceApi.getDraftTemplateSyncStatus(draftId),
    enabled: !!draft?.sourceTemplateId,
    staleTime: 30_000,
  });

  const { data: template } = useQuery({
    queryKey: ["invoice-template", draft?.sourceTemplateId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${draft?.sourceTemplateId}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!draft?.sourceTemplateId,
  });

  // 2. Preview for calculations and resolvedScope tokens
  // The draft itself doesn't contain calculated sums. We rely on the engine to calculate the preview and resolve tokens.
  const { data: preview, isLoading: _previewLoading } = useQuery({
    queryKey: [
      "draft-preview",
      draftId,
      overrides,
      draft?.draftSections?.length,
      draft?.draftConstants,
    ],
    queryFn: async () => {
      if (!draft) return null;

      // We send the current state to the math engine
      const res = await fetch(`${apiUrl}/api/invoices/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftSections: draft.draftSections || [],
          draftConstants: draft.draftConstants || {},
          overrides,
          headerFieldValues: draft.draftHeaderValues || {},
          projectId: draft.projectId,
          clientId: draft.project?.clientId,
          templateId: draft.sourceTemplateId,
          periodStart: draft.draftHeaderValues?.PERIOD_START || null,
          periodEnd: draft.draftHeaderValues?.PERIOD_END || null,
        }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const json = await res.json();
      return json.data || json;
    },
    enabled: !!draft,
  });

  // Generate / Finalize Mutation
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          draftId: draft.id,
          projectId: draft.projectId,
          clientId: draft.project?.clientId,
          documentType: "general", // We'll let the user choose or use a default later, or get from project
          sourceTemplateId: draft.sourceTemplateId,
          draftRows: draft.draftSections,
          headerFieldValues: draft.draftHeaderValues || {},
          periodStart: draft.draftHeaderValues?.PERIOD_START || null,
          periodEnd: draft.draftHeaderValues?.PERIOD_END || null,
          issuedToClientName: draft.project?.client?.name || "Client",
          currency: "USD",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to finalize invoice");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast.success("Invoice finalized successfully!");
      queryClient.invalidateQueries({ queryKey: ["project-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push("/dashboard/invoices");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/drafts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete draft");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Draft deleted");
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
      window.location.href = "/dashboard/invoices";
    },
    onError: (err: any) => toast.error(err.message),
  });

  const _handleOverrideChange = useCallback((rowToken: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [rowToken]: value }));
  }, []);

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading draft...</span>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-destructive">
        <AlertTriangle className="w-5 h-5" />
        <span>Draft not found.</span>
      </div>
    );
  }

  if (!draft.sourceTemplateId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <AlertTriangle className="w-8 h-8 text-accent-foreground" />
        <p className="text-sm font-semibold">No template assigned to this draft.</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          This draft was created without a template. Go back to the file and click "Generate
          Invoice" again to assign a template.
        </p>
        <Link href="/dashboard/projects">
          <Button variant="outline" size="sm" className="mt-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Files
          </Button>
        </Link>
      </div>
    );
  }

  const tokens = preview?.resolvedScope?.tokens ?? {};
  const _sections: any[] = preview?.sections ?? [];
  const _grandTotal = Number(preview?.grandTotal ?? 0);

  // ── Build sidebar token groups from draftConstants + resolvedScope ────────
  const draftConstants = draft?.draftConstants ?? {};
  const globalConstantEntries: { key: string; value: any }[] = [];
  const templateConstantEntries: { key: string; value: any }[] = [];

  for (const [key, val] of Object.entries(draftConstants as Record<string, any>)) {
    // Template constants created in the builder always have a key + value object
    const displayVal = val?.value ?? val;
    templateConstantEntries.push({ key, value: displayVal });
  }

  // Global constants come from resolvedScope tokens prefixed with G
  for (const [key, val] of Object.entries(tokens)) {
    if (/^G\d+$/.test(key)) {
      globalConstantEntries.push({ key, value: val });
    }
  }

  const updateDraftDetails = async (field: string, value: any, actionDesc?: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/invoices/drafts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: draft.id,
          projectId: draft.projectId,
          [field]: value,
          action:
            actionDesc || (field === "name" ? `Renamed draft to "${value}"` : `Updated ${field}`),
        }),
      });
      if (!res.ok) throw new Error("Failed to update draft");
      queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
      queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
    } catch (_error) {
      toast.error("Failed to update draft detail");
    }
  };

  return (
    <BuilderProvider
      mode={draftMode === "builder" ? "draft" : draftMode === "preview" ? "preview" : "fill"}
      draftId={draftId}
      templateId={draft?.sourceTemplateId}
      apiBasePath={`${apiUrl}/api/invoices/drafts/${draftId}`}
      invalidateKey={["draft-sections", draftId]}
      validationErrors={preview?.validationErrors ?? []}
    >
      <div className="flex flex-col h-[calc(100vh-65px)] -m-4 md:-m-6 lg:-m-8 bg-background overflow-hidden">
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 h-14 flex items-center justify-between shrink-0 relative print:hidden">
          {/* ── LEFT ZONE: Document Identity & Metadata ── */}
          <div className="flex items-center gap-2.5 min-w-0 max-w-[320px] md:max-w-[360px] lg:max-w-[420px] shrink-0">
            <Link href="/dashboard/invoices">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                title="Back to Invoices"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>

            <div className="flex flex-col justify-center min-w-0">
              {/* Primary line: Draft Name as the hero document title + Delete Draft button beside it */}
              <div className="flex items-center gap-1.5 min-w-0 h-7">
                {draftMode === "builder" ? (
                  <Input
                    className="h-7 text-sm font-bold text-foreground px-1.5 py-0 w-44 border-border/60 bg-muted/40 hover:bg-muted/70 focus-visible:ring-1 focus-visible:ring-offset-0 shrink-0"
                    defaultValue={draft?.name || "Draft"}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== draft?.name) {
                        updateDraftDetails(
                          "name",
                          e.target.value.trim(),
                          `Renamed draft to "${e.target.value.trim()}"`,
                        );
                      }
                    }}
                    placeholder="Draft Name"
                  />
                ) : (
                  <h1 className="text-sm font-bold tracking-tight text-foreground truncate max-w-[200px] leading-7">
                    {draft?.name || "Draft"}
                  </h1>
                )}

                {/* Delete Draft Button beside draft's name with confirmation modal */}
                <Can I={["invoice:delete", "finance:manage_invoices"]}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 shrink-0 rounded transition-colors"
                        disabled={deleteMutation.isPending}
                        title="Delete Draft"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your invoice
                          draft.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={deleteMutation.isPending}
                          className="bg-red-600 hover:bg-red-700 text-white font-semibold focus:ring-red-600"
                          onClick={(e) => {
                            e.preventDefault();
                            deleteMutation.mutate();
                          }}
                        >
                          {deleteMutation.isPending ? "Deleting..." : "Delete Draft"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Can>
              </div>

              {/* Secondary line: File name and client name in brackets + template info */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 truncate mt-0.5">
                <span className="truncate font-medium text-foreground/80">
                  {draft?.project?.name || "Untitled File"}
                </span>
                {draft?.project?.client?.name && (
                  <span className="text-muted-foreground/80 truncate">
                    ({draft.project.client.name})
                  </span>
                )}

                <span className="text-muted-foreground/40 shrink-0">•</span>

                <div className="flex items-center gap-1 shrink-0 text-[11px]">
                  <span className="truncate max-w-[120px]">
                    Template:{" "}
                    <span className="text-foreground/80 font-medium">
                      {template?.name || "Master"}
                    </span>
                  </span>
                  {draft?.sourceTemplateId && (
                    <Can I={["template:edit", "workspace:manage_settings"]}>
                      <Link
                        href={`/org-admin/invoice-templates/${draft.sourceTemplateId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline ml-0.5"
                        title="Open master template in new tab"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        <span>Edit Master</span>
                      </Link>
                    </Can>
                  )}
                  {syncStatus?.hasTemplateDrift && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSyncModalOpen(true)}
                      className="h-5 px-1.5 py-0 text-[10px] gap-1 font-semibold border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ml-1 rounded cursor-pointer"
                      title={`Master template was updated (v${syncStatus.templateVersion}). Click to review and sync.`}
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Sync v${syncStatus.templateVersion}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── CENTER ZONE: Mode Switcher on Left, Mode-Specific Action Button on Right ── */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-20">
            {/* Segmented Mode Switcher Tab (Fill | Edit | PDF) — NO DOTS */}
            <div className="flex items-center p-0.5 bg-muted/60 dark:bg-muted/40 rounded-lg border border-border/60 text-xs shadow-xs">
              {/* 1. Fill */}
              <button
                type="button"
                onClick={() => setDraftMode("fill")}
                className={cn(
                  "flex items-center justify-center px-3.5 py-1.5 rounded-md font-medium transition-all text-xs min-w-[62px]",
                  draftMode === "fill"
                    ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold border border-emerald-500/20"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Fill: Enter numeric rates and values without altering table structure"
              >
                Fill
              </button>

              {/* 2. Edit */}
              <Can I={["invoice:author_formulas", "finance:manage_invoices"]}>
                <button
                  type="button"
                  onClick={() => setDraftMode("builder")}
                  className={cn(
                    "flex items-center justify-center px-3.5 py-1.5 rounded-md font-medium transition-all text-xs min-w-[62px]",
                    draftMode === "builder"
                      ? "bg-background text-amber-600 dark:text-amber-400 shadow-xs font-semibold border border-amber-500/20"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Edit: Customize rows, drag line items, and author formulas for this draft"
                >
                  Edit
                </button>
              </Can>

              {/* 3. PDF */}
              <button
                type="button"
                onClick={handleEnterPreview}
                className={cn(
                  "flex items-center justify-center px-3.5 py-1.5 rounded-md font-medium transition-all text-xs min-w-[62px]",
                  draftMode === "preview"
                    ? "bg-background text-blue-600 dark:text-blue-400 shadow-xs font-semibold border border-blue-500/20"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="PDF: Clean, read-only presentation equivalent to generated invoice PDF"
              >
                PDF
              </button>
            </div>

            {/* Mode-Specific Action Button with fixed width to eliminate layout shifts */}
            <div className="w-[145px] shrink-0 flex items-center">
              {draftMode === "preview" ? (
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="w-full gap-1.5 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs border border-emerald-600 justify-center"
                  title="Print or export as PDF"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print / PDF</span>
                </Button>
              ) : draftMode === "builder" ? (
                <Can
                  I={["template:create", "finance:manage_invoices", "workspace:manage_settings"]}
                >
                  <Button
                    size="sm"
                    onClick={() => setIsSaveTemplateModalOpen(true)}
                    className="w-full gap-1.5 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs border border-emerald-600 justify-center"
                    title="Save current draft structure, formulas, and headers as a new reusable template"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    <span>Save Template</span>
                  </Button>
                </Can>
              ) : (
                <Can I={["invoice:finalize", "finance:manage_invoices"]}>
                  <Button
                    size="sm"
                    onClick={() => finalizeMutation.mutate()}
                    disabled={finalizeMutation.isPending}
                    className="w-full gap-1.5 h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs border border-emerald-600 justify-center"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>{finalizeMutation.isPending ? "Finalizing..." : "Finalize"}</span>
                  </Button>
                </Can>
              )}
            </div>
          </div>

          {/* ── RIGHT ZONE: Logical Action Clusters ── */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cluster 1: Unified Scope & Audit History Popover Trigger */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-medium border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 select-none cursor-pointer"
                  title="Click to view draft audit trail"
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {draft?.draftHeaderValues?.PERIOD_START &&
                  draft?.draftHeaderValues?.PERIOD_END ? (
                    <span className="hidden xl:inline">
                      {format(new Date(draft.draftHeaderValues.PERIOD_START), "MMM d")} –{" "}
                      {format(new Date(draft.draftHeaderValues.PERIOD_END), "MMM d, yyyy")}
                    </span>
                  ) : (
                    <span>Live Sync</span>
                  )}
                  <span className="text-muted-foreground/40">•</span>
                  <span className="font-mono text-[11px] font-semibold">
                    {Array.isArray(draft?.editHistory) && draft.editHistory.length > 0
                      ? `${draft.editHistory.length} edit${draft.editHistory.length === 1 ? "" : "s"}`
                      : "1 edit"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b">
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs text-foreground">Draft Audit Trail</span>
                    <span className="text-[10px] text-muted-foreground">
                      Created by {draft?.user?.name || draft?.user?.email || "Team Member"}
                      {draft?.createdAt &&
                        ` on ${format(new Date(draft.createdAt), "MMM d, yyyy")}`}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {Array.isArray(draft?.editHistory) ? draft.editHistory.length : 1}
                  </Badge>
                </div>
                <div className="max-h-64 overflow-y-auto flex flex-col gap-2.5 pr-1 divide-y divide-border/40">
                  {!Array.isArray(draft?.editHistory) || draft.editHistory.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2 text-center">
                      Created by {draft?.user?.name || draft?.user?.email || "Team Member"}.
                    </div>
                  ) : (
                    draft.editHistory
                      .slice()
                      .reverse()
                      .map((entry: any, idx: number) => (
                        <div key={idx} className="flex flex-col gap-0.5 text-xs pt-2 first:pt-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-foreground truncate max-w-[160px]">
                              {entry.userName || entry.userEmail || "Team Member"}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                              {entry.editedAt
                                ? format(new Date(entry.editedAt), "MMM d, h:mm a")
                                : "—"}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {entry.action || "Updated draft"}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Cluster 2: Stable Zoom Widget (Fixed-width, click-to-reset, exactly matches template builder) */}
            <div className="flex items-center gap-0.5 border border-border rounded-md px-1 h-8 shrink-0 bg-background/80 select-none">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setBuilderScale((s) => Math.max(Number((s - 0.05).toFixed(2)), 0.75))
                }
                title="Zoom Out"
              >
                <span className="text-base leading-none font-medium mb-0.5">-</span>
              </Button>
              <button
                type="button"
                onClick={() => setBuilderScale(1)}
                className={cn(
                  "text-xs font-mono w-12 text-center rounded px-1 py-0.5 transition-colors cursor-pointer",
                  builderScale !== 1
                    ? "text-primary font-bold hover:bg-primary/10 hover:underline"
                    : "text-muted-foreground font-semibold hover:text-foreground",
                )}
                title={builderScale !== 1 ? "Click to reset to 100%" : "Current Zoom: 100%"}
              >
                {Math.round(builderScale * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setBuilderScale((s) => Math.min(Number((s + 0.05).toFixed(2)), 1.35))
                }
                title="Zoom In"
              >
                <span className="text-base leading-none font-medium mb-0.5">+</span>
              </Button>
            </div>

            {/* Cluster 3: Section View Options Popover (Outside the table in the top bar!) */}
            <SectionViewOptionsPopover />

            {/* Cluster 4: Studio Button on the FAR RIGHT */}
            <Button
              variant={tokenPoolOpen ? "secondary" : "outline"}
              size="sm"
              onClick={() => setTokenPoolOpen((open) => !open)}
              disabled={draftMode === "preview"}
              className={cn(
                "gap-1.5 text-xs h-8 shrink-0 ml-0.5",
                tokenPoolOpen && "bg-primary/10 border-primary text-primary font-semibold",
                draftMode === "preview" && "opacity-40 cursor-not-allowed",
              )}
              title={tokenPoolOpen ? "Close Studio Sidebar" : "Open Studio Sidebar"}
            >
              {tokenPoolOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Studio</span>
            </Button>
          </div>
        </div>
        {/* -- Body -------------------------------------------------- */}
        <div className="flex-1 flex overflow-hidden relative border-t">
          <DragDropContext
            onDragEnd={async (result: DropResult) => {
              if (!result.destination) return;
              const { source, destination, draggableId } = result;

              // 1. Dragging from Additional Line Items sidebar into a Section (Case A)
              if (
                source.droppableId === "additional-line-items" &&
                destination.droppableId.startsWith("rows-")
              ) {
                const targetSectionId = destination.droppableId.replace(/^rows-/, "");
                const itemId = draggableId.replace(/^catalog-/, "");
                const catalog: any[] =
                  queryClient.getQueryData(invoiceKeys.optionalRows.byDraft(draftId)) || [];
                const item = catalog.find((c: any) => c.id === itemId);
                if (!item) return;

                try {
                  await invoiceApi.addDraftOptionalRow(draftId, {
                    canonicalToken: item.rowToken,
                    sectionId: targetSectionId,
                  });
                  queryClient.invalidateQueries({ queryKey: ["draft-sections", draftId] });
                  queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
                  toast.success(`Added "${item.label}" to section`);
                } catch (err: any) {
                  toast.error(err.message || "Failed to add row to draft");
                }
                return;
              }

              // 2. Dragging a Row from Table Section into Additional Line Items sidebar (Case B)
              if (
                source.droppableId.startsWith("rows-") &&
                destination.droppableId === "additional-line-items"
              ) {
                const sourceSectionId = source.droppableId.replace(/^rows-/, "");
                const draftSections: any[] =
                  queryClient.getQueryData(["draft-sections", draftId]) || [];
                const sourceSection = draftSections.find((s: any) => s.id === sourceSectionId);
                const row = (sourceSection?.rows || []).find((r: any) => r.id === draggableId);
                if (!row) return;

                try {
                  if (row.isOptionalService) {
                    await invoiceApi.deleteDraftOptionalRow(draftId, row.id);
                  } else {
                    await invoiceApi.addDraftOptionalRow(draftId, {
                      canonicalToken: row.rowToken,
                      customLabel: row.label,
                      customValue:
                        row.valueType === "normal" && row.initialValue
                          ? Number(row.initialValue)
                          : undefined,
                      customFormula: row.valueType === "formula" ? row.formula : undefined,
                    });
                    await fetch(
                      `${apiUrl}/api/invoices/drafts/${draftId}/sections/${sourceSectionId}/rows/${row.id}`,
                      {
                        method: "DELETE",
                        credentials: "include",
                      },
                    );
                  }
                  queryClient.invalidateQueries({ queryKey: ["draft-sections", draftId] });
                  queryClient.invalidateQueries({ queryKey: ["draft-preview", draftId] });
                  queryClient.invalidateQueries({
                    queryKey: invoiceKeys.optionalRows.byDraft(draftId),
                  });
                  toast.success(`Moved "${row.label || row.rowToken}" to Additional Line Items`);
                } catch (err: any) {
                  toast.error(err.message || "Failed to move row to catalog");
                }
                return;
              }

              // 3. Reordering rows within the same section (Case C)
              if (
                source.droppableId.startsWith("rows-") &&
                destination.droppableId.startsWith("rows-") &&
                source.droppableId === destination.droppableId
              ) {
                const sectionId = source.droppableId.replace(/^rows-/, "");
                if (source.index === destination.index) return;

                const sectionsData =
                  queryClient.getQueryData<any[]>(["draft-sections", draftId]) || [];
                const section = sectionsData.find((s: any) => s.id === sectionId);
                if (!section) return;

                const sortedRows = [...(section.rows || [])].sort(
                  (a: any, b: any) => a.sortOrder - b.sortOrder,
                );
                const [moved] = sortedRows.splice(source.index, 1);
                sortedRows.splice(destination.index, 0, moved);
                const orderedIds = sortedRows.map((r: any) => r.id);

                queryClient.setQueryData(["draft-sections", draftId], (old: any) => {
                  if (!old) return old;
                  return old.map((s: any) => {
                    if (s.id !== sectionId) return s;
                    const rowMap = Object.fromEntries((s.rows || []).map((r: any) => [r.id, r]));
                    const reordered = orderedIds.map((id, i) => ({
                      ...rowMap[id],
                      sortOrder: i,
                    }));
                    return { ...s, rows: reordered };
                  });
                });

                try {
                  await fetch(
                    `${apiUrl}/api/invoices/drafts/${draftId}/sections/${sectionId}/rows/reorder`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ orderedIds }),
                    },
                  );
                } catch (err) {
                  queryClient.invalidateQueries({ queryKey: ["draft-sections", draftId] });
                  toast.error("Failed to reorder rows");
                }
                return;
              }

              // 4. Reordering draft header description fields (Case D)
              if (
                (source.droppableId === "header-left" || source.droppableId === "header-right") &&
                (destination.droppableId === "header-left" ||
                  destination.droppableId === "header-right")
              ) {
                const sourceCol = source.droppableId.replace(/^header-/, "") as "left" | "right";
                const destCol = destination.droppableId.replace(/^header-/, "") as "left" | "right";

                const headerFields: any[] =
                  queryClient.getQueryData(["draft-header-fields", draftId]) || [];
                const leftFields = headerFields
                  .filter((f) => f.columnPosition === "left")
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                const rightFields = headerFields
                  .filter((f) => f.columnPosition === "right")
                  .sort((a, b) => a.sortOrder - b.sortOrder);

                const sourceList = sourceCol === "left" ? leftFields : rightFields;
                const destList = destCol === "left" ? leftFields : rightFields;

                const [moved] = sourceList.splice(source.index, 1);
                if (sourceCol !== destCol) {
                  moved.columnPosition = destCol;
                }
                destList.splice(destination.index, 0, moved);

                leftFields.forEach((f, i) => {
                  f.sortOrder = i;
                  f.columnPosition = "left";
                });
                rightFields.forEach((f, i) => {
                  f.sortOrder = i;
                  f.columnPosition = "right";
                });

                const newState = [...leftFields, ...rightFields];
                queryClient.setQueryData(["draft-header-fields", draftId], newState);

                try {
                  const updates = newState.map((f) => ({
                    fieldId: f.id,
                    columnPosition: f.columnPosition,
                    sortOrder: f.sortOrder,
                  }));
                  await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/header-fields/reorder`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ updates }),
                  });
                } catch {
                  queryClient.invalidateQueries({ queryKey: ["draft-header-fields", draftId] });
                }
                return;
              }
            }}
          >
            {/* Mobile backdrop for Studio Sidebar */}
            {tokenPoolOpen && (
              <div
                className="md:hidden absolute inset-0 z-30 bg-background/60 backdrop-blur-sm"
                onClick={() => setTokenPoolOpen(false)}
              />
            )}

            {/* Main Builder Area */}
            <div
              className={cn(
                "flex flex-col h-full bg-muted/20 overflow-y-auto transition-all duration-200 flex-1 min-w-0",
                tokenPoolOpen && "md:border-r md:border-border",
              )}
              style={
                {
                  "--builder-scale": builderScale,
                  zoom: builderScale,
                } as React.CSSProperties
              }
            >
              <TemplateBuilderWorkspace
                templateId={draft.sourceTemplateId}
                draftId={draftId}
                zoomLevel={0}
                project={draft?.project}
                draftHeaderValues={draft?.draftHeaderValues}
                isSharedDnd={true}
                resolvedTokens={preview?.resolvedScope?.tokens}
                projectedDocumentNumber={
                  preview?.projectedDocumentNumber || draft?.projectedDocumentNumber
                }
              />
            </div>

            {/* Sliding Token Pool Panel */}
            {draftMode !== "preview" && (
              <div
                className={cn(
                  "h-full bg-background border-l border-border transition-[width] duration-300 ease-in-out relative shrink-0 overflow-hidden",
                  !tokenPoolOpen && "border-transparent",
                  "absolute md:relative inset-y-0 right-0 z-40 md:z-0 shadow-2xl md:shadow-none",
                )}
                style={{ width: tokenPoolOpen ? poolWidth : 0 }}
              >
                {tokenPoolOpen && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 transition-colors z-50 -ml-[1px]"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const startX = e.clientX;
                      const startWidth = poolWidth;

                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const delta = startX - moveEvent.clientX;
                        const newWidth = Math.min(Math.max(startWidth + delta, 240), 600);
                        setPoolWidth(newWidth);
                      };

                      const handleMouseUp = () => {
                        window.removeEventListener("mousemove", handleMouseMove);
                        window.removeEventListener("mouseup", handleMouseUp);
                      };

                      window.addEventListener("mousemove", handleMouseMove);
                      window.addEventListener("mouseup", handleMouseUp);
                    }}
                  />
                )}
                <div style={{ width: poolWidth }} className="h-full overflow-hidden">
                  <TemplateTokenPool
                    templateId={draft.sourceTemplateId}
                    draftId={draftId}
                    activeTab={sidebarTab}
                    onTabChange={setSidebarTab}
                    onClose={() => setTokenPoolOpen(false)}
                  />
                </div>
              </div>
            )}
          </DragDropContext>
        </div>

        {isAddOptionalServiceModalOpen && (
          <AddOptionalServiceModal
            isOpen={isAddOptionalServiceModalOpen}
            onClose={() => setIsAddOptionalServiceModalOpen(false)}
            draftId={draftId}
            sections={draft.draftSections || []}
          />
        )}

        {isSaveTemplateModalOpen && (
          <SaveDraftAsTemplateModal
            isOpen={isSaveTemplateModalOpen}
            onClose={() => setIsSaveTemplateModalOpen(false)}
            draftId={draftId}
            defaultName={draft?.name}
            defaultDescription={`Master template created from draft "${draft?.name || draftId}"`}
          />
        )}

        {isSyncModalOpen && (
          <TemplateSyncModal
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            draftId={draftId}
            syncStatus={syncStatus}
          />
        )}
      </div>
    </BuilderProvider>
  );
}
