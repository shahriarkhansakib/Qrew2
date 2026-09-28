"use client";

/**
 * add-product-modal.tsx
 * Create/Edit modal for products.
 * - Standardized unit dropdown menu with custom fallback.
 * - Auto-generated SKU with manual override.
 * - Wheel scroll safety on numeric input fields.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { useBrands } from "@/hooks/inventory/use-brands";
import { useProductCategories } from "@/hooks/inventory/use-product-categories";
import { useCreateProduct, useUpdateProduct } from "@/hooks/inventory/use-products";

const NONE = "__none__";

const STANDARD_UNITS = [
  { value: "pcs", label: "pcs (Pieces)" },
  { value: "kg", label: "kg (Kilograms)" },
  { value: "ltr", label: "ltr (Liters)" },
  { value: "cylinder", label: "cylinder (Cylinders)" },
  { value: "box", label: "box (Boxes)" },
  { value: "bag", label: "bag (Bags)" },
  { value: "pack", label: "pack (Packs)" },
  { value: "roll", label: "roll (Rolls)" },
  { value: "meter", label: "meter (Meters)" },
  { value: "set", label: "set (Sets)" },
];

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  unit: z.string().min(1, "Unit is required"),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  productType: z.literal("NORMAL").default("NORMAL"),
  purchasePrice: z.string().optional().nullable(),
  sellingPrice: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editProduct?: any;
}

function generateSku(categoryName?: string) {
  const prefix = categoryName
    ? categoryName
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 3)
        .toUpperCase()
    : "PRD";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix || "PRD"}-${num}`;
}

export function AddProductModal({ isOpen, onClose, editProduct }: Props) {
  const { data: categories } = useProductCategories();
  const { data: brands } = useBrands();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [isCustomUnit, setIsCustomUnit] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      name: "",
      unit: "pcs",
      categoryId: null,
      brandId: null,
      sku: null,
      productType: "NORMAL",
      purchasePrice: null,
      sellingPrice: null,
      isActive: true,
    },
  });

  const categoryId = useWatch({ control, name: "categoryId" });

  useEffect(() => {
    if (!isOpen) return;
    if (editProduct) {
      const isStd = STANDARD_UNITS.some((u) => u.value === editProduct.unit);
      setIsCustomUnit(!isStd);
      reset({
        name: editProduct.name,
        unit: editProduct.unit,
        categoryId: editProduct.categoryId,
        brandId: editProduct.brandId,
        sku: editProduct.sku,
        productType: "NORMAL",
        purchasePrice: editProduct.purchasePrice,
        sellingPrice: editProduct.sellingPrice,
        isActive: editProduct.isActive,
      });
    } else {
      setIsCustomUnit(false);
      const catObj = categories?.find((c: any) => c.id === categoryId);
      reset({
        name: "",
        unit: "pcs",
        categoryId: null,
        brandId: null,
        sku: generateSku(catObj?.name),
        productType: "NORMAL",
        purchasePrice: null,
        sellingPrice: null,
        isActive: true,
      });
    }
  }, [isOpen, editProduct, reset, categoryId, categories?.find]);

  const handleAutoGenerateSku = () => {
    const catObj = categories?.find((c: any) => c.id === categoryId);
    setValue("sku", generateSku(catObj?.name));
  };

  function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      productType: "NORMAL",
    };
    if (editProduct) {
      updateProduct.mutate({ id: editProduct.id, data: payload }, { onSuccess: onClose });
    } else {
      createProduct.mutate(payload, { onSuccess: onClose });
    }
  }

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
          <DialogDescription>
            {editProduct ? "Update product details." : "Fill in the product details below."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Controller
                control={control}
                name="name"
                render={({ field }) => <Input placeholder="e.g. LPG 12kg" {...field} />}
              />
              {errors.name && (
                <p className="text-[0.8rem] text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Standardized Unit Dropdown Menu */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Unit *</Label>
                <button
                  type="button"
                  onClick={() => setIsCustomUnit(!isCustomUnit)}
                  className="text-xs text-primary hover:underline"
                >
                  {isCustomUnit ? "Standard Units" : "Custom Unit"}
                </button>
              </div>
              <Controller
                control={control}
                name="unit"
                render={({ field }) =>
                  isCustomUnit ? (
                    <Input placeholder="e.g. bundle, box-10" {...field} />
                  ) : (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_UNITS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                }
              />
              {errors.unit && (
                <p className="text-[0.8rem] text-destructive">{errors.unit.message}</p>
              )}
            </div>
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— None —</SelectItem>
                      {categories?.map((cat: any) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Controller
                control={control}
                name="brandId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— None —</SelectItem>
                      {brands?.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* SKU with Auto-Generation */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>SKU (Stock Keeping Unit)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-primary gap-1 px-1.5"
                onClick={handleAutoGenerateSku}
              >
                <Sparkles className="h-3 w-3" /> Auto Generate
              </Button>
            </div>
            <Controller
              control={control}
              name="sku"
              render={({ field }) => (
                <Input
                  placeholder="Auto-generated or custom SKU"
                  {...field}
                  value={field.value ?? ""}
                />
              )}
            />
          </div>

          {/* Prices with Scroll Safety */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Purchase Price</Label>
              <Controller
                control={control}
                name="purchasePrice"
                render={({ field }) => (
                  <Input
                    type="number"
                    step="0.01"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Selling Price</Label>
              <Controller
                control={control}
                name="sellingPrice"
                render={({ field }) => (
                  <Input
                    type="number"
                    step="0.01"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    placeholder="0.00"
                    {...field}
                    value={field.value ?? ""}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : editProduct ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
