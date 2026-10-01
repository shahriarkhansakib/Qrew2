"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
  RotateCcw,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useInventoryCustomers } from "@/hooks/inventory/use-customers";
import { useProducts } from "@/hooks/inventory/use-products";
import { useWarehouses } from "@/hooks/inventory/use-warehouses";
import { returnsApi } from "@/lib/api/inventory";
import { apiUrl } from "@/lib/constants";
import { cn, formatNumber } from "@/lib/utils";

function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/clients?status=active`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });
}

export interface ReturnLineItem {
  id: string; // React key
  originalItemId: string; // originalSaleItemId or originalPurchaseItemId
  referenceId: string;
  referenceNumber: string;
  productId: string;
  productName: string;
  stockState: "NORMAL" | "FULL" | "EMPTY";
  quantity: string;
  unitRate: string;
  originalQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  billReturnableLimit?: number;
  currentPhysicalStock?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialType?: "PURCHASE_RETURN" | "SALE_RETURN";
  initialProductId?: string;
  prefillDocument?: any;
}

export function AddReturnModal({
  isOpen,
  onClose,
  initialType = "SALE_RETURN",
  prefillDocument,
}: Props) {
  const queryClient = useQueryClient();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: suppliers } = useClients();
  const { data: customers } = useInventoryCustomers();

  const [transactionType, setTransactionType] = useState<"PURCHASE_RETURN" | "SALE_RETURN">(
    initialType,
  );
  const [returnDate, setReturnDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [partyId, setPartyId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<ReturnLineItem[]>([]);
  const [pulsingRowId, setPulsingRowId] = useState<string | null>(null);

  // Fetch eligible confirmed invoices/purchases & line items for the selected party & type
  const { data: eligibleItems = [], isLoading: isLoadingEligible } = useQuery({
    queryKey: ["inventory", "eligible-returns", transactionType, partyId],
    queryFn: () => returnsApi.getEligibleItems({ type: transactionType, partyId }),
    enabled: isOpen && Boolean(partyId && partyId !== "__none__"),
  });

  useEffect(() => {
    if (!isOpen) return;

    setPulsingRowId(null);
    const type = prefillDocument
      ? prefillDocument.purchaseNumber
        ? "PURCHASE_RETURN"
        : "SALE_RETURN"
      : initialType;

    setTransactionType(type);
    setReturnDate(format(new Date(), "yyyy-MM-dd"));
    setWarehouseId(prefillDocument?.warehouseId ?? "");

    const pId =
      type === "PURCHASE_RETURN"
        ? (prefillDocument?.supplierId ?? "")
        : (prefillDocument?.customerId ?? "");
    setPartyId(pId);

    setNotes(
      prefillDocument
        ? `Return for voucher #${prefillDocument.purchaseNumber || prefillDocument.saleNumber}`
        : "",
    );

    if (
      prefillDocument?.items &&
      Array.isArray(prefillDocument.items) &&
      prefillDocument.items.length > 0
    ) {
      setItems(
        prefillDocument.items.map((it: any, idx: number) => {
          const origQty = parseFloat(it.quantity || "1");
          return {
            id: `item-${idx}-${Date.now()}`,
            originalItemId: it.id || "",
            referenceId: prefillDocument.id || "",
            referenceNumber: prefillDocument.purchaseNumber || prefillDocument.saleNumber || "REF",
            productId: it.productId,
            productName: it.product?.name || "Product",
            stockState: it.stockState || "NORMAL",
            quantity: String(origQty),
            unitRate: String(parseFloat(it.unitCost || it.unitPrice || "0")),
            originalQuantity: origQty,
            returnedQuantity: 0,
            returnableQuantity: origQty,
          };
        }),
      );
    } else {
      setItems([
        {
          id: `item-1-${Date.now()}`,
          originalItemId: "",
          referenceId: "",
          referenceNumber: "",
          productId: "",
          productName: "",
          stockState: "NORMAL",
          quantity: "1",
          unitRate: "0",
          originalQuantity: 0,
          returnedQuantity: 0,
          returnableQuantity: 0,
        },
      ]);
    }
  }, [isOpen, initialType, prefillDocument]);

  // Sync returnable limits and physical stock when eligible items finish loading for prefilled document
  useEffect(() => {
    if (prefillDocument && eligibleItems.length > 0) {
      setItems((prevItems) =>
        prevItems.map((item) => {
          const matching = eligibleItems.find((e: any) => e.originalItemId === item.originalItemId);
          if (!matching) return item;
          const returnableQty = matching.returnableQuantity ?? item.returnableQuantity;
          const currentQty = parseFloat(item.quantity) || 0;
          const validQty = Math.min(currentQty, returnableQty > 0 ? returnableQty : currentQty);
          return {
            ...item,
            returnableQuantity: returnableQty,
            billReturnableLimit: matching.billReturnableLimit,
            currentPhysicalStock: matching.currentPhysicalStock,
            quantity: String(validQty > 0 ? validQty : 0),
          };
        }),
      );
    }
  }, [eligibleItems, prefillDocument]);

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random()}`,
        originalItemId: "",
        referenceId: "",
        referenceNumber: "",
        productId: "",
        productName: "",
        stockState: "NORMAL",
        quantity: "1",
        unitRate: "0",
        originalQuantity: 0,
        returnedQuantity: 0,
        returnableQuantity: 0,
      },
    ]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) {
      const targetId = items[0]?.id || `item-1-${Date.now()}`;
      setItems([
        {
          id: targetId,
          originalItemId: "",
          referenceId: "",
          referenceNumber: "",
          productId: "",
          productName: "",
          stockState: "NORMAL",
          quantity: "1",
          unitRate: "0",
          originalQuantity: 0,
          returnedQuantity: 0,
          returnableQuantity: 0,
        },
      ]);
      setPulsingRowId(targetId);
      setTimeout(() => setPulsingRowId(null), 1000);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectEligibleItem = (rowId: string, originalItemId: string) => {
    const selected = eligibleItems.find((e: any) => e.originalItemId === originalItemId);
    if (!selected) return;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        const defaultQty = Math.min(1, selected.returnableQuantity || 1);
        return {
          ...item,
          originalItemId: selected.originalItemId,
          referenceId: selected.referenceId,
          referenceNumber: selected.referenceNumber,
          productId: selected.productId,
          productName: selected.productName,
          stockState: selected.stockState,
          unitRate: String(selected.unitRate),
          originalQuantity: selected.originalQuantity,
          returnedQuantity: selected.returnedQuantity,
          returnableQuantity: selected.returnableQuantity,
          billReturnableLimit: selected.billReturnableLimit,
          currentPhysicalStock: selected.currentPhysicalStock,
          quantity: String(defaultQty > 0 ? defaultQty : 0),
        };
      }),
    );
  };

  const updateItemRow = (id: string, field: keyof ReturnLineItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, [field]: value };
      }),
    );
  };

  const selectedOriginalItemIds = useMemo(() => {
    return new Set(items.map((it) => it.originalItemId).filter(Boolean));
  }, [items]);

  const isPartySelected = Boolean(partyId && partyId !== "__none__");
  const isLocked = !isPartySelected;

  const isAddItemDisabled = useMemo(() => {
    if (prefillDocument) return true;
    if (isLocked) return true;
    if (!eligibleItems || eligibleItems.length === 0) return true;
    const returnableCount = eligibleItems.filter(
      (e: any) => (e.returnableQuantity ?? 0) > 0,
    ).length;
    if (returnableCount === 0) return true;
    return selectedOriginalItemIds.size >= returnableCount || items.length >= eligibleItems.length;
  }, [isLocked, eligibleItems, selectedOriginalItemIds, items.length, prefillDocument]);

  // Validation Check: verify all lines are linked to an original invoice item and do not exceed returnable limits
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!partyId || partyId === "__none__") {
      errors.push(
        `Please select a ${transactionType === "PURCHASE_RETURN" ? "Supplier" : "Customer"}.`,
      );
    }

    items.forEach((it, idx) => {
      const lineNum = idx + 1;
      if (!it.originalItemId || !it.productId) {
        errors.push(`Line ${lineNum}: Must select an eligible invoice item.`);
      } else {
        const qty = parseFloat(it.quantity) || 0;
        if (qty <= 0) {
          errors.push(`Line ${lineNum}: Return quantity must be greater than 0.`);
        } else if (transactionType === "PURCHASE_RETURN") {
          const billLimit = it.billReturnableLimit ?? it.returnableQuantity;
          const physicalStock = it.currentPhysicalStock ?? Infinity;
          if (qty > billLimit + 0.0001) {
            errors.push(
              `Line ${lineNum} (${it.productName}): Return quantity (${formatNumber(qty)}) exceeds remaining purchase bill limit (${formatNumber(billLimit)}).`,
            );
          }
          if (qty > physicalStock + 0.0001) {
            errors.push(
              `Line ${lineNum} (${it.productName}): Return quantity (${formatNumber(qty)}) exceeds current available physical stock in warehouse (${formatNumber(physicalStock)}).`,
            );
          }
        } else {
          // SALE_RETURN
          if (qty > it.returnableQuantity + 0.0001) {
            errors.push(
              `Line ${lineNum} (${it.productName}): Return quantity (${formatNumber(qty)}) exceeds invoice returnable limit (${formatNumber(it.returnableQuantity)}).`,
            );
          }
        }
      }
    });

    return errors;
  }, [items, partyId, transactionType]);

  const grandTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = parseFloat(item.quantity) || 0;
      const r = parseFloat(item.unitRate) || 0;
      return sum + q * r;
    }, 0);
  }, [items]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (validationErrors.length > 0) {
        toast.error(validationErrors[0]);
        throw new Error(validationErrors[0]);
      }

      const isPurchaseReturn = transactionType === "PURCHASE_RETURN";
      const selectedSupplier = isPurchaseReturn
        ? suppliers?.find((s: any) => s.id === partyId)
        : null;
      const selectedCustomer = !isPurchaseReturn
        ? customers?.find((c: any) => c.id === partyId)
        : null;
      const partyName = selectedSupplier?.name || selectedCustomer?.name || "";

      const finalNotes = notes.trim();

      if (isPurchaseReturn) {
        return returnsApi.createPurchaseReturn({
          supplierId: partyId,
          warehouseId: warehouseId && warehouseId !== "__none__" ? warehouseId : undefined,
          returnDate: returnDate || undefined,
          notes: finalNotes || `Purchase Return to ${partyName || "Supplier"}`,
          items: items.map((item) => ({
            originalPurchaseItemId: item.originalItemId,
            productId: item.productId,
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: parseFloat(item.unitRate) || 0,
          })),
        });
      } else {
        return returnsApi.createSaleReturn({
          customerId: partyId,
          warehouseId: warehouseId && warehouseId !== "__none__" ? warehouseId : undefined,
          returnDate: returnDate || undefined,
          notes: finalNotes || `Sale Return from ${partyName || "Customer"}`,
          items: items.map((item) => ({
            originalSaleItemId: item.originalItemId,
            productId: item.productId,
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: parseFloat(item.unitRate) || 0,
          })),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "sale-returns"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "purchase-returns"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "eligible-returns"] });
      toast.success(
        `${transactionType === "PURCHASE_RETURN" ? "Purchase Return" : "Sale Return"} (${items.length} item${items.length > 1 ? "s" : ""}) recorded successfully.`,
      );
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to record return.");
    },
  });

  const handleSwitchFlow = (flow: "SALE_RETURN" | "PURCHASE_RETURN") => {
    if (flow === transactionType) return;
    setTransactionType(flow);
    setPartyId("");
    setItems([
      {
        id: `item-1-${Date.now()}`,
        originalItemId: "",
        referenceId: "",
        referenceNumber: "",
        productId: "",
        productName: "",
        stockState: "NORMAL",
        quantity: "1",
        unitRate: "0",
        originalQuantity: 0,
        returnedQuantity: 0,
        returnableQuantity: 0,
      },
    ]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[850px] max-h-[92vh] overflow-y-auto bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b space-y-0 pr-8">
          <div className="flex items-center gap-2 pt-0.5">
            <RotateCcw className="h-5 w-5 text-orange-500 shrink-0" />
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <span>{transactionType === "SALE_RETURN" ? "Sale Return" : "Purchase Return"}</span>
              <span className="text-xs font-normal text-muted-foreground font-mono">
                {transactionType === "SALE_RETURN" ? "(+ Stock)" : "(- Stock)"}
              </span>
            </DialogTitle>
          </div>
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border mr-2 sm:mr-4">
            <Button
              type="button"
              variant={transactionType === "SALE_RETURN" ? "default" : "ghost"}
              size="sm"
              disabled={Boolean(prefillDocument)}
              className={cn(
                "h-8 px-4 text-xs font-semibold gap-1.5",
                transactionType === "SALE_RETURN" &&
                  "bg-orange-600 hover:bg-orange-500 text-white shadow-xs",
              )}
              onClick={() => handleSwitchFlow("SALE_RETURN")}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Sale Return</span>
            </Button>
            <Button
              type="button"
              variant={transactionType === "PURCHASE_RETURN" ? "default" : "ghost"}
              size="sm"
              disabled={Boolean(prefillDocument)}
              className={cn(
                "h-8 px-4 text-xs font-semibold gap-1.5",
                transactionType === "PURCHASE_RETURN" &&
                  "bg-primary hover:bg-primary text-white shadow-xs",
              )}
              onClick={() => handleSwitchFlow("PURCHASE_RETURN")}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Purchase Return</span>
            </Button>
          </div>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4 mt-2"
        >
          {/* Top Info Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/30 p-3 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Return Date *</Label>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="h-9 bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Warehouse</Label>
              <Select
                disabled={Boolean(prefillDocument)}
                value={warehouseId || "__none__"}
                onValueChange={(v) => setWarehouseId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {warehouses?.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Party Selection & Helper */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-card p-3 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {transactionType === "PURCHASE_RETURN" ? "Select Supplier *" : "Select Customer *"}
              </Label>
              <Select
                disabled={Boolean(prefillDocument)}
                value={partyId || "__none__"}
                onValueChange={(v) => {
                  setPartyId(v === "__none__" ? "" : v);
                  setItems([
                    {
                      id: `item-1-${Date.now()}`,
                      originalItemId: "",
                      referenceId: "",
                      referenceNumber: "",
                      productId: "",
                      productName: "",
                      stockState: "NORMAL",
                      quantity: "1",
                      unitRate: "0",
                      originalQuantity: 0,
                      returnedQuantity: 0,
                      returnableQuantity: 0,
                    },
                  ]);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue
                    placeholder={
                      transactionType === "PURCHASE_RETURN"
                        ? "Select supplier to load bills"
                        : "Select customer to load sales"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select Party —</SelectItem>
                  {transactionType === "PURCHASE_RETURN"
                    ? suppliers?.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    : customers?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground opacity-90">
                Invoice Status
              </Label>
              <div className="h-9 px-3 flex items-center text-xs rounded-md bg-muted/30 border">
                {isLoadingEligible ? (
                  <span className="text-muted-foreground">
                    Loading eligible invoice line items...
                  </span>
                ) : partyId && partyId !== "__none__" ? (
                  <span className="text-primary dark:text-primary flex items-center gap-1.5 font-medium truncate">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    {eligibleItems.length} returnable invoice item
                    {eligibleItems.length !== 1 ? "s" : ""} available
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-accent-foreground dark:text-accent-foreground truncate font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Select a party above to view eligible original invoices.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Line Items Table */}
          <div
            className={cn(
              "space-y-2 transition-all duration-300",
              isLocked && "opacity-50 pointer-events-none select-none",
            )}
          >
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Return Line Items ({items.length})
              </Label>
            </div>

            <div className="rounded-md border overflow-x-auto bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 text-xs">
                    <TableCell className="font-semibold min-w-[280px]">
                      Original Invoice / Product *
                    </TableCell>
                    <TableCell className="font-semibold text-right w-[110px]">
                      Return Qty *
                    </TableCell>
                    <TableCell className="font-semibold text-right w-[110px]">
                      Unit Rate (৳)
                    </TableCell>
                    <TableCell className="font-semibold text-right w-[110px]">Total (৳)</TableCell>
                    <TableCell className="w-[40px]"></TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const rowQty = parseFloat(item.quantity) || 0;
                    const rowRate = parseFloat(item.unitRate) || 0;
                    const rowTotal = (rowQty * rowRate).toFixed(2);
                    const isOverReturn =
                      item.returnableQuantity > 0 && rowQty > item.returnableQuantity + 0.0001;

                    return (
                      <TableRow
                        key={item.id}
                        className={
                          isOverReturn ? "bg-red-500/10 hover:bg-red-500/15" : "hover:bg-muted/20"
                        }
                      >
                        <TableCell className="p-2">
                          <motion.div
                            animate={
                              pulsingRowId === item.id
                                ? { x: [-5, 5, -4, 4, -2, 2, 0], scale: [1, 1.02, 1] }
                                : {}
                            }
                            transition={{ duration: 0.4 }}
                          >
                            <Select
                              disabled={isLocked || Boolean(prefillDocument)}
                              value={item.originalItemId || "__none__"}
                              onValueChange={(v) => {
                                if (v !== "__none__") handleSelectEligibleItem(item.id, v);
                              }}
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-9 text-xs transition-all duration-300",
                                  !item.originalItemId &&
                                    "border-amber-500/60 text-muted-foreground",
                                  pulsingRowId === item.id &&
                                    "animate-pulse ring-2 ring-amber-500 border-amber-500 bg-accent/10 shadow-sm shadow-amber-500/20",
                                )}
                              >
                                <SelectValue placeholder="Select eligible invoice & item" />
                              </SelectTrigger>
                              <SelectContent className="max-w-[450px]">
                                <SelectItem value="__none__">— Select Invoice & Item —</SelectItem>
                                {eligibleItems.map((e: any) => {
                                  const isAlreadySelected =
                                    selectedOriginalItemIds.has(e.originalItemId) &&
                                    e.originalItemId !== item.originalItemId;
                                  if (isAlreadySelected) return null;

                                  return (
                                    <SelectItem
                                      key={e.originalItemId}
                                      value={e.originalItemId}
                                      disabled={e.returnableQuantity <= 0}
                                    >
                                      #{e.referenceNumber} - {e.productName} (Max Ret:{" "}
                                      {formatNumber(e.returnableQuantity)} / Orig:{" "}
                                      {formatNumber(e.originalQuantity)})
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </motion.div>
                          {!item.originalItemId ? (
                            <span className="text-[11px] text-accent-foreground dark:text-accent-foreground font-medium flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              Must select an eligible invoice item
                            </span>
                          ) : (
                            item.referenceNumber && (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3 text-primary" /> #
                                  {item.referenceNumber}
                                </span>
                                <span>•</span>
                                {transactionType === "PURCHASE_RETURN" ? (
                                  <>
                                    <span>
                                      Bill Limit:{" "}
                                      <strong className="text-foreground">
                                        {formatNumber(
                                          item.billReturnableLimit ?? item.returnableQuantity,
                                        )}
                                      </strong>
                                    </span>
                                    <span>•</span>
                                    <span>
                                      Physical Stock:{" "}
                                      <strong
                                        className={
                                          (item.currentPhysicalStock ?? 0) <
                                          (parseFloat(item.quantity) || 0)
                                            ? "text-red-500 font-bold"
                                            : "text-primary"
                                        }
                                      >
                                        {formatNumber(item.currentPhysicalStock ?? 0)}
                                      </strong>
                                    </span>
                                    <span>•</span>
                                    <span>
                                      Max Returnable:{" "}
                                      <strong className="text-orange-500 font-bold">
                                        {formatNumber(item.returnableQuantity)}
                                      </strong>
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span>
                                      Returnable Limit:{" "}
                                      <strong className="text-primary">
                                        {formatNumber(item.returnableQuantity)}
                                      </strong>
                                    </span>
                                    {item.currentPhysicalStock !== undefined && (
                                      <>
                                        <span>•</span>
                                        <span>
                                          Current Stock:{" "}
                                          <strong className="text-muted-foreground">
                                            {formatNumber(item.currentPhysicalStock)}
                                          </strong>
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )
                          )}
                        </TableCell>

                        <TableCell className="p-2 text-right">
                          <Input
                            type="number"
                            step="0.001"
                            min="0.001"
                            disabled={isLocked}
                            value={item.quantity}
                            onChange={(e) => updateItemRow(item.id, "quantity", e.target.value)}
                            className={`h-8 text-xs text-right font-mono ${isOverReturn ? "border-red-500 text-red-500 ring-1 ring-red-500" : ""}`}
                          />
                          {isOverReturn && (
                            <span className="text-[10px] text-red-500 font-semibold block mt-0.5">
                              Exceeds max ({formatNumber(item.returnableQuantity)})
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="p-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isLocked}
                            value={item.unitRate}
                            onChange={(e) => updateItemRow(item.id, "unitRate", e.target.value)}
                            className="h-8 text-xs text-right font-mono"
                          />
                        </TableCell>

                        <TableCell className="p-2 text-right font-mono font-medium text-xs">
                          ৳{rowTotal}
                        </TableCell>

                        <TableCell className="p-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isLocked}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItemRow(item.id)}
                            title="Remove line item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Bottom Add Item Button */}
            {!prefillDocument && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItemRow}
                  disabled={isLocked || isAddItemDisabled}
                  className="w-full border-dashed flex items-center justify-center gap-2 h-9 font-medium text-xs text-muted-foreground hover:text-foreground hover:border-solid transition-all"
                >
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div
            className={cn(
              "space-y-1.5 pt-1 transition-all duration-300",
              isLocked && "opacity-50 pointer-events-none select-none",
            )}
          >
            <Label className="text-xs">Reason / Return Voucher Notes</Label>
            <Input
              placeholder="e.g. Defective stock return per customer request"
              value={notes}
              disabled={isLocked}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Footer with Bottom Left Total Return Value */}
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="text-base font-bold flex items-center">
              <span className="text-muted-foreground mr-2 font-normal text-sm">
                Total Return Value:
              </span>
              <span
                className={cn(
                  "font-mono font-bold text-lg",
                  transactionType === "PURCHASE_RETURN"
                    ? "text-primary dark:text-primary"
                    : "text-orange-500",
                )}
              >
                ৳{formatNumber(grandTotal, 2)}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLocked || mutation.isPending || validationErrors.length > 0}
                title={
                  isLocked
                    ? `Select a ${transactionType === "PURCHASE_RETURN" ? "supplier" : "customer"} to unlock return submission`
                    : undefined
                }
                className={cn(
                  "text-white font-medium disabled:opacity-50 transition-colors duration-300",
                  transactionType === "PURCHASE_RETURN"
                    ? "bg-primary hover:bg-primary"
                    : "bg-orange-600 hover:bg-orange-500",
                )}
              >
                {mutation.isPending ? "Recording..." : "Record Multi-Product Return"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
