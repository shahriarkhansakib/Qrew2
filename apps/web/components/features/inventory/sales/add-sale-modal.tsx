"use client";

/**
 * add-sale-modal.tsx
 * Create/Edit modal for sale documents.
 * - Side-by-Side Actions: "Save as Draft" and "Confirm Order" (Direct Confirm).
 * - Reactive calculation between Quantity, Unit Price, and Total.
 * - Mouse wheel scroll safety on numeric inputs.
 * - Pre-select initial product when triggered directly from Product table.
 */

import { zodResolver } from "@hookform/resolvers/zod";
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
import { useInventoryCustomers } from "@/hooks/inventory/use-customers";
import { useProducts } from "@/hooks/inventory/use-products";
import { useConfirmSale, useCreateSale, useUpdateSale } from "@/hooks/inventory/use-sales";
import { useWarehouses } from "@/hooks/inventory/use-warehouses";
import { formatNumber } from "@/lib/utils";

const itemSchema = z.object({
  productId: z.string().min(1, "Product required"),
  stockState: z.enum(["NORMAL", "FULL", "EMPTY"]),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
  discount: z.string().default("0"),
  tax: z.string().default("0"),
  total: z.string().default("0"),
});

const schema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  warehouseId: z.string().optional().nullable(),
  saleDate: z.string().min(1, "Date is required"),
  saleNumber: z.string().optional().nullable(),
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
  editSale?: any;
  initialProductId?: string;
}

function calcItemTotal(qty: string, price: string, discount: string, tax: string) {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(price) || 0;
  const d = parseFloat(discount) || 0;
  const t = parseFloat(tax) || 0;
  return (q * p - d + t).toFixed(2);
}

export function AddSaleModal({ isOpen, onClose, editSale, initialProductId }: Props) {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const { data: customers } = useInventoryCustomers();
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const confirmSale = useConfirmSale();

  const [submitMode, setSubmitMode] = useState<"DRAFT" | "CONFIRM">("DRAFT");

  const { control, handleSubmit, reset, setValue } = useForm<FormValues>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      customerId: "",
      warehouseId: null,
      saleDate: new Date().toISOString().split("T")[0],
      saleNumber: null,
      notes: null,
      items: [
        {
          productId: initialProductId ?? "",
          stockState: "NORMAL",
          quantity: "1",
          unitPrice: "0",
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
      const p = parseFloat(it?.unitPrice || "0") || 0;
      const d = parseFloat(it?.discount || "0") || 0;
      const t = parseFloat(it?.tax || "0") || 0;
      const rowTotal =
        it?.total !== undefined && it?.total !== ""
          ? parseFloat(it.total) || 0
          : Math.max(0, q * p - d + t);
      return acc + rowTotal;
    }, 0);
  }, [watchedItems]);

  useEffect(() => {
    setValue("subtotal", grandTotal.toFixed(2));
    setValue("totalAmount", grandTotal.toFixed(2));
  }, [grandTotal, setValue]);

  useEffect(() => {
    if (!isOpen) return;
    if (editSale) {
      reset({
        customerId: editSale.customerId,
        warehouseId: editSale.warehouseId,
        saleDate: editSale.saleDate?.split("T")[0],
        saleNumber: editSale.saleNumber,
        notes: editSale.notes,
        items:
          editSale.items?.map((it: any) => ({
            productId: it.productId,
            stockState: it.stockState,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            tax: it.tax,
            total: it.total,
          })) ?? [],
        subtotal: editSale.subtotal,
        discount: editSale.discount,
        tax: editSale.tax,
        totalAmount: editSale.totalAmount,
      });
    } else {
      let defaultPrice = "0";
      const defaultState: "NORMAL" | "FULL" | "EMPTY" = "NORMAL";
      if (initialProductId && products) {
        const prod = products.find((p: any) => p.id === initialProductId);
        if (prod?.sellingPrice) defaultPrice = parseFloat(prod.sellingPrice).toFixed(2);
      }
      reset({
        customerId: "",
        warehouseId: null,
        saleDate: new Date().toISOString().split("T")[0],
        saleNumber: null,
        notes: null,
        items: [
          {
            productId: initialProductId ?? "",
            stockState: defaultState,
            quantity: "1",
            unitPrice: defaultPrice,
            discount: "0",
            tax: "0",
            total: calcItemTotal("1", defaultPrice, "0", "0"),
          },
        ],
        subtotal: "0",
        discount: "0",
        tax: "0",
        totalAmount: "0",
      });
    }
  }, [isOpen, editSale, initialProductId, products, reset]);

  // Reactive Handlers
  const handleQuantityChange = (idx: number, newQty: string) => {
    setValue(`items.${idx}.quantity`, newQty);
    const unitPrice = watchedItems?.[idx]?.unitPrice || "0";
    const discount = watchedItems?.[idx]?.discount || "0";
    const tax = watchedItems?.[idx]?.tax || "0";
    const newTotal = calcItemTotal(newQty, unitPrice, discount, tax);
    setValue(`items.${idx}.total`, newTotal);
  };

  const handleUnitPriceChange = (idx: number, newPrice: string) => {
    setValue(`items.${idx}.unitPrice`, newPrice);
    const qty = watchedItems?.[idx]?.quantity || "0";
    const discount = watchedItems?.[idx]?.discount || "0";
    const tax = watchedItems?.[idx]?.tax || "0";
    const newTotal = calcItemTotal(qty, newPrice, discount, tax);
    setValue(`items.${idx}.total`, newTotal);
  };

  const handleTotalChange = (idx: number, newTotalStr: string) => {
    setValue(`items.${idx}.total`, newTotalStr);
    const totalVal = parseFloat(newTotalStr) || 0;
    const qtyVal = parseFloat(watchedItems?.[idx]?.quantity || "0") || 0;
    if (qtyVal > 0) {
      const computedPrice = (totalVal / qtyVal).toFixed(2);
      setValue(`items.${idx}.unitPrice`, computedPrice);
    }
  };

  const handleProductSelect = (idx: number, pId: string) => {
    setValue(`items.${idx}.productId`, pId);
    const prod = products?.find((p: any) => p.id === pId);
    if (prod) {
      const price = prod.sellingPrice ? parseFloat(prod.sellingPrice).toFixed(2) : "0";
      setValue(`items.${idx}.unitPrice`, price);
      setValue(`items.${idx}.stockState`, "NORMAL");
      const qty = watchedItems?.[idx]?.quantity || "1";
      setValue(`items.${idx}.total`, calcItemTotal(qty, price, "0", "0"));
    }
  };

  function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      subtotal: grandTotal.toFixed(2),
      totalAmount: grandTotal.toFixed(2),
      items: values.items.map((item) => ({
        ...item,
        total: calcItemTotal(item.quantity, item.unitPrice, item.discount, item.tax),
      })),
    };

    if (editSale) {
      updateSale.mutate(
        { id: editSale.id, data: payload },
        {
          onSuccess: () => {
            if (submitMode === "CONFIRM") {
              confirmSale.mutate(editSale.id, {
                onSuccess: () => {
                  toast.success("Sales order confirmed and stock deducted!");
                  onClose();
                },
              });
            } else {
              toast.success("Sales draft updated.");
              onClose();
            }
          },
        },
      );
    } else {
      createSale.mutate(payload, {
        onSuccess: (created: any) => {
          if (submitMode === "CONFIRM" && created?.id) {
            confirmSale.mutate(created.id, {
              onSuccess: () => {
                toast.success("Sales order created and confirmed into stock!");
                onClose();
              },
            });
          } else {
            toast.success("Sales draft saved.");
            onClose();
          }
        },
      });
    }
  }

  const isPending = createSale.isPending || updateSale.isPending || confirmSale.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[740px] max-h-[90vh] overflow-y-auto bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
        <DialogHeader>
          <DialogTitle className="text-blue-700 dark:text-blue-400">
            {editSale ? "Edit Sale" : "New Sales Order"}
          </DialogTitle>
          <DialogDescription>
            Record inventory sale. Save as draft or confirm order directly into stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Controller
                control={control}
                name="customerId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Controller
                control={control}
                name="saleDate"
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
              <Label>Sale # (leave blank to auto-generate)</Label>
              <Controller
                control={control}
                name="saleNumber"
                render={({ field }) => (
                  <Input placeholder="SAL-001" {...field} value={field.value ?? ""} />
                )}
              />
            </div>
          </div>

          {/* Line items with reactive math + wheel safety */}
          <div className="space-y-2">
            <Label>Items</Label>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Unit Price (৳)</th>
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
                            name={`items.${idx}.unitPrice`}
                            render={({ field }) => (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="h-8 text-right"
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                {...field}
                                onChange={(e) => handleUnitPriceChange(idx, e.target.value)}
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
                  unitPrice: "0",
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
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium"
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
