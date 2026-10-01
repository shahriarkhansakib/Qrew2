"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { WorkflowBuilder } from "@/components/features/workflows/workflow-builder";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/constants";

export default function WorkflowsPage() {
  const router = useRouter();

  const { data: statuses, isLoading: loadingStatuses } = useQuery({
    queryKey: ["project-statuses"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch project statuses");
      return res.json();
    },
  });

  const { data: customFields, isLoading: loadingFields } = useQuery({
    queryKey: ["custom-fields"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
  });

  const isLoading = loadingStatuses || loadingFields;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-6xl pb-10">
        <Skeleton className="h-10 w-64 mb-2" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-[480px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl pb-10">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
            <button
              onClick={() => router.push("/org-admin/customize-fields")}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Customize Fields
            </button>
            <span>/</span>
            <span className="text-foreground font-medium">Project Workflows</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Project Workflows</h1>
              <p className="text-[14px] text-muted-foreground mt-0.5">
                Configure the state machine for project files — define stages, transitions, and
                field gates.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Builder */}
      <WorkflowBuilder initialStatuses={statuses} customFields={customFields} disabled={false} />
    </div>
  );
}
