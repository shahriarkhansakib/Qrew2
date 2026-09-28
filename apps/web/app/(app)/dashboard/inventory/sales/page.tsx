"use client";

/**
 * dashboard/inventory/sales/page.tsx
 * Sales ledger — DRAFT / CONFIRM / CANCEL flow.
 * - Supports Standalone Product Invoice modal viewer.
 * - Supports Sale Return triggers.
 */

import { format } from "date-fns";
import {
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { ProductInvoiceModal } from "@/components/features/inventory/invoices/product-invoice-modal";
import { AddReturnModal } from "@/components/features/inventory/returns/add-return-modal";
import { AddSaleModal } from "@/components/features/inventory/sales/add-sale-modal";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCancelSale,
  useConfirmSale,
  useDeleteSale,
  useSales,
} from "@/hooks/inventory/use-sales";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { cn, formatNumber } from "@/lib/utils";

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: "Draft", color: "bg-muted text-muted-foreground border-border", icon: Clock },
  CONFIRMED: {
    label: "Confirmed",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        meta.color,
      )}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

export default function SalesPage() {
  const [tab, setTab] = useState("DRAFT");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSale, setEditSale] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Standalone Product Invoice Modal
  const [invoiceTarget, setInvoiceTarget] = useState<any>(null);

  // Return Modal
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnProductId, setReturnProductId] = useState<string | undefined>(undefined);

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("sales-hidden-cols");
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
    localStorage.setItem("sales-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "sales-table",
  });

  const { data: sales, isLoading } = useSales(tab !== "ALL" ? tab : undefined);
  const confirmSale = useConfirmSale();
  const cancelSale = useCancelSale();
  const deleteSale = useDeleteSale();

  const extractors = useMemo(() => {
    return {
      saleNumber: (s: any) => s.saleNumber,
      date: (s: any) => (s.saleDate ? format(new Date(s.saleDate), "dd MMM yyyy") : "—"),
      customer: (s: any) => s.customer?.name ?? "—",
      status: (s: any) => s.status,
      totalAmount: (s: any) => (s.totalAmount ? formatNumber(s.totalAmount, 2) : "0"),
    };
  }, []);

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    let list = sales;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s: any) =>
          s.saleNumber.toLowerCase().includes(q) || s.customer?.name?.toLowerCase().includes(q),
      );
    }
    return filterRows(list, extractors);
  }, [sales, searchQuery, filterRows, extractors]);

  function handleConfirm() {
    if (!confirmTarget) return;
    confirmSale.mutate(confirmTarget, { onSuccess: () => setConfirmTarget(null) });
  }

  function handleCancel() {
    if (!cancelTarget) return;
    cancelSale.mutate(cancelTarget, { onSuccess: () => setCancelTarget(null) });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteSale.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (err: Error) => {
        toast.error(err.message);
        setDeleteTarget(null);
      },
    });
  }

  function handleOpenReturn(prodId?: string) {
    setReturnProductId(prodId);
    setIsReturnOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stock-out to customers</p>
        </div>
        <Can I="inventory:create_sale">
          <Button
            onClick={() => {
              setEditSale(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Sale
          </Button>
        </Can>
      </div>

      <div className="flex gap-2 flex-wrap items-center justify-between">
        <Tabs value={tab} onValueChange={setTab} className="w-auto">
          <TabsList>
            <TabsTrigger value="DRAFT">Drafts</TabsTrigger>
            <TabsTrigger value="CONFIRMED">Confirmed</TabsTrigger>
            <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 items-center">
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sale # or customer..."
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
                checked={!hiddenCols.saleNumber}
                onCheckedChange={(c) => toggleColumn("saleNumber", c)}
              >
                Sale #
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.date}
                onCheckedChange={(c) => toggleColumn("date", c)}
              >
                Date
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.customer}
                onCheckedChange={(c) => toggleColumn("customer", c)}
              >
                Customer
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.status}
                onCheckedChange={(c) => toggleColumn("status", c)}
              >
                Status
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.totalAmount}
                onCheckedChange={(c) => toggleColumn("totalAmount", c)}
              >
                Total
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {!hiddenCols.saleNumber && (
                <FilterableTableHeader
                  columnKey="saleNumber"
                  title="Sale #"
                  isFiltered={isColumnFiltered("saleNumber")}
                  activeValue={filters.saleNumber}
                  onClear={() => clearColumnFilter("saleNumber")}
                  width={columnWidths.saleNumber}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.date && (
                <FilterableTableHeader
                  columnKey="date"
                  title="Date"
                  isFiltered={isColumnFiltered("date")}
                  activeValue={filters.date}
                  onClear={() => clearColumnFilter("date")}
                  width={columnWidths.date}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.customer && (
                <FilterableTableHeader
                  columnKey="customer"
                  title="Customer"
                  isFiltered={isColumnFiltered("customer")}
                  activeValue={filters.customer}
                  onClear={() => clearColumnFilter("customer")}
                  width={columnWidths.customer}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.status && (
                <FilterableTableHeader
                  columnKey="status"
                  title="Status"
                  isFiltered={isColumnFiltered("status")}
                  activeValue={filters.status}
                  onClear={() => clearColumnFilter("status")}
                  width={columnWidths.status}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                />
              )}
              {!hiddenCols.totalAmount && (
                <FilterableTableHeader
                  columnKey="totalAmount"
                  title="Total (৳)"
                  isFiltered={isColumnFiltered("totalAmount")}
                  activeValue={filters.totalAmount}
                  onClear={() => clearColumnFilter("totalAmount")}
                  width={columnWidths.totalAmount}
                  onResizeStart={handleResizeStart}
                  onResetWidth={resetColumnWidth}
                  className="text-right"
                />
              )}
              <TableCell className="text-right w-16 font-medium text-muted-foreground">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading sales...
                </TableCell>
              </TableRow>
            ) : !filteredSales.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No sales found.
                </TableCell>
              </TableRow>
            ) : (
              filteredSales.map((sale: any) => (
                <TableRow key={sale.id} className="hover:bg-muted/30 transition-colors">
                  {!hiddenCols.saleNumber && (
                    <FilterableTableCell
                      columnKey="saleNumber"
                      value={sale.saleNumber}
                      isFiltered={isColumnFiltered("saleNumber")}
                      onToggleFilter={toggleFilter}
                      onTextClick={
                        sale.status === "DRAFT"
                          ? () => {
                              setEditSale(sale);
                              setIsModalOpen(true);
                            }
                          : () => setInvoiceTarget(sale)
                      }
                      width={columnWidths.saleNumber}
                    >
                      <span className="font-mono font-medium">{sale.saleNumber}</span>
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.date && (
                    <FilterableTableCell
                      columnKey="date"
                      value={format(new Date(sale.saleDate), "dd MMM yyyy")}
                      isFiltered={isColumnFiltered("date")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.date}
                    >
                      {format(new Date(sale.saleDate), "dd MMM yyyy")}
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.customer && (
                    <FilterableTableCell
                      columnKey="customer"
                      value={sale.customer?.name ?? "—"}
                      isFiltered={isColumnFiltered("customer")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.customer}
                    >
                      {sale.customer?.name ?? "—"}
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.status && (
                    <FilterableTableCell
                      columnKey="status"
                      value={sale.status}
                      isFiltered={isColumnFiltered("status")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.status}
                    >
                      <StatusBadge status={sale.status} />
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.totalAmount && (
                    <FilterableTableCell
                      columnKey="totalAmount"
                      value={formatNumber(sale.totalAmount || "0", 2)}
                      isFiltered={isColumnFiltered("totalAmount")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.totalAmount}
                      className="text-right font-medium"
                    >
                      <Can I="inventory:view_sales">
                        <span>৳{formatNumber(sale.totalAmount || "0", 2)}</span>
                      </Can>
                      <Can I="inventory:view_sales" not>
                        <span className="text-muted-foreground/40">•••</span>
                      </Can>
                    </FilterableTableCell>
                  )}
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setInvoiceTarget(sale)}>
                          <FileText className="h-4 w-4 mr-2" /> View Sales Invoice
                        </DropdownMenuItem>

                        {sale.status === "DRAFT" && (
                          <>
                            <Can I="inventory:edit_sale">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditSale(sale);
                                  setIsModalOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" /> Edit Draft
                              </DropdownMenuItem>
                            </Can>
                            <Can I="inventory:confirm_sale">
                              <DropdownMenuItem
                                onClick={() => setConfirmTarget(sale.id)}
                                className="text-primary font-medium"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm & Deduct Stock
                              </DropdownMenuItem>
                            </Can>
                            <DropdownMenuSeparator />
                            <Can I="inventory:delete_sale">
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(sale)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Draft
                              </DropdownMenuItem>
                            </Can>
                          </>
                        )}

                        {sale.status === "CONFIRMED" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleOpenReturn(sale.items?.[0]?.productId)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2 text-orange-400" /> Record Return
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <Can I="inventory:cancel_sale">
                              <DropdownMenuItem
                                onClick={() => setCancelTarget(sale.id)}
                                className="text-red-400"
                              >
                                <XCircle className="h-4 w-4 mr-2" /> Cancel & Restore Stock
                              </DropdownMenuItem>
                            </Can>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddSaleModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditSale(null);
        }}
        editSale={editSale}
      />

      {/* Standalone Product Invoice Viewer */}
      <ProductInvoiceModal
        isOpen={!!invoiceTarget}
        onClose={() => setInvoiceTarget(null)}
        type="SALE"
        document={invoiceTarget}
      />

      {/* Sale Return Modal */}
      <AddReturnModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        initialType="SALE_RETURN"
        initialProductId={returnProductId}
      />

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deduct all items from stock. The system will check for sufficient stock
              before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as Draft</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={confirmSale.isPending}>
              {confirmSale.isPending ? "Checking Stock..." : "Confirm & Deduct Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This will insert reversal entries to restore the stock levels. Original records are
              preserved for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Confirmed</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={cancelSale.isPending}
            >
              {cancelSale.isPending ? "Cancelling..." : "Cancel & Restore Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete draft dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.saleNumber}&quot; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteSale.isPending}
            >
              {deleteSale.isPending ? "Deleting..." : "Delete Draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
