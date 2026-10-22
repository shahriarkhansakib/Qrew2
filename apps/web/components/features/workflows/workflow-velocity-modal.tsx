"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileStack,
  Gauge,
  GitCommit,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiUrl } from "@/lib/constants";

interface StageMetric {
  statusId: string;
  statusName: string;
  color?: string;
  isTerminal: boolean;
  activeFilesCount: number;
  transitionCount: number;
  avgDurationSeconds: number;
  formattedAvgDuration: string;
  isBottleneck: boolean;
}

interface WorkflowVelocityData {
  stageMetrics: StageMetric[];
  totalActiveFiles: number;
  totalTransitions: number;
  bottleneckStage: StageMetric | null;
}

interface WorkflowVelocityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkflowVelocityModal({ isOpen, onClose }: WorkflowVelocityModalProps) {
  const { data, isLoading, isRefetching, refetch } = useQuery<WorkflowVelocityData>({
    queryKey: ["workflow-velocity-analytics"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/analytics/workflow-velocity`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch workflow velocity analytics");
      return res.json();
    },
    enabled: isOpen,
    staleTime: 1000 * 30, // 30s cache
  });

  const stageMetrics = data?.stageMetrics || [];
  const totalActiveFiles = data?.totalActiveFiles || 0;
  const totalTransitions = data?.totalTransitions || 0;
  const bottleneckStage = data?.bottleneckStage || null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                Workflow Velocity &amp; Analytics
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stage distribution, transition throughput, and auto-detected workflow bottlenecks.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-medium">
              Computing workflow metrics...
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6 py-5">
            <div className="space-y-6">
              {/* Top KPI Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Active Files in Pipeline */}
                <div className="p-4 rounded-xl border bg-card/60 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Active In Pipeline
                    </span>
                    <FileStack className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-3xl font-bold tracking-tight">{totalActiveFiles}</div>
                  <p className="text-xs text-muted-foreground">
                    Files currently progressing across active stages
                  </p>
                </div>

                {/* 2. Total Transitions */}
                <div className="p-4 rounded-xl border bg-card/60 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Transitions Processed
                    </span>
                    <GitCommit className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-3xl font-bold tracking-tight">{totalTransitions}</div>
                  <p className="text-xs text-muted-foreground">
                    Recorded stage advancements in the audit ledger
                  </p>
                </div>

                {/* 3. Bottleneck Stage */}
                <div
                  className={`p-4 rounded-xl border shadow-2xs space-y-2 ${
                    bottleneckStage
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-emerald-500/10 border-emerald-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Workflow Bottleneck
                    </span>
                    {bottleneckStage ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  {bottleneckStage ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: bottleneckStage.color || "#f59e0b" }}
                        />
                        <span className="text-lg font-bold truncate">
                          {bottleneckStage.statusName}
                        </span>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Longest dwell time: avg {bottleneckStage.formattedAvgDuration} per file
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        Optimal Flow
                      </div>
                      <p className="text-xs text-muted-foreground">
                        No critical bottlenecks identified across stages
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Stage Performance & Distribution Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
                    Stage Velocity &amp; Distribution Breakdown
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {stageMetrics.length} total stages
                  </span>
                </div>

                <div className="rounded-xl border bg-card overflow-hidden">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs font-semibold text-muted-foreground">
                        <th className="py-3 px-4">Stage Name</th>
                        <th className="py-3 px-4">Active Files</th>
                        <th className="py-3 px-4">Distribution</th>
                        <th className="py-3 px-4">Throughput</th>
                        <th className="py-3 px-4">Avg Dwell Time</th>
                        <th className="py-3 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {stageMetrics.map((stage) => {
                        const percentage =
                          totalActiveFiles > 0
                            ? Math.round((stage.activeFilesCount / totalActiveFiles) * 100)
                            : 0;

                        return (
                          <tr
                            key={stage.statusId}
                            className={`hover:bg-muted/30 transition-colors ${
                              stage.isBottleneck ? "bg-amber-500/5" : ""
                            }`}
                          >
                            {/* Stage Name */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: stage.color || "#94a3b8" }}
                                />
                                <span className="font-semibold">{stage.statusName}</span>
                                {stage.isTerminal && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                    Terminal
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Active Files Count */}
                            <td className="py-3 px-4 font-mono font-medium">
                              {stage.activeFilesCount}
                            </td>

                            {/* Pipeline Distribution Bar */}
                            <td className="py-3 px-4 min-w-[140px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: stage.color || "#3b82f6",
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right font-mono">
                                  {percentage}%
                                </span>
                              </div>
                            </td>

                            {/* Throughput */}
                            <td className="py-3 px-4 font-mono text-muted-foreground">
                              {stage.transitionCount} moves
                            </td>

                            {/* Avg Dwell Time */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-medium">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span
                                  className={
                                    stage.isBottleneck
                                      ? "text-amber-600 dark:text-amber-400 font-bold"
                                      : "text-foreground"
                                  }
                                >
                                  {stage.transitionCount > 0
                                    ? stage.formattedAvgDuration
                                    : "No data"}
                                </span>
                              </div>
                            </td>

                            {/* Flow Status Badge */}
                            <td className="py-3 px-4 text-right">
                              {stage.isBottleneck ? (
                                <Badge
                                  variant="default"
                                  className="bg-amber-500 text-white dark:bg-amber-600 gap-1 text-[11px]"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Bottleneck
                                </Badge>
                              ) : stage.isTerminal ? (
                                <Badge variant="secondary" className="text-[11px]">
                                  Finished
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] text-muted-foreground"
                                >
                                  Normal Flow
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
