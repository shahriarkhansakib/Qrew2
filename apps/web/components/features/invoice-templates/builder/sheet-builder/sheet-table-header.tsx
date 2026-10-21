"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Edit2,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AddColumnDialog } from "./add-column-dialog";
import { getColumnWidthStyle, TemplateColumnDefinition } from "./types";

interface SheetTableHeaderProps {
  columns: TemplateColumnDefinition[];
  onColumnsChange?: (newColumns: TemplateColumnDefinition[]) => void;
  onConfigureColumns?: () => void;
  onOpenSettings?: () => void;
}

export function SheetTableHeader({
  columns,
  onColumnsChange,
  onConfigureColumns,
  onOpenSettings,
}: SheetTableHeaderProps) {
  const [resizingColIndex, setResizingColIndex] = useState<number | null>(null);
  const [resizingWidth, setResizingWidth] = useState<number | null>(null);

  // Dialog state for adding/editing columns
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [targetInsertIndex, setTargetInsertIndex] = useState<number | undefined>(undefined);
  const [editingColumn, setEditingColumn] = useState<TemplateColumnDefinition | undefined>(
    undefined,
  );

  // ── Drag to Resize Handler ──────────────────────────────────────────────────
  const handleResizeStart = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const headerEl = (e.currentTarget as HTMLElement).closest(".column-header-cell") as HTMLElement;
    const startWidth = headerEl ? headerEl.offsetWidth : 144;

    setResizingColIndex(index);
    setResizingWidth(startWidth);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + delta);
      setResizingWidth(newWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const delta = upEvent.clientX - startX;
      const finalWidth = Math.max(60, startWidth + delta);

      const updated = columns.map((col, idx) => {
        if (idx === index) {
          return { ...col, width: `${finalWidth}px` };
        }
        return col;
      });

      setResizingColIndex(null);
      setResizingWidth(null);
      if (onColumnsChange) onColumnsChange(updated);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // ── Add / Edit Column Save ─────────────────────────────────────────────────
  const handleSaveColumn = (col: TemplateColumnDefinition, index?: number) => {
    if (editingColumn) {
      // Edit existing
      const updated = columns.map((c) => (c.id === col.id ? col : c));
      if (onColumnsChange) onColumnsChange(updated);
      toast.success(`Updated column "${col.label}"`);
    } else if (index !== undefined) {
      // Insert at specific index
      const updated = [...columns];
      updated.splice(index, 0, col);
      if (onColumnsChange) onColumnsChange(updated);
      toast.success(`Inserted column "${col.label}"`);
    } else {
      // Append to end
      if (onColumnsChange) onColumnsChange([...columns, col]);
      toast.success(`Added column "${col.label}"`);
    }
  };

  const handleDeleteColumn = (colId: string) => {
    if (columns.length <= 1) {
      toast.error("At least one column is required");
      return;
    }
    const target = columns.find((c) => c.id === colId);
    if (onColumnsChange) onColumnsChange(columns.filter((c) => c.id !== colId));
    toast.success(`Removed column "${target?.label || ""}"`);
  };

  return (
    <>
      <div className="flex items-stretch border border-b-0 border-border bg-muted/40 h-10 select-none relative">
        {/* Left Grip Handle Spacer */}
        <div className="w-8 shrink-0 border-r border-border flex items-center justify-center bg-muted/20 relative group/insert-0">
          {/* Hover + button before first column */}
          <div className="absolute right-0 top-0 bottom-0 w-4 -mr-2 z-30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => {
                setEditingColumn(undefined);
                setTargetInsertIndex(0);
                setIsAddDialogOpen(true);
              }}
              className="h-5 w-5 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-xs font-bold"
              title="Insert column here"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Dynamic Columns */}
        {columns.map((col, idx) => {
          const isResizing = resizingColIndex === idx;
          const style = getColumnWidthStyle(col);
          if (isResizing && resizingWidth !== null) {
            style.width = `${resizingWidth}px`;
            style.minWidth = `${resizingWidth}px`;
          }

          const alignClass =
            col.align === "right"
              ? "justify-end text-right"
              : col.align === "center"
                ? "justify-center text-center"
                : "justify-start text-left";

          return (
            <div
              key={col.id || col.key}
              style={style}
              className={cn(
                "column-header-cell relative px-2.5 flex items-center min-w-0 border-r border-border text-xs font-bold uppercase tracking-wider text-foreground/75 group/header",
                alignClass,
              )}
            >
              {/* Column Label with Dropdown menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 min-w-0 max-w-full hover:text-foreground text-left focus:outline-none"
                  >
                    <span className="truncate">{col.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-0 group-hover/header:opacity-60 transition-opacity shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 text-xs">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingColumn(col);
                      setIsAddDialogOpen(true);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Edit Column...</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingColumn(undefined);
                      setTargetInsertIndex(idx);
                      setIsAddDialogOpen(true);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Insert Column Left</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingColumn(undefined);
                      setTargetInsertIndex(idx + 1);
                      setIsAddDialogOpen(true);
                    }}
                    className="gap-2 cursor-pointer"
                  >
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Insert Column Right</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDeleteColumn(col.id)}
                    className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Column</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* 1. Resize Drag Handle on column right edge */}
              <div
                onMouseDown={(e) => handleResizeStart(e, idx)}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/50 transition-colors z-20 -mr-[1px]"
                title="Drag to resize column width"
              />

              {/* 2. Hover + button between columns (at idx + 1) */}
              <div className="absolute right-0 top-0 bottom-0 w-4 -mr-2 z-30 flex items-center justify-center opacity-0 group-hover/header:opacity-100 transition-opacity pointer-events-none">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingColumn(undefined);
                    setTargetInsertIndex(idx + 1);
                    setIsAddDialogOpen(true);
                  }}
                  className="pointer-events-auto h-5 w-5 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-xs font-bold"
                  title="Insert column here"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Trailing Add Column / Actions Cell */}
        <div className="w-16 shrink-0 flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              setEditingColumn(undefined);
              setTargetInsertIndex(columns.length);
              setIsAddDialogOpen(true);
            }}
            className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center cursor-pointer"
            title="Add column at the end"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add / Edit Column Dialog */}
      {isAddDialogOpen && (
        <AddColumnDialog
          isOpen={isAddDialogOpen}
          onClose={() => {
            setIsAddDialogOpen(false);
            setEditingColumn(undefined);
            setTargetInsertIndex(undefined);
          }}
          insertIndex={targetInsertIndex}
          editColumn={editingColumn}
          onSave={handleSaveColumn}
        />
      )}
    </>
  );
}
