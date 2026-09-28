"use client";

/**
 * dashboard/inventory/purchases/page.tsx
 * Purchases ledger — DRAFT / CONFIRM / CANCEL flow.
 * - Supports Standalone Product Invoice modal viewer.
 * - Supports Purchase Return triggers.
 * - All totals and purchase costs are PBAC-gated (Category 4 financial data).
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
import { AddPurchaseModal } from "@/components/features/inventory/purchases/add-purchase-modal";
import { AddReturnModal } from "@/components/features/inventory/returns/add-return-modal";
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
  useCancelPurchase,
  useConfirmPurchase,
  useDeletePurchase,
  usePurchases,
} from "@/hooks/inventory/use-purchases";
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

export default function PurchasesPage() {
  const [tab, setTab] = useState("DRAFT");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editPurchase, setEditPurchase] = useState<any>(null);
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
    const saved = localStorage.getItem("purchases-hidden-cols");
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
    localStorage.setItem("purchases-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "purchases-table",
  });

  const { data: purchases, isLoading } = usePurchases(tab !== "ALL" ? tab : undefined);
  const confirmPurchase = useConfirmPurchase();
  const cancelPurchase = useCancelPurchase();
  const deletePurchase = useDeletePurchase();

  const extractors = useMemo(() => {
    return {
      purchaseNumber: (p: any) => p.purchaseNumber,
      date: (p: any) => (p.purchaseDate ? format(new Date(p.purchaseDate), "dd MMM yyyy") : "—"),
      supplier: (p: any) => p.supplier?.name ?? "—",
      status: (p: any) => p.status,
      totalAmount: (p: any) => (p.totalAmount ? formatNumber(p.totalAmount, 2) : "0"),
    };
  }, []);

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    let list = purchases;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p: any) =>
          p.purchaseNumber.toLowerCase().includes(q) || p.supplier?.name?.toLowerCase().includes(q),
      );
    }
    return filterRows(list, extractors);
  }, [purchases, searchQuery, filterRows, extractors]);

  function handleConfirm() {
    if (!confirmTarget) return;
    confirmPurchase.mutate(confirmTarget, { onSuccess: () => setConfirmTarget(null) });
  }

  function handleCancel() {
    if (!cancelTarget) return;
    cancelPurchase.mutate(cancelTarget, { onSuccess: () => setCancelTarget(null) });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deletePurchase.mutate(deleteTarget.id, {
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
          <h1 className="text-2xl font-bold tracking-tight">Purchases</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stock-in from suppliers</p>
        </div>
        <Can I="inventory:create_purchase">
          <Button
            onClick={() => {
              setEditPurchase(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Purchase
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
              placeholder="Search purchase # or supplier..."
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
                checked={!hiddenCols.purchaseNumber}
                onCheckedChange={(c) => toggleColumn("purchaseNumber", c)}
              >
                Purchase #
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.date}
                onCheckedChange={(c) => toggleColumn("date", c)}
              >
                Date
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.supplier}
                onCheckedChange={(c) => toggleColumn("supplier", c)}
              >
                Supplier
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={!hiddenCols.status}
                onCheckedChange={(c) => toggleColumn("status", c)}
              >
                Status
              </DropdownMenuCheckboxItem>
              <Can I="inventory:view_purchases">
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols.totalAmount}
                  onCheckedChange={(c) => toggleColumn("totalAmount", c)}
                >
                  Total
                </DropdownMenuCheckboxItem>
              </Can>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {!hiddenCols.purchaseNumber && (
                <FilterableTableHeader
                  columnKey="purchaseNumber"
                  title="Purchase #"
                  isFiltered={isColumnFiltered("purchaseNumber")}
                  activeValue={filters.purchaseNumber}
                  onClear={() => clearColumnFilter("purchaseNumber")}
                  width={columnWidths.purchaseNumber}
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
              {!hiddenCols.supplier && (
                <FilterableTableHeader
                  columnKey="supplier"
                  title="Supplier"
                  isFiltered={isColumnFiltered("supplier")}
                  activeValue={filters.supplier}
                  onClear={() => clearColumnFilter("supplier")}
                  width={columnWidths.supplier}
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
                  Loading purchases...
                </TableCell>
              </TableRow>
            ) : !filteredPurchases.length ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No purchases found.
                </TableCell>
              </TableRow>
            ) : (
              filteredPurchases.map((purchase: any) => (
                <TableRow key={purchase.id} className="hover:bg-muted/30 transition-colors">
                  {!hiddenCols.purchaseNumber && (
                    <FilterableTableCell
                      columnKey="purchaseNumber"
                      value={purchase.purchaseNumber}
                      isFiltered={isColumnFiltered("purchaseNumber")}
                      onToggleFilter={toggleFilter}
                      onTextClick={
                        purchase.status === "DRAFT"
                          ? () => {
                              setEditPurchase(purchase);
                              setIsModalOpen(true);
                            }
                          : () => setInvoiceTarget(purchase)
                      }
                      width={columnWidths.purchaseNumber}
                    >
                      <span className="font-mono font-medium">{purchase.purchaseNumber}</span>
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.date && (
                    <FilterableTableCell
                      columnKey="date"
                      value={format(new Date(purchase.purchaseDate), "dd MMM yyyy")}
                      isFiltered={isColumnFiltered("date")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.date}
                    >
                      {format(new Date(purchase.purchaseDate), "dd MMM yyyy")}
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.supplier && (
                    <FilterableTableCell
                      columnKey="supplier"
                      value={purchase.supplier?.name ?? "—"}
                      isFiltered={isColumnFiltered("supplier")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.supplier}
                    >
                      {purchase.supplier?.name ?? "—"}
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.status && (
                    <FilterableTableCell
                      columnKey="status"
                      value={purchase.status}
                      isFiltered={isColumnFiltered("status")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.status}
                    >
                      <StatusBadge status={purchase.status} />
                    </FilterableTableCell>
                  )}
                  {!hiddenCols.totalAmount && (
                    <FilterableTableCell
                      columnKey="totalAmount"
                      value={formatNumber(purchase.totalAmount || "0", 2)}
                      isFiltered={isColumnFiltered("totalAmount")}
                      onToggleFilter={toggleFilter}
                      width={columnWidths.totalAmount}
                      className="text-right font-medium"
                    >
                      <Can I="inventory:view_purchases">
                        <span>৳{formatNumber(purchase.totalAmount || "0", 2)}</span>
                      </Can>
                      <Can I="inventory:view_purchases" not>
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
                        <DropdownMenuItem onClick={() => setInvoiceTarget(purchase)}>
                          <FileText className="h-4 w-4 mr-2" /> View Bill / Invoice
                        </DropdownMenuItem>

                        {purchase.status === "DRAFT" && (
                          <>
                            <Can I="inventory:edit_purchase">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditPurchase(purchase);
                                  setIsModalOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" /> Edit Draft
                              </DropdownMenuItem>
                            </Can>
                            <Can I="inventory:confirm_purchase">
                              <DropdownMenuItem
                                onClick={() => setConfirmTarget(purchase.id)}
                                className="text-primary font-medium"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm & Add to Stock
                              </DropdownMenuItem>
                            </Can>
                            <DropdownMenuSeparator />
                            <Can I="inventory:delete_purchase">
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(purchase)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Draft
                              </DropdownMenuItem>
                            </Can>
                          </>
                        )}

                        {purchase.status === "CONFIRMED" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleOpenReturn(purchase.items?.[0]?.productId)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2 text-orange-400" /> Record Return
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <Can I="inventory:cancel_purchase">
                              <DropdownMenuItem
                                onClick={() => setCancelTarget(purchase.id)}
                                className="text-red-400"
                              >
                                <XCircle className="h-4 w-4 mr-2" /> Cancel & Revert Stock
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

      <AddPurchaseModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditPurchase(null);
        }}
        editPurchase={editPurchase}
      />

      {/* Standalone Product Invoice Viewer */}
      <ProductInvoiceModal
        isOpen={!!invoiceTarget}
        onClose={() => setInvoiceTarget(null)}
        type="PURCHASE"
        document={invoiceTarget}
      />

      {/* Purchase Return Modal */}
      <AddReturnModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        initialType="PURCHASE_RETURN"
        initialProductId={returnProductId}
      />

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add all purchased items into stock ledger rows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as Draft</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={confirmPurchase.isPending}>
              {confirmPurchase.isPending ? "Confirming..." : "Confirm & Add to Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will insert reversal entries to remove the added stock levels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Confirmed</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={cancelPurchase.isPending}
            >
              {cancelPurchase.isPending ? "Cancelling..." : "Cancel & Revert Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete draft dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Purchase?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.purchaseNumber}&quot; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deletePurchase.isPending}
            >
              {deletePurchase.isPending ? "Deleting..." : "Delete Draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
