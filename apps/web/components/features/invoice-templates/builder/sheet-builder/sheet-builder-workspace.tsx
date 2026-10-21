"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { buildTokenMap } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddHeaderFieldModal } from "../add-header-field-modal";
import { AddSectionModal } from "../add-section-modal";
import { useBuilderContext } from "../builder-context";
import { TemplateFormulaBar } from "../formula-bar";
import { FileDetailsHeaderBox, SECTION_PALETTE } from "../template-builder-workspace";
import { SheetGrandTotal } from "./sheet-grand-total";
import { SheetSectionCard } from "./sheet-section-card";
import { SheetTableHeader } from "./sheet-table-header";
import { TemplateColumnDefinition } from "./types";

interface SheetBuilderWorkspaceProps {
  templateId: string;
  zoomLevel?: number;
  columns: TemplateColumnDefinition[];
  onConfigureColumns?: () => void;
  isSharedDnd?: boolean;
}

function AddSectionDivider({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex items-center justify-center h-7 group select-none">
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

export function SheetBuilderWorkspace({
  templateId,
  zoomLevel = 0,
  columns,
  onConfigureColumns,
  isSharedDnd = false,
}: SheetBuilderWorkspaceProps) {
  const queryClient = useQueryClient();
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [isAddHeaderModalOpen, setIsAddHeaderModalOpen] = useState(false);
  const [editingHeaderField, setEditingHeaderField] = useState<any>(null);
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);

  const { setTokenMap, setSections, setHeaderFields, mode } = useBuilderContext();

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["template-sections", templateId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/sections`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch sections");
      return res.json();
    },
    enabled: Boolean(templateId),
  });

  const headerFieldsQueryKey = ["template-header-fields", templateId];
  const { data: templateHeaderFields = [], refetch: refetchHeaderFields } = useQuery({
    queryKey: headerFieldsQueryKey,
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(templateId),
  });

  const sortedSections = useMemo(() => {
    return [...(sections || [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }, [sections]);

  const sectionSlOffsets = useMemo(() => {
    const offsets: number[] = [];
    let globalCounter = 0;
    for (const sec of sortedSections) {
      offsets.push(globalCounter);
      globalCounter += (sec.rows || []).length;
    }
    return offsets;
  }, [sortedSections]);

  // Synchronize token map and context
  const tokenMap = useMemo(() => {
    return buildTokenMap(sortedSections, undefined, undefined, templateHeaderFields);
  }, [sortedSections, templateHeaderFields]);

  useEffect(() => {
    if (setTokenMap) setTokenMap(tokenMap);
  }, [tokenMap, setTokenMap]);

  useEffect(() => {
    if (setSections) setSections(sortedSections);
  }, [sortedSections, setSections]);

  useEffect(() => {
    if (setHeaderFields && templateHeaderFields) {
      setHeaderFields(templateHeaderFields);
    }
  }, [templateHeaderFields, setHeaderFields]);

  const handleConfirmDeleteField = async () => {
    if (!fieldToDelete) return;
    try {
      const res = await fetch(
        `${apiUrl}/api/invoice-templates/${templateId}/header-fields/${fieldToDelete}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to delete field");
      toast.success("Sheet details field removed");
      refetchHeaderFields();
      queryClient.invalidateQueries({ queryKey: ["template-sections", templateId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete field");
    } finally {
      setFieldToDelete(null);
    }
  };

  const handleReorderHeaderFields = async (updates: any[], optimisticState: any[]) => {
    queryClient.setQueryData(headerFieldsQueryKey, optimisticState);
    try {
      await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates }),
      });
      refetchHeaderFields();
    } catch {
      refetchHeaderFields();
    }
  };

  const handleColumnsChange = async (newColumns: TemplateColumnDefinition[]) => {
    queryClient.setQueryData(["invoice-template", templateId], (old: any) => {
      if (!old) return old;
      return { ...old, columnDefinitions: newColumns };
    });
    try {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ columnDefinitions: newColumns }),
      });
      if (!res.ok) throw new Error("Failed to save column configuration");
      queryClient.invalidateQueries({ queryKey: ["invoice-template", templateId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update columns");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto w-full space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-12 lg:px-44 xl:px-48 pb-12 overflow-visible transition-all duration-200 outline-none w-full">
      <div className="w-full max-w-5xl mx-auto relative overflow-visible">
        {/* ── Sheet Details Header Box ── */}
        <FileDetailsHeaderBox
          title="Sheet Details"
          isSheetMode={true}
          templateHeaderFields={templateHeaderFields}
          isTemplateMode={true}
          isSharedDnd={isSharedDnd}
          zoomLevel={zoomLevel}
          templateId={templateId}
          refetchHeaderFields={refetchHeaderFields}
          onDelete={(fieldId) => setFieldToDelete(fieldId)}
          onEdit={(field) => {
            setEditingHeaderField(field);
            setIsAddHeaderModalOpen(true);
          }}
          onAdd={() => {
            setEditingHeaderField(null);
            setIsAddHeaderModalOpen(true);
          }}
          onReorder={handleReorderHeaderFields}
        />

        {/* ── Sticky Formula Bar ── */}
        {mode !== "preview" && (
          <div className="sticky top-0 z-30 py-2">
            <TemplateFormulaBar />
          </div>
        )}

        {/* ── Dynamic Table Header ── */}
        <SheetTableHeader
          columns={columns}
          onColumnsChange={handleColumnsChange}
          onConfigureColumns={onConfigureColumns}
        />

        {/* ── Table Body Sections ── */}
        <div className="border-x border-border bg-background overflow-visible">
          <AddSectionDivider onClick={() => setInsertAtIndex(0)} />

          {sortedSections.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground/50 select-none">
              No sections yet — click &ldquo;Add section here&rdquo; above to begin.
            </div>
          ) : (
            sortedSections.map((section: any, idx: number) => {
              const sectionColor = SECTION_PALETTE[idx % SECTION_PALETTE.length];
              return (
                <div key={section.id} className="overflow-visible">
                  <SheetSectionCard
                    templateId={templateId}
                    section={section}
                    allSections={sortedSections}
                    columns={columns}
                    isFirst={idx === 0}
                    isLast={idx === sortedSections.length - 1}
                    slOffset={sectionSlOffsets[idx]}
                    sectionColor={sectionColor}
                    zoomLevel={zoomLevel}
                  />
                  <AddSectionDivider onClick={() => setInsertAtIndex(section.sortOrder + 1)} />
                </div>
              );
            })
          )}
        </div>

        {/* ── Automatic Grand Total ── */}
        <SheetGrandTotal sections={sortedSections} columns={columns} zoomLevel={zoomLevel} />
      </div>

      {/* ── Add / Edit Header Field Modal ── */}
      {isAddHeaderModalOpen && (
        <AddHeaderFieldModal
          isOpen={isAddHeaderModalOpen}
          onClose={() => {
            setIsAddHeaderModalOpen(false);
            setEditingHeaderField(null);
          }}
          templateId={templateId}
          editField={editingHeaderField}
          isSheetMode={true}
          onSuccess={() => refetchHeaderFields()}
        />
      )}

      {/* ── Delete Header Field Alert Dialog ── */}
      <AlertDialog open={!!fieldToDelete} onOpenChange={(open) => !open && setFieldToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Sheet Details Field?</AlertDialogTitle>
            <AlertDialogDescription>
              This field will be deleted from the sheet details metadata. Any formulas referencing this token will no longer resolve it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteField}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remove Field
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Section Modal ── */}
      {insertAtIndex !== null && (
        <AddSectionModal
          isOpen={insertAtIndex !== null}
          onClose={() => setInsertAtIndex(null)}
          templateId={templateId}
          insertAtIndex={insertAtIndex}
        />
      )}
    </div>
  );
}
