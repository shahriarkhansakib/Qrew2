"use client";

/**
 * dashboard/inventory/customers/page.tsx
 * Customer directory for inventory buyers.
 * Files Dashboard Table UX (cell filtering, resizable columns, column visibility toggles).
 */

import { Edit, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { AddCustomerModal } from "@/components/features/inventory/customers/add-customer-modal";
import { CustomerDetailModal } from "@/components/features/inventory/customers/customer-detail-modal";
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
import { useDeleteInventoryCustomer, useInventoryCustomers } from "@/hooks/inventory/use-customers";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";

export default function CustomersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("customers-hidden-cols");
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
    localStorage.setItem("customers-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "customers-table",
  });

  const { data: customers, isLoading } = useInventoryCustomers();
  const deleteCustomer = useDeleteInventoryCustomer();

  const extractors = useMemo(() => {
    return {
      name: (c: any) => c.name,
      phone: (c: any) => c.phone ?? "—",
      email: (c: any) => c.email ?? "—",
      address: (c: any) => c.address ?? "—",
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    let list = customers;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c: any) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q),
      );
    }
    return filterRows(list, extractors);
  }, [customers, searchQuery, filterRows, extractors]);

  function handleDelete() {
    if (!deleteTarget) return;
    deleteCustomer.mutate(deleteTarget.id, {
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
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Buyers in the inventory module</p>
        </div>
        <Can I="inventory:create_customer">
          <Button
            onClick={() => {
              setEditCustomer(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Customer
          </Button>
        </Can>
      </div>

      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
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
              checked={!hiddenCols.phone}
              onCheckedChange={(c) => toggleColumn("phone", c)}
            >
              Phone
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={!hiddenCols.email}
              onCheckedChange={(c) => toggleColumn("email", c)}
            >
              Email
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={!hiddenCols.address}
              onCheckedChange={(c) => toggleColumn("address", c)}
            >
              Address
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
              {!hiddenCols.phone && (
                <FilterableTableHeader
                  columnKey="phone"
                  title="Phone"
                  isFiltered={isColumnFiltered("phone")}
                  activeValue={filters.phone}
                  onClear={() => clearColumnFilter("phone")}
                  width={columnWidths.phone}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.email && (
                <FilterableTableHeader
                  columnKey="email"
                  title="Email"
                  isFiltered={isColumnFiltered("email")}
                  activeValue={filters.email}
                  onClear={() => clearColumnFilter("email")}
                  width={columnWidths.email}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.address && (
                <FilterableTableHeader
                  columnKey="address"
                  title="Address"
                  isFiltered={isColumnFiltered("address")}
                  activeValue={filters.address}
                  onClear={() => clearColumnFilter("address")}
                  width={columnWidths.address}
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
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Loading customers...
                </TableCell>
              </TableRow>
            ) : !filteredCustomers.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((c: any) => (
                <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                  {!hiddenCols.name && (
                    <FilterableTableCell
                      columnKey="name"
                      value={c.name}
                      isFiltered={isColumnFiltered("name")}
                      onToggleFilter={toggleFilter}
                      onTextClick={() => setDetailCustomer(c)}
                      width={columnWidths.name}
                    >
                      <span className="font-medium">{c.name}</span>
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.phone && (
                    <FilterableTableCell
                      columnKey="phone"
                      value={c.phone ?? "—"}
                      isFiltered={isColumnFiltered("phone")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.phone}
                    >
                      <span className="text-muted-foreground">{c.phone ?? "—"}</span>
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.email && (
                    <FilterableTableCell
                      columnKey="email"
                      value={c.email ?? "—"}
                      isFiltered={isColumnFiltered("email")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.email}
                    >
                      <span className="text-muted-foreground">{c.email ?? "—"}</span>
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.address && (
                    <FilterableTableCell
                      columnKey="address"
                      value={c.address ?? "—"}
                      isFiltered={isColumnFiltered("address")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.address}
                    >
                      <span className="text-muted-foreground">{c.address ?? "—"}</span>
                    </FilterableTableCell>
                  )}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Can I="inventory:edit_customer">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditCustomer(c);
                            setIsModalOpen(true);
                          }}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Can>
                      <Can I="inventory:delete_customer">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
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

      <AddCustomerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditCustomer(null);
        }}
        editCustomer={editCustomer}
      />

      <CustomerDetailModal
        isOpen={!!detailCustomer}
        onClose={() => setDetailCustomer(null)}
        customer={detailCustomer}
        onEdit={(cust) => {
          setEditCustomer(cust);
          setIsModalOpen(true);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteCustomer.isPending}
            >
              {deleteCustomer.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
