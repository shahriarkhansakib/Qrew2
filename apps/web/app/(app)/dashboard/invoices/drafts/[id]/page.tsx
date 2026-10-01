"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
// --- TEMPLATE BUILDER IMPORTS ---
import { BuilderProvider } from "@/components/features/invoice-templates/builder/builder-context";
import { TemplateBuilderWorkspace } from "@/components/features/invoice-templates/builder/template-builder-workspace";
import { TemplateTokenPool } from "@/components/features/invoice-templates/builder/token-pool";
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
import { apiUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function DraftBuilderPage() {
  const { id } = useParams() as { id: string };
  const draftId = id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isEditMode, setIsEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [tokenPoolOpen, setTokenPoolOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [poolWidth, setPoolWidth] = useState(320);

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
  });

  // 2. Preview for read-only mode
  // The draft itself doesn't contain calculated sums. We rely on the engine to calculate the preview.
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: [
      "draft-preview",
      draftId,
      overrides,
      draft?.draftSections?.length,
      draft?.draftConstants,
      isEditMode,
    ],
    queryFn: async () => {
      if (!draft || isEditMode) return null;

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
          projectId: draft.projectId,
          clientId: draft.project?.clientId,
          documentType: "general", // We'll let the user choose or use a default later, or get from project
          sourceTemplateId: draft.sourceTemplateId,
          draftRows: draft.draftSections,
          headerFieldValues: draft.draftHeaderValues || {},
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
      // Delete the draft
      await fetch(`${apiUrl}/api/invoices/drafts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      queryClient.invalidateQueries({ queryKey: ["project-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
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

  const updateDraftDetails = async (field: string, value: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/invoices/drafts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: draft.projectId,
          [field]: value,
        }),
      });
      if (!res.ok) throw new Error("Failed to update draft");
      queryClient.invalidateQueries({ queryKey: ["invoice-draft", draftId] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    } catch (_error) {
      toast.error("Failed to update draft detail");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* -- Top bar ----------------------------------------------- */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/invoices">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <Input
                  className="h-7 text-lg font-bold tracking-tight px-1 py-0 w-64 focus-visible:ring-1 focus-visible:ring-offset-0 border-transparent bg-muted/30 hover:bg-muted/50"
                  defaultValue={draft?.name || "Invoice Draft"}
                  onBlur={(e) => updateDraftDetails("name", e.target.value)}
                  placeholder="Draft Name"
                />
              ) : (
                <h1 className="text-lg font-bold tracking-tight">
                  {draft?.name || "Invoice Draft"}
                </h1>
              )}
              {isEditMode && (
                <Badge
                  variant="outline"
                  className="text-accent-foreground border-amber-400/40 bg-accent/10 text-[11px]"
                >
                  Editing
                </Badge>
              )}
            </div>

            {isEditMode ? (
              <Input
                className="h-5 text-xs text-muted-foreground px-1 py-0 w-96 border-transparent bg-muted/30 hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-offset-0 mt-0.5"
                defaultValue={
                  draft?.description ||
                  `${draft?.project?.name ?? "-"} - Changes apply only to this draft`
                }
                onBlur={(e) => updateDraftDetails("description", e.target.value)}
                placeholder="Draft Description"
              />
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {draft?.description ||
                  `${draft?.project?.name ?? "-"} - Read-only preview. Click Edit Draft to make changes.`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Workspace Zoom Controls */}
          <div className="flex items-center gap-1 border border-border rounded-md px-1 h-8 shrink-0 mr-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setZoomLevel((z) => Math.max(z - 1, -4))}
              title="Workspace Zoom Out"
            >
              <span className="text-lg leading-none font-medium mb-1">-</span>
            </Button>
            <span
              className="text-xs font-mono w-4 text-center select-none text-muted-foreground"
              title="Workspace Zoom"
            >
              {zoomLevel > 0 ? `+${zoomLevel}` : zoomLevel}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setZoomLevel((z) => Math.min(z + 1, 8))}
              title="Workspace Zoom In"
            >
              <span className="text-lg leading-none font-medium mb-1">+</span>
            </Button>
          </div>
          {isEditMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTokenPoolOpen((prev) => !prev)}
                className="w-9 px-0 mr-2"
                title={tokenPoolOpen ? "Close Token Pool" : "Open Token Pool"}
              >
                {tokenPoolOpen ? (
                  <PanelRightClose className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete Draft"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your invoice draft.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteMutation.isPending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteMutation.isPending}
                      className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditMode(false)}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Done Editing
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditMode(true)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Draft
              </Button>
              <Button
                size="sm"
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="gap-1.5"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {finalizeMutation.isPending ? "Finalizing..." : "Finalize Invoice"}
              </Button>
            </>
          )}
        </div>
      </div>
      {/* -- Body -------------------------------------------------- */}
      {isEditMode ? (
        <div className="flex-1 flex overflow-hidden relative border-t">
          <BuilderProvider
            mode="draft"
            draftId={draftId}
            apiBasePath={`${apiUrl}/api/invoices/drafts/${draftId}`}
            invalidateKey={["draft-sections", draftId]}
          >
            {/* Main Builder Area */}
            <div className="flex-1 overflow-auto bg-muted/20">
              <TemplateBuilderWorkspace
                templateId={draft.sourceTemplateId}
                draftId={draftId}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                project={draft?.project}
              />
            </div>

            {/* Sliding Token Pool Panel */}
            <div
              className={cn(
                "h-full bg-background border-l border-border overflow-visible transition-all duration-200 relative",
                tokenPoolOpen ? "flex shrink-0" : "hidden",
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
              <div className="flex-1 w-full h-full overflow-hidden">
                <TemplateTokenPool templateId={draft.sourceTemplateId} draftId={draftId} />
              </div>
            </div>
          </BuilderProvider>
        </div>
      ) : (
        // ── Fill Values Mode ──
        <div className="flex-1 flex overflow-hidden relative border-t">
          <BuilderProvider
            mode="fill"
            draftId={draftId}
            apiBasePath={`${apiUrl}/api/invoices/drafts/${draftId}`}
            invalidateKey={["draft-sections", draftId]}
            validationErrors={preview?.validationErrors ?? []}
          >
            {/* Main Builder Area */}
            <div className="flex-1 overflow-auto bg-muted/20">
              <TemplateBuilderWorkspace
                templateId={draft.sourceTemplateId}
                draftId={draftId}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                project={draft?.project}
              />
            </div>

            {/* Sliding Token Pool Panel */}
            <div
              className={cn(
                "h-full bg-background border-l border-border overflow-visible transition-all duration-200 relative",
                tokenPoolOpen ? "flex shrink-0" : "hidden",
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
              <div className="flex-1 w-full h-full overflow-hidden">
                <TemplateTokenPool templateId={draft.sourceTemplateId} draftId={draftId} />
              </div>
            </div>
          </BuilderProvider>
        </div>
      )}
    </div>
  );
}
