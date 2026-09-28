"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/constants";
import { buildTokenMap, fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddHeaderFieldModal } from "./add-header-field-modal";
import { AddSectionModal } from "./add-section-modal";
import { useBuilderContext } from "./builder-context";
import { TemplateFormulaBar } from "./formula-bar";
import { SectionColor } from "./row-list";
import { TemplateSectionCard } from "./template-section-card";

// ─── Section color palette ────────────────────────────────────────────────────
export const SECTION_PALETTE: SectionColor[] = [
  { border: "#22c55e", bg: "rgba(34,197,94,0.05)" }, // green
  { border: "#3b82f6", bg: "rgba(59,130,246,0.05)" }, // blue
  { border: "#f59e0b", bg: "rgba(245,158,11,0.05)" }, // amber
  { border: "#a855f7", bg: "rgba(168,85,247,0.05)" }, // purple
  { border: "#ef4444", bg: "rgba(239,68,68,0.05)" }, // red
  { border: "#14b8a6", bg: "rgba(20,184,166,0.05)" }, // teal
  { border: "#f97316", bg: "rgba(249,115,22,0.05)" }, // orange
  { border: "#ec4899", bg: "rgba(236,72,153,0.05)" }, // pink
];

// ─── "Add section here" divider ───────────────────────────────────────────────
function AddSectionDivider({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex items-center justify-center h-7 group">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover:bg-primary/30 transition-colors" />
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative z-10 inline-flex items-center gap-1 px-3 h-5 rounded-full text-[11px] font-medium",
          "border border-dashed border-border bg-background text-muted-foreground",
          "hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all duration-150",
          "shadow-sm",
        )}
      >
        <Plus className="h-2.5 w-2.5" />
        Add section here
      </button>
    </div>
  );
}

// ─── Table header row ─────────────────────────────────────────────────────────
// 4 columns: SL (w-10) | Label (flex-1) | USD (w-20) | USD (w-20)
// The token area is outside the table (absolute-positioned per row), so NO token space here.
function TableHeaderRow() {
  return (
    <div className="flex items-stretch border border-b-0 border-border bg-muted/40 h-10">
      {/* SL */}
      <div className="w-10 shrink-0 flex items-center justify-center border-r border-border text-sm font-extrabold text-foreground/60">
        SL
      </div>
      {/* Label */}
      <div className="flex-1 px-3 flex items-center gap-2 border-r border-border min-w-0">
        <span className="text-sm font-extrabold text-foreground/60">Row Label</span>
        <span className="text-sm text-foreground/40">(text displayed in PDF)</span>
      </div>
      {/* USD1 — base/charge values */}
      <div className="w-20 shrink-0 flex items-center justify-center border-r border-border text-sm font-extrabold text-foreground/60">
        USD
      </div>
      {/* USD2 — row totals */}
      <div className="w-20 shrink-0 flex items-center justify-center text-sm font-extrabold text-foreground/60">
        USD
      </div>
    </div>
  );
}

// ─── Grand total row ──────────────────────────────────────────────────────────
// Totals in USD2 (right column). No token space (tokens are absolute per-row).
function GrandTotalRow({ total }: { total: number | null }) {
  return (
    <div className="flex items-stretch border border-t-2 border-t-foreground/30 border-border bg-muted/10 h-12">
      {/* SL empty */}
      <div className="w-10 shrink-0 border-r border-border" />
      {/* Label — "Total" right-aligned */}
      <div className="flex-1 px-3 flex items-center justify-end border-r border-border min-w-0">
        <span className="text-base font-extrabold text-foreground uppercase tracking-wide">
          Total
        </span>
      </div>
      {/* USD1 — blank */}
      <div className="w-20 shrink-0 border-r border-border" />
      {/* USD2 — grand total */}
      <div className="w-20 shrink-0 flex items-center justify-end px-3">
        <span className="text-base font-extrabold text-foreground tabular-nums">
          {total != null ? fmt(total) : "—"}
        </span>
      </div>
    </div>
  );
}

import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";

export interface FileDetailsHeaderBoxProps {
  templateHeaderFields?: Array<{
    id: string;
    label: string;
    fileFieldKey: string;
    fieldType: string;
    columnPosition: "left" | "right";
    sortOrder: number;
  }>;
  project?: any; // The actual project data to populate values
  onDelete?: (id: string) => void;
  onEdit?: (field: any) => void;
  onAdd?: () => void;
  onReorder?: (updates: any[], optimisticState: any[]) => void;
  isTemplateMode?: boolean;
}

export function FileDetailsHeaderBox({
  templateHeaderFields = [],
  project,
  onDelete,
  onEdit,
  onAdd,
  onReorder,
  isTemplateMode = false,
  zoomLevel = 0,
}: FileDetailsHeaderBoxProps & { zoomLevel?: number }) {
  const { selectedCell } = useBuilderContext();
  const isFormulaMode = !!selectedCell;

  const handleTokenClick = (e: React.MouseEvent, clickedToken: string) => {
    e.stopPropagation();
    if (isFormulaMode) {
      window.dispatchEvent(new CustomEvent("insert-token", { detail: clickedToken }));
    } else {
      navigator.clipboard.writeText(clickedToken);
      toast.success("Token copied");
    }
  };

  const renderVal = (field: any) => {
    if (!project) return <span className="text-foreground/20 font-light">—</span>;

    let val: any = "—";
    if (field.fileFieldKey === "clientId") {
      val = project.client?.name || "—";
    } else if (field.fileFieldKey === "name") {
      val = project.name || "—";
    } else if (field.fileFieldKey === "status") {
      val = project.statusRelation?.name || project.status || "—";
    } else if (project.customFields) {
      val = project.customFields[field.fileFieldKey] ?? "—";
    }

    if (val === "—" || val === null || val === undefined) {
      return <span className="text-foreground/20 font-light">—</span>;
    }
    return val;
  };

  const renderFieldRow = (field: any) => {
    const isSelectable = field.isFormulaInjectable;
    const cleanToken = (field.fileFieldKey || "").toUpperCase().replace(/^FILE_/, "");

    return (
      <div className="flex justify-between items-center group relative h-6 w-full">
        <div
          className={cn(
            "flex gap-2 w-full items-center",
            isSelectable && "transition-colors select-none",
            isSelectable &&
              isFormulaMode &&
              "cursor-pointer text-primary hover:bg-primary/5 rounded-md -ml-1 pl-1",
            isSelectable &&
              !isFormulaMode &&
              "cursor-pointer hover:text-foreground hover:bg-muted/10 rounded-md -ml-1 pl-1",
          )}
          onClick={(e) => isSelectable && field.fileFieldKey && handleTokenClick(e, cleanToken)}
          title={
            isSelectable
              ? isFormulaMode
                ? `Insert ${cleanToken} into formula`
                : `Copy token ${cleanToken}`
              : undefined
          }
        >
          <span
            className={cn(
              "font-semibold uppercase tracking-widest w-28 shrink-0 truncate",
              isSelectable && isFormulaMode ? "text-primary/70" : "text-muted-foreground",
            )}
            style={{ fontSize: 12 + zoomLevel }}
          >
            {field.label}
          </span>
          <span className="text-muted-foreground/40 shrink-0">:</span>
          <span className="font-medium truncate" style={{ fontSize: 14 + zoomLevel }}>
            {renderVal(field)}
          </span>
        </div>
        {isTemplateMode && (
          <div className="opacity-0 group-hover:opacity-100 absolute -right-9 flex items-center gap-0.5 transition-all">
            {onEdit && (
              <button
                onClick={() => onEdit(field)}
                className="p-1 text-muted-foreground hover:text-foreground transition-all"
                title="Edit field"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(field.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-all"
                title="Remove field from template"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !onReorder) return;

    const sourceCol = result.source.droppableId;
    const destCol = result.destination.droppableId;

    const leftFields = Array.from(
      templateHeaderFields.filter((f) => f.columnPosition === "left"),
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const rightFields = Array.from(
      templateHeaderFields.filter((f) => f.columnPosition === "right"),
    ).sort((a, b) => a.sortOrder - b.sortOrder);

    const sourceList = sourceCol === "left" ? leftFields : rightFields;
    const destList = destCol === "left" ? leftFields : rightFields;

    const [moved] = sourceList.splice(result.source.index, 1);

    if (sourceCol !== destCol) {
      moved.columnPosition = destCol as "left" | "right";
    }

    destList.splice(result.destination.index, 0, moved);

    leftFields.forEach((f, i) => {
      f.sortOrder = i;
      f.columnPosition = "left";
    });
    rightFields.forEach((f, i) => {
      f.sortOrder = i;
      f.columnPosition = "right";
    });

    const newState = [...leftFields, ...rightFields];
    const updates = newState.map((f) => ({
      fieldId: f.id,
      columnPosition: f.columnPosition,
      sortOrder: f.sortOrder,
    }));

    onReorder(updates, newState);
  };

  const leftFields = templateHeaderFields
    .filter((f) => f.columnPosition === "left")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rightFields = templateHeaderFields
    .filter((f) => f.columnPosition === "right")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const renderDroppable = (id: string, fields: any[]) => (
    <Droppable droppableId={id} direction="vertical">
      {(provided, snapshot) => (
        <div
          className={cn(
            "flex flex-col gap-y-4 rounded-lg",
            snapshot.isDraggingOver && "bg-muted/30 -mx-2 px-2 py-1",
          )}
          ref={provided.innerRef}
          {...provided.droppableProps}
        >
          {fields.map((field, index) => (
            <Draggable
              key={field.id}
              draggableId={field.id}
              index={index}
              isDragDisabled={!isTemplateMode || !onReorder}
            >
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  style={{
                    ...provided.draggableProps.style,
                  }}
                  className={cn(
                    "flex items-center gap-2",
                    snapshot.isDragging &&
                      "bg-card shadow-md z-10 p-1 -m-1 rounded-md border border-primary/20",
                  )}
                >
                  {isTemplateMode && onReorder && (
                    <div
                      {...provided.dragHandleProps}
                      className="text-muted-foreground/30 hover:text-foreground cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                  )}
                  {renderFieldRow(field)}
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <div className="relative group mt-3">
      <div className="border border-border rounded-lg bg-card shadow-sm px-6 py-5">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-x-12">
            {renderDroppable("left", leftFields)}
            {renderDroppable("right", rightFields)}
          </div>
        </DragDropContext>
      </div>

      {isTemplateMode && onAdd && (
        <button
          onClick={onAdd}
          className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border shadow-sm rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Add a field to template description"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Inner workspace (inside BuilderProvider) ─────────────────────────────────

function WorkspaceInner({
  templateId,
  draftId,
  zoomLevel = 0,
  onZoomChange,
  project,
}: {
  templateId?: string;
  draftId?: string;
  zoomLevel?: number;
  onZoomChange?: React.Dispatch<React.SetStateAction<number>>;
  project?: any;
}) {
  const {
    setTokenMap,
    tokenPoolOpen,
    apiBasePath,
    invalidateKey,
    mode,
    setExternalTokens,
    setSections,
  } = useBuilderContext();
  const queryClient = useQueryClient();
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [isAddHeaderModalOpen, setIsAddHeaderModalOpen] = useState(false);
  const [editingHeaderField, setEditingHeaderField] = useState<any>(null);
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOpenModal = () => {
      setEditingHeaderField(null);
      setIsAddHeaderModalOpen(true);
    };
    window.addEventListener("open-add-header-field-modal", handleOpenModal);
    return () => window.removeEventListener("open-add-header-field-modal", handleOpenModal);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onZoomChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) onZoomChange((z) => Math.min(z + 1, 8));
        else if (e.deltaY > 0) onZoomChange((z) => Math.max(z - 1, -4));
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onZoomChange]);

  useEffect(() => {
    if (!onZoomChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          onZoomChange((z) => Math.min(z + 1, 8));
        } else if (e.key === "-") {
          e.preventDefault();
          onZoomChange((z) => Math.max(z - 1, -4));
        } else if (e.key === "0") {
          e.preventDefault();
          onZoomChange(0);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onZoomChange]);

  const { data: sections, isLoading } = useQuery({
    queryKey: invalidateKey,
    queryFn: async () => {
      const res = await fetch(`${apiBasePath}/sections`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sections");
      return res.json();
    },
  });

  const { data: templateHeaderFields, refetch: refetchHeaderFields } = useQuery({
    queryKey: ["template-header-fields", templateId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!templateId,
  });

  const { data: projectCustomFields } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Fetch constants (template constants for template mode, draft constants key fed through same endpoint for draft mode) ──
  const constantsQueryKey = draftId
    ? ["draft-constants", draftId]
    : ["template-constants", templateId];
  const constantsUrl = draftId
    ? `${apiUrl}/api/invoices/drafts/${draftId}/constants`
    : `${apiUrl}/api/invoice-templates/${templateId}/constants`;
  const { data: constantsData } = useQuery({
    queryKey: constantsQueryKey,
    queryFn: async () => {
      const res = await fetch(constantsUrl, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(draftId || templateId),
  });

  // ── Fetch org configs for global constants ──
  const { data: orgConfigs } = useQuery({
    queryKey: ["org-configs"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/org-configs`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Fetch expense categories ──
  const { data: expenseCategoriesData } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expense-categories`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sortedSections = useMemo(() => {
    if (!sections) return [];
    return [...sections].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [sections]);

  // ── Compute token map and push it to context ──────────────────────────────
  // Pass constants, file fields, and expense categories so formula rows that reference them resolve correctly
  const tokenMap = useMemo(() => {
    return buildTokenMap(
      sortedSections,
      orgConfigs ?? [],
      constantsData ?? [],
      templateHeaderFields ?? [],
      expenseCategoriesData ?? [],
    );
  }, [sortedSections, orgConfigs, constantsData, templateHeaderFields, expenseCategoriesData]);

  useEffect(() => {
    setTokenMap(tokenMap);
  }, [tokenMap, setTokenMap]);

  useEffect(() => {
    if (setSections) setSections(sortedSections);
  }, [sortedSections, setSections]);

  useEffect(() => {
    if (!setExternalTokens) return;
    const globalSet = new Set<string>();
    const templateSet = new Set<string>();
    const fileSet = new Set<string>();
    const categorySet = new Set<string>();

    categorySet.add("EXP_TOTAL");
    if (expenseCategoriesData) {
      for (const cat of expenseCategoriesData) {
        const key = cat.tokenKey;
        if (key && key !== "EXP_TOTAL") {
          const bare = key.replace(/^EXP_/, "");
          categorySet.add(bare);
        }
      }
    }

    if (orgConfigs) {
      for (const config of orgConfigs) {
        if (config.configKey) {
          const bare = config.configKey.replace(/^(ORG_|GBL_)/, "");
          globalSet.add(bare);
        }
      }
    }

    if (constantsData) {
      const constantsArray = Array.isArray(constantsData)
        ? constantsData
        : Object.values(constantsData);
      for (const constant of constantsArray) {
        const key = constant.key ?? constant.token;
        if (key) {
          const bare = key.replace(/^TPL_/, "");
          templateSet.add(bare);
        }
      }
    }

    if (templateHeaderFields) {
      for (const field of templateHeaderFields) {
        let bareToken = (field.label || "")
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, "_")
          .replace(/^FILE_/, "");
        if (field.fieldType === "file_field" && field.fileFieldKey) {
          bareToken = field.fileFieldKey.toUpperCase().replace(/^FILE_/, "");
        } else if (field.fieldType === "org_config" && field.orgConfigKey) {
          bareToken = field.orgConfigKey.toUpperCase().replace(/^(GBL_|ORG_)/, "");
        }
        if (bareToken) {
          fileSet.add(bareToken);
        }
      }
    }

    setExternalTokens({
      global: globalSet,
      template: templateSet,
      file: fileSet,
      category: categorySet,
    });
  }, [orgConfigs, constantsData, templateHeaderFields, expenseCategoriesData, setExternalTokens]);

  // ── Global SL offsets ─────────────────────────────────────────────────────
  const sectionSlOffsets = useMemo(() => {
    const offsets: number[] = [];
    let globalCounter = 0;
    for (const sec of sortedSections) {
      offsets.push(globalCounter);
      globalCounter += (sec.rows ?? []).length;
    }
    return offsets;
  }, [sortedSections]);

  // ── Grand total ───────────────────────────────────────────────────────────
  const grandTotal = useMemo(() => {
    if (sortedSections.length === 0) return null;
    return sortedSections.reduce((sum: number, sec: any) => {
      const v = tokenMap[`SEC_${sec.sectionToken}`] ?? tokenMap[`SEC_${sec.sectionToken}_TOTAL`];
      return sum + (v ?? 0);
    }, 0);
  }, [sortedSections, tokenMap]);

  const handleConfirmDeleteField = async () => {
    if (!fieldToDelete) return;
    try {
      await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields/${fieldToDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      refetchHeaderFields();
    } catch (error) {
      console.error("Failed to delete header field", error);
    } finally {
      setFieldToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto w-full space-y-1">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    );
  }

  return (
    // Extra left padding to give the outside-border token (w-28 = 112px) space to render.
    // overflow-visible is required so absolute-positioned tokens escape the container border.
    <div
      ref={containerRef}
      className={cn(
        "px-2 sm:px-4 max-w-5xl mx-auto w-full pb-6 overflow-visible transition-all duration-200 outline-none",
        tokenPoolOpen
          ? "xl:pl-36 xl:pr-32 2xl:pl-40 2xl:pr-52"
          : "md:pl-36 md:pr-32 lg:pl-40 lg:pr-52",
      )}
      tabIndex={0}
    >
      {/* ── File Details Header Box ── */}
      <FileDetailsHeaderBox
        templateHeaderFields={templateHeaderFields || []}
        project={project}
        zoomLevel={zoomLevel}
        isTemplateMode={!draftId}
        onDelete={(fieldId) => setFieldToDelete(fieldId)}
        onReorder={async (updates, optimisticState) => {
          if (draftId) return;
          queryClient.setQueryData(["template-header-fields", templateId], optimisticState);
          try {
            await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields/reorder`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ updates }),
            });
            refetchHeaderFields();
          } catch (e) {
            console.error(e);
            refetchHeaderFields();
          }
        }}
        onEdit={(field) => {
          setEditingHeaderField(field);
          setIsAddHeaderModalOpen(true);
        }}
        onAdd={() => {
          setEditingHeaderField(null);
          setIsAddHeaderModalOpen(true);
        }}
      />

      {/* ── Sticky formula bar ── */}
      <div className="sticky top-0 z-30 pt-6 pb-4">
        <TemplateFormulaBar />
      </div>

      {/* ── Table header ── */}
      <TableHeaderRow />

      {/* ── Sections ── */}
      {/* overflow-visible is REQUIRED so row tokens (position:absolute right:100%) escape the border */}
      <div className="border-x border-border bg-background overflow-visible">
        {mode !== "fill" && <AddSectionDivider onClick={() => setInsertAtIndex(0)} />}

        {sortedSections.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground/50">
            No sections yet — add one above.
          </div>
        ) : (
          sortedSections.map((section: any, idx: number) => {
            const sectionColor = SECTION_PALETTE[idx % SECTION_PALETTE.length];
            return (
              <div key={section.id}>
                <TemplateSectionCard
                  templateId={templateId || ""}
                  draftId={draftId}
                  section={section}
                  allSections={sortedSections}
                  isFirst={idx === 0}
                  isLast={idx === sortedSections.length - 1}
                  slOffset={sectionSlOffsets[idx]}
                  sectionColor={sectionColor}
                  tokenMap={tokenMap}
                />
                {mode !== "fill" && (
                  <AddSectionDivider onClick={() => setInsertAtIndex(section.sortOrder + 1)} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Grand total ── */}
      <GrandTotalRow total={grandTotal} />

      {insertAtIndex !== null && (
        <AddSectionModal
          isOpen={true}
          onClose={() => setInsertAtIndex(null)}
          templateId={templateId || ""}
          draftId={draftId}
          insertAtIndex={insertAtIndex}
          existingSections={sortedSections}
        />
      )}

      {templateId && (
        <AddHeaderFieldModal
          isOpen={isAddHeaderModalOpen}
          onClose={() => {
            setIsAddHeaderModalOpen(false);
            setEditingHeaderField(null);
          }}
          templateId={templateId}
          editField={editingHeaderField}
          onSuccess={() => refetchHeaderFields()}
        />
      )}

      {/* ── Delete Field Alert Dialog ── */}
      <AlertDialog open={!!fieldToDelete} onOpenChange={(open) => !open && setFieldToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will remove the field from the template. It will not delete the custom
              field from the global schema, but any formulas relying on this token will become
              invalid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Exported workspace ────────────────────────────
export function TemplateBuilderWorkspace({
  templateId,
  draftId,
  zoomLevel = 0,
  onZoomChange,
  project,
}: {
  templateId?: string;
  draftId?: string;
  zoomLevel?: number;
  onZoomChange?: React.Dispatch<React.SetStateAction<number>>;
  project?: any;
}) {
  return (
    <WorkspaceInner
      templateId={templateId}
      draftId={draftId}
      zoomLevel={zoomLevel}
      onZoomChange={onZoomChange}
      project={project}
    />
  );
}
