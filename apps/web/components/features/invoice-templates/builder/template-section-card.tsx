"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Edit2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteModal } from "@/components/shared/confirm-delete-modal";
import { Button } from "@/components/ui/button";
import { evaluateFormula, fmt, TokenMap } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddEditRowModal } from "./add-edit-row-modal";
import { AddEditSectionChargeModal } from "./add-edit-section-charge-modal";
import { AddSectionModal } from "./add-section-modal";
import { cellFromSectionCharge, useBuilderContext } from "./builder-context";
import { MobileRowActions, SectionColor, TableRow, TemplateRowList } from "./row-list";

// ─── Inline section charge label cell ──────────────────────────────────────────
function SectionChargeLabelCell({
  charge,
  sectionId,
  zoomLevel = 0,
}: {
  charge: any;
  sectionId: string;
  zoomLevel?: number;
}) {
  const { apiBasePath, invalidateKey } = useBuilderContext();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(charge.label || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      setDraft(charge.label || "");
    }
  }, [editing, charge.label]);

  const save = useCallback(async () => {
    setEditing(false);
    const value = draft.trim();
    if (!value || value === charge.label) {
      setDraft(charge.label || "");
      return;
    }

    const payload = { label: value };

    try {
      const res = await fetch(`${apiBasePath}/sections/${sectionId}/section-charges/${charge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
      toast.success("Section charge label updated");
    } catch {
      toast.error("Failed to save section charge label");
    }
  }, [draft, charge.label, charge.id, sectionId, apiBasePath, queryClient, invalidateKey]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            setDraft(charge.label);
            setEditing(false);
          }
        }}
        className={cn(
          "w-full bg-transparent border-none outline-none focus:outline-none text-right",
          "font-medium text-foreground/80 leading-snug caret-primary",
        )}
        style={{ fontSize: 14 + zoomLevel }}
        placeholder="Enter label…"
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      className="font-medium text-foreground/80 leading-snug hover:text-foreground cursor-text"
      style={{ fontSize: 14 + zoomLevel }}
    >
      {draft || "Click to label…"}
    </span>
  );
}

// ─── Section charge line ──────────────────────────────────────────────────────
// Visually distinct from RowChargeLine:
//   • Uses the section color for left border + background tint
//   • Non-italic, slightly bolder label (vs italic for row charges)
//   • Edit/delete actions wired to dedicated section-charge endpoints
function SectionChargeLine({
  charge,
  sectionToken,
  sectionColor,
  tokenMap,
  onEdit,
  onDelete,
  mode,
  templateId,
  sectionId,
  zoomLevel = 0,
}: {
  charge: any;
  sectionToken: string;
  sectionColor: SectionColor;
  tokenMap: TokenMap;
  onEdit: () => void;
  onDelete: () => void;
  mode: string;
  templateId: string;
  sectionId: string;
  zoomLevel?: number;
}) {
  const { selectedCell, setSelectedCell } = useBuilderContext();

  const fullFormula = (charge.formula ?? "").trim();
  const computedVal = evaluateFormula(fullFormula, tokenMap);
  const isSelected = selectedCell?.chargeId === charge.id;

  return (
    <TableRow
      token={charge.chargeToken}
      onEditToken={mode !== "fill" ? onEdit : undefined}
      formula={fullFormula}
      zoomLevel={zoomLevel}
      onClickUsd1={() => {
        if (mode !== "fill") {
          setSelectedCell(cellFromSectionCharge({ templateId, sectionId, charge, sectionToken }));
        }
      }}
      onClickFormula={() => {
        if (mode !== "fill") {
          setSelectedCell(cellFromSectionCharge({ templateId, sectionId, charge, sectionToken }));
        }
      }}
      isUsd1Selected={isSelected}
      style={{
        backgroundColor: sectionColor.bg,
        borderLeftColor: sectionColor.border,
        borderLeftWidth: 3,
      }}
      actions={
        mode !== "fill" ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onEdit}
              title="Edit section charge"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              title="Delete section charge"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        ) : undefined
      }
      mobileActions={
        mode !== "fill" ? (
          <MobileRowActions onEdit={onEdit} onDelete={onDelete} isCharge />
        ) : undefined
      }
      labelContent={
        <div className="flex items-center justify-end gap-2 w-full pr-1">
          <SectionChargeLabelCell charge={charge} sectionId={sectionId} zoomLevel={zoomLevel} />
        </div>
      }
      usd1={
        computedVal != null ? (
          <span style={{ fontSize: 16 + zoomLevel }}>{fmt(computedVal)}</span>
        ) : undefined
      }
    />
  );
}

// ─── Main section card ────────────────────────────────────────────────────────
export function TemplateSectionCard({
  templateId,
  draftId,
  section,
  allSections,
  isFirst,
  isLast,
  slOffset = 0,
  sectionColor,
  tokenMap,
  zoomLevel = 0,
}: {
  templateId: string;
  draftId?: string;
  section: any;
  allSections: any[];
  isFirst: boolean;
  isLast: boolean;
  slOffset?: number;
  sectionColor: SectionColor;
  tokenMap: TokenMap;
  zoomLevel?: number;
}) {
  const queryClient = useQueryClient();
  const { apiBasePath, invalidateKey, mode, selectedCell } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const _isDraftMode = mode === "draft";
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddRowModalOpen, setIsAddRowModalOpen] = useState(false);
  const [isAddSectionChargeModalOpen, setIsAddSectionChargeModalOpen] = useState(false);
  const [editingSectionCharge, setEditingSectionCharge] = useState<any>(null);
  const [isSectionDeleteModalOpen, setIsSectionDeleteModalOpen] = useState(false);
  const [chargeToDelete, setChargeToDelete] = useState<string | null>(null);

  const label = section.label ?? null;
  const sectionToken = section.sectionToken;
  const headerName = label || sectionToken;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: invalidateKey });
  };

  const reorderMutation = useMutation({
    mutationFn: async (direction: "up" | "down") => {
      const sorted = [...allSections].sort((a, b) => a.sortOrder - b.sortOrder);
      const myIdx = sorted.findIndex((s) => s.id === section.id);
      const neighborIdx = direction === "up" ? myIdx - 1 : myIdx + 1;
      if (neighborIdx < 0 || neighborIdx >= sorted.length) return;
      const neighbor = sorted[neighborIdx];
      await Promise.all([
        fetch(`${apiBasePath}/sections/${section.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderIndex: neighbor.sortOrder }),
        }),
        fetch(`${apiBasePath}/sections/${neighbor.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderIndex: section.sortOrder }),
        }),
      ]);
    },
    onSuccess: invalidate,
    onError: () => toast.error("Failed to reorder section"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBasePath}/sections/${section.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete section");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Section deleted");
      invalidate();
      setIsSectionDeleteModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteSectionChargeMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      const res = await fetch(`${apiBasePath}/sections/${section.id}/section-charges/${chargeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete section charge");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Section charge deleted");
      invalidate();
      setChargeToDelete(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rows: any[] = section.rows ?? [];
  const sectionCharges: any[] = section.sectionCharges ?? [];

  return (
    // overflow-visible is required so the absolute-positioned row tokens (right:100%) can escape the card border
    <div className="flex flex-col group/section overflow-visible">
      {/* ── Section header — thin, muted, full-width, with section color left border */}
      <div className="flex items-stretch border-b border-border bg-muted/20 group/sec">
        <div
          className="flex-1 px-3 py-0.5 flex items-center justify-between min-w-0"
          style={{ borderLeft: `4px solid ${sectionColor.border}` }}
        >
          <div className="flex items-center gap-2">
            {/* Section reorder arrows */}
            {mode !== "fill" && (
              <div className="flex flex-col shrink-0 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                <button
                  disabled={isFirst || reorderMutation.isPending}
                  onClick={() => reorderMutation.mutate("up")}
                  className="hover:text-primary disabled:opacity-30 disabled:cursor-default leading-none"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  disabled={isLast || reorderMutation.isPending}
                  onClick={() => reorderMutation.mutate("down")}
                  className="hover:text-primary disabled:opacity-30 disabled:cursor-default leading-none"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
            <h3
              className="font-semibold uppercase tracking-wider truncate"
              style={{ color: sectionColor.border, fontSize: 14 + zoomLevel }}
            >
              {label || `Section ${sectionToken.split("_").pop()}`}
            </h3>
            {/* Token badge — hover only */}
            <span
              className="font-mono text-muted-foreground/40 bg-muted/50 px-1.5 rounded opacity-0 group-hover/sec:opacity-100 transition-opacity select-all"
              style={{ fontSize: 10 + zoomLevel }}
            >
              {sectionToken}
            </span>
          </div>

          {/* Edit / Delete — hover only */}
          {mode !== "fill" && !isFormulaMode && (
            <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditModalOpen(true)}
                title="Edit section"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => setIsSectionDeleteModalOpen(true)}
                title="Delete section"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Rows ── */}
      <TemplateRowList
        templateId={templateId}
        sectionId={section.id}
        sectionToken={sectionToken}
        rows={rows}
        isLoading={false}
        slOffset={slOffset}
        sectionColor={sectionColor}
        tokenMap={tokenMap}
        allSections={allSections}
        zoomLevel={zoomLevel}
      />

      {/* ── Section charges — visually distinct (section color, bolder) ── */}
      {sectionCharges.length > 0 && (
        <div className="flex flex-col">
          {sectionCharges
            .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
            .map((charge: any) => (
              <SectionChargeLine
                key={charge.id}
                charge={charge}
                sectionToken={sectionToken}
                sectionColor={sectionColor}
                tokenMap={tokenMap}
                mode={mode}
                onEdit={() => setEditingSectionCharge(charge)}
                onDelete={() => setChargeToDelete(charge.id)}
                templateId={templateId}
                sectionId={section.id}
                zoomLevel={zoomLevel}
              />
            ))}
        </div>
      )}

      {/* ── Footer — Add row / Add section charge ── */}
      {mode !== "fill" && (
        <div className="flex items-stretch border-b border-border bg-muted/5 hover:bg-muted/10 transition-colors">
          {/* Add row button */}
          <div className="flex-1 border-r border-border p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20"
              onClick={() => setIsAddRowModalOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" /> Add row
            </Button>
          </div>
          {/* Add section charge button — spans both USD columns */}
          <div className="w-40 shrink-0 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20"
              onClick={() => setIsAddSectionChargeModalOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" /> Add section charge
            </Button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <AddSectionModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        templateId={templateId}
        editSection={section}
      />

      {isAddRowModalOpen && (
        <AddEditRowModal
          isOpen={isAddRowModalOpen}
          onClose={() => setIsAddRowModalOpen(false)}
          templateId={templateId}
          sectionId={section.id}
          sectionToken={sectionToken}
          onSuccess={invalidate}
        />
      )}

      {(isAddSectionChargeModalOpen || editingSectionCharge) && (
        <AddEditSectionChargeModal
          isOpen={isAddSectionChargeModalOpen || !!editingSectionCharge}
          onClose={() => {
            setIsAddSectionChargeModalOpen(false);
            setEditingSectionCharge(null);
          }}
          sectionId={section.id}
          sectionToken={sectionToken}
          editCharge={editingSectionCharge}
          onSuccess={invalidate}
        />
      )}

      {/* ── Confirm Delete Modals ── */}
      <ConfirmDeleteModal
        isOpen={isSectionDeleteModalOpen}
        onClose={() => setIsSectionDeleteModalOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        entityName={`Section: ${headerName}`}
        isDeleting={deleteMutation.isPending}
      />
      <ConfirmDeleteModal
        isOpen={!!chargeToDelete}
        onClose={() => setChargeToDelete(null)}
        onConfirm={() => chargeToDelete && deleteSectionChargeMutation.mutate(chargeToDelete)}
        entityName={`Section Charge`}
        isDeleting={deleteSectionChargeMutation.isPending}
      />
    </div>
  );
}
