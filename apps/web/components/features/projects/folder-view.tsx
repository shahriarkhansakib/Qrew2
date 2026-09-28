"use client";

import { format, isValid } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Edit,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Can } from "@/components/features/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FolderViewProps {
  projects: any[];
  groupByKey: string; // 'createdAt' or custom field key e.g. 'arrival_date'
  customFields: any[];
  onEdit?: (project: any) => void;
  onDelete?: (project: any) => void;
  onView?: (project: any) => void;
  onArchiveToggle?: (project: any) => void;
  onViewClient?: (client: any) => void;
  showArchivedAt?: boolean;
  isArchivedView?: boolean;
}

export function FolderView({
  projects,
  groupByKey,
  customFields,
  onEdit,
  onDelete,
  onView,
  onArchiveToggle,
  onViewClient,
  showArchivedAt,
  isArchivedView,
}: FolderViewProps) {
  const _router = useRouter();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num || 0);
  };

  // Grouping logic
  const groupedData = useMemo(() => {
    const tree: Record<string, Record<string, any[]>> = {};

    projects?.forEach((project) => {
      let targetDateStr = project.createdAt; // fallback to created at

      if (groupByKey !== "createdAt") {
        const val = project.customFields?.[groupByKey];
        if (val) targetDateStr = val;
      }

      // Ensure valid date
      let dateObj = new Date(targetDateStr);
      if (!isValid(dateObj)) {
        // Fallback to createdAt if invalid
        dateObj = new Date(project.createdAt);
      }

      const year = format(dateObj, "yyyy");
      const month = format(dateObj, "MMMM");

      if (!tree[year]) tree[year] = {};
      if (!tree[year][month]) tree[year][month] = [];

      tree[year][month].push(project);
    });

    return tree;
  }, [projects, groupByKey]);

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border rounded-md border-dashed text-muted-foreground">
        <Folder className="h-10 w-10 mb-4 opacity-50" />
        <p>No files found.</p>
      </div>
    );
  }

  // Sort years desc, months natural
  const sortedYears = Object.keys(groupedData).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="space-y-4 rounded-md border bg-card p-4">
      {sortedYears.map((year) => (
        <div key={`year-${year}`} className="space-y-1">
          {/* YEAR FOLDER */}
          <div
            className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
            onClick={() => toggleFolder(`year-${year}`)}
          >
            {expandedFolders[`year-${year}`] ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {expandedFolders[`year-${year}`] ? (
              <FolderOpen className="h-5 w-5 text-blue-500 fill-blue-500/20" />
            ) : (
              <Folder className="h-5 w-5 text-blue-500 fill-blue-500/20" />
            )}
            <span className="font-semibold text-lg">{year}</span>
            <Badge variant="secondary" className="ml-2 bg-secondary/50 text-xs">
              {Object.values(groupedData[year]).flat().length} files
            </Badge>
          </div>

          {/* MONTHS */}
          {expandedFolders[`year-${year}`] && (
            <div className="pl-6 space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
              {Object.keys(groupedData[year])
                .sort()
                .map((month) => (
                  <div
                    key={`year-${year}-month-${month}`}
                    className="space-y-1 relative before:absolute before:left-3 before:top-0 before:bottom-0 before:w-px before:bg-border/50"
                  >
                    <div
                      className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors relative"
                      onClick={() => toggleFolder(`year-${year}-month-${month}`)}
                    >
                      <div className="absolute left-3 top-1/2 w-3 h-px bg-border/50 -translate-y-1/2" />
                      <div className="pl-6 flex items-center gap-2">
                        {expandedFolders[`year-${year}-month-${month}`] ? (
                          <FolderOpen className="h-4 w-4 text-accent-foreground fill-amber-500/20" />
                        ) : (
                          <Folder className="h-4 w-4 text-accent-foreground fill-amber-500/20" />
                        )}
                        <span className="font-medium text-muted-foreground">{month}</span>
                        <span className="text-xs text-muted-foreground/60">
                          ({groupedData[year][month].length})
                        </span>
                      </div>
                    </div>

                    {/* FILES */}
                    {expandedFolders[`year-${year}-month-${month}`] && (
                      <div className="pl-12 py-2">
                        <div className="border rounded-md overflow-hidden bg-background shadow-sm">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="w-[250px]">Name</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Total Expenses</TableHead>
                                <TableHead>Created At</TableHead>
                                {showArchivedAt && <TableHead>Archived At</TableHead>}
                                {customFields?.map((field: any) => (
                                  <TableHead key={field.id}>{field.fieldName}</TableHead>
                                ))}
                                <TableHead className="w-[120px] text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupedData[year][month].map((project) => (
                                <TableRow
                                  key={project.id}
                                  className="hover:bg-muted/50 transition-colors cursor-pointer group"
                                  onClick={() => onView?.(project)}
                                >
                                  <TableCell className="font-medium text-primary hover:underline">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      {project.name}
                                    </div>
                                  </TableCell>
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    {project.client ? (
                                      <span
                                        className="cursor-pointer hover:underline text-primary"
                                        onClick={() => onViewClient?.(project.client)}
                                      >
                                        {project.client.name}
                                      </span>
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="capitalize">
                                      {project.statusRelation?.name || "Pending"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {formatCurrency(project.totalExpenses)}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {format(new Date(project.createdAt), "MMM d, yyyy")}
                                  </TableCell>
                                  {showArchivedAt && (
                                    <TableCell className="text-muted-foreground">
                                      {project.archivedAt
                                        ? format(new Date(project.archivedAt), "MMM d, yyyy")
                                        : "-"}
                                    </TableCell>
                                  )}
                                  {customFields?.map((field: any) => {
                                    const val = project.customFields?.[field.fieldKey];
                                    let displayVal = val || "-";
                                    if (val && field.fieldType === "date") {
                                      try {
                                        displayVal = format(new Date(val), "MMM d, yyyy");
                                      } catch (_e) {}
                                    }
                                    return <TableCell key={field.id}>{displayVal}</TableCell>;
                                  })}
                                  <TableCell
                                    className="text-right"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-end gap-2">
                                      {!isArchivedView ? (
                                        <>
                                          <Can I="projects:edit">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit?.(project);
                                              }}
                                              title="Edit File"
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                          </Can>
                                          <Can I="projects:edit">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-muted-foreground hover:text-orange-500"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onArchiveToggle?.(project);
                                              }}
                                              title="Archive File"
                                            >
                                              <Archive className="h-4 w-4" />
                                            </Button>
                                          </Can>
                                        </>
                                      ) : (
                                        <>
                                          <Can I="projects:edit">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-muted-foreground hover:text-green-500"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onArchiveToggle?.(project);
                                              }}
                                              title="Unarchive File"
                                            >
                                              <ArchiveRestore className="h-4 w-4" />
                                            </Button>
                                          </Can>
                                          <Can I="projects:delete">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete?.(project);
                                              }}
                                              title="Permanently Delete File"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </Can>
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
