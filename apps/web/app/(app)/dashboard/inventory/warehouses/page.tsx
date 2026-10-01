"use client";

/**
 * dashboard/inventory/warehouses/page.tsx
 * Warehouse management page — create, rename, delete warehouses.
 * Files Dashboard Table UX (cell filtering, resizable columns, column visibility toggles).
 */

import { Edit, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import {
  useCreateWarehouse,
  useDeleteWarehouse,
  useUpdateWarehouse,
  useWarehouses,
} from "@/hooks/inventory/use-warehouses";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";

function WarehouseModal({
  isOpen,
  onClose,
  editWarehouse,
}: {
  isOpen: boolean;
  onClose: () => void;
  editWarehouse?: any;
}) {
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const { control, handleSubmit } = useForm({
    defaultValues: {
      name: editWarehouse?.name ?? "",
      location: editWarehouse?.location ?? editWarehouse?.address ?? "",
    },
  });

  function onSubmit(values: any) {
    const payload = {
      name: values.name,
      address: values.location,
      location: values.location,
    };
    if (editWarehouse) {
      update.mutate({ id: editWarehouse.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editWarehouse ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
          <DialogDescription>
            A warehouse tracks where stock is physically stored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Controller
              control={control}
              name="name"
              render={({ field }) => <Input placeholder="Main Warehouse" {...field} />}
            />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Controller
              control={control}
              name="location"
              render={({ field }) => (
                <Input placeholder="Optional address" {...field} value={field.value ?? ""} />
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : editWarehouse ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function WarehousesPage() {
  const { data: warehouses, isLoading } = useWarehouses();
  const deleteWarehouse = useDeleteWarehouse();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("warehouses-hidden-cols");
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
    localStorage.setItem("warehouses-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "warehouses-table",
  });

  const extractors = useMemo(() => {
    return {
      name: (w: any) => w.name,
      location: (w: any) => w.location ?? w.address ?? "—",
    };
  }, []);

  const filteredWarehouses = useMemo(() => {
    if (!warehouses) return [];
    let list = warehouses;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (w: any) =>
          w.name.toLowerCase().includes(q) ||
          ((w.location || w.address) && (w.location || w.address).toLowerCase().includes(q)),
      );
    }
    return filterRows(list, extractors);
  }, [warehouses, searchQuery, filterRows, extractors]);

  function handleDelete() {
    if (!deleteTarget) return;
    deleteWarehouse.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (err: Error) => {
        toast.error(err.message);
        setDeleteTarget(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Physical storage locations for stock
          </p>
        </div>
        <Can I="inventory:view_products">
          <Button
            onClick={() => {
              setEditWarehouse(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Warehouse
          </Button>
        </Can>
      </div>

      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search warehouses..."
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
              Name
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={!hiddenCols.location}
              onCheckedChange={(c) => toggleColumn("location", c)}
            >
              Location
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {!hiddenCols.name && (
                <FilterableTableHeader
                  columnKey="name"
                  title="Name"
                  isFiltered={isColumnFiltered("name")}
                  activeValue={filters.name}
                  onClear={() => clearColumnFilter("name")}
                  width={columnWidths.name}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.location && (
                <FilterableTableHeader
                  columnKey="location"
                  title="Location"
                  isFiltered={isColumnFiltered("location")}
                  activeValue={filters.location}
                  onClear={() => clearColumnFilter("location")}
                  width={columnWidths.location}
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
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  Loading warehouses...
                </TableCell>
              </TableRow>
            ) : !filteredWarehouses.length ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No warehouses found.
                </TableCell>
              </TableRow>
            ) : (
              filteredWarehouses.map((w: any) => (
                <TableRow key={w.id} className="hover:bg-muted/30 transition-colors">
                  {!hiddenCols.name && (
                    <FilterableTableCell
                      columnKey="name"
                      value={w.name}
                      isFiltered={isColumnFiltered("name")}
                      onToggleFilter={toggleFilter}
                      onTextClick={() => {
                        setEditWarehouse(w);
                        setIsModalOpen(true);
                      }}
                      width={columnWidths.name}
                    >
                      <span className="font-medium">{w.name}</span>
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.location && (
                    <FilterableTableCell
                      columnKey="location"
                      value={w.location ?? w.address ?? "—"}
                      isFiltered={isColumnFiltered("location")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.location}
                    >
                      <span className="text-muted-foreground">
                        {w.location ?? w.address ?? "—"}
                      </span>
                    </FilterableTableCell>
                  )}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => {
                          setEditWarehouse(w);
                          setIsModalOpen(true);
                        }}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(w)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {isModalOpen && (
        <WarehouseModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditWarehouse(null);
          }}
          editWarehouse={editWarehouse}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be deleted. Ensure no inventory stock is linked
              to this warehouse before deleting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteWarehouse.isPending}
            >
              {deleteWarehouse.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
