"use client";

/**
 * dashboard/inventory/brands/page.tsx
 * Brand management page — create, rename, delete brands.
 * Files Dashboard Table UX (cell filtering, resizable columns, column visibility toggles).
 * Accessible to users with inventory:manage_brands permission.
 */

import { Check, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Can } from "@/components/features/auth/can";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import {
  useBrands,
  useCreateBrand,
  useDeleteBrand,
  useUpdateBrand,
} from "@/hooks/inventory/use-brands";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";

export default function BrandsPage() {
  const { data: brands, isLoading } = useBrands();
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const deleteBrand = useDeleteBrand();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("brands-hidden-cols");
    if (saved) {
      try {
        setHiddenCols(JSON.parse(saved));
      } catch (_e) {}
    }
  }, []);

  const toggleColumn = (key: string, checked: boolean) => {
    const next = { ...hiddenCols };
    if (checked) delete next[key];
    else next[key] = true;
    setHiddenCols(next);
    localStorage.setItem("brands-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "brands-table",
  });

  const extractors = useMemo(() => {
    return {
      name: (b: any) => b.name,
    };
  }, []);

  const filteredBrands = useMemo(() => {
    if (!brands) return [];
    let list = brands;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((b: any) => b.name.toLowerCase().includes(q));
    }
    return filterRows(list, extractors);
  }, [brands, searchQuery, filterRows, extractors]);

  function handleCreate() {
    if (!newName.trim()) return;
    createBrand.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") });
  }

  function handleUpdate(id: string) {
    if (!editingName.trim()) return;
    updateBrand.mutate(
      { id, data: { name: editingName.trim() } },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditingName("");
        },
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteBrand.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage product brands for your organization
        </p>
      </div>

      {/* Inline create form */}
      <Can I="inventory:manage_brands">
        <div className="flex gap-2 max-w-md">
          <Input
            placeholder="New brand name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={createBrand.isPending || !newName.trim()}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Brand
          </Button>
        </div>
      </Can>

      <div className="flex gap-2 flex-wrap items-center justify-between max-w-2xl">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            className="pl-9 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              <span>View</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <DropdownMenuCheckboxItem
              checked={!hiddenCols.name}
              onCheckedChange={(c) => toggleColumn("name", c)}
            >
              Brand Name
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Brands table */}
      <div className="rounded-md border bg-card max-w-2xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {!hiddenCols.name && (
                <FilterableTableHeader
                  columnKey="name"
                  title="Brand Name"
                  isFiltered={isColumnFiltered("name")}
                  activeValue={filters.name}
                  onClear={() => clearColumnFilter("name")}
                  width={columnWidths.name}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              <TableCell className="text-right w-24 font-medium text-muted-foreground">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                  Loading brands...
                </TableCell>
              </TableRow>
            ) : !filteredBrands.length ? (
              <TableRow>
                <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                  No brands found.
                </TableCell>
              </TableRow>
            ) : (
              filteredBrands.map((brand: any) => (
                <TableRow key={brand.id} className="hover:bg-muted/30 transition-colors">
                  {!hiddenCols.name &&
                    (editingId === brand.id ? (
                      <TableCell
                        style={columnWidths.name ? { width: `${columnWidths.name}px` } : undefined}
                      >
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleUpdate(brand.id);
                              if (e.key === "Escape") {
                                setEditingId(null);
                                setEditingName("");
                              }
                            }}
                            className="h-8 text-sm"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary hover:text-primary"
                            onClick={() => handleUpdate(brand.id)}
                            disabled={updateBrand.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => {
                              setEditingId(null);
                              setEditingName("");
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : (
                      <FilterableTableCell
                        columnKey="name"
                        value={brand.name}
                        isFiltered={isColumnFiltered("name")}
                        onToggleFilter={toggleFilter}
                        onTextClick={() => {
                          setEditingId(brand.id);
                          setEditingName(brand.name);
                        }}
                        width={columnWidths.name}
                      >
                        <span className="font-medium">{brand.name}</span>
                      </FilterableTableCell>
                    ))}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Can I="inventory:manage_brands">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditingId(brand.id);
                            setEditingName(brand.name);
                          }}
                          title="Rename"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(brand)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Can>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be deleted. Any products linked to this brand
              will have their brand set to null (unbranded).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteBrand.isPending}
            >
              {deleteBrand.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
