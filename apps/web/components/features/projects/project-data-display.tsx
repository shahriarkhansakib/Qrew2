"use client";

import { format } from "date-fns";
import Link from "next/link";
import { TooltipProvider } from "@/components/ui/tooltip";

interface ProjectDataDisplayProps {
  project: any;
  customFields: any[];
  status: any | null; // The currently selected status from the graph
}

export function ProjectDataDisplay({ project, customFields, status }: ProjectDataDisplayProps) {
  const getStatusFieldIds = (statusNode: any): Set<string> | null => {
    if (!statusNode) return null;
    const mappings: any[] = statusNode.statusFields || [];
    if (mappings.length === 0) return null;
    return new Set(mappings.map((m: any) => m.fieldId));
  };

  const renderFieldValue = (field: any) => {
    const val = project.customFields?.[field.fieldKey];
    if (val === undefined || val === null || val === "")
      return <span className="text-muted-foreground italic">Not set</span>;
    if (field.fieldType === "date") {
      try {
        return format(new Date(val), "MMM d, yyyy");
      } catch (_e) {
        return val;
      }
    }
    if (field.fieldType === "boolean") {
      return val ? "Yes" : "No";
    }
    return val;
  };

  const statusFieldIds = getStatusFieldIds(status);
  const formattedFileNo =
    project.fileSequenceNumber && project.createdAt
      ? `FILE-${format(new Date(project.createdAt), "MMyy")}${project.fileSequenceNumber.toString().padStart(2, "0")}`
      : "Not assigned";

  return (
    <div className="space-y-4">
      {/* System Fields styled like custom fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* File No */}
        <div className="border-b border-muted/50 pb-3 flex flex-col justify-center">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">
            File No
          </span>
          <span className="text-sm font-medium">{formattedFileNo}</span>
        </div>

        {/* File Name */}
        <div className="border-b border-muted/50 pb-3 flex flex-col justify-center">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">
            File Name
          </span>
          <span className="text-sm font-medium">{project.name}</span>
        </div>

        {/* Client */}
        <div className="border-b border-muted/50 pb-3 flex flex-col justify-center">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">
            Client
          </span>
          <Link
            href={`/clients/${project.clientId}`}
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            {project.client?.name}
          </Link>
        </div>

        {/* Custom Fields */}
        <TooltipProvider delayDuration={100}>
          {customFields?.map((field) => {
            const isLockedInStage = statusFieldIds !== null && !statusFieldIds.has(field.id);
            // Hide entirely if it's locked to keep the UI clean, or show as locked?
            // The previous design showed it as locked/dimmed. We will keep that for context,
            // but the user said "if no custom fields are given then no message should show".

            // Let's only render fields that are mapped to this stage, OR if no mapping exists, show all.
            if (isLockedInStage) return null;

            return (
              <div
                key={field.id}
                className="border-b border-muted/50 pb-3 flex flex-col justify-center"
              >
                <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  {field.fieldName}
                </span>
                <span className="text-sm font-medium">{renderFieldValue(field)}</span>
              </div>
            );
          })}
        </TooltipProvider>
      </div>
    </div>
  );
}
