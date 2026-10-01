"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, Lock, Shield, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { AddCustomFieldModal } from "./add-custom-field-modal";

type CustomFieldDefinition = {
  id: string;
  entityType: "client" | "project" | "staff";
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  isRequired: boolean;
  options: string[] | null;
  isSeeded: boolean;
  isSystem?: boolean;
  isDetailed?: boolean;
  isSensitive?: boolean;
  isPrivate?: boolean;
};

export function CustomFieldsDataTable({
  fields,
  isLoading,
  detailedFields,
  sensitiveFields,
  privateFields,
  onToggleDetailed,
  onToggleSensitive,
  onTogglePrivate,
}: {
  fields: CustomFieldDefinition[];
  isLoading: boolean;
  detailedFields?: string[];
  sensitiveFields?: string[];
  privateFields?: string[];
  onToggleDetailed?: (id: string, isSystem: boolean) => void;
  onToggleSensitive?: (id: string, isSystem: boolean) => void;
  onTogglePrivate?: (id: string, isSystem: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const extractors = useMemo(() => {
    return {
      name: (f: CustomFieldDefinition) => f.fieldName,
      entity: (f: CustomFieldDefinition) => f.entityType,
      type: (f: CustomFieldDefinition) => f.fieldType.replace("_", " "),
      required: (f: CustomFieldDefinition) => (f.isRequired ? "Required" : "Optional"),
    };
  }, []);

  const filteredFields = useMemo(() => {
    return filterRows(fields || [], extractors);
  }, [fields, filterRows, extractors]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete field");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Custom field deleted");
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
    },
    onError: (error) => {
      toast.error(error.message);
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
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <FilterableTableHeader
              columnKey="name"
              title="Field Name"
              isFiltered={isColumnFiltered("name")}
              activeValue={filters.name}
              onClear={() => clearColumnFilter("name")}
            />
            <FilterableTableHeader
              columnKey="entity"
              title="Entity"
              isFiltered={isColumnFiltered("entity")}
              activeValue={filters.entity}
              onClear={() => clearColumnFilter("entity")}
            />
            <FilterableTableHeader
              columnKey="type"
              title="Type"
              isFiltered={isColumnFiltered("type")}
              activeValue={filters.type}
              onClear={() => clearColumnFilter("type")}
            />
            <FilterableTableHeader
              columnKey="required"
              title="Required"
              isFiltered={isColumnFiltered("required")}
              activeValue={filters.required}
              onClear={() => clearColumnFilter("required")}
            />
            <TableCell className="font-medium text-[15px] text-muted-foreground">
              Detailed
            </TableCell>
            <TableCell className="font-medium text-[15px] text-muted-foreground">
              Sensitive
            </TableCell>
            <TableCell className="font-medium text-[15px] text-muted-foreground">
              Private (Owner Only)
            </TableCell>
            <TableCell className="font-medium text-[15px] text-right text-muted-foreground">
              Actions
            </TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredFields.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No custom fields found matching current filters.
              </TableCell>
            </TableRow>
          ) : (
            filteredFields.map((field) => {
              const isDetailed =
                field.isSystem && detailedFields
                  ? detailedFields.includes(field.id)
                  : !!field.isDetailed;
              const isSensitive =
                field.isSystem && sensitiveFields
                  ? sensitiveFields.includes(field.id)
                  : !!field.isSensitive;
              const isPrivate =
                field.isSystem && privateFields
                  ? privateFields.includes(field.id)
                  : !!field.isPrivate;
              return (
                <TableRow key={field.id} className="hover:bg-muted/30 transition-colors">
                  <FilterableTableCell
                    columnKey="name"
                    value={field.fieldName}
                    isFiltered={isColumnFiltered("name")}
                    onToggleFilter={toggleFilter}
                  >
                    <div className="flex items-center gap-2">
                      {field.isSystem ? (
                        <Shield className="h-4 w-4 text-primary" />
                      ) : field.isSeeded ? (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      ) : null}
                      <span>{field.fieldName}</span>
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px] uppercase ml-1 px-1.5 py-0 h-5 items-center justify-center"
                      >
                        {field.fieldKey}
                      </Badge>
                    </div>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="entity"
                    value={field.entityType}
                    isFiltered={isColumnFiltered("entity")}
                    onToggleFilter={toggleFilter}
                  >
                    <Badge variant="outline" className="capitalize text-sm">
                      {field.entityType}
                    </Badge>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="type"
                    value={field.fieldType.replace("_", " ")}
                    isFiltered={isColumnFiltered("type")}
                    onToggleFilter={toggleFilter}
                  >
                    <Badge variant="secondary" className="capitalize text-sm">
                      {field.fieldType.replace("_", " ")}
                    </Badge>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="required"
                    value={field.isRequired ? "Required" : "Optional"}
                    isFiltered={isColumnFiltered("required")}
                    onToggleFilter={toggleFilter}
                  >
                    {field.isRequired ? (
                      <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-200 text-sm">
                        Required
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-sm">
                        Optional
                      </Badge>
                    )}
                  </FilterableTableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {onToggleDetailed && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                          checked={isDetailed}
                          onChange={() => onToggleDetailed(field.id, !!field.isSystem)}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {onToggleSensitive && (
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-gray-300 text-red-500 focus:ring-red-500 cursor-pointer"
                          checked={isSensitive}
                          onChange={() => onToggleSensitive(field.id, !!field.isSystem)}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {(!field.isSystem || (field.isSystem && (field as any).isPrivatable)) &&
                      onTogglePrivate && (
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600 cursor-pointer"
                            checked={isPrivate}
                            onChange={() => onTogglePrivate(field.id, !!field.isSystem)}
                          />
                        </div>
                      )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {!field.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingField(field)}
                        >
                          <Edit className="h-5 w-5" />
                        </Button>
                      )}
                      {!field.isSystem && !field.isSeeded && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-red-600"
                          onClick={() => {
                            if (
                              confirm(
                                `Are you sure you want to delete the field "${field.fieldName}"?`,
                              )
                            ) {
                              deleteMutation.mutate(field.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {editingField && (
        <AddCustomFieldModal
          isOpen={!!editingField}
          onClose={() => setEditingField(null)}
          defaultEntity={editingField.entityType}
          editField={editingField}
        />
      )}
    </div>
  );
}
