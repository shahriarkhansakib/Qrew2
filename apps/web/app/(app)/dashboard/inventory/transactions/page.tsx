"use client";

/**
 * dashboard/inventory/transactions/page.tsx
 * Unified Central Ledger view — audit trail for all inventory movements:
 * - Grouped Tab Switchers:
 *   Group 1 (Main Ledger Flow): All Movements / Purchases / Sales
 *   Group 2 (Secondary Actions): Returns / Adjustments
 * - 3 View Modes: List, Tree, and Folder view options matching Files dashboard interaction pattern.
 * - Interactive Column Header Dropdowns for filtering (Type, Product, Party, State).
 * - Clean Toolbar (search & view toggles only).
 * - Standalone Product Invoice modal with direct Invoice-to-Return integration.
 * - Gated behind inventory:view_transactions (Category 4 financial data).
 */

import { format, isValid } from "date-fns";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  FolderTree,
  HardDrive,
  Layers,
  List,
  Package,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { AddAdjustmentModal } from "@/components/features/inventory/adjustments/add-adjustment-modal";
import { ProductInvoiceModal } from "@/components/features/inventory/invoices/product-invoice-modal";
import { AddPurchaseModal } from "@/components/features/inventory/purchases/add-purchase-modal";
import { AddReturnModal } from "@/components/features/inventory/returns/add-return-modal";
import { AddSaleModal } from "@/components/features/inventory/sales/add-sale-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProducts } from "@/hooks/inventory/use-products";
import { useInventoryTransactions } from "@/hooks/inventory/use-stock";
import { useColumnResizable } from "@/hooks/use-column-resizable";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { purchasesApi, returnsApi, salesApi } from "@/lib/api/inventory";
import { cn, formatNumber } from "@/lib/utils";

// ─── Transaction type color map ───────────────────────────────────────────────
const TX_COLORS: Record<string, string> = {
  PURCHASE: "bg-primary/10 text-primary border-primary/20",
  PURCHASE_RETURN: "bg-red-500/10 text-red-400 border-red-500/20",
  SALE: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  SALE_RETURN: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  ADJUSTMENT_IN: "bg-muted text-muted-foreground border-border",
  ADJUSTMENT_OUT: "bg-accent/10 text-accent-foreground border-amber-500/20",
  ADJUSTMENT: "bg-muted text-muted-foreground border-border",
};

const REAL_INVOICE_TYPES = new Set(["PURCHASE", "SALE", "PURCHASE_RETURN", "SALE_RETURN"]);

// Extract unique grouping key for real invoice/voucher grouping
function getInvoiceGroupKey(tx: any): string {
  if (!tx) return `SINGLE_${Math.random()}`;

  const refType = tx.referenceType ? String(tx.referenceType).trim().toUpperCase() : "";
  const refId = tx.referenceId ? String(tx.referenceId).trim() : "";

  // Strictly group only real invoice/voucher types (PURCHASE, SALE, PURCHASE_RETURN, SALE_RETURN) with a valid referenceId
  if (REAL_INVOICE_TYPES.has(refType) && refId) {
    return `${refType}:${refId}`;
  }

  // Standalone transactions (adjustments, single items) get a unique key per item
  return `TX:${tx.id}`;
}

// User-facing label display for invoice
function getInvoiceLabel(tx: any): string {
  if (!tx) return "#VCH-UNKNOWN";
  if (tx.referenceNumber) return `#${tx.referenceNumber}`;
  if (tx.referenceType && tx.referenceId) {
    const typePrefix =
      tx.referenceType === "PURCHASE"
        ? "PUR"
        : tx.referenceType === "SALE"
          ? "SAL"
          : tx.referenceType === "PURCHASE_RETURN"
            ? "PR"
            : tx.referenceType === "SALE_RETURN"
              ? "SR"
              : "VCH";
    return `#${typePrefix}-${String(tx.referenceId).slice(0, 8).toUpperCase()}`;
  }
  return `#VCH-${String(tx.id || "")
    .slice(0, 8)
    .toUpperCase()}`;
}

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [selectedMovements, setSelectedMovements] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "tree" | "folder">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name_asc" | "name_desc">("newest");
  const [groupByMode, setGroupByMode] = useState<"product" | "invoice">("product");
  const limit = 50;

  const toggleMovementFilter = (type: string) => {
    setSelectedMovements((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
    setPage(1);
  };

  const clearMovementFilters = () => {
    setSelectedMovements([]);
    setPage(1);
  };

  const movementButtonContent = useMemo(() => {
    if (selectedMovements.length === 0 || selectedMovements.length === 4) {
      return {
        icon: <Layers className="h-4 w-4 text-foreground shrink-0" />,
        label: "All Movements",
      };
    }
    if (selectedMovements.length === 1) {
      const single = selectedMovements[0];
      if (single === "PURCHASE")
        return {
          icon: <ShoppingCart className="h-4 w-4 text-primary shrink-0" />,
          label: "Purchases",
        };
      if (single === "SALE")
        return { icon: <TrendingUp className="h-4 w-4 text-blue-500 shrink-0" />, label: "Sales" };
      if (single === "RETURNS")
        return {
          icon: <RotateCcw className="h-4 w-4 text-orange-500 shrink-0" />,
          label: "Returns",
        };
      if (single === "ADJUSTMENT")
        return {
          icon: <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />,
          label: "Adjustments",
        };
    }
    return {
      icon: <Filter className="h-4 w-4 text-primary shrink-0" />,
      label: `${selectedMovements.length} Selected`,
    };
  }, [selectedMovements]);

  // Invoice Modal State
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<
    "PURCHASE" | "SALE" | "SALE_RETURN" | "PURCHASE_RETURN"
  >("SALE");
  const [invoiceDoc, setInvoiceDoc] = useState<any>(null);

  // Return Pre-fill State from Invoice
  const [returnPrefillDoc, setReturnPrefillDoc] = useState<any>(null);
  const [returnPrefillType, setReturnPrefillType] = useState<"PURCHASE_RETURN" | "SALE_RETURN">(
    "SALE_RETURN",
  );

  // Modals States
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

  // Expanded Tree Nodes & Folder Explorer Navigation
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [selectedFolderItem, setSelectedFolderItem] = useState<string | null>(null);

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("ledger-hidden-cols");
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
    localStorage.setItem("ledger-hidden-cols", JSON.stringify(next));
  };

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const { columnWidths, handleResizeStart, resetColumnWidth } = useColumnResizable({
    tableId: "transactions-ledger-table",
  });

  const activeApiTxType = useMemo(() => {
    if (selectedMovements.length === 1 && selectedMovements[0] === "PURCHASE") return "PURCHASE";
    if (selectedMovements.length === 1 && selectedMovements[0] === "SALE") return "SALE";
    return undefined;
  }, [selectedMovements]);

  const { data, isLoading } = useInventoryTransactions({
    transactionType: activeApiTxType,
    page,
    limit,
  });

  const { data: products } = useProducts();
  const rawTransactions = data?.data ?? [];
  const hasMore = rawTransactions.length === limit;

  // Exclude refill.in (REFILL_IN) from transactions display per requirements
  const validTransactions = useMemo(() => {
    return rawTransactions.filter((tx: any) => tx.transactionType !== "REFILL_IN");
  }, [rawTransactions]);

  const extractors = useMemo(() => {
    return {
      date: (tx: any) => (tx.createdAt ? format(new Date(tx.createdAt), "dd MMM yyyy HH:mm") : "—"),
      type: (tx: any) =>
        tx.transactionType ? `${tx.transactionType} ${tx.transactionType.replace("_", " ")}` : "—",
      product: (tx: any) => tx.product?.name ?? tx.productId ?? "—",
      party: (tx: any) => tx.partyName ?? "—",
      quantity: (tx: any) => (tx.quantity ? formatNumber(tx.quantity) : "0"),
      unitRate: (tx: any) => (tx.unitRate ? formatNumber(tx.unitRate, 2) : "—"),
      totalPrice: (tx: any) => (tx.totalPrice ? formatNumber(tx.totalPrice, 2) : "—"),
      reference: (tx: any) =>
        tx.referenceType
          ? `${tx.referenceType}/${tx.referenceId?.slice(0, 8)} ${tx.referenceId}`
          : "—",
      notes: (tx: any) => tx.notes ?? "—",
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    if (!validTransactions) return [];
    let list = validTransactions;

    if (selectedMovements.length > 0 && selectedMovements.length < 4) {
      list = list.filter((tx: any) => {
        const type = tx.transactionType;
        if (selectedMovements.includes("PURCHASE") && type === "PURCHASE") return true;
        if (selectedMovements.includes("SALE") && type === "SALE") return true;
        if (
          selectedMovements.includes("RETURNS") &&
          (type === "PURCHASE_RETURN" || type === "SALE_RETURN")
        )
          return true;
        if (
          selectedMovements.includes("ADJUSTMENT") &&
          (type === "ADJUSTMENT_IN" || type === "ADJUSTMENT_OUT" || type === "ADJUSTMENT")
        )
          return true;
        return false;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (tx: any) =>
          tx.product?.name?.toLowerCase().includes(q) ||
          tx.partyName?.toLowerCase().includes(q) ||
          tx.notes?.toLowerCase().includes(q) ||
          tx.referenceId?.toLowerCase().includes(q),
      );
    }
    return filterRows(list, extractors);
  }, [validTransactions, selectedMovements, searchQuery, filterRows, extractors]);

  // Dynamic sorting (Newest, Oldest, Name A-Z, Name Z-A)
  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    return list.sort((a: any, b: any) => {
      if (sortBy === "newest") {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      }
      if (sortBy === "oldest") {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB;
      }
      if (sortBy === "name_asc") {
        const nameA = (a.product?.name ?? a.productId ?? "").toLowerCase();
        const nameB = (b.product?.name ?? b.productId ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortBy === "name_desc") {
        const nameA = (a.product?.name ?? a.productId ?? "").toLowerCase();
        const nameB = (b.product?.name ?? b.productId ?? "").toLowerCase();
        return nameB.localeCompare(nameA);
      }
      return 0;
    });
  }, [filteredTransactions, sortBy]);

  // Invoice-based grouping for List View sub-containers
  const invoiceGroups = useMemo(() => {
    const groups: Array<{
      groupKey: string;
      invoiceLabel: string;
      referenceType: string;
      referenceId: string;
      partyName: string | null;
      createdAt: string;
      items: any[];
      totalValue: number;
      totalQty: number;
      isMultiItem: boolean;
    }> = [];

    const groupMap = new Map<string, any>();

    sortedTransactions.forEach((tx: any) => {
      const groupKey = getInvoiceGroupKey(tx);
      const label = getInvoiceLabel(tx);

      if (!groupMap.has(groupKey)) {
        const g = {
          groupKey,
          invoiceLabel: label,
          referenceType: tx.referenceType,
          referenceId: tx.referenceId,
          partyName: tx.partyName,
          createdAt: tx.createdAt,
          items: [],
          totalValue: 0,
          totalQty: 0,
          isMultiItem: false,
        };
        groupMap.set(groupKey, g);
        groups.push(g);
      }
      const group = groupMap.get(groupKey)!;
      group.items.push(tx);
      group.totalQty += parseFloat(tx.quantity || "0");
      group.totalValue += parseFloat(tx.totalPrice || "0");
      group.isMultiItem =
        group.items.length > 1 &&
        REAL_INVOICE_TYPES.has(String(tx.referenceType || "").toUpperCase());
    });

    return groups;
  }, [sortedTransactions]);

  // Options for Interactive Header Filters
  const typeOptions = useMemo(
    () => [
      { label: "Purchase (IN)", value: "PURCHASE" },
      { label: "Purchase Return", value: "PURCHASE_RETURN" },
      { label: "Sale (OUT)", value: "SALE" },
      { label: "Sale Return", value: "SALE_RETURN" },
      { label: "Adjustment IN", value: "ADJUSTMENT_IN" },
      { label: "Adjustment OUT", value: "ADJUSTMENT_OUT" },
    ],
    [],
  );

  const productOptions = useMemo(() => {
    return (products ?? []).map((p: any) => ({ label: p.name, value: p.name }));
  }, [products]);

  const partyOptions = useMemo(() => {
    const set = new Set<string>();
    validTransactions.forEach((tx: any) => {
      if (tx.partyName) set.add(tx.partyName);
    });
    return Array.from(set).map((name) => ({ label: name, value: name }));
  }, [validTransactions]);

  // Month Order Helper for Chronological Sorting (Latest Month First)
  const MONTH_ORDER = useMemo(
    () => [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    [],
  );

  // Hierarchical Data Aggregation (Year -> Month -> Product/Invoice -> Transactions)
  const hierarchicalData = useMemo(() => {
    const tree: Record<
      string,
      Record<
        string,
        Record<
          string,
          {
            groupKey: string;
            displayName: string;
            subtitle: string;
            transactions: any[];
            totalQty: number;
            totalValue: number;
          }
        >
      >
    > = {};

    sortedTransactions.forEach((tx: any) => {
      let dateObj = new Date(tx.createdAt);
      if (!isValid(dateObj)) dateObj = new Date();

      const year = format(dateObj, "yyyy");
      const month = format(dateObj, "MMMM");

      let groupKey: string;
      let displayName: string;
      let subtitle: string;

      if (groupByMode === "invoice") {
        groupKey = getInvoiceLabel(tx);
        displayName = groupKey;
        subtitle = tx.partyName
          ? `${tx.partyName} (${tx.transactionType ? tx.transactionType.replace("_", " ") : "Voucher"})`
          : tx.transactionType
            ? tx.transactionType.replace("_", " ")
            : "Voucher";
      } else {
        groupKey = tx.product?.name ?? tx.productId ?? "Uncategorized";
        displayName = groupKey;
        subtitle = tx.product?.category?.name ?? "General";
      }

      if (!tree[year]) tree[year] = {};
      if (!tree[year][month]) tree[year][month] = {};
      if (!tree[year][month][groupKey]) {
        tree[year][month][groupKey] = {
          groupKey,
          displayName,
          subtitle,
          transactions: [],
          totalQty: 0,
          totalValue: 0,
        };
      }

      const group = tree[year][month][groupKey];
      group.transactions.push(tx);
      group.totalQty += parseFloat(tx.quantity || "0");
      group.totalValue += parseFloat(tx.totalPrice || "0");
    });

    return tree;
  }, [sortedTransactions, groupByMode]);

  const sortedYears = useMemo(() => {
    return Object.keys(hierarchicalData).sort((a, b) => Number(b) - Number(a));
  }, [hierarchicalData]);

  // Auto-expand nodes in Tree View (Auto-expand all invoice folders by default in Invoice-wise mode)
  useEffect(() => {
    if (viewMode === "tree" && sortedYears.length > 0) {
      if (groupByMode === "invoice") {
        setExpandedNodes((prev) => {
          const nextExpanded: Record<string, boolean> = { ...prev };
          sortedYears.forEach((year) => {
            nextExpanded[`year-${year}`] = true;
            const months = Object.keys(hierarchicalData[year] || {});
            months.forEach((month) => {
              nextExpanded[`year-${year}-month-${month}`] = true;
              const groups = Object.values(hierarchicalData[year][month] || {});
              groups.forEach((g) => {
                const k = `year-${year}-month-${month}-group-${g.groupKey}`;
                if (nextExpanded[k] === undefined) {
                  nextExpanded[k] = true;
                }
              });
            });
          });
          return nextExpanded;
        });
      } else {
        const firstYear = sortedYears[0];
        const yearMonths = Object.keys(hierarchicalData[firstYear] || {}).sort(
          (a, b) => MONTH_ORDER.indexOf(b) - MONTH_ORDER.indexOf(a),
        );
        const firstMonth = yearMonths[0];
        if (firstYear && firstMonth) {
          setExpandedNodes((prev) => {
            if (Object.keys(prev).length === 0) {
              return {
                [`year-${firstYear}`]: true,
                [`year-${firstYear}-month-${firstMonth}`]: true,
              };
            }
            return prev;
          });
        }
      }
    }
  }, [viewMode, groupByMode, sortedYears, hierarchicalData, MONTH_ORDER]);

  // Open Standalone Product Invoice Modal for Purchase, Sale, or Return reference
  async function handleOpenInvoice(tx: any) {
    if (!tx.referenceId) return;
    try {
      if (tx.referenceType === "PURCHASE") {
        const doc = await purchasesApi.getById(tx.referenceId);
        setInvoiceType("PURCHASE");
        setInvoiceDoc(doc);
        setInvoiceModalOpen(true);
      } else if (tx.referenceType === "SALE") {
        const doc = await salesApi.getById(tx.referenceId);
        setInvoiceType("SALE");
        setInvoiceDoc(doc);
        setInvoiceModalOpen(true);
      } else if (tx.referenceType === "SALE_RETURN" || tx.transactionType === "SALE_RETURN") {
        const doc = await returnsApi.getSaleReturnById(tx.referenceId);
        setInvoiceType("SALE_RETURN");
        setInvoiceDoc(doc);
        setInvoiceModalOpen(true);
      } else if (
        tx.referenceType === "PURCHASE_RETURN" ||
        tx.transactionType === "PURCHASE_RETURN"
      ) {
        const doc = await returnsApi.getPurchaseReturnById(tx.referenceId);
        setInvoiceType("PURCHASE_RETURN");
        setInvoiceDoc(doc);
        setInvoiceModalOpen(true);
      } else {
        toast.info("Invoice is available for Purchase, Sale, and Return transactions.");
      }
    } catch (err: any) {
      toast.error(`Could not load invoice details: ${err.message}`);
    }
  }

  // Trigger Return from Invoice Viewer
  function handleReturnFromInvoice(doc: any, type: "PURCHASE" | "SALE") {
    setReturnPrefillDoc(doc);
    setReturnPrefillType(type === "PURCHASE" ? "PURCHASE_RETURN" : "SALE_RETURN");
    setInvoiceModalOpen(false);
    setIsReturnModalOpen(true);
  }

  const toggleTreeNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  return (
    <Can
      I="inventory:view_transactions"
      fallback={
        <div className="py-16 text-center text-muted-foreground">
          You don&apos;t have permission to view the transaction ledger.
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Header with integrated quick actions */}
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Central audit trail for all inventory movements
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Can I="inventory:create_purchase">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsPurchaseModalOpen(true)}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <ShoppingCart className="h-4 w-4 mr-1.5" /> + Purchase
              </Button>
            </Can>
            <Can I="inventory:create_sale">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsSaleModalOpen(true)}
                className="border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
              >
                <TrendingUp className="h-4 w-4 mr-1.5" /> + Sell
              </Button>
            </Can>
            <Can I="inventory:create_purchase">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setReturnPrefillDoc(null);
                  setIsReturnModalOpen(true);
                }}
                className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> + Return
              </Button>
            </Can>
            <Can I="inventory:create_purchase">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsAdjustmentModalOpen(true)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                <SlidersHorizontal className="h-4 w-4 mr-1.5" /> + Adjustment
              </Button>
            </Can>
          </div>
        </div>

        {/* Filter & View Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card p-3 rounded-lg border">
          {/* 1. Left Side: View Switcher (List, Tree, Folder) + Grouping Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(val) => val && setViewMode(val as any)}
            >
              <ToggleGroupItem value="list" aria-label="List View">
                <List className="h-4 w-4 mr-1.5" /> List
              </ToggleGroupItem>
              <ToggleGroupItem value="tree" aria-label="Tree View">
                <FolderTree className="h-4 w-4 mr-1.5" /> Tree
              </ToggleGroupItem>
              <ToggleGroupItem value="folder" aria-label="Folder View">
                <Folder className="h-4 w-4 mr-1.5" /> Folder
              </ToggleGroupItem>
            </ToggleGroup>

            {viewMode !== "list" && (
              <div className="flex items-center gap-1.5 pl-2.5 border-l">
                <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                  Group by:
                </span>
                <ToggleGroup
                  type="single"
                  value={groupByMode}
                  onValueChange={(val) => {
                    if (val) {
                      setGroupByMode(val as any);
                      setFolderPath([]);
                      setSelectedFolderItem(null);
                    }
                  }}
                  className="bg-muted/40 p-0.5 rounded-lg border"
                >
                  <ToggleGroupItem
                    value="product"
                    className="h-7 text-xs px-2.5"
                    aria-label="Product-wise"
                  >
                    <Package className="h-3.5 w-3.5 mr-1 text-primary" /> Product-wise
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="invoice"
                    className="h-7 text-xs px-2.5"
                    aria-label="Invoice-wise"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1 text-purple-500" /> Invoice-wise
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}
          </div>

          {/* 2. Right Side: Search, Movement Category Dropdown, Column Visibility */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search ledger..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Combined Multi-Select Movement Filters Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 min-w-[160px] justify-between"
                >
                  <div className="flex items-center gap-2 truncate">
                    {movementButtonContent.icon}
                    <span className="font-medium text-xs truncate">
                      {movementButtonContent.label}
                    </span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                  Filter Movements
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedMovements.includes("PURCHASE")}
                  onCheckedChange={() => toggleMovementFilter("PURCHASE")}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs font-medium cursor-pointer"
                >
                  <ShoppingCart className="h-4 w-4 text-primary mr-2 shrink-0" />
                  <span>Purchases</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={selectedMovements.includes("SALE")}
                  onCheckedChange={() => toggleMovementFilter("SALE")}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs font-medium cursor-pointer"
                >
                  <TrendingUp className="h-4 w-4 text-blue-500 mr-2 shrink-0" />
                  <span>Sales</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={selectedMovements.includes("RETURNS")}
                  onCheckedChange={() => toggleMovementFilter("RETURNS")}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs font-medium cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4 text-orange-500 mr-2 shrink-0" />
                  <span>Returns</span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={selectedMovements.includes("ADJUSTMENT")}
                  onCheckedChange={() => toggleMovementFilter("ADJUSTMENT")}
                  onSelect={(e) => e.preventDefault()}
                  className="text-xs font-medium cursor-pointer"
                >
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                  <span>Adjustments</span>
                </DropdownMenuCheckboxItem>
                {selectedMovements.length > 0 && selectedMovements.length < 4 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={clearMovementFilters}
                      className="text-xs text-center justify-center font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Reset to All Movements
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort by Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-xs">
                    {sortBy === "newest" && "Created (Newest)"}
                    {sortBy === "oldest" && "Created (Oldest)"}
                    {sortBy === "name_asc" && "Name A-Z"}
                    {sortBy === "name_desc" && "Name Z-A"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => setSortBy("newest")}
                  className={cn(
                    "flex items-center gap-2 text-xs font-medium cursor-pointer",
                    sortBy === "newest" && "bg-accent font-semibold",
                  )}
                >
                  <span>Created (Newest)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("oldest")}
                  className={cn(
                    "flex items-center gap-2 text-xs font-medium cursor-pointer",
                    sortBy === "oldest" && "bg-accent font-semibold",
                  )}
                >
                  <span>Created (Oldest)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("name_asc")}
                  className={cn(
                    "flex items-center gap-2 text-xs font-medium cursor-pointer",
                    sortBy === "name_asc" && "bg-accent font-semibold",
                  )}
                >
                  <span>Name A-Z</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("name_desc")}
                  className={cn(
                    "flex items-center gap-2 text-xs font-medium cursor-pointer",
                    sortBy === "name_desc" && "bg-accent font-semibold",
                  )}
                >
                  <span>Name Z-A</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {viewMode === "list" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    <span>View</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[180px]">
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.date}
                    onCheckedChange={(c) => toggleColumn("date", c)}
                  >
                    Date
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.type}
                    onCheckedChange={(c) => toggleColumn("type", c)}
                  >
                    Type
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.product}
                    onCheckedChange={(c) => toggleColumn("product", c)}
                  >
                    Product
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.party}
                    onCheckedChange={(c) => toggleColumn("party", c)}
                  >
                    Party Name
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.quantity}
                    onCheckedChange={(c) => toggleColumn("quantity", c)}
                  >
                    Qty
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.unitRate}
                    onCheckedChange={(c) => toggleColumn("unitRate", c)}
                  >
                    Unit Rate
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.totalPrice}
                    onCheckedChange={(c) => toggleColumn("totalPrice", c)}
                  >
                    Total Price
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.reference}
                    onCheckedChange={(c) => toggleColumn("reference", c)}
                  >
                    Reference
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.notes}
                    onCheckedChange={(c) => toggleColumn("notes", c)}
                  >
                    Notes
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* VIEW MODE 1: LIST VIEW (INVOICE SUB-CONTAINERS) */}
        {viewMode === "list" && (
          <div className="rounded-md border bg-card overflow-x-auto shadow-2xs">
            <Table className="w-full table-fixed border-collapse">
              <TableHeader className="bg-muted/50 sticky top-0 z-10 border-b">
                <TableRow>
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
                  {!hiddenCols.type && (
                    <FilterableTableHeader
                      columnKey="type"
                      title="Type"
                      isFiltered={isColumnFiltered("type")}
                      activeValue={filters.type}
                      onClear={() => clearColumnFilter("type")}
                      options={typeOptions}
                      onSelectOption={(_, val) => toggleFilter("type", val)}
                      width={columnWidths.type}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                    />
                  )}
                  {!hiddenCols.product && (
                    <FilterableTableHeader
                      columnKey="product"
                      title="Product"
                      isFiltered={isColumnFiltered("product")}
                      activeValue={filters.product}
                      onClear={() => clearColumnFilter("product")}
                      options={productOptions}
                      onSelectOption={(_, val) => toggleFilter("product", val)}
                      width={columnWidths.product}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                    />
                  )}
                  {!hiddenCols.party && (
                    <FilterableTableHeader
                      columnKey="party"
                      title="Party Name"
                      isFiltered={isColumnFiltered("party")}
                      activeValue={filters.party}
                      onClear={() => clearColumnFilter("party")}
                      options={partyOptions}
                      onSelectOption={(_, val) => toggleFilter("party", val)}
                      width={columnWidths.party}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                    />
                  )}
                  {!hiddenCols.quantity && (
                    <FilterableTableHeader
                      columnKey="quantity"
                      title="Qty"
                      isFiltered={isColumnFiltered("quantity")}
                      activeValue={filters.quantity}
                      onClear={() => clearColumnFilter("quantity")}
                      width={columnWidths.quantity}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                      className="text-right"
                    />
                  )}
                  {!hiddenCols.unitRate && (
                    <FilterableTableHeader
                      columnKey="unitRate"
                      title="Unit Rate"
                      isFiltered={isColumnFiltered("unitRate")}
                      activeValue={filters.unitRate}
                      onClear={() => clearColumnFilter("unitRate")}
                      width={columnWidths.unitRate}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                      className="text-right"
                    />
                  )}
                  {!hiddenCols.totalPrice && (
                    <FilterableTableHeader
                      columnKey="totalPrice"
                      title="Total (৳)"
                      isFiltered={isColumnFiltered("totalPrice")}
                      activeValue={filters.totalPrice}
                      onClear={() => clearColumnFilter("totalPrice")}
                      width={columnWidths.totalPrice}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                      className="text-right"
                    />
                  )}
                  {!hiddenCols.reference && (
                    <FilterableTableHeader
                      columnKey="reference"
                      title="Reference"
                      isFiltered={isColumnFiltered("reference")}
                      activeValue={filters.reference}
                      onClear={() => clearColumnFilter("reference")}
                      width={columnWidths.reference}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                    />
                  )}
                  {!hiddenCols.notes && (
                    <FilterableTableHeader
                      columnKey="notes"
                      title="Notes"
                      isFiltered={isColumnFiltered("notes")}
                      activeValue={filters.notes}
                      onClear={() => clearColumnFilter("notes")}
                      width={columnWidths.notes}
                      onResizeStart={handleResizeStart}
                      onResetWidth={resetColumnWidth}
                    />
                  )}
                  <TableHead className="text-right w-24 font-medium text-muted-foreground select-none">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>

              {isLoading ? (
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={11} className="p-8 text-center text-muted-foreground">
                      Loading ledger...
                    </TableCell>
                  </TableRow>
                </TableBody>
              ) : !invoiceGroups.length ? (
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={11} className="p-8 text-center text-muted-foreground">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                </TableBody>
              ) : (
                invoiceGroups.map((group) => {
                  const isMulti = group.isMultiItem;

                  return (
                    <TableBody
                      key={`inv-card-${group.groupKey}`}
                      className={cn(
                        "transition-all border-b last:border-b-0",
                        isMulti && "bg-primary/5 dark:bg-primary/10 border-b border-primary/30",
                      )}
                    >
                      {group.items.map((tx: any, idx: number) => {
                        const qty = parseFloat(tx.quantity);
                        const isNeg = qty < 0;
                        const canViewInvoice = Boolean(
                          tx.referenceType === "PURCHASE" ||
                            tx.referenceType === "SALE" ||
                            tx.referenceType === "SALE_RETURN" ||
                            tx.referenceType === "PURCHASE_RETURN" ||
                            tx.transactionType === "SALE_RETURN" ||
                            tx.transactionType === "PURCHASE_RETURN",
                        );
                        const isLastInGroup = idx === group.items.length - 1;

                        return (
                          <TableRow
                            key={tx.id}
                            className={cn(
                              "hover:bg-muted/30 transition-colors",
                              isMulti
                                ? isLastInGroup
                                  ? "border-b border-primary/30"
                                  : "border-b-0"
                                : "border-b last:border-b-0",
                            )}
                          >
                            {!hiddenCols.date && (
                              <FilterableTableCell
                                columnKey="date"
                                value={format(new Date(tx.createdAt), "dd MMM yyyy HH:mm")}
                                isFiltered={isColumnFiltered("date")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.date}
                              >
                                <span className="text-muted-foreground text-xs">
                                  {format(new Date(tx.createdAt), "dd MMM yyyy HH:mm")}
                                </span>
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.type && (
                              <FilterableTableCell
                                columnKey="type"
                                value={tx.transactionType.replace("_", " ")}
                                isFiltered={isColumnFiltered("type")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.type}
                              >
                                <span
                                  className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                                    TX_COLORS[tx.transactionType] ??
                                      "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {tx.transactionType.replace("_", " ")}
                                </span>
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.product && (
                              <FilterableTableCell
                                columnKey="product"
                                value={tx.product?.name ?? tx.productId}
                                isFiltered={isColumnFiltered("product")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.product}
                              >
                                <span className="font-medium">
                                  {tx.product?.name ?? tx.productId}
                                </span>
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.party && (
                              <FilterableTableCell
                                columnKey="party"
                                value={tx.partyName ?? "—"}
                                isFiltered={isColumnFiltered("party")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.party}
                              >
                                <span className="font-medium text-xs text-muted-foreground">
                                  {tx.partyName ?? "—"}
                                </span>
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.quantity && (
                              <FilterableTableCell
                                columnKey="quantity"
                                value={formatNumber(qty)}
                                isFiltered={isColumnFiltered("quantity")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.quantity}
                                className="text-right font-mono font-medium"
                              >
                                <span className={isNeg ? "text-red-400" : "text-primary"}>
                                  {isNeg ? "" : "+"}
                                  {formatNumber(qty)}
                                </span>
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.unitRate && (
                              <FilterableTableCell
                                columnKey="unitRate"
                                value={
                                  tx.unitRate != null &&
                                  tx.unitRate !== "" &&
                                  !Number.isNaN(parseFloat(tx.unitRate))
                                    ? formatNumber(tx.unitRate, 2)
                                    : "—"
                                }
                                isFiltered={isColumnFiltered("unitRate")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.unitRate}
                                className="text-right font-mono text-xs"
                              >
                                {tx.unitRate != null &&
                                tx.unitRate !== "" &&
                                !Number.isNaN(parseFloat(tx.unitRate))
                                  ? `৳${formatNumber(tx.unitRate, 2)}`
                                  : "—"}
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.totalPrice && (
                              <FilterableTableCell
                                columnKey="totalPrice"
                                value={
                                  tx.totalPrice != null &&
                                  tx.totalPrice !== "" &&
                                  !Number.isNaN(parseFloat(tx.totalPrice))
                                    ? formatNumber(tx.totalPrice, 2)
                                    : "—"
                                }
                                isFiltered={isColumnFiltered("totalPrice")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.totalPrice}
                                className="text-right font-mono font-medium text-xs"
                              >
                                {tx.totalPrice != null &&
                                tx.totalPrice !== "" &&
                                !Number.isNaN(parseFloat(tx.totalPrice))
                                  ? `৳${formatNumber(tx.totalPrice, 2)}`
                                  : "—"}
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.reference && (
                              <FilterableTableCell
                                columnKey="reference"
                                value={`${tx.referenceType}/${tx.referenceId?.slice(0, 8)}`}
                                isFiltered={isColumnFiltered("reference")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.reference}
                              >
                                <span className="text-muted-foreground text-xs font-mono">
                                  {tx.referenceType
                                    ? `${tx.referenceType}/${tx.referenceId?.slice(0, 8)}`
                                    : "—"}
                                </span>
                              </FilterableTableCell>
                            )}
                            {!hiddenCols.notes && (
                              <FilterableTableCell
                                columnKey="notes"
                                value={tx.notes ?? "—"}
                                isFiltered={isColumnFiltered("notes")}
                                onToggleFilter={toggleFilter}
                                width={columnWidths.notes}
                              >
                                <span className="text-muted-foreground text-xs max-w-[200px] truncate">
                                  {tx.notes ?? "—"}
                                </span>
                              </FilterableTableCell>
                            )}
                            <TableCell className="text-right">
                              {canViewInvoice ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-7 text-xs px-2 gap-1 font-medium transition-colors",
                                    tx.referenceType === "SALE_RETURN" ||
                                      tx.referenceType === "PURCHASE_RETURN" ||
                                      tx.transactionType === "SALE_RETURN" ||
                                      tx.transactionType === "PURCHASE_RETURN"
                                      ? "text-primary hover:text-primary hover:bg-emerald-50 dark:text-primary dark:hover:bg-emerald-950/40"
                                      : "text-primary hover:bg-primary/10",
                                  )}
                                  onClick={() => handleOpenInvoice(tx)}
                                  title="View Voucher / Invoice"
                                >
                                  <FileText className="h-3.5 w-3.5" /> Invoice
                                </Button>
                              ) : (
                                <span className="text-muted-foreground/30 text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  );
                })
              )}
            </Table>
          </div>
        )}

        {/* VIEW MODE 2: TREE VIEW (Year -> Month -> Product -> Transactions) */}
        {viewMode === "tree" && (
          <div className="space-y-4 rounded-md border bg-card p-4">
            {!sortedYears.length ? (
              <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
                <Folder className="h-10 w-10 mb-2 opacity-40" />
                <p>No hierarchical ledger data found.</p>
              </div>
            ) : (
              sortedYears.map((year) => {
                const yearMonths = Object.keys(hierarchicalData[year]).sort(
                  (a, b) => MONTH_ORDER.indexOf(b) - MONTH_ORDER.indexOf(a),
                );
                const yearTotalEntries = yearMonths.reduce((sum, month) => {
                  return (
                    sum +
                    Object.values(hierarchicalData[year][month]).reduce(
                      (mSum, p) => mSum + p.transactions.length,
                      0,
                    )
                  );
                }, 0);
                const isYearExpanded = !!expandedNodes[`year-${year}`];

                return (
                  <div key={`year-${year}`} className="space-y-1">
                    {/* YEAR NODE */}
                    <div
                      className="flex items-center justify-between p-2.5 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                      onClick={() => toggleTreeNode(`year-${year}`)}
                    >
                      <div className="flex items-center gap-2">
                        {isYearExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        {isYearExpanded ? (
                          <FolderOpen className="h-5 w-5 text-blue-500 fill-blue-500/20" />
                        ) : (
                          <Folder className="h-5 w-5 text-blue-500 fill-blue-500/20" />
                        )}
                        <span className="font-semibold text-base text-foreground">{year}</span>
                        <Badge variant="secondary" className="ml-2 bg-secondary/50 text-xs">
                          {yearTotalEntries} {yearTotalEntries === 1 ? "entry" : "entries"}
                        </Badge>
                      </div>
                    </div>

                    {/* MONTHS NODES */}
                    {isYearExpanded && (
                      <div className="pl-6 space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                        {yearMonths.map((month) => {
                          const monthProducts = Object.values(hierarchicalData[year][month]);
                          const monthTotalEntries = monthProducts.reduce(
                            (sum, p) => sum + p.transactions.length,
                            0,
                          );
                          const isMonthExpanded = !!expandedNodes[`year-${year}-month-${month}`];

                          return (
                            <div
                              key={`year-${year}-month-${month}`}
                              className="space-y-1 relative before:absolute before:left-3 before:top-0 before:bottom-0 before:w-px before:bg-border/50"
                            >
                              <div
                                className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors relative"
                                onClick={() => toggleTreeNode(`year-${year}-month-${month}`)}
                              >
                                <div className="absolute left-3 top-1/2 w-3 h-px bg-border/50 -translate-y-1/2" />
                                <div className="pl-6 flex items-center gap-2">
                                  {isMonthExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  {isMonthExpanded ? (
                                    <FolderOpen className="h-4 w-4 text-accent-foreground fill-amber-500/20" />
                                  ) : (
                                    <Folder className="h-4 w-4 text-accent-foreground fill-amber-500/20" />
                                  )}
                                  <span className="font-medium text-sm text-foreground">
                                    {month}
                                  </span>
                                  <span className="text-xs text-muted-foreground/80">
                                    ({monthTotalEntries}{" "}
                                    {monthTotalEntries === 1 ? "entry" : "entries"})
                                  </span>
                                </div>
                              </div>

                              {/* GROUP NODES (Product-wise or Invoice-wise) */}
                              {isMonthExpanded && (
                                <div className="pl-12 space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                  {monthProducts.map((prodGroup) => {
                                    const nodeKey = `year-${year}-month-${month}-group-${prodGroup.groupKey}`;
                                    const isProdExpanded =
                                      groupByMode === "invoice"
                                        ? expandedNodes[nodeKey] !== false
                                        : !!expandedNodes[nodeKey];

                                    return (
                                      <div
                                        key={nodeKey}
                                        className="space-y-1 relative before:absolute before:left-3 before:top-0 before:bottom-0 before:w-px before:bg-border/50"
                                      >
                                        <div
                                          className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors relative"
                                          onClick={() => toggleTreeNode(nodeKey)}
                                        >
                                          <div className="absolute left-3 top-1/2 w-3 h-px bg-border/50 -translate-y-1/2" />
                                          <div className="pl-6 flex items-center gap-2">
                                            {isProdExpanded ? (
                                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                            ) : (
                                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                            {groupByMode === "invoice" ? (
                                              <FileText className="h-4 w-4 text-purple-500" />
                                            ) : (
                                              <Package className="h-4 w-4 text-primary" />
                                            )}
                                            <span className="font-semibold text-xs text-foreground">
                                              {prodGroup.displayName}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground">
                                              ({prodGroup.subtitle})
                                            </span>
                                            <Badge variant="outline" className="text-[10px]">
                                              {prodGroup.transactions.length} entries
                                            </Badge>
                                          </div>
                                          <div className="flex items-center gap-3 text-xs font-mono">
                                            <span className="text-muted-foreground">
                                              Net Qty:{" "}
                                              <strong
                                                className={
                                                  prodGroup.totalQty < 0
                                                    ? "text-red-400"
                                                    : "text-primary"
                                                }
                                              >
                                                {prodGroup.totalQty > 0
                                                  ? `+${formatNumber(prodGroup.totalQty)}`
                                                  : formatNumber(prodGroup.totalQty)}
                                              </strong>
                                            </span>
                                            <span className="text-muted-foreground">
                                              Total:{" "}
                                              <strong className="text-foreground">
                                                ৳{formatNumber(prodGroup.totalValue, 2)}
                                              </strong>
                                            </span>
                                          </div>
                                        </div>

                                        {/* TRANSACTIONS TABLE */}
                                        {isProdExpanded && (
                                          <div className="pl-12 py-2">
                                            <div className="border rounded-md overflow-hidden bg-background shadow-xs">
                                              <Table>
                                                <TableHeader>
                                                  <TableRow className="bg-muted/50 text-xs">
                                                    <TableCell className="w-36">Date</TableCell>
                                                    <TableCell className="w-32">Type</TableCell>
                                                    <TableCell>Party</TableCell>
                                                    <TableCell className="text-right w-24">
                                                      Qty
                                                    </TableCell>
                                                    <TableCell className="text-right w-24">
                                                      Rate (৳)
                                                    </TableCell>
                                                    <TableCell className="text-right w-28">
                                                      Total (৳)
                                                    </TableCell>
                                                    <TableCell className="text-right w-24">
                                                      Action
                                                    </TableCell>
                                                  </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                  {prodGroup.transactions.map((tx: any) => (
                                                    <TableRow
                                                      key={tx.id}
                                                      className="hover:bg-muted/20 text-xs"
                                                    >
                                                      <TableCell className="text-muted-foreground">
                                                        {format(
                                                          new Date(tx.createdAt),
                                                          "dd MMM yyyy HH:mm",
                                                        )}
                                                      </TableCell>
                                                      <TableCell>
                                                        <span
                                                          className={cn(
                                                            "px-1.5 py-0.5 rounded text-[11px] font-medium border",
                                                            TX_COLORS[tx.transactionType] ??
                                                              "bg-muted text-muted-foreground",
                                                          )}
                                                        >
                                                          {tx.transactionType.replace("_", " ")}
                                                        </span>
                                                      </TableCell>
                                                      <TableCell>{tx.partyName ?? "—"}</TableCell>
                                                      <TableCell className="text-right font-mono">
                                                        <span
                                                          className={
                                                            parseFloat(tx.quantity) < 0
                                                              ? "text-red-400"
                                                              : "text-primary"
                                                          }
                                                        >
                                                          {parseFloat(tx.quantity) > 0
                                                            ? `+${formatNumber(tx.quantity)}`
                                                            : formatNumber(tx.quantity)}
                                                        </span>
                                                      </TableCell>
                                                      <TableCell className="text-right font-mono">
                                                        {tx.unitRate != null &&
                                                        tx.unitRate !== "" &&
                                                        !Number.isNaN(parseFloat(tx.unitRate))
                                                          ? `৳${formatNumber(tx.unitRate, 2)}`
                                                          : "—"}
                                                      </TableCell>
                                                      <TableCell className="text-right font-mono font-medium">
                                                        {tx.totalPrice != null &&
                                                        tx.totalPrice !== "" &&
                                                        !Number.isNaN(parseFloat(tx.totalPrice))
                                                          ? `৳${formatNumber(tx.totalPrice, 2)}`
                                                          : "—"}
                                                      </TableCell>
                                                      <TableCell className="text-right">
                                                        {tx.referenceType === "PURCHASE" ||
                                                        tx.referenceType === "SALE" ||
                                                        tx.referenceType === "SALE_RETURN" ||
                                                        tx.referenceType === "PURCHASE_RETURN" ||
                                                        tx.transactionType === "SALE_RETURN" ||
                                                        tx.transactionType === "PURCHASE_RETURN" ? (
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className={cn(
                                                              "h-6 px-1.5 text-[10px] font-medium gap-1",
                                                              tx.referenceType === "SALE_RETURN" ||
                                                                tx.referenceType ===
                                                                  "PURCHASE_RETURN" ||
                                                                tx.transactionType ===
                                                                  "SALE_RETURN" ||
                                                                tx.transactionType ===
                                                                  "PURCHASE_RETURN"
                                                                ? "text-primary hover:text-primary hover:bg-emerald-50 dark:text-primary dark:hover:bg-emerald-950/40"
                                                                : "text-primary hover:bg-muted",
                                                            )}
                                                            onClick={() => handleOpenInvoice(tx)}
                                                          >
                                                            <FileText className="h-3 w-3" /> Invoice
                                                          </Button>
                                                        ) : (
                                                          <span className="text-muted-foreground/30 text-xs">
                                                            —
                                                          </span>
                                                        )}
                                                      </TableCell>
                                                    </TableRow>
                                                  ))}
                                                </TableBody>
                                              </Table>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* VIEW MODE 3: FOLDER VIEW (Files Explorer Style & Hierarchy) */}
        {viewMode === "folder" && (
          <div className="space-y-4 rounded-md border bg-card p-4">
            {/* Windows File Explorer Address Bar / Breadcrumbs */}
            <div className="flex items-center gap-2 p-2 bg-muted/40 border rounded-md overflow-x-auto text-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (folderPath.length > 0) {
                    setFolderPath(folderPath.slice(0, folderPath.length - 1));
                    setSelectedFolderItem(null);
                  }
                }}
                disabled={folderPath.length === 0}
                className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                title="Up one level"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1.5 flex-1 min-w-0 font-medium text-muted-foreground truncate">
                <button
                  type="button"
                  onClick={() => {
                    setFolderPath([]);
                    setSelectedFolderItem(null);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors",
                    folderPath.length === 0 && "text-foreground font-semibold bg-muted/60",
                  )}
                >
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span>Ledger</span>
                </button>

                {folderPath[0] && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <button
                      type="button"
                      onClick={() => {
                        setFolderPath([folderPath[0]]);
                        setSelectedFolderItem(null);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors truncate",
                        folderPath.length === 1 && "text-foreground font-semibold bg-muted/60",
                      )}
                    >
                      <Folder className="h-4 w-4 text-blue-500 fill-blue-500/20 shrink-0" />
                      <span>{folderPath[0]}</span>
                    </button>
                  </>
                )}

                {folderPath[1] && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <button
                      type="button"
                      onClick={() => {
                        setFolderPath([folderPath[0], folderPath[1]]);
                        setSelectedFolderItem(null);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors truncate",
                        folderPath.length === 2 && "text-foreground font-semibold bg-muted/60",
                      )}
                    >
                      <Folder className="h-4 w-4 text-accent-foreground fill-amber-500/20 shrink-0" />
                      <span>{folderPath[1]}</span>
                    </button>
                  </>
                )}

                {folderPath[2] && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <button
                      type="button"
                      onClick={() => {
                        setFolderPath([folderPath[0], folderPath[1], folderPath[2]]);
                        setSelectedFolderItem(null);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted hover:text-foreground transition-colors truncate",
                        folderPath.length === 3 && "text-foreground font-semibold bg-muted/60",
                      )}
                    >
                      {groupByMode === "invoice" ? (
                        <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                      ) : (
                        <Package className="h-4 w-4 text-primary shrink-0" />
                      )}
                      <span>{folderPath[2]}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* DIRECTORY CONTENT PANELS */}

            {/* LEVEL 0: ROOT / YEARS VIEW */}
            {folderPath.length === 0 && (
              <div>
                {!sortedYears.length ? (
                  <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
                    <Folder className="h-10 w-10 mb-2 opacity-40" />
                    <p>No ledger entries or folders found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {sortedYears.map((year) => {
                      const yearMonths = Object.keys(hierarchicalData[year]);
                      const yearTotalEntries = yearMonths.reduce((sum, month) => {
                        return (
                          sum +
                          Object.values(hierarchicalData[year][month]).reduce(
                            (mSum, p) => mSum + p.transactions.length,
                            0,
                          )
                        );
                      }, 0);
                      const isSelected = selectedFolderItem === `year-${year}`;

                      return (
                        <div
                          key={`explorer-year-${year}`}
                          onClick={() => setSelectedFolderItem(`year-${year}`)}
                          onDoubleClick={() => {
                            setSelectedFolderItem(`year-${year}`);
                            setFolderPath([year]);
                          }}
                          title="Double-click to open"
                          className={cn(
                            "group flex flex-col items-center justify-center p-4 rounded-xl border bg-background hover:bg-accent/40 cursor-pointer select-none transition-all duration-150 text-center shadow-xs",
                            isSelected &&
                              "border-primary bg-primary/10 dark:bg-primary/20 ring-2 ring-primary/30",
                          )}
                        >
                          <div className="relative mb-2">
                            <Folder className="h-16 w-16 text-blue-500 fill-blue-500/20 group-hover:scale-105 transition-transform" />
                          </div>
                          <span className="font-semibold text-sm truncate max-w-full text-foreground">
                            {year}
                          </span>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {yearTotalEntries} {yearTotalEntries === 1 ? "entry" : "entries"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* LEVEL 1: YEAR SELECTED / MONTHS VIEW */}
            {folderPath.length === 1 && folderPath[0] && (
              <div>
                {(() => {
                  const currentYear = folderPath[0];
                  const monthsForYear = Object.keys(hierarchicalData[currentYear] || {}).sort(
                    (a, b) => MONTH_ORDER.indexOf(b) - MONTH_ORDER.indexOf(a),
                  );

                  if (monthsForYear.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
                        <Folder className="h-10 w-10 mb-2 opacity-40" />
                        <p>No month folders found in {currentYear}.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {monthsForYear.map((month) => {
                        const monthProducts = Object.values(hierarchicalData[currentYear][month]);
                        const monthTotalEntries = monthProducts.reduce(
                          (sum, p) => sum + p.transactions.length,
                          0,
                        );
                        const isSelected = selectedFolderItem === `month-${month}`;

                        return (
                          <div
                            key={`explorer-month-${month}`}
                            onClick={() => setSelectedFolderItem(`month-${month}`)}
                            onDoubleClick={() => {
                              setSelectedFolderItem(`month-${month}`);
                              setFolderPath([currentYear, month]);
                            }}
                            title="Double-click to open"
                            className={cn(
                              "group flex flex-col items-center justify-center p-4 rounded-xl border bg-background hover:bg-accent/40 cursor-pointer select-none transition-all duration-150 text-center shadow-xs",
                              isSelected &&
                                "border-amber-500 bg-accent/10 dark:bg-accent/20 ring-2 ring-amber-500/30",
                            )}
                          >
                            <div className="relative mb-2">
                              <Folder className="h-16 w-16 text-accent-foreground fill-amber-500/20 group-hover:scale-105 transition-transform" />
                            </div>
                            <span className="font-semibold text-sm truncate max-w-full text-foreground">
                              {month}
                            </span>
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {monthTotalEntries} {monthTotalEntries === 1 ? "entry" : "entries"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* LEVEL 2: MONTH SELECTED / PRODUCTS OR INVOICES VIEW */}
            {folderPath.length === 2 && folderPath[0] && folderPath[1] && (
              <div>
                {(() => {
                  const currentYear = folderPath[0];
                  const currentMonth = folderPath[1];
                  const groupsList = Object.values(
                    hierarchicalData[currentYear]?.[currentMonth] || {},
                  );

                  if (groupsList.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
                        <Folder className="h-10 w-10 mb-2 opacity-40" />
                        <p>
                          No items found in {currentMonth} {currentYear}.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {groupsList.map((nodeGroup) => {
                        const isSelected = selectedFolderItem === `group-${nodeGroup.groupKey}`;

                        return (
                          <div
                            key={`explorer-group-${nodeGroup.groupKey}`}
                            onClick={() => setSelectedFolderItem(`group-${nodeGroup.groupKey}`)}
                            onDoubleClick={() => {
                              setSelectedFolderItem(`group-${nodeGroup.groupKey}`);
                              setFolderPath([currentYear, currentMonth, nodeGroup.groupKey]);
                            }}
                            title="Double-click to open"
                            className={cn(
                              "rounded-lg border bg-card p-4 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3 group select-none",
                              groupByMode === "invoice"
                                ? "hover:border-purple-500/50"
                                : "hover:border-primary/50",
                              isSelected &&
                                (groupByMode === "invoice"
                                  ? "border-purple-500 ring-2 ring-purple-500/30 bg-purple-500/5"
                                  : "border-primary ring-2 ring-primary/30 bg-primary/5"),
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={cn(
                                    "p-2 rounded-md transition-colors",
                                    groupByMode === "invoice"
                                      ? "bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-white"
                                      : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white",
                                  )}
                                >
                                  {groupByMode === "invoice" ? (
                                    <FileText className="h-5 w-5" />
                                  ) : (
                                    <Package className="h-5 w-5" />
                                  )}
                                </div>
                                <div>
                                  <h3 className="font-semibold text-sm line-clamp-1">
                                    {nodeGroup.displayName}
                                  </h3>
                                  <span className="text-xs text-muted-foreground line-clamp-1">
                                    {nodeGroup.subtitle}
                                  </span>
                                </div>
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {nodeGroup.transactions.length} entries
                              </Badge>
                            </div>

                            <div className="pt-2 border-t flex justify-between items-center text-xs font-mono">
                              <span className="text-muted-foreground">
                                Net Qty:{" "}
                                <strong
                                  className={
                                    nodeGroup.totalQty < 0 ? "text-red-400" : "text-primary"
                                  }
                                >
                                  {nodeGroup.totalQty > 0
                                    ? `+${formatNumber(nodeGroup.totalQty)}`
                                    : formatNumber(nodeGroup.totalQty)}
                                </strong>
                              </span>
                              <span className="text-muted-foreground">
                                Total:{" "}
                                <strong className="text-foreground">
                                  ৳{formatNumber(nodeGroup.totalValue, 2)}
                                </strong>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* LEVEL 3: GROUP SELECTED / TRANSACTIONS TABLE VIEW */}
            {folderPath.length === 3 && folderPath[0] && folderPath[1] && folderPath[2] && (
              <div>
                {(() => {
                  const currentYear = folderPath[0];
                  const currentMonth = folderPath[1];
                  const currentGroupKey = folderPath[2];
                  const groupData =
                    hierarchicalData[currentYear]?.[currentMonth]?.[currentGroupKey];
                  const transactions = groupData?.transactions || [];

                  if (transactions.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center h-48 border border-dashed rounded-md text-muted-foreground">
                        <FileText className="h-10 w-10 mb-2 opacity-40" />
                        <p>No transactions found for {currentGroupKey}.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-md border bg-card overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 text-xs">
                            <TableCell className="w-36">Date</TableCell>
                            <TableCell className="w-32">Type</TableCell>
                            <TableCell>Party</TableCell>
                            <TableCell className="text-right w-24">Qty</TableCell>
                            <TableCell className="text-right w-24">Rate (৳)</TableCell>
                            <TableCell className="text-right w-28">Total (৳)</TableCell>
                            <TableCell className="text-right w-24">Action</TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((tx: any) => (
                            <TableRow key={tx.id} className="hover:bg-muted/20 text-xs">
                              <TableCell className="text-muted-foreground">
                                {format(new Date(tx.createdAt), "dd MMM yyyy HH:mm")}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[11px] font-medium border",
                                    TX_COLORS[tx.transactionType] ??
                                      "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {tx.transactionType.replace("_", " ")}
                                </span>
                              </TableCell>
                              <TableCell>{tx.partyName ?? "—"}</TableCell>
                              <TableCell className="text-right font-mono">
                                <span
                                  className={
                                    parseFloat(tx.quantity) < 0 ? "text-red-400" : "text-primary"
                                  }
                                >
                                  {parseFloat(tx.quantity) > 0
                                    ? `+${formatNumber(tx.quantity)}`
                                    : formatNumber(tx.quantity)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {tx.unitRate != null &&
                                tx.unitRate !== "" &&
                                !Number.isNaN(parseFloat(tx.unitRate))
                                  ? `৳${formatNumber(tx.unitRate, 2)}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {tx.totalPrice != null &&
                                tx.totalPrice !== "" &&
                                !Number.isNaN(parseFloat(tx.totalPrice))
                                  ? `৳${formatNumber(tx.totalPrice, 2)}`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {tx.referenceType === "PURCHASE" ||
                                tx.referenceType === "SALE" ||
                                tx.referenceType === "SALE_RETURN" ||
                                tx.referenceType === "PURCHASE_RETURN" ||
                                tx.transactionType === "SALE_RETURN" ||
                                tx.transactionType === "PURCHASE_RETURN" ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "h-6 px-1.5 text-[10px] font-medium gap-1",
                                      tx.referenceType === "SALE_RETURN" ||
                                        tx.referenceType === "PURCHASE_RETURN" ||
                                        tx.transactionType === "SALE_RETURN" ||
                                        tx.transactionType === "PURCHASE_RETURN"
                                        ? "text-primary hover:text-primary hover:bg-emerald-50 dark:text-primary dark:hover:bg-emerald-950/40"
                                        : "text-primary hover:bg-muted",
                                    )}
                                    onClick={() => handleOpenInvoice(tx)}
                                  >
                                    <FileText className="h-3 w-3" /> Invoice
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground/30 text-xs">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Pagination (for List View) */}
        {viewMode === "list" && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page}</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Standalone Product Invoice Modal with onReturn callback */}
      <ProductInvoiceModal
        isOpen={invoiceModalOpen}
        onClose={() => {
          setInvoiceModalOpen(false);
          setInvoiceDoc(null);
        }}
        type={invoiceType}
        document={invoiceDoc}
        onReturn={(doc, type) => handleReturnFromInvoice(doc, type)}
      />

      {/* Return Handling Modal */}
      <AddReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => {
          setIsReturnModalOpen(false);
          setReturnPrefillDoc(null);
        }}
        initialType={returnPrefillType}
        prefillDocument={returnPrefillDoc}
      />

      {/* Adjustment Handling Modal */}
      <AddAdjustmentModal
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
      />

      {/* Quick Creation Modals */}
      <AddPurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
      />
      <AddSaleModal isOpen={isSaleModalOpen} onClose={() => setIsSaleModalOpen(false)} />
    </Can>
  );
}
