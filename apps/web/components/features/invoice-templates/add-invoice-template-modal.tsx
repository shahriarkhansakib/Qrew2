"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/constants";

// ─── Block type ───────────────────────────────────────────────────────────────

type DynamicBlock =
  | { type: "year"; format: "YYYY" | "YY" }
  | { type: "month"; format: "MM" | "MMM" }
  | { type: "day"; format: "DD" }
  | { type: "text"; value: string };

// ─── Component ────────────────────────────────────────────────────────────────

export function AddEditInvoiceTemplateModal({
  isOpen,
  onClose,
  editTemplate,
}: {
  isOpen: boolean;
  onClose: () => void;
  editTemplate?: any;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [prefix, setPrefix] = useState("INV");
  const [isPrefixDirty, setIsPrefixDirty] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const [dynamicBlocks, setDynamicBlocks] = useState<DynamicBlock[]>([
    { type: "year", format: "YYYY" },
  ]);

  // digits = sequence padding count ("2", "3", or "4")
  const [digits, setDigits] = useState<"2" | "3" | "4">("3");

  // ── Parse existing template on open ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    if (editTemplate) {
      setName(editTemplate.name || "");
      setDescription(editTemplate.description || "");
      setPrefix(editTemplate.documentPrefix || "INV");
      setIsPrefixDirty(true);

      const rawFormat: string = editTemplate.numberingFormat || "{PREFIX}-{YYYY}-{SEQ:3}";
      const seqMatch = rawFormat.match(/\{SEQ:(\d+)\}/);
      if (seqMatch) {
        const n = parseInt(seqMatch[1], 10);
        setDigits((n === 2 ? "2" : n === 4 ? "4" : "3") as "2" | "3" | "4");
      } else {
        setDigits("3");
      }

      const stripped = rawFormat.replace(/^\{PREFIX\}-?/, "").replace(/-?\{SEQ(?::\d+)?\}$/, "");

      const blocks: DynamicBlock[] = [];
      for (const part of stripped.split("-")) {
        if (!part) continue;
        if (part === "{YYYY}") blocks.push({ type: "year", format: "YYYY" });
        else if (part === "{YY}") blocks.push({ type: "year", format: "YY" });
        else if (part === "{MM}") blocks.push({ type: "month", format: "MM" });
        else if (part === "{MMM}") blocks.push({ type: "month", format: "MMM" });
        else if (part === "{DD}") blocks.push({ type: "day", format: "DD" });
        else blocks.push({ type: "text", value: part });
      }
      setDynamicBlocks(blocks);
    } else {
      setName("");
      setDescription("");
      setPrefix("INV");
      setIsPrefixDirty(false);
      setDynamicBlocks([{ type: "year", format: "YYYY" }]);
      setDigits("3");
    }
  }, [isOpen, editTemplate]);

  // ── Block helpers ───────────────────────────────────────────────────────────

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isPrefixDirty) {
      setPrefix(
        val
          .toUpperCase()
          .replace(/\s+/g, "_")
          .replace(/[^A-Z0-9_]/g, "") || "INV",
      );
    }
  };

  // Year/Month/Day each appear at most once; Text can repeat
  const usedSingleTypes = new Set(
    dynamicBlocks.filter((b) => b.type !== "text").map((b) => b.type),
  );

  const addBlock = (type: DynamicBlock["type"]) => {
    const block: DynamicBlock =
      type === "year"
        ? { type: "year", format: "YYYY" }
        : type === "month"
          ? { type: "month", format: "MM" }
          : type === "day"
            ? { type: "day", format: "DD" }
            : { type: "text", value: "" };
    setDynamicBlocks((prev) => [...prev, block]);
  };

  const removeBlock = (index: number) => {
    setDynamicBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBlockFormat = (index: number, format: string) => {
    setDynamicBlocks((prev) =>
      prev.map((b, i) => (i === index ? ({ ...b, format } as DynamicBlock) : b)),
    );
  };

  const updateTextValue = (index: number, raw: string) => {
    const value = raw.toUpperCase().replace(/[^A-Z0-9_]/g, "");
    setDynamicBlocks((prev) =>
      prev.map((b, i) => (i === index && b.type === "text" ? { type: "text", value } : b)),
    );
  };

  // ── Format string & live preview ───────────────────────────────────────────

  const numberingFormat = useMemo(() => {
    const parts = ["{PREFIX}"];
    dynamicBlocks.forEach((b) => {
      if (b.type === "text") {
        if (b.value) parts.push(b.value);
      } else {
        parts.push(`{${b.format}}`);
      }
    });
    parts.push(`{SEQ:${digits}}`);
    return parts.join("-");
  }, [dynamicBlocks, digits]);

  const livePreview = useMemo(() => {
    const now = new Date();
    const MONTHS = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const parts: string[] = [prefix || "INV"];

    dynamicBlocks.forEach((b) => {
      if (b.type === "year") {
        parts.push(
          b.format === "YYYY"
            ? now.getFullYear().toString()
            : now.getFullYear().toString().slice(-2),
        );
      } else if (b.type === "month") {
        parts.push(
          b.format === "MM"
            ? (now.getMonth() + 1).toString().padStart(2, "0")
            : MONTHS[now.getMonth()],
        );
      } else if (b.type === "day") {
        parts.push(now.getDate().toString().padStart(2, "0"));
      } else if (b.type === "text" && b.value) {
        parts.push(b.value);
      }
    });

    parts.push("1".padStart(parseInt(digits, 10), "0"));
    return parts.join("-");
  }, [prefix, dynamicBlocks, digits]);

  // ── Mutation ────────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = editTemplate
        ? `${apiUrl}/api/invoice-templates/${editTemplate.id}`
        : `${apiUrl}/api/invoice-templates`;

      const res = await fetch(url, {
        method: editTemplate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save template");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      toast.success(editTemplate ? "Template updated" : "Template created");
      queryClient.invalidateQueries({ queryKey: ["invoice-templates"] });

      if (editTemplate) {
        onClose();
      } else {
        setIsNavigating(true);
        const id = data.id;

        // Fix 1: Seed the template object into the cache NOW so the builder
        // page's useQuery finds it immediately and skips its own fetch.
        queryClient.setQueryData(["invoice-templates", id], data);

        // Fix 2: Prefetch all builder sub-resources in parallel while the
        // Next.js route chunk is downloading. By the time the page hydrates,
        // the data is already in cache.
        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: ["template-sections", id],
            queryFn: () =>
              fetch(`${apiUrl}/api/invoice-templates/${id}/sections`, {
                credentials: "include",
              }).then((r) => r.json()),
          }),
          queryClient.prefetchQuery({
            queryKey: ["template-header-fields", id],
            queryFn: () =>
              fetch(`${apiUrl}/api/invoice-templates/${id}/header-fields`, {
                credentials: "include",
              }).then((r) => r.json()),
          }),
          queryClient.prefetchQuery({
            queryKey: ["template-constants", id],
            queryFn: () =>
              fetch(`${apiUrl}/api/invoice-templates/${id}/constants`, {
                credentials: "include",
              }).then((r) => r.json()),
          }),
        ]);

        router.push(`/org-admin/invoice-templates/${id}`);
      }
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ name, description, documentPrefix: prefix, numberingFormat });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isNavigating && onClose()}>
      <DialogContent
        className="max-w-[480px] overflow-hidden"
        onInteractOutside={(e) => {
          if (isNavigating) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isNavigating) e.preventDefault();
        }}
      >
        {isNavigating && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm font-medium text-foreground">Preparing workspace...</p>
            <p className="text-xs text-muted-foreground mt-1">This will just take a second.</p>
          </div>
        )}

        <DialogHeader>
          <DialogTitle>
            {editTemplate ? "Edit Invoice Template" : "Create Invoice Template"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              placeholder="e.g. Standard PDA Template"
            />
          </div>

          {/* Document Indexing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Document Indexing</Label>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                Preview:
                <span className="font-mono font-medium text-foreground bg-muted border px-1.5 py-0.5 rounded shadow-sm">
                  {livePreview}
                </span>
              </div>
            </div>

            {/* ── PILL BAR ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-1 p-1.5 bg-muted/30 border rounded-md min-h-10">
              {/* FIXED: Prefix */}
              <Input
                value={prefix}
                onChange={(e) => {
                  setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""));
                  setIsPrefixDirty(true);
                }}
                className="h-7 w-[60px] px-2 text-xs font-mono uppercase bg-background border shadow-sm focus-visible:ring-1 rounded-md"
                placeholder="INV"
              />

              {/* Optional blocks */}
              {dynamicBlocks.map((block, index) => (
                <div key={index} className="flex items-center gap-1">
                  <span className="text-muted-foreground/40 font-mono text-xs select-none">-</span>

                  {block.type === "text" ? (
                    <div className="relative group">
                      <Input
                        value={block.value}
                        onChange={(e) => updateTextValue(index, e.target.value)}
                        placeholder="TEXT"
                        className="h-7 w-[60px] px-2 text-xs font-mono uppercase bg-background border shadow-sm focus-visible:ring-1 rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => removeBlock(index)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative group">
                      <Select
                        value={block.format}
                        onValueChange={(v) => updateBlockFormat(index, v)}
                      >
                        <SelectTrigger className="h-7 px-2 text-xs font-mono bg-background border shadow-sm w-auto gap-1 focus:ring-1 rounded-md">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {block.type === "year" ? (
                            <>
                              <SelectItem value="YYYY" className="font-mono text-xs">
                                YYYY
                              </SelectItem>
                              <SelectItem value="YY" className="font-mono text-xs">
                                YY
                              </SelectItem>
                            </>
                          ) : block.type === "month" ? (
                            <>
                              <SelectItem value="MM" className="font-mono text-xs">
                                MM
                              </SelectItem>
                              <SelectItem value="MMM" className="font-mono text-xs">
                                MMM
                              </SelectItem>
                            </>
                          ) : (
                            <SelectItem value="DD" className="font-mono text-xs">
                              DD
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => removeBlock(index)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* ── + Add button ──────────────────────────────────────── */}
              <span className="text-muted-foreground/40 font-mono text-xs select-none">-</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-dashed rounded-md transition-colors flex items-center gap-1 font-mono"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Date
                  </DropdownMenuLabel>
                  {!usedSingleTypes.has("year") && (
                    <DropdownMenuItem onClick={() => addBlock("year")} className="text-xs">
                      Year
                    </DropdownMenuItem>
                  )}
                  {!usedSingleTypes.has("month") && (
                    <DropdownMenuItem onClick={() => addBlock("month")} className="text-xs">
                      Month
                    </DropdownMenuItem>
                  )}
                  {!usedSingleTypes.has("day") && (
                    <DropdownMenuItem onClick={() => addBlock("day")} className="text-xs">
                      Day
                    </DropdownMenuItem>
                  )}
                  {usedSingleTypes.has("year") &&
                    usedSingleTypes.has("month") &&
                    usedSingleTypes.has("day") && (
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground italic">
                        All date blocks used
                      </DropdownMenuItem>
                    )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Other
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => addBlock("text")} className="text-xs">
                    Text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* ── FIXED: Digits (sequence padding) ─────────────────── */}
              <span className="text-muted-foreground/40 font-mono text-xs select-none">-</span>
              <Select value={digits} onValueChange={(v) => setDigits(v as "2" | "3" | "4")}>
                <SelectTrigger className="h-7 px-2 text-xs font-mono bg-background border shadow-sm w-auto gap-1 focus:ring-1 rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2" className="font-mono text-xs">
                    2 digits
                  </SelectItem>
                  <SelectItem value="3" className="font-mono text-xs">
                    3 digits
                  </SelectItem>
                  <SelectItem value="4" className="font-mono text-xs">
                    4 digits
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* ── END PILL BAR ─────────────────────────────────────────── */}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Used for port disbursement accounts"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
