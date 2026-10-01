"use client";

/**
 * add-purchase-modal.tsx
 * Create/Edit modal for purchase documents.
 * - Side-by-Side Actions: "Save as Draft" and "Confirm Order" (Direct Confirm).
 * - Reactive calculation between Quantity, Unit Cost, and Total.
 * - Mouse wheel scroll safety on numeric input fields.
 * - Pre-select initial product when triggered directly from Product table.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts } from "@/hooks/inventory/use-products";
import {
  useConfirmPurchase,
  useCreatePurchase,
  useUpdatePurchase,
} from "@/hooks/inventory/use-purchases";
import { useWarehouses } from "@/hooks/inventory/use-warehouses";
import { apiUrl } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

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

const itemSchema = z.object({
  productId: z.string().min(1, "Product required"),
  stockState: z.enum(["NORMAL", "FULL", "EMPTY"]),
  quantity: z.string().min(1),
  unitCost: z.string().min(1),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  total: z.string().default("0"),
});

const schema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  warehouseId: z.string().optional().nullable(),
  purchaseDate: z.string().min(1, "Date is required"),
  purchaseNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, "Add at least one item"),
  subtotal: z.string().default("0"),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  totalAmount: z.string().default("0"),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editPurchase?: any;
  initialProductId?: string;
}

function calcItemTotal(qty: string, cost: string, discount: string, tax: string) {
  const q = parseFloat(qty) || 0;
  const c = parseFloat(cost) || 0;
  const d = parseFloat(discount) || 0;
  const t = parseFloat(tax) || 0;
  return (q * c - d + t).toFixed(2);
}

export function AddPurchaseModal({ isOpen, onClose, editPurchase, initialProductId }: Props) {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: clients } = useClients();
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();
  const confirmPurchase = useConfirmPurchase();

  const [submitMode, setSubmitMode] = useState<"DRAFT" | "CONFIRM">("DRAFT");

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      supplierId: "",
      warehouseId: null,
      purchaseDate: new Date().toISOString().split("T")[0],
      purchaseNumber: null,
      notes: null,
      items: [
        {
          productId: initialProductId ?? "",
          stockState: "NORMAL",
          quantity: "1",
          unitCost: "0",
          discount: "0",
          tax: "0",
          total: "0",
        },
      ],
      subtotal: "0",
      discount: "0",
      tax: "0",
      totalAmount: "0",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = useWatch({ control, name: "items" });

  const grandTotal = useMemo(() => {
    if (!watchedItems || !Array.isArray(watchedItems)) return 0;
    return watchedItems.reduce((acc, it) => {
      const q = parseFloat(it?.quantity || "0") || 0;
      const c = parseFloat(it?.unitCost || "0") || 0;
      const d = parseFloat(it?.discount || "0") || 0;
      const t = parseFloat(it?.tax || "0") || 0;
      const rowTotal =
        it?.total !== undefined && it?.total !== ""
          ? parseFloat(it.total) || 0
          : Math.max(0, q * c - d + t);
      return acc + rowTotal;
    }, 0);
  }, [watchedItems]);

  useEffect(() => {
    setValue("subtotal", grandTotal.toFixed(2));
    setValue("totalAmount", grandTotal.toFixed(2));
  }, [grandTotal, setValue]);

  useEffect(() => {
    if (!isOpen) return;
    if (editPurchase) {
      reset({
        supplierId: editPurchase.supplierId,
        warehouseId: editPurchase.warehouseId,
        purchaseDate: editPurchase.purchaseDate?.split("T")[0],
        purchaseNumber: editPurchase.purchaseNumber,
        notes: editPurchase.notes,
        items:
          editPurchase.items?.map((it: any) => ({
            productId: it.productId,
            stockState: it.stockState,
            quantity: it.quantity,
            unitCost: it.unitCost,
            discount: it.discount,
            tax: it.tax,
            total: it.total,
          })) ?? [],
        subtotal: editPurchase.subtotal,
        discount: editPurchase.discount,
        tax: editPurchase.tax,
        totalAmount: editPurchase.totalAmount,
      });
    } else {
      let defaultCost = "0";
      if (initialProductId && products) {
        const prod = products.find((p: any) => p.id === initialProductId);
        if (prod?.purchasePrice) defaultCost = parseFloat(prod.purchasePrice).toFixed(2);
      }
      reset({
        supplierId: "",
        warehouseId: null,
        purchaseDate: new Date().toISOString().split("T")[0],
        purchaseNumber: null,
        notes: null,
        items: [
          {
            productId: initialProductId ?? "",
            stockState: "NORMAL",
            quantity: "1",
            unitCost: defaultCost,
            discount: "0",
            tax: "0",
            total: calcItemTotal("1", defaultCost, "0", "0"),
          },
        ],
        subtotal: "0",
        discount: "0",
        tax: "0",
        totalAmount: "0",
      });
    }
  }, [isOpen, editPurchase, initialProductId, products, reset]);

  // Reactive Handlers
  const handleQuantityChange = (idx: number, newQty: string) => {
    setValue(`items.${idx}.quantity`, newQty);
    const unitCost = watchedItems?.[idx]?.unitCost || "0";
    const discount = watchedItems?.[idx]?.discount || "0";
    const tax = watchedItems?.[idx]?.tax || "0";
    const newTotal = calcItemTotal(newQty, unitCost, discount, tax);
    setValue(`items.${idx}.total`, newTotal);
  };

  const handleUnitCostChange = (idx: number, newCost: string) => {
    setValue(`items.${idx}.unitCost`, newCost);
    const qty = watchedItems?.[idx]?.quantity || "0";
    const discount = watchedItems?.[idx]?.discount || "0";
    const tax = watchedItems?.[idx]?.tax || "0";
    const newTotal = calcItemTotal(qty, newCost, discount, tax);
    setValue(`items.${idx}.total`, newTotal);
  };

  const handleTotalChange = (idx: number, newTotalStr: string) => {
    setValue(`items.${idx}.total`, newTotalStr);
    const totalVal = parseFloat(newTotalStr) || 0;
    const qtyVal = parseFloat(watchedItems?.[idx]?.quantity || "0") || 0;
    if (qtyVal > 0) {
      const computedCost = (totalVal / qtyVal).toFixed(2);
      setValue(`items.${idx}.unitCost`, computedCost);
    }
  };

  const handleProductSelect = (idx: number, pId: string) => {
    setValue(`items.${idx}.productId`, pId);
    const prod = products?.find((p: any) => p.id === pId);
    if (prod?.purchasePrice) {
      const cost = parseFloat(prod.purchasePrice).toFixed(2);
      setValue(`items.${idx}.unitCost`, cost);
      const qty = watchedItems?.[idx]?.quantity || "1";
      setValue(`items.${idx}.total`, calcItemTotal(qty, cost, "0", "0"));
    }
  };

  function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      subtotal: grandTotal.toFixed(2),
      totalAmount: grandTotal.toFixed(2),
      items: values.items.map((item) => ({
        ...item,
        total: calcItemTotal(item.quantity, item.unitCost, item.discount, item.tax),
      })),
    };

    if (editPurchase) {
      updatePurchase.mutate(
        { id: editPurchase.id, data: payload },
        {
          onSuccess: () => {
            if (submitMode === "CONFIRM") {
              confirmPurchase.mutate(editPurchase.id, {
                onSuccess: () => {
                  toast.success("Purchase order confirmed and stock added!");
                  onClose();
                },
              });
            } else {
              toast.success("Purchase draft updated.");
              onClose();
            }
          },
        },
      );
    } else {
      createPurchase.mutate(payload, {
        onSuccess: (created: any) => {
          if (submitMode === "CONFIRM" && created?.id) {
            confirmPurchase.mutate(created.id, {
              onSuccess: () => {
                toast.success("Purchase order created and confirmed into stock!");
                onClose();
              },
            });
          } else {
            toast.success("Purchase draft saved.");
            onClose();
          }
        },
      });
    }
  }

  const isPending =
    createPurchase.isPending || updatePurchase.isPending || confirmPurchase.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
        <DialogHeader>
          <DialogTitle className="text-green-700 dark:text-green-400">
            {editPurchase ? "Edit Purchase" : "New Purchase Order"}
          </DialogTitle>
          <DialogDescription>
            Record inventory purchase. Save as draft or confirm order directly into stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Controller
                control={control}
                name="supplierId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.supplierId && (
                <p className="text-[0.8rem] text-destructive">{errors.supplierId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Controller
                control={control}
                name="purchaseDate"
                render={({ field }) => <Input type="date" {...field} />}
              />
            </div>
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <Controller
                control={control}
                name="warehouseId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
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
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Purchase # (leave blank to auto-generate)</Label>
              <Controller
                control={control}
                name="purchaseNumber"
                render={({ field }) => (
                  <Input placeholder="PUR-001" {...field} value={field.value ?? ""} />
                )}
              />
            </div>
          </div>

          {/* Line items table with reactive math + wheel safety */}
          <div className="space-y-2">
            <Label>Items</Label>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Unit Cost (৳)</th>
                    <th className="px-3 py-2 text-right font-medium">Total (৳)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, idx) => {
                    const _item = watchedItems[idx];
                    return (
                      <tr key={field.id} className="border-t">
                        <td className="px-2 py-1.5">
                          <Controller
                            control={control}
                            name={`items.${idx}.productId`}
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={(val) => handleProductSelect(idx, val)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Product" />
                                </SelectTrigger>
                                <SelectContent>
                                  {products?.map((p: any) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5 w-20">
                          <Controller
                            control={control}
                            name={`items.${idx}.quantity`}
                            render={({ field }) => (
                              <Input
                                type="number"
                                step="0.001"
                                min="0"
                                className="h-8 text-right"
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                {...field}
                                onChange={(e) => handleQuantityChange(idx, e.target.value)}
                              />
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5 w-28">
                          <Controller
                            control={control}
                            name={`items.${idx}.unitCost`}
                            render={({ field }) => (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-8 text-right"
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                {...field}
                                onChange={(e) => handleUnitCostChange(idx, e.target.value)}
                              />
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5 w-28">
                          <Controller
                            control={control}
                            name={`items.${idx}.total`}
                            render={({ field }) => (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-8 text-right font-semibold"
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                {...field}
                                onChange={(e) => handleTotalChange(idx, e.target.value)}
                              />
                            )}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                append({
                  productId: "",
                  stockState: "NORMAL",
                  quantity: "1",
                  unitCost: "0",
                  discount: "0",
                  tax: "0",
                  total: "0",
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <Input placeholder="Optional notes" {...field} value={field.value ?? ""} />
              )}
            />
          </div>

          <div className="flex justify-between items-center pt-3 border-t">
            <div className="text-base font-bold">
              <span className="text-muted-foreground mr-2 font-normal text-sm">Grand Total:</span>
              <span>৳{formatNumber(grandTotal, 2)}</span>
            </div>

            {/* Side-by-side Action Buttons: Save as Draft vs. Confirm Order */}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={isPending}
                onClick={() => setSubmitMode("DRAFT")}
              >
                <FileText className="h-4 w-4 mr-1.5 text-muted-foreground" />
                Save as Draft
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                onClick={() => setSubmitMode("CONFIRM")}
                className="bg-primary hover:bg-primary text-white font-medium"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Confirm Order
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
