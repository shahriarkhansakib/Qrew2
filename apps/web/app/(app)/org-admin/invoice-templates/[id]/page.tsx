"use client";

import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Layers, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BuilderProvider } from "@/components/features/invoice-templates/builder/builder-context";
import { TemplateBuilderWorkspace } from "@/components/features/invoice-templates/builder/template-builder-workspace";
import { TemplateOptionalRowsModal } from "@/components/features/invoice-templates/builder/template-optional-rows-modal";
import { TemplatePreviewModal } from "@/components/features/invoice-templates/builder/template-preview-modal";
import { TemplateTokenPool } from "@/components/features/invoice-templates/builder/token-pool";
import { invoiceApi } from "@/components/features/invoices/shared/invoice-api";
import { invoiceKeys } from "@/components/features/invoices/shared/invoice-keys";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function TemplateBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const templateId = params.id as string;
  const [tokenPoolOpen, setTokenPoolOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"tokens" | "line-items">("tokens");
  const [zoomLevel, setZoomLevel] = useState(0);
  const [poolWidth, setPoolWidth] = useState(320);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [optionalRowsModalOpen, setOptionalRowsModalOpen] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
    queryFn: () => invoiceApi.getTemplateOptionalRows(templateId),
    enabled: !!templateId,
  });

  const { data: template, isLoading } = useQuery({
    queryKey: ["invoice-templates", templateId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch template");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-65px)] -m-4 md:-m-6 lg:-m-8 animate-pulse">
        {/* Skeleton header bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
          <div className="h-8 w-8 rounded-md bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-64 rounded bg-muted/60" />
          </div>
          <div className="h-8 w-20 rounded-md bg-muted ml-auto" />
          <div className="h-8 w-20 rounded-md bg-muted" />
        </div>

        {/* Skeleton body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Workspace */}
          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-muted/20">
            {/* Section card skeleton × 2 */}
            {[0, 1].map((i) => (
              <div key={i} className="rounded-lg border bg-background p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded bg-muted" />
                  <div className="h-4 w-32 rounded bg-muted" />
                </div>
                {/* Row skeletons */}
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-3 pl-6">
                    <div className="h-3 w-3 rounded bg-muted/60" />
                    <div className="h-3 flex-1 rounded bg-muted/60" />
                    <div className="h-3 w-20 rounded bg-muted/60" />
                    <div className="h-3 w-20 rounded bg-muted/60" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Token pool panel skeleton */}
          <div className="w-[320px] shrink-0 border-l bg-background p-4 space-y-4">
            <div className="h-4 w-24 rounded bg-muted" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-muted/60" />
                <div className="h-3 w-full rounded bg-muted/60" />
                <div className="h-3 w-16 rounded bg-muted/40" />
              </div>
            ))}
            <div className="pt-2 h-px bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-muted/60" />
                <div className="h-3 w-full rounded bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4">
        <p>Template not found.</p>
        <Button onClick={() => router.push("/org-admin/invoice-templates")}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] -m-4 md:-m-6 lg:-m-8">
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background z-10 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/org-admin/invoice-templates")}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold leading-tight truncate">{template.name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {template.description || "No description"}
          </p>
        </div>

        {/* Font Zoom Controls */}
        <div className="flex items-center gap-1 border border-border rounded-md px-1 h-8 shrink-0">
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

        {/* Additional Line Items Sidebar Button */}
        <Button
          variant={tokenPoolOpen && sidebarTab === "line-items" ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            if (tokenPoolOpen && sidebarTab === "line-items") {
              setTokenPoolOpen(false);
            } else {
              setSidebarTab("line-items");
              setTokenPoolOpen(true);
            }
          }}
          className={cn(
            "shrink-0 gap-1.5 text-xs h-8 ml-auto border-dashed border-primary/40 text-primary hover:bg-primary/5",
            tokenPoolOpen && sidebarTab === "line-items" && "bg-primary/10 border-primary text-primary font-semibold",
          )}
          title="Open Additional Line Items pool"
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Additional Line Items</span>
          {catalog.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-bold">
              {catalog.length}
            </span>
          )}
        </Button>

        {/* Preview Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          className="shrink-0 gap-2 text-xs h-8 ml-2"
        >
          Preview Template
        </Button>

        {/* Token Pool toggle — always visible */}
        <Button
          variant={tokenPoolOpen && sidebarTab === "tokens" ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            if (tokenPoolOpen && sidebarTab === "tokens") {
              setTokenPoolOpen(false);
            } else {
              setSidebarTab("tokens");
              setTokenPoolOpen(true);
            }
          }}
          className={cn(
            "shrink-0 gap-2 text-xs h-8 ml-2",
            tokenPoolOpen && sidebarTab === "tokens" && "bg-primary/10 border-primary text-primary font-semibold",
          )}
          title={tokenPoolOpen ? "Hide Sidebar" : "Show Sidebar"}
        >
          {tokenPoolOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Tokens</span>
        </Button>
      </div>

      <BuilderProvider
        mode="template"
        templateId={templateId}
        apiBasePath={`${apiUrl}/api/invoice-templates/${templateId}`}
        invalidateKey={["template-sections", templateId]}
      >
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
              const catalogItem = catalog.find((c: any) => c.id === itemId);
              if (!catalogItem) return;

              const sectionsData =
                queryClient.getQueryData<any[]>(["template-sections", templateId]) || [];
              const existingTokens = new Set<string>();
              for (const sec of sectionsData) {
                for (const r of sec.rows || []) {
                  if (r.rowToken) existingTokens.add(r.rowToken);
                }
              }

              let uniqueToken = catalogItem.rowToken;
              let counter = 2;
              while (existingTokens.has(uniqueToken)) {
                uniqueToken = `${catalogItem.rowToken}_${counter}`;
                counter++;
              }

              try {
                const res = await fetch(
                  `${apiUrl}/api/invoice-templates/${templateId}/sections/${targetSectionId}/rows`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                      rowToken: uniqueToken,
                      label: catalogItem.label,
                      description: catalogItem.subDescription || null,
                      valueType: catalogItem.valueType || "normal",
                      formula: catalogItem.formula || null,
                      initialValue: catalogItem.initialValue || null,
                    }),
                  },
                );

                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || "Failed to add row");
                }

                toast.success(`Added "${catalogItem.label}" to section`);
                queryClient.invalidateQueries({ queryKey: ["template-sections", templateId] });
              } catch (err: any) {
                toast.error(err.message || "Failed to add row to table");
              }
              return;
            }

            // 2. Dragging a Row from Table Section into Additional Line Items sidebar (Case B)
            if (
              source.droppableId.startsWith("rows-") &&
              destination.droppableId === "additional-line-items"
            ) {
              const sourceSectionId = source.droppableId.replace(/^rows-/, "");
              const sectionsData =
                queryClient.getQueryData<any[]>(["template-sections", templateId]) || [];
              const sourceSection = sectionsData.find((s: any) => s.id === sourceSectionId);
              const row = (sourceSection?.rows || []).find((r: any) => r.id === draggableId);
              if (!row) return;

              try {
                await invoiceApi.addTemplateOptionalRow(templateId, {
                  rowToken: row.rowToken,
                  label: row.label,
                  subDescription: row.description || null,
                  valueType: row.valueType || "normal",
                  formula: row.formula || null,
                  initialValue: row.initialValue || null,
                });

                await fetch(
                  `${apiUrl}/api/invoice-templates/${templateId}/sections/${sourceSectionId}/rows/${row.id}`,
                  {
                    method: "DELETE",
                    credentials: "include",
                  },
                );

                queryClient.invalidateQueries({ queryKey: ["template-sections", templateId] });
                queryClient.invalidateQueries({
                  queryKey: invoiceKeys.optionalRows.byTemplate(templateId),
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
                queryClient.getQueryData<any[]>(["template-sections", templateId]) || [];
              const section = sectionsData.find((s: any) => s.id === sectionId);
              if (!section) return;

              const sortedRows = [...(section.rows || [])].sort(
                (a: any, b: any) => a.sortOrder - b.sortOrder,
              );
              const [moved] = sortedRows.splice(source.index, 1);
              sortedRows.splice(destination.index, 0, moved);
              const orderedIds = sortedRows.map((r: any) => r.id);

              queryClient.setQueryData(["template-sections", templateId], (old: any) => {
                if (!old) return old;
                return old.map((s: any) => {
                  if (s.id !== sectionId) return s;
                  const rowMap = Object.fromEntries((s.rows || []).map((r: any) => [r.id, r]));
                  const reordered = orderedIds.map((id, i) => ({ ...rowMap[id], sortOrder: i }));
                  return { ...s, rows: reordered };
                });
              });

              try {
                await fetch(
                  `${apiUrl}/api/invoice-templates/${templateId}/sections/${sectionId}/rows/reorder`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ orderedIds }),
                  },
                );
              } catch (err) {
                queryClient.invalidateQueries({ queryKey: ["template-sections", templateId] });
                toast.error("Failed to reorder rows");
              }
              return;
            }

            // 4. Header fields reordering (Case D)
            if (
              (source.droppableId === "header-left" || source.droppableId === "header-right") &&
              (destination.droppableId === "header-left" || destination.droppableId === "header-right")
            ) {
              const sourceCol = source.droppableId.replace(/^header-/, "") as "left" | "right";
              const destCol = destination.droppableId.replace(/^header-/, "") as "left" | "right";

              const headerFields: any[] =
                queryClient.getQueryData(["template-header-fields", templateId]) || [];
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
              queryClient.setQueryData(["template-header-fields", templateId], newState);

              try {
                const updates = newState.map((f) => ({
                  fieldId: f.id,
                  columnPosition: f.columnPosition,
                  sortOrder: f.sortOrder,
                }));
                await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields/reorder`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ updates }),
                });
              } catch (err) {
                queryClient.invalidateQueries({ queryKey: ["template-header-fields", templateId] });
              }
              return;
            }
          }}
        >
          {/* ── Split panes ─────────────────────────────────────────────────── */}
          <div className="flex flex-1 overflow-hidden relative">
            {/* Mobile backdrop for Token Pool */}
            {tokenPoolOpen && (
              <div
                className="md:hidden absolute inset-0 z-30 bg-background/60 backdrop-blur-sm"
                onClick={() => setTokenPoolOpen(false)}
              />
            )}

            {/* Builder workspace — expands to fill when token pool is hidden */}
            <div
              className={cn(
                "flex flex-col h-full bg-muted/20 overflow-y-auto transition-all duration-200 flex-1 min-w-0",
                tokenPoolOpen && "md:border-r md:border-border",
              )}
            >
              <TemplateBuilderWorkspace
                templateId={templateId}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
                isSharedDnd={true}
              />
            </div>

            {/* Token pool / Line items sidebar — collapsible */}
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
                <TemplateTokenPool
                  templateId={templateId}
                  activeTab={sidebarTab}
                  onTabChange={setSidebarTab}
                />
              </div>
            </div>
          </div>
        </DragDropContext>
      </BuilderProvider>

      {previewOpen && (
        <TemplatePreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          templateId={templateId}
        />
      )}

      {optionalRowsModalOpen && (
        <TemplateOptionalRowsModal
          isOpen={optionalRowsModalOpen}
          onClose={() => setOptionalRowsModalOpen(false)}
          templateId={templateId}
        />
      )}
    </div>
  );
}
