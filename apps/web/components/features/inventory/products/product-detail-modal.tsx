"use client";

import { Database, DollarSign, Edit, Layers, Package, Tag } from "lucide-react";
import { Can } from "@/components/features/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatNumber } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: any;
  stockMap?: Record<string, Record<string, number>>;
  onEdit?: (product: any) => void;
}

export function ProductDetailModal({ isOpen, onClose, product, stockMap, onEdit }: Props) {
  if (!product) return null;

  const states = stockMap?.[product.id];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b flex flex-row items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-bold">{product.name}</DialogTitle>
              <Badge
                variant="outline"
                className="text-xs font-semibold uppercase tracking-wider border-muted bg-muted/40"
              >
                Normal Stock
              </Badge>
            </div>
            <DialogDescription className="text-xs font-mono mt-1 text-muted-foreground">
              SKU: <span className="font-semibold text-foreground">{product.sku || "N/A"}</span>
              {product.barcode && <span className="ml-3">Barcode: {product.barcode}</span>}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Invoice-Style Content Body */}
        <div className="p-6 space-y-5 bg-card">
          {/* Classification & Details */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 bg-muted/20">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" /> Category
              </p>
              <p className="font-medium text-sm mt-1">{product.category?.name || "—"}</p>
            </div>

            <div className="rounded-lg border p-3 bg-muted/20">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" /> Brand
              </p>
              <p className="font-medium text-sm mt-1">{product.brand?.name || "—"}</p>
            </div>

            <div className="rounded-lg border p-3 bg-muted/20">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <Package className="h-3.5 w-3.5" /> Standard Unit
              </p>
              <p className="font-medium text-sm mt-1 capitalize">{product.unit || "pcs"}</p>
            </div>
          </div>

          {/* Pricing & Financial Card */}
          <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-primary" /> Pricing Information
            </p>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-xs text-muted-foreground">Purchase Cost:</span>
                <p className="text-base font-bold font-mono mt-0.5">
                  <Can I="inventory:view_cost_price">
                    {product.purchasePrice ? `৳${formatNumber(product.purchasePrice, 2)}` : "—"}
                  </Can>
                  <Can I="inventory:view_cost_price" not>
                    <span className="text-muted-foreground/40 text-sm">••••</span>
                  </Can>
                </p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground">Selling Price:</span>
                <p className="text-base font-bold font-mono text-primary mt-0.5">
                  {product.sellingPrice ? `৳${formatNumber(product.sellingPrice, 2)}` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Live Ledger Stock Card */}
          <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
              <Database className="h-3.5 w-3.5 text-blue-500" /> Live Inventory Stock (Ledger)
            </p>
            <div className="pt-1">
              <Can I="inventory:view_stock">
                {!states || Object.keys(states).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No stock movements recorded yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(states).map(([state, qty]) => {
                      const isLow = qty < 5;
                      return (
                        <div
                          key={state}
                          className={cn(
                            "px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-2",
                            isLow
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-primary/10 text-primary border-primary/20",
                          )}
                        >
                          <span className="font-mono text-sm font-bold">{formatNumber(qty)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Can>
              <Can I="inventory:view_stock" not>
                <p className="text-xs text-muted-foreground/40 font-mono">•••• Restricted</p>
              </Can>
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="text-xs text-muted-foreground border-t pt-3">
              <span className="font-semibold text-foreground">Notes / Description:</span>
              <p className="mt-0.5 leading-relaxed">{product.description}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t flex justify-end gap-2 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {onEdit && (
            <Can I="inventory:edit_product">
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(product);
                }}
                className="gap-1.5"
              >
                <Edit className="h-4 w-4" /> Edit Product
              </Button>
            </Can>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
