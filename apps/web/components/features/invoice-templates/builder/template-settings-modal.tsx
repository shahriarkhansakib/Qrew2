"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Calendar,
  Columns3,
  DollarSign,
  FileText,
  Hash,
  ListFilter,
  Plus,
  SlidersHorizontal,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useBuilderContext } from "./builder-context";
import { TemplateColumnDefinition } from "./sheet-builder/types";

interface TemplateSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
  columns?: TemplateColumnDefinition[];
  onSaveColumns?: (newColumns: TemplateColumnDefinition[]) => Promise<void>;
  defaultTab?: "columns" | "view" | "document";
}

export function TemplateSettingsModal({
  isOpen,
  onClose,
  template,
  columns: initialColumns = [],
  onSaveColumns,
  defaultTab,
}: TemplateSettingsModalProps) {
  const isSheet = template?.templateType === "sheet";

  const {
    sectionSeparation,
    setSectionSeparation,
    showSectionHeaders,
    setShowSectionHeaders,
    showSectionSubtotals,
    setShowSectionSubtotals,
  } = useBuilderContext();

  // Columns state for sheet templates
  const [columns, setColumns] = useState<TemplateColumnDefinition[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newDataType, setNewDataType] = useState<TemplateColumnDefinition["dataType"]>("text");
  const [newAlign, setNewAlign] = useState<"left" | "center" | "right">("left");
  const [newIsTotaled, setNewIsTotaled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setColumns([...initialColumns]);
      setNewLabel("");
      setNewDataType("text");
      setNewAlign("left");
      setNewIsTotaled(false);
    }
  }, [isOpen, initialColumns]);

  const handleAddColumn = () => {
    if (!newLabel.trim()) {
      toast.error("Please enter a column heading");
      return;
    }

    const colKey = `col_${newLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")}_${Date.now().toString().slice(-4)}`;

    const defaultWidth =
      newDataType === "serial"
        ? "w-14"
        : newDataType === "date"
          ? "w-36"
          : newDataType === "number"
            ? "w-36"
            : "flex-1";

    const defaultAlign =
      newDataType === "serial" ? "center" : newDataType === "number" ? "right" : newAlign;

    const newCol: TemplateColumnDefinition = {
      id: crypto.randomUUID(),
      key: colKey,
      label: newLabel.trim(),
      dataType: newDataType,
      width: defaultWidth,
      align: defaultAlign,
      isTotaled: newDataType === "number" ? newIsTotaled : false,
    };

    setColumns((prev) => [...prev, newCol]);
    setNewLabel("");
    setNewDataType("text");
    setNewAlign("left");
    setNewIsTotaled(false);
    toast.success(`Added column "${newCol.label}"`);
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length <= 1) {
      toast.error("At least one column is required");
      return;
    }
    setColumns((prev) => prev.filter((col) => col.id !== id));
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const updated = [...columns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setColumns(updated);
  };

  const handleToggleTotaled = (id: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, isTotaled: !col.isTotaled } : col)),
    );
  };

  const handleSaveColumns = async () => {
    if (!onSaveColumns) return;
    if (columns.length === 0) {
      toast.error("At least one column is required");
      return;
    }

    setIsSaving(true);
    try {
      await onSaveColumns(columns);
      toast.success("Columns saved successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save columns");
    } finally {
      setIsSaving(false);
    }
  };

  const getTypeIcon = (type: TemplateColumnDefinition["dataType"]) => {
    switch (type) {
      case "serial":
        return <Hash className="w-3.5 h-3.5 text-blue-400" />;
      case "date":
        return <Calendar className="w-3.5 h-3.5 text-emerald-400" />;
      case "text":
        return <Type className="w-3.5 h-3.5 text-slate-400" />;
      case "number":
        return <DollarSign className="w-3.5 h-3.5 text-amber-400" />;
      case "select":
        return <ListFilter className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden shadow-2xl gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Template Settings
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Configure structure, display layout, and document numbering for this template.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue={defaultTab || (isSheet ? "columns" : "view")} className="w-full">
          <div className="px-6 pt-3 border-b border-border bg-muted/10">
            <TabsList className="h-9 gap-1 bg-transparent p-0">
              {isSheet && (
                <TabsTrigger
                  value="columns"
                  className="text-xs px-3 py-1.5 data-[state=active]:bg-background shadow-xs font-semibold gap-1.5"
                >
                  <Columns3 className="h-3.5 w-3.5 text-primary" />
                  <span>Columns & Data</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="view"
                className="text-xs px-3 py-1.5 data-[state=active]:bg-background shadow-xs font-semibold gap-1.5"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                <span>Presentation & Layout</span>
              </TabsTrigger>
              <TabsTrigger
                value="document"
                className="text-xs px-3 py-1.5 data-[state=active]:bg-background shadow-xs font-semibold gap-1.5"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Document & Indexing</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Tab 1: Columns & Data (Sheet templates only) ── */}
          {isSheet && (
            <TabsContent value="columns" className="m-0 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Active Columns ({columns.length})
                </Label>

                <div className="space-y-1.5">
                  {columns.map((col, idx) => (
                    <div
                      key={col.id || col.key}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-background hover:bg-muted/30 transition-colors gap-3"
                    >
                      {/* Reorder arrows */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, "up")}
                          title="Move column left"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          disabled={idx === columns.length - 1}
                          onClick={() => handleMove(idx, "down")}
                          title="Move column right"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Column label & type icon */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 font-bold text-sm text-foreground truncate">
                          {getTypeIcon(col.dataType)}
                          <span className="truncate">{col.label}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 uppercase tracking-wider shrink-0 bg-muted/40 font-mono"
                        >
                          {col.dataType}
                        </Badge>
                        {col.align && (
                          <span className="text-[11px] text-muted-foreground/60 shrink-0">
                            {col.align === "right" ? (
                              <AlignRight className="w-3.5 h-3.5" />
                            ) : col.align === "center" ? (
                              <AlignCenter className="w-3.5 h-3.5" />
                            ) : (
                              <AlignLeft className="w-3.5 h-3.5" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Auto-Subtotal toggle for number type (with clean spacing and NO flex wrapping) */}
                      {col.dataType === "number" ? (
                        <div className="flex items-center gap-2 shrink-0 px-2 py-1 rounded bg-muted/40 border border-border/50">
                          <Checkbox
                            id={`total-${col.id}`}
                            checked={!!col.isTotaled}
                            onCheckedChange={() => handleToggleTotaled(col.id)}
                          />
                          <label
                            htmlFor={`total-${col.id}`}
                            className="text-xs font-semibold text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                          >
                            Auto-Subtotal
                          </label>
                        </div>
                      ) : (
                        <div className="w-28 shrink-0" />
                      )}

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemoveColumn(col.id)}
                        title="Remove column"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Column Form */}
              <div className="border border-border/80 rounded-lg p-4 bg-muted/20 space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold block">
                  Add New Column
                </Label>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs font-medium text-foreground">Heading Label</Label>
                    <Input
                      placeholder="e.g. Receipt No, Vendor, Tax"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddColumn();
                        }
                      }}
                      className="h-8 text-xs bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-foreground">Data Type</Label>
                    <Select
                      value={newDataType}
                      onValueChange={(val: any) => {
                        setNewDataType(val);
                        if (val === "number") setNewAlign("right");
                        else if (val === "serial") setNewAlign("center");
                        else setNewAlign("left");
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="serial">Serial Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Amount / Number</SelectItem>
                        <SelectItem value="select">Dropdown Select</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    onClick={handleAddColumn}
                    size="sm"
                    className="h-8 text-xs gap-1 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Column</span>
                  </Button>
                </div>

                {newDataType === "number" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="new-totaled"
                      checked={newIsTotaled}
                      onCheckedChange={(checked) => setNewIsTotaled(!!checked)}
                    />
                    <label
                      htmlFor="new-totaled"
                      className="text-xs text-muted-foreground cursor-pointer font-medium"
                    >
                      Calculate Section Subtotal and Grand Total for this column
                    </label>
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* ── Tab 2: Presentation & Layout ── */}
          <TabsContent value="view" className="m-0 p-6 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* 1. Separation Style */}
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-bold text-foreground">
                  Section Separation Style
                </Label>
                <p className="text-xs text-muted-foreground">
                  Controls the border spacing and visual separator rendered between sections.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 p-1 bg-muted/40 rounded-lg border text-xs">
                <button
                  type="button"
                  onClick={() => setSectionSeparation("double")}
                  className={cn(
                    "py-2 px-3 rounded-md font-semibold transition-all text-center",
                    sectionSeparation === "double"
                      ? "bg-background text-primary shadow-xs border border-primary/20"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Double Line
                </button>
                <button
                  type="button"
                  onClick={() => setSectionSeparation("step")}
                  className={cn(
                    "py-2 px-3 rounded-md font-semibold transition-all text-center",
                    sectionSeparation === "step"
                      ? "bg-background text-primary shadow-xs border border-primary/20"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Step Offset
                </button>
                <button
                  type="button"
                  onClick={() => setSectionSeparation("none")}
                  className={cn(
                    "py-2 px-3 rounded-md font-semibold transition-all text-center",
                    sectionSeparation === "none"
                      ? "bg-background text-primary shadow-xs border border-primary/20"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Seamless (None)
                </button>
              </div>
            </div>

            {/* 2. Show Section Names */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-background">
              <div className="space-y-0.5">
                <Label htmlFor="toggle-section-names" className="text-xs font-bold cursor-pointer">
                  Section Header Bars
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display the colored header bar and section label above each section&apos;s rows.
                </p>
              </div>
              <Switch
                id="toggle-section-names"
                checked={showSectionHeaders}
                onCheckedChange={setShowSectionHeaders}
              />
            </div>

            {/* 3. Show Section Subtotals */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-background">
              <div className="space-y-0.5">
                <Label
                  htmlFor="toggle-section-subtotals"
                  className="text-xs font-bold cursor-pointer"
                >
                  Section Subtotal Bars
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display the subtotal row and computed sum at the bottom of each section.
                </p>
              </div>
              <Switch
                id="toggle-section-subtotals"
                checked={showSectionSubtotals}
                onCheckedChange={setShowSectionSubtotals}
              />
            </div>
          </TabsContent>

          {/* ── Tab 3: Document & Indexing ── */}
          <TabsContent value="document" className="m-0 p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-foreground">Document Prefix</Label>
              <Input
                value={template?.documentPrefix || (isSheet ? "EXP" : "INV")}
                readOnly
                className="h-8 text-xs font-mono font-bold bg-muted/40 cursor-default"
              />
              <p className="text-[11px] text-muted-foreground">
                Document identifiers generated from this template will begin with this prefix.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-foreground">Numbering Pattern</Label>
              <Input
                value={template?.numberingFormat || "{PREFIX}-{YYYY}-{SEQ:4}"}
                readOnly
                className="h-8 text-xs font-mono bg-muted/40 cursor-default"
              />
            </div>

            <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-foreground block">
                  Projected Next Document Identifier
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Formatted automatically upon document creation.
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-xs font-mono font-bold border-primary/30 text-primary px-2 py-1"
              >
                {template?.documentPrefix || (isSheet ? "EXP" : "INV")}-{new Date().getFullYear()}
                -0001
              </Badge>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          {isSheet ? (
            <Button
              size="sm"
              onClick={handleSaveColumns}
              disabled={isSaving}
              className="text-xs font-semibold"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          ) : (
            <Button size="sm" onClick={onClose} className="text-xs font-semibold">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
