"use client";

/**
 * dashboard/inventory/products/page.tsx
 * Product catalog & Centralized Drafts Management:
 * - Top Tab switcher: All Products / Normal Products / Purchase Drafts / Sales Drafts.
 * - Integrated Draft Management: view, edit, delete, or confirm draft orders directly in the Product module.
 * - Integrated Quick Actions (+ Purchase, + Sell).
 * - Real-time stock levels & PBAC-gated financial view.
 */

import { format } from "date-fns";
import {
  CheckCircle2,
  Edit,
  FileText,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { ProductInvoiceModal } from "@/components/features/inventory/invoices/product-invoice-modal";
import { AddProductModal } from "@/components/features/inventory/products/add-product-modal";
import { ProductDetailModal } from "@/components/features/inventory/products/product-detail-modal";
import { AddPurchaseModal } from "@/components/features/inventory/purchases/add-purchase-modal";
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
import { Badge } from "@/components/ui/badge";
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
import { useBrands } from "@/hooks/inventory/use-brands";
import { useProductCategories } from "@/hooks/inventory/use-product-categories";
import { useDeleteProduct, useProducts } from "@/hooks/inventory/use-products";
import {
  useConfirmPurchase,
  useDeletePurchase,
  usePurchases,
} from "@/hooks/inventory/use-purchases";
import { useConfirmSale, useDeleteSale, useSales } from "@/hooks/inventory/use-sales";
import { useStock } from "@/hooks/inventory/use-stock";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { cn, formatNumber } from "@/lib/utils";

function StockBadges({
  productId,
  stockMap,
  productType,
}: {
  productId: string;
  stockMap: Record<string, Record<string, number>>;
  productType?: string;
}) {
  const states = stockMap[productId];
  if (!states) return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(states).map(([state, qty]) => {
        const isLow = qty < 5;
        const isNormal = state === "NORMAL" || productType === "NORMAL";
        return (
          <span
            key={state}
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border font-mono",
              isLow
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : "bg-primary/10 text-primary border-primary/20",
            )}
          >
            {isNormal ? formatNumber(qty) : `${state}: ${formatNumber(qty)}`}
          </span>
        );
      })}
    </div>
  );
}

export default function ProductsPage() {
  // Modals state for Products
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Quick Action Modal states
  const [quickPurchaseProduct, setQuickPurchaseProduct] = useState<string | null>(null);
  const [editPurchaseDraft, setEditPurchaseDraft] = useState<any>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  const [quickSaleProduct, setQuickSaleProduct] = useState<string | null>(null);
  const [editSaleDraft, setEditSaleDraft] = useState<any>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

  // Standalone Product Invoice Modal
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<"PURCHASE" | "SALE">("PURCHASE");
  const [invoiceDoc, setInvoiceDoc] = useState<any>(null);

  // Draft Confirm & Delete Dialog Targets
  const [confirmDraftTarget, setConfirmDraftTarget] = useState<{
    type: "PURCHASE" | "SALE";
    id: string;
  } | null>(null);
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<{
    type: "PURCHASE" | "SALE";
    item: any;
  } | null>(null);

  // Top Tabs / Filters: "NORMAL" (catalog default), "PURCHASE_DRAFTS", "SALE_DRAFTS"
  const [topTab, setTopTab] = useState<string>("NORMAL");
  const [searchQuery, setSearchQuery] = useState("");

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("products-hidden-cols");
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
    localStorage.setItem("products-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();
  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "products-table",
  });

  // Queries
  const {
    data: products,
    isLoading,
    refetch: refetchProducts,
  } = useProducts({
    isActive: true,
  });
  const { data: categories } = useProductCategories();
  const { data: brands } = useBrands();
  const { data: stockRows } = useStock();
  const deleteProduct = useDeleteProduct();

  // Draft Queries
  const { data: purchaseDrafts, refetch: refetchPurchaseDrafts } = usePurchases("DRAFT");
  const { data: saleDrafts, refetch: refetchSaleDrafts } = useSales("DRAFT");

  const _totalDraftsCount = (purchaseDrafts?.length || 0) + (saleDrafts?.length || 0);

  const confirmPurchase = useConfirmPurchase();
  const deletePurchase = useDeletePurchase();

  const confirmSale = useConfirmSale();
  const deleteSale = useDeleteSale();

  const stockMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    (stockRows ?? []).forEach((row: any) => {
      if (!map[row.product_id]) map[row.product_id] = {};
      map[row.product_id][row.stock_state] = parseFloat(row.current_stock);
    });
    return map;
  }, [stockRows]);

  const extractors = useMemo(() => {
    return {
      name: (p: any) => p.name,
      category: (p: any) => p.category?.name ?? "—",
      brand: (p: any) => p.brand?.name ?? "—",
      unit: (p: any) => p.unit ?? "—",
      sellingPrice: (p: any) => (p.sellingPrice ? formatNumber(p.sellingPrice, 2) : "—"),
    };
  }, []);

  const categoryOptions = useMemo(() => {
    return (categories ?? []).map((c: any) => ({ label: c.name, value: c.name }));
  }, [categories]);

  const brandOptions = useMemo(() => {
    return (brands ?? []).map((b: any) => ({ label: b.name, value: b.name }));
  }, [brands]);

  const filteredProducts = useMemo(() => {
    let list = filterRows(products ?? [], extractors);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p: any) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.category?.name?.toLowerCase().includes(q) ||
          p.brand?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, filterRows, extractors, searchQuery]);

  const filteredPurchaseDrafts = useMemo(() => {
    if (!purchaseDrafts) return [];
    if (!searchQuery.trim()) return purchaseDrafts;
    const q = searchQuery.toLowerCase().trim();
    return purchaseDrafts.filter(
      (p: any) =>
        p.purchaseNumber?.toLowerCase().includes(q) || p.supplier?.name?.toLowerCase().includes(q),
    );
  }, [purchaseDrafts, searchQuery]);

  const filteredSaleDrafts = useMemo(() => {
    if (!saleDrafts) return [];
    if (!searchQuery.trim()) return saleDrafts;
    const q = searchQuery.toLowerCase().trim();
    return saleDrafts.filter(
      (s: any) =>
        s.saleNumber?.toLowerCase().includes(q) || s.customer?.name?.toLowerCase().includes(q),
    );
  }, [saleDrafts, searchQuery]);

  function handleEdit(product: any) {
    setEditProduct(product);
    setIsModalOpen(true);
  }

  function handleOpenPurchase(productId?: string, draft?: any) {
    setQuickPurchaseProduct(productId ?? null);
    setEditPurchaseDraft(draft ?? null);
    setIsPurchaseModalOpen(true);
  }

  function handleOpenSale(productId?: string, draft?: any) {
    setQuickSaleProduct(productId ?? null);
    setEditSaleDraft(draft ?? null);
    setIsSaleModalOpen(true);
  }

  function handleDeleteProduct() {
    if (!deleteTarget) return;
    deleteProduct.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (err: Error) => {
        toast.error(err.message);
        setDeleteTarget(null);
      },
    });
  }

  function handleConfirmDraft() {
    if (!confirmDraftTarget) return;
    if (confirmDraftTarget.type === "PURCHASE") {
      confirmPurchase.mutate(confirmDraftTarget.id, {
        onSuccess: () => {
          toast.success("Draft purchase confirmed and stock added!");
          setConfirmDraftTarget(null);
          refetchPurchaseDrafts();
        },
      });
    } else {
      confirmSale.mutate(confirmDraftTarget.id, {
        onSuccess: () => {
          toast.success("Draft sale confirmed and stock deducted!");
          setConfirmDraftTarget(null);
          refetchSaleDrafts();
        },
      });
    }
  }

  function handleDeleteDraft() {
    if (!deleteDraftTarget) return;
    if (deleteDraftTarget.type === "PURCHASE") {
      deletePurchase.mutate(deleteDraftTarget.item.id, {
        onSuccess: () => {
          toast.success("Draft purchase deleted.");
          setDeleteDraftTarget(null);
          refetchPurchaseDrafts();
        },
      });
    } else {
      deleteSale.mutate(deleteDraftTarget.item.id, {
        onSuccess: () => {
          toast.success("Draft sale deleted.");
          setDeleteDraftTarget(null);
          refetchSaleDrafts();
        },
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products & Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Product catalog, live stock levels, and centralized draft order management
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchProducts();
              refetchPurchaseDrafts();
              refetchSaleDrafts();
            }}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>

          {/* Integrated Actions */}
          <Can I="inventory:create_purchase">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenPurchase()}
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" /> + Purchase
            </Button>
          </Can>
          <Can I="inventory:create_sale">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenSale()}
              className="border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
            >
              <TrendingUp className="h-4 w-4 mr-1.5" /> + Sell
            </Button>
          </Can>
          <Can I="inventory:create_product">
            <Button
              onClick={() => {
                setEditProduct(null);
                setIsModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </Can>
        </div>
      </div>

      {/* Top Toolbar: Dropdown Filters & Search / View Options */}
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 1. All Products Tab Button */}
          <Button
            variant={topTab === "NORMAL" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-9 gap-1.5",
              topTab === "NORMAL" && "bg-primary text-primary-foreground font-medium",
            )}
            onClick={() => setTopTab("NORMAL")}
          >
            <Package className="h-4 w-4" />
            <span>All Products</span>
            <Badge
              variant="secondary"
              className={cn(
                "ml-1 px-1.5 py-0 text-[10px] font-mono",
                topTab === "NORMAL"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {products?.length || 0}
            </Badge>
          </Button>

          {/* 2. Purchase Drafts Tab Button */}
          <Button
            variant={topTab === "PURCHASE_DRAFTS" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-9 gap-1.5 border-primary/30",
              topTab === "PURCHASE_DRAFTS" && "bg-primary hover:bg-primary text-white",
            )}
            onClick={() => setTopTab("PURCHASE_DRAFTS")}
          >
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span>Purchase Drafts</span>
            <Badge
              variant="secondary"
              className={cn(
                "ml-1 px-1.5 py-0 text-[10px] font-mono",
                topTab === "PURCHASE_DRAFTS"
                  ? "bg-white/20 text-white"
                  : "bg-primary/15 text-primary",
              )}
            >
              {purchaseDrafts?.length || 0}
            </Badge>
          </Button>

          {/* 3. Sell Drafts Tab Button */}
          <Button
            variant={topTab === "SALE_DRAFTS" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-9 gap-1.5 border-blue-500/30",
              topTab === "SALE_DRAFTS" && "bg-blue-600 hover:bg-blue-500 text-white",
            )}
            onClick={() => setTopTab("SALE_DRAFTS")}
          >
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span>Sell Drafts</span>
            <Badge
              variant="secondary"
              className={cn(
                "ml-1 px-1.5 py-0 text-[10px] font-mono",
                topTab === "SALE_DRAFTS"
                  ? "bg-white/20 text-white"
                  : "bg-blue-500/15 text-blue-500",
              )}
            >
              {saleDrafts?.length || 0}
            </Badge>
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search catalog or drafts..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {(topTab === "NORMAL" || topTab === "ALL") && (
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
                  checked={!hiddenCols.category}
                  onCheckedChange={(c) => toggleColumn("category", c)}
                >
                  Category
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols.brand}
                  onCheckedChange={(c) => toggleColumn("brand", c)}
                >
                  Brand
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols.unit}
                  onCheckedChange={(c) => toggleColumn("unit", c)}
                >
                  Unit
                </DropdownMenuCheckboxItem>
                <Can I="inventory:view_cost_price">
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.buyPrice}
                    onCheckedChange={(c) => toggleColumn("buyPrice", c)}
                  >
                    Buy Price
                  </DropdownMenuCheckboxItem>
                </Can>
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols.sellPrice}
                  onCheckedChange={(c) => toggleColumn("sellPrice", c)}
                >
                  Sell Price
                </DropdownMenuCheckboxItem>
                <Can I="inventory:view_stock">
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.stock}
                    onCheckedChange={(c) => toggleColumn("stock", c)}
                  >
                    Stock
                  </DropdownMenuCheckboxItem>
                </Can>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* RENDER PRODUCTS CATALOG (when NORMAL tab is active) */}
      {(topTab === "NORMAL" || topTab === "ALL") && (
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
                {!hiddenCols.category && (
                  <FilterableTableHeader
                    columnKey="category"
                    title="Category"
                    isFiltered={isColumnFiltered("category")}
                    activeValue={filters.category}
                    onClear={() => clearColumnFilter("category")}
                    options={categoryOptions}
                    onSelectOption={(val) => toggleFilter("category", val)}
                    width={columnWidths.category}
                    onResizeStart={handleResizeStart}
                    onResetWidth={resetColumnWidth}
                  />
                )}
                {!hiddenCols.brand && (
                  <FilterableTableHeader
                    columnKey="brand"
                    title="Brand"
                    isFiltered={isColumnFiltered("brand")}
                    activeValue={filters.brand}
                    onClear={() => clearColumnFilter("brand")}
                    options={brandOptions}
                    onSelectOption={(val) => toggleFilter("brand", val)}
                    width={columnWidths.brand}
                    onResizeStart={handleResizeStart}
                    onResetWidth={resetColumnWidth}
                  />
                )}
                {!hiddenCols.unit && (
                  <FilterableTableHeader
                    columnKey="unit"
                    title="Unit"
                    isFiltered={isColumnFiltered("unit")}
                    activeValue={filters.unit}
                    onClear={() => clearColumnFilter("unit")}
                    width={columnWidths.unit}
                    onResizeStart={handleResizeStart}
                    onResetWidth={resetColumnWidth}
                  />
                )}
                {!hiddenCols.buyPrice && (
                  <TableCell className="text-right font-medium text-muted-foreground w-[100px]">
                    <Can I="inventory:view_cost_price">Buy Price</Can>
                    <Can I="inventory:view_cost_price" not>
                      <span className="text-muted-foreground">Buy Price</span>
                    </Can>
                  </TableCell>
                )}
                {!hiddenCols.sellPrice && (
                  <FilterableTableHeader
                    columnKey="sellPrice"
                    title="Sell Price"
                    isFiltered={isColumnFiltered("sellPrice")}
                    activeValue={filters.sellPrice}
                    onClear={() => clearColumnFilter("sellPrice")}
                    width={columnWidths.sellPrice}
                    onResizeStart={handleResizeStart}
                    onResetWidth={resetColumnWidth}
                    className="text-right"
                  />
                )}
                {!hiddenCols.stock && (
                  <TableCell className="font-medium text-muted-foreground">
                    <Can I="inventory:view_stock">Stock</Can>
                  </TableCell>
                )}
                <TableCell className="text-right w-44 font-medium text-muted-foreground">
                  Actions
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    Loading products...
                  </TableCell>
                </TableRow>
              ) : !filteredProducts.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product: any) => (
                  <TableRow key={product.id} className="hover:bg-muted/30 transition-colors">
                    {!hiddenCols.name && (
                      <FilterableTableCell
                        columnKey="name"
                        value={product.name}
                        isFiltered={isColumnFiltered("name")}
                        onToggleFilter={toggleFilter}
                        onTextClick={() => setDetailProduct(product)}
                        width={columnWidths.name}
                      >
                        <span>
                          {product.name}
                          {product.sku && (
                            <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                              #{product.sku}
                            </span>
                          )}
                        </span>
                      </FilterableTableCell>
                    )}
                    {!hiddenCols.category && (
                      <FilterableTableCell
                        columnKey="category"
                        value={product.category?.name ?? "—"}
                        isFiltered={isColumnFiltered("category")}
                        onToggleFilter={toggleFilter}
                        width={columnWidths.category}
                      >
                        {product.category?.name ?? "—"}
                      </FilterableTableCell>
                    )}
                    {!hiddenCols.brand && (
                      <FilterableTableCell
                        columnKey="brand"
                        value={product.brand?.name ?? "—"}
                        isFiltered={isColumnFiltered("brand")}
                        onToggleFilter={toggleFilter}
                        width={columnWidths.brand}
                      >
                        {product.brand?.name ?? "—"}
                      </FilterableTableCell>
                    )}
                    {!hiddenCols.unit && (
                      <FilterableTableCell
                        columnKey="unit"
                        value={product.unit ?? "—"}
                        isFiltered={isColumnFiltered("unit")}
                        onToggleFilter={toggleFilter}
                        width={columnWidths.unit}
                      >
                        {product.unit}
                      </FilterableTableCell>
                    )}
                    {!hiddenCols.buyPrice && (
                      <TableCell className="text-right">
                        <Can I="inventory:view_cost_price">
                          {product.purchasePrice
                            ? `৳${formatNumber(product.purchasePrice, 2)}`
                            : "—"}
                        </Can>
                        <Can I="inventory:view_cost_price" not>
                          <span className="text-muted-foreground/40">•••</span>
                        </Can>
                      </TableCell>
                    )}
                    {!hiddenCols.sellPrice && (
                      <FilterableTableCell
                        columnKey="sellPrice"
                        value={product.sellingPrice ? formatNumber(product.sellingPrice, 2) : "—"}
                        isFiltered={isColumnFiltered("sellPrice")}
                        onToggleFilter={toggleFilter}
                        width={columnWidths.sellPrice}
                        className="text-right"
                      >
                        {product.sellingPrice ? `৳${formatNumber(product.sellingPrice, 2)}` : "—"}
                      </FilterableTableCell>
                    )}
                    {!hiddenCols.stock && (
                      <TableCell>
                        <Can I="inventory:view_stock">
                          <StockBadges
                            productId={product.id}
                            stockMap={stockMap}
                            productType={product.productType}
                          />
                        </Can>
                        <Can I="inventory:view_stock" not>
                          <span className="text-muted-foreground/40">—</span>
                        </Can>
                      </TableCell>
                    )}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Can I="inventory:create_purchase">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleOpenPurchase(product.id)}
                            title="Quick Purchase"
                          >
                            <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Buy
                          </Button>
                        </Can>
                        <Can I="inventory:create_sale">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                            onClick={() => handleOpenSale(product.id)}
                            title="Quick Sale"
                          >
                            <TrendingUp className="h-3.5 w-3.5 mr-1" /> Sell
                          </Button>
                        </Can>
                        <Can I="inventory:edit_product">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => handleEdit(product)}
                            title="Edit"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </Can>
                        <Can I="inventory:delete_product">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(product)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      )}

      {/* RENDER PURCHASE DRAFTS TAB */}
      {topTab === "PURCHASE_DRAFTS" && (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableCell className="font-medium">Purchase #</TableCell>
                <TableCell className="font-medium">Date</TableCell>
                <TableCell className="font-medium">Supplier</TableCell>
                <TableCell className="text-right font-medium">Total (৳)</TableCell>
                <TableCell className="text-right font-medium">Draft Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filteredPurchaseDrafts.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No draft purchase orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPurchaseDrafts.map((purchase: any) => (
                  <TableRow key={purchase.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono font-medium">
                      {purchase.purchaseNumber}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {purchase.purchaseDate
                        ? format(new Date(purchase.purchaseDate), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{purchase.supplier?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      ৳{formatNumber(purchase.totalAmount || "0", 2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setInvoiceType("PURCHASE");
                            setInvoiceDoc(purchase);
                            setInvoiceModalOpen(true);
                          }}
                          title="Preview Bill"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-primary"
                          onClick={() => handleOpenPurchase(undefined, purchase)}
                          title="Edit Draft"
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10 font-medium"
                          onClick={() =>
                            setConfirmDraftTarget({ type: "PURCHASE", id: purchase.id })
                          }
                          title="Confirm & Add Stock"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteDraftTarget({ type: "PURCHASE", item: purchase })}
                          title="Delete Draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* RENDER SALES DRAFTS TAB */}
      {topTab === "SALE_DRAFTS" && (
        <div className="rounded-md border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableCell className="font-medium">Sale #</TableCell>
                <TableCell className="font-medium">Date</TableCell>
                <TableCell className="font-medium">Customer</TableCell>
                <TableCell className="text-right font-medium">Total (৳)</TableCell>
                <TableCell className="text-right font-medium">Draft Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filteredSaleDrafts.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No draft sales orders found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSaleDrafts.map((sale: any) => (
                  <TableRow key={sale.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono font-medium">{sale.saleNumber}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {sale.saleDate ? format(new Date(sale.saleDate), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{sale.customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      ৳{formatNumber(sale.totalAmount || "0", 2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setInvoiceType("SALE");
                            setInvoiceDoc(sale);
                            setInvoiceModalOpen(true);
                          }}
                          title="Preview Invoice"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-primary"
                          onClick={() => handleOpenSale(undefined, sale)}
                          title="Edit Draft"
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-blue-500/40 text-blue-500 hover:bg-blue-500/10 font-medium"
                          onClick={() => setConfirmDraftTarget({ type: "SALE", id: sale.id })}
                          title="Confirm & Deduct Stock"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteDraftTarget({ type: "SALE", item: sale })}
                          title="Delete Draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      <AddProductModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditProduct(null);
        }}
        editProduct={editProduct}
      />

      {/* Product Invoice-Style Detail Modal */}
      <ProductDetailModal
        isOpen={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        product={detailProduct}
        stockMap={stockMap}
        onEdit={(prod) => handleEdit(prod)}
      />

      {/* Quick Purchase Modal */}
      <AddPurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => {
          setIsPurchaseModalOpen(false);
          setQuickPurchaseProduct(null);
          setEditPurchaseDraft(null);
          refetchPurchaseDrafts();
        }}
        initialProductId={quickPurchaseProduct ?? undefined}
        editPurchase={editPurchaseDraft ?? undefined}
      />

      {/* Quick Sale Modal */}
      <AddSaleModal
        isOpen={isSaleModalOpen}
        onClose={() => {
          setIsSaleModalOpen(false);
          setQuickSaleProduct(null);
          setEditSaleDraft(null);
          refetchSaleDrafts();
        }}
        initialProductId={quickSaleProduct ?? undefined}
        editSale={editSaleDraft ?? undefined}
      />

      {/* Standalone Product Invoice Viewer */}
      <ProductInvoiceModal
        isOpen={invoiceModalOpen}
        onClose={() => {
          setInvoiceModalOpen(false);
          setInvoiceDoc(null);
        }}
        type={invoiceType}
        document={invoiceDoc}
      />

      {/* Delete Product confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be permanently deleted. Products with
              transaction history cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteProduct}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Draft Order Dialog */}
      <AlertDialog
        open={!!confirmDraftTarget}
        onOpenChange={(o) => !o && setConfirmDraftTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will confirm the draft order and write live inventory ledger rows to adjust stock
              levels.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as Draft</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary text-white"
              onClick={handleConfirmDraft}
              disabled={confirmPurchase.isPending || confirmSale.isPending}
            >
              {confirmPurchase.isPending || confirmSale.isPending
                ? "Confirming..."
                : "Confirm & Write Stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Draft Order Dialog */}
      <AlertDialog
        open={!!deleteDraftTarget}
        onOpenChange={(o) => !o && setDeleteDraftTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Draft order &quot;
              {deleteDraftTarget?.item?.purchaseNumber || deleteDraftTarget?.item?.saleNumber}&quot;
              will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteDraft}
              disabled={deletePurchase.isPending || deleteSale.isPending}
            >
              {deletePurchase.isPending || deleteSale.isPending ? "Deleting..." : "Delete Draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
