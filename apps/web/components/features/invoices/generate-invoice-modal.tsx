"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { apiUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function GenerateInvoiceModal({
  isOpen,
  onClose,
  projectId: propProjectId,
  projectName: propProjectName,
  initialTemplateId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  initialTemplateId?: string;
}) {
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(propProjectId || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplateId || "");
  const [draftName, setDraftName] = useState<string>("");
  const [billingScope, setBillingScope] = useState<"lifetime" | "period">("lifetime");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (propProjectId) {
      setSelectedProjectId(propProjectId);
    }
  }, [propProjectId]);

  useEffect(() => {
    if (initialTemplateId) {
      setSelectedTemplateId(initialTemplateId);
    }
  }, [initialTemplateId]);

  // Fetch projects list if not already provided with a specific project
  const { data: projectsData, isLoading: isProjectsLoading } = useQuery({
    queryKey: ["projects", "active"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects?status=active`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: isOpen && !propProjectId,
  });

  const projects = Array.isArray(projectsData) ? projectsData : [];

  const { data: templates, isLoading } = useQuery({
    queryKey: ["invoice-templates"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoice-templates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: isOpen,
  });

  // Auto-select template if only one exists and none was pre-selected
  useEffect(() => {
    if (!selectedTemplateId && templates && templates.length === 1) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  // Auto-select project if only one exists and none was passed
  useEffect(() => {
    if (!propProjectId && !selectedProjectId && projects.length === 1) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, propProjectId, selectedProjectId]);

  // Set default draft name based on selected template and project name
  useEffect(() => {
    const activeProject = propProjectId
      ? { name: propProjectName }
      : projects.find((p: any) => p.id === selectedProjectId);
    const activeTemplate = templates?.find((t: any) => t.id === selectedTemplateId);

    if (activeTemplate) {
      const baseProject = activeProject?.name ? `${activeProject.name} - ` : "";
      setDraftName(`${baseProject}${activeTemplate.name}`);
    }
  }, [selectedTemplateId, selectedProjectId, propProjectId, propProjectName, projects, templates]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const targetProjectId = propProjectId || selectedProjectId;
      if (!targetProjectId) throw new Error("Please select a file / project");
      if (!selectedTemplateId) throw new Error("Please select an invoice template");

      const draftHeaderValues: Record<string, string> = {};
      if (billingScope === "period") {
        if (!periodStart || !periodEnd) {
          throw new Error("Please specify both start and end dates for period billing");
        }
        if (new Date(periodStart) > new Date(periodEnd)) {
          throw new Error("Period start date cannot be after end date");
        }
        draftHeaderValues.PERIOD_START = periodStart;
        draftHeaderValues.PERIOD_END = new Date(`${periodEnd}T23:59:59.999Z`).toISOString();
      }

      const res = await fetch(`${apiUrl}/api/invoices/drafts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: targetProjectId,
          sourceTemplateId: selectedTemplateId,
          name: draftName.trim() || undefined,
          draftHeaderValues:
            Object.keys(draftHeaderValues).length > 0 ? draftHeaderValues : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const error = new Error(data.error || "Failed to generate draft");
        (error as any).details = data.details;
        (error as any).stackTrace = data.stack;
        throw error;
      }
      return res.json();
    },
    onSuccess: (data) => {
      setIsNavigating(true);
      toast.success("Draft created — opening...");
      router.push(`/dashboard/invoices/drafts/${data.id}`);
    },
    onError: (error: any) => {
      toast.error(error.message + (error.details ? ` - ${error.details}` : ""));
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isNavigating && onClose()}>
      <DialogContent
        className="sm:max-w-[480px]"
        onInteractOutside={(e) => isNavigating && e.preventDefault()}
      >
        {isNavigating ? (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Opening draft editor...</p>
            <p className="text-xs text-muted-foreground">Loading invoice template and file data</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Invoice</DialogTitle>
              <DialogDescription>
                Create a dynamic invoice draft for this project.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* File / Project Selection (when not pre-scoped to a specific project) */}
              {!propProjectId && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-foreground">File / Project</Label>
                  {isProjectsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading files...
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="text-sm text-destructive">
                      No active files found. Please create a file / project first.
                    </div>
                  ) : (
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a file / project to bill" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.name}</span>
                              {p.client?.name && (
                                <span className="text-xs text-muted-foreground">
                                  ({p.client.name})
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Template Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Invoice Template</Label>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading templates...
                  </div>
                ) : templates?.length === 0 ? (
                  <div className="text-sm text-destructive">
                    No invoice templates found. Please create one first in Settings.
                  </div>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Draft Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Draft Name</Label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Milestone 1 - Oct 2026"
                  className="h-9 text-sm"
                />
              </div>

              {/* Expense Timeline Scope */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground">Expense Scope</Label>
                  <span className="text-[11px] text-muted-foreground">Optional date filtering</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Default: Full Project Lifetime */}
                  <button
                    type="button"
                    onClick={() => setBillingScope("lifetime")}
                    className={cn(
                      "flex flex-col text-left p-3 rounded-lg border transition-all relative",
                      billingScope === "lifetime"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        Full Timeline
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1 py-0 h-4 uppercase font-semibold text-primary bg-primary/10"
                      >
                        Default
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      All recorded expenses across the full project lifetime with dynamic live sync.
                    </p>
                  </button>

                  {/* Optional: Specific Date Range */}
                  <button
                    type="button"
                    onClick={() => setBillingScope("period")}
                    className={cn(
                      "flex flex-col text-left p-3 rounded-lg border transition-all relative",
                      billingScope === "period"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        Date Range
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 h-4 text-muted-foreground"
                      >
                        Optional
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Filter expenses to a specific billing window (e.g. monthly retainer).
                    </p>
                  </button>
                </div>

                {/* Conditional Date Pickers for Period Scope */}
                {billingScope === "period" && (
                  <div className="grid grid-cols-2 gap-2.5 pt-2 p-3 bg-muted/30 rounded-lg border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-medium">
                        Period Start
                      </Label>
                      <Input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-medium">
                        Period End
                      </Label>
                      <Input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose} disabled={generateMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={!selectedTemplateId || generateMutation.isPending}
                  className="gap-2"
                >
                  {generateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {generateMutation.isPending ? "Generating..." : "Generate Draft"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
