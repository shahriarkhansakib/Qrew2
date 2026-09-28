/**
 * inventory.controller.ts
 * Read-only stock query endpoints.
 * Stock is always computed live from inventory_transactions — never cached on products.
 */

import { db, inventoryTransactions } from "@starter/db";
import { and, eq, sql } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

export class InventoryController {
  /**
   * Get current stock for all products in the org (or a specific product via ?productId=).
   * For NORMAL products: one row (NORMAL state).
   * For REFILLABLE products: up to two rows (FULL and EMPTY states).
   */
  static async getStock(c: Context) {
    const orgId = c.get("organizationId");
    const productId = c.req.query("productId");

    // Aggregate stock by product + stockState using the ledger.
    const conditions = productId
      ? sql`organization_id = ${orgId} AND product_id = ${productId}`
      : sql`organization_id = ${orgId}`;

    const stockRows = await db.execute(
      sql`SELECT
            product_id,
            stock_state,
            COALESCE(SUM(quantity), 0) as current_stock
          FROM inventory_transactions
          WHERE ${conditions}
          GROUP BY product_id, stock_state
          ORDER BY product_id, stock_state`,
    );

    const rows = Array.isArray(stockRows) ? stockRows : ((stockRows as any).rows ?? []);
    return c.json(rows);
  }

  /**
   * Paginated transaction history — the full audit ledger.
   * Supports filters: ?productId= &warehouseId= &transactionType= &page= &limit=
   */
  static async getTransactions(c: Context) {
    const orgId = c.get("organizationId");
    const productId = c.req.query("productId");
    const warehouseId = c.req.query("warehouseId");
    const transactionType = c.req.query("transactionType");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, parseInt(c.req.query("limit") ?? "50", 10));
    const offset = (page - 1) * limit;

    const result = await db.query.inventoryTransactions.findMany({
      where: (t, { eq, and }) => {
        const conds: any[] = [eq(t.organizationId, orgId)];
        if (productId) conds.push(eq(t.productId, productId));
        if (warehouseId) conds.push(eq(t.warehouseId, warehouseId));
        if (transactionType) conds.push(eq(t.transactionType, transactionType as any));
        return and(...conds);
      },
      with: {
        product: {
          columns: { id: true, name: true, unit: true, purchasePrice: true, sellingPrice: true },
        },
        warehouse: { columns: { id: true, name: true } },
        createdByUser: { columns: { id: true, name: true } },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
      offset,
    });

    const candidateRefIds = Array.from(
      new Set(
        result
          .map((t) => t.referenceId)
          .filter((id): id is string =>
            Boolean(id && typeof id === "string" && id.trim().length > 0),
          ),
      ),
    );

    const purchasesMap: Record<string, any> = {};
    const salesMap: Record<string, any> = {};
    const saleReturnsMap: Record<string, any> = {};
    const purchaseReturnsMap: Record<string, any> = {};
    let clientsMap: Record<string, string> = {};
    let customersMap: Record<string, string> = {};

    if (candidateRefIds.length > 0) {
      const [pList, sList, srList, prList] = await Promise.all([
        db.query.purchases.findMany({
          where: (t, { inArray, eq, or, and }) =>
            and(
              eq(t.organizationId, orgId),
              or(inArray(t.id, candidateRefIds), inArray(t.purchaseNumber, candidateRefIds)),
            ),
          with: {
            supplier: { columns: { id: true, name: true } },
            items: true,
          },
        }),
        db.query.sales.findMany({
          where: (t, { inArray, eq, or, and }) =>
            and(
              eq(t.organizationId, orgId),
              or(inArray(t.id, candidateRefIds), inArray(t.saleNumber, candidateRefIds)),
            ),
          with: {
            customer: { columns: { id: true, name: true } },
            items: true,
          },
        }),
        db.query.saleReturns.findMany({
          where: (t, { inArray, eq, or, and }) =>
            and(
              eq(t.organizationId, orgId),
              or(inArray(t.id, candidateRefIds), inArray(t.returnNumber, candidateRefIds)),
            ),
          with: {
            customer: { columns: { id: true, name: true } },
            items: true,
          },
        }),
        db.query.purchaseReturns.findMany({
          where: (t, { inArray, eq, or, and }) =>
            and(
              eq(t.organizationId, orgId),
              or(inArray(t.id, candidateRefIds), inArray(t.returnNumber, candidateRefIds)),
            ),
          with: {
            supplier: { columns: { id: true, name: true } },
            items: true,
          },
        }),
      ]);

      const missingSupplierIds = [
        ...pList.map((p) => p.supplierId),
        ...prList.map((pr) => pr.supplierId),
      ].filter((id): id is string => Boolean(id));

      const missingCustomerIds = [
        ...sList.map((s) => s.customerId),
        ...srList.map((sr) => sr.customerId),
      ].filter((id): id is string => Boolean(id));

      const allSupplierIds = Array.from(new Set([...missingSupplierIds, ...candidateRefIds]));
      const allCustomerIds = Array.from(new Set([...missingCustomerIds, ...candidateRefIds]));

      const [clientsList, customersList] = await Promise.all([
        allSupplierIds.length > 0
          ? db.query.clients.findMany({
              where: (t, { inArray }) => inArray(t.id, allSupplierIds),
              columns: { id: true, name: true },
            })
          : Promise.resolve([]),
        allCustomerIds.length > 0
          ? db.query.customers.findMany({
              where: (t, { inArray }) => inArray(t.id, allCustomerIds),
              columns: { id: true, name: true },
            })
          : Promise.resolve([]),
      ]);

      // NOTE FOR TEAMMATE & AGENT:
      // Defensive fallback `(clientsList || [])` and `(customersList || [])` prevents uncaught TypeErrors
      // when mocked in unit tests or if db queries return undefined.
      clientsMap = Object.fromEntries((clientsList || []).map((c) => [c.id, c.name]));
      customersMap = Object.fromEntries((customersList || []).map((c) => [c.id, c.name]));

      pList.forEach((p) => {
        const partyName = p.supplier?.name ?? (p.supplierId ? clientsMap[p.supplierId] : null);
        const pEnriched = { ...p, partyName };
        if (p.id) purchasesMap[p.id] = pEnriched;
        if (p.purchaseNumber) purchasesMap[p.purchaseNumber] = pEnriched;
      });

      sList.forEach((s) => {
        const partyName = s.customer?.name ?? (s.customerId ? customersMap[s.customerId] : null);
        const sEnriched = { ...s, partyName };
        if (s.id) salesMap[s.id] = sEnriched;
        if (s.saleNumber) salesMap[s.saleNumber] = sEnriched;
      });

      srList.forEach((sr) => {
        const partyName = sr.customer?.name ?? (sr.customerId ? customersMap[sr.customerId] : null);
        const srEnriched = { ...sr, partyName };
        if (sr.id) saleReturnsMap[sr.id] = srEnriched;
        if (sr.returnNumber) saleReturnsMap[sr.returnNumber] = srEnriched;
      });

      prList.forEach((pr) => {
        const partyName = pr.supplier?.name ?? (pr.supplierId ? clientsMap[pr.supplierId] : null);
        const prEnriched = { ...pr, partyName };
        if (pr.id) purchaseReturnsMap[pr.id] = prEnriched;
        if (pr.returnNumber) purchaseReturnsMap[pr.returnNumber] = prEnriched;
      });
    }

    const enriched = result.map((tx: any) => {
      let partyName: string | null = null;
      let unitRate: string | null = null;
      let totalPrice: string | null = null;
      let referenceNumber: string | null = null;

      const refId = tx.referenceId;
      const txType = tx.transactionType;

      // 1. Check if referenceId matches a Purchase record
      if (refId && purchasesMap[refId]) {
        const p = purchasesMap[refId];
        partyName = p.partyName ?? p.supplier?.name ?? null;
        referenceNumber = p.purchaseNumber;
        const matchingItem = p.items?.find((it: any) => it.productId === tx.productId);
        if (matchingItem && matchingItem.unitCost != null) {
          unitRate = String(matchingItem.unitCost);
        } else if (tx.product?.purchasePrice != null) {
          unitRate = String(tx.product.purchasePrice);
        }

        if (matchingItem && matchingItem.total != null) {
          totalPrice = String(matchingItem.total);
        } else if (unitRate != null && tx.quantity != null) {
          totalPrice = Math.abs(parseFloat(unitRate) * parseFloat(tx.quantity)).toFixed(2);
        } else if (p.totalAmount != null) {
          totalPrice = String(p.totalAmount);
        }
      }
      // 2. Check if referenceId matches a Sale record
      else if (refId && salesMap[refId]) {
        const s = salesMap[refId];
        partyName = s.partyName ?? s.customer?.name ?? null;
        referenceNumber = s.saleNumber;
        const matchingItem = s.items?.find((it: any) => it.productId === tx.productId);
        if (matchingItem && matchingItem.unitPrice != null) {
          unitRate = String(matchingItem.unitPrice);
        } else if (tx.product?.sellingPrice != null) {
          unitRate = String(tx.product.sellingPrice);
        }

        if (matchingItem && matchingItem.total != null) {
          totalPrice = String(matchingItem.total);
        } else if (unitRate != null && tx.quantity != null) {
          totalPrice = Math.abs(parseFloat(unitRate) * parseFloat(tx.quantity)).toFixed(2);
        } else if (s.totalAmount != null) {
          totalPrice = String(s.totalAmount);
        }
      }
      // 3. Check if referenceId matches a Sale Return record
      else if (refId && saleReturnsMap[refId]) {
        const sr = saleReturnsMap[refId];
        partyName = sr.partyName ?? sr.customer?.name ?? null;
        referenceNumber = sr.returnNumber;
        const matchingItem = sr.items?.find((it: any) => it.productId === tx.productId);
        if (matchingItem && matchingItem.unitPrice != null) {
          unitRate = String(matchingItem.unitPrice);
        } else if (tx.product?.sellingPrice != null) {
          unitRate = String(tx.product.sellingPrice);
        }

        if (matchingItem && matchingItem.total != null) {
          totalPrice = String(matchingItem.total);
        } else if (unitRate != null && tx.quantity != null) {
          totalPrice = Math.abs(parseFloat(unitRate) * parseFloat(tx.quantity)).toFixed(2);
        } else if (sr.totalAmount != null) {
          totalPrice = String(sr.totalAmount);
        }
      }
      // 4. Check if referenceId matches a Purchase Return record
      else if (refId && purchaseReturnsMap[refId]) {
        const pr = purchaseReturnsMap[refId];
        partyName = pr.partyName ?? pr.supplier?.name ?? null;
        referenceNumber = pr.returnNumber;
        const matchingItem = pr.items?.find((it: any) => it.productId === tx.productId);
        if (matchingItem && matchingItem.unitCost != null) {
          unitRate = String(matchingItem.unitCost);
        } else if (matchingItem && matchingItem.unitPrice != null) {
          unitRate = String(matchingItem.unitPrice);
        } else if (tx.product?.purchasePrice != null) {
          unitRate = String(tx.product.purchasePrice);
        }

        if (matchingItem && matchingItem.total != null) {
          totalPrice = String(matchingItem.total);
        } else if (unitRate != null && tx.quantity != null) {
          totalPrice = Math.abs(parseFloat(unitRate) * parseFloat(tx.quantity)).toFixed(2);
        } else if (pr.totalAmount != null) {
          totalPrice = String(pr.totalAmount);
        }
      }
      // 5. Direct lookup by supplier/customer ID or note parsing
      else {
        if (refId) {
          if (clientsMap[refId]) partyName = clientsMap[refId];
          else if (customersMap[refId]) partyName = customersMap[refId];
        }

        if (!partyName && tx.notes) {
          const matchTo = tx.notes.match(/(?:to|from)\s+([A-Za-z0-9\s._-]+)/i);
          if (matchTo?.[1]) partyName = matchTo[1].trim();
        }

        if (txType === "PURCHASE" || txType === "PURCHASE_RETURN") {
          unitRate = tx.product?.purchasePrice ? String(tx.product.purchasePrice) : null;
        } else if (txType === "SALE" || txType === "SALE_RETURN") {
          unitRate = tx.product?.sellingPrice ? String(tx.product.sellingPrice) : null;
        } else {
          unitRate = tx.product?.purchasePrice
            ? String(tx.product.purchasePrice)
            : tx.product?.sellingPrice
              ? String(tx.product.sellingPrice)
              : null;
        }

        if (unitRate != null && tx.quantity != null) {
          totalPrice = Math.abs(parseFloat(unitRate) * parseFloat(tx.quantity)).toFixed(2);
        }
      }

      return {
        ...tx,
        partyName,
        unitRate,
        totalPrice,
        referenceNumber: referenceNumber || tx.referenceNumber || null,
      };
    });

    return c.json({ data: enriched, page, limit });
  }

  /**
   * GET /api/inventory/eligible-returns?partyId=...&type=SALE_RETURN|PURCHASE_RETURN
   * Fetches line items from confirmed sales or purchases for a specific customer or supplier,
   * calculating original qty, previously returned qty, and remaining returnable qty.
   */
  static async getEligibleReturns(c: Context) {
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
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });

        const saleIds = salesList.map((s) => s.id);
        const saleNumbers = salesList.map((s) => s.saleNumber).filter(Boolean);
        const refIds = Array.from(new Set([...saleIds, ...saleNumbers]));

        const existingReturnsMap: Record<string, number> = {};
        if (refIds.length > 0) {
          const prevReturns = await db.query.inventoryTransactions.findMany({
            where: (t, { eq, and, inArray }) =>
              and(
                eq(t.organizationId, orgId),
                eq(t.referenceType, "SALE"),
                eq(t.transactionType, "SALE_RETURN"),
                inArray(t.referenceId, refIds),
              ),
          });

          prevReturns.forEach((tx) => {
            const key = `${tx.referenceId}_${tx.productId}_${tx.stockState}`;
            const prev = existingReturnsMap[key] || 0;
            existingReturnsMap[key] = prev + Math.abs(parseFloat(tx.quantity || "0"));
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
            const keyByUuid = `${sale.id}_${item.productId}_${item.stockState}`;
            const keyByNum = `${sale.saleNumber}_${item.productId}_${item.stockState}`;
            const prevReturned =
              (existingReturnsMap[keyByUuid] || 0) + (existingReturnsMap[keyByNum] || 0);

            const originalQty = parseFloat(item.quantity || "0");
            const unitPrice = parseFloat(item.unitPrice || "0");
            const billReturnableLimit = Math.max(0, originalQty - prevReturned);
            const stockKey = `${item.productId}_${item.stockState || "NORMAL"}`;
            const currentPhysicalStock = Math.max(0, stockMap[stockKey] ?? 0);
            const returnableQty = billReturnableLimit;

            eligibleItems.push({
              referenceId: sale.id,
              referenceNumber: sale.saleNumber,
              referenceDate: sale.saleDate,
              partyId: sale.customerId,
              partyName: sale.customer?.name ?? "—",
              productId: item.productId,
              productName: item.product?.name ?? item.productId,
              stockState: item.stockState,
              unitRate: unitPrice,
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
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });

        const purchaseIds = purchasesList.map((p) => p.id);
        const purchaseNumbers = purchasesList.map((p) => p.purchaseNumber).filter(Boolean);
        const refIds = Array.from(new Set([...purchaseIds, ...purchaseNumbers]));

        const existingReturnsMap: Record<string, number> = {};
        if (refIds.length > 0) {
          const prevReturns = await db.query.inventoryTransactions.findMany({
            where: (t, { eq, and, inArray }) =>
              and(
                eq(t.organizationId, orgId),
                eq(t.referenceType, "PURCHASE"),
                eq(t.transactionType, "PURCHASE_RETURN"),
                inArray(t.referenceId, refIds),
              ),
          });

          prevReturns.forEach((tx) => {
            const key = `${tx.referenceId}_${tx.productId}_${tx.stockState}`;
            const prev = existingReturnsMap[key] || 0;
            existingReturnsMap[key] = prev + Math.abs(parseFloat(tx.quantity || "0"));
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
            const keyByUuid = `${purchase.id}_${item.productId}_${item.stockState}`;
            const keyByNum = `${purchase.purchaseNumber}_${item.productId}_${item.stockState}`;
            const prevReturned =
              (existingReturnsMap[keyByUuid] || 0) + (existingReturnsMap[keyByNum] || 0);

            const originalQty = parseFloat(item.quantity || "0");
            const unitCost = parseFloat(item.unitCost || "0");
            const billReturnableLimit = Math.max(0, originalQty - prevReturned);
            const stockKey = `${item.productId}_${item.stockState || "NORMAL"}`;
            const currentPhysicalStock = Math.max(0, stockMap[stockKey] ?? 0);
            const returnableQty = Math.min(billReturnableLimit, currentPhysicalStock);

            eligibleItems.push({
              referenceId: purchase.id,
              referenceNumber: purchase.purchaseNumber,
              referenceDate: purchase.purchaseDate,
              partyId: purchase.supplierId,
              partyName: purchase.supplier?.name ?? "—",
              productId: item.productId,
              productName: item.product?.name ?? item.productId,
              stockState: item.stockState,
              unitRate: unitCost,
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
      console.error("Failed to fetch eligible returns:", err);
      return c.json({ error: `Failed to fetch eligible returns: ${err.message}` }, 400);
    }
  }

  /**
   * Record direct ledger transaction(s) (returns, manual adjustments, multi-item returns).
   */
  static async createTransaction(c: Context) {
    try {
      const orgId = c.get("organizationId");
      const user = c.get("user") as any;
      const body = await c.req.json();

      const emptyToNull = z.preprocess(
        (val) => (val === "" || val === "__none__" || val === undefined ? null : val),
        z.string().nullable().optional(),
      );

      const singleTxSchema = z
        .object({
          productId: z.string().min(1, "Product required"),
          warehouseId: emptyToNull,
          stockState: z.preprocess(
            (val) => (!val || val === "" ? "NORMAL" : String(val).toUpperCase()),
            z.enum(["NORMAL", "FULL", "EMPTY"]),
          ),
          quantity: z
            .union([z.string(), z.number()])
            .transform((val) => String(val))
            .refine(
              (val) => !Number.isNaN(parseFloat(val)) && parseFloat(val) !== 0,
              "Valid quantity required",
            ),
          transactionType: z.preprocess(
            (val) => (!val || val === "" ? "" : String(val).toUpperCase()),
            z.enum([
              "PURCHASE",
              "PURCHASE_RETURN",
              "SALE",
              "SALE_RETURN",
              "REFILL_IN",
              "ADJUSTMENT_IN",
              "ADJUSTMENT_OUT",
            ]),
          ),
          referenceType: z.preprocess(
            (val) => (!val || val === "" ? "MANUAL_ADJUSTMENT" : String(val).toUpperCase()),
            z.enum(["PURCHASE", "SALE", "MANUAL_ADJUSTMENT", "TRANSFER"]),
          ),
          referenceId: emptyToNull,
          notes: emptyToNull,
        })
        .passthrough();

      const multiTxSchema = z.object({
        items: z.array(singleTxSchema).min(1, "At least one item required"),
      });

      const userId = user?.id || user?.sub;
      if (!userId) {
        return c.json({ error: "User authentication session missing." }, 401);
      }

      let itemsToValidate: any[] = [];
      let parsedMultiData: any = null;
      let parsedSingleData: any = null;

      if (body && Array.isArray(body.items)) {
        const parsedMulti = multiTxSchema.safeParse(body);
        if (!parsedMulti.success) {
          console.error(
            "Multi transaction validation failed:",
            JSON.stringify(parsedMulti.error.format()),
          );
          const issues = parsedMulti.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          return c.json(
            { error: `Validation Error: ${issues}`, details: parsedMulti.error.format() },
            400,
          );
        }
        parsedMultiData = parsedMulti.data;
        itemsToValidate = parsedMultiData.items;
      } else {
        const parsed = singleTxSchema.safeParse(body);
        if (!parsed.success) {
          console.error(
            "Single transaction validation failed:",
            JSON.stringify(parsed.error.format()),
          );
          const issues = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          return c.json(
            { error: `Validation Error: ${issues}`, details: parsed.error.format() },
            400,
          );
        }
        parsedSingleData = parsed.data;
        itemsToValidate = [parsedSingleData];
      }

      // Over-Return Protection & Invoice Linking Validation
      const accumulatedTxItemReturns: Record<string, number> = {};
      const accumulatedTxStockDeductions: Record<string, number> = {};

      for (const item of itemsToValidate) {
        const isReturn =
          item.transactionType === "SALE_RETURN" || item.transactionType === "PURCHASE_RETURN";
        if (isReturn) {
          if (!item.referenceId?.trim()) {
            return c.json(
              {
                error: `Validation Error: Every return item MUST be linked to an original sale invoice or purchase bill (referenceId required).`,
              },
              400,
            );
          }

          const refId = item.referenceId.trim();
          const reqQty = Math.abs(parseFloat(item.quantity));

          if (item.transactionType === "SALE_RETURN") {
            const sale = await db.query.sales.findFirst({
              where: (t, { eq, and, or }) =>
                and(
                  eq(t.organizationId, orgId),
                  or(eq(t.id, refId), eq(t.saleNumber, refId)),
                  eq(t.status, "CONFIRMED"),
                ),
              with: { items: { with: { product: true } } },
            });

            if (!sale) {
              return c.json(
                {
                  error: `Validation Error: Original sale invoice '${refId}' was not found or is not confirmed.`,
                },
                400,
              );
            }

            const matchingItem = sale.items.find(
              (it: any) => it.productId === item.productId && it.stockState === item.stockState,
            );
            if (!matchingItem) {
              return c.json(
                {
                  error: `Validation Error: Selected product is not present in Sale Invoice #${sale.saleNumber}.`,
                },
                400,
              );
            }

            const refIdsToQuery = Array.from(new Set([sale.id, sale.saleNumber].filter(Boolean)));
            const prevTxRows = await db.query.inventoryTransactions.findMany({
              where: (t, { eq, and, inArray }) =>
                and(
                  eq(t.organizationId, orgId),
                  eq(t.referenceType, "SALE"),
                  eq(t.transactionType, "SALE_RETURN"),
                  eq(t.productId, item.productId),
                  eq(t.stockState, item.stockState),
                  inArray(t.referenceId, refIdsToQuery),
                ),
            });

            const prevReturnedQty = prevTxRows.reduce(
              (sum, txRow) => sum + Math.abs(parseFloat(txRow.quantity || "0")),
              0,
            );
            const originalQty = parseFloat(matchingItem.quantity || "0");
            const returnableQty = Math.max(0, originalQty - prevReturnedQty);

            const itemKey = `${sale.id}_${matchingItem.id}`;
            const inFlightQty = accumulatedTxItemReturns[itemKey] || 0;
            const totalClaimedQty = inFlightQty + reqQty;

            if (totalClaimedQty > returnableQty + 0.0001) {
              const pName = matchingItem.product?.name ?? item.productId;
              return c.json(
                {
                  error: `Cannot return ${reqQty.toFixed(3)} additional units of ${pName} for Invoice #${sale.saleNumber}. Combined return quantity (${totalClaimedQty.toFixed(3)}) exceeds remaining invoice limit of ${returnableQty.toFixed(3)} (Original Sold: ${originalQty.toFixed(3)}, Previously Returned: ${prevReturnedQty.toFixed(3)}).`,
                },
                400,
              );
            }

            accumulatedTxItemReturns[itemKey] = totalClaimedQty;
          } else {
            // PURCHASE_RETURN
            const purchase = await db.query.purchases.findFirst({
              where: (t, { eq, and, or }) =>
                and(
                  eq(t.organizationId, orgId),
                  or(eq(t.id, refId), eq(t.purchaseNumber, refId)),
                  eq(t.status, "CONFIRMED"),
                ),
              with: { items: { with: { product: true } } },
            });

            if (!purchase) {
              return c.json(
                {
                  error: `Validation Error: Original purchase bill '${refId}' was not found or is not confirmed.`,
                },
                400,
              );
            }

            const matchingItem = purchase.items.find(
              (it: any) => it.productId === item.productId && it.stockState === item.stockState,
            );
            if (!matchingItem) {
              return c.json(
                {
                  error: `Validation Error: Selected product is not present in Purchase Bill #${purchase.purchaseNumber}.`,
                },
                400,
              );
            }

            const refIdsToQuery = Array.from(
              new Set([purchase.id, purchase.purchaseNumber].filter(Boolean)),
            );
            const prevTxRows = await db.query.inventoryTransactions.findMany({
              where: (t, { eq, and, inArray }) =>
                and(
                  eq(t.organizationId, orgId),
                  eq(t.referenceType, "PURCHASE"),
                  eq(t.transactionType, "PURCHASE_RETURN"),
                  eq(t.productId, item.productId),
                  eq(t.stockState, item.stockState),
                  inArray(t.referenceId, refIdsToQuery),
                ),
            });

            const prevReturnedQty = prevTxRows.reduce(
              (sum, txRow) => sum + Math.abs(parseFloat(txRow.quantity || "0")),
              0,
            );
            const originalQty = parseFloat(matchingItem.quantity || "0");
            const billReturnableQty = Math.max(0, originalQty - prevReturnedQty);
            const pName = matchingItem.product?.name ?? item.productId;

            const itemKey = `${purchase.id}_${matchingItem.id}`;
            const inFlightQty = accumulatedTxItemReturns[itemKey] || 0;
            const totalClaimedQty = inFlightQty + reqQty;

            if (totalClaimedQty > billReturnableQty + 0.0001) {
              return c.json(
                {
                  error: `Cannot return ${reqQty.toFixed(3)} additional units of ${pName} for Purchase Bill #${purchase.purchaseNumber}. Combined return quantity (${totalClaimedQty.toFixed(3)}) exceeds remaining bill limit of ${billReturnableQty.toFixed(3)} (Original Purchased: ${originalQty.toFixed(3)}, Previously Returned: ${prevReturnedQty.toFixed(3)}).`,
                },
                400,
              );
            }

            // Enforce live physical stock check for Purchase Return
            const targetStockState = item.stockState || "NORMAL";
            const stockConds: any[] = [
              eq(inventoryTransactions.organizationId, orgId),
              eq(inventoryTransactions.productId, item.productId),
              eq(inventoryTransactions.stockState, targetStockState),
            ];
            if (item.warehouseId) {
              stockConds.push(eq(inventoryTransactions.warehouseId, item.warehouseId));
            }

            const [stockAgg] = await db
              .select({
                currentStock: sql<string>`COALESCE(SUM(${inventoryTransactions.quantity}), 0)`,
              })
              .from(inventoryTransactions)
              .where(and(...stockConds));

            const livePhysicalStock = Math.max(0, parseFloat(stockAgg?.currentStock ?? "0"));
            const stockKey = `${item.productId}_${targetStockState}_${item.warehouseId || ""}`;
            const inFlightDeduction = accumulatedTxStockDeductions[stockKey] || 0;
            const effectivePhysicalStock = Math.max(0, livePhysicalStock - inFlightDeduction);

            if (reqQty > effectivePhysicalStock + 0.0001) {
              return c.json(
                {
                  error: `Cannot return ${reqQty.toFixed(3)} units of ${pName}. Requested quantity exceeds available physical stock of ${effectivePhysicalStock.toFixed(3)} units${item.warehouseId ? " in the selected warehouse" : ""}.`,
                },
                400,
              );
            }

            accumulatedTxItemReturns[itemKey] = totalClaimedQty;
            accumulatedTxStockDeductions[stockKey] = inFlightDeduction + reqQty;
          }
        }
      }

      if (parsedMultiData) {
        const defaultRefId = uuidv4();
        const rowsToInsert = parsedMultiData.items.map((item: any) => {
          const refId = item.referenceId?.trim() ? item.referenceId.trim() : defaultRefId;
          const rawQty = Math.abs(parseFloat(item.quantity));
          let finalQty = item.quantity;

          if (item.transactionType === "SALE_RETURN") {
            finalQty = rawQty.toString(); // Restores stock (+)
          } else if (item.transactionType === "PURCHASE_RETURN") {
            finalQty = (-rawQty).toString(); // Reduces stock (-)
          }

          return {
            id: uuidv4(),
            organizationId: orgId,
            productId: item.productId,
            warehouseId: item.warehouseId,
            stockState: item.stockState as any,
            quantity: finalQty,
            transactionType: item.transactionType as any,
            referenceType: item.referenceType as any,
            referenceId: refId,
            notes: item.notes,
            createdBy: userId,
          };
        });

        const inserted = await db.insert(inventoryTransactions).values(rowsToInsert).returning();
        return c.json({ success: true, count: inserted.length, data: inserted }, 201);
      }

      const refId = parsedSingleData.referenceId?.trim()
        ? parsedSingleData.referenceId.trim()
        : uuidv4();
      const rawQty = Math.abs(parseFloat(parsedSingleData.quantity));
      let finalQty = parsedSingleData.quantity;

      if (parsedSingleData.transactionType === "SALE_RETURN") {
        finalQty = rawQty.toString();
      } else if (parsedSingleData.transactionType === "PURCHASE_RETURN") {
        finalQty = (-rawQty).toString();
      }

      const [tx] = await db
        .insert(inventoryTransactions)
        .values({
          id: uuidv4(),
          organizationId: orgId,
          productId: parsedSingleData.productId,
          warehouseId: parsedSingleData.warehouseId,
          stockState: parsedSingleData.stockState as any,
          quantity: finalQty,
          transactionType: parsedSingleData.transactionType as any,
          referenceType: parsedSingleData.referenceType as any,
          referenceId: refId,
          notes: parsedSingleData.notes,
          createdBy: userId,
        })
        .returning();

      return c.json(tx, 201);
    } catch (err: any) {
      console.error("Failed to create transaction:", err);
      return c.json({ error: `Transaction Failed: ${err.message}` }, 400);
    }
  }
}
