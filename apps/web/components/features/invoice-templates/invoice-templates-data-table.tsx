"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Edit, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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

export function InvoiceTemplatesDataTable({
  templates,
  isLoading,
  onEdit,
}: {
  templates: any[];
  isLoading: boolean;
  onEdit?: (template: any) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [templateToDelete, setTemplateToDelete] = useState<any | null>(null);

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const getIndexPreview = (template: any) => {
    const now = new Date();
    const YYYY = now.getFullYear().toString();
    const YY = YYYY.slice(-2);
    const MM = (now.getMonth() + 1).toString().padStart(2, "0");
    const MMM = [
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
    ][now.getMonth()];
    const DD = now.getDate().toString().padStart(2, "0");

    let docNumber = (template.numberingFormat || "{PREFIX}-{YYYY}-{SEQ:4}")
      .replace(/\{PREFIX\}/g, template.documentPrefix || "INV")
      .replace(/\{YYYY\}/g, YYYY)
      .replace(/\{YY\}/g, YY)
      .replace(/\{MM\}/g, MM)
      .replace(/\{MMM\}/g, MMM)
      .replace(/\{DD\}/g, DD);

    docNumber = docNumber.replace(/\{SEQ(?::(\d+))?\}/g, (_: string, pad?: string) => {
      const width = pad ? parseInt(pad, 10) : 4;
      return (template.nextSequence || 1).toString().padStart(width, "0");
    });

    return docNumber;
  };

  const extractors = useMemo(() => {
    return {
      name: (t: any) => t.name,
      description: (t: any) => t.description || "-",
      documentIndexing: (t: any) => getIndexPreview(t),
      updatedAt: (t: any) => format(new Date(t.updatedAt), "MMM d, yyyy"),
    };
  }, [getIndexPreview]);

  const filteredTemplates = useMemo(() => {
    return filterRows(templates || [], extractors);
  }, [templates, filterRows, extractors]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/invoice-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete template");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Template deleted");
      setTemplateToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["invoice-templates"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
      setTemplateToDelete(null);
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
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="border rounded-md bg-card p-3 flex flex-col gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/org-admin/invoice-templates/${template.id}`)}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg">{template.name}</h3>
                {template.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {template.description}
                  </p>
                )}
              </div>
              <div className="flex -mt-1 -mr-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEdit) onEdit(template);
                  }}
                >
                  <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTemplateToDelete(template);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between bg-muted/30 border border-muted p-2 rounded-md mt-2">
              <Badge variant="outline" className="text-xs font-mono">
                {getIndexPreview(template)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Updated {format(new Date(template.updatedAt), "MMM d, yyyy")}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <FilterableTableHeader
                columnKey="name"
                title="Template Name"
                isFiltered={isColumnFiltered("name")}
                activeValue={filters.name}
                onClear={() => clearColumnFilter("name")}
              />
              <FilterableTableHeader
                columnKey="description"
                title="Description"
                isFiltered={isColumnFiltered("description")}
                activeValue={filters.description}
                onClear={() => clearColumnFilter("description")}
              />
              <FilterableTableHeader
                columnKey="documentIndexing"
                title="Document Indexing"
                isFiltered={isColumnFiltered("documentIndexing")}
                activeValue={filters.documentIndexing}
                onClear={() => clearColumnFilter("documentIndexing")}
              />
              <FilterableTableHeader
                columnKey="updatedAt"
                title="Last Updated"
                isFiltered={isColumnFiltered("updatedAt")}
                activeValue={filters.updatedAt}
                onClear={() => clearColumnFilter("updatedAt")}
              />
              <TableCell className="text-right font-medium text-muted-foreground">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No templates found.
                </TableCell>
              </TableRow>
            ) : (
              filteredTemplates.map((template) => (
                <TableRow key={template.id} className="hover:bg-muted/30 transition-colors">
                  <FilterableTableCell
                    columnKey="name"
                    value={template.name}
                    isFiltered={isColumnFiltered("name")}
                    onToggleFilter={toggleFilter}
                    onTextClick={() => router.push(`/org-admin/invoice-templates/${template.id}`)}
                  >
                    {template.name}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="description"
                    value={template.description || "-"}
                    isFiltered={isColumnFiltered("description")}
                    onToggleFilter={toggleFilter}
                  >
                    <span className="max-w-xs truncate block">{template.description || "-"}</span>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="documentIndexing"
                    value={getIndexPreview(template)}
                    isFiltered={isColumnFiltered("documentIndexing")}
                    onToggleFilter={toggleFilter}
                  >
                    <Badge
                      variant="outline"
                      className="font-mono bg-muted/50 text-xs text-muted-foreground"
                    >
                      {getIndexPreview(template)}
                    </Badge>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="updatedAt"
                    value={format(new Date(template.updatedAt), "MMM d, yyyy")}
                    isFiltered={isColumnFiltered("updatedAt")}
                    onToggleFilter={toggleFilter}
                  >
                    {format(new Date(template.updatedAt), "MMM d, yyyy")}
                  </FilterableTableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onEdit) onEdit(template);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/org-admin/invoice-templates/${template.id}`);
                        }}
                      >
                        Builder
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateToDelete(template);
                        }}
                      >
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

      <AlertDialog
        open={!!templateToDelete}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the template{" "}
              <span className="font-semibold text-foreground">"{templateToDelete?.name}"</span>.
              This action cannot be undone. Any active invoices using this template structure will
              retain their snapshot but cannot be regenerated with this template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate(templateToDelete?.id);
              }}
              variant="destructive"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Template"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
