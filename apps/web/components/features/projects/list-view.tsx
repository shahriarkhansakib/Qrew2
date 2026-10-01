"use client";

import { format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Edit,
  FileText,
  Lock,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { Can } from "@/components/features/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";

interface ListViewProps {
  projects: any[];
  customFields: any[];
  isLoading: boolean;
  onEdit?: (project: any) => void;
  onDelete?: (project: any) => void;
  onView?: (project: any) => void;
  onArchiveToggle?: (project: any) => void;
  onViewClient?: (client: any) => void;
  showArchivedAt?: boolean;
  isArchivedView?: boolean;
  visibleColumns?: string[];
  hiddenColumns?: Record<string, boolean>;
  /** Full statuses list including transitions & statusFields — needed for workflow lock icons */
  allStatuses?: any[];
  workflowsEnabled?: boolean;
}

export function ListView({
  projects,
  customFields,
  isLoading,
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
}: ListViewProps) {
  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "files-dashboard",
  });

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num || 0);
  };

  const getVisibleFieldIds = (statusId: string): Set<string> | null => {
    if (!workflowsEnabled || !allStatuses.length) return null;
    const statusNode = allStatuses.find((s: any) => s.id === statusId);
    if (!statusNode) return null;
    const mappings: any[] = statusNode.statusFields || [];
    if (mappings.length === 0) return null;
    return new Set(mappings.map((m: any) => m.fieldId));
  };

  const showCol = (key: string, isCat1or2: boolean = false) => {
    if (hiddenColumns[key]) return false;
    if (isCat1or2 && visibleColumns) {
      return visibleColumns.includes(key);
    }
    return true;
  };

  const extractors = useMemo(() => {
    const map: Record<string, (p: any) => any> = {
      "sys-project-name": (p) => p.name,
      "sys-project-client": (p) => p.client?.name || "-",
      "sys-project-status": (p) => p.statusRelation?.name || "Pending",
      total_expenses: (p) => formatCurrency(p.totalExpenses),
      createdAt: (p) => format(new Date(p.createdAt), "MMM d, yyyy"),
      archivedAt: (p) => (p.archivedAt ? format(new Date(p.archivedAt), "MMM d, yyyy") : "-"),
    };
    customFields?.forEach((field: any) => {
      map[field.id] = (p) => {
        const val = p.customFields?.[field.fieldKey];
        if (val && field.fieldType === "date") {
          try {
            return format(new Date(val), "MMM d, yyyy");
          } catch (_e) {}
        }
        return val || "-";
      };
    });
    return map;
  }, [customFields, formatCurrency]);

  const displayProjects = useMemo(() => {
    return filterRows(projects || [], extractors);
  }, [projects, filterRows, extractors]);

  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {showCol("sys-project-name", true) && (
              <FilterableTableHeader
                columnKey="sys-project-name"
                title="Name"
                isFiltered={isColumnFiltered("sys-project-name")}
                activeValue={filters["sys-project-name"]}
                onClear={() => clearColumnFilter("sys-project-name")}
                width={columnWidths["sys-project-name"]}
                onResizeStart={handleResizeStart}
                onResetWidth={resetColumnWidth}
              />
            )}
            {showCol("sys-project-client", true) && (
              <FilterableTableHeader
                columnKey="sys-project-client"
                title="Client"
                isFiltered={isColumnFiltered("sys-project-client")}
                activeValue={filters["sys-project-client"]}
                onClear={() => clearColumnFilter("sys-project-client")}
                width={columnWidths["sys-project-client"]}
                onResizeStart={handleResizeStart}
                onResetWidth={resetColumnWidth}
              />
            )}
            {showCol("sys-project-status", true) && (
              <FilterableTableHeader
                columnKey="sys-project-status"
                title="Status"
                isFiltered={isColumnFiltered("sys-project-status")}
                activeValue={filters["sys-project-status"]}
                onClear={() => clearColumnFilter("sys-project-status")}
                width={columnWidths["sys-project-status"]}
                onResizeStart={handleResizeStart}
                onResetWidth={resetColumnWidth}
              />
            )}
            <Can I="finance:view_expenses">
              {showCol("total_expenses") && (
                <FilterableTableHeader
                  columnKey="total_expenses"
                  title="Total Expenses"
                  isFiltered={isColumnFiltered("total_expenses")}
                  activeValue={filters.total_expenses}
                  onClear={() => clearColumnFilter("total_expenses")}
                  width={columnWidths.total_expenses}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
            </Can>
            {showCol("createdAt") && (
              <FilterableTableHeader
                columnKey="createdAt"
                title="Created At"
                isFiltered={isColumnFiltered("createdAt")}
                activeValue={filters.createdAt}
                onClear={() => clearColumnFilter("createdAt")}
                width={columnWidths.createdAt}
                onResizeStart={handleResizeStart}
                onResetWidth={resetColumnWidth}
              />
            )}
            {showArchivedAt && showCol("archivedAt") && (
              <FilterableTableHeader
                columnKey="archivedAt"
                title="Archived At"
                isFiltered={isColumnFiltered("archivedAt")}
                activeValue={filters.archivedAt}
                onClear={() => clearColumnFilter("archivedAt")}
                width={columnWidths.archivedAt}
                onResizeStart={handleResizeStart}
                onResetWidth={resetColumnWidth}
              />
            )}
            {customFields?.map((field: any) =>
              showCol(field.id, true) ? (
                <FilterableTableHeader
                  key={field.id}
                  columnKey={field.id}
                  title={field.fieldName}
                  isFiltered={isColumnFiltered(field.id)}
                  activeValue={filters[field.id]}
                  onClear={() => clearColumnFilter(field.id)}
                  width={columnWidths[field.id]}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              ) : null,
            )}
            <TableCell className="w-[120px] text-right font-medium text-muted-foreground">
              Actions
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={20} className="h-24 text-center text-muted-foreground">
                Loading files...
              </TableCell>
            </TableRow>
          ) : displayProjects?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={20} className="h-24 text-center text-muted-foreground">
                No files found.
              </TableCell>
            </TableRow>
          ) : (
            displayProjects?.map((project: any) => (
              <TableRow key={project.id} className="hover:bg-muted/30 transition-colors">
                {showCol("sys-project-name", true) && (
                  <FilterableTableCell
                    columnKey="sys-project-name"
                    value={project.name}
                    isFiltered={isColumnFiltered("sys-project-name")}
                    onToggleFilter={toggleFilter}
                    onTextClick={() => onView?.(project)}
                    width={columnWidths["sys-project-name"]}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span>{project.name}</span>
                  </FilterableTableCell>
                )}
                {showCol("sys-project-client", true) && (
                  <FilterableTableCell
                    columnKey="sys-project-client"
                    value={project.client?.name || "-"}
                    isFiltered={isColumnFiltered("sys-project-client")}
                    onToggleFilter={toggleFilter}
                    onTextClick={project.client ? () => onViewClient?.(project.client) : undefined}
                    width={columnWidths["sys-project-client"]}
                  >
                    {project.client ? project.client.name : "-"}
                  </FilterableTableCell>
                )}
                {showCol("sys-project-status", true) && (
                  <FilterableTableCell
                    columnKey="sys-project-status"
                    value={project.statusRelation?.name || "Pending"}
                    isFiltered={isColumnFiltered("sys-project-status")}
                    onToggleFilter={toggleFilter}
                    width={columnWidths["sys-project-status"]}
                  >
                    {(() => {
                      const statusNode = allStatuses.find((s: any) => s.id === project.status);
                      const isTerminal =
                        !statusNode?.isInitial && statusNode?.transitions?.length === 0;
                      const isNegative =
                        isTerminal &&
                        statusNode?.name
                          ?.toLowerCase()
                          .match(/reject|cancel|fail|lost|declin|abort|close/);
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="capitalize">
                            {project.statusRelation?.name || "Pending"}
                          </Badge>
                          {isTerminal && (
                            <Badge
                              variant="outline"
                              className={
                                isNegative
                                  ? "text-destructive border-destructive/30 bg-destructive/8 text-[10px] px-1.5 py-0"
                                  : "text-primary border-primary/30 bg-primary/8 text-[10px] px-1.5 py-0"
                              }
                            >
                              {isNegative ? (
                                <>
                                  <XCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Closed
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                  Terminated
                                </>
                              )}
                            </Badge>
                          )}
                        </div>
                      );
                    })()}
                  </FilterableTableCell>
                )}
                <Can I="finance:view_expenses">
                  {showCol("total_expenses") && (
                    <FilterableTableCell
                      columnKey="total_expenses"
                      value={formatCurrency(project.totalExpenses)}
                      isFiltered={isColumnFiltered("total_expenses")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.total_expenses}
                    >
                      {formatCurrency(project.totalExpenses)}
                    </FilterableTableCell>
                  )}
                </Can>
                {showCol("createdAt") && (
                  <FilterableTableCell
                    columnKey="createdAt"
                    value={format(new Date(project.createdAt), "MMM d, yyyy")}
                    isFiltered={isColumnFiltered("createdAt")}
                    onToggleFilter={toggleFilter}
                    width={columnWidths.createdAt}
                  >
                    {format(new Date(project.createdAt), "MMM d, yyyy")}
                  </FilterableTableCell>
                )}
                {showArchivedAt && showCol("archivedAt") && (
                  <FilterableTableCell
                    columnKey="archivedAt"
                    value={
                      project.archivedAt ? format(new Date(project.archivedAt), "MMM d, yyyy") : "-"
                    }
                    isFiltered={isColumnFiltered("archivedAt")}
                    onToggleFilter={toggleFilter}
                    width={columnWidths.archivedAt}
                  >
                    {project.archivedAt ? format(new Date(project.archivedAt), "MMM d, yyyy") : "-"}
                  </FilterableTableCell>
                )}
                {customFields?.map((field: any) => {
                  if (!showCol(field.id, true)) return null;
                  const visibleFieldIds = getVisibleFieldIds(project.status);
                  const isLocked = visibleFieldIds !== null && !visibleFieldIds.has(field.id);

                  if (isLocked) {
                    return (
                      <TableCell key={field.id} className="text-muted-foreground/40">
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5">
                                <Lock className="h-3.5 w-3.5" />
                                <span className="text-xs italic">Not in stage</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              This field is not part of the file&apos;s current workflow stage.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    );
                  }

                  const val = project.customFields?.[field.fieldKey];
                  let displayVal = val || "-";

                  if (val && field.fieldType === "date") {
                    try {
                      displayVal = format(new Date(val), "MMM d, yyyy");
                    } catch (_e) {}
                  }

                  return (
                    <FilterableTableCell
                      key={field.id}
                      columnKey={field.id}
                      value={displayVal}
                      isFiltered={isColumnFiltered(field.id)}
                      onToggleFilter={toggleFilter}
                      width={columnWidths[field.id]}
                    >
                      {displayVal}
                    </FilterableTableCell>
                  );
                })}
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
