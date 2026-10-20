"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
  const { mode } = useBuilderContext();
  const isPdfMode = mode === "preview";

  return (
    <div className="flex items-stretch border border-b-0 border-border bg-muted/40 h-10">
      {/* SL */}
      <div className="w-10 shrink-0 flex items-center justify-center border-r border-border text-sm font-extrabold text-foreground/60">
        SL
      </div>
      {/* Label */}
      <div className="flex-1 px-3 flex items-center gap-2 border-r border-border min-w-0">
        <span className="text-sm font-extrabold text-foreground/60">
          {isPdfMode ? "Description" : "Row Label"}
        </span>
        {!isPdfMode && (
          <span className="text-sm text-foreground/40">(text displayed in PDF)</span>
        )}
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
    tokenKey?: string;
    fileFieldKey?: string;
    fieldType: string;
    columnPosition: "left" | "right";
    sortOrder: number;
    isFormulaInjectable?: boolean;
    defaultManualValue?: string;
  }>;
  project?: any; // The actual project data to populate values
  draftHeaderValues?: Record<string, any>;
  onDelete?: (id: string) => void;
  onEdit?: (field: any) => void;
  onAdd?: () => void;
  onReorder?: (updates: any[], optimisticState: any[]) => void;
  isTemplateMode?: boolean;
  isSharedDnd?: boolean;
}

export function FileDetailsHeaderBox({
  templateHeaderFields = [],
  project,
  draftHeaderValues,
  onDelete,
  onEdit,
  onAdd,
  onReorder,
  isTemplateMode = false,
  isSharedDnd = false,
  zoomLevel = 0,
}: FileDetailsHeaderBoxProps & { zoomLevel?: number }) {
  const { selectedCell, mode } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const isFillMode = mode === "fill";
  const isEditable = isTemplateMode || mode === "draft";

  const handleTokenClick = (e: React.MouseEvent, clickedToken: string) => {
    e.stopPropagation();
    if (isFillMode) return;
    if (isFormulaMode) {
      window.dispatchEvent(new CustomEvent("insert-token", { detail: clickedToken }));
    } else {
      navigator.clipboard.writeText(clickedToken);
      toast.success("Token copied");
    }
  };

  const renderVal = (field: any) => {
    const key = field.fieldKey || field.systemFieldKey || field.fileFieldKey;
    const cleanToken = getCleanToken(field);
    const tokenKey = field.tokenKey;

    let val: any = null;

    // 1. Check draftHeaderValues first (draft mode)
    if (draftHeaderValues) {
      val =
        (tokenKey ? draftHeaderValues[tokenKey] : undefined) ??
        (cleanToken ? draftHeaderValues[cleanToken] : undefined) ??
        (key ? draftHeaderValues[key] : undefined) ??
        (cleanToken ? draftHeaderValues[`FILE_${cleanToken}`] : undefined);
    }

    // 2. Check project root & customFields if not resolved
    if ((val === null || val === undefined) && project) {
      if (key === "clientId" || key === "client") {
        val = project.client?.name || project.clientId;
      } else if (key === "name") {
        val = project.name;
      } else if (key === "status") {
        val = project.statusRelation?.name || project.status;
      } else if (key && project[key] !== undefined) {
        val = project[key];
      }

      // Try customFields lookup if not found in root project properties
      if ((val === null || val === undefined) && project.customFields) {
        const cf = project.customFields;
        // 1. Direct match on key, tokenKey, cleanToken, or label
        val =
          (key ? cf[key] : undefined) ??
          (field.tokenKey ? cf[field.tokenKey] : undefined) ??
          (cleanToken ? cf[cleanToken] : undefined) ??
          (field.label ? cf[field.label] : undefined);

        // 2. Case-insensitive / slug match over all customFields entries
        if (val === null || val === undefined) {
          const candidates = [key, field.tokenKey, cleanToken, field.label]
            .filter(Boolean)
            .map((k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, ""));

          for (const [cfKey, cfVal] of Object.entries(cf)) {
            const normalizedCfKey = cfKey.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (candidates.includes(normalizedCfKey)) {
              val = cfVal;
              break;
            }
          }
        }
      }
    }

    // 3. Fallback to defaultManualValue on the template field definition
    if ((val === null || val === undefined) && field.defaultManualValue) {
      val = field.defaultManualValue;
    }

    if (val === null || val === undefined || val === "" || val === "—") {
      return <span className="text-foreground/20 font-light">—</span>;
    }
    return String(val);
  };

  const getCleanToken = (field: any) => {
    if (field.tokenKey) {
      return field.tokenKey
        .toUpperCase()
        .replace(/^FILE_/, "")
        .replace(/^(GBL_|ORG_)/, "");
    }
    if (field.fileFieldKey) {
      return field.fileFieldKey.toUpperCase().replace(/^FILE_/, "");
    }
    if (field.orgConfigKey) {
      return field.orgConfigKey.toUpperCase().replace(/^(GBL_|ORG_)/, "");
    }
    return (field.label || "")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^FILE_/, "");
  };

  const renderFieldRow = (field: any) => {
    const isSelectable = field.isFormulaInjectable === true;
    const cleanToken = getCleanToken(field);

    return (
      <div className="flex justify-between items-center group relative h-6 w-full">
        <div
          className={cn(
            "flex gap-2 w-full items-center",
            isSelectable && "transition-colors select-none insertable-token",
            isSelectable &&
              isFillMode &&
              "cursor-default",
            isSelectable &&
              !isFillMode &&
              isFormulaMode &&
              "cursor-pointer text-primary hover:bg-primary/5 rounded-md -ml-1 pl-1",
            isSelectable &&
              !isFillMode &&
              !isFormulaMode &&
              "cursor-pointer hover:text-foreground hover:bg-muted/10 rounded-md -ml-1 pl-1",
          )}
          onMouseDown={(e) => {
            if (isFormulaMode && isSelectable) {
              e.preventDefault();
            }
          }}
          onClick={(e) => {
            if (isSelectable && cleanToken) {
              handleTokenClick(e, cleanToken);
            }
          }}
          title={
            isSelectable
              ? isFillMode
                ? undefined
                : isFormulaMode
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
        {isEditable && (
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
                title="Remove field"
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

    const sourceCol = result.source.droppableId.replace(/^header-/, "");
    const destCol = result.destination.droppableId.replace(/^header-/, "");

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

  const effectiveFields =
    templateHeaderFields && templateHeaderFields.length > 0
      ? templateHeaderFields
      : [
          {
            id: "default-name",
            label: "Name",
            fileFieldKey: "name",
            tokenKey: "NAME",
            columnPosition: "left",
            sortOrder: 0,
            fieldType: "file_field",
          },
          {
            id: "default-client",
            label: "Client",
            fileFieldKey: "clientId",
            tokenKey: "CLIENT",
            columnPosition: "left",
            sortOrder: 1,
            fieldType: "file_field",
          },
          {
            id: "default-status",
            label: "Status",
            fileFieldKey: "status",
            tokenKey: "STATUS",
            columnPosition: "right",
            sortOrder: 0,
            fieldType: "file_field",
          },
        ];

  const leftFields = effectiveFields
    .filter((f) => f.columnPosition === "left")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const rightFields = effectiveFields
    .filter((f) => f.columnPosition === "right")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

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
              isDragDisabled={!isEditable || !onReorder}
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
                  {isEditable && onReorder && (
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

  const leftDroppableId = isSharedDnd ? "header-left" : "left";
  const rightDroppableId = isSharedDnd ? "header-right" : "right";

  const dndContent = (
    <div className="grid grid-cols-2 gap-x-12">
      {renderDroppable(leftDroppableId, leftFields)}
      {renderDroppable(rightDroppableId, rightFields)}
    </div>
  );

  return (
    <div className="relative group mt-3 file-details-header-box">
      <div className="border border-border rounded-lg bg-card shadow-sm px-6 py-5">
        {isSharedDnd ? (
          dndContent
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>{dndContent}</DragDropContext>
        )}
      </div>

      {isEditable && onAdd && (
        <button
          onClick={onAdd}
          className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-background border border-border shadow-sm rounded-md p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Add a field to file description"
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
  draftHeaderValues,
  isSharedDnd = false,
  resolvedTokens,
  projectedDocumentNumber,
}: {
  templateId?: string;
  draftId?: string;
  zoomLevel?: number;
  onZoomChange?: React.Dispatch<React.SetStateAction<number>>;
  project?: any;
  draftHeaderValues?: Record<string, any>;
  isSharedDnd?: boolean;
  resolvedTokens?: Record<string, any>;
  projectedDocumentNumber?: string | null;
}) {
  const {
    setTokenMap,
    tokenPoolOpen,
    apiBasePath,
    invalidateKey,
    mode,
    setExternalTokens,
    setSections,
    setHeaderFields,
    setTemplateConstants,
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

  const headerFieldsQueryKey = draftId
    ? ["draft-header-fields", draftId]
    : ["template-header-fields", templateId];
  const headerFieldsUrl = draftId
    ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields`
    : `${apiUrl}/api/invoice-templates/${templateId}/header-fields`;

  const { data: templateHeaderFields, refetch: refetchHeaderFields } = useQuery({
    queryKey: headerFieldsQueryKey,
    queryFn: async () => {
      const res = await fetch(headerFieldsUrl, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(draftId || templateId),
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

  // Merge resolvedTokens from engine preview with project.customFields
  const externalTokenValues = useMemo(() => {
    const map: Record<string, any> = {};
    if (project?.customFields) {
      for (const [k, v] of Object.entries(project.customFields)) {
        if (v !== undefined && v !== null) {
          map[k] = v;
          map[k.toUpperCase()] = v;
          map[`FILE_${k.toUpperCase()}`] = v;
        }
      }
    }
    if (resolvedTokens) {
      for (const [k, v] of Object.entries(resolvedTokens)) {
        map[k] = v;
      }
    }
    return map;
  }, [project?.customFields, resolvedTokens]);

  // ── Compute token map and push it to context ──────────────────────────────
  // Pass constants, file fields, and expense categories so formula rows that reference them resolve correctly
  const tokenMap = useMemo(() => {
    return buildTokenMap(
      sortedSections,
      orgConfigs ?? [],
      constantsData ?? [],
      templateHeaderFields ?? [],
      expenseCategoriesData ?? [],
      externalTokenValues,
    );
  }, [
    sortedSections,
    orgConfigs,
    constantsData,
    templateHeaderFields,
    expenseCategoriesData,
    externalTokenValues,
  ]);

  useEffect(() => {
    setTokenMap(tokenMap);
  }, [tokenMap, setTokenMap]);

  useEffect(() => {
    if (setSections) setSections(sortedSections);
  }, [sortedSections, setSections]);

  useEffect(() => {
    if (setHeaderFields && templateHeaderFields) {
      setHeaderFields(templateHeaderFields);
    }
  }, [templateHeaderFields, setHeaderFields]);

  useEffect(() => {
    if (setTemplateConstants && constantsData) {
      setTemplateConstants(constantsData);
    }
  }, [constantsData, setTemplateConstants]);

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
      const deleteUrl = draftId
        ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields/${fieldToDelete}`
        : `${apiUrl}/api/invoice-templates/${templateId}/header-fields/${fieldToDelete}`;
      await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Header field removed");
      refetchHeaderFields();
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    } catch (error) {
      console.error("Failed to delete header field", error);
      toast.error("Failed to delete header field");
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
        "px-4 sm:px-6 md:px-12 lg:px-44 xl:px-48 pb-8 overflow-visible transition-all duration-200 outline-none w-full",
      )}
      tabIndex={0}
    >
      <div className="w-full max-w-4xl mx-auto relative overflow-visible">
        {/* ── Document Reference Banner (Invoice Number above File Details) ── */}
        {projectedDocumentNumber && (
          <div className="flex items-center justify-between pb-2.5 pt-1 px-1 select-none">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                Invoice Document No:
              </span>
              <Badge
                variant="outline"
                className="text-xs font-mono font-bold px-2 py-0.5 border-primary/30 text-primary bg-primary/5"
                title="Projected invoice document number upon finalization"
              >
                {projectedDocumentNumber}
              </Badge>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground/70">
              (Projected on finalize)
            </span>
          </div>
        )}

        {/* ── File Details Header Box ── */}
        <FileDetailsHeaderBox
          templateHeaderFields={templateHeaderFields || []}
          project={project}
          draftHeaderValues={draftHeaderValues}
          zoomLevel={zoomLevel}
          isTemplateMode={!draftId}
          isSharedDnd={isSharedDnd}
          onDelete={(fieldId) => setFieldToDelete(fieldId)}
          onReorder={async (updates, optimisticState) => {
            queryClient.setQueryData(headerFieldsQueryKey, optimisticState);
            try {
              const reorderUrl = draftId
                ? `${apiUrl}/api/invoices/drafts/${draftId}/header-fields/reorder`
                : `${apiUrl}/api/invoice-templates/${templateId}/header-fields/reorder`;
              await fetch(reorderUrl, {
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
        {mode !== "preview" && (
          <div className="sticky top-0 z-30 pt-6 pb-4">
            <TemplateFormulaBar />
          </div>
        )}

        {/* ── Table header ── */}
        <TableHeaderRow />

        {/* ── Sections ── */}
        {/* overflow-visible is REQUIRED so row tokens (position:absolute right:100%) escape the border */}
        <div className="border-x border-border bg-background overflow-visible">
          {mode !== "fill" && mode !== "preview" && <AddSectionDivider onClick={() => setInsertAtIndex(0)} />}

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
                    isSharedDnd={isSharedDnd}
                  />
                  {mode !== "fill" && mode !== "preview" && (
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

        {(templateId || draftId) && (
          <AddHeaderFieldModal
            isOpen={isAddHeaderModalOpen}
            onClose={() => {
              setIsAddHeaderModalOpen(false);
              setEditingHeaderField(null);
            }}
            templateId={templateId}
            draftId={draftId}
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
                This action will remove the field from this {draftId ? "draft" : "template"}. It will not delete the custom
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
  draftHeaderValues,
  isSharedDnd = false,
  resolvedTokens,
  projectedDocumentNumber,
}: {
  templateId?: string;
  draftId?: string;
  zoomLevel?: number;
  onZoomChange?: React.Dispatch<React.SetStateAction<number>>;
  project?: any;
  draftHeaderValues?: Record<string, any>;
  isSharedDnd?: boolean;
  resolvedTokens?: Record<string, any>;
  projectedDocumentNumber?: string | null;
}) {
  return (
    <WorkspaceInner
      templateId={templateId}
      draftId={draftId}
      zoomLevel={zoomLevel}
      onZoomChange={onZoomChange}
      project={project}
      draftHeaderValues={draftHeaderValues}
      isSharedDnd={isSharedDnd}
      resolvedTokens={resolvedTokens}
      projectedDocumentNumber={projectedDocumentNumber}
    />
  );
}
