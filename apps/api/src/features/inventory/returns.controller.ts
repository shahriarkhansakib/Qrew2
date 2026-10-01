/**
 * returns.controller.ts
 * Enterprise-grade controller for Sale Returns and Purchase Returns.
 *
 * Implements strict 8-Step Backend Validation Flow for Returns:
 * 1. Concurrency Protection: SELECT ... FOR UPDATE on target original line item.
 * 2. Status Check: Ensure original parent document status === 'CONFIRMED'.
 * 3. Cross-Tenant Security: Verify original item belongs to current org.
 * 4. Returnable Quantity Calculation: Original Item Qty - SUM(Previously Confirmed Returns).
 * 5. Validation Enforcement: Reject with 400 Bad Request if Requested > Returnable Qty.
 * 6. Document Update / Creation: Save return document in CONFIRMED status.
 * 7. Ledger & Stock Effect: Write to inventory_transactions (+qty for Sale Return, -qty for Purchase Return).
 * 8. Atomic Commit: All steps run inside db.transaction; rollback completely on any validation error.
 */

import {
  db,
  inventoryTransactions,
  purchaseItems,
  purchaseReturnItems,
  purchaseReturns,
  purchases,
  saleItems,
  saleReturnItems,
  saleReturns,
  sales,
} from "@starter/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { generateDocumentNumber } from "./inventory.service";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createSaleReturnItemSchema = z.object({
  originalSaleItemId: z.string().min(1, "Original sale item is required"),
  productId: z.string().min(1, "Product is required"),
  stockState: z.enum(["NORMAL", "FULL", "EMPTY"]).default("NORMAL"),
  quantity: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .refine(
      (val) => !Number.isNaN(parseFloat(val)) && parseFloat(val) > 0,
      "Return quantity must be > 0",
    ),
  unitPrice: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .default("0"),
});

const createSaleReturnSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  warehouseId: z.string().optional().nullable(),
  returnDate: z.string().min(1, "Return date is required"),
  notes: z.string().optional().nullable(),
  items: z.array(createSaleReturnItemSchema).min(1, "At least one return item required"),
});

const createPurchaseReturnItemSchema = z.object({
  originalPurchaseItemId: z.string().min(1, "Original purchase item is required"),
  productId: z.string().min(1, "Product is required"),
  stockState: z.enum(["NORMAL", "FULL", "EMPTY"]).default("NORMAL"),
  quantity: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .refine(
      (val) => !Number.isNaN(parseFloat(val)) && parseFloat(val) > 0,
      "Return quantity must be > 0",
    ),
  unitCost: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .default("0"),
});

const createPurchaseReturnSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  warehouseId: z.string().optional().nullable(),
  returnDate: z.string().min(1, "Return date is required"),
  notes: z.string().optional().nullable(),
  items: z.array(createPurchaseReturnItemSchema).min(1, "At least one return item required"),
});

export class ReturnsController {
  /**
   * Create and confirm a Sale Return document under the 8-step atomic validation flow.
   */
  static async createSaleReturn(c: Context) {
    try {
      const orgId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();

      const userId = user?.id || user?.sub;
      if (!userId) {
        return c.json({ error: "User authentication session missing." }, 401);
      }

      const parsed = createSaleReturnSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return c.json(
          { error: `Validation Error: ${issues}`, details: parsed.error.format() },
          400,
        );
      }

      // Execute 8-Step Validation Flow within atomic db.transaction
      const result = await db.transaction(async (tx) => {
        const returnNumber = await generateDocumentNumber(tx, orgId, "SALE_RETURN");
        const returnHeaderId = uuidv4();

        let subtotal = 0;
        const insertedReturnItems: any[] = [];
        const ledgerRowsToInsert: any[] = [];
        const accumulatedItemReturns: Record<string, number> = {};

        for (const item of parsed.data.items) {
          // Step a: Concurrency Protection — row lock on target originalSaleItemId
          const [lockedSaleItem] = await tx
            .select({
              id: saleItems.id,
              saleId: saleItems.saleId,
              productId: saleItems.productId,
              stockState: saleItems.stockState,
              quantity: saleItems.quantity,
              unitPrice: saleItems.unitPrice,
            })
            .from(saleItems)
            .where(eq(saleItems.id, item.originalSaleItemId))
            .for("update");

          if (!lockedSaleItem) {
            throw new Error(`Original sale line item '${item.originalSaleItemId}' was not found.`);
          }

          // Step b & c: Status Check & Cross-Tenant Security
          const [parentSale] = await tx
            .select({
              id: sales.id,
              organizationId: sales.organizationId,
              saleNumber: sales.saleNumber,
              status: sales.status,
              customerId: sales.customerId,
            })
            .from(sales)
            .where(eq(sales.id, lockedSaleItem.saleId));

          if (!parentSale) {
            throw new Error(
              `Parent sale invoice for line item '${item.originalSaleItemId}' was not found.`,
            );
          }

          if (parentSale.organizationId !== orgId) {
            throw new Error(
              `Access Denied: Original sale invoice #${parentSale.saleNumber} does not belong to your organization.`,
            );
          }

          if (parentSale.status !== "CONFIRMED") {
            throw new Error(
              `Invalid Operation: Original sale invoice #${parentSale.saleNumber} is in '${parentSale.status}' status. Returns are only allowed against CONFIRMED invoices.`,
            );
          }

          // Step d: Returnable Quantity Calculation
          const [prevReturnAgg] = await tx
            .select({
              totalReturned: sql<string>`COALESCE(SUM(${saleReturnItems.quantity}), 0)`,
            })
            .from(saleReturnItems)
            .innerJoin(saleReturns, eq(saleReturnItems.saleReturnId, saleReturns.id))
            .where(
              and(
                eq(saleReturnItems.originalSaleItemId, item.originalSaleItemId),
                eq(saleReturns.status, "CONFIRMED"),
              ),
            );

          const prevReturnedQty = parseFloat(prevReturnAgg?.totalReturned ?? "0");
          const originalQty = parseFloat(lockedSaleItem.quantity);
          const returnableQty = Math.max(0, originalQty - prevReturnedQty);
          const reqQty = Math.abs(parseFloat(item.quantity));

          // In-Flight Payload Duplication Check
          const inFlightQty = accumulatedItemReturns[item.originalSaleItemId] || 0;
          const totalClaimedQty = inFlightQty + reqQty;

          // Step e: Validation Enforcement
          if (totalClaimedQty > returnableQty + 0.0001) {
            throw new Error(
              `Cannot return ${reqQty.toFixed(3)} additional units. Combined requested return quantity (${totalClaimedQty.toFixed(3)}) across payload lines for original sale item '${item.originalSaleItemId}' exceeds remaining invoice limit of ${returnableQty.toFixed(3)} (Original Sold: ${originalQty.toFixed(3)}, Previously Returned: ${prevReturnedQty.toFixed(3)}${inFlightQty > 0 ? `, In-Flight Payload: ${inFlightQty.toFixed(3)}` : ""}).`,
            );
          }

          accumulatedItemReturns[item.originalSaleItemId] = totalClaimedQty;

          const unitRate = parseFloat(item.unitPrice || lockedSaleItem.unitPrice);
          const itemTotal = reqQty * unitRate;
          subtotal += itemTotal;

          const returnItemId = uuidv4();
          insertedReturnItems.push({
            id: returnItemId,
            saleReturnId: returnHeaderId,
            originalSaleItemId: item.originalSaleItemId,
            productId: lockedSaleItem.productId,
            stockState: "NORMAL",
            quantity: reqQty.toString(),
            unitPrice: unitRate.toString(),
            discount: "0",
            tax: "0",
            total: itemTotal.toFixed(2),
          });

          // Step g: Ledger & Stock Effect (Sale Return restores stock = +reqQty)
          ledgerRowsToInsert.push({
            id: uuidv4(),
            organizationId: orgId,
            productId: lockedSaleItem.productId,
            warehouseId: parsed.data.warehouseId || null,
            stockState: "NORMAL",
            quantity: reqQty.toString(), // +reqQty restores stock
            transactionType: "SALE_RETURN",
            referenceType: "SALE_RETURN",
            referenceId: returnHeaderId,
            notes:
              parsed.data.notes ||
              `Sale Return #${returnNumber} against Invoice #${parentSale.saleNumber}`,
            createdBy: userId,
          });
        }

        // Step f: Document Creation in CONFIRMED status
        const [header] = await tx
          .insert(saleReturns)
          .values({
            id: returnHeaderId,
            organizationId: orgId,
            customerId: parsed.data.customerId,
            warehouseId: parsed.data.warehouseId || null,
            returnNumber,
            returnDate: new Date(parsed.data.returnDate),
            status: "CONFIRMED",
            subtotal: subtotal.toFixed(2),
            discount: "0",
            tax: "0",
            totalAmount: subtotal.toFixed(2),
            notes: parsed.data.notes || null,
            createdBy: userId,
          })
          .returning();

        await tx.insert(saleReturnItems).values(insertedReturnItems);
        await tx.insert(inventoryTransactions).values(ledgerRowsToInsert);

        return header;
      });

      return c.json(result, 201);
    } catch (err: any) {
      console.error("Failed to create sale return:", err);
      return c.json({ error: err.message }, 400);
    }
  }

  /**
   * Create and confirm a Purchase Return document under the 8-step atomic validation flow.
   */
  static async createPurchaseReturn(c: Context) {
    try {
      const orgId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();

      const userId = user?.id || user?.sub;
      if (!userId) {
        return c.json({ error: "User authentication session missing." }, 401);
      }

      const parsed = createPurchaseReturnSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return c.json(
          { error: `Validation Error: ${issues}`, details: parsed.error.format() },
          400,
        );
      }

      // Execute 8-Step Validation Flow within atomic db.transaction
      const result = await db.transaction(async (tx) => {
        const returnNumber = await generateDocumentNumber(tx, orgId, "PURCHASE_RETURN");
        const returnHeaderId = uuidv4();

        let subtotal = 0;
        const insertedReturnItems: any[] = [];
        const ledgerRowsToInsert: any[] = [];
        const accumulatedItemReturns: Record<string, number> = {};
        const accumulatedStockDeductions: Record<string, number> = {};

        for (const item of parsed.data.items) {
          // Step a: Concurrency Protection — row lock on target originalPurchaseItemId
          const [lockedPurchaseItem] = await tx
            .select({
              id: purchaseItems.id,
              purchaseId: purchaseItems.purchaseId,
              productId: purchaseItems.productId,
              stockState: purchaseItems.stockState,
              quantity: purchaseItems.quantity,
              unitCost: purchaseItems.unitCost,
            })
            .from(purchaseItems)
            .where(eq(purchaseItems.id, item.originalPurchaseItemId))
            .for("update");

          if (!lockedPurchaseItem) {
            throw new Error(
              `Original purchase line item '${item.originalPurchaseItemId}' was not found.`,
            );
          }

          // Step b & c: Status Check & Cross-Tenant Security
          const [parentPurchase] = await tx
            .select({
              id: purchases.id,
              organizationId: purchases.organizationId,
              purchaseNumber: purchases.purchaseNumber,
              status: purchases.status,
              supplierId: purchases.supplierId,
            })
            .from(purchases)
            .where(eq(purchases.id, lockedPurchaseItem.purchaseId));

          if (!parentPurchase) {
            throw new Error(
              `Parent purchase bill for line item '${item.originalPurchaseItemId}' was not found.`,
            );
          }

          if (parentPurchase.organizationId !== orgId) {
            throw new Error(
              `Access Denied: Original purchase bill #${parentPurchase.purchaseNumber} does not belong to your organization.`,
            );
          }

          if (parentPurchase.status !== "CONFIRMED") {
            throw new Error(
              `Invalid Operation: Original purchase bill #${parentPurchase.purchaseNumber} is in '${parentPurchase.status}' status. Returns are only allowed against CONFIRMED bills.`,
            );
          }

          // Step d: Returnable Quantity Calculation (Bill Returnable Limit)
          const [prevReturnAgg] = await tx
            .select({
              totalReturned: sql<string>`COALESCE(SUM(${purchaseReturnItems.quantity}), 0)`,
            })
            .from(purchaseReturnItems)
            .innerJoin(
              purchaseReturns,
              eq(purchaseReturnItems.purchaseReturnId, purchaseReturns.id),
            )
            .where(
              and(
                eq(purchaseReturnItems.originalPurchaseItemId, item.originalPurchaseItemId),
                eq(purchaseReturns.status, "CONFIRMED"),
              ),
            );

          const prevReturnedQty = parseFloat(prevReturnAgg?.totalReturned ?? "0");
          const originalQty = parseFloat(lockedPurchaseItem.quantity);
          const billReturnableQty = Math.max(0, originalQty - prevReturnedQty);
          const reqQty = Math.abs(parseFloat(item.quantity));

          // In-Flight Payload Duplication Check per originalPurchaseItemId
          const inFlightQty = accumulatedItemReturns[item.originalPurchaseItemId] || 0;
          const totalClaimedQty = inFlightQty + reqQty;

          // Step e1: Purchase Bill Limit Validation
          if (totalClaimedQty > billReturnableQty + 0.0001) {
            throw new Error(
              `Cannot return ${reqQty.toFixed(3)} additional units. Combined requested return quantity (${totalClaimedQty.toFixed(3)}) across payload lines for purchase bill #${parentPurchase.purchaseNumber} exceeds remaining bill limit of ${billReturnableQty.toFixed(3)} (Original Purchased: ${originalQty.toFixed(3)}, Previously Returned: ${prevReturnedQty.toFixed(3)}${inFlightQty > 0 ? `, In-Flight Payload: ${inFlightQty.toFixed(3)}` : ""}).`,
            );
          }

          // Step e2: MANDATORY Live Physical Stock Check for Purchase Return (Shop to Supplier)
          const targetStockState = lockedPurchaseItem.stockState || "NORMAL";
          const stockConds: any[] = [
            eq(inventoryTransactions.organizationId, orgId),
            eq(inventoryTransactions.productId, lockedPurchaseItem.productId),
            eq(inventoryTransactions.stockState, targetStockState),
          ];
          if (parsed.data.warehouseId) {
            stockConds.push(eq(inventoryTransactions.warehouseId, parsed.data.warehouseId));
          }

          const [stockAgg] = await tx
            .select({
              currentStock: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
            })
            .from(inventoryTransactions)
            .where(and(...stockConds));

          const livePhysicalStock = Math.max(0, parseFloat(stockAgg?.currentStock ?? "0"));
          const stockKey = `${lockedPurchaseItem.productId}_${targetStockState}_${parsed.data.warehouseId || ""}`;
          const inFlightStockDeduction = accumulatedStockDeductions[stockKey] || 0;
          const effectivePhysicalStock = Math.max(0, livePhysicalStock - inFlightStockDeduction);

          if (reqQty > effectivePhysicalStock + 0.0001) {
            throw new Error(
              `Cannot return ${reqQty.toFixed(3)} units of product. Requested quantity exceeds current available physical stock of ${effectivePhysicalStock.toFixed(3)} units${parsed.data.warehouseId ? " in the selected warehouse" : ""} (Live Physical Stock: ${livePhysicalStock.toFixed(3)}${inFlightStockDeduction > 0 ? `, In-Flight Deductions: ${inFlightStockDeduction.toFixed(3)}` : ""}).`,
            );
          }

          accumulatedItemReturns[item.originalPurchaseItemId] = totalClaimedQty;
          accumulatedStockDeductions[stockKey] = inFlightStockDeduction + reqQty;

          const unitRate = parseFloat(item.unitCost || lockedPurchaseItem.unitCost);
          const itemTotal = reqQty * unitRate;
          subtotal += itemTotal;

          const returnItemId = uuidv4();
          insertedReturnItems.push({
            id: returnItemId,
            purchaseReturnId: returnHeaderId,
            originalPurchaseItemId: item.originalPurchaseItemId,
            productId: lockedPurchaseItem.productId,
            stockState: targetStockState,
            quantity: reqQty.toString(),
            unitCost: unitRate.toString(),
            discount: "0",
            tax: "0",
            total: itemTotal.toFixed(2),
          });

          // Step g: Ledger & Stock Effect (Purchase Return reduces stock = -reqQty)
          ledgerRowsToInsert.push({
            id: uuidv4(),
            organizationId: orgId,
            productId: lockedPurchaseItem.productId,
            warehouseId: parsed.data.warehouseId || null,
            stockState: targetStockState,
            quantity: (-reqQty).toString(), // -reqQty reduces stock
            transactionType: "PURCHASE_RETURN",
            referenceType: "PURCHASE_RETURN",
            referenceId: returnHeaderId,
            notes:
              parsed.data.notes ||
              `Purchase Return #${returnNumber} against Bill #${parentPurchase.purchaseNumber}`,
            createdBy: userId,
          });
        }

        // Step f: Document Creation in CONFIRMED status
        const [header] = await tx
          .insert(purchaseReturns)
          .values({
            id: returnHeaderId,
            organizationId: orgId,
            supplierId: parsed.data.supplierId,
            warehouseId: parsed.data.warehouseId || null,
            returnNumber,
            returnDate: new Date(parsed.data.returnDate),
            status: "CONFIRMED",
            subtotal: subtotal.toFixed(2),
            discount: "0",
            tax: "0",
            totalAmount: subtotal.toFixed(2),
            notes: parsed.data.notes || null,
            createdBy: userId,
          })
          .returning();

        await tx.insert(purchaseReturnItems).values(insertedReturnItems);
        await tx.insert(inventoryTransactions).values(ledgerRowsToInsert);

        return header;
      });

      return c.json(result, 201);
    } catch (err: any) {
      console.error("Failed to create purchase return:", err);
      return c.json({ error: err.message }, 400);
    }
  }

  /**
   * List Sale Return documents.
   */
  static async listSaleReturns(c: Context) {
    const orgId = c.get("organizationId");

    const result = await db.query.saleReturns.findMany({
      where: eq(saleReturns.organizationId, orgId),
      with: {
        customer: { columns: { id: true, name: true } },
        warehouse: { columns: { id: true, name: true } },
        createdByUser: { columns: { id: true, name: true } },
        items: {
          with: {
            product: { columns: { id: true, name: true, unit: true } },
            originalSaleItem: true,
          },
        },
      },
      orderBy: [desc(saleReturns.createdAt)],
    });

    return c.json(result);
  }

  /**
   * List Purchase Return documents.
   */
  static async listPurchaseReturns(c: Context) {
    const orgId = c.get("organizationId");

    const result = await db.query.purchaseReturns.findMany({
      where: eq(purchaseReturns.organizationId, orgId),
      with: {
        supplier: { columns: { id: true, name: true } },
        warehouse: { columns: { id: true, name: true } },
        createdByUser: { columns: { id: true, name: true } },
        items: {
          with: {
            product: { columns: { id: true, name: true, unit: true } },
            originalPurchaseItem: true,
          },
        },
      },
      orderBy: [desc(purchaseReturns.createdAt)],
    });

    return c.json(result);
  }

  /**
   * Get Sale Return by ID.
   */
  static async getSaleReturnById(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Invalid ID" }, 400);

    const result = await db.query.saleReturns.findFirst({
      where: and(eq(saleReturns.id, id), eq(saleReturns.organizationId, orgId)),
      with: {
        customer: true,
        warehouse: true,
        createdByUser: { columns: { id: true, name: true } },
        items: {
          with: {
            product: true,
            originalSaleItem: true,
          },
        },
      },
    });

    if (!result) return c.json({ error: "Not Found" }, 404);
    return c.json(result);
  }

  /**
   * Get Purchase Return by ID.
   */
  static async getPurchaseReturnById(c: Context) {
    const orgId = c.get("organizationId");
    const id = c.req.param("id");
    if (!id) return c.json({ error: "Invalid ID" }, 400);

    const result = await db.query.purchaseReturns.findFirst({
      where: and(eq(purchaseReturns.id, id), eq(purchaseReturns.organizationId, orgId)),
      with: {
        supplier: true,
        warehouse: true,
        createdByUser: { columns: { id: true, name: true } },
        items: {
          with: {
            product: true,
            originalPurchaseItem: true,
          },
        },
      },
    });

    if (!result) return c.json({ error: "Not Found" }, 404);
    return c.json(result);
  }

  /**
   * GET /api/inventory/returns/eligible-items?partyId=...&type=SALE_RETURN|PURCHASE_RETURN
   * Queries confirmed sale items or purchase items with precise returnable limits.
   */
  static async getEligibleReturnItems(c: Context) {
    try {
      const orgId = c.get("organizationId");
      const partyId = c.req.query("partyId");
      const type = c.req.query("type") as "SALE_RETURN" | "PURCHASE_RETURN" | undefined;

      if (!type || (type !== "SALE_RETURN" && type !== "PURCHASE_RETURN")) {
        return c.json(
          { error: "Valid return type required (SALE_RETURN or PURCHASE_RETURN)." },
          400,
        );
      }

      if (type === "SALE_RETURN") {
        const salesList = await db.query.sales.findMany({
          where: (t, { eq, and }) => {
            const conds: any[] = [eq(t.organizationId, orgId), eq(t.status, "CONFIRMED")];
            if (partyId && partyId !== "__none__") {
              conds.push(eq(t.customerId, partyId));
            }
            return and(...conds);
          },
          with: {
            customer: { columns: { id: true, name: true } },
            items: {
              with: {
                product: { columns: { id: true, name: true, unit: true, sellingPrice: true } },
              },
            },
          },
          orderBy: [desc(sales.createdAt)],
        });

        const allSaleItemIds = salesList.flatMap((s) => s.items.map((it) => it.id));

        const prevReturnsMap: Record<string, number> = {};
        if (allSaleItemIds.length > 0) {
          const prevReturns = await db
            .select({
              originalSaleItemId: saleReturnItems.originalSaleItemId,
              totalReturned: sql<string>`COALESCE(SUM(${saleReturnItems.quantity}), 0)`,
            })
            .from(saleReturnItems)
            .innerJoin(saleReturns, eq(saleReturnItems.saleReturnId, saleReturns.id))
            .where(
              and(
                inArray(saleReturnItems.originalSaleItemId, allSaleItemIds),
                eq(saleReturns.status, "CONFIRMED"),
              ),
            )
            .groupBy(saleReturnItems.originalSaleItemId);

          prevReturns.forEach((row) => {
            prevReturnsMap[row.originalSaleItemId] = parseFloat(row.totalReturned || "0");
          });
        }

        const stockRows = await db
          .select({
            productId: inventoryTransactions.productId,
            stockState: inventoryTransactions.stockState,
            currentStock: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
          })
          .from(inventoryTransactions)
          .where(eq(inventoryTransactions.organizationId, orgId))
          .groupBy(inventoryTransactions.productId, inventoryTransactions.stockState);

        const stockMap: Record<string, number> = {};
        stockRows.forEach((row) => {
          const key = `${row.productId}_${row.stockState}`;
          stockMap[key] = parseFloat(row.currentStock || "0");
        });

        const eligibleItems: any[] = [];
        salesList.forEach((sale) => {
          sale.items.forEach((item) => {
            const prevReturned = prevReturnsMap[item.id] || 0;
            const originalQty = parseFloat(item.quantity || "0");
            const billReturnableLimit = Math.max(0, originalQty - prevReturned);
            const stockKey = `${item.productId}_${item.stockState || "NORMAL"}`;
            const currentPhysicalStock = Math.max(0, stockMap[stockKey] ?? 0);
            // SALE RETURN: stock level is not checked for return limit
            const returnableQty = billReturnableLimit;

            eligibleItems.push({
              originalItemId: item.id,
              referenceId: sale.id,
              referenceNumber: sale.saleNumber,
              referenceDate: sale.saleDate,
              partyId: sale.customerId,
              partyName: sale.customer?.name ?? "—",
              productId: item.productId,
              productName: item.product?.name ?? item.productId,
              stockState: item.stockState,
              unitRate: parseFloat(item.unitPrice || "0"),
              originalQuantity: originalQty,
              returnedQuantity: prevReturned,
              billReturnableLimit: billReturnableLimit,
              currentPhysicalStock: currentPhysicalStock,
              returnableQuantity: returnableQty,
            });
          });
        });

        return c.json(eligibleItems);
      } else {
        // PURCHASE_RETURN
        const purchasesList = await db.query.purchases.findMany({
          where: (t, { eq, and }) => {
            const conds: any[] = [eq(t.organizationId, orgId), eq(t.status, "CONFIRMED")];
            if (partyId && partyId !== "__none__") {
              conds.push(eq(t.supplierId, partyId));
            }
            return and(...conds);
          },
          with: {
            supplier: { columns: { id: true, name: true } },
            items: {
              with: {
                product: { columns: { id: true, name: true, unit: true, purchasePrice: true } },
              },
            },
          },
          orderBy: [desc(purchases.createdAt)],
        });

        const allPurchaseItemIds = purchasesList.flatMap((p) => p.items.map((it) => it.id));

        const prevReturnsMap: Record<string, number> = {};
        if (allPurchaseItemIds.length > 0) {
          const prevReturns = await db
            .select({
              originalPurchaseItemId: purchaseReturnItems.originalPurchaseItemId,
              totalReturned: sql<string>`COALESCE(SUM(${purchaseReturnItems.quantity}), 0)`,
            })
            .from(purchaseReturnItems)
            .innerJoin(
              purchaseReturns,
              eq(purchaseReturnItems.purchaseReturnId, purchaseReturns.id),
            )
            .where(
              and(
                inArray(purchaseReturnItems.originalPurchaseItemId, allPurchaseItemIds),
                eq(purchaseReturns.status, "CONFIRMED"),
              ),
            )
            .groupBy(purchaseReturnItems.originalPurchaseItemId);

          prevReturns.forEach((row) => {
            prevReturnsMap[row.originalPurchaseItemId] = parseFloat(row.totalReturned || "0");
          });
        }

        const stockRows = await db
          .select({
            productId: inventoryTransactions.productId,
            stockState: inventoryTransactions.stockState,
            currentStock: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
          })
          .from(inventoryTransactions)
          .where(eq(inventoryTransactions.organizationId, orgId))
          .groupBy(inventoryTransactions.productId, inventoryTransactions.stockState);

        const stockMap: Record<string, number> = {};
        stockRows.forEach((row) => {
          const key = `${row.productId}_${row.stockState}`;
          stockMap[key] = parseFloat(row.currentStock || "0");
        });

        const eligibleItems: any[] = [];
        purchasesList.forEach((purchase) => {
          purchase.items.forEach((item) => {
            const prevReturned = prevReturnsMap[item.id] || 0;
            const originalQty = parseFloat(item.quantity || "0");
            const billReturnableLimit = Math.max(0, originalQty - prevReturned);
            const stockKey = `${item.productId}_${item.stockState || "NORMAL"}`;
            const currentPhysicalStock = Math.max(0, stockMap[stockKey] ?? 0);
            // PURCHASE RETURN: returnable limit is capped by physical stock available!
            const returnableQty = Math.min(billReturnableLimit, currentPhysicalStock);

            eligibleItems.push({
              originalItemId: item.id,
              referenceId: purchase.id,
              referenceNumber: purchase.purchaseNumber,
              referenceDate: purchase.purchaseDate,
              partyId: purchase.supplierId,
              partyName: purchase.supplier?.name ?? "—",
              productId: item.productId,
              productName: item.product?.name ?? item.productId,
              stockState: item.stockState,
              unitRate: parseFloat(item.unitCost || "0"),
              originalQuantity: originalQty,
              returnedQuantity: prevReturned,
              billReturnableLimit: billReturnableLimit,
              currentPhysicalStock: currentPhysicalStock,
              returnableQuantity: returnableQty,
            });
          });
        });

        return c.json(eligibleItems);
      }
    } catch (err: any) {
      console.error("Failed to fetch eligible return items:", err);
      return c.json({ error: `Failed to fetch eligible return items: ${err.message}` }, 400);
    }
  }
}
