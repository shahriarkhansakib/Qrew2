"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Edit2, Info, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddEditOrgConfigModal } from "@/components/features/org-configs/add-edit-org-config-modal";
import { ConfirmDeleteModal } from "@/components/shared/confirm-delete-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/lib/constants";
import { buildTokenMap, fmt } from "@/lib/formula-evaluator";
import { cn } from "@/lib/utils";
import { AddEditTemplateConstantModal } from "../add-edit-template-constant-modal";
import { useBuilderContext } from "../builder-context";
import { ExpenseCategoriesSection } from "./components/expense-categories-section";
import { FileDetailsSection } from "./components/file-details-section";
import { GlobalConstantsSection } from "./components/global-constants-section";
import { SectionsTree } from "./components/sections-tree";
import { TemplateConstantsSection } from "./components/template-constants-section";

type TokenEntry = {
  token: string;
  value: number | null;
  type:
    | "file"
    | "file-text"
    | "row-base"
    | "row-charge-item"
    | "row-charges"
    | "row-total"
    | "sec-base"
    | "sec-charge-item"
    | "sec-charges"
    | "sec-total";
};

const TOKEN_TYPE_CONFIG: Record<
  TokenEntry["type"],
  { chip: string; dot: string; value: string; label: string; description: string }
> = {
  file: {
    chip: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
    dot: "bg-sky-400",
    value: "text-sky-400",
    label: "File Field (Formula)",
    description: "A numeric value from the invoice file/project",
  },
  "file-text": {
    chip: "bg-teal-500/5 text-teal-400/50 border border-teal-500/10",
    dot: "bg-teal-400/50",
    value: "text-teal-400/50",
    label: "File Field (Text)",
    description: "A text value from the file (cannot be used in formulas)",
  },
  "row-base": {
    chip: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    dot: "bg-violet-400",
    value: "text-violet-400 font-semibold",
    label: "Row Base",
    description: "The raw base value entered directly into a row cell",
  },
  "row-charge-item": {
    chip: "bg-accent/5 text-accent-foreground/70 border border-amber-500/10",
    dot: "bg-accent/70",
    value: "text-accent-foreground/70",
    label: "Row Charge Item",
    description: "A single computed charge applied to a specific row",
  },
  "row-charges": {
    chip: "bg-accent/10 text-accent-foreground border border-amber-500/20",
    dot: "bg-accent",
    value: "text-accent-foreground font-medium",
    label: "Row Charges Sum",
    description: "Sum of all individual charges on a specific row",
  },
  "row-total": {
    chip: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
    dot: "bg-slate-400",
    value: "text-slate-400 font-bold",
    label: "Row Total",
    description: "Row base + Row charges sum",
  },
  "sec-base": {
    chip: "bg-primary/10 text-primary border border-primary/20",
    dot: "bg-primary",
    value: "text-primary font-semibold",
    label: "Section Base",
    description: "Sum of all row base values in this section",
  },
  "sec-charge-item": {
    chip: "bg-orange-500/5 text-orange-400/70 border border-orange-500/10",
    dot: "bg-orange-400/70",
    value: "text-orange-400/70",
    label: "Section Charge Item",
    description: "A single computed charge applied at the section level",
  },
  "sec-charges": {
    chip: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
    dot: "bg-orange-400",
    value: "text-orange-400 font-medium",
    label: "Section Charges Sum",
    description: "Sum of all individual charges applied at the section level",
  },
  "sec-total": {
    chip: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
    dot: "bg-slate-400",
    value: "text-slate-400 font-bold",
    label: "Section Total",
    description: "Section base + Section charges sum",
  },
};

const _CONSTANT_LEGEND = [
  {
    dot: "bg-indigo-400",
    label: "Global Constant",
    description: "Org-wide constant shared across all templates and invoices",
  },
  {
    dot: "bg-blue-400",
    label: "Template Constant",
    description: "A fixed value defined specifically for this template",
  },
  {
    dot: "bg-sky-400",
    label: "File Field (Formula)",
    description: "A numeric value pulled from the invoice file/project",
  },
  {
    dot: "bg-teal-400/50",
    label: "File Field (Text)",
    description: "A text value from the file/project (cannot be calculated)",
  },
];

export function TokenRow({
  token,
  value,
  type,
  zoomLevel = 0,
  onClick,
  onLegendClick,
}: TokenEntry & { zoomLevel?: number; onClick?: () => void; onLegendClick?: () => void }) {
  const { selectedCell, invalidTokens, hiddenTokens, getTokenDisabledReason } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const isInvalid = isFormulaMode && invalidTokens.has(token);
  const isHidden = isFormulaMode && hiddenTokens.has(token);
  const isDisabled = isInvalid || isHidden;
  const disabledReason = isDisabled
    ? getTokenDisabledReason(token) ||
      (isInvalid ? "Creates circular dependency" : "Not allowed in active cell")
    : undefined;

  const handleClick = () => {
    if (isInvalid || isHidden) {
      toast.error(`Cannot insert: ${disabledReason || `"${token}" is not allowed.`}`);
      return;
    }
    onClick?.();
  };

  const isMissing = value == null;
  const cfg = TOKEN_TYPE_CONFIG[type];
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-0.5 rounded transition-colors group",
        isDisabled
          ? "opacity-35 cursor-not-allowed bg-muted/5"
          : "hover:bg-muted/20 cursor-pointer",
      )}
      onClick={handleClick}
      title={
        isDisabled
          ? disabledReason?.startsWith("Disabled:")
            ? disabledReason
            : `Disabled: ${disabledReason}`
          : `Insert ${token}`
      }
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono truncate select-none rounded px-1.5 py-0.5 leading-none",
          isInvalid ? "line-through opacity-70" : "",
          cfg.chip,
        )}
        style={{ fontSize: 13 + zoomLevel }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLegendClick?.();
          }}
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}
          title={cfg.label}
        />
        {isInvalid && <AlertTriangle className="w-3 h-3 text-accent-foreground shrink-0 mr-0.5" />}
        {token}
      </span>
      {value != null && (
        <span
          className={`font-mono shrink-0 tabular-nums ${cfg.value}`}
          style={{ fontSize: 14 + zoomLevel }}
        >
          {fmt(value)}
        </span>
      )}
      {isMissing && (
        <span className="font-mono text-[11px] text-muted-foreground/30 shrink-0">—</span>
      )}
    </div>
  );
}

export function FileTokenRow({
  token,
  label,
  isNumeric,
  zoomLevel = 0,
  onClick,
  onLegendClick,
}: {
  token: string;
  label: string;
  isNumeric: boolean;
  zoomLevel?: number;
  onClick?: () => void;
  onLegendClick?: () => void;
}) {
  const { selectedCell, invalidTokens, hiddenTokens, getTokenDisabledReason } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const isInvalid = isFormulaMode && invalidTokens.has(token);
  const isHidden = isFormulaMode && hiddenTokens.has(token);
  const isDisabled = isInvalid || isHidden || !isNumeric;
  const disabledReason = !isNumeric
    ? `${label} is a text field and cannot be used in formulas`
    : isDisabled
      ? getTokenDisabledReason(token) ||
        (isInvalid ? "Creates circular dependency" : "Not allowed in active cell")
      : undefined;

  const handleClick = () => {
    if (!isNumeric) return;
    if (isInvalid || isHidden) {
      toast.error(`Cannot insert: ${disabledReason || `"${token}" is not allowed.`}`);
      return;
    }
    onClick?.();
  };

  const type: TokenEntry["type"] = isNumeric ? "file" : "file-text";
  const cfg = TOKEN_TYPE_CONFIG[type];
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-0.5 rounded transition-colors group",
        isDisabled
          ? "opacity-35 cursor-not-allowed bg-muted/5"
          : "hover:bg-muted/20 cursor-pointer",
      )}
      onClick={handleClick}
      title={
        isDisabled
          ? disabledReason?.startsWith("Disabled:")
            ? disabledReason
            : `Disabled: ${disabledReason}`
          : `Insert ${token}`
      }
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-mono truncate select-none rounded px-1.5 py-0.5 leading-none",
          isInvalid ? "line-through opacity-70" : "",
          cfg.chip,
        )}
        style={{ fontSize: 13 + zoomLevel }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLegendClick?.();
          }}
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}
          title={cfg.label}
        />
        {isInvalid && <AlertTriangle className="w-3 h-3 text-accent-foreground shrink-0 mr-0.5" />}
        {token}
      </span>
      <span className="text-xs text-muted-foreground truncate">{label}</span>
    </div>
  );
}

export function ConstantTokenCard({
  token,
  value,
  type,
  isPercentage,
  zoomLevel = 0,
  onClick,
  onEdit,
  onDelete,
  onLegendClick,
}: {
  token: string;
  value?: number | null;
  type: "global" | "template" | "file";
  isPercentage?: boolean;
  zoomLevel?: number;
  onClick: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onLegendClick?: () => void;
}) {
  const { selectedCell, invalidTokens, hiddenTokens, getTokenDisabledReason } = useBuilderContext();
  const isFormulaMode = !!selectedCell;
  const isInvalid = isFormulaMode && invalidTokens.has(token);
  const isHidden = isFormulaMode && hiddenTokens.has(token);
  const isDisabled = isInvalid || isHidden;
  const disabledReason = isDisabled
    ? getTokenDisabledReason(token) ||
      (isInvalid ? "Creates circular dependency" : "Not allowed in active cell")
    : undefined;

  const handleClick = () => {
    if (isInvalid || isHidden) {
      toast.error(`Cannot insert: ${disabledReason || `"${token}" is not allowed.`}`);
      return;
    }
    onClick();
  };

  const styles = {
    global: "text-indigo-400 hover:bg-indigo-500/10",
    template: "text-blue-400 hover:bg-blue-500/10",
    file: "text-sky-400 hover:bg-sky-500/10",
  };
  const dots = { global: "bg-indigo-400", template: "bg-blue-400", file: "bg-sky-400" };
  const labels = { global: "Global Constant", template: "Template Constant", file: "File Field" };
  const formattedValue =
    value != null ? (isPercentage ? `${(value * 100).toFixed(0)}%` : fmt(value)) : null;

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-2 px-2 py-1 rounded transition-colors",
        isDisabled ? "opacity-35 cursor-not-allowed bg-muted/5" : `cursor-pointer ${styles[type]}`,
      )}
      onClick={handleClick}
      title={
        isDisabled
          ? disabledReason?.startsWith("Disabled:")
            ? disabledReason
            : `Disabled: ${disabledReason}`
          : `Insert ${token}`
      }
    >
      <span
        className="inline-flex items-center gap-1.5 font-mono truncate select-none"
        style={{ fontSize: 13 + zoomLevel }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLegendClick?.();
          }}
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dots[type]}`}
          title={labels[type]}
        />
        {isInvalid && <AlertTriangle className="w-3 h-3 text-accent-foreground shrink-0 mr-0.5" />}
        <span className={isInvalid ? "line-through opacity-70" : ""}>{token}</span>
      </span>
      <div className="flex items-center gap-2">
        {formattedValue !== null && (
          <span
            className="font-mono tabular-nums shrink-0 opacity-80"
            style={{ fontSize: 14 + zoomLevel }}
          >
            {formattedValue}
          </span>
        )}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              title="Edit"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 text-muted-foreground hover:text-destructive rounded"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { type SectionInfoData, SectionInfoPopover } from "./components/section-info-popover";

import { type SectionInfoData, SectionInfoPopover } from "./components/section-info-popover";

export function PoolSectionHeader({
  label,
  info,
  action,
}: {
  label: string;
  info?: SectionInfoData;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 mb-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
          {label}
        </span>
        {info && <SectionInfoPopover info={info} />}
      </div>
      {action}
    </div>
  );
}

export function TemplateTokenPool({
  templateId,
  draftId,
}: {
  templateId?: string;
  draftId?: string;
}) {
  const isDraftMode = !!draftId;
  const apiBasePath = isDraftMode
    ? `${apiUrl}/api/invoices/drafts/${draftId}`
    : `${apiUrl}/api/invoice-templates/${templateId}`;

  const invalidateConstantsKey = isDraftMode
    ? ["draft-constants", draftId]
    : ["template-constants", templateId];

  const invalidateSectionsKey = isDraftMode
    ? ["draft-sections", draftId]
    : ["template-sections", templateId];

  const { selectedCell, setClipboardToken } = useBuilderContext();
  const [showLegend, setShowLegend] = useState(false);
  const [tokenZoomLevel, setTokenZoomLevel] = useState(0);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<any>(null);
  const [isConstantModalOpen, setIsConstantModalOpen] = useState(false);
  const [editConstant, setEditConstant] = useState<any>(null);

  const queryClient = useQueryClient();
  const [configToDelete, setConfigToDelete] = useState<any>(null);
  const [constantToDelete, setConstantToDelete] = useState<any>(null);

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/org-configs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete config");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Global constant deleted");
      queryClient.invalidateQueries({ queryKey: ["org-configs"] });
      setConfigToDelete(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteConstantMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiBasePath}/constants/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete constant");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Template constant deleted");
      queryClient.invalidateQueries({ queryKey: invalidateConstantsKey });
      setConstantToDelete(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: orgConfigs } = useQuery({
    queryKey: ["org-configs"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/org-configs`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch configs");
      return res.json();
    },
  });

  const { data: templateConstants } = useQuery({
    queryKey: invalidateConstantsKey,
    queryFn: async () => {
      const res = await fetch(`${apiBasePath}/constants`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch constants");
      return res.json();
    },
  });

  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: invalidateSectionsKey,
    queryFn: async () => {
      const res = await fetch(`${apiBasePath}/sections`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sections");
      return res.json();
    },
  });

  const { data: templateHeaderFields } = useQuery({
    queryKey: ["template-header-fields", templateId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${templateId}/header-fields`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch header fields");
      return res.json();
    },
    enabled: !!templateId,
  });

  const { data: expenseCategories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expense-categories`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (sectionsLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  const sortedSections = [...(sections || [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const tokenMap = buildTokenMap(
    sortedSections,
    orgConfigs,
    templateConstants,
    templateHeaderFields,
    expenseCategories,
  );
  const grandTotal = sortedSections.reduce(
    (sum: number, sec: any) =>
      sum + (tokenMap[`SEC_${sec.sectionToken}`] ?? tokenMap[`SEC_${sec.sectionToken}_TOTAL`] ?? 0),
    0,
  );
  const allFileFields = [...(templateHeaderFields || [])].sort(
    (a: any, b: any) => a.sortOrder - b.sortOrder,
  );

  const getFileToken = (field: any) => {
    if (field.fieldType === "file_field" && field.fileFieldKey) {
      return field.fileFieldKey.toUpperCase().replace(/^FILE_/, "");
    }
    if (field.fieldType === "org_config" && field.orgConfigKey) {
      return field.orgConfigKey.toUpperCase().replace(/^(GBL_|ORG_)/, "");
    }
    return (field.label || "")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^FILE_/, "");
  };

  const handleTokenClick = (token: string) => {
    if (selectedCell) {
      window.dispatchEvent(new CustomEvent("insert-token", { detail: token }));
    } else {
      navigator.clipboard.writeText(token);
      setClipboardToken(token);
      toast.success(`Copied "${token}" to clipboard`);
    }
  };

  return (
    <>
      <div
        className="flex flex-col h-full overflow-y-auto token-pool-container"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-foreground">Token Pool</h2>
                <button
                  type="button"
                  onClick={() => setShowLegend(true)}
                  className={`p-1 rounded-full transition-colors cursor-pointer ${showLegend ? "bg-primary/10 text-primary" : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/40"}`}
                  title="Token color guide"
                  aria-label="Token color guide"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                Click a token to insert it into a formula.
              </p>
            </div>
            <div className="flex items-center gap-1 border border-border rounded-md px-0.5 h-7 bg-background shadow-sm">
              <button
                onClick={() => setTokenZoomLevel((z) => Math.max(z - 1, -4))}
                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                title="Decrease Font Size"
              >
                <span className="text-lg leading-none font-medium mb-1">-</span>
              </button>
              <span className="text-[10px] font-mono w-4 text-center select-none text-muted-foreground">
                {tokenZoomLevel > 0 ? `+${tokenZoomLevel}` : tokenZoomLevel}
              </span>
              <button
                onClick={() => setTokenZoomLevel((z) => Math.min(z + 1, 8))}
                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                title="Increase Font Size"
              >
                <span className="text-lg leading-none font-medium mb-1">+</span>
              </button>
            </div>
          </div>
        </div>

        <Dialog open={showLegend} onOpenChange={setShowLegend}>
          <DialogContent className="sm:max-w-2xl w-full top-[10vh] translate-y-0 gap-0 p-0 overflow-hidden shadow-2xl">
            <DialogHeader className="px-4 py-3 border-b border-border/40 bg-muted/20">
              <DialogTitle className="text-sm">Token Color Guide</DialogTitle>
              <DialogDescription className="text-[11px]">
                Understand the different types of tokens available in formulas.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="all" className="w-full">
              <div className="px-3 pt-2 border-b border-border/40 bg-muted/10 overflow-hidden">
                <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0 overflow-x-auto overflow-y-hidden no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <TabsTrigger
                    value="all"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    All Tokens
                  </TabsTrigger>
                  <TabsTrigger
                    value="global"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    Global
                  </TabsTrigger>
                  <TabsTrigger
                    value="template"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    Template
                  </TabsTrigger>
                  <TabsTrigger
                    value="file"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    File Fields
                  </TabsTrigger>
                  <TabsTrigger
                    value="rows"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    Row Tokens
                  </TabsTrigger>
                  <TabsTrigger
                    value="sections"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    Section Tokens
                  </TabsTrigger>
                  <TabsTrigger
                    value="expense"
                    className="text-xs px-2.5 py-1.5 data-[state=active]:bg-background shadow-none shrink-0"
                  >
                    Expense Categories
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-4 max-h-[65vh] min-h-[380px] overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {/* ── Tab 1: All Tokens (Structured section by section) ── */}
                <TabsContent value="all" className="mt-0 space-y-4">
                  {/* Row Tokens */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      Row Tokens
                    </h4>
                    <div className="space-y-1">
                      {(
                        [
                          "row-total",
                          "row-base",
                          "row-charges",
                          "row-charge-item",
                        ] as TokenEntry["type"][]
                      ).map((type) => {
                        const cfg = TOKEN_TYPE_CONFIG[type];
                        return (
                          <div
                            key={cfg.label}
                            className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
                          >
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${cfg.dot}`}
                            />
                            <div className="min-w-0">
                              <span className={`text-xs font-semibold leading-none ${cfg.value}`}>
                                {cfg.label}
                              </span>
                              <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                                {cfg.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section Tokens */}
                  <div className="border-t border-border/30 pt-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      Section Tokens
                    </h4>
                    <div className="space-y-1">
                      {(
                        [
                          "sec-total",
                          "sec-base",
                          "sec-charges",
                          "sec-charge-item",
                        ] as TokenEntry["type"][]
                      ).map((type) => {
                        const cfg = TOKEN_TYPE_CONFIG[type];
                        return (
                          <div
                            key={cfg.label}
                            className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
                          >
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${cfg.dot}`}
                            />
                            <div className="min-w-0">
                              <span className={`text-xs font-semibold leading-none ${cfg.value}`}>
                                {cfg.label}
                              </span>
                              <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                                {cfg.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Global Constants */}
                  <div className="border-t border-border/30 pt-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      Global Constants
                    </h4>
                    <div className="space-y-1">
                      <div className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 bg-indigo-400" />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold leading-none text-indigo-400">
                            Global Constant
                          </span>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                            Org-wide constant shared across all templates and invoices
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Template Constants */}
                  <div className="border-t border-border/30 pt-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      Template Constants
                    </h4>
                    <div className="space-y-1">
                      <div className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 bg-blue-400" />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold leading-none text-blue-400">
                            Template Constant
                          </span>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                            A fixed value defined specifically for this template
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* File Details */}
                  <div className="border-t border-border/30 pt-3">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                      File Details
                    </h4>
                    <div className="space-y-1">
                      <div className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 bg-sky-400" />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold leading-none text-sky-400">
                            File Field (Formula)
                          </span>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                            A numeric value pulled from the invoice file/project
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 bg-teal-400/50" />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold leading-none text-teal-400/50">
                            File Field (Text)
                          </span>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed">
                            A text value from the file/project (cannot be calculated)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Tab 2: Global Constants ── */}
                <TabsContent value="global" className="mt-0 space-y-3">
                  <div className="flex items-start gap-3 p-3.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                    <span className="w-3 h-3 rounded-full shrink-0 mt-1 bg-indigo-400 shadow-sm" />
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-400">Global Constant</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          e.g. VAT_RATE
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        Organization-wide constants shared across all templates and invoices. Useful
                        for system-wide rates, statutory taxes, and baseline business parameters.
                      </p>
                      <div className="pt-2 text-[11px] text-muted-foreground/70 space-y-1">
                        <p>
                          • <strong>Scope:</strong> Shared across the entire organization.
                        </p>
                        <p>
                          • <strong>Formula Usage:</strong> Inserted as bare token names (e.g.{" "}
                          <code className="font-mono text-indigo-400">VAT_RATE</code>).
                        </p>
                        <p>
                          • <strong>Editing:</strong> Can be configured under Org Settings by
                          managers.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Tab 3: Template Constants ── */}
                <TabsContent value="template" className="mt-0 space-y-3">
                  <div className="flex items-start gap-3 p-3.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <span className="w-3 h-3 rounded-full shrink-0 mt-1 bg-blue-400 shadow-sm" />
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-400">Template Constant</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          e.g. FUEL_FACTOR
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        Fixed values or percentage rates defined specifically for this invoice
                        template. They provide template-scoped constants that don't affect other
                        templates.
                      </p>
                      <div className="pt-2 text-[11px] text-muted-foreground/70 space-y-1">
                        <p>
                          • <strong>Scope:</strong> Local to this template only.
                        </p>
                        <p>
                          • <strong>Formula Usage:</strong> Inserted as bare token names (e.g.{" "}
                          <code className="font-mono text-blue-400">FUEL_FACTOR</code>).
                        </p>
                        <p>
                          • <strong>Editing:</strong> Created and managed directly in the sidebar
                          toolbar above.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Tab 4: File Fields ── */}
                <TabsContent value="file" className="mt-0 space-y-3">
                  <div className="flex items-start gap-3 p-3.5 rounded-lg bg-sky-500/5 border border-sky-500/10">
                    <span className="w-3 h-3 rounded-full shrink-0 mt-1 bg-sky-400 shadow-sm" />
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-sky-400">
                          File Field (Formula / Numeric)
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          e.g. GRT, LOA
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        Numeric metrics pulled dynamically from the invoice file or vessel project
                        (such as gross tonnage, length overall, or draft).
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        • <strong>Formula Usage:</strong> Fully eligible for mathematical
                        calculation in any row formula.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3.5 rounded-lg bg-teal-500/5 border border-teal-500/10">
                    <span className="w-3 h-3 rounded-full shrink-0 mt-1 bg-teal-400/50 shadow-sm" />
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-teal-400/70">
                          File Field (Text / Informational)
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400/60 border border-teal-500/20">
                          e.g. VESSEL_NAME
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 leading-relaxed">
                        Text values pulled from the project metadata. These fields are informational
                        headers for reporting.
                      </p>
                      <p className="text-[11px] text-accent-foreground/80">
                        • <strong>Constraint:</strong> Cannot be used in mathematical formulas.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Tab 5: Row Tokens (Separate Tab) ── */}
                <TabsContent value="rows" className="mt-0 space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Row Tokens (4 Types)
                      </h4>
                      <span className="text-[11px] text-muted-foreground/60 font-mono">
                        Row Scope
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 px-1 leading-relaxed">
                      Each parent row in the template generates up to four distinct token variants
                      for flexible, decoupled formula calculations.
                    </p>

                    {(
                      [
                        "row-total",
                        "row-base",
                        "row-charges",
                        "row-charge-item",
                      ] as TokenEntry["type"][]
                    ).map((type) => {
                      const cfg = TOKEN_TYPE_CONFIG[type];
                      return (
                        <div
                          key={cfg.label}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${cfg.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold ${cfg.value}`}>{cfg.label}</span>
                              <span
                                className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${cfg.chip}`}
                              >
                                {type === "row-total"
                                  ? "<ROW>"
                                  : type === "row-base"
                                    ? "<ROW>_BASE"
                                    : type === "row-charges"
                                      ? "<ROW>_CHARGES"
                                      : "<ROW>_<SUFFIX>"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                              {cfg.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-[11px] text-muted-foreground/80 space-y-1.5 mt-2">
                      <p>
                        • <strong>Primary Total:</strong>{" "}
                        <code className="font-mono text-slate-400 font-bold">&lt;ROW&gt;</code>{" "}
                        represents the <em>Total</em> aggregate row value (Base + Line Charges).
                      </p>
                      <p>
                        • <strong>Base Value:</strong>{" "}
                        <code className="font-mono text-violet-400 font-semibold">
                          &lt;ROW&gt;_BASE
                        </code>{" "}
                        represents the raw uncharged base row value.
                      </p>
                      <p>
                        • <strong>Charges Sum:</strong>{" "}
                        <code className="font-mono text-accent-foreground font-medium">
                          &lt;ROW&gt;_CHARGES
                        </code>{" "}
                        represents the sum of all charges for that row.
                      </p>
                      <p>
                        • <strong>Strict Rate Charges:</strong> Line charges evaluate predictably as{" "}
                        <code className="font-mono text-accent-foreground/80">
                          &lt;ROW&gt;_BASE * rate%
                        </code>
                        .
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Tab 6: Section Tokens (Separate Tab) ── */}
                <TabsContent value="sections" className="mt-0 space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Section Tokens (4 Types)
                      </h4>
                      <span className="text-[11px] text-muted-foreground/60 font-mono">
                        Section Scope
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 px-1 leading-relaxed">
                      Sections aggregate all contained rows and support section-level surcharges,
                      producing four distinct tokens.
                    </p>

                    {(
                      [
                        "sec-total",
                        "sec-base",
                        "sec-charges",
                        "sec-charge-item",
                      ] as TokenEntry["type"][]
                    ).map((type) => {
                      const cfg = TOKEN_TYPE_CONFIG[type];
                      return (
                        <div
                          key={cfg.label}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${cfg.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold ${cfg.value}`}>{cfg.label}</span>
                              <span
                                className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${cfg.chip}`}
                              >
                                {type === "sec-total"
                                  ? "SEC_<NAME>"
                                  : type === "sec-base"
                                    ? "SEC_<NAME>_BASE"
                                    : type === "sec-charges"
                                      ? "SEC_<NAME>_CHARGES"
                                      : "SEC_<NAME>_<SUFFIX>"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                              {cfg.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-[11px] text-muted-foreground/80 space-y-1.5 mt-2">
                      <p>
                        • <strong>Primary Total:</strong>{" "}
                        <code className="font-mono text-slate-400 font-bold">SEC_&lt;NAME&gt;</code>{" "}
                        represents the <em>Total</em> section value (Base + all row charges +
                        section charges).
                      </p>
                      <p>
                        • <strong>Section Base:</strong>{" "}
                        <code className="font-mono text-primary font-semibold">
                          SEC_&lt;NAME&gt;_BASE
                        </code>{" "}
                        sums all row bases in this section.
                      </p>
                      <p>
                        • <strong>Section Charges:</strong>{" "}
                        <code className="font-mono text-orange-400 font-medium">
                          SEC_&lt;NAME&gt;_CHARGES
                        </code>{" "}
                        sums all row charges and section charges.
                      </p>
                      <p>
                        • <strong>Scope Boundary:</strong> Rows inside a section cannot reference
                        their containing section to prevent circular dependencies.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* ── Tab: Expense Categories ── */}
                <TabsContent value="expense" className="mt-0 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                      <span className="w-3 h-3 rounded-full bg-rose-500" />
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">
                        Expense Category Tokens
                      </h4>
                    </div>
                    <p className="text-xs text-foreground/80 px-1 leading-relaxed">
                      Represent project expenses dynamically recorded across categories.
                    </p>

                    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1 bg-rose-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-rose-500">EXP_TOTAL</span>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-rose-500/15 text-rose-500 font-bold border-rose-500/30">
                            EXP_TOTAL
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                          Grand total of all recorded expenses across every category for the
                          project.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-muted/10">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1 bg-rose-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-rose-400">Category Sum</span>
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-rose-500/10 text-rose-400 font-medium border-rose-500/20">
                            &lt;CATEGORY&gt;
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                          Sum of expenses in a specific category (e.g. TRANSPORTATION, OFFICE).
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-[11px] text-muted-foreground/80 space-y-1.5 mt-2">
                      <p>
                        • In the template builder, all expense category tokens evaluate to{" "}
                        <code>0</code>.
                      </p>
                      <p>
                        • At invoice generation time, they resolve to the live project expense sums.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </DialogContent>
        </Dialog>

        <div className="flex-1 overflow-y-auto py-3 space-y-5">
          <GlobalConstantsSection
            orgConfigs={orgConfigs}
            tokenZoomLevel={tokenZoomLevel}
            handleTokenClick={handleTokenClick}
            setEditConfig={setEditConfig}
            setIsConfigModalOpen={setIsConfigModalOpen}
            setConfigToDelete={setConfigToDelete}
            setShowLegend={setShowLegend}
          />
          <TemplateConstantsSection
            templateConstants={templateConstants}
            tokenZoomLevel={tokenZoomLevel}
            handleTokenClick={handleTokenClick}
            setEditConstant={setEditConstant}
            setIsConstantModalOpen={setIsConstantModalOpen}
            setConstantToDelete={setConstantToDelete}
            setShowLegend={setShowLegend}
          />
          <FileDetailsSection
            allFileFields={allFileFields}
            getFileToken={getFileToken}
            tokenZoomLevel={tokenZoomLevel}
            handleTokenClick={handleTokenClick}
            setShowLegend={setShowLegend}
          />
          <ExpenseCategoriesSection
            categories={expenseCategories || []}
            tokenZoomLevel={tokenZoomLevel}
            handleTokenClick={handleTokenClick}
            setShowLegend={setShowLegend}
          />
          <SectionsTree
            sortedSections={sortedSections}
            tokenMap={tokenMap}
            tokenZoomLevel={tokenZoomLevel}
            handleTokenClick={handleTokenClick}
            setShowLegend={setShowLegend}
          />

          <div className="border-t-2 border-border mx-3 pt-2 pb-2">
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="text-xs font-bold text-foreground">Grand Total</span>
              <span className="font-mono text-sm font-bold text-foreground tabular-nums">
                {fmt(grandTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <AddEditOrgConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        editConfig={editConfig}
      />
      <AddEditTemplateConstantModal
        apiBasePath={apiBasePath}
        invalidateKey={invalidateConstantsKey}
        isOpen={isConstantModalOpen}
        onClose={() => setIsConstantModalOpen(false)}
        editConstant={editConstant}
      />

      <ConfirmDeleteModal
        isOpen={!!configToDelete}
        onClose={() => setConfigToDelete(null)}
        onConfirm={() => configToDelete && deleteConfigMutation.mutate(configToDelete.id)}
        entityName={`Global Constant: ${configToDelete?.configKey}`}
        isDeleting={deleteConfigMutation.isPending}
      />
      <ConfirmDeleteModal
        isOpen={!!constantToDelete}
        onClose={() => setConstantToDelete(null)}
        onConfirm={() => constantToDelete && deleteConstantMutation.mutate(constantToDelete.id)}
        entityName={`Template Constant: ${constantToDelete?.token}`}
        isDeleting={deleteConstantMutation.isPending}
      />
    </>
  );
}
