"use client";

import { format, isValid } from "date-fns";
import { ChevronLeft, ChevronRight, Folder, HardDrive } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ListView } from "./list-view";

interface ExplorerViewProps {
  projects: any[];
  groupByKey: string;
  customFields: any[];
  onEdit?: (project: any) => void;
  onDelete?: (project: any) => void;
  onView?: (project: any) => void;
  onArchiveToggle?: (project: any) => void;
  onViewClient?: (client: any) => void;
  showArchivedAt?: boolean;
  isArchivedView?: boolean;
  visibleColumns?: string[];
  hiddenColumns?: Record<string, boolean>;
  allStatuses?: any[];
  workflowsEnabled?: boolean;
}

export function ExplorerView({
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
  visibleColumns,
  hiddenColumns = {},
  allStatuses = [],
  workflowsEnabled = false,
}: ExplorerViewProps) {
  // Navigation path: [] = Root (Years), ["2026"] = Year, ["2026", "July"] = Month
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Group data by Year -> Month
  const groupedData = useMemo(() => {
    const tree: Record<string, Record<string, any[]>> = {};

    projects?.forEach((project) => {
      let targetDateStr = project.createdAt;
      if (groupByKey !== "createdAt") {
        const val = project.customFields?.[groupByKey];
        if (val) targetDateStr = val;
      }

      let dateObj = new Date(targetDateStr);
      if (!isValid(dateObj)) {
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

  const sortedYears = useMemo(() => {
    return Object.keys(groupedData).sort((a, b) => Number(b) - Number(a));
  }, [groupedData]);

  const activeYear = currentPath[0] || null;
  const activeMonth = currentPath[1] || null;

  const navigateTo = (path: string[]) => {
    setCurrentPath(path);
    setSelectedItem(null);
  };

  const goUpOneLevel = () => {
    if (currentPath.length > 0) {
      navigateTo(currentPath.slice(0, currentPath.length - 1));
    }
  };

  // Helper for mobile single click vs desktop double click
  const handleFolderClick = (itemKey: string, nextPath: string[]) => {
    setSelectedItem(itemKey);
    // On mobile screens (< 768px), single click opens folder immediately
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      navigateTo(nextPath);
    }
  };

  const handleFolderDoubleClick = (nextPath: string[]) => {
    navigateTo(nextPath);
  };

  // Filter projects for the currently selected Month
  const currentMonthProjects = useMemo(() => {
    if (!activeYear || !activeMonth) return [];
    return groupedData[activeYear]?.[activeMonth] || [];
  }, [groupedData, activeYear, activeMonth]);

  return (
    <div className="space-y-4 rounded-md border bg-card p-4">
      {/* Windows File Explorer Header Address / Breadcrumb Bar */}
      <div className="flex items-center gap-2 p-2 bg-muted/40 border rounded-md overflow-x-auto text-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={goUpOneLevel}
          disabled={currentPath.length === 0}
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          title="Up one level"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 flex-1 min-w-0 font-medium text-muted-foreground truncate">
          <button
            onClick={() => navigateTo([])}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors",
              currentPath.length === 0 && "text-foreground font-semibold bg-muted/60",
            )}
          >
            <HardDrive className="h-4 w-4 text-primary" />
            <span>Files</span>
          </button>

          {activeYear && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              <button
                onClick={() => navigateTo([activeYear])}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors truncate",
                  currentPath.length === 1 && "text-foreground font-semibold bg-muted/60",
                )}
              >
                <Folder className="h-4 w-4 text-blue-500 fill-blue-500/20 shrink-0" />
                <span>{activeYear}</span>
              </button>
            </>
          )}

          {activeMonth && (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              <button
                onClick={() => navigateTo([activeYear!, activeMonth])}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors truncate",
                  currentPath.length === 2 && "text-foreground font-semibold bg-muted/60",
                )}
              >
                <Folder className="h-4 w-4 text-accent-foreground fill-amber-500/20 shrink-0" />
                <span>{activeMonth}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* DIRECTORY CONTENT PANELS */}

      {/* LEVEL 0: ROOT / YEARS VIEW */}
      {currentPath.length === 0 && (
        <div>
          {sortedYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
              <Folder className="h-10 w-10 mb-2 opacity-40" />
              <p>No files or folders found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {sortedYears.map((year) => {
                const yearFileCount = Object.values(groupedData[year]).flat().length;
                const isSelected = selectedItem === `year-${year}`;

                return (
                  <div
                    key={`explorer-year-${year}`}
                    onClick={() => handleFolderClick(`year-${year}`, [year])}
                    onDoubleClick={() => handleFolderDoubleClick([year])}
                    className={cn(
                      "group flex flex-col items-center justify-center p-4 rounded-xl border bg-background hover:bg-accent/40 cursor-pointer select-none transition-all duration-150 text-center shadow-xs",
                      isSelected &&
                        "border-primary bg-primary/10 dark:bg-primary/20 ring-2 ring-primary/30",
                    )}
                  >
                    <div className="relative mb-2">
                      <Folder className="h-16 w-16 text-blue-500 fill-blue-500/20 group-hover:scale-105 transition-transform" />
                    </div>
                    <span className="font-semibold text-sm truncate max-w-full text-foreground">
                      {year}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {yearFileCount} {yearFileCount === 1 ? "file" : "files"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LEVEL 1: YEAR SELECTED / MONTHS VIEW */}
      {currentPath.length === 1 && activeYear && (
        <div>
          {Object.keys(groupedData[activeYear] || {}).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
              <Folder className="h-10 w-10 mb-2 opacity-40" />
              <p>No month folders found in {activeYear}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Object.keys(groupedData[activeYear])
                .sort()
                .map((month) => {
                  const monthFileCount = groupedData[activeYear][month].length;
                  const isSelected = selectedItem === `month-${month}`;

                  return (
                    <div
                      key={`explorer-month-${month}`}
                      onClick={() => handleFolderClick(`month-${month}`, [activeYear, month])}
                      onDoubleClick={() => handleFolderDoubleClick([activeYear, month])}
                      className={cn(
                        "group flex flex-col items-center justify-center p-4 rounded-xl border bg-background hover:bg-accent/40 cursor-pointer select-none transition-all duration-150 text-center shadow-xs",
                        isSelected &&
                          "border-amber-500 bg-accent/10 dark:bg-accent/20 ring-2 ring-amber-500/30",
                      )}
                    >
                      <div className="relative mb-2">
                        <Folder className="h-16 w-16 text-accent-foreground fill-amber-500/20 group-hover:scale-105 transition-transform" />
                      </div>
                      <span className="font-semibold text-sm truncate max-w-full text-foreground">
                        {month}
                      </span>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {monthFileCount} {monthFileCount === 1 ? "file" : "files"}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* LEVEL 2: MONTH SELECTED / FILES LIST VIEW */}
      {currentPath.length === 2 && activeYear && activeMonth && (
        <div className="space-y-2">
          <ListView
            projects={currentMonthProjects}
            customFields={customFields}
            isLoading={false}
            onEdit={onEdit}
            onDelete={onDelete}
            onView={onView}
            onArchiveToggle={onArchiveToggle}
            onViewClient={onViewClient}
            showArchivedAt={showArchivedAt}
            isArchivedView={isArchivedView}
            visibleColumns={visibleColumns}
            hiddenColumns={hiddenColumns}
            allStatuses={allStatuses}
            workflowsEnabled={workflowsEnabled}
          />
        </div>
      )}
    </div>
  );
}
