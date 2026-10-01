"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Edit, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { apiUrl } from "@/lib/constants";
import { AddEditOrgConfigModal } from "./add-edit-org-config-modal";

export function OrgConfigsDataTable({
  configs,
  isLoading,
}: {
  configs: any[];
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<any | null>(null);

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const extractors = useMemo(() => {
    return {
      label: (c: any) => c.displayLabel,
      token: (c: any) => c.displayKey || c.configKey.replace(/^(GBL_|ORG_)/, ""),
      type: (c: any) => c.valueType.replace("_", " "),
      value: (c: any) =>
        c.valueType === "percentage" && !Number.isNaN(parseFloat(c.configValue))
          ? `${parseFloat(c.configValue) * 100}%`
          : c.configValue,
      injectable: (c: any) => (c.isFormulaInjectable ? "Formula Injectable" : "No"),
    };
  }, []);

  const filteredConfigs = useMemo(() => {
    return filterRows(configs || [], extractors);
  }, [configs, filterRows, extractors]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/org-configs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete config");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Config deleted");
      setConfigToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["org-configs"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
      setConfigToDelete(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:hidden">
        {filteredConfigs.map((config) => (
          <div key={config.id} className="border rounded-md bg-card p-3 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{config.displayLabel}</h3>
                  {config.isFormulaInjectable && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0.5 rounded-sm leading-none h-5 border flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 text-green-500" />
                      Formula Injectable
                    </Badge>
                  )}
                </div>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-1 block w-fit text-muted-foreground font-medium">
                  {config.displayKey || config.configKey.replace(/^(GBL_|ORG_)/, "")}
                </code>
              </div>
              <div className="flex -mt-1 -mr-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditingConfig(config);
                    setIsEditModalOpen(true);
                  }}
                >
                  <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setConfigToDelete(config)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between bg-muted/30 border border-muted p-3 rounded-md mt-2">
              <Badge variant="outline" className="text-xs capitalize font-medium">
                {config.valueType.replace("_", " ")}
              </Badge>
              <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                {config.valueType === "percentage" && !Number.isNaN(parseFloat(config.configValue))
                  ? `${parseFloat(config.configValue) * 100}%`
                  : config.configValue}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <FilterableTableHeader
                columnKey="label"
                title="Label"
                isFiltered={isColumnFiltered("label")}
                activeValue={filters.label}
                onClear={() => clearColumnFilter("label")}
              />
              <FilterableTableHeader
                columnKey="token"
                title="Token (Key)"
                isFiltered={isColumnFiltered("token")}
                activeValue={filters.token}
                onClear={() => clearColumnFilter("token")}
              />
              <FilterableTableHeader
                columnKey="type"
                title="Type"
                isFiltered={isColumnFiltered("type")}
                activeValue={filters.type}
                onClear={() => clearColumnFilter("type")}
              />
              <FilterableTableHeader
                columnKey="value"
                title="Value"
                isFiltered={isColumnFiltered("value")}
                activeValue={filters.value}
                onClear={() => clearColumnFilter("value")}
              />
              <FilterableTableHeader
                columnKey="injectable"
                title="Formula Injectable"
                isFiltered={isColumnFiltered("injectable")}
                activeValue={filters.injectable}
                onClear={() => clearColumnFilter("injectable")}
              />
              <TableCell className="text-right font-medium text-muted-foreground">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredConfigs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No configurations found.
                </TableCell>
              </TableRow>
            ) : (
              filteredConfigs.map((config) => (
                <TableRow key={config.id} className="hover:bg-muted/30 transition-colors">
                  <FilterableTableCell
                    columnKey="label"
                    value={config.displayLabel}
                    isFiltered={isColumnFiltered("label")}
                    onToggleFilter={toggleFilter}
                  >
                    {config.displayLabel}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="token"
                    value={config.displayKey || config.configKey.replace(/^(GBL_|ORG_)/, "")}
                    isFiltered={isColumnFiltered("token")}
                    onToggleFilter={toggleFilter}
                  >
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {config.displayKey || config.configKey.replace(/^(GBL_|ORG_)/, "")}
                    </code>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="type"
                    value={config.valueType.replace("_", " ")}
                    isFiltered={isColumnFiltered("type")}
                    onToggleFilter={toggleFilter}
                  >
                    <Badge variant="outline" className="capitalize">
                      {config.valueType.replace("_", " ")}
                    </Badge>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="value"
                    value={
                      config.valueType === "percentage" &&
                      !Number.isNaN(parseFloat(config.configValue))
                        ? `${parseFloat(config.configValue) * 100}%`
                        : config.configValue
                    }
                    isFiltered={isColumnFiltered("value")}
                    onToggleFilter={toggleFilter}
                  >
                    {config.valueType === "percentage" &&
                    !Number.isNaN(parseFloat(config.configValue))
                      ? `${parseFloat(config.configValue) * 100}%`
                      : config.configValue}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="injectable"
                    value={config.isFormulaInjectable ? "Formula Injectable" : "No"}
                    isFiltered={isColumnFiltered("injectable")}
                    onToggleFilter={toggleFilter}
                  >
                    {config.isFormulaInjectable ? (
                      <Badge
                        variant="secondary"
                        className="text-xs px-2 py-0.5 rounded-sm border flex items-center gap-1 w-fit"
                      >
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        Formula Injectable
                      </Badge>
                    ) : (
                      "No"
                    )}
                  </FilterableTableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingConfig(config);
                          setIsEditModalOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setConfigToDelete(config)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddEditOrgConfigModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        editConfig={editingConfig}
      />

      <AlertDialog
        open={!!configToDelete}
        onOpenChange={(open) => !open && setConfigToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the config{" "}
              <span className="font-semibold text-foreground">
                "{configToDelete?.displayLabel}"
              </span>
              . If this variable is actively used in any invoice templates or math formulas,
              deletion will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate(configToDelete?.id);
              }}
              variant="destructive"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Configuration"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
