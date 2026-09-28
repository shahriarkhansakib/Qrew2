import { format } from "date-fns";
import { FileText, Printer, RotateCcw } from "lucide-react";
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
  type: "PURCHASE" | "SALE" | "SALE_RETURN" | "PURCHASE_RETURN";
  document: any;
  onReturn?: (document: any, type: "PURCHASE" | "SALE") => void;
}

export function ProductInvoiceModal({ isOpen, onClose, type, document, onReturn }: Props) {
  if (!document) return null;

  const isPurchase = type === "PURCHASE";
  const _isSale = type === "SALE";
  const isSaleReturn = type === "SALE_RETURN";
  const isPurchaseReturn = type === "PURCHASE_RETURN";
  const isReturn = isSaleReturn || isPurchaseReturn;

  const docNumber = isReturn
    ? (document.returnNumber ?? "RET")
    : isPurchase
      ? document.purchaseNumber
      : document.saleNumber;

  const docDate = isReturn
    ? (document.returnDate ?? document.createdAt)
    : isPurchase
      ? document.purchaseDate
      : document.saleDate;

  const partyName =
    isPurchase || isPurchaseReturn
      ? (document.supplier?.name ?? "Supplier")
      : (document.customer?.name ?? "Customer");

  const items = document.items ?? [];

  const itemsSum = (() => {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((acc: number, item: any) => {
      const qty = parseFloat(item.quantity || "0") || 0;
      const rate =
        parseFloat(
          isPurchase
            ? item.unitCost
            : isPurchaseReturn
              ? item.unitCost || item.unitPrice || item.originalPurchaseItem?.unitCost || "0"
              : item.unitPrice || item.originalSaleItem?.unitPrice || "0",
        ) || 0;
      const rowTotal = parseFloat(item.total || "0") || qty * rate;
      return acc + rowTotal;
    }, 0);
  })();

  const discountVal = parseFloat(document.discount || "0") || 0;
  const taxVal = parseFloat(document.tax || "0") || 0;
  const computedSubtotal =
    document.subtotal != null && parseFloat(document.subtotal) > 0
      ? parseFloat(document.subtotal)
      : itemsSum;
  const computedGrandTotal =
    document.totalAmount != null && parseFloat(document.totalAmount) > 0
      ? parseFloat(document.totalAmount)
      : Math.max(0, computedSubtotal - discountVal + taxVal);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0 transition-colors duration-300",
          isSaleReturn
            ? "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800"
            : isPurchaseReturn || isPurchase
              ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
              : "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
        )}
      >
        <DialogHeader className="p-6 pb-2 print:hidden flex flex-row items-center justify-between border-b">
          <div>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {isReturn ? (
                <RotateCcw className="h-5 w-5 text-orange-500" />
              ) : (
                <FileText className="h-5 w-5 text-primary" />
              )}
              Product{" "}
              {isSaleReturn
                ? "Sale Return Voucher"
                : isPurchaseReturn
                  ? "Purchase Return Voucher"
                  : isPurchase
                    ? "Purchase Bill"
                    : "Sales Invoice"}
            </DialogTitle>
            <DialogDescription>
              Standalone inventory transaction voucher #{docNumber}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            {!isReturn && onReturn && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onReturn(document, type as "PURCHASE" | "SALE");
                }}
                className="gap-1.5 border-orange-500/40 text-orange-500 hover:bg-orange-500/10 font-medium"
              >
                <RotateCcw className="h-4 w-4" /> Return
              </Button>
            )}
            <Button size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Voucher Content */}
        <div className="p-6 space-y-6 text-foreground bg-card rounded-b-lg print:p-0 print:bg-white print:text-black">
          {/* Header section */}
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight uppercase text-primary print:text-black">
                {isSaleReturn
                  ? "SALE RETURN VOUCHER"
                  : isPurchaseReturn
                    ? "PURCHASE RETURN VOUCHER"
                    : isPurchase
                      ? "PURCHASE RECEIPT"
                      : "SALES INVOICE"}
              </h2>
              <p className="text-sm font-mono text-muted-foreground print:text-gray-600 mt-1">
                Ref #:{" "}
                <span className="font-semibold text-foreground print:text-black">
                  {docNumber || "N/A"}
                </span>
              </p>
            </div>
            <div className="text-right">
              <Badge
                variant="outline"
                className="mb-2 uppercase tracking-wide px-3 py-1 font-semibold"
              >
                {document.status || "CONFIRMED"}
              </Badge>
              <p className="text-xs text-muted-foreground print:text-gray-600">
                Date: {docDate ? format(new Date(docDate), "dd MMM yyyy") : "N/A"}
              </p>
            </div>
          </div>

          {/* Customer / Supplier details */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/40 p-4 rounded-lg print:bg-gray-100 print:border">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase print:text-gray-500">
                {isPurchase || isPurchaseReturn ? "Supplier / Vendor" : "Customer / Bill To"}
              </p>
              <p className="font-bold text-base mt-0.5">{partyName}</p>
              {document.warehouse?.name && (
                <p className="text-xs text-muted-foreground mt-1 print:text-gray-600">
                  Warehouse: {document.warehouse.name}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-muted-foreground uppercase print:text-gray-500">
                Transaction Info
              </p>
              <p className="text-xs text-muted-foreground mt-1 print:text-gray-600">
                Type:{" "}
                {isSaleReturn
                  ? "Stock IN (Sale Return)"
                  : isPurchaseReturn
                    ? "Stock OUT (Purchase Return)"
                    : isPurchase
                      ? "Stock IN (Purchase)"
                      : "Stock OUT (Sale)"}
              </p>
              {document.createdByUser?.name && (
                <p className="text-xs text-muted-foreground print:text-gray-600">
                  Issued by: {document.createdByUser.name}
                </p>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 print:bg-gray-200">
                <tr className="border-b text-xs font-semibold uppercase text-muted-foreground print:text-gray-700">
                  <th className="px-4 py-2.5 text-left">Product</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Unit Rate</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">
                      No items recorded in this voucher.
                    </td>
                  </tr>
                ) : (
                  items.map((item: any, idx: number) => {
                    const qty = parseFloat(item.quantity || "0");
                    const rate =
                      parseFloat(
                        isPurchase
                          ? item.unitCost
                          : isPurchaseReturn
                            ? item.unitCost ||
                              item.unitPrice ||
                              item.originalPurchaseItem?.unitCost ||
                              "0"
                            : item.unitPrice || item.originalSaleItem?.unitPrice || "0",
                      ) || 0;
                    const rowTotal = parseFloat(item.total || "0") || qty * rate;
                    return (
                      <tr key={item.id || idx} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{item.product?.name || "Product"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">{formatNumber(qty)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          ৳{formatNumber(rate, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">
                          ৳{formatNumber(rowTotal, 2)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Financial summary */}
          <div className="flex justify-between items-start pt-2">
            <div className="max-w-[260px] text-xs text-muted-foreground print:text-gray-600">
              {document.notes && (
                <div>
                  <span className="font-semibold text-foreground print:text-black">Notes:</span>
                  <p className="mt-0.5 italic">{document.notes}</p>
                </div>
              )}
            </div>

            <div className="w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground print:text-gray-600">
                <span>Subtotal:</span>
                <span className="font-mono">৳{formatNumber(computedSubtotal, 2)}</span>
              </div>
              {parseFloat(document.discount || "0") > 0 && (
                <div className="flex justify-between text-muted-foreground print:text-gray-600">
                  <span>Discount:</span>
                  <span className="font-mono text-red-500">
                    -৳{formatNumber(document.discount, 2)}
                  </span>
                </div>
              )}
              {parseFloat(document.tax || "0") > 0 && (
                <div className="flex justify-between text-muted-foreground print:text-gray-600">
                  <span>Tax / VAT:</span>
                  <span className="font-mono">+৳{formatNumber(document.tax, 2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Grand Total:</span>
                <span className="font-mono text-primary print:text-black">
                  ৳{formatNumber(computedGrandTotal, 2)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="border-t pt-4 text-center text-xs text-muted-foreground print:text-gray-500">
            Thank you for your business. Standalone inventory transaction document.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
